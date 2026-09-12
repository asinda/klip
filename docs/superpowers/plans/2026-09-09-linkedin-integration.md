# Intégration LinkedIn (Page Entreprise) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter LinkedIn (Page Entreprise) comme 3e plateforme de publication à côté de TikTok et YouTube — OAuth, upload vidéo par morceaux, publication, intégration dans le worker.

**Architecture:** Un module `lib/linkedin/` miroir de `lib/tiktok/`/`lib/youtube/` (oauth.ts + publish.ts), deux nouvelles routes OAuth suivant exactement le pattern déjà en place, et une nouvelle branche `platform === 'linkedin'` dans le worker existant (qui aujourd'hui ne traite que `'tiktok'`). Aucune nouvelle table : `Platform` gagne `'linkedin'`, les colonnes génériques existantes (`account_id`, `platform_post_id`) suffisent.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest (`vi.stubGlobal('fetch', ...)` — pas d'appel réseau réel dans les tests, cohérent avec ce dépôt).

**Spec:** `docs/superpowers/specs/2026-09-08-linkedin-integration-design.md`

## Global Constraints

- Rien de ce plan ne peut être vérifié de bout en bout avec de vraies credentials LinkedIn (candidature partenaire "Community Management API" en cours, pas encore d'accès). Vérification : `npx tsc --noEmit`, `npm test` (Vitest, `fetch` mocké uniquement), `npm run build`.
- Suivre exactement les conventions déjà en place : `ApiResponse<T>` pour toute route, `createServiceClient()` pour les écritures cross-session (callback OAuth), ownership toujours filtrée par `org_id`.
- La documentation LinkedIn elle-même se contredit sur la taille vidéo max (500MB vs 5GB dans la même page officielle) — aucune limite n'est donc appliquée côté Klip pour l'instant (comportement identique à TikTok, qui n'en applique pas non plus).
- Page Entreprise uniquement (`w_organization_social`) — pas de profil personnel.

---

### Task 1: Type `Platform` + variables d'environnement

**Files:**
- Modify: `lib/types.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `Platform = 'tiktok' | 'youtube' | 'linkedin'`, consommé par toutes les tâches suivantes.

- [ ] **Step 1: Étendre le type `Platform`**

Dans `lib/types.ts`, remplacer :

```ts
export type Platform = 'tiktok' | 'youtube'
```

par :

```ts
export type Platform = 'tiktok' | 'youtube' | 'linkedin'
```

- [ ] **Step 2: Ajouter les variables d'environnement LinkedIn**

Dans `.env.local.example`, ajouter après la section YouTube :

```env
# LinkedIn
LINKEDIN_CLIENT_ID=xxxx
LINKEDIN_CLIENT_SECRET=xxxx
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/auth/linkedin/callback
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur (un `Platform` élargi ne casse rien : tout le code existant utilise déjà des comparaisons `=== 'tiktok'`/`=== 'youtube'`, jamais un `switch` exhaustif qui exigerait un cas `'linkedin'`).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts .env.local.example
git commit -m "feat(linkedin): extend Platform type and document required env vars"
```

---

### Task 2: `lib/linkedin/oauth.ts`

**Files:**
- Create: `lib/linkedin/oauth.ts`
- Test: `lib/linkedin/oauth.test.ts`

**Interfaces:**
- Produces: `getLinkedInAuthUrl(state: string): string`, `exchangeLinkedInCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }>`, `getLinkedInOrgInfo(accessToken: string): Promise<{ organizationId: string; name: string; logoUrl?: string }>`, `refreshLinkedInToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }>` — consommés par Task 3 (routes OAuth).

- [ ] **Step 1: Écrire les tests**

```ts
// lib/linkedin/oauth.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLinkedInAuthUrl, exchangeLinkedInCode, getLinkedInOrgInfo, refreshLinkedInToken } from './oauth'

describe('getLinkedInAuthUrl', () => {
  it('builds the authorization URL with the requested scope and state', () => {
    process.env.LINKEDIN_CLIENT_ID = 'client-abc'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/api/auth/linkedin/callback'

    const url = getLinkedInAuthUrl('state-123')

    expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization?')
    expect(url).toContain('client_id=client-abc')
    expect(url).toContain('scope=w_organization_social')
    expect(url).toContain('state=state-123')
    expect(url).toContain(encodeURIComponent('http://localhost:3000/api/auth/linkedin/callback'))
  })
})

describe('exchangeLinkedInCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the token endpoint and returns the parsed tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-abc', expires_in: 5184000 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await exchangeLinkedInCode('auth-code-123')

    expect(result).toEqual({ access_token: 'tok-abc', expires_in: 5184000 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  })

  it('throws when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Request' }))

    await expect(exchangeLinkedInCode('bad-code')).rejects.toThrow('LinkedIn token exchange failed')
  })
})

describe('getLinkedInOrgInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the first administered organization the token grants access to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              organization: 'urn:li:organization:98765',
              'organization~': { localizedName: 'Klip Agency', logoV2: { original: 'https://media.licdn.com/logo.png' } },
            },
          ],
        }),
      })
    )

    const info = await getLinkedInOrgInfo('tok-abc')

    expect(info).toEqual({ organizationId: '98765', name: 'Klip Agency', logoUrl: 'https://media.licdn.com/logo.png' })
  })

  it('throws when no administered organization is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) }))

    await expect(getLinkedInOrgInfo('tok-abc')).rejects.toThrow('No administered LinkedIn organization found')
  })
})

describe('refreshLinkedInToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts a refresh_token grant and returns the new access token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-refreshed', expires_in: 5184000 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await refreshLinkedInToken('refresh-abc')

    expect(result).toEqual({ access_token: 'tok-refreshed', expires_in: 5184000 })
    const body = mockFetch.mock.calls[0][1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-abc')
  })

  it('throws when the refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Unauthorized' }))

    await expect(refreshLinkedInToken('bad-refresh')).rejects.toThrow('LinkedIn token refresh failed')
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/linkedin/oauth.test.ts`
Expected: FAIL — le module `./oauth` n'existe pas encore.

- [ ] **Step 3: Écrire l'implémentation**

```ts
// lib/linkedin/oauth.ts
const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
// Note (non vérifié contre la doc live — candidature partenaire pas encore obtenue) :
// endpoint pour lister les organisations qu'un membre administre, avec projection
// pour récupérer le nom/logo de l'organisation référencée dans le même appel.
// À confirmer une fois l'accès "Community Management API" obtenu.
const ORG_INFO_URL =
  'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(localizedName,logoV2)))'

export function getLinkedInAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    scope: 'w_organization_social',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeLinkedInCode(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${res.statusText}`)
  return res.json()
}

export async function getLinkedInOrgInfo(
  accessToken: string
): Promise<{ organizationId: string; name: string; logoUrl?: string }> {
  const res = await fetch(ORG_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch LinkedIn organization info')

  const json = await res.json()
  const first = json.elements?.[0]
  if (!first) throw new Error('No administered LinkedIn organization found')

  const organizationId = (first.organization as string).replace('urn:li:organization:', '')
  const orgDetails = first['organization~']

  return {
    organizationId,
    name: orgDetails.localizedName,
    logoUrl: orgDetails.logoV2?.original,
  }
}

export async function refreshLinkedInToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error('LinkedIn token refresh failed')
  return res.json()
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/linkedin/oauth.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/linkedin/oauth.ts lib/linkedin/oauth.test.ts
git commit -m "feat(linkedin): add OAuth wrapper (auth url, token exchange/refresh, org info)"
```

---

### Task 3: Routes OAuth `app/api/auth/linkedin/`

**Files:**
- Create: `app/api/auth/linkedin/route.ts`
- Create: `app/api/auth/linkedin/callback/route.ts`

**Interfaces:**
- Consomme: `getLinkedInAuthUrl`, `exchangeLinkedInCode`, `getLinkedInOrgInfo` de la Task 2.

- [ ] **Step 1: Écrire la route d'initiation**

```ts
// app/api/auth/linkedin/route.ts
import { getLinkedInAuthUrl } from '@/lib/linkedin/oauth'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!))

  const state = crypto.randomBytes(16).toString('hex')
  cookies().set('linkedin_oauth_state', state, { httpOnly: true, maxAge: 600 })

  return NextResponse.redirect(getLinkedInAuthUrl(state))
}
```

- [ ] **Step 2: Écrire la route de callback**

```ts
// app/api/auth/linkedin/callback/route.ts
import { exchangeLinkedInCode, getLinkedInOrgInfo } from '@/lib/linkedin/oauth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=linkedin_denied`)
  }

  const savedState = cookies().get('linkedin_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_state`)
  }
  cookies().delete('linkedin_oauth_state')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  try {
    const tokens = await exchangeLinkedInCode(code)
    const org = await getLinkedInOrgInfo(tokens.access_token)

    const service = createServiceClient()
    await service.from('social_accounts').upsert({
      org_id: userData?.org_id,
      platform: 'linkedin',
      account_id: org.organizationId,
      username: org.name,
      avatar_url: org.logoUrl ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
    }, { onConflict: 'org_id,platform,account_id' })

    return NextResponse.redirect(`${appUrl}/dashboard/accounts?success=linkedin`)
  } catch (err) {
    console.error('LinkedIn OAuth error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=linkedin_failed`)
  }
}
```

Note : `tokens.refresh_token` peut être `undefined` (LinkedIn ne garantit pas un refresh token sur ce produit — voir le spec) ; `?? null` couvre ce cas, cohérent avec `social_accounts.refresh_token` déjà nullable.

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur. (Pas de test unitaire pour ces routes — aucune route de ce dépôt n'en a, vérification par `tsc`/`build` uniquement, cohérent avec la convention déjà établie.)

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/linkedin/route.ts app/api/auth/linkedin/callback/route.ts
git commit -m "feat(api): add LinkedIn OAuth initiation and callback routes"
```

---

### Task 4: `lib/linkedin/publish.ts` — upload par morceaux et publication

**Files:**
- Create: `lib/linkedin/publish.ts`
- Test: `lib/linkedin/publish.test.ts`

**Interfaces:**
- Produces: `uploadVideoToLinkedIn(accessToken: string, organizationUrn: string, videoUrl: string, fileSizeBytes: number): Promise<{ videoUrn: string }>`, `createLinkedInPost(accessToken: string, organizationUrn: string, videoUrn: string, caption: string): Promise<{ postUrn: string }>` — consommés par Task 5 (worker).

- [ ] **Step 1: Écrire les tests**

```ts
// lib/linkedin/publish.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadVideoToLinkedIn, createLinkedInPost } from './publish'

describe('uploadVideoToLinkedIn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes the upload, uploads every instructed byte range, and finalizes with the collected ETags', async () => {
    const mockFetch = vi.fn()
      // 1. fetch(videoUrl) — download the source video bytes
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      })
      // 2. initializeUpload
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: {
            video: 'urn:li:video:vid123',
            uploadToken: 'token-abc',
            uploadInstructions: [
              { uploadUrl: 'https://upload.linkedin.com/part1', firstByte: 0, lastByte: 4 },
              { uploadUrl: 'https://upload.linkedin.com/part2', firstByte: 5, lastByte: 9 },
            ],
          },
        }),
      })
      // 3. PUT part 1
      .mockResolvedValueOnce({ ok: true, headers: new Map([['etag', 'etag-1']]) })
      // 4. PUT part 2
      .mockResolvedValueOnce({ ok: true, headers: new Map([['etag', 'etag-2']]) })
      // 5. finalizeUpload
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // 6. poll status -> AVAILABLE
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'AVAILABLE' }) })
    vi.stubGlobal('fetch', mockFetch)

    const result = await uploadVideoToLinkedIn(
      'token-abc',
      'urn:li:organization:98765',
      'https://r2.example/video.mp4',
      10
    )

    expect(result).toEqual({ videoUrn: 'urn:li:video:vid123' })

    const initCall = mockFetch.mock.calls[1]
    expect(initCall[0]).toBe('https://api.linkedin.com/rest/videos?action=initializeUpload')
    const initBody = JSON.parse(initCall[1].body)
    expect(initBody.initializeUploadRequest).toEqual({
      owner: 'urn:li:organization:98765',
      fileSizeBytes: 10,
    })

    const part1Call = mockFetch.mock.calls[2]
    expect(part1Call[0]).toBe('https://upload.linkedin.com/part1')
    expect(part1Call[1].method).toBe('PUT')

    const finalizeCall = mockFetch.mock.calls[4]
    expect(finalizeCall[0]).toBe('https://api.linkedin.com/rest/videos?action=finalizeUpload')
    const finalizeBody = JSON.parse(finalizeCall[1].body)
    expect(finalizeBody.finalizeUploadRequest).toEqual({
      video: 'urn:li:video:vid123',
      uploadToken: 'token-abc',
      uploadedPartIds: ['etag-1', 'etag-2'],
    })
  })

  it('throws when the video processing fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: { video: 'urn:li:video:vid123', uploadToken: 'token-abc', uploadInstructions: [] },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'PROCESSING_FAILED' }) })
    vi.stubGlobal('fetch', mockFetch)

    await expect(
      uploadVideoToLinkedIn('token', 'urn:li:organization:1', 'https://r2.example/v.mp4', 10)
    ).rejects.toThrow('LinkedIn video processing failed')
  })
})

describe('createLinkedInPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a post referencing the uploaded video and returns the post urn', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['x-restli-id', 'urn:li:share:999']]),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await createLinkedInPost(
      'token-abc',
      'urn:li:organization:98765',
      'urn:li:video:vid123',
      'My caption'
    )

    expect(result).toEqual({ postUrn: 'urn:li:share:999' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.linkedin.com/rest/posts')
    const body = JSON.parse(init.body)
    expect(body.author).toBe('urn:li:organization:98765')
    expect(body.commentary).toBe('My caption')
    expect(body.content.media.id).toBe('urn:li:video:vid123')
  })

  it('throws when post creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, statusText: 'Unprocessable Entity' }))

    await expect(
      createLinkedInPost('token', 'urn:li:organization:1', 'urn:li:video:1', 'caption')
    ).rejects.toThrow('LinkedIn post creation failed')
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/linkedin/publish.test.ts`
Expected: FAIL — le module `./publish` n'existe pas encore.

- [ ] **Step 3: Écrire l'implémentation**

```ts
// lib/linkedin/publish.ts
const API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_VERSION = '202601'

const POLL_INTERVAL_MS = 5000
const MAX_POLL_ATTEMPTS = 24 // ~2 minutes, même borne que le poll TikTok existant

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Linkedin-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

interface UploadInstruction {
  uploadUrl: string
  firstByte: number
  lastByte: number
}

export async function uploadVideoToLinkedIn(
  accessToken: string,
  organizationUrn: string,
  videoUrl: string,
  fileSizeBytes: number
): Promise<{ videoUrn: string }> {
  const sourceRes = await fetch(videoUrl)
  if (!sourceRes.ok) throw new Error(`Failed to download source video from ${videoUrl}`)
  const videoBytes = new Uint8Array(await sourceRes.arrayBuffer())

  const initRes = await fetch(`${API_BASE}/videos?action=initializeUpload`, {
    method: 'POST',
    headers: { ...linkedInHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initializeUploadRequest: { owner: organizationUrn, fileSizeBytes },
    }),
  })
  if (!initRes.ok) throw new Error(`LinkedIn upload initialization failed: ${initRes.statusText}`)
  const initJson = await initRes.json()
  const videoUrn: string = initJson.value.video
  const uploadToken: string = initJson.value.uploadToken
  const instructions: UploadInstruction[] = initJson.value.uploadInstructions

  const uploadedPartIds: string[] = []
  for (const instruction of instructions) {
    const chunk = videoBytes.slice(instruction.firstByte, instruction.lastByte + 1)
    const partRes = await fetch(instruction.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk,
    })
    if (!partRes.ok) throw new Error(`LinkedIn chunk upload failed for range ${instruction.firstByte}-${instruction.lastByte}`)
    const etag = partRes.headers.get('etag')
    if (!etag) throw new Error(`LinkedIn chunk upload did not return an ETag for range ${instruction.firstByte}-${instruction.lastByte}`)
    uploadedPartIds.push(etag)
  }

  const finalizeRes = await fetch(`${API_BASE}/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: { ...linkedInHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds },
    }),
  })
  if (!finalizeRes.ok) throw new Error(`LinkedIn upload finalization failed: ${finalizeRes.statusText}`)

  let status = 'WAITING_UPLOAD'
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    const statusRes = await fetch(`${API_BASE}/videos/${encodeURIComponent(videoUrn)}`, {
      headers: linkedInHeaders(accessToken),
    })
    if (!statusRes.ok) throw new Error(`Failed to poll LinkedIn video status: ${statusRes.statusText}`)
    const statusJson = await statusRes.json()
    status = statusJson.status
    if (status === 'AVAILABLE' || status === 'PROCESSING_FAILED') break
  }

  if (status !== 'AVAILABLE') {
    throw new Error(`LinkedIn video processing failed (last status: ${status})`)
  }

  return { videoUrn }
}

export async function createLinkedInPost(
  accessToken: string,
  organizationUrn: string,
  videoUrn: string,
  caption: string
): Promise<{ postUrn: string }> {
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: { ...linkedInHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: organizationUrn,
      commentary: caption,
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
      content: { media: { id: videoUrn } },
    }),
  })

  if (!res.ok) throw new Error(`LinkedIn post creation failed with status ${res.status}`)
  const postUrn = res.headers.get('x-restli-id')
  if (!postUrn) throw new Error('LinkedIn post creation did not return a post id')

  return { postUrn }
}
```

Note : dans le test, `initJson.value.uploadInstructions` fixe deux plages non chevauchantes de 5 octets sur un buffer de 10 — cohérent avec le découpage en plages fourni par LinkedIn (`uploadInstructions`), jamais calculé côté Klip.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/linkedin/publish.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/linkedin/publish.ts lib/linkedin/publish.test.ts
git commit -m "feat(linkedin): add chunked video upload and post creation"
```

---

### Task 5: Intégration dans le worker

**Files:**
- Modify: `services/publisher/worker.ts`

**Interfaces:**
- Consomme: `uploadVideoToLinkedIn`, `createLinkedInPost` de la Task 4 ; `refreshLinkedInToken` de la Task 2.

- [ ] **Step 1: Remplacer le early-return par un branchement à 3 voies**

Dans `services/publisher/worker.ts`, remplacer :

```ts
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

    const { publishId } = await uploadVideoToTikTok(accessToken, publishJob.video.r2_url, publishJob.video.title, {
      privacyLevel: publishJob.tiktok_privacy_level,
      disableDuet: publishJob.tiktok_disable_duet,
      disableStitch: publishJob.tiktok_disable_stitch,
      disableComment: publishJob.tiktok_disable_comment,
      isBrandedContent: publishJob.tiktok_branded_content,
    })

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
```

par :

```ts
  if (publishJob.account.platform !== 'tiktok' && publishJob.account.platform !== 'linkedin') {
    console.log(`[worker] skipping job ${publishJobId} (platform: ${publishJob.account.platform} not yet supported by the worker)`)
    return
  }

  await supabase.from('publish_jobs').update({ status: 'processing' }).eq('id', publishJobId)

  try {
    let accessToken: string = publishJob.account.access_token
    const tokenExpired = publishJob.account.token_expires_at
      ? new Date(publishJob.account.token_expires_at) < new Date()
      : false

    if (tokenExpired && publishJob.account.refresh_token) {
      if (publishJob.account.platform === 'tiktok') {
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
      } else {
        const refreshed = await refreshLinkedInToken(publishJob.account.refresh_token)
        accessToken = refreshed.access_token
        await supabase
          .from('social_accounts')
          .update({
            access_token: refreshed.access_token,
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq('id', publishJob.account_id)
      }
    }

    let platformPostId: string

    if (publishJob.account.platform === 'tiktok') {
      const { publishId } = await uploadVideoToTikTok(accessToken, publishJob.video.r2_url, publishJob.video.title, {
        privacyLevel: publishJob.tiktok_privacy_level,
        disableDuet: publishJob.tiktok_disable_duet,
        disableStitch: publishJob.tiktok_disable_stitch,
        disableComment: publishJob.tiktok_disable_comment,
        isBrandedContent: publishJob.tiktok_branded_content,
      })

      let finalStatus = 'PROCESSING_UPLOAD'
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        finalStatus = await getTikTokPublishStatus(accessToken, publishId)
        if (finalStatus === 'PUBLISH_COMPLETE' || finalStatus === 'FAILED') break
      }

      if (finalStatus !== 'PUBLISH_COMPLETE') {
        throw new Error(`TikTok publish did not complete in time (last status: ${finalStatus})`)
      }

      platformPostId = publishId
    } else {
      if (publishJob.video.file_size == null) {
        throw new Error('Cannot publish to LinkedIn: video file_size is unknown')
      }
      const organizationUrn = `urn:li:organization:${publishJob.account.account_id}`
      const { videoUrn } = await uploadVideoToLinkedIn(
        accessToken,
        organizationUrn,
        publishJob.video.r2_url,
        publishJob.video.file_size
      )
      const { postUrn } = await createLinkedInPost(accessToken, organizationUrn, videoUrn, publishJob.video.title)
      platformPostId = postUrn
    }

    await supabase
      .from('publish_jobs')
      .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
      .eq('id', publishJobId)
    await supabase.from('videos').update({ status: 'published' }).eq('id', publishJob.video.id)
  } catch (err) {
```

- [ ] **Step 2: Ajouter les nouveaux imports**

En haut de `services/publisher/worker.ts`, ajouter aux imports existants :

```ts
import { refreshLinkedInToken } from '../../lib/linkedin/oauth'
import { uploadVideoToLinkedIn, createLinkedInPost } from '../../lib/linkedin/publish'
```

- [ ] **Step 3: Étendre la requête Supabase pour inclure `file_size`**

La requête `select` en haut de `processJob` sélectionne déjà `video:videos(id, r2_url, title)` — l'étendre pour inclure `file_size` :

```ts
    .select(
      '*, video:videos(id, r2_url, title, file_size), account:social_accounts(access_token, refresh_token, token_expires_at, platform, account_id)'
    )
```

Note : `account_id` est ajouté ici car la branche LinkedIn en a besoin pour construire l'URN d'organisation (`publishJob.account.account_id`), alors que la branche TikTok ne le lisait pas jusqu'ici.

- [ ] **Step 4: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier que le build réussit**

Run: `npm run build`
Expected: succès.

- [ ] **Step 6: Commit**

```bash
git add services/publisher/worker.ts
git commit -m "feat(worker): add LinkedIn publish path alongside TikTok"
```

---

### Task 6: Bouton de connexion LinkedIn

**Files:**
- Modify: `components/dashboard/ConnectAccountButtons.tsx`

- [ ] **Step 1: Ajouter le bouton et l'icône LinkedIn**

Dans `components/dashboard/ConnectAccountButtons.tsx`, ajouter après le bouton YouTube :

```tsx
      <a
        href="/api/auth/linkedin"
        className="flex items-center gap-2 bg-[#0A66C2] hover:bg-[#004182] transition-colors px-4 py-2.5 rounded-lg text-sm font-medium text-white"
      >
        <LinkedInIcon />
        Connecter LinkedIn
      </a>
```

Et ajouter la fonction d'icône, après `YouTubeIcon`:

```tsx
function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Vérifier que le build réussit**

Run: `npm run build`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/ConnectAccountButtons.tsx
git commit -m "feat(ui): add LinkedIn connect button"
```
