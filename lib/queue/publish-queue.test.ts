import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeDelayMs } from './publish-queue'

describe('computeDelayMs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a positive delay for a future date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
    expect(computeDelayMs('2026-09-01T10:00:05.000Z')).toBe(5000)
  })

  it('returns 0 for a date in the past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
    expect(computeDelayMs('2026-09-01T09:59:00.000Z')).toBe(0)
  })

  it('returns 0 for the exact current instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
    expect(computeDelayMs('2026-09-01T10:00:00.000Z')).toBe(0)
  })
})
