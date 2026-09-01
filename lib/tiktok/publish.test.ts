import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadVideoToTikTok, getTikTokPublishStatus } from './publish'

const OPTIONS = {
  privacyLevel: 'SELF_ONLY',
  disableDuet: true,
  disableStitch: true,
  disableComment: true,
  isBrandedContent: false,
}

describe('uploadVideoToTikTok', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends PULL_FROM_URL source info and the given post options, returns the publish id on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_123' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await uploadVideoToTikTok('token-abc', 'https://r2.example/video.mp4', 'My caption', OPTIONS)

    expect(result).toEqual({ publishId: 'pub_123' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
    const body = JSON.parse(init.body)
    expect(body.source_info).toEqual({ source: 'PULL_FROM_URL', video_url: 'https://r2.example/video.mp4' })
    expect(body.post_info.title).toBe('My caption')
    expect(body.post_info.privacy_level).toBe('SELF_ONLY')
    expect(body.post_info.disable_duet).toBe(true)
    expect(body.post_info.disable_stitch).toBe(true)
    expect(body.post_info.disable_comment).toBe(true)
  })

  it('passes through a caller-chosen non-default option (e.g. duet allowed)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_456' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await uploadVideoToTikTok('token', 'https://r2.example/v.mp4', 'caption', { ...OPTIONS, disableDuet: false })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.post_info.disable_duet).toBe(false)
  })

  it('sets both TikTok branded-content toggles when the post is branded content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_789' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await uploadVideoToTikTok('token', 'https://r2.example/v.mp4', 'caption', { ...OPTIONS, isBrandedContent: true })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.post_info.brand_content_toggle).toBe(true)
    expect(body.post_info.brand_organic_toggle).toBe(true)
  })

  it('throws with the TikTok error message when the API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'invalid_param', message: 'video_url is required' } }),
      })
    )

    await expect(uploadVideoToTikTok('token', '', 'caption', OPTIONS)).rejects.toThrow('video_url is required')
  })
})

describe('getTikTokPublishStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the status string on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } }),
      })
    )

    const status = await getTikTokPublishStatus('token', 'pub_123')
    expect(status).toBe('PUBLISH_COMPLETE')
  })

  it('throws with the TikTok error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'not_found', message: 'publish_id not found' } }),
      })
    )

    await expect(getTikTokPublishStatus('token', 'missing')).rejects.toThrow('publish_id not found')
  })
})
