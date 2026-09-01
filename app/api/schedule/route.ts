// app/api/schedule/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import type { ApiResponse, PublishJob } from '@/lib/types'

interface CreateScheduleBody {
  video_id: string
  account_id: string
  scheduled_at: string
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  if (!orgId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const body: CreateScheduleBody = await request.json()

  if (!body.video_id || !body.account_id || !body.scheduled_at) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Données manquantes' }, { status: 400 })
  }

  const scheduledDate = new Date(body.scheduled_at)
  if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now()) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Date invalide ou dans le passé' }, { status: 400 })
  }

  const { data: video } = await supabase
    .from('videos')
    .select('id')
    .eq('id', body.video_id)
    .eq('org_id', orgId)
    .single()

  if (!video) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Vidéo introuvable' }, { status: 404 })
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('id', body.account_id)
    .eq('org_id', orgId)
    .single()

  if (!account) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte introuvable' }, { status: 404 })
  }

  const { data: job, error } = await supabase
    .from('publish_jobs')
    .insert({
      video_id: body.video_id,
      account_id: body.account_id,
      scheduled_at: scheduledDate.toISOString(),
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/schedule] insert failed:', error)
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Erreur lors de la planification' }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('videos')
    .update({ status: 'scheduled' })
    .eq('id', body.video_id)

  if (updateError) {
    console.error('[POST /api/schedule] video status update failed:', updateError)
  }

  return NextResponse.json<ApiResponse<PublishJob>>({ data: job, error: null })
}
