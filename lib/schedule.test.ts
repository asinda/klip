import { describe, it, expect } from 'vitest'
import { getWeekDays, groupJobsByDate } from './schedule'

describe('getWeekDays', () => {
  it('returns 7 days starting Monday for a mid-week reference date', () => {
    // Wednesday 2026-09-02 (month is 0-indexed: 8 = September)
    const days = getWeekDays(new Date(2026, 8, 2, 15, 30))
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1) // Monday
    expect(days[6].getDay()).toBe(0) // Sunday
    expect(days[0].getDate()).toBe(31) // Monday Aug 31
    expect(days[0].getMonth()).toBe(7) // August (0-indexed)
    expect(days[6].getDate()).toBe(6) // Sunday Sep 6
  })

  it('returns the same week when the reference date IS a Sunday', () => {
    // Sunday 2026-09-06
    const days = getWeekDays(new Date(2026, 8, 6, 9, 0))
    expect(days[0].getDate()).toBe(31)
    expect(days[0].getMonth()).toBe(7)
    expect(days[6].getDate()).toBe(6)
    expect(days[6].getMonth()).toBe(8)
  })

  it('returns the same week when the reference date IS a Monday', () => {
    const days = getWeekDays(new Date(2026, 8, 7, 9, 0))
    expect(days[0].getDate()).toBe(7)
    expect(days[6].getDate()).toBe(13)
  })

  it('zeroes out the time on every returned day', () => {
    const days = getWeekDays(new Date(2026, 8, 2, 23, 59, 59))
    for (const day of days) {
      expect(day.getHours()).toBe(0)
      expect(day.getMinutes()).toBe(0)
      expect(day.getSeconds()).toBe(0)
    }
  })
})

describe('groupJobsByDate', () => {
  it('groups jobs by their local calendar date', () => {
    const jobs = [
      { id: '1', scheduled_at: '2026-09-02T12:00:00.000Z' },
      { id: '2', scheduled_at: '2026-09-02T13:00:00.000Z' },
      { id: '3', scheduled_at: '2026-09-03T12:00:00.000Z' },
    ]
    const grouped = groupJobsByDate(jobs)
    expect(Object.keys(grouped).sort()).toEqual(['2026-09-02', '2026-09-03'])
    expect(grouped['2026-09-02']).toHaveLength(2)
    expect(grouped['2026-09-03']).toHaveLength(1)
  })

  it('returns an empty object for an empty list', () => {
    expect(groupJobsByDate([])).toEqual({})
  })

  it('groups a late-UTC timestamp under the correct LOCAL date in a large positive-offset timezone (regression test for the original bug)', () => {
    const originalTZ = process.env.TZ
    process.env.TZ = 'Pacific/Auckland' // UTC+12/+13 — large positive offset
    try {
      // 2026-09-02T23:00:00Z is already 2026-09-03 local time in Auckland
      const jobs = [{ id: '1', scheduled_at: '2026-09-02T23:00:00.000Z' }]
      const grouped = groupJobsByDate(jobs)
      expect(Object.keys(grouped)).toEqual(['2026-09-03'])
    } finally {
      process.env.TZ = originalTZ
    }
  })
})
