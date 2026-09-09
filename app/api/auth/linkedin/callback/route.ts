import { exchangeLinkedInCode, getLinkedInOrgInfo } from '@/lib/linkedin/oauth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const savedState = cookies().get('linkedin_oauth_state')?.value
  cookies().delete('linkedin_oauth_state')

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=linkedin_denied`)
  }

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_state`)
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  try {
    const tokens = await exchangeLinkedInCode(code)
    const org = await getLinkedInOrgInfo(tokens.access_token)

    const service = createServiceClient()
    await service.from('social_accounts').upsert({
      org_id: userData?.org_id,
      platform: 'linkedin',
      account_id: org.organizationId,
      username: org.name,
      avatar_url: org.logoUrl ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
    }, { onConflict: 'org_id,platform,account_id' })

    return NextResponse.redirect(`${appUrl}/dashboard/accounts?success=linkedin`)
  } catch (err) {
    console.error('LinkedIn OAuth error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=linkedin_failed`)
  }
}
