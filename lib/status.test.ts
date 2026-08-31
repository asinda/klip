import { describe, it, expect } from 'vitest'
import { getJobStatusBadge, getVideoStatusBadge, getPlatformBadge } from './status'

describe('getJobStatusBadge', () => {
  it('returns the French label and amber classes for pending', () => {
    expect(getJobStatusBadge('pending')).toEqual({ label: 'Planifié', className: 'bg-amber-500/10 text-amber-400' })
  })

  it('returns the French label and emerald classes for published', () => {
    expect(getJobStatusBadge('published')).toEqual({ label: 'Publié', className: 'bg-emerald-500/10 text-emerald-400' })
  })

  it('returns the French label and red classes for failed', () => {
    expect(getJobStatusBadge('failed')).toEqual({ label: 'Échoué', className: 'bg-red-500/10 text-red-400' })
  })
})

describe('getVideoStatusBadge', () => {
  it('returns the French label and slate classes for uploaded', () => {
    expect(getVideoStatusBadge('uploaded')).toEqual({ label: 'Uploadée', className: 'bg-slate-500/10 text-slate-400' })
  })

  it('returns the French label and amber classes for scheduled', () => {
    expect(getVideoStatusBadge('scheduled')).toEqual({ label: 'Planifiée', className: 'bg-amber-500/10 text-amber-400' })
  })
})

describe('getPlatformBadge', () => {
  it('returns TikTok label and rose classes', () => {
    expect(getPlatformBadge('tiktok')).toEqual({ label: 'TikTok', className: 'text-rose-400' })
  })

  it('returns YouTube label and red classes', () => {
    expect(getPlatformBadge('youtube')).toEqual({ label: 'YouTube', className: 'text-red-500' })
  })
})
