# Dashboard UX Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the already-scaffolded shadcn/ui design system (Radix + CVA + CSS tokens, installed but never wired up) across the 3 existing dashboard pages (Dashboard, Accounts, Videos), replacing hardcoded Tailwind colors with a calm, neutral-gray token system, adding real dark-mode switching, unifying status/badge duplication, and fixing a multi-tenant data leak.

**Architecture:** A new `components/ui/` layer of small, independent shadcn-pattern primitives (Button, Card, Badge, Skeleton, EmptyState, DropdownMenu, Dialog, Tooltip) consumed one-way by the existing `components/dashboard/*` components and pages. A new `lib/status.ts` centralizes status/platform → label/color resolution as pure functions, replacing two near-duplicate implementations.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `@radix-ui/react-*` (already installed), `class-variance-authority` (already installed), `tailwind-merge` + existing `cn()` helper in `lib/utils.ts` (already installed, unchanged), `next-themes` (new dependency), Vitest (existing, for the one pure-logic file this plan adds).

**Spec:** `docs/superpowers/specs/2026-08-30-dashboard-ux-foundations-design.md`

## Global Constraints

- Use the existing `cn()` helper from `lib/utils.ts` in every new component — never redefine it locally (a local `cn()` duplicate currently exists in `app/(dashboard)/dashboard/page.tsx` and must be removed, not copied elsewhere).
- No React component tests in this plan — matches the codebase's established pattern (API routes and UI components are verified via `npx tsc --noEmit` + `npm run build`, plus a manual `npm run dev` browser check for visual tasks). Only genuinely pure, DOM-free logic gets a Vitest test (this plan's one instance: `lib/status.ts`).
- Multi-tenant rule: every Supabase query must filter by the caller's own `org_id` (CLAUDE.md §7) — this plan fixes one existing violation (Task 7).
- All new/modified components consume the CSS custom-property tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`/`text-primary`, etc.) — never hardcoded Tailwind palette colors like `bg-slate-900` or `text-purple-400`, except for the platform-brand and job/video-status colors in `lib/status.ts`, which are intentionally literal (amber/blue/emerald/red/rose) because they carry fixed external meaning (TikTok pink, a platform's own brand color, a status semantic), not app theme.
- Deviation from spec, disclosed: the spec's architecture section lists `select.tsx` and `input.tsx` as design-system primitives. Nothing in this plan's actual page migrations consumes a `Select` (no filter/dropdown-selection UI exists yet in Dashboard/Accounts/Videos) or an `Input` (no text-entry form exists in these 3 pages — `AccountCard`'s only interaction is a delete confirmation, `VideoUploader` has no text fields). Building either now would be an unused file with no test coverage and no caller, contrary to this project's YAGNI convention. Both are deferred to the sub-project 2 plan (Schedule page), where date/account selection and a title-edit field are the first real consumers.
- `Dialog` and `Tooltip` — also listed in the spec but with no assigned consumer in the migration table — are given concrete consumers in this plan (Task 8's disconnect confirmation, Task 7's failed-job reason) rather than being built speculatively; see those tasks for why.

---

### Task 1: Neutral design tokens

**Files:**
- Modify: `app/globals.css`

**Interfaces:** None — pure CSS custom properties, consumed by every Tailwind token class (`bg-background`, `bg-card`, etc.) used in later tasks.

- [ ] **Step 1: Replace the light-mode token block**

In `app/globals.css`, inside `:root { ... }`, replace the `--background` through `--accent-foreground` lines (keep `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--ring`, `--radius` exactly as they are) with:

```css
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
```

- [ ] **Step 2: Replace the dark-mode token block**

Inside `.dark { ... }`, replace the `--background` through `--accent-foreground` lines (keep `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--ring` exactly as they are) with:

```css
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 6.9%;
    --card-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `npm run build`
Expected: build succeeds (CSS-only change, no functional impact yet since no component uses the tokens until later tasks — this just confirms nothing is syntactically broken).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: switch design tokens to a neutral gray scale"
```

---

### Task 2: Real dark mode via next-themes

**Files:**
- Modify: `package.json` (add `next-themes` dependency)
- Create: `components/theme-provider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `<ThemeProvider>` component wrapping the app; `useTheme()` hook (re-exported by `next-themes`) available to any client component, consumed by Task 6 (Sidebar's theme toggle).

- [ ] **Step 1: Install next-themes**

Run: `npm install next-themes` (from the repo root)

- [ ] **Step 2: Create the theme provider wrapper**

```tsx
// components/theme-provider.tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes/dist/types'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

- [ ] **Step 3: Wire it into the root layout**

Modify `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'KLIP — Publication automatique TikTok & YouTube',
  description: 'Connecte tes comptes, charge tes vidéos, KLIP publie automatiquement.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

`suppressHydrationWarning` on `<html>` is required by `next-themes` — the server can't know the client's `prefers-color-scheme` before hydration, so a one-render class mismatch is expected and intentionally silenced only for this element.

- [ ] **Step 4: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open the app in a browser, open devtools console.
Expected: no hydration-mismatch warning printed; toggling the OS-level dark/light preference (or devtools' rendering emulation) changes the page background once reloaded (no toggle UI yet — that's Task 6).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/theme-provider.tsx app/layout.tsx
git commit -m "feat: wire up next-themes for real dark mode"
```

---

### Task 3: Base UI primitives (Button, Card, Badge, Skeleton, EmptyState)

**Files:**
- Create: `components/ui/button.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/badge.tsx`
- Create: `components/ui/skeleton.tsx`
- Create: `components/ui/empty-state.tsx`

**Interfaces:**
- Consumes: `cn` from `lib/utils.ts` (existing, unchanged).
- Produces (consumed by Tasks 6-9):
  - `Button` — props: standard `<button>` props + `variant?: 'default'|'outline'|'ghost'|'destructive'`, `size?: 'sm'|'md'|'lg'|'icon'`, `asChild?: boolean`.
  - `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` — each a styled `<div>`/`<h3>` forwarding `className` and all native props.
  - `Badge` — props: standard `<span>` props (just a pill shape; callers supply their own semantic `className`, e.g. from `lib/status.ts` in Task 4).
  - `Skeleton` — props: standard `<div>` props (a pulsing placeholder block).
  - `EmptyState` — props: `icon: LucideIcon`, `title: string`, `description: string`, `action?: React.ReactNode`.

This is 5 small, independent, same-shape presentational files — implement and commit them together as one task.

- [ ] **Step 1: Implement `components/ui/button.tsx`**

```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

- [ ] **Step 2: Implement `components/ui/card.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-xl border border-border bg-card text-card-foreground', className)} {...props} />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight text-foreground', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardContent, CardFooter }
```

- [ ] **Step 3: Implement `components/ui/badge.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>

function Badge({ className, ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', className)} {...props} />
}

export { Badge }
```

- [ ] **Step 4: Implement `components/ui/skeleton.tsx`**

```tsx
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export { Skeleton }
```

- [ ] **Step 5: Implement `components/ui/empty-state.tsx`**

```tsx
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-16 text-center">
      <Icon className="mx-auto mb-4 text-muted-foreground" size={40} />
      <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}
```

- [ ] **Step 6: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed — these files aren't imported anywhere yet, so this only confirms they're individually well-typed.

- [ ] **Step 7: Commit**

```bash
git add components/ui/button.tsx components/ui/card.tsx components/ui/badge.tsx components/ui/skeleton.tsx components/ui/empty-state.tsx
git commit -m "feat: add base ui primitives (Button, Card, Badge, Skeleton, EmptyState)"
```

---

### Task 4: Unified status/platform mapping (`lib/status.ts`)

**Files:**
- Create: `lib/status.ts`
- Test: `lib/status.test.ts`

**Interfaces:**
- Consumes: `JobStatus`, `VideoStatus`, `Platform` types from `lib/types.ts` (already exist, unchanged).
- Produces: `getJobStatusBadge(status: JobStatus): { label: string; className: string }` (consumed by Task 7), `getVideoStatusBadge(status: VideoStatus): { label: string; className: string }` (consumed by Task 9), `getPlatformBadge(platform: Platform): { label: string; className: string }` (consumed by Task 8).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/status.test.ts
import { describe, it, expect } from 'vitest'
import { getJobStatusBadge, getVideoStatusBadge, getPlatformBadge } from './status'

describe('getJobStatusBadge', () => {
  it('returns the French label and amber classes for pending', () => {
    expect(getJobStatusBadge('pending')).toEqual({ label: 'Planifié', className: 'bg-amber-500/10 text-amber-400' })
  })

  it('returns the French label and emerald classes for published', () => {
    expect(getJobStatusBadge('published')).toEqual({ label: 'Publié', className: 'bg-emerald-500/10 text-emerald-400' })
  })

  it('returns the French label and red classes for failed', () => {
    expect(getJobStatusBadge('failed')).toEqual({ label: 'Échoué', className: 'bg-red-500/10 text-red-400' })
  })
})

describe('getVideoStatusBadge', () => {
  it('returns the French label and slate classes for uploaded', () => {
    expect(getVideoStatusBadge('uploaded')).toEqual({ label: 'Uploadée', className: 'bg-slate-500/10 text-slate-400' })
  })

  it('returns the French label and amber classes for scheduled', () => {
    expect(getVideoStatusBadge('scheduled')).toEqual({ label: 'Planifiée', className: 'bg-amber-500/10 text-amber-400' })
  })
})

describe('getPlatformBadge', () => {
  it('returns TikTok label and rose classes', () => {
    expect(getPlatformBadge('tiktok')).toEqual({ label: 'TikTok', className: 'text-rose-400' })
  })

  it('returns YouTube label and red classes', () => {
    expect(getPlatformBadge('youtube')).toEqual({ label: 'YouTube', className: 'text-red-500' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/status.test.ts`
Expected: FAIL with "Cannot find module './status'"

- [ ] **Step 3: Implement `lib/status.ts`**

```ts
import type { JobStatus, VideoStatus, Platform } from './types'

interface BadgeStyle {
  label: string
  className: string
}

const JOB_STATUS_MAP: Record<JobStatus, BadgeStyle> = {
  pending: { label: 'Planifié', className: 'bg-amber-500/10 text-amber-400' },
  processing: { label: 'En cours', className: 'bg-blue-500/10 text-blue-400' },
  published: { label: 'Publié', className: 'bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Échoué', className: 'bg-red-500/10 text-red-400' },
}

const VIDEO_STATUS_MAP: Record<VideoStatus, BadgeStyle> = {
  uploaded: { label: 'Uploadée', className: 'bg-slate-500/10 text-slate-400' },
  scheduled: { label: 'Planifiée', className: 'bg-amber-500/10 text-amber-400' },
  published: { label: 'Publiée', className: 'bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Échouée', className: 'bg-red-500/10 text-red-400' },
}

const PLATFORM_MAP: Record<Platform, BadgeStyle> = {
  tiktok: { label: 'TikTok', className: 'text-rose-400' },
  youtube: { label: 'YouTube', className: 'text-red-500' },
}

export function getJobStatusBadge(status: JobStatus): BadgeStyle {
  return JOB_STATUS_MAP[status]
}

export function getVideoStatusBadge(status: VideoStatus): BadgeStyle {
  return VIDEO_STATUS_MAP[status]
}

export function getPlatformBadge(platform: Platform): BadgeStyle {
  return PLATFORM_MAP[platform]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/status.test.ts`
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/status.ts lib/status.test.ts
git commit -m "feat: add unified status/platform badge mapping"
```

---

### Task 5: Interactive UI primitives (DropdownMenu, Dialog, Tooltip)

**Files:**
- Create: `components/ui/dropdown-menu.tsx`
- Create: `components/ui/dialog.tsx`
- Create: `components/ui/tooltip.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-tooltip` (all already installed); `cn` from `lib/utils.ts`.
- Produces (consumed by Task 6: DropdownMenu; Task 7: Tooltip; Task 8: Dialog):
  - `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`
  - `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
  - `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` (root-mounted in `app/layout.tsx` — required once per app for Radix Tooltip to work at all)

Three independent Radix wrapper files, same shape — implement and commit together, plus the one-line layout change the Tooltip wrapper requires.

- [ ] **Step 1: Implement `components/ui/dropdown-menu.tsx`**

```tsx
'use client'

import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-card p-1 text-card-foreground shadow-md',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel }
```

- [ ] **Step 2: Implement `components/ui/dialog.tsx`**

```tsx
'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/60', className)} {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md text-muted-foreground transition-colors hover:text-foreground">
        <X size={18} />
        <span className="sr-only">Fermer</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 flex flex-col gap-1.5', className)} {...props} />
)

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />
)

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
```

- [ ] **Step 3: Implement `components/ui/tooltip.tsx`**

```tsx
'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn('z-50 max-w-xs rounded-md border border-border bg-card px-3 py-1.5 text-xs text-card-foreground shadow-md', className)}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

- [ ] **Step 4: Mount `TooltipProvider` once, at the app root**

Modify `app/layout.tsx` — add the import and wrap the existing children (inside `ThemeProvider`, so it re-renders correctly on theme change) with `TooltipProvider`:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'KLIP — Publication automatique TikTok & YouTube',
  description: 'Connecte tes comptes, charge tes vidéos, KLIP publie automatiquement.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add components/ui/dropdown-menu.tsx components/ui/dialog.tsx components/ui/tooltip.tsx app/layout.tsx
git commit -m "feat: add DropdownMenu, Dialog and Tooltip primitives"
```

---

### Task 6: Migrate Sidebar (tokens, theme toggle, user menu)

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`

**Interfaces:**
- Consumes: `Button` (Task 3), `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` (Task 5), `useTheme` from `next-themes` (Task 2), tokens from Task 1.
- No new exports — `Sidebar`'s existing `Props` interface (`{ user: { email: string; organizations?: { name: string } } | null }`) is unchanged, so its one caller (`app/(dashboard)/layout.tsx`) needs no change.

- [ ] **Step 1: Replace the file**

```tsx
// components/dashboard/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Video,
  CalendarClock,
  BarChart3,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  MoreVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/accounts', label: 'Comptes', icon: Users },
  { href: '/dashboard/videos', label: 'Vidéos', icon: Video },
  { href: '/dashboard/schedule', label: 'Planning', icon: CalendarClock },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
]

interface Props {
  user: {
    email: string
    organizations?: { name: string }
  } | null
}

export default function Sidebar({ user }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50"
      >
        <Menu size={20} />
      </Button>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:relative inset-y-0 left-0 z-50 w-60 flex flex-col bg-card border-r border-border transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-border">
          <span className="text-xl font-bold text-foreground">
            KLIP<span className="text-primary">.</span>
          </span>
          <button onClick={() => setOpen(false)} className="md:hidden text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Org name */}
        {user?.organizations?.name && (
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Organisation</p>
            <p className="text-sm text-foreground font-medium mt-0.5 truncate">
              {user.organizations.name}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: theme toggle + user menu */}
        <div className="px-3 pb-4 border-t border-border pt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Changer de thème"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>

          {user?.email && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex-1 justify-start gap-2 px-3">
                  <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                  <MoreVertical size={14} className="ml-auto text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <form action="/api/auth/logout" method="POST" className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2 text-destructive">
                      <LogOut size={16} />
                      Déconnexion
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </aside>
    </>
  )
}
```

Note on the theme toggle: `resolvedTheme` is `undefined` on the server and on the client's first render (before `next-themes` reads `localStorage`/`prefers-color-scheme`), so rendering an icon based on it before mount would mismatch between server and client HTML. The `mounted` guard (`useEffect` flips it to `true` only after the client has hydrated) sidesteps that — before mount it always renders the `Moon` icon, then corrects itself immediately after mount, which is the standard `next-themes` pattern and avoids a hydration warning without needing `suppressHydrationWarning` on this element too.

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in, view any dashboard page.
Expected: sidebar renders with the new neutral tokens; clicking the sun/moon button toggles the theme and persists across a page reload; the user-email dropdown opens on click and the "Déconnexion" item logs out.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/Sidebar.tsx
git commit -m "feat: migrate Sidebar to design tokens, add theme toggle and user dropdown"
```

---

### Task 7: Migrate Dashboard page (tokens, Card, Badge, Tooltip, org_id fix, error boundary)

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Create: `app/(dashboard)/dashboard/loading.tsx`
- Create: `app/(dashboard)/error.tsx`

**Interfaces:**
- Consumes: `Card`, `CardContent` (Task 3), `Badge`, `Skeleton` (Task 3), `getJobStatusBadge` (Task 4), `Tooltip`/`TooltipTrigger`/`TooltipContent` (Task 5), `Button` (Task 3).
- No new exports — these are page-level and route-group-level Next.js special files, nothing imports them directly.

`app/(dashboard)/error.tsx` is a route-group-level error boundary (per the spec's "États de chargement / vides / erreurs" section: create one if absent — none exists in this repo today). It's placed here rather than as its own task because it has no independent deliverable to test on its own; it's exercised the same way this task's other changes are, via the manual verification step below.

- [ ] **Step 1: Replace `app/(dashboard)/dashboard/page.tsx`**

This fixes the org_id bug (the `pendingCount` and `publishedCount` queries below now filter by `org_id`, matching `videoCount` and `accountCount`), removes the local `cn()` duplicate (now imports the shared one), removes the local `StatusBadge` function (now uses `getJobStatusBadge` + `Badge`), and adds a `Tooltip` showing `error_message` on failed jobs.

```tsx
import { createClient } from '@/lib/supabase/server'
import { Video, Users, CalendarClock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { getJobStatusBadge } from '@/lib/status'
import { EmptyState } from '@/components/ui/empty-state'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user!.id)
    .single()

  const orgId = userData?.org_id

  const [{ count: videoCount }, { count: accountCount }, { count: pendingCount }, { count: publishedCount }] =
    await Promise.all([
      supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('social_accounts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      supabase.from('publish_jobs').select('*, video:videos!inner(org_id)', { count: 'exact', head: true }).eq('status', 'pending').eq('video.org_id', orgId),
      supabase.from('publish_jobs').select('*, video:videos!inner(org_id)', { count: 'exact', head: true }).eq('status', 'published').eq('video.org_id', orgId),
    ])

  const stats = [
    { label: 'Vidéos uploadées', value: videoCount ?? 0, icon: Video, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Comptes connectés', value: accountCount ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Publications planifiées', value: pendingCount ?? 0, icon: CalendarClock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Publiées avec succès', value: publishedCount ?? 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ]

  // Recent jobs — joined video is filtered by org_id via the same relation used above
  const { data: recentJobs } = await supabase
    .from('publish_jobs')
    .select('*, video:videos!inner(title, org_id), account:social_accounts(username, platform)')
    .eq('video.org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Vue d'ensemble de ton activité</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="p-5">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', bg)}>
              <Icon size={20} className={color} />
            </div>
            <div className="text-2xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href="/dashboard/videos"
          className="group bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Video size={24} className="text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">Uploader une vidéo</div>
            <div className="text-sm text-muted-foreground">Drag & drop vers Cloudflare R2</div>
          </div>
        </Link>
        <Link
          href="/dashboard/accounts"
          className="group bg-blue-600/5 border border-blue-500/20 hover:bg-blue-600/10 transition-colors rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center">
            <Users size={24} className="text-blue-400" />
          </div>
          <div>
            <div className="font-medium text-foreground">Connecter un compte</div>
            <div className="text-sm text-muted-foreground">TikTok ou YouTube via OAuth</div>
          </div>
        </Link>
      </div>

      {/* Recent activity */}
      {recentJobs && recentJobs.length > 0 ? (
        <Card>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Activité récente</h2>
          </div>
          <div className="divide-y divide-border">
            {recentJobs.map((job: any) => {
              const status = getJobStatusBadge(job.status)
              const badge = <Badge className={status.className}>{status.label}</Badge>
              return (
                <div key={job.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground font-medium">{job.video?.title ?? 'Vidéo supprimée'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.account?.platform === 'tiktok' ? '🎵' : '▶️'} @{job.account?.username}
                    </p>
                  </div>
                  {job.status === 'failed' && job.error_message ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{badge}</TooltipTrigger>
                      <TooltipContent>{job.error_message}</TooltipContent>
                    </Tooltip>
                  ) : (
                    badge
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Video}
          title="Aucune publication pour le moment."
          description="Uploade une vidéo puis planifie sa publication pour la voir apparaître ici."
          action={
            <Link href="/dashboard/videos" className="text-primary text-sm hover:underline">
              Uploader ta première vidéo →
            </Link>
          }
        />
      )}
    </div>
  )
}
```

Note on the `pending`/`published` count fix: `publish_jobs` has no `org_id` column of its own (see `supabase/migrations/001_init.sql` — it only has `video_id`/`account_id`); the correct scope is "jobs whose video belongs to my org", expressed with `!inner` joins (`video:videos!inner(org_id)`) so Supabase/PostgREST performs an inner join and lets `.eq('video.org_id', orgId)` filter on it. The recent-jobs query gets the same `!inner`/`.eq('video.org_id', orgId)` filter for the same reason — it was not part of the original bug report but is the identical vulnerability (an unfiltered `publish_jobs` read), caught here because this task touches the same file end-to-end.

Switching `video:videos(...)` to `video:videos!inner(...)` changes a left join to an inner join, which would normally risk dropping rows whose `video` is missing (silently breaking the `job.video?.title ?? 'Vidéo supprimée'` fallback still present in the JSX below). This is safe here: `supabase/migrations/001_init.sql:55` defines `video_id uuid not null references videos(id) on delete cascade` — a `publish_jobs` row can never point at a missing video (deleting the video cascades to its jobs), so no row is ever excluded by the inner join. The `?? 'Vidéo supprimée'` fallback was already dead code before this change and is left as harmless defensive code, unchanged.

- [ ] **Step 2: Create `app/(dashboard)/dashboard/loading.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
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
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(dashboard)/error.tsx`**

No error boundary exists anywhere in this repo today. This one covers all three pages under `(dashboard)` (Dashboard, Accounts, Videos) since Next.js applies a route-group-level `error.tsx` to every nested route that doesn't define its own.

```tsx
'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <AlertTriangle className="text-destructive" size={40} />
      <div>
        <h2 className="text-lg font-semibold text-foreground">Une erreur est survenue</h2>
        <p className="mt-1 text-sm text-muted-foreground">Réessaie, ou reviens plus tard si le problème persiste.</p>
      </div>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, log in with two different orgs if possible (otherwise inspect the query in the Supabase SQL editor: `select pj.* from publish_jobs pj join videos v on v.id = pj.video_id where v.org_id = '<other-org-id>'` should return rows that the dashboard of a *different* org no longer counts).
Expected: stat counts and the recent-activity list only ever reflect the logged-in user's own org; a failed job's badge shows its `error_message` on hover. To check the error boundary, temporarily throw inside `DashboardPage` (e.g. `throw new Error('test')` as the first line) and confirm the "Une erreur est survenue" screen renders with a working "Réessayer" button — then remove the temporary throw before committing.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx" "app/(dashboard)/dashboard/loading.tsx" "app/(dashboard)/error.tsx"
git commit -m "fix: scope publish_jobs stats to caller's org, migrate dashboard to design tokens, add error boundary"
```

---

### Task 8: Migrate Accounts page (Card, EmptyState, Dialog confirm)

**Files:**
- Modify: `app/(dashboard)/dashboard/accounts/page.tsx`
- Modify: `components/dashboard/AccountCard.tsx`
- Create: `app/(dashboard)/dashboard/accounts/loading.tsx`

**Interfaces:**
- Consumes: `Card` (Task 3), `EmptyState` (Task 3), `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`/`DialogClose` (Task 5), `Button` (Task 3), `Skeleton` (Task 3), `getPlatformBadge` (Task 4).
- `AccountCard`'s existing `Props` (`{ account: SocialAccount }`) is unchanged, so its caller (`accounts/page.tsx`) needs no interface change, only the empty-state JSX changes.
- This is the first and only consumer of `getPlatformBadge` in this plan — it replaces `AccountCard`'s previous hardcoded platform pill (`bg-black text-white` for TikTok / `bg-red-600/20 text-red-400` for YouTube) with the shared mapping, as a small colored dot + label rather than a solid pill, consistent with the calm/neutral direction validated during design (color reserved for meaning, not decoration).

- [ ] **Step 1: Replace `components/dashboard/AccountCard.tsx`**

Replaces the native `confirm()` (jarring, inconsistent with the app's own visual language) with a `Dialog` confirmation, and migrates colors to tokens.

```tsx
'use client'

import type { SocialAccount } from '@/lib/types'
import { toast } from 'sonner'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformBadge } from '@/lib/status'
import { Card } from '@/components/ui/card'
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

interface Props { account: SocialAccount }

export default function AccountCard({ account }: Props) {
  const [removing, setRemoving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleRemove() {
    setRemoving(true)
    const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Compte déconnecté')
      window.location.reload()
    } else {
      toast.error('Erreur lors de la déconnexion')
      setRemoving(false)
      setConfirmOpen(false)
    }
  }

  const platform = getPlatformBadge(account.platform)
  const tokenExpired = account.token_expires_at
    ? new Date(account.token_expires_at) < new Date()
    : false

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {account.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar_url} alt={account.username} className="w-11 h-11 rounded-full" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-lg text-foreground">
              {account.username[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-foreground">@{account.username}</p>
            <span className={cn('flex items-center gap-1.5 text-xs', platform.className)}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {platform.label}
            </span>
          </div>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Déconnecter ce compte ?</DialogTitle>
              <DialogDescription>
                @{account.username} ne sera plus utilisé pour publier automatiquement. Cette action est réversible en reconnectant le compte.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                Déconnecter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tokenExpired && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-400">⚠️ Token expiré — reconnecte ce compte</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Connecté le {new Date(account.created_at).toLocaleDateString('fr-FR')}
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Replace `app/(dashboard)/dashboard/accounts/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import ConnectAccountButtons from '@/components/dashboard/ConnectAccountButtons'
import AccountCard from '@/components/dashboard/AccountCard'
import { EmptyState } from '@/components/ui/empty-state'
import { Plug } from 'lucide-react'
import type { SocialAccount } from '@/lib/types'

export default async function AccountsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user!.id).single()

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('org_id', userData?.org_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comptes connectés</h1>
          <p className="text-muted-foreground mt-1">Gérez vos comptes TikTok et YouTube</p>
        </div>
        <ConnectAccountButtons />
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account: SocialAccount) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Plug}
          title="Aucun compte connecté"
          description="Connecte ton premier compte TikTok ou YouTube pour commencer à publier automatiquement."
          action={<ConnectAccountButtons />}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(dashboard)/dashboard/accounts/loading.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AccountsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, go to `/dashboard/accounts`.
Expected: cards render with token colors; clicking the trash icon opens a dialog (not a native browser confirm popup) with "Annuler"/"Déconnecter" buttons; "Annuler" or the × closes it without removing the account; "Déconnecter" removes it and shows a success toast.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/accounts/page.tsx" "app/(dashboard)/dashboard/accounts/loading.tsx" components/dashboard/AccountCard.tsx
git commit -m "feat: migrate Accounts page to design tokens, replace native confirm with Dialog"
```

---

### Task 9: Migrate Videos page (Card, Badge, EmptyState, dropzone tokens)

**Files:**
- Modify: `components/dashboard/VideoCard.tsx`
- Modify: `app/(dashboard)/dashboard/videos/page.tsx`
- Modify: `components/dashboard/VideoUploader.tsx`
- Create: `app/(dashboard)/dashboard/videos/loading.tsx`

**Interfaces:**
- Consumes: `Card` (Task 3), `Badge` (Task 3), `getVideoStatusBadge` (Task 4), `EmptyState` (Task 3), `Skeleton` (Task 3).
- `VideoCard`'s existing `{ video: Video }` prop and `VideoUploader`'s no-prop signature are unchanged.

- [ ] **Step 1: Replace `components/dashboard/VideoCard.tsx`**

```tsx
import { formatBytes, formatDuration } from '@/lib/utils'
import { getVideoStatusBadge } from '@/lib/status'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Video } from '@/lib/types'

export default function VideoCard({ video }: { video: Video }) {
  const status = getVideoStatusBadge(video.status)

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted relative">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-3xl">🎬</div>
        )}
        {video.duration !== null && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {video.file_size !== null ? formatBytes(video.file_size) : '—'} · {video.format === 'short' ? 'Short' : 'Long'}
          </span>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Replace `app/(dashboard)/dashboard/videos/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import VideoUploader from '@/components/dashboard/VideoUploader'
import VideoCard from '@/components/dashboard/VideoCard'
import { EmptyState } from '@/components/ui/empty-state'
import { Clapperboard } from 'lucide-react'
import type { Video } from '@/lib/types'

export default async function VideosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user!.id).single()

  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('org_id', userData?.org_id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Vidéos</h1>
        <p className="text-muted-foreground mt-1">Upload et gère tes vidéos avant publication</p>
      </div>

      <div className="mb-8">
        <VideoUploader />
      </div>

      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video: Video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Clapperboard}
          title="Aucune vidéo pour le moment."
          description="Glisse une vidéo dans la zone ci-dessus pour l'uploader vers Cloudflare R2."
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Migrate the dropzone colors in `components/dashboard/VideoUploader.tsx`**

In the `return (...)` block, replace:

```tsx
      className={cn(
        'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
        isDragActive ? 'border-purple-500 bg-purple-500/5' : 'border-white/10 hover:border-white/20',
        uploading && 'opacity-60 cursor-not-allowed'
      )}
```

with:

```tsx
      className={cn(
        'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
        isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/20',
        uploading && 'opacity-60 cursor-not-allowed'
      )}
```

And replace both occurrences of `className="flex flex-col items-center gap-2 text-slate-400"` with `className="flex flex-col items-center gap-2 text-muted-foreground"`, and `<p className="text-xs text-slate-500">MP4 ou MOV, 500 Mo max</p>` with `<p className="text-xs text-muted-foreground/70">MP4 ou MOV, 500 Mo max</p>`. No other logic in this file changes — the upload/presign/thumbnail-capture behavior is untouched.

- [ ] **Step 4: Create `app/(dashboard)/dashboard/videos/loading.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function VideosLoading() {
  return (
    <div>
      <div className="mb-8">
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-40 rounded-xl mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify typecheck, build, and existing tests**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: typecheck and build succeed; all existing Vitest tests still pass (this task touches no test files, so the count should match Task 4's final total).

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, go to `/dashboard/videos`.
Expected: video cards render with token colors and the shared `Badge`; the dropzone's drag-active state uses the primary violet instead of a separate purple; dragging a real `.mp4` still uploads successfully (same behavior as before, only recolored).

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/VideoCard.tsx "app/(dashboard)/dashboard/videos/page.tsx" components/dashboard/VideoUploader.tsx "app/(dashboard)/dashboard/videos/loading.tsx"
git commit -m "feat: migrate Videos page to design tokens and shared Badge/EmptyState"
```
