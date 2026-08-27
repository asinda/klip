import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Non autorisé' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  const service = createServiceClient()

  // Verify account belongs to user's org before deleting
  const { data: account } = await service
    .from('social_accounts')
    .select('id')
    .eq('id', params.id)
    .eq('org_id', userData?.org_id)
    .single()

  if (!account) {
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Compte introuvable' }, { status: 404 })
  }

  await service.from('social_accounts').delete().eq('id', params.id)

  return NextResponse.json<ApiResponse<null>>({ data: null, error: null })
}
