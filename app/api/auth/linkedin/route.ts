import { getLinkedInAuthUrl } from '@/lib/linkedin/oauth'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!))

  const state = crypto.randomBytes(16).toString('hex')
  cookies().set('linkedin_oauth_state', state, { httpOnly: true, maxAge: 600 })

  return NextResponse.redirect(getLinkedInAuthUrl(state))
}
