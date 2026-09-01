import { describe, it, expect } from 'vitest'
import { todayUtcDateKey, wouldExceedYouTubeQuota, YOUTUBE_DAILY_UNIT_QUOTA, YOUTUBE_UPLOAD_UNIT_COST } from './quota'

describe('todayUtcDateKey', () => {
  it('formats a date as YYYY-MM-DD in UTC', () => {
    expect(todayUtcDateKey(new Date('2026-09-01T23:59:00Z'))).toBe('2026-09-01')
  })

  it('does not roll over based on local time zone offsets', () => {
    expect(todayUtcDateKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05')
  })
})

describe('wouldExceedYouTubeQuota', () => {
  it('returns false when usage plus the new request stays within the daily cap', () => {
    expect(wouldExceedYouTubeQuota(0, YOUTUBE_UPLOAD_UNIT_COST)).toBe(false)
  })

  it('returns true when usage plus the new request would exceed the daily cap', () => {
    expect(wouldExceedYouTubeQuota(YOUTUBE_DAILY_UNIT_QUOTA - 100, YOUTUBE_UPLOAD_UNIT_COST)).toBe(true)
  })

  it('returns false when the request lands exactly on the cap', () => {
    expect(wouldExceedYouTubeQuota(YOUTUBE_DAILY_UNIT_QUOTA - YOUTUBE_UPLOAD_UNIT_COST, YOUTUBE_UPLOAD_UNIT_COST)).toBe(false)
  })
})
