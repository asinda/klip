const BASE = 'https://www.tiktok.com/v2/auth/authorize'
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const USER_URL = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name'

export function getTikTokAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: 'user.info.basic,video.upload,video.publish',
    response_type: 'code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state,
  })
  return `${BASE}?${params.toString()}`
}

export async function exchangeTikTokCode(code: string) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`TikTok token exchange failed: ${res.statusText}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    open_id: string
  }>
}

export async function getTikTokUserInfo(accessToken: string) {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch TikTok user info')
  const json = await res.json()
  return json.data?.user as {
    open_id: string
    display_name: string
    avatar_url: string
  }
}

export async function refreshTikTokToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error('TikTok token refresh failed')
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }>
}
