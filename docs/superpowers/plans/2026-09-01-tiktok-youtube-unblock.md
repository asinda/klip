# Déblocage TikTok/YouTube (Phase 1 du plan de rattrapage) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two structural blockers to selling TikTok/YouTube auto-publish: the unnecessary "1 Google Cloud project per channel" architecture (replaced by a shared-project quota counter), and the TikTok composer's missing audit-required UX (creator display, user-driven privacy selection, opt-in interaction toggles, branded-content disclosure, duration enforcement, explicit confirmation).

**Architecture:** A new `lib/youtube/quota.ts` module tracks daily YouTube API unit usage per organization in a Postgres table, checked before `/api/schedule` accepts a new YouTube job. A new `lib/tiktok/creator-info.ts` module wraps TikTok's `creator_info/query` endpoint so the composer can show real, creator-specific constraints (available privacy levels, disabled interactions, max duration) instead of hardcoded values. `ScheduleDialog.tsx` gains TikTok-only fields wired through `/api/schedule` and persisted on `publish_jobs`, then read back by the publish worker.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Vitest (`vi.stubGlobal('fetch', ...)` for API wrapper tests — no real network calls).

**Spec:** `docs/superpowers/specs/2026-09-01-competitive-catchup-roadmap-design.md` (section "Phase 1 — Déblocage TikTok/YouTube (détaillé)")

## Global Constraints

- Multi-tenant: every query touching `youtube_quota_usage`, `social_accounts`, `videos`, or `publish_jobs` must filter by `org_id` (directly or via `!inner` join), matching the existing pattern in this repo.
- No real TikTok/Google credentials exist in this environment — nothing in this plan is verified end-to-end against the live APIs. Verification is `npx tsc --noEmit`, `npm test` (Vitest, mocked `fetch` only), and `npm run build`.
- TikTok's unaudited-app restriction (`SELF_ONLY` forced server-side by TikTok) is unchanged by this plan — this plan only makes the app's own UI ask the user for a real, non-hardcoded choice, so the composer is ready for the audit whenever it's submitted.
- One audit requirement needs no new task: "publish status must be tracked/surfaced to the user" is already satisfied by the existing `/dashboard/analytics` page (status breakdown, success rate, per-job error messages — built in a prior sprint). `ScheduleJobCard.tsx` only ever renders `status: 'pending'` jobs by construction (the schedule page filters `.eq('status', 'pending')`), so adding a status badge there would be a no-op — deliberately not a task in this plan.
- Follow existing conventions exactly: `ApiResponse<T>` shape for every route, `getCurrentUserRow(supabase, select)` for the current user (never raw `supabase.auth.getUser()` in dashboard-facing routes), ownership checks via `.eq('org_id', orgId)` before any mutation.

---

### Task 1: Schema — YouTube quota table + TikTok composer columns

**Files:**
- Create: `supabase/migrations/002_youtube_quota_and_tiktok_composer.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `youtube_quota_usage(org_id, date, units_used)` table + `increment_youtube_quota_usage(p_org_id uuid, p_date date, p_units integer)` RPC function, consumed by Task 2. `publish_jobs` gains `tiktok_privacy_level`, `tiktok_disable_duet`, `tiktok_disable_stitch`, `tiktok_disable_comment`, `tiktok_branded_content`, consumed by Task 6 and Task 7. `PublishJob` TS interface gains the same fields.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/002_youtube_quota_and_tiktok_composer.sql

-- YouTube Data API quota is pooled per Google Cloud project, not per channel.
-- Instead of provisioning one GCP project per connected YouTube channel (the
-- old CLAUDE.md assumption, which costs a repeated OAuth-verification cycle
-- per client for no technical reason), this tracks usage per org against a
-- single shared project's daily quota and rejects new jobs that would exceed it.
create table youtube_quota_usage (
  org_id uuid not null references organizations(id) on delete cascade,
  date date not null,
  units_used integer not null default 0,
  primary key (org_id, date)
);

alter table youtube_quota_usage enable row level security;

create policy "org_members_see_youtube_quota" on youtube_quota_usage
  for all using (
    org_id in (select org_id from users where id = auth.uid())
  );

create or replace function increment_youtube_quota_usage(p_org_id uuid, p_date date, p_units integer)
returns void as $$
begin
  insert into youtube_quota_usage (org_id, date, units_used)
  values (p_org_id, p_date, p_units)
  on conflict (org_id, date)
  do update set units_used = youtube_quota_usage.units_used + excluded.units_used;
end;
$$ language plpgsql;

-- TikTok Content Posting API audit requires these to be real, user-driven
-- choices per post (not app-hardcoded) — see lib/tiktok/creator-info.ts and
-- the ScheduleDialog composer. Interactions default to disabled (opt-in),
-- matching the audit's "toggles must not be pre-checked" requirement.
alter table publish_jobs
  add column tiktok_privacy_level text,
  add column tiktok_disable_duet boolean not null default true,
  add column tiktok_disable_stitch boolean not null default true,
  add column tiktok_disable_comment boolean not null default true,
  add column tiktok_branded_content boolean not null default false;
```

- [ ] **Step 2: Add the matching TypeScript types**

In `lib/types.ts`, extend `PublishJob` and add a new interface:

```ts
export interface PublishJob {
  id: string
  video_id: string
  account_id: string
  scheduled_at: string
  published_at: string | null
  status: JobStatus
  error_message: string | null
  platform_post_id: string | null
  retry_count: number
  created_at: string
  tiktok_privacy_level: string | null
  tiktok_disable_duet: boolean
  tiktok_disable_stitch: boolean
  tiktok_disable_comment: boolean
  tiktok_branded_content: boolean
  // joined
  video?: Video
  account?: SocialAccount
}

export interface YouTubeQuotaUsage {
  org_id: string
  date: string
  units_used: number
}
```

- [ ] **Step 3: Verify the file compiles as valid TypeScript in context**

Run: `npx tsc --noEmit`
Expected: no new errors (the migration is SQL, not compiled; this only checks the `lib/types.ts` edit).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_youtube_quota_and_tiktok_composer.sql lib/types.ts
git commit -m "feat(db): add youtube_quota_usage table and tiktok composer columns on publish_jobs"
```

---

### Task 2: `lib/youtube/quota.ts` — daily quota tracking

**Files:**
- Create: `lib/youtube/quota.ts`
- Test: `lib/youtube/quota.test.ts`

**Interfaces:**
- Consumes: `youtube_quota_usage` table and `increment_youtube_quota_usage` RPC from Task 1.
- Produces: `YOUTUBE_DAILY_UNIT_QUOTA`, `YOUTUBE_UPLOAD_UNIT_COST`, `todayUtcDateKey(referenceDate?: Date): string`, `wouldExceedYouTubeQuota(unitsUsedToday: number, unitsNeeded: number): boolean` — all consumed by Task 6. `getYouTubeQuotaUsage(supabase, orgId, date): Promise<number>` and `incrementYouTubeQuotaUsage(supabase, orgId, unitsUsed, date?): Promise<void>` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests for the pure functions**

```ts
// lib/youtube/quota.test.ts
import { describe, it, expect } from 'vitest'
import { todayUtcDateKey, wouldExceedYouTubeQuota, YOUTUBE_DAILY_UNIT_QUOTA, YOUTUBE_UPLOAD_UNIT_COST } from './quota'

describe('todayUtcDateKey', () => {
  it('formats a date as YYYY-MM-DD in UTC', () => {
    expect(todayUtcDateKey(new Date('2026-09-01T23:59:00Z'))).toBe('2026-09-01')
  })

  it('does not roll over based on local time zone offsets', () => {
    expect(todayUtcDateKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05')
  })
})

describe('wouldExceedYouTubeQuota', () => {
  it('returns false when usage plus the new request stays within the daily cap', () => {
    expect(wouldExceedYouTubeQuota(0, YOUTUBE_UPLOAD_UNIT_COST)).toBe(false)
  })

  it('returns true when usage plus the new request would exceed the daily cap', () => {
    expect(wouldExceedYouTubeQuota(YOUTUBE_DAILY_UNIT_QUOTA - 100, YOUTUBE_UPLOAD_UNIT_COST)).toBe(true)
  })

  it('returns false when the request lands exactly on the cap', () => {
    expect(wouldExceedYouTubeQuota(YOUTUBE_DAILY_UNIT_QUOTA - YOUTUBE_UPLOAD_UNIT_COST, YOUTUBE_UPLOAD_UNIT_COST)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/youtube/quota.test.ts`
Expected: FAIL — `./quota` module does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/youtube/quota.ts
import type { SupabaseClient } from '@supabase/supabase-js'

// YouTube Data API v3 pools quota per Google Cloud project (not per channel).
// One project shared across all orgs, tracked per-org here so no single
// client can starve another's quota — see docs/superpowers/specs/2026-09-01-competitive-catchup-roadmap-design.md
export const YOUTUBE_DAILY_UNIT_QUOTA = 10_000
export const YOUTUBE_UPLOAD_UNIT_COST = 1_600

export function todayUtcDateKey(referenceDate: Date = new Date()): string {
  return referenceDate.toISOString().slice(0, 10)
}

export function wouldExceedYouTubeQuota(unitsUsedToday: number, unitsNeeded: number): boolean {
  return unitsUsedToday + unitsNeeded > YOUTUBE_DAILY_UNIT_QUOTA
}

export async function getYouTubeQuotaUsage(
  supabase: SupabaseClient,
  orgId: string,
  date: string = todayUtcDateKey()
): Promise<number> {
  const { data } = await supabase
    .from('youtube_quota_usage')
    .select('units_used')
    .eq('org_id', orgId)
    .eq('date', date)
    .single()
  return data?.units_used ?? 0
}

export async function incrementYouTubeQuotaUsage(
  supabase: SupabaseClient,
  orgId: string,
  unitsUsed: number,
  date: string = todayUtcDateKey()
): Promise<void> {
  const { error } = await supabase.rpc('increment_youtube_quota_usage', {
    p_org_id: orgId,
    p_date: date,
    p_units: unitsUsed,
  })
  if (error) throw new Error(`Failed to increment YouTube quota usage: ${error.message}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/youtube/quota.test.ts`
Expected: PASS (7 tests). `getYouTubeQuotaUsage`/`incrementYouTubeQuotaUsage` are not unit tested — they only wrap a Supabase call with no branching logic of their own, consistent with how this repo tests DB-touching code (verified via `tsc`/`build`, not Vitest — see `lib/schedule.ts` vs. its route callers for the established split).

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/youtube/quota.ts lib/youtube/quota.test.ts
git commit -m "feat(youtube): add per-org daily quota tracking for the shared GCP project"
```

---

### Task 3: `lib/tiktok/creator-info.ts` — creator constraints wrapper

**Files:**
- Create: `lib/tiktok/creator-info.ts`
- Test: `lib/tiktok/creator-info.test.ts`

**Interfaces:**
- Produces: `TIKTOK_PRIVACY_LEVELS: readonly string[]`, `TikTokCreatorInfo` interface, `getTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo>` — consumed by Task 4 (API route) and Task 6 (server-side validation of `privacy_level`).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tiktok/creator-info.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTikTokCreatorInfo } from './creator-info'

describe('getTikTokCreatorInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps the TikTok response to a camelCase creator info object', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          creator_avatar_url: 'https://p.tiktok.com/avatar.jpg',
          creator_username: 'klip_demo',
          creator_nickname: 'Klip Demo',
          privacy_level_options: ['SELF_ONLY'],
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: true,
          max_video_post_duration_sec: 300,
        },
        error: { code: 'ok' },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const info = await getTikTokCreatorInfo('token-abc')

    expect(info).toEqual({
      creatorAvatarUrl: 'https://p.tiktok.com/avatar.jpg',
      creatorUsername: 'klip_demo',
      creatorNickname: 'Klip Demo',
      privacyLevelOptions: ['SELF_ONLY'],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: true,
      maxVideoPostDurationSec: 300,
    })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
  })

  it('throws with the TikTok error message when the API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'access_token_invalid', message: 'access token invalid' } }),
      })
    )

    await expect(getTikTokCreatorInfo('bad-token')).rejects.toThrow('access token invalid')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tiktok/creator-info.test.ts`
Expected: FAIL — `./creator-info` module does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/tiktok/creator-info.ts
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

// The full set TikTok can return in privacy_level_options; used only to
// sanity-check values coming back from the client, never as a default.
export const TIKTOK_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const

export interface TikTokCreatorInfo {
  creatorAvatarUrl: string
  creatorUsername: string
  creatorNickname: string
  privacyLevelOptions: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number
}

export async function getTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetch(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })

  const json = await res.json()

  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? `TikTok creator info fetch failed with status ${res.status}`)
  }

  return {
    creatorAvatarUrl: json.data.creator_avatar_url,
    creatorUsername: json.data.creator_username,
    creatorNickname: json.data.creator_nickname,
    privacyLevelOptions: json.data.privacy_level_options,
    commentDisabled: json.data.comment_disabled,
    duetDisabled: json.data.duet_disabled,
    stitchDisabled: json.data.stitch_disabled,
    maxVideoPostDurationSec: json.data.max_video_post_duration_sec,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tiktok/creator-info.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/tiktok/creator-info.ts lib/tiktok/creator-info.test.ts
git commit -m "feat(tiktok): add creator_info wrapper for audit-required composer constraints"
```

---

### Task 4: `app/api/tiktok/creator-info/route.ts` — server-side proxy

**Files:**
- Create: `app/api/tiktok/creator-info/route.ts`

**Interfaces:**
- Consumes: `getTikTokCreatorInfo` from Task 3, `getCurrentUserRow` from `lib/supabase/dev-org.ts` (existing).
- Produces: `GET /api/tiktok/creator-info?account_id=<uuid>` → `ApiResponse<TikTokCreatorInfo>`, consumed by Task 8 (ScheduleDialog).

- [ ] **Step 1: Write the route**

```ts
// app/api/tiktok/creator-info/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { getTikTokCreatorInfo, type TikTokCreatorInfo } from '@/lib/tiktok/creator-info'
import type { ApiResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  if (!orgId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'account_id manquant' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('access_token, platform')
    .eq('id', accountId)
    .eq('org_id', orgId)
    .single()

  if (!account || account.platform !== 'tiktok') {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte TikTok introuvable' }, { status: 404 })
  }

  try {
    const creatorInfo = await getTikTokCreatorInfo(account.access_token)
    return NextResponse.json<ApiResponse<TikTokCreatorInfo>>({ data: creatorInfo, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[GET /api/tiktok/creator-info] failed:', message)
    return NextResponse.json<ApiResponse<null>>({ data: null, error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit test: this route has no branching logic of its own beyond ownership checks already covered by the pattern in every other route in `app/api/`, none of which have tests in this repo — verified via `tsc` + `npm run build` instead.)

- [ ] **Step 3: Commit**

```bash
git add app/api/tiktok/creator-info/route.ts
git commit -m "feat(api): add server-side proxy for TikTok creator_info"
```

---

### Task 5: `lib/tiktok/publish.ts` — replace hardcoded privacy level with real options

**Files:**
- Modify: `lib/tiktok/publish.ts`
- Modify: `lib/tiktok/publish.test.ts`

**Interfaces:**
- Produces: `TikTokPostOptions` interface, `uploadVideoToTikTok(accessToken, videoUrl, caption, options: TikTokPostOptions)` — new 4th parameter, consumed by Task 7 (worker).

- [ ] **Step 1: Update the existing tests for the new signature**

Replace the full contents of `lib/tiktok/publish.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadVideoToTikTok, getTikTokPublishStatus } from './publish'

const OPTIONS = { privacyLevel: 'SELF_ONLY', disableDuet: true, disableStitch: true, disableComment: true }

describe('uploadVideoToTikTok', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends PULL_FROM_URL source info and the given post options, returns the publish id on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_123' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await uploadVideoToTikTok('token-abc', 'https://r2.example/video.mp4', 'My caption', OPTIONS)

    expect(result).toEqual({ publishId: 'pub_123' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
    const body = JSON.parse(init.body)
    expect(body.source_info).toEqual({ source: 'PULL_FROM_URL', video_url: 'https://r2.example/video.mp4' })
    expect(body.post_info.title).toBe('My caption')
    expect(body.post_info.privacy_level).toBe('SELF_ONLY')
    expect(body.post_info.disable_duet).toBe(true)
    expect(body.post_info.disable_stitch).toBe(true)
    expect(body.post_info.disable_comment).toBe(true)
  })

  it('passes through a caller-chosen non-default option (e.g. duet allowed)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_456' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await uploadVideoToTikTok('token', 'https://r2.example/v.mp4', 'caption', { ...OPTIONS, disableDuet: false })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.post_info.disable_duet).toBe(false)
  })

  it('throws with the TikTok error message when the API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'invalid_param', message: 'video_url is required' } }),
      })
    )

    await expect(uploadVideoToTikTok('token', '', 'caption', OPTIONS)).rejects.toThrow('video_url is required')
  })
})

describe('getTikTokPublishStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the status string on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } }),
      })
    )

    const status = await getTikTokPublishStatus('token', 'pub_123')
    expect(status).toBe('PUBLISH_COMPLETE')
  })

  it('throws with the TikTok error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'not_found', message: 'publish_id not found' } }),
      })
    )

    await expect(getTikTokPublishStatus('token', 'missing')).rejects.toThrow('publish_id not found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tiktok/publish.test.ts`
Expected: FAIL — `uploadVideoToTikTok` does not yet accept a 4th argument, so `disable_duet`/`disable_stitch`/`disable_comment` assertions fail (they're hardcoded `false` today, and there's no `options` parameter).

- [ ] **Step 3: Update the implementation**

Replace `lib/tiktok/publish.ts` in full with:

```ts
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

export interface TikTokPublishResult {
  publishId: string
}

export type TikTokPublishStatus = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED'

export interface TikTokPostOptions {
  privacyLevel: string
  disableDuet: boolean
  disableStitch: boolean
  disableComment: boolean
}

export async function uploadVideoToTikTok(
  accessToken: string,
  videoUrl: string,
  caption: string,
  options: TikTokPostOptions
): Promise<TikTokPublishResult> {
  const res = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: options.privacyLevel,
        disable_duet: options.disableDuet,
        disable_comment: options.disableComment,
        disable_stitch: options.disableStitch,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    }),
  })

  const json = await res.json()

  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? `TikTok publish init failed with status ${res.status}`)
  }

  return { publishId: json.data.publish_id }
}

export async function getTikTokPublishStatus(accessToken: string, publishId: string): Promise<TikTokPublishStatus> {
  const res = await fetch(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publish_id: publishId }),
  })

  const json = await res.json()

  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? `TikTok status fetch failed with status ${res.status}`)
  }

  return json.data.status
}
```

Note what was removed: the module-level `TIKTOK_POST_PRIVACY_LEVEL = 'SELF_ONLY'` constant and the hardcoded `disable_duet/comment/stitch: false` in the request body. TikTok will still force `SELF_ONLY` server-side while the app is unaudited (unchanged platform behavior) — but that now happens because the user picked it from `creatorInfo.privacyLevelOptions` (Task 8), which will only ever contain `SELF_ONLY` for an unaudited app, not because Klip's own code silently overrides the choice.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tiktok/publish.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `services/publisher/worker.ts` (still calling the old 3-argument signature) — this is expected and resolved by Task 7. Confirm no *other* file has an error.

- [ ] **Step 6: Commit**

```bash
git add lib/tiktok/publish.ts lib/tiktok/publish.test.ts
git commit -m "refactor(tiktok): accept real post options instead of a hardcoded privacy level"
```

---

### Task 6: `app/api/schedule/route.ts` — YouTube quota gate + TikTok field validation

**Files:**
- Modify: `app/api/schedule/route.ts`

**Interfaces:**
- Consumes: `wouldExceedYouTubeQuota`, `getYouTubeQuotaUsage` from Task 2; `TIKTOK_PRIVACY_LEVELS` from Task 3.
- Produces: `POST /api/schedule` now accepts optional `privacy_level`, `disable_duet`, `disable_stitch`, `disable_comment`, `is_branded_content` in the body (required when the target account is TikTok), and rejects YouTube jobs that would exceed the org's daily quota. Consumed by Task 8 (ScheduleDialog).

- [ ] **Step 1: Replace `app/api/schedule/route.ts` in full**

```ts
// app/api/schedule/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { enqueuePublishJob } from '@/lib/queue/publish-queue'
import { getYouTubeQuotaUsage, wouldExceedYouTubeQuota, YOUTUBE_UPLOAD_UNIT_COST } from '@/lib/youtube/quota'
import { TIKTOK_PRIVACY_LEVELS } from '@/lib/tiktok/creator-info'
import type { ApiResponse, PublishJob } from '@/lib/types'

interface CreateScheduleBody {
  video_id: string
  account_id: string
  scheduled_at: string
  privacy_level?: string
  disable_duet?: boolean
  disable_stitch?: boolean
  disable_comment?: boolean
  is_branded_content?: boolean
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  if (!orgId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const body: CreateScheduleBody = await request.json()

  if (!body.video_id || !body.account_id || !body.scheduled_at) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Données manquantes' }, { status: 400 })
  }

  const scheduledDate = new Date(body.scheduled_at)
  if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now()) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Date invalide ou dans le passé' }, { status: 400 })
  }

  const { data: video } = await supabase
    .from('videos')
    .select('id')
    .eq('id', body.video_id)
    .eq('org_id', orgId)
    .single()

  if (!video) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Vidéo introuvable' }, { status: 404 })
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, platform')
    .eq('id', body.account_id)
    .eq('org_id', orgId)
    .single()

  if (!account) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte introuvable' }, { status: 404 })
  }

  const insertPayload: Record<string, unknown> = {
    video_id: body.video_id,
    account_id: body.account_id,
    scheduled_at: scheduledDate.toISOString(),
    status: 'pending',
  }

  if (account.platform === 'tiktok') {
    if (!body.privacy_level || !TIKTOK_PRIVACY_LEVELS.includes(body.privacy_level as (typeof TIKTOK_PRIVACY_LEVELS)[number])) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Confidentialité TikTok invalide ou manquante' },
        { status: 400 }
      )
    }
    insertPayload.tiktok_privacy_level = body.privacy_level
    insertPayload.tiktok_disable_duet = body.disable_duet ?? true
    insertPayload.tiktok_disable_stitch = body.disable_stitch ?? true
    insertPayload.tiktok_disable_comment = body.disable_comment ?? true
    insertPayload.tiktok_branded_content = body.is_branded_content ?? false
  }

  if (account.platform === 'youtube') {
    const unitsUsedToday = await getYouTubeQuotaUsage(supabase, orgId)
    if (wouldExceedYouTubeQuota(unitsUsedToday, YOUTUBE_UPLOAD_UNIT_COST)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: "Quota YouTube quotidien atteint pour aujourd'hui — réessaie demain" },
        { status: 429 }
      )
    }
  }

  const { data: job, error } = await supabase.from('publish_jobs').insert(insertPayload).select().single()

  if (error) {
    console.error('[POST /api/schedule] insert failed:', error)
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Erreur lors de la planification' }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('videos')
    .update({ status: 'scheduled' })
    .eq('id', body.video_id)

  if (updateError) {
    console.error('[POST /api/schedule] video status update failed:', updateError)
  }

  try {
    await enqueuePublishJob(job.id, job.scheduled_at)
  } catch (queueError) {
    console.error(`[POST /api/schedule] enqueue failed for job ${job.id} (row still created):`, queueError)
  }

  return NextResponse.json<ApiResponse<PublishJob>>({ data: job, error: null })
}
```

Note: the YouTube quota *increment* happens later, in the worker (Task 7) once the upload actually succeeds — checking here only guards against accepting a job that's already known to be hopeless. This mirrors the existing pattern where `videos.status` is optimistically set to `'scheduled'` and corrected later by the worker on failure.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/schedule/route.ts
git commit -m "feat(api): gate YouTube scheduling on daily quota, validate TikTok composer fields"
```

---

### Task 7: `services/publisher/worker.ts` — pass stored TikTok options through

**Files:**
- Modify: `services/publisher/worker.ts`

**Interfaces:**
- Consumes: `TikTokPostOptions` shape from Task 5, `tiktok_privacy_level`/`tiktok_disable_*` columns from Task 1 (already included via the existing `select('*', ...)`).

- [ ] **Step 1: Update the `uploadVideoToTikTok` call site**

In `services/publisher/worker.ts`, change:

```ts
const { publishId } = await uploadVideoToTikTok(accessToken, publishJob.video.r2_url, publishJob.video.title)
```

to:

```ts
const { publishId } = await uploadVideoToTikTok(accessToken, publishJob.video.r2_url, publishJob.video.title, {
  privacyLevel: publishJob.tiktok_privacy_level,
  disableDuet: publishJob.tiktok_disable_duet,
  disableStitch: publishJob.tiktok_disable_stitch,
  disableComment: publishJob.tiktok_disable_comment,
})
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this resolves the error flagged as expected at the end of Task 5).

- [ ] **Step 3: Verify the Next.js build still succeeds**

Run: `npm run build`
Expected: succeeds (the worker script isn't imported by the Next.js app, so this only confirms the rest of the app still compiles after all the route/type changes in this plan).

- [ ] **Step 4: Commit**

```bash
git add services/publisher/worker.ts
git commit -m "fix(worker): pass the publish job's stored TikTok post options to uploadVideoToTikTok"
```

---

### Task 8: `components/dashboard/ScheduleDialog.tsx` — audit-ready TikTok composer

**Files:**
- Modify: `components/dashboard/ScheduleDialog.tsx`

**Interfaces:**
- Consumes: `GET /api/tiktok/creator-info` from Task 4, extended `POST /api/schedule` body from Task 6.

- [ ] **Step 1: Replace `components/dashboard/ScheduleDialog.tsx` in full**

```tsx
// components/dashboard/ScheduleDialog.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { ApiResponse, PublishJob, Video, SocialAccount } from '@/lib/types'
import type { TikTokCreatorInfo } from '@/lib/tiktok/creator-info'

interface Props {
  videos: Video[]
  accounts: SocialAccount[]
}

export default function ScheduleDialog({ videos, accounts }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [videoId, setVideoId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null)
  const [loadingCreatorInfo, setLoadingCreatorInfo] = useState(false)
  const [privacyLevel, setPrivacyLevel] = useState('')
  const [allowDuet, setAllowDuet] = useState(false)
  const [allowStitch, setAllowStitch] = useState(false)
  const [allowComments, setAllowComments] = useState(false)
  const [brandedContent, setBrandedContent] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedVideo = videos.find((v) => v.id === videoId)
  const isTikTok = selectedAccount?.platform === 'tiktok'

  useEffect(() => {
    setCreatorInfo(null)
    setPrivacyLevel('')
    setAllowDuet(false)
    setAllowStitch(false)
    setAllowComments(false)
    setBrandedContent(false)
    setConfirmed(false)

    if (!selectedAccount || selectedAccount.platform !== 'tiktok') return

    setLoadingCreatorInfo(true)
    fetch(`/api/tiktok/creator-info?account_id=${selectedAccount.id}`)
      .then((res) => res.json())
      .then((json: ApiResponse<TikTokCreatorInfo>) => {
        if (json.error) {
          toast.error(json.error)
          return
        }
        setCreatorInfo(json.data)
      })
      .finally(() => setLoadingCreatorInfo(false))
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const durationTooLong =
    isTikTok &&
    creatorInfo &&
    selectedVideo?.duration != null &&
    selectedVideo.duration > creatorInfo.maxVideoPostDurationSec

  const canSubmit =
    videoId &&
    accountId &&
    scheduledAt &&
    !durationTooLong &&
    (!isTikTok || (creatorInfo && privacyLevel && confirmed))

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error('Remplis tous les champs requis')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        account_id: accountId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        ...(isTikTok
          ? {
              privacy_level: privacyLevel,
              disable_duet: !allowDuet,
              disable_stitch: !allowStitch,
              disable_comment: !allowComments,
              is_branded_content: brandedContent,
            }
          : {}),
      }),
    })
    const json: ApiResponse<PublishJob> = await res.json()
    setSubmitting(false)
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Vidéo planifiée')
    setOpen(false)
    setVideoId('')
    setAccountId('')
    setScheduledAt('')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus size={16} />
          Planifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planifier une publication</DialogTitle>
          <DialogDescription>Choisis une vidéo, un compte et une date.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une vidéo" />
            </SelectTrigger>
            <SelectContent>
              {videos.map((video) => (
                <SelectItem key={video.id} value={video.id}>
                  {video.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un compte" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  @{account.username} ({account.platform})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />

          {isTikTok && loadingCreatorInfo && (
            <p className="text-xs text-muted-foreground">Chargement des réglages TikTok...</p>
          )}

          {isTikTok && creatorInfo && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                {creatorInfo.creatorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creatorInfo.creatorAvatarUrl} alt={creatorInfo.creatorNickname} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm text-foreground">
                    {creatorInfo.creatorNickname[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-foreground">
                  Publication en tant que <strong>{creatorInfo.creatorNickname}</strong> (@{creatorInfo.creatorUsername})
                </span>
              </div>

              <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir la confidentialité (requis)" />
                </SelectTrigger>
                <SelectContent>
                  {creatorInfo.privacyLevelOptions.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!creatorInfo.duetDisabled && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={allowDuet} onChange={(e) => setAllowDuet(e.target.checked)} />
                  Autoriser les duos
                </label>
              )}
              {!creatorInfo.stitchDisabled && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={allowStitch} onChange={(e) => setAllowStitch(e.target.checked)} />
                  Autoriser les stitchs
                </label>
              )}
              {!creatorInfo.commentDisabled && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} />
                  Autoriser les commentaires
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={brandedContent} onChange={(e) => setBrandedContent(e.target.checked)} />
                Contenu de marque (Branded Content)
              </label>

              {durationTooLong && (
                <p className="text-xs text-destructive">
                  Cette vidéo dépasse la durée maximale autorisée par TikTok pour ce compte
                  ({creatorInfo.maxVideoPostDurationSec}s).
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                Je confirme les réglages de publication ci-dessus
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
            {submitting ? 'Planification...' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the Next.js build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual smoke check (per the `run` skill — drive the actual UI, don't just typecheck)**

Start the dev server (`npm run dev`), open `/dashboard/schedule`, open the "Planifier" dialog, select a TikTok account. Confirm: the "Planifier" button stays disabled until a privacy level is chosen AND the confirmation checkbox is checked; selecting a YouTube account shows none of the TikTok-only fields and the button enables with just video/account/date filled in.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/ScheduleDialog.tsx
git commit -m "feat(ui): add audit-ready TikTok composer fields to the schedule dialog"
```

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove the now-incorrect YouTube rule and add the new one**

In the "🚨 Règles Importantes" section, replace:

```
2. **Un projet Google Cloud par chaîne YouTube** (quota API)
```

with:

```
2. **Un seul projet Google Cloud partagé pour YouTube** — le quota (10 000 units/jour) est mutualisé par projet, pas par chaîne ; l'isolation entre orgs se fait via `lib/youtube/quota.ts` (compteur par org_id dans `youtube_quota_usage`), pas via un projet GCP par client
```

- [ ] **Step 2: Note the TikTok composer is now audit-ready**

In the "📍 État Actuel" section, add a line after the existing TikTok audit-timeline note:

```
- Composer TikTok mis à jour pour respecter les exigences UX de l'audit "Direct Post" (affichage créateur, choix de confidentialité sans défaut, toggles d'interaction opt-in, disclosure Branded Content, durée max appliquée, confirmation explicite) — voir `components/dashboard/ScheduleDialog.tsx`. Reste à faire avant soumission : enregistrer la vidéo de démo du flow complet et soumettre l'audit (étapes manuelles, hors code).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for the shared YouTube GCP project and TikTok composer audit-readiness"
```
