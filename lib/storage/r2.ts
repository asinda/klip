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

export function buildPublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
  return `${base}/${key}`
}

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(client, command, { expiresIn: 600 })
}
