import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import type { ApiResponse } from '@/lib/types'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  if (!orgId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const { data: job } = await supabase
    .from('publish_jobs')
    .select('id, video_id, video:videos!inner(org_id)')
    .eq('id', params.id)
    .eq('video.org_id', orgId)
    .eq('status', 'pending')
    .single()

  if (!job) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Planification introuvable' }, { status: 404 })
  }

  const { error } = await supabase.from('publish_jobs').delete().eq('id', params.id)

  if (error) {
    console.error('[DELETE /api/schedule/:id] failed:', error)
    return NextResponse.json<ApiResponse<null>>({ data: null, error: "Erreur lors de l'annulation" }, { status: 500 })
  }

  const { error: videoUpdateError } = await supabase
    .from('videos')
    .update({ status: 'uploaded' })
    .eq('id', job.video_id)

  if (videoUpdateError) {
    console.error('[DELETE /api/schedule/:id] video status revert failed:', videoUpdateError)
  }

  return NextResponse.json<ApiResponse<null>>({ data: null, error: null })
}
