# Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A basic `/dashboard/analytics` page showing video/format counts, a publish-jobs-by-status breakdown, a success rate, and the 5 most recent publish failures with their error messages.

**Architecture:** A single server-rendered page querying `videos` and `publish_jobs` (org-scoped, same `videos!inner(org_id)` join pattern as the Dashboard and Schedule pages), plus one pure helper for the success-rate calculation. No charting library — status breakdown is rendered as simple Tailwind width-percentage bars, consistent with the "basique" scope in the spec.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-analytics-page-design.md`

## Global Constraints

- API responses: not applicable — this plan adds no API routes, only a server-rendered page.
- Multi-tenant rule: every `publish_jobs` query goes through `videos!inner(org_id)` + `.eq('video.org_id', orgId)`, exactly as established in `app/(dashboard)/dashboard/page.tsx` and the Schedule page plan.
- Auth: use `getCurrentUserRow(supabase, select)` from `lib/supabase/dev-org.ts`.
- Loosely-typed Supabase joins: type raw joined rows as `any` at the query boundary (matches `app/(dashboard)/dashboard/page.tsx`'s existing convention), same as the Schedule plan.
- No React component tests — verify via `npx tsc --noEmit` + `npm run build` + manual browser check. Only the one pure helper function gets a Vitest suite.

---

### Task 1: Success-rate helper (`lib/analytics.ts`)

**Files:**
- Create: `lib/analytics.ts`
- Test: `lib/analytics.test.ts`

**Interfaces:**
- Produces (consumed by Task 2): `calculateSuccessRate(published: number, failed: number): number` — returns an integer percentage (0-100), `0` when `published + failed === 0` (never `NaN`).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/analytics.test.ts
import { describe, it, expect } from 'vitest'
import { calculateSuccessRate } from './analytics'

describe('calculateSuccessRate', () => {
  it('returns 0 when there is no published or failed job at all', () => {
    expect(calculateSuccessRate(0, 0)).toBe(0)
  })

  it('returns 100 when everything published and nothing failed', () => {
    expect(calculateSuccessRate(5, 0)).toBe(100)
  })

  it('returns 0 when everything failed', () => {
    expect(calculateSuccessRate(0, 3)).toBe(0)
  })

  it('rounds to the nearest integer percentage', () => {
    expect(calculateSuccessRate(3, 1)).toBe(75)
    expect(calculateSuccessRate(1, 2)).toBe(33)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/analytics.test.ts`
Expected: FAIL with "Cannot find module './analytics'"

- [ ] **Step 3: Implement `lib/analytics.ts`**

```ts
export function calculateSuccessRate(published: number, failed: number): number {
  const total = published + failed
  if (total === 0) return 0
  return Math.round((published / total) * 100)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/analytics.test.ts`
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/analytics.ts lib/analytics.test.ts
git commit -m "feat: add success-rate calculation helper"
```

---

### Task 2: Analytics page

**Files:**
- Create: `app/(dashboard)/dashboard/analytics/page.tsx`
- Create: `app/(dashboard)/dashboard/analytics/loading.tsx`

**Interfaces:**
- Consumes: `getCurrentUserRow` (`lib/supabase/dev-org.ts`), `calculateSuccessRate` (Task 1), `getJobStatusBadge` from `lib/status.ts`, `Card` (`components/ui/card.tsx`), `Badge` (`components/ui/badge.tsx`), `EmptyState` (`components/ui/empty-state.tsx`), `Skeleton` (`components/ui/skeleton.tsx`), `cn` from `lib/utils.ts`.
- Produces: the page the Sidebar already links to at `/dashboard/analytics` (no Sidebar change needed — the nav entry already exists and currently 404s).

- [ ] **Step 1: Implement the page**

```tsx
// app/(dashboard)/dashboard/analytics/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { calculateSuccessRate } from '@/lib/analytics'
import { getJobStatusBadge } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Clapperboard, Video, TrendingUp, AlertTriangle } from 'lucide-react'
import type { JobStatus } from '@/lib/types'

const JOB_STATUSES: JobStatus[] = ['pending', 'processing', 'published', 'failed']

export default async function AnalyticsPage() {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  const [{ count: totalVideos }, { count: shortVideos }, { count: longVideos }] = await Promise.all([
    supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('format', 'short'),
    supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('format', 'long'),
  ])

  const statusCountResults = await Promise.all(
    JOB_STATUSES.map((status) =>
      supabase
        .from('publish_jobs')
        .select('*, video:videos!inner(org_id)', { count: 'exact', head: true })
        .eq('status', status)
        .eq('video.org_id', orgId)
    )
  )
  const counts = Object.fromEntries(
    JOB_STATUSES.map((status, i) => [status, statusCountResults[i].count ?? 0])
  ) as Record<JobStatus, number>
  const totalJobs = JOB_STATUSES.reduce((sum, status) => sum + counts[status], 0)
  const successRate = calculateSuccessRate(counts.published, counts.failed)

  const { data: failedJobs } = await supabase
    .from('publish_jobs')
    .select('id, error_message, scheduled_at, video:videos!inner(title, org_id)')
    .eq('status', 'failed')
    .eq('video.org_id', orgId)
    .order('scheduled_at', { ascending: false })
    .limit(5)

  const stats = [
    { label: 'Vidéos uploadées', value: totalVideos ?? 0, icon: Clapperboard },
    { label: 'Shorts', value: shortVideos ?? 0, icon: Video },
    { label: 'Longues', value: longVideos ?? 0, icon: Video },
    { label: 'Taux de succès', value: `${successRate}%`, icon: TrendingUp },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">Vue d'ensemble de tes publications</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-primary/10">
              <Icon size={20} className="text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5 mb-8">
        <h2 className="font-semibold text-foreground mb-4">Publications par statut</h2>
        <div className="flex flex-col gap-3">
          {JOB_STATUSES.map((status) => {
            const badge = getJobStatusBadge(status)
            const count = counts[status]
            const widthPct = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0
            return (
              <div key={status} className="flex items-center gap-3">
                <Badge className={cn('w-24 justify-center', badge.className)}>{badge.label}</Badge>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${widthPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {failedJobs && failedJobs.length > 0 ? (
        <Card>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Dernières erreurs</h2>
          </div>
          <div className="divide-y divide-border">
            {failedJobs.map((job: any) => (
              <div key={job.id} className="px-5 py-4">
                <p className="text-sm text-foreground font-medium">{job.video?.title}</p>
                <p className="text-xs text-red-500 mt-0.5">{job.error_message ?? 'Erreur inconnue'}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={AlertTriangle}
          title="Aucune erreur récente"
          description="Les publications échouées apparaîtront ici avec leur raison."
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(dashboard)/dashboard/analytics/loading.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AnalyticsLoading() {
  return (
    <div>
      <div className="mb-8">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl mb-8" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck, build, and the full test suite**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: all succeed; Vitest count increases only by the 4 tests added in Task 1.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (with `ALLOW_DEV_AUTH_BYPASS=1` set), go to `/dashboard/analytics`.
Expected: 4 stat cards render (all zeros/0% acceptable with no data), the status-breakdown bars render at 0 width with no division-by-zero artifact, and the empty state shows "Aucune erreur récente" when there are no failed jobs.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/analytics/page.tsx" "app/(dashboard)/dashboard/analytics/loading.tsx"
git commit -m "feat: add analytics page with basic stats and status breakdown"
```
