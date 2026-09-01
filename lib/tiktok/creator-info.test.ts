import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTikTokCreatorInfo } from './creator-info'

describe('getTikTokCreatorInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps the TikTok response to a camelCase creator info object', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          creator_avatar_url: 'https://p.tiktok.com/avatar.jpg',
          creator_username: 'klip_demo',
          creator_nickname: 'Klip Demo',
          privacy_level_options: ['SELF_ONLY'],
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: true,
          max_video_post_duration_sec: 300,
        },
        error: { code: 'ok' },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const info = await getTikTokCreatorInfo('token-abc')

    expect(info).toEqual({
      creatorAvatarUrl: 'https://p.tiktok.com/avatar.jpg',
      creatorUsername: 'klip_demo',
      creatorNickname: 'Klip Demo',
      privacyLevelOptions: ['SELF_ONLY'],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: true,
      maxVideoPostDurationSec: 300,
    })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
  })

  it('throws with the TikTok error message when the API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'access_token_invalid', message: 'access token invalid' } }),
      })
    )

    await expect(getTikTokCreatorInfo('bad-token')).rejects.toThrow('access token invalid')
  })
})
