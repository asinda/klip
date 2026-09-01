import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { getTikTokCreatorInfo, type TikTokCreatorInfo } from '@/lib/tiktok/creator-info'
import type { ApiResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  if (!orgId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Organisation introuvable' }, { status: 403 })
  }

  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'account_id manquant' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('access_token, platform')
    .eq('id', accountId)
    .eq('org_id', orgId)
    .single()

  if (!account || account.platform !== 'tiktok') {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte TikTok introuvable' }, { status: 404 })
  }

  try {
    const creatorInfo = await getTikTokCreatorInfo(account.access_token)
    return NextResponse.json<ApiResponse<TikTokCreatorInfo>>({ data: creatorInfo, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[GET /api/tiktok/creator-info] failed:', message)
    return NextResponse.json<ApiResponse<null>>({ data: null, error: message }, { status: 502 })
  }
}
