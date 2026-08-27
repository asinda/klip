import { exchangeYouTubeCode, getYouTubeChannelInfo } from '@/lib/youtube/oauth'
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
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=youtube_denied`)
  }

  const savedState = cookies().get('youtube_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_state`)
  }
  cookies().delete('youtube_oauth_state')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  try {
    const tokens = await exchangeYouTubeCode(code)
    const channel = await getYouTubeChannelInfo(tokens.access_token)

    const service = createServiceClient()
    await service.from('social_accounts').upsert({
      org_id: userData?.org_id,
      platform: 'youtube',
      account_id: channel.channel_id,
      username: channel.title,
      avatar_url: channel.thumbnail ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
    }, { onConflict: 'org_id,platform,account_id' })

    return NextResponse.redirect(`${appUrl}/dashboard/accounts?success=youtube`)
  } catch (err) {
    console.error('YouTube OAuth error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=youtube_failed`)
  }
}
