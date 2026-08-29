import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isAllowedFileType, isAllowedFileSize, generateR2Key, buildPublicUrl, isOwnOrgKey } from './r2'

describe('isAllowedFileType', () => {
  it('accepts mp4 for video', () => {
    expect(isAllowedFileType('video/mp4', 'video')).toBe(true)
  })

  it('rejects an image for video', () => {
    expect(isAllowedFileType('image/png', 'video')).toBe(false)
  })

  it('accepts jpeg for thumbnail', () => {
    expect(isAllowedFileType('image/jpeg', 'thumbnail')).toBe(true)
  })

  it('rejects a video type for thumbnail', () => {
    expect(isAllowedFileType('video/mp4', 'thumbnail')).toBe(false)
  })
})

describe('isAllowedFileSize', () => {
  it('accepts a video under 500MB', () => {
    expect(isAllowedFileSize(100 * 1024 * 1024, 'video')).toBe(true)
  })

  it('rejects a video over 500MB', () => {
    expect(isAllowedFileSize(600 * 1024 * 1024, 'video')).toBe(false)
  })

  it('rejects a zero-byte file', () => {
    expect(isAllowedFileSize(0, 'video')).toBe(false)
  })

  it('rejects a thumbnail over 5MB', () => {
    expect(isAllowedFileSize(6 * 1024 * 1024, 'thumbnail')).toBe(false)
  })
})

describe('generateR2Key', () => {
  it('embeds org id, kind, and lowercased extension', () => {
    const key = generateR2Key('org-123', 'video', 'My Clip.MP4')
    expect(key).toMatch(/^org-123\/videos\/[0-9a-f-]{36}\.mp4$/)
  })

  it('defaults to a bin extension when the filename has none', () => {
    const key = generateR2Key('org-123', 'thumbnail', 'noext')
    expect(key).toMatch(/^org-123\/thumbnails\/[0-9a-f-]{36}\.bin$/)
  })
})

describe('buildPublicUrl', () => {
  beforeEach(() => {
    process.env.R2_PUBLIC_URL = 'https://pub-test.r2.dev/'
  })

  afterEach(() => {
    delete process.env.R2_PUBLIC_URL
  })

  it('joins the base url and key without a double slash', () => {
    expect(buildPublicUrl('org-1/videos/abc.mp4')).toBe('https://pub-test.r2.dev/org-1/videos/abc.mp4')
  })

  it('throws when R2_PUBLIC_URL is not configured', () => {
    delete process.env.R2_PUBLIC_URL
    expect(() => buildPublicUrl('org-1/videos/abc.mp4')).toThrow()
  })
})

describe('isOwnOrgKey', () => {
  it('accepts a key prefixed with the given org id', () => {
    expect(isOwnOrgKey('org-123', 'org-123/videos/abc.mp4')).toBe(true)
  })

  it('rejects a key belonging to a different org', () => {
    expect(isOwnOrgKey('org-123', 'org-456/videos/abc.mp4')).toBe(false)
  })

  it('rejects a non-string value', () => {
    expect(isOwnOrgKey('org-123', undefined as unknown as string)).toBe(false)
  })
})
