// app/api/schedule/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { enqueuePublishJob } from '@/lib/queue/publish-queue'
import {
  getYouTubeQuotaUsageGlobal,
  incrementYouTubeQuotaUsage,
  wouldExceedYouTubeQuota,
  YOUTUBE_UPLOAD_UNIT_COST,
} from '@/lib/youtube/quota'
import { getTikTokCreatorInfo, TIKTOK_PRIVACY_LEVELS } from '@/lib/tiktok/creator-info'
import type { ApiResponse, PublishJob } from '@/lib/types'

interface CreateScheduleBody {
  video_id: string
  account_id: string
  scheduled_at: string
  privacy_level?: string
  disable_duet?: boolean
  disable_stitch?: boolean
  disable_comment?: boolean
  is_branded_content?: boolean
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
    .select('id, duration')
    .eq('id', body.video_id)
    .eq('org_id', orgId)
    .single()

  if (!video) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Vidéo introuvable' }, { status: 404 })
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, platform, access_token')
    .eq('id', body.account_id)
    .eq('org_id', orgId)
    .single()

  if (!account) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte introuvable' }, { status: 404 })
  }

  const insertPayload: Record<string, unknown> = {
    video_id: body.video_id,
    account_id: body.account_id,
    scheduled_at: scheduledDate.toISOString(),
    status: 'pending',
  }

  if (account.platform === 'tiktok') {
    if (!body.privacy_level || !TIKTOK_PRIVACY_LEVELS.includes(body.privacy_level as (typeof TIKTOK_PRIVACY_LEVELS)[number])) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Confidentialité TikTok invalide ou manquante' },
        { status: 400 }
      )
    }

    // The TikTok audit requires the constraints the API returns to be actually
    // enforced, not just displayed: re-check the user's choice against the
    // creator's real options server-side, since the browser can be bypassed.
    let creatorInfo
    try {
      creatorInfo = await getTikTokCreatorInfo(account.access_token)
    } catch (creatorInfoError) {
      console.error('[POST /api/schedule] creator info fetch failed:', creatorInfoError)
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Impossible de vérifier les contraintes TikTok' },
        { status: 502 }
      )
    }

    if (!creatorInfo.privacyLevelOptions.includes(body.privacy_level)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Confidentialité non disponible pour ce compte' },
        { status: 400 }
      )
    }

    if (video.duration != null && video.duration > creatorInfo.maxVideoPostDurationSec) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Vidéo trop longue pour ce compte TikTok' },
        { status: 400 }
      )
    }

    insertPayload.tiktok_privacy_level = body.privacy_level
    insertPayload.tiktok_disable_duet = body.disable_duet ?? true
    insertPayload.tiktok_disable_stitch = body.disable_stitch ?? true
    insertPayload.tiktok_disable_comment = body.disable_comment ?? true
    insertPayload.tiktok_branded_content = body.is_branded_content ?? false
  }

  if (account.platform === 'youtube') {
    // The 10 000 units/day cap belongs to the shared Google Cloud project, so
    // the check has to be against every org's usage combined, not just this one.
    // Service-role client for this read only: RLS would silently scope the "global" sum down to the caller's own org and defeat the project-wide check (an aggregate comes back, never other orgs' rows).
    const serviceSupabase = createServiceClient()
    const unitsUsedToday = await getYouTubeQuotaUsageGlobal(serviceSupabase)
    if (wouldExceedYouTubeQuota(unitsUsedToday, YOUTUBE_UPLOAD_UNIT_COST)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: "Quota YouTube quotidien atteint pour aujourd'hui — réessaie demain" },
        { status: 429 }
      )
    }
  }

  const { data: job, error } = await supabase.from('publish_jobs').insert(insertPayload).select().single()

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

  // Reserve the upload cost at schedule-time: there is no YouTube publish
  // worker yet (that's a later phase), so the counter has to be moved here or
  // it never moves at all. Same optimistic model as the videos.status update
  // just above, which also runs before anything is actually published.
  if (account.platform === 'youtube') {
    try {
      await incrementYouTubeQuotaUsage(supabase, orgId, YOUTUBE_UPLOAD_UNIT_COST)
    } catch (quotaError) {
      console.error(`[POST /api/schedule] failed to record YouTube quota usage for job ${job.id}:`, quotaError)
    }
  }

  try {
    await enqueuePublishJob(job.id, job.scheduled_at)
  } catch (queueError) {
    console.error(`[POST /api/schedule] enqueue failed for job ${job.id} (row still created):`, queueError)
  }

  return NextResponse.json<ApiResponse<PublishJob>>({ data: job, error: null })
}
