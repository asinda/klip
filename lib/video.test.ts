import { describe, it, expect } from 'vitest'
import { deriveFormat, deriveTitleFromFilename } from './video'

describe('deriveFormat', () => {
  it('returns short for durations under 3 minutes', () => {
    expect(deriveFormat(179)).toBe('short')
  })

  it('returns long at exactly 3 minutes', () => {
    expect(deriveFormat(180)).toBe('long')
  })

  it('returns long for durations over 3 minutes', () => {
    expect(deriveFormat(600)).toBe('long')
  })
})

describe('deriveTitleFromFilename', () => {
  it('strips the extension', () => {
    expect(deriveTitleFromFilename('summer-recap.mp4')).toBe('summer-recap')
  })

  it('keeps dots in the middle of the name', () => {
    expect(deriveTitleFromFilename('v1.2.final.mov')).toBe('v1.2.final')
  })

  it('returns the filename unchanged when there is no extension', () => {
    expect(deriveTitleFromFilename('noext')).toBe('noext')
  })

  it('does not treat a leading dot as an extension separator', () => {
    expect(deriveTitleFromFilename('.gitignore')).toBe('.gitignore')
  })
})
