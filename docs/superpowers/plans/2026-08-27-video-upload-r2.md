# Video Upload to Cloudflare R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in Klip user drag & drop a video file, have it uploaded straight to Cloudflare R2 with an auto-captured thumbnail, and see it appear in a `/dashboard/videos` list backed by the `videos` table.

**Architecture:** Client uploads directly to R2 using short-lived presigned PUT URLs (server never proxies the file bytes). A pure `lib/storage/r2.ts` module owns key generation, validation, and presigning. Two API routes bridge client and server: `POST /api/videos/presign` (mint a presigned URL) and `POST /api/videos` (write the DB row once the PUT succeeds). The videos page itself queries Supabase directly server-side, matching the existing `/dashboard/accounts` page pattern.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/ssr`), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (already installed), `react-dropzone` (already installed), `sonner` for toasts (already installed), Vitest (new, for unit-testing pure logic).

**Spec:** `saas/klip/CLAUDE.md` (Phase 1 checklist: "Upload vidéo drag & drop → Cloudflare R2") and the Sprint 1 scope agreed with the user in conversation.

## Global Constraints

- TypeScript, Next.js 14 App Router — follow existing file/route conventions under `saas/klip/app`.
- API responses always use `ApiResponse<T> = { data: T | null; error: string | null }` from `lib/types.ts` (see `app/api/accounts/[id]/route.ts` for the existing pattern).
- No silent `try/catch` — errors are always surfaced in the response or thrown.
- Every query against `videos`, `social_accounts`, etc. must filter by the caller's `org_id` (multi-tenant rule).
- `videos` table schema is fixed by `supabase/migrations/001_init.sql`: `org_id, title, r2_key, r2_url, thumbnail_url, duration, file_size, format ('short'|'long'), status ('uploaded'|'scheduled'|'published'|'failed'), created_at`. No migration changes in this plan.
- Sprint decision (not in an existing spec, chosen for MVP scope): max video size 500 MB, allowed video types `video/mp4` and `video/quicktime` (.mov), max thumbnail size 5 MB, allowed thumbnail types `image/jpeg`, `image/png`, `image/webp`. Format cutoff: duration ≥ 180s → `long`, else `short`.
- R2 env vars already declared in `.env.local.example`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
- No test framework exists in this codebase today. This plan adds a minimal Vitest setup and unit-tests only pure, DOM-free logic (key/URL/validation helpers). API routes and the drag-and-drop UI have no automated tests yet (consistent with the rest of the codebase) — each of those tasks instead has a documented manual verification step.

---

### Task 1: Remove empty leftover `apps/` and `packages/` directories

**Files:**
- Delete: `apps/web/`, `apps/api/`, `packages/shared/` (all empty, confirmed via directory listing)

**Interfaces:** None — this task has no code dependencies and nothing depends on it.

- [ ] **Step 1: Verify the directories are empty**

Run: `find apps packages -type f` (from `saas/klip/`)
Expected: no output (no files under either directory)

- [ ] **Step 2: Delete the directories**

Run: `rm -rf apps packages` (from `saas/klip/`)

- [ ] **Step 3: Confirm they're gone and nothing else broke**

Run: `git status` (from `saas/klip/`) and confirm only `apps/` and `packages/` show as removed/untracked-removed, then `npm run build` if you want an extra safety check (optional — nothing in the app imports from these paths).

- [ ] **Step 4: Commit**

```bash
git add apps packages
git commit -m "chore: remove empty leftover apps/ and packages/ scaffolding"
```

---

### Task 2: Add minimal Vitest setup

**Files:**
- Modify: `package.json` (add `vitest` devDependency and `test` script)
- Create: `vitest.config.ts`
- Create: `lib/utils.test.ts` (smoke test against the existing `formatBytes` helper)

**Interfaces:**
- Consumes: `formatBytes` from `lib/utils.ts` (already exists, signature `formatBytes(bytes: number): string`)
- Produces: a working `npm test` command that later tasks' test files rely on

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest` (from `saas/klip/`)

- [ ] **Step 2: Add the test script**

Edit `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create the Vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
})
```

- [ ] **Step 4: Write a smoke test against an existing function**

```typescript
// lib/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatBytes } from './utils'

describe('formatBytes', () => {
  it('formats bytes under 1KB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test` (from `saas/klip/`)
Expected: PASS — 3 tests passing. This confirms the runner is wired correctly before any new feature code is written.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/utils.test.ts
git commit -m "test: add minimal Vitest setup"
```

---

### Task 3: Pure video helpers (`lib/video.ts`)

**Files:**
- Create: `lib/video.ts`
- Test: `lib/video.test.ts`

**Interfaces:**
- Consumes: `VideoFormat` type from `lib/types.ts` (`'short' | 'long'`)
- Produces: `deriveFormat(durationSeconds: number): VideoFormat` and `deriveTitleFromFilename(filename: string): string`, both used by the upload UI in Task 7.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/video.test.ts
import { describe, it, expect } from 'vitest'
import { deriveFormat, deriveTitleFromFilename } from './video'

describe('deriveFormat', () => {
  it('returns short for durations under 3 minutes', () => {
    expect(deriveFormat(179)).toBe('short')
  })

  it('returns long at exactly 3 minutes', () => {
    expect(deriveFormat(180)).toBe('long')
  })

  it('returns long for durations over 3 minutes', () => {
    expect(deriveFormat(600)).toBe('long')
  })
})

describe('deriveTitleFromFilename', () => {
  it('strips the extension', () => {
    expect(deriveTitleFromFilename('summer-recap.mp4')).toBe('summer-recap')
  })

  it('keeps dots in the middle of the name', () => {
    expect(deriveTitleFromFilename('v1.2.final.mov')).toBe('v1.2.final')
  })

  it('returns the filename unchanged when there is no extension', () => {
    expect(deriveTitleFromFilename('noext')).toBe('noext')
  })

  it('does not treat a leading dot as an extension separator', () => {
    expect(deriveTitleFromFilename('.gitignore')).toBe('.gitignore')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/video.test.ts`
Expected: FAIL with "Cannot find module './video'"

- [ ] **Step 3: Implement `lib/video.ts`**

```typescript
// lib/video.ts
import type { VideoFormat } from './types'

const LONG_FORMAT_THRESHOLD_SECONDS = 180

export function deriveFormat(durationSeconds: number): VideoFormat {
  return durationSeconds >= LONG_FORMAT_THRESHOLD_SECONDS ? 'long' : 'short'
}

export function deriveTitleFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0) return filename
  return filename.slice(0, lastDot)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/video.test.ts`
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/video.ts lib/video.test.ts
git commit -m "feat: add pure video format/title helpers"
```

---

### Task 4: R2 storage module (`lib/storage/r2.ts`)

**Files:**
- Create: `lib/storage/r2.ts`
- Test: `lib/storage/r2.test.ts`

**Interfaces:**
- Consumes: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` env vars (already in `.env.local.example`)
- Produces (used by Task 5's presign route):
  - `isAllowedFileType(contentType: string, kind: 'video' | 'thumbnail'): boolean`
  - `isAllowedFileSize(bytes: number, kind: 'video' | 'thumbnail'): boolean`
  - `generateR2Key(orgId: string, kind: 'video' | 'thumbnail', filename: string): string`
  - `buildPublicUrl(key: string): string`
  - `getPresignedUploadUrl(key: string, contentType: string): Promise<string>` (not unit-tested — see Step 6)

- [ ] **Step 1: Write the failing tests for the pure helpers**

```typescript
// lib/storage/r2.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isAllowedFileType, isAllowedFileSize, generateR2Key, buildPublicUrl } from './r2'

describe('isAllowedFileType', () => {
  it('accepts mp4 for video', () => {
    expect(isAllowedFileType('video/mp4', 'video')).toBe(true)
  })

  it('rejects an image for video', () => {
    expect(isAllowedFileType('image/png', 'video')).toBe(false)
  })

  it('accepts jpeg for thumbnail', () => {
    expect(isAllowedFileType('image/jpeg', 'thumbnail')).toBe(true)
  })

  it('rejects a video type for thumbnail', () => {
    expect(isAllowedFileType('video/mp4', 'thumbnail')).toBe(false)
  })
})

describe('isAllowedFileSize', () => {
  it('accepts a video under 500MB', () => {
    expect(isAllowedFileSize(100 * 1024 * 1024, 'video')).toBe(true)
  })

  it('rejects a video over 500MB', () => {
    expect(isAllowedFileSize(600 * 1024 * 1024, 'video')).toBe(false)
  })

  it('rejects a zero-byte file', () => {
    expect(isAllowedFileSize(0, 'video')).toBe(false)
  })

  it('rejects a thumbnail over 5MB', () => {
    expect(isAllowedFileSize(6 * 1024 * 1024, 'thumbnail')).toBe(false)
  })
})

describe('generateR2Key', () => {
  it('embeds org id, kind, and lowercased extension', () => {
    const key = generateR2Key('org-123', 'video', 'My Clip.MP4')
    expect(key).toMatch(/^org-123\/videos\/[0-9a-f-]{36}\.mp4$/)
  })

  it('defaults to a bin extension when the filename has none', () => {
    const key = generateR2Key('org-123', 'thumbnail', 'noext')
    expect(key).toMatch(/^org-123\/thumbnails\/[0-9a-f-]{36}\.bin$/)
  })
})

describe('buildPublicUrl', () => {
  beforeEach(() => {
    process.env.R2_PUBLIC_URL = 'https://pub-test.r2.dev/'
  })

  afterEach(() => {
    delete process.env.R2_PUBLIC_URL
  })

  it('joins the base url and key without a double slash', () => {
    expect(buildPublicUrl('org-1/videos/abc.mp4')).toBe('https://pub-test.r2.dev/org-1/videos/abc.mp4')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/storage/r2.test.ts`
Expected: FAIL with "Cannot find module './r2'"

- [ ] **Step 3: Implement `lib/storage/r2.ts`**

```typescript
// lib/storage/r2.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type UploadKind = 'video' | 'thumbnail'

export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024
export const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime']
export const ALLOWED_THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function isAllowedFileType(contentType: string, kind: UploadKind): boolean {
  const allowed = kind === 'video' ? ALLOWED_VIDEO_TYPES : ALLOWED_THUMBNAIL_TYPES
  return allowed.includes(contentType)
}

export function isAllowedFileSize(bytes: number, kind: UploadKind): boolean {
  const max = kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_THUMBNAIL_SIZE_BYTES
  return bytes > 0 && bytes <= max
}

export function generateR2Key(orgId: string, kind: UploadKind, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
  const hasExt = filename.includes('.')
  const id = crypto.randomUUID()
  return `${orgId}/${kind}s/${id}.${hasExt ? ext : 'bin'}`
}

export function buildPublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
  return `${base}/${key}`
}

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(client, command, { expiresIn: 600 })
}
```

Note: `generateR2Key('org-123', 'thumbnail', 'noext')` must produce `.bin` even though `'noext'.split('.').pop()` returns `'noext'` — the `hasExt` check handles that; verify Step 4 catches this if it doesn't.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/storage/r2.test.ts`
Expected: PASS — 11 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/storage/r2.ts lib/storage/r2.test.ts
git commit -m "feat: add R2 storage helpers with validation and key generation"
```

- [ ] **Step 6: Manual verification of `getPresignedUploadUrl` (not unit-tested — needs live R2 credentials)**

This function isn't covered by an automated test because it calls the AWS SDK over the network; it's exercised end-to-end in Task 9's manual verification instead. No action needed here beyond noting it — do not skip Task 9.

---

### Task 5: `POST /api/videos/presign` route

**Files:**
- Create: `app/api/videos/presign/route.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`; `isAllowedFileType`, `isAllowedFileSize`, `generateR2Key`, `buildPublicUrl`, `getPresignedUploadUrl` from `lib/storage/r2.ts`; `ApiResponse` from `lib/types.ts`
- Produces: `POST` handler returning `ApiResponse<{ uploadUrl: string; key: string; publicUrl: string }>`, consumed by the client uploader in Task 7

- [ ] **Step 1: Implement the route**

```typescript
// app/api/videos/presign/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateR2Key,
  buildPublicUrl,
  getPresignedUploadUrl,
  isAllowedFileType,
  isAllowedFileSize,
  type UploadKind,
} from '@/lib/storage/r2'
import type { ApiResponse } from '@/lib/types'

interface PresignBody {
  filename: string
  contentType: string
  fileSize: number
  kind: UploadKind
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Non autorisé' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  if (!userData?.org_id) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const body: PresignBody = await request.json()

  if (body.kind !== 'video' && body.kind !== 'thumbnail') {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Type de fichier invalide' }, { status: 400 })
  }

  if (!isAllowedFileType(body.contentType, body.kind)) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Format de fichier non supporté' }, { status: 400 })
  }

  if (!isAllowedFileSize(body.fileSize, body.kind)) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Fichier trop volumineux' }, { status: 400 })
  }

  const key = generateR2Key(userData.org_id, body.kind, body.filename)
  const uploadUrl = await getPresignedUploadUrl(key, body.contentType)
  const publicUrl = buildPublicUrl(key)

  return NextResponse.json<ApiResponse<{ uploadUrl: string; key: string; publicUrl: string }>>({
    data: { uploadUrl, key, publicUrl },
    error: null,
  })
}
```

- [ ] **Step 2: Manual verification (no automated test — matches the existing untested API route pattern in this codebase)**

With the dev server running (`npm run dev`) and a real Supabase session cookie (log in via the browser first), run from the browser console on `/dashboard`:

```javascript
fetch('/api/videos/presign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filename: 'test.mp4', contentType: 'video/mp4', fileSize: 1024, kind: 'video' }),
}).then(r => r.json()).then(console.log)
```

Expected: `{ data: { uploadUrl: "https://...r2.cloudflarestorage.com/...", key: "<org-id>/videos/<uuid>.mp4", publicUrl: "https://pub-.../<org-id>/videos/<uuid>.mp4" }, error: null }`. Requires real `R2_*` values in `.env.local` — if they're still placeholders, expect an AWS SDK error instead, which just confirms the route is wired but credentials aren't set yet.

- [ ] **Step 3: Commit**

```bash
git add app/api/videos/presign/route.ts
git commit -m "feat: add presigned upload URL endpoint"
```

---

### Task 6: `POST /api/videos` route (create DB row)

**Files:**
- Create: `app/api/videos/route.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`; `ApiResponse`, `Video`, `VideoFormat` from `lib/types.ts`
- Produces: `POST` handler returning `ApiResponse<Video>`, consumed by the client uploader in Task 7

- [ ] **Step 1: Implement the route**

```typescript
// app/api/videos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse, Video, VideoFormat } from '@/lib/types'

interface CreateVideoBody {
  title: string
  r2_key: string
  r2_url: string
  thumbnail_url: string | null
  file_size: number
  duration: number
  format: VideoFormat
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Non autorisé' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  if (!userData?.org_id) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const body: CreateVideoBody = await request.json()

  if (!body.title || !body.r2_key || !body.r2_url) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Données manquantes' }, { status: 400 })
  }

  const { data: video, error } = await supabase
    .from('videos')
    .insert({
      org_id: userData.org_id,
      title: body.title,
      r2_key: body.r2_key,
      r2_url: body.r2_url,
      thumbnail_url: body.thumbnail_url,
      file_size: body.file_size,
      duration: body.duration,
      format: body.format,
      status: 'uploaded',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json<ApiResponse<Video>>({ data: video, error: null })
}
```

- [ ] **Step 2: Manual verification**

From the browser console on `/dashboard` (same session as Task 5):

```javascript
fetch('/api/videos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Test video', r2_key: 'test/key.mp4', r2_url: 'https://example.com/test.mp4',
    thumbnail_url: null, file_size: 1024, duration: 42, format: 'short',
  }),
}).then(r => r.json()).then(console.log)
```

Expected: `{ data: { id: "...", org_id: "...", title: "Test video", ..., status: "uploaded" }, error: null }`. Then check the Supabase table editor to confirm the row exists with the correct `org_id`, and delete the test row afterward.

- [ ] **Step 3: Commit**

```bash
git add app/api/videos/route.ts
git commit -m "feat: add endpoint to persist an uploaded video"
```

---

### Task 7: `VideoUploader` client component (drag & drop + thumbnail capture)

**Files:**
- Create: `components/dashboard/VideoUploader.tsx`

**Interfaces:**
- Consumes: `useDropzone` from `react-dropzone`; `toast` from `sonner`; `cn` from `lib/utils.ts`; `deriveFormat`, `deriveTitleFromFilename` from `lib/video.ts`; `ApiResponse`, `Video` from `lib/types.ts`; the two routes from Tasks 5 and 6 (`POST /api/videos/presign`, `POST /api/videos`)
- Produces: a `<VideoUploader />` component with no props, used by the page in Task 9. Calls `router.refresh()` on success so the server-rendered video list picks up the new row.

- [ ] **Step 1: Implement the component**

```tsx
// components/dashboard/VideoUploader.tsx
'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UploadCloud, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deriveFormat, deriveTitleFromFilename } from '@/lib/video'
import type { ApiResponse, Video } from '@/lib/types'

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024

interface PresignResult {
  uploadUrl: string
  key: string
  publicUrl: string
}

function captureThumbnail(file: File): Promise<{ blob: Blob; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = URL.createObjectURL(file)
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2)
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas non supporté'))
        return
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const duration = Math.round(video.duration)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(video.src)
        if (blob) resolve({ blob, duration })
        else reject(new Error('Échec de la capture de la miniature'))
      }, 'image/jpeg', 0.8)
    }
    video.onerror = () => reject(new Error('Impossible de lire la vidéo'))
  })
}

async function presignAndUpload(
  file: File | Blob,
  filename: string,
  contentType: string,
  kind: 'video' | 'thumbnail'
): Promise<PresignResult> {
  const presignRes = await fetch('/api/videos/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, fileSize: file.size, kind }),
  })
  const presignJson: ApiResponse<PresignResult> = await presignRes.json()
  if (presignJson.error || !presignJson.data) {
    throw new Error(presignJson.error ?? "Échec de la préparation de l'upload")
  }

  const putRes = await fetch(presignJson.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!putRes.ok) {
    throw new Error("Échec de l'envoi du fichier")
  }

  return presignJson.data
}

export default function VideoUploader() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error('Vidéo trop volumineuse (max 500 Mo)')
      return
    }

    setUploading(true)
    try {
      const { blob: thumbnailBlob, duration } = await captureThumbnail(file)

      const videoUpload = await presignAndUpload(file, file.name, file.type || 'video/mp4', 'video')
      const thumbnailUpload = await presignAndUpload(
        thumbnailBlob,
        `${file.name}.jpg`,
        'image/jpeg',
        'thumbnail'
      )

      const createRes = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: deriveTitleFromFilename(file.name),
          r2_key: videoUpload.key,
          r2_url: videoUpload.publicUrl,
          thumbnail_url: thumbnailUpload.publicUrl,
          file_size: file.size,
          duration,
          format: deriveFormat(duration),
        }),
      })
      const createJson: ApiResponse<Video> = await createRes.json()
      if (createJson.error) {
        throw new Error(createJson.error)
      }

      toast.success('Vidéo uploadée avec succès')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'upload")
    } finally {
      setUploading(false)
    }
  }, [router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'] },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
        isDragActive ? 'border-purple-500 bg-purple-500/5' : 'border-white/10 hover:border-white/20',
        uploading && 'opacity-60 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Upload en cours...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <UploadCloud size={28} />
          <p className="text-sm">Glisse une vidéo ici ou clique pour choisir un fichier</p>
          <p className="text-xs text-slate-500">MP4 ou MOV, 500 Mo max</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, log in, go to `/dashboard/videos` once Task 9 wires this component in (or temporarily drop `<VideoUploader />` into any dashboard page to test it in isolation now). Drag a small real `.mp4` file onto it. Expected: spinner shows, then a success toast, and a new row appears in the Supabase `videos` table with a populated `thumbnail_url` and `r2_url` that resolves in a browser tab (requires real R2 credentials in `.env.local` and a public bucket/`R2_PUBLIC_URL`).

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/VideoUploader.tsx
git commit -m "feat: add drag-and-drop video uploader with thumbnail capture"
```

---

### Task 8: `VideoCard` presentational component

**Files:**
- Create: `components/dashboard/VideoCard.tsx`

**Interfaces:**
- Consumes: `Video` type from `lib/types.ts`; `formatBytes`, `formatDuration` from `lib/utils.ts`
- Produces: `<VideoCard video={video} />`, used by the page in Task 9

- [ ] **Step 1: Implement the component**

```tsx
// components/dashboard/VideoCard.tsx
import { formatBytes, formatDuration } from '@/lib/utils'
import type { Video } from '@/lib/types'

const STATUS_LABELS: Record<Video['status'], { label: string; class: string }> = {
  uploaded: { label: 'Uploadée', class: 'bg-slate-500/10 text-slate-400' },
  scheduled: { label: 'Planifiée', class: 'bg-amber-500/10 text-amber-400' },
  published: { label: 'Publiée', class: 'bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Échouée', class: 'bg-red-500/10 text-red-400' },
}

export default function VideoCard({ video }: { video: Video }) {
  const status = STATUS_LABELS[video.status]

  return (
    <div className="bg-slate-900 border border-white/5 rounded-xl overflow-hidden">
      <div className="aspect-video bg-slate-800 relative">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-3xl">🎬</div>
        )}
        {video.duration !== null && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-medium text-white truncate">{video.title}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">
            {video.file_size !== null ? formatBytes(video.file_size) : '—'} · {video.format === 'short' ? 'Short' : 'Long'}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.class}`}>
            {status.label}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification**

Deferred to Task 9's manual verification — this component has no standalone entry point.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/VideoCard.tsx
git commit -m "feat: add video card component"
```

---

### Task 9: `/dashboard/videos` page

**Files:**
- Create: `app/(dashboard)/dashboard/videos/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`; `VideoUploader` from Task 7; `VideoCard` from Task 8; `Video` type from `lib/types.ts`
- Produces: the page Sidebar already links to at `/dashboard/videos` (see `components/dashboard/Sidebar.tsx:21`)

- [ ] **Step 1: Implement the page**

```tsx
// app/(dashboard)/dashboard/videos/page.tsx
import { createClient } from '@/lib/supabase/server'
import VideoUploader from '@/components/dashboard/VideoUploader'
import VideoCard from '@/components/dashboard/VideoCard'
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
        <h1 className="text-2xl font-bold text-white">Vidéos</h1>
        <p className="text-slate-400 mt-1">Upload et gère tes vidéos avant publication</p>
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
        <div className="bg-slate-900 border border-dashed border-white/10 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🎬</div>
          <p className="text-slate-400">Aucune vidéo pour le moment.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manual verification (full end-to-end check)**

1. Fill real `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` in `.env.local` (create a `klip-videos` bucket in the Cloudflare dashboard first if it doesn't exist, and enable public access or an `r2.dev` subdomain for `R2_PUBLIC_URL` to resolve).
2. Run `npm run dev`, log in, click "Vidéos" in the sidebar.
3. Drag a real short `.mp4` onto the dropzone.
4. Expected: upload spinner → success toast → the page refreshes and the new video card appears with a real thumbnail, correct duration badge, correct file size, and a "Short"/"Long" label matching its length.
5. Open the video's `r2_url` and the thumbnail's URL directly in a browser tab — both should load.
6. Refresh the page (hard reload) — the video must still be listed (confirms it was persisted, not just held in client state).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/videos/page.tsx"
git commit -m "feat: add videos dashboard page"
```

---

### Task 10: Update the Phase 1 checklist

**Files:**
- Modify: `CLAUDE.md` (repo-level `saas/klip/CLAUDE.md`, Phase 1 checklist)

**Interfaces:** None.

- [ ] **Step 1: Check off the completed item**

In `saas/klip/CLAUDE.md`, under "Phase 1 — MVP vendable", change:

```markdown
- [ ] Upload vidéo drag & drop → Cloudflare R2
```

to:

```markdown
- [x] Upload vidéo drag & drop → Cloudflare R2
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: check off video upload in Phase 1 checklist"
```
