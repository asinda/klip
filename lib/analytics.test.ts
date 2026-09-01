import { describe, it, expect } from 'vitest'
import { calculateSuccessRate } from './analytics'

describe('calculateSuccessRate', () => {
  it('returns 0 when there is no published or failed job at all', () => {
    expect(calculateSuccessRate(0, 0)).toBe(0)
  })

  it('returns 100 when everything published and nothing failed', () => {
    expect(calculateSuccessRate(5, 0)).toBe(100)
  })

  it('returns 0 when everything failed', () => {
    expect(calculateSuccessRate(0, 3)).toBe(0)
  })

  it('rounds to the nearest integer percentage', () => {
    expect(calculateSuccessRate(3, 1)).toBe(75)
    expect(calculateSuccessRate(1, 2)).toBe(33)
  })
})
