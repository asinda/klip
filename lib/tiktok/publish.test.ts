import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadVideoToTikTok, getTikTokPublishStatus } from './publish'

describe('uploadVideoToTikTok', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends PULL_FROM_URL source info and returns the publish id on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { publish_id: 'pub_123' }, error: { code: 'ok' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await uploadVideoToTikTok('token-abc', 'https://r2.example/video.mp4', 'My caption')

    expect(result).toEqual({ publishId: 'pub_123' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
    const body = JSON.parse(init.body)
    expect(body.source_info).toEqual({ source: 'PULL_FROM_URL', video_url: 'https://r2.example/video.mp4' })
    expect(body.post_info.title).toBe('My caption')
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

    await expect(uploadVideoToTikTok('token', '', 'caption')).rejects.toThrow('video_url is required')
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
