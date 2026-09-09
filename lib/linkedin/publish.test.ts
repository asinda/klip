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
