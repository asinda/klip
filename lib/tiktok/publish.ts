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
  isBrandedContent: boolean
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
        // TikTok splits branded content into paid partnership (brand_content_toggle)
        // and organic brand promotion (brand_organic_toggle). The composer asks a
        // single "Contenu de marque" yes/no, so both carry the same value.
        brand_content_toggle: options.isBrandedContent,
        brand_organic_toggle: options.isBrandedContent,
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
