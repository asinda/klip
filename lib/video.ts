import type { VideoFormat } from './types'

const LONG_FORMAT_THRESHOLD_SECONDS = 180

export function deriveFormat(durationSeconds: number): VideoFormat {
  return durationSeconds >= LONG_FORMAT_THRESHOLD_SECONDS ? 'long' : 'short'
}

export function deriveTitleFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0) return filename
  return filename.slice(0, lastDot)
}
