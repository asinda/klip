import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateR2Key,
  buildPublicUrl,
  getPresignedUploadUrl,
  isAllowedFileType,
  isAllowedFileSize,
  type UploadKind,
} from '@/lib/storage/r2'
import type { ApiResponse } from '@/lib/types'

interface PresignBody {
  filename: string
  contentType: string
  fileSize: number
  kind: UploadKind
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Non autorisé' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  if (!userData?.org_id) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const body: PresignBody = await request.json()

  if (body.kind !== 'video' && body.kind !== 'thumbnail') {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Type de fichier invalide' }, { status: 400 })
  }

  if (!isAllowedFileType(body.contentType, body.kind)) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Format de fichier non supporté' }, { status: 400 })
  }

  if (!isAllowedFileSize(body.fileSize, body.kind)) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Fichier trop volumineux' }, { status: 400 })
  }

  const key = generateR2Key(userData.org_id, body.kind, body.filename)
  const uploadUrl = await getPresignedUploadUrl(key, body.contentType)
  const publicUrl = buildPublicUrl(key)

  return NextResponse.json<ApiResponse<{ uploadUrl: string; key: string; publicUrl: string }>>({
    data: { uploadUrl, key, publicUrl },
    error: null,
  })
}
