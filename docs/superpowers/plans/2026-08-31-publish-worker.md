# Publish Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A BullMQ queue + standalone worker process (`npm run worker`, already wired in `package.json`) that picks up scheduled `publish_jobs` at their `scheduled_at` time and publishes the video to TikTok via the Content Posting API v2, updating job/video status on success or failure.

**Architecture:** `lib/queue/connection.ts` owns a lazily-created `ioredis` connection (fail-fast if `REDIS_URL` is missing, mirroring the existing R2 fail-fast pattern in `lib/storage/r2.ts`). `lib/queue/publish-queue.ts` defines the BullMQ `Queue` and an `enqueuePublishJob` helper that computes a delay from `scheduled_at`. `POST /api/schedule` (built in the Schedule page plan) is modified to call `enqueuePublishJob` right after inserting the DB row. `lib/tiktok/publish.ts` wraps the two TikTok Content Posting API v2 calls this needs (init via `PULL_FROM_URL`, poll status). `services/publisher/worker.ts` is the actual BullMQ `Worker` process, using the existing `createServiceClient()` (service-role, bypasses RLS — appropriate since it runs outside any user's request context) and the existing `refreshTikTokToken` from `lib/tiktok/oauth.ts`.

**Tech Stack:** BullMQ (`^5.7.0`, already installed), `ioredis` (new dependency), `dotenv` (new dependency, for loading `.env.local` in the standalone worker script), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-publish-worker-design.md`

## Global Constraints

- **This plan cannot be verified end-to-end locally.** No real Redis connection and no real TikTok Developer App credentials are available (`REDIS_URL`, `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET` are all placeholders). Every task's verification is limited to `npx tsc --noEmit` + `npm run build` (the worker script must not break the Next.js build even though it's not imported by any page) + Vitest on the pure/mockable logic. Do not attempt to actually run `npm run worker` against a real queue — there is nothing real to connect to.
- BullMQ requires its `ioredis` connection created with `maxRetriesPerRequest: null` — a well-known BullMQ requirement, not optional.
- The worker script (`services/publisher/worker.ts`) runs standalone via `tsx`, outside Next.js — it must use **relative imports** (`../../lib/...`), not the `@/...` path alias, since nothing guarantees `tsx` resolves that alias outside of Next.js's own build pipeline. Every other file in this plan (the Next.js API route) keeps using `@/...`, matching the rest of the codebase.
- No silent try/catch in the worker's DB updates — every failure path logs via `console.error` and writes `status: 'failed'` + `error_message` to the job row, never swallowed.
- Scope: TikTok only. YouTube publishing is explicitly Phase 2 in `CLAUDE.md` — the worker skips (logs and returns) any job whose account platform isn't `'tiktok'`.
- No React component tests apply here (no components in this plan). Pure, DOM-free, network-mockable logic (`computeDelayMs`, the TikTok request/response handling in `lib/tiktok/publish.ts`) gets Vitest coverage with `vi.stubGlobal('fetch', ...)` — this project has no prior precedent for mocking `fetch` in a test, but it's the standard Vitest pattern and necessary here since there is no real TikTok endpoint to hit.

---

### Task 1: New dependencies and `REDIS_URL` env var

**Files:**
- Modify: `package.json` (add `ioredis`, `dotenv`)
- Modify: `.env.local.example` (document `REDIS_URL`)
- Modify: `.env.local` (add a placeholder `REDIS_URL`, consistent with every other credential in this file)

**Interfaces:** None — pure setup, consumed by every later task in this plan.

- [ ] **Step 1: Install the dependencies**

Run: `npm install ioredis dotenv` (from the repo root)

- [ ] **Step 2: Document the new env var**

In `.env.local.example`, add under the "Upstash Redis" section:

```env
# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxx
# BullMQ needs a real Redis TCP connection (ioredis), not the REST API above.
# Get this from Upstash's "Redis" connection details, not its REST API tab.
REDIS_URL=rediss://default:xxxx@xxxx.upstash.io:6379
```

- [ ] **Step 3: Add the same placeholder to `.env.local`**

In `.env.local`, add the same `REDIS_URL=rediss://default:xxxx@xxxx.upstash.io:6379` line under its own "Upstash Redis" section, matching the placeholder style already used for every other credential in that file.

- [ ] **Step 4: Verify the build still succeeds**

Run: `npm run build`
Expected: succeeds (no code references these new packages yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: add ioredis and dotenv dependencies, document REDIS_URL"
```

Note: `.env.local` is gitignored and won't be part of this commit — that's expected, only step 3 needs to happen locally.

---

### Task 2: Redis connection (`lib/queue/connection.ts`)

**Files:**
- Create: `lib/queue/connection.ts`

**Interfaces:**
- Produces (consumed by Tasks 3 and 6): `getRedisConnection(): IORedis` — throws a clear `Error('REDIS_URL is not configured')` if the env var is missing, otherwise returns a lazily-created, memoized `ioredis` connection configured for BullMQ (`maxRetriesPerRequest: null`).

- [ ] **Step 1: Implement the connection module**

```ts
// lib/queue/connection.ts
import IORedis from 'ioredis'

let connection: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (connection) return connection

  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error('REDIS_URL is not configured')
  }

  connection = new IORedis(url, { maxRetriesPerRequest: null })
  return connection
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed — not imported anywhere yet.

- [ ] **Step 3: Commit**

```bash
git add lib/queue/connection.ts
git commit -m "feat: add fail-fast Redis connection for BullMQ"
```

---

### Task 3: Publish queue (`lib/queue/publish-queue.ts`)

**Files:**
- Create: `lib/queue/publish-queue.ts`
- Test: `lib/queue/publish-queue.test.ts`

**Interfaces:**
- Consumes: `getRedisConnection` from `./connection` (Task 2).
- Produces (consumed by Task 4's route and Task 6's worker): `PUBLISH_QUEUE_NAME` (the string `'publish-jobs'`), `getPublishQueue(): Queue`, `computeDelayMs(scheduledAt: string | Date): number` (pure — never negative), `enqueuePublishJob(publishJobId: string, scheduledAt: string): Promise<void>`.

- [ ] **Step 1: Write the failing test for the pure helper**

```ts
// lib/queue/publish-queue.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeDelayMs } from './publish-queue'

describe('computeDelayMs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a positive delay for a future date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
    expect(computeDelayMs('2026-09-01T10:00:05.000Z')).toBe(5000)
  })

  it('returns 0 for a date in the past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
    expect(computeDelayMs('2026-09-01T09:59:00.000Z')).toBe(0)
  })

  it('returns 0 for the exact current instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
    expect(computeDelayMs('2026-09-01T10:00:00.000Z')).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/queue/publish-queue.test.ts`
Expected: FAIL with "Cannot find module './publish-queue'"

- [ ] **Step 3: Implement `lib/queue/publish-queue.ts`**

```ts
// lib/queue/publish-queue.ts
import { Queue } from 'bullmq'
import { getRedisConnection } from './connection'

export const PUBLISH_QUEUE_NAME = 'publish-jobs'

let queue: Queue | null = null

export function getPublishQueue(): Queue {
  if (queue) return queue
  queue = new Queue(PUBLISH_QUEUE_NAME, { connection: getRedisConnection() })
  return queue
}

export function computeDelayMs(scheduledAt: string | Date): number {
  const target = new Date(scheduledAt).getTime()
  const delay = target - Date.now()
  return delay > 0 ? delay : 0
}

export async function enqueuePublishJob(publishJobId: string, scheduledAt: string): Promise<void> {
  const publishQueue = getPublishQueue()
  await publishQueue.add('publish', { publishJobId }, { delay: computeDelayMs(scheduledAt) })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/queue/publish-queue.test.ts`
Expected: PASS — 3 tests passing

- [ ] **Step 5: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add lib/queue/publish-queue.ts lib/queue/publish-queue.test.ts
git commit -m "feat: add BullMQ publish queue and delay calculation"
```

---

### Task 4: Wire scheduling into the queue

**Files:**
- Modify: `app/api/schedule/route.ts` (created by the Schedule page plan — read its current content first)

**Interfaces:**
- Consumes: `enqueuePublishJob` from `lib/queue/publish-queue.ts` (Task 3).

- [ ] **Step 1: Add the enqueue call**

In `app/api/schedule/route.ts`, import `enqueuePublishJob` from `@/lib/queue/publish-queue`, and after the existing `videos.update({ status: 'scheduled' })` call (and its `updateError` logging), add:

```ts
  try {
    await enqueuePublishJob(job.id, job.scheduled_at)
  } catch (queueError) {
    console.error('[POST /api/schedule] enqueue failed (job row still created):', queueError)
  }
```

This is intentionally isolated in its own try/catch: `REDIS_URL` is a placeholder in this environment, so this call is expected to throw locally. The `publish_jobs` row itself — the part that IS verifiable — must still be created and returned to the client even when the queue is unreachable. Do not let this call affect the response already being built; it runs after `job`/`error` are resolved and before the final `return NextResponse.json(...)`.

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 3: Manual verification**

There is no live Redis to verify the enqueue itself succeeds. Confirm instead, by reading the code, that a thrown error from `enqueuePublishJob` cannot prevent the route's success response — the `try/catch` must wrap only the enqueue call, not the preceding DB insert/update or the final response construction.

- [ ] **Step 4: Commit**

```bash
git add app/api/schedule/route.ts
git commit -m "feat: enqueue a BullMQ publish job when a schedule is created"
```

---

### Task 5: TikTok publish API wrapper (`lib/tiktok/publish.ts`)

**Files:**
- Create: `lib/tiktok/publish.ts`
- Test: `lib/tiktok/publish.test.ts`

**Interfaces:**
- Produces (consumed by Task 6): `uploadVideoToTikTok(accessToken: string, videoUrl: string, caption: string): Promise<{ publishId: string }>`, `getTikTokPublishStatus(accessToken: string, publishId: string): Promise<TikTokPublishStatus>` where `TikTokPublishStatus = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED'`.

- [ ] **Step 1: Write the failing tests with a mocked `fetch`**

```ts
// lib/tiktok/publish.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadVideoToTikTok, getTikTokPublishStatus } from './publish'

describe('uploadVideoToTikTok', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends PULL_FROM_URL source info and returns the publish id on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_123' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await uploadVideoToTikTok('token-abc', 'https://r2.example/video.mp4', 'My caption')

    expect(result).toEqual({ publishId: 'pub_123' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
    const body = JSON.parse(init.body)
    expect(body.source_info).toEqual({ source: 'PULL_FROM_URL', video_url: 'https://r2.example/video.mp4' })
    expect(body.post_info.title).toBe('My caption')
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

    await expect(uploadVideoToTikTok('token', '', 'caption')).rejects.toThrow('video_url is required')
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/tiktok/publish.test.ts`
Expected: FAIL with "Cannot find module './publish'"

- [ ] **Step 3: Implement `lib/tiktok/publish.ts`**

```ts
// lib/tiktok/publish.ts
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

export interface TikTokPublishResult {
  publishId: string
}

export type TikTokPublishStatus = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED'

export async function uploadVideoToTikTok(
  accessToken: string,
  videoUrl: string,
  caption: string
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
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/tiktok/publish.test.ts`
Expected: PASS — 4 tests passing

- [ ] **Step 5: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add lib/tiktok/publish.ts lib/tiktok/publish.test.ts
git commit -m "feat: add TikTok Content Posting API publish wrapper"
```

---

### Task 6: Publish worker (`services/publisher/worker.ts`)

**Files:**
- Create: `services/publisher/worker.ts`

**Interfaces:**
- Consumes: `getRedisConnection` from `lib/queue/connection.ts` (Task 2), `PUBLISH_QUEUE_NAME` from `lib/queue/publish-queue.ts` (Task 3), `uploadVideoToTikTok`/`getTikTokPublishStatus` from `lib/tiktok/publish.ts` (Task 5), `refreshTikTokToken` from `lib/tiktok/oauth.ts` (existing), `createServiceClient` from `lib/supabase/server.ts` (existing).
- Produces: the target of the already-existing `"worker": "tsx services/publisher/worker.ts"` script in `package.json` — no `package.json` change needed, the script already points here.

Uses **relative imports** throughout (see Global Constraints) since this file runs standalone via `tsx`, not through Next.js's module resolution.

- [ ] **Step 1: Implement the worker**

```ts
// services/publisher/worker.ts
import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker, type Job } from 'bullmq'
import { getRedisConnection } from '../../lib/queue/connection'
import { PUBLISH_QUEUE_NAME } from '../../lib/queue/publish-queue'
import { createServiceClient } from '../../lib/supabase/server'
import { refreshTikTokToken } from '../../lib/tiktok/oauth'
import { uploadVideoToTikTok, getTikTokPublishStatus } from '../../lib/tiktok/publish'

interface PublishJobData {
  publishJobId: string
}

const POLL_INTERVAL_MS = 5000
const MAX_POLL_ATTEMPTS = 24 // ~2 minutes total

async function processJob(job: Job<PublishJobData>): Promise<void> {
  const supabase = createServiceClient()
  const { publishJobId } = job.data

  const { data: publishJob, error: fetchError } = await supabase
    .from('publish_jobs')
    .select(
      '*, video:videos(id, r2_url, title), account:social_accounts(access_token, refresh_token, token_expires_at, platform)'
    )
    .eq('id', publishJobId)
    .single()

  if (fetchError || !publishJob) {
    console.error(`[worker] publish job ${publishJobId} not found:`, fetchError)
    return
  }

  if (publishJob.account.platform !== 'tiktok') {
    console.log(`[worker] skipping non-TikTok job ${publishJobId} (platform: ${publishJob.account.platform})`)
    return
  }

  await supabase.from('publish_jobs').update({ status: 'processing' }).eq('id', publishJobId)

  try {
    let accessToken: string = publishJob.account.access_token
    const tokenExpired = publishJob.account.token_expires_at
      ? new Date(publishJob.account.token_expires_at) < new Date()
      : false

    if (tokenExpired && publishJob.account.refresh_token) {
      const refreshed = await refreshTikTokToken(publishJob.account.refresh_token)
      accessToken = refreshed.access_token
      // Persist immediately: if TikTok rotates the refresh_token (single-use),
      // failing to save it here breaks every future refresh for this account.
      await supabase
        .from('social_accounts')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq('id', publishJob.account_id)
    }

    const { publishId } = await uploadVideoToTikTok(accessToken, publishJob.video.r2_url, publishJob.video.title)

    let finalStatus = 'PROCESSING_UPLOAD'
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      finalStatus = await getTikTokPublishStatus(accessToken, publishId)
      if (finalStatus === 'PUBLISH_COMPLETE' || finalStatus === 'FAILED') break
    }

    if (finalStatus !== 'PUBLISH_COMPLETE') {
      throw new Error(`TikTok publish did not complete in time (last status: ${finalStatus})`)
    }

    await supabase
      .from('publish_jobs')
      .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: publishId })
      .eq('id', publishJobId)
    await supabase.from('videos').update({ status: 'published' }).eq('id', publishJob.video.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error(`[worker] publish job ${publishJobId} failed:`, message)
    await supabase
      .from('publish_jobs')
      .update({
        status: 'failed',
        error_message: message,
        retry_count: (publishJob.retry_count ?? 0) + 1,
      })
      .eq('id', publishJobId)
    await supabase.from('videos').update({ status: 'failed' }).eq('id', publishJob.video.id)
  }
}

const worker = new Worker<PublishJobData>(PUBLISH_QUEUE_NAME, processJob, {
  connection: getRedisConnection(),
})

worker.on('completed', (job) => console.log(`[worker] job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message))

console.log('[worker] publish worker started, waiting for jobs...')
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: succeeds. This file is covered by the root `tsconfig.json`'s `**/*.ts` include pattern even though it's not part of the Next.js app itself.

- [ ] **Step 3: Verify the Next.js build is unaffected**

Run: `npm run build`
Expected: succeeds — this file is never imported by any Next.js route or page, so it must not appear in the build output or change it in any way.

- [ ] **Step 4: Verify the full test suite**

Run: `npm test`
Expected: passes, total count reflects every test added across this whole plan (3 from Task 3, 4 from Task 5), nothing broken.

- [ ] **Step 5: Note on manual verification**

Do NOT attempt `npm run worker` — `REDIS_URL` is a placeholder, so `getRedisConnection()` will either throw (if the string fails `ioredis`'s URL parsing) or attempt a real network connection that will hang/fail against a non-existent host. This is expected and documented in the spec; real verification requires the user to configure a real Upstash Redis TCP URL and real TikTok Developer App credentials, neither of which exist yet.

- [ ] **Step 6: Commit**

```bash
git add services/publisher/worker.ts
git commit -m "feat: add BullMQ worker for TikTok publish jobs"
```
