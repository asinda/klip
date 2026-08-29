import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type UploadKind = 'video' | 'thumbnail'

export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024
export const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime']
export const ALLOWED_THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function isAllowedFileType(contentType: string, kind: UploadKind): boolean {
  const allowed = kind === 'video' ? ALLOWED_VIDEO_TYPES : ALLOWED_THUMBNAIL_TYPES
  return allowed.includes(contentType)
}

export function isAllowedFileSize(bytes: number, kind: UploadKind): boolean {
  const max = kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_THUMBNAIL_SIZE_BYTES
  return bytes > 0 && bytes <= max
}

export function generateR2Key(orgId: string, kind: UploadKind, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
  const hasExt = filename.includes('.')
  const id = crypto.randomUUID()
  return `${orgId}/${kind}s/${id}.${hasExt ? ext : 'bin'}`
}

export function isOwnOrgKey(orgId: string, key: string): boolean {
  return typeof key === 'string' && key.startsWith(`${orgId}/`)
}

export function buildPublicUrl(key: string): string {
  const raw = process.env.R2_PUBLIC_URL
  if (!raw) {
    throw new Error('R2_PUBLIC_URL is not configured')
  }
  const base = raw.replace(/\/$/, '')
  return `${base}/${key}`
}

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId) {
    throw new Error('R2_ACCOUNT_ID is not configured')
  }
  if (!accessKeyId) {
    throw new Error('R2_ACCESS_KEY_ID is not configured')
  }
  if (!secretAccessKey) {
    throw new Error('R2_SECRET_ACCESS_KEY is not configured')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

export async function getPresignedUploadUrl(key: string, contentType: string, contentLength: number): Promise<string> {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) {
    throw new Error('R2_BUCKET_NAME is not configured')
  }
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })
  return getSignedUrl(client, command, { expiresIn: 600, signableHeaders: new Set(['content-length']) })
}
