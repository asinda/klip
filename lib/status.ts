import type { JobStatus, VideoStatus, Platform } from './types'

interface BadgeStyle {
  label: string
  className: string
}

const JOB_STATUS_MAP: Record<JobStatus, BadgeStyle> = {
  pending: { label: 'Planifié', className: 'bg-amber-500/10 text-amber-400' },
  processing: { label: 'En cours', className: 'bg-blue-500/10 text-blue-400' },
  published: { label: 'Publié', className: 'bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Échoué', className: 'bg-red-500/10 text-red-400' },
}

const VIDEO_STATUS_MAP: Record<VideoStatus, BadgeStyle> = {
  uploaded: { label: 'Uploadée', className: 'bg-slate-500/10 text-slate-400' },
  scheduled: { label: 'Planifiée', className: 'bg-amber-500/10 text-amber-400' },
  published: { label: 'Publiée', className: 'bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Échouée', className: 'bg-red-500/10 text-red-400' },
}

const PLATFORM_MAP: Record<Platform, BadgeStyle> = {
  tiktok: { label: 'TikTok', className: 'text-rose-400' },
  youtube: { label: 'YouTube', className: 'text-red-500' },
}

export function getJobStatusBadge(status: JobStatus): BadgeStyle {
  return JOB_STATUS_MAP[status]
}

export function getVideoStatusBadge(status: VideoStatus): BadgeStyle {
  return VIDEO_STATUS_MAP[status]
}

export function getPlatformBadge(platform: Platform): BadgeStyle {
  return PLATFORM_MAP[platform]
}
