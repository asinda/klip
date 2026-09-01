const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

// The full set TikTok can return in privacy_level_options; used only to
// sanity-check values coming back from the client, never as a default.
export const TIKTOK_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const

export interface TikTokCreatorInfo {
  creatorAvatarUrl: string
  creatorUsername: string
  creatorNickname: string
  privacyLevelOptions: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number
}

export async function getTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetch(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })

  const json = await res.json()

  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? `TikTok creator info fetch failed with status ${res.status}`)
  }

  return {
    creatorAvatarUrl: json.data.creator_avatar_url,
    creatorUsername: json.data.creator_username,
    creatorNickname: json.data.creator_nickname,
    privacyLevelOptions: json.data.privacy_level_options,
    commentDisabled: json.data.comment_disabled,
    duetDisabled: json.data.duet_disabled,
    stitchDisabled: json.data.stitch_disabled,
    maxVideoPostDurationSec: json.data.max_video_post_duration_sec,
  }
}
