import { describe, it, expect } from 'vitest'
import { todayPacificDateKey, wouldExceedYouTubeQuota, YOUTUBE_DAILY_UNIT_QUOTA, YOUTUBE_UPLOAD_UNIT_COST } from './quota'

describe('todayPacificDateKey', () => {
  it('formats a date as YYYY-MM-DD in Pacific Time', () => {
    // September = PDT (UTC-7): 23:59 UTC is 16:59 PT the same calendar day.
    expect(todayPacificDateKey(new Date('2026-09-01T23:59:00Z'))).toBe('2026-09-01')
  })

  it('converts to Pacific Time, which can land on a different calendar day than UTC', () => {
    // January = PST (UTC-8): 00:00 UTC is 16:00 PT the PREVIOUS day.
    expect(todayPacificDateKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-04')
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
