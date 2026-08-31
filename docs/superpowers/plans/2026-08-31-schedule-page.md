# Schedule Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick an uploaded video, a connected social account, and a date/time, and see it appear on a simple weekly calendar at `/dashboard/schedule` — with the ability to cancel a planned publication.

**Architecture:** Two new API routes (`POST /api/schedule`, `DELETE /api/schedule/[id]`) create/remove `publish_jobs` rows, validated against the caller's own org via the existing `videos.org_id`/`social_accounts.org_id` join pattern. A pure `lib/schedule.ts` computes the current week's 7 days and groups jobs by date. Two new client components (`ScheduleDialog` for creating, `ScheduleJobCard` for displaying + cancelling one job) plug into a server-rendered page. Two new `components/ui/` primitives (`Select`, `Input`) are added — both were deliberately deferred by the previous plan for lack of a consumer; this plan is that consumer.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/ssr`), `@radix-ui/react-select` (already installed), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-schedule-page-design.md`

## Global Constraints

- API responses always use `ApiResponse<T> = { data: T | null; error: string | null }` from `lib/types.ts`.
- No silent try/catch — errors are always logged server-side (`console.error`) and surfaced to the client as a generic message, matching the pattern already established in `app/api/videos/route.ts` and `app/api/videos/presign/route.ts`.
- Multi-tenant rule: `publish_jobs` has no `org_id` column of its own — every query/mutation against it must go through `videos!inner(org_id)` + `.eq('video.org_id', orgId)` (or, for a plain insert, verify the referenced `video_id`/`account_id` belong to the caller's org first), exactly as already established in `app/(dashboard)/dashboard/page.tsx`.
- Auth: use `getCurrentUserRow(supabase, select)` from `lib/supabase/dev-org.ts` in every server component/route that needs the caller's `org_id` — never call `supabase.auth.getUser()` directly for this purpose (matches the convention already used by the Dashboard/Accounts/Videos pages).
- Loosely-typed Supabase joins: this project's Supabase client has no `Database` generic, so a `select('*, video:videos(...)')` result is not type-checked by the compiler. Follow the existing convention in `app/(dashboard)/dashboard/page.tsx` (`recentJobs.map((job: any) => ...)`) — type the raw joined row as `any` at the query boundary, then pass a narrow, explicitly-typed interface into any child component that renders it.
- Dates: `publish_jobs.scheduled_at` is a Postgres `timestamptz`, delivered by Supabase as an ISO 8601 string. This plan groups/labels jobs by their **UTC calendar date** (`string.slice(0, 10)` / `date.toISOString().slice(0, 10)`) — no per-user timezone handling in this "simple scheduling" scope. Document this assumption in code, don't silently hide it.
- No React component tests (matches the codebase's established convention) — verify via `npx tsc --noEmit` + `npm run build`, plus a manual `npm run dev` browser check for the page/dialog tasks. Only `lib/schedule.ts` (pure, DOM-free logic) gets a Vitest suite.

---

### Task 1: `Select` and `Input` UI primitives

**Files:**
- Create: `components/ui/select.tsx`
- Create: `components/ui/input.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-select` (already installed), `cn` from `lib/utils.ts`.
- Produces (consumed by Task 5): `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (standard shadcn Radix-Select wrapper); `Input` (standard shadcn text-input wrapper, must support `type="datetime-local"` since Task 5 uses it for the schedule date/time field — no special handling needed, it's a plain `<input>` under the hood).

Two small, independent, same-shape files — implement and commit together.

- [ ] **Step 1: Implement `components/ui/select.tsx`**

```tsx
'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown size={16} className="opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-md',
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check size={14} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem }
```

- [ ] **Step 2: Implement `components/ui/input.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
```

- [ ] **Step 3: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed — neither file is imported anywhere yet.

- [ ] **Step 4: Commit**

```bash
git add components/ui/select.tsx components/ui/input.tsx
git commit -m "feat: add Select and Input ui primitives"
```

---

### Task 2: Pure week/grouping helpers (`lib/schedule.ts`)

**Files:**
- Create: `lib/schedule.ts`
- Test: `lib/schedule.test.ts`

**Interfaces:**
- Produces (consumed by Task 7): `getWeekDays(referenceDate: Date): Date[]` (always 7 entries, Monday first, each at local midnight), `groupJobsByDate<T extends { scheduled_at: string }>(jobs: T[]): Record<string, T[]>` (keyed by the job's UTC calendar date, `YYYY-MM-DD`).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/schedule.test.ts
import { describe, it, expect } from 'vitest'
import { getWeekDays, groupJobsByDate } from './schedule'

describe('getWeekDays', () => {
  it('returns 7 days starting Monday for a mid-week reference date', () => {
    // Wednesday 2026-09-02 (month is 0-indexed: 8 = September)
    const days = getWeekDays(new Date(2026, 8, 2, 15, 30))
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1) // Monday
    expect(days[6].getDay()).toBe(0) // Sunday
    expect(days[0].getDate()).toBe(31) // Monday Aug 31
    expect(days[0].getMonth()).toBe(7) // August (0-indexed)
    expect(days[6].getDate()).toBe(6) // Sunday Sep 6
  })

  it('returns the same week when the reference date IS a Sunday', () => {
    // Sunday 2026-09-06
    const days = getWeekDays(new Date(2026, 8, 6, 9, 0))
    expect(days[0].getDate()).toBe(31)
    expect(days[0].getMonth()).toBe(7)
    expect(days[6].getDate()).toBe(6)
    expect(days[6].getMonth()).toBe(8)
  })

  it('returns the same week when the reference date IS a Monday', () => {
    const days = getWeekDays(new Date(2026, 8, 7, 9, 0))
    expect(days[0].getDate()).toBe(7)
    expect(days[6].getDate()).toBe(13)
  })

  it('zeroes out the time on every returned day', () => {
    const days = getWeekDays(new Date(2026, 8, 2, 23, 59, 59))
    for (const day of days) {
      expect(day.getHours()).toBe(0)
      expect(day.getMinutes()).toBe(0)
      expect(day.getSeconds()).toBe(0)
    }
  })
})

describe('groupJobsByDate', () => {
  it('groups jobs by their UTC calendar date', () => {
    const jobs = [
      { id: '1', scheduled_at: '2026-09-02T14:00:00.000Z' },
      { id: '2', scheduled_at: '2026-09-02T09:00:00.000Z' },
      { id: '3', scheduled_at: '2026-09-03T10:00:00.000Z' },
    ]
    const grouped = groupJobsByDate(jobs)
    expect(Object.keys(grouped).sort()).toEqual(['2026-09-02', '2026-09-03'])
    expect(grouped['2026-09-02']).toHaveLength(2)
    expect(grouped['2026-09-03']).toHaveLength(1)
  })

  it('returns an empty object for an empty list', () => {
    expect(groupJobsByDate([])).toEqual({})
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/schedule.test.ts`
Expected: FAIL with "Cannot find module './schedule'"

- [ ] **Step 3: Implement `lib/schedule.ts`**

```ts
export function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(referenceDate)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() + diffToMonday)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export function groupJobsByDate<T extends { scheduled_at: string }>(jobs: T[]): Record<string, T[]> {
  return jobs.reduce((acc, job) => {
    const key = job.scheduled_at.slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(job)
    return acc
  }, {} as Record<string, T[]>)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/schedule.test.ts`
Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/schedule.ts lib/schedule.test.ts
git commit -m "feat: add pure week/grouping helpers for the schedule page"
```

---

### Task 3: `POST /api/schedule` route

**Files:**
- Create: `app/api/schedule/route.ts`

**Interfaces:**
- Consumes: `getCurrentUserRow` from `lib/supabase/dev-org.ts`; `ApiResponse`, `PublishJob` from `lib/types.ts`.
- Produces (consumed by Task 5): `POST` handler, body `{ video_id: string; account_id: string; scheduled_at: string }`, returns `ApiResponse<PublishJob>`.
- Does **not** enqueue a BullMQ job — that wiring is added later by the Publish Worker plan, which will modify this exact file to add one line after the insert succeeds. This task's job row is created with `status: 'pending'` and nothing consumes it yet; that's expected, not a gap.

- [ ] **Step 1: Implement the route**

```ts
// app/api/schedule/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import type { ApiResponse, PublishJob } from '@/lib/types'

interface CreateScheduleBody {
  video_id: string
  account_id: string
  scheduled_at: string
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
    .select('id')
    .eq('id', body.account_id)
    .eq('org_id', orgId)
    .single()

  if (!account) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte introuvable' }, { status: 404 })
  }

  const { data: job, error } = await supabase
    .from('publish_jobs')
    .insert({
      video_id: body.video_id,
      account_id: body.account_id,
      scheduled_at: scheduledDate.toISOString(),
      status: 'pending',
    })
    .select()
    .single()

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

  return NextResponse.json<ApiResponse<PublishJob>>({ data: job, error: null })
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add app/api/schedule/route.ts
git commit -m "feat: add endpoint to create a scheduled publish job"
```

---

### Task 4: `DELETE /api/schedule/[id]` route

**Files:**
- Create: `app/api/schedule/[id]/route.ts`

**Interfaces:**
- Consumes: `getCurrentUserRow` from `lib/supabase/dev-org.ts`; `ApiResponse` from `lib/types.ts`.
- Produces (consumed by Task 6): `DELETE` handler at `/api/schedule/:id`, returns `ApiResponse<null>`.

- [ ] **Step 1: Implement the route**

```ts
// app/api/schedule/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import type { ApiResponse } from '@/lib/types'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  if (!orgId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const { data: job } = await supabase
    .from('publish_jobs')
    .select('id, video:videos!inner(org_id)')
    .eq('id', params.id)
    .eq('video.org_id', orgId)
    .single()

  if (!job) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Planification introuvable' }, { status: 404 })
  }

  const { error } = await supabase.from('publish_jobs').delete().eq('id', params.id)

  if (error) {
    console.error('[DELETE /api/schedule/:id] failed:', error)
    return NextResponse.json<ApiResponse<null>>({ data: null, error: "Erreur lors de l'annulation" }, { status: 500 })
  }

  return NextResponse.json<ApiResponse<null>>({ data: null, error: null })
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add "app/api/schedule/[id]/route.ts"
git commit -m "feat: add endpoint to cancel a scheduled publish job"
```

---

### Task 5: `ScheduleDialog` component (create a schedule)

**Files:**
- Create: `components/dashboard/ScheduleDialog.tsx`

**Interfaces:**
- Consumes: `Button` (`components/ui/button.tsx`), `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` (`components/ui/dialog.tsx`), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (Task 1), `Input` (Task 1), `ApiResponse`/`PublishJob`/`Video`/`SocialAccount` from `lib/types.ts`, `POST /api/schedule` (Task 3).
- Produces (consumed by Task 7): `<ScheduleDialog videos={Video[]} accounts={SocialAccount[]} />`, no other props. Calls `router.refresh()` on success so the server-rendered calendar picks up the new job.

- [ ] **Step 1: Implement the component**

```tsx
// components/dashboard/ScheduleDialog.tsx
'use client'

import { useState } from 'react'
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

  async function handleSubmit() {
    if (!videoId || !accountId || !scheduledAt) {
      toast.error('Remplis tous les champs')
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
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Planification...' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed. Not imported anywhere yet (Task 7 wires it in) — that's expected.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ScheduleDialog.tsx
git commit -m "feat: add ScheduleDialog component for creating a scheduled publish"
```

---

### Task 6: `ScheduleJobCard` component (display + cancel)

**Files:**
- Create: `components/dashboard/ScheduleJobCard.tsx`

**Interfaces:**
- Consumes: `Button` (`components/ui/button.tsx`), `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`/`DialogClose` (`components/ui/dialog.tsx`), `getPlatformBadge` from `lib/status.ts`, `DELETE /api/schedule/[id]` (Task 4). Follows the exact confirm-dialog pattern already used in `components/dashboard/AccountCard.tsx`.
- Produces (consumed by Task 7): `<ScheduleJobCard job={ScheduleJobCardJob} />` where `ScheduleJobCardJob` is a local interface (defined in this file) shaped as `{ id: string; scheduled_at: string; video: { title: string }; account: { platform: Platform; username: string } }` — this is the narrow shape the calendar's Supabase join actually produces, not the full `PublishJob` type (see Global Constraints on loosely-typed joins).

- [ ] **Step 1: Implement the component**

```tsx
// components/dashboard/ScheduleJobCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { Platform, ApiResponse } from '@/lib/types'

export interface ScheduleJobCardJob {
  id: string
  scheduled_at: string
  video: { title: string }
  account: { platform: Platform; username: string }
}

export default function ScheduleJobCard({ job }: { job: ScheduleJobCardJob }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const platform = getPlatformBadge(job.account.platform)

  async function handleCancel() {
    setCancelling(true)
    const res = await fetch(`/api/schedule/${job.id}`, { method: 'DELETE' })
    const json: ApiResponse<null> = await res.json()
    setCancelling(false)
    setConfirmOpen(false)
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Planification annulée')
    router.refresh()
  }

  return (
    <div className="rounded-lg bg-muted p-2 text-xs flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <span className={cn('flex items-center gap-1', platform.className)}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {new Date(job.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive">
              <Trash2 size={12} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Annuler cette planification ?</DialogTitle>
              <DialogDescription>
                « {job.video.title} » ne sera plus publiée sur @{job.account.username} à l'heure prévue.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Retour</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                Annuler la planification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="truncate text-foreground">{job.video.title}</p>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ScheduleJobCard.tsx
git commit -m "feat: add ScheduleJobCard component for displaying and cancelling a job"
```

---

### Task 7: Schedule page

**Files:**
- Create: `app/(dashboard)/dashboard/schedule/page.tsx`
- Create: `app/(dashboard)/dashboard/schedule/loading.tsx`

**Interfaces:**
- Consumes: `getCurrentUserRow` (`lib/supabase/dev-org.ts`), `getWeekDays`/`groupJobsByDate` (Task 2), `ScheduleDialog` (Task 5), `ScheduleJobCard` + its `ScheduleJobCardJob` type (Task 6), `Card` (`components/ui/card.tsx`), `Skeleton` (`components/ui/skeleton.tsx`).
- Produces: the page the Sidebar already links to at `/dashboard/schedule` (see `components/dashboard/Sidebar.tsx` — no Sidebar change needed, the nav entry already exists and currently 404s).

- [ ] **Step 1: Implement the page**

```tsx
// app/(dashboard)/dashboard/schedule/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { getWeekDays, groupJobsByDate } from '@/lib/schedule'
import ScheduleDialog from '@/components/dashboard/ScheduleDialog'
import ScheduleJobCard, { type ScheduleJobCardJob } from '@/components/dashboard/ScheduleJobCard'
import { Card } from '@/components/ui/card'
import type { Video, SocialAccount } from '@/lib/types'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default async function SchedulePage() {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  const [{ data: videos }, { data: accounts }, { data: jobs }] = await Promise.all([
    supabase.from('videos').select('*').eq('org_id', orgId).eq('status', 'uploaded').order('created_at', { ascending: false }),
    supabase.from('social_accounts').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase
      .from('publish_jobs')
      .select('id, scheduled_at, video:videos!inner(title, org_id), account:social_accounts(platform, username)')
      .eq('video.org_id', orgId)
      .order('scheduled_at', { ascending: true }),
  ])

  const weekDays = getWeekDays(new Date())
  const jobsByDate = groupJobsByDate((jobs ?? []) as { scheduled_at: string }[])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planning</h1>
          <p className="text-muted-foreground mt-1">
            Semaine du {weekDays[0].toLocaleDateString('fr-FR')} au {weekDays[6].toLocaleDateString('fr-FR')}
          </p>
        </div>
        <ScheduleDialog videos={(videos ?? []) as Video[]} accounts={(accounts ?? []) as SocialAccount[]} />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground border-r border-border last:border-r-0"
            >
              {WEEKDAY_LABELS[i]} {day.getDate()}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-[240px]">
          {weekDays.map((day, i) => {
            const key = day.toISOString().slice(0, 10)
            const dayJobs = (jobsByDate[key] ?? []) as unknown as ScheduleJobCardJob[]
            return (
              <div key={i} className="p-2 border-r border-border last:border-r-0 flex flex-col gap-2">
                {dayJobs.map((job) => (
                  <ScheduleJobCard key={job.id} job={job} />
                ))}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
```

Note: `videos!inner(title, org_id)` selects `org_id` only so the `.eq('video.org_id', orgId)` filter has a column to match against — `org_id` itself is never rendered, matching the pattern already used in `app/(dashboard)/dashboard/page.tsx`'s `recentJobs` query.

- [ ] **Step 2: Create `app/(dashboard)/dashboard/schedule/loading.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function ScheduleLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck, build, and the full test suite**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: all succeed; Vitest count increases only by the 6 tests added in Task 2 (no other test files touched by this task).

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (with `ALLOW_DEV_AUTH_BYPASS=1` set, per this session's dev auth bypass), go to `/dashboard/schedule`.
Expected: the current week's 7 days render as columns; if the org has no uploaded videos or no active accounts, the "Planifier" dialog's selects are simply empty (acceptable per spec — no extra empty-state handling required for this simple scope); creating a schedule against a real Supabase project with at least one uploaded video and one connected account makes a job appear in the correct day column; cancelling it removes it and shows a toast.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/schedule/page.tsx" "app/(dashboard)/dashboard/schedule/loading.tsx"
git commit -m "feat: add schedule page with weekly calendar view"
```
