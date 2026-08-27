import { exchangeTikTokCode, getTikTokUserInfo } from '@/lib/tiktok/oauth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=tiktok_denied`)
  }

  // Verify state
  const savedState = cookies().get('tiktok_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_state`)
  }
  cookies().delete('tiktok_oauth_state')

  // Get user
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  try {
    const tokens = await exchangeTikTokCode(code)
    const info = await getTikTokUserInfo(tokens.access_token)

    const service = createServiceClient()
    await service.from('social_accounts').upsert({
      org_id: userData?.org_id,
      platform: 'tiktok',
      account_id: tokens.open_id,
      username: info.display_name,
      avatar_url: info.avatar_url,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
    }, { onConflict: 'org_id,platform,account_id' })

    return NextResponse.redirect(`${appUrl}/dashboard/accounts?success=tiktok`)
  } catch (err) {
    console.error('TikTok OAuth error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=tiktok_failed`)
  }
}
