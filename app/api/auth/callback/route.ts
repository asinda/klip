import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function safeRedirectPath(path: string | null): string {
  if (path && path.startsWith('/') && !path.startsWith('//') && !path.includes('://')) {
    return path
  }
  return '/dashboard'
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeRedirectPath(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url))
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
  }

  // Ensure user + org exists
  const service = createServiceClient()
  const { data: existing } = await service
    .from('users')
    .select('id')
    .eq('id', data.user.id)
    .single()

  if (!existing) {
    // Create org for new user
    const { data: org } = await service
      .from('organizations')
      .insert({ name: data.user.email?.split('@')[0] ?? 'Mon Organisation' })
      .select()
      .single()

    if (org) {
      await service.from('users').insert({
        id: data.user.id,
        org_id: org.id,
        email: data.user.email!,
        role: 'owner',
      })
    }
  }

  return NextResponse.redirect(new URL(next, request.url))
}
