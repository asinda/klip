import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse, Video, VideoFormat } from '@/lib/types'

interface CreateVideoBody {
  title: string
  r2_key: string
  r2_url: string
  thumbnail_url: string | null
  file_size: number
  duration: number
  format: VideoFormat
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

  const body: CreateVideoBody = await request.json()

  if (!body.title || !body.r2_key || !body.r2_url) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Données manquantes' }, { status: 400 })
  }

  const { data: video, error } = await supabase
    .from('videos')
    .insert({
      org_id: userData.org_id,
      title: body.title,
      r2_key: body.r2_key,
      r2_url: body.r2_url,
      thumbnail_url: body.thumbnail_url,
      file_size: body.file_size,
      duration: body.duration,
      format: body.format,
      status: 'uploaded',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json<ApiResponse<Video>>({ data: video, error: null })
}
