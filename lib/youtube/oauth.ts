const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USER_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true'

export function getYouTubeAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

export async function exchangeYouTubeCode(code: string) {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`YouTube token exchange failed: ${res.statusText}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }>
}

export async function getYouTubeChannelInfo(accessToken: string) {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch YouTube channel info')
  const json = await res.json()
  const channel = json.items?.[0]
  if (!channel) throw new Error('No YouTube channel found')
  return {
    channel_id: channel.id as string,
    title: channel.snippet.title as string,
    thumbnail: channel.snippet.thumbnails?.default?.url as string | undefined,
  }
}

export async function refreshYouTubeToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error('YouTube token refresh failed')
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}
