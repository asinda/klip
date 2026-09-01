const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

export interface TikTokPublishResult {
  publishId: string
}

export type TikTokPublishStatus = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED'

// TikTok requires an explicit privacy_level for every post. 'SELF_ONLY' is used
// deliberately while this app's TikTok Developer App is unaudited — TikTok
// restricts unaudited apps to private/self-only posting. This MUST be revisited
// (likely made configurable, or set to a public level) once the app is approved
// for public posting, or every "published" video will be invisible to anyone
// but the connected account's owner.
const TIKTOK_POST_PRIVACY_LEVEL = 'SELF_ONLY'

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
        privacy_level: TIKTOK_POST_PRIVACY_LEVEL,
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
