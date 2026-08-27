export type Plan = 'starter' | 'agency' | 'white_label'
export type Platform = 'tiktok' | 'youtube'
export type VideoFormat = 'short' | 'long'
export type VideoStatus = 'uploaded' | 'scheduled' | 'published' | 'failed'
export type JobStatus = 'pending' | 'processing' | 'published' | 'failed'
export type UserRole = 'owner' | 'member'

export interface Organization {
  id: string
  name: string
  plan: Plan
  created_at: string
}

export interface User {
  id: string
  org_id: string
  email: string
  role: UserRole
  created_at: string
}

export interface SocialAccount {
  id: string
  org_id: string
  platform: Platform
  account_id: string
  username: string
  avatar_url: string | null
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface Video {
  id: string
  org_id: string
  title: string
  r2_key: string
  r2_url: string
  thumbnail_url: string | null
  duration: number | null
  file_size: number | null
  format: VideoFormat
  status: VideoStatus
  created_at: string
}

export interface PublishJob {
  id: string
  video_id: string
  account_id: string
  scheduled_at: string
  published_at: string | null
  status: JobStatus
  error_message: string | null
  platform_post_id: string | null
  retry_count: number
  created_at: string
  // joined
  video?: Video
  account?: SocialAccount
}

export type ApiResponse<T> = {
  data: T | null
  error: string | null
}
