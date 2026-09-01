import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * TEMPORARY dev-only auth bypass — remove once real auth testing resumes.
 * In development, falls back to the first `users` row when no session
 * exists, so dashboard pages stay navigable without logging in.
 *
 * Requires BOTH conditions so a misconfigured NODE_ENV alone can never
 * disable auth on a real deployment: NODE_ENV must not be 'production',
 * AND ALLOW_DEV_AUTH_BYPASS=1 must be set explicitly (e.g. in .env.local —
 * never set this in a real hosting platform's environment).
 */
export const DEV_BYPASS_AUTH =
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_BYPASS === '1'

export async function getCurrentUserRow(
  supabase: SupabaseClient,
  select: string
): Promise<{ data: any; error: any }> {
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return supabase.from('users').select(select).eq('id', user.id).single()
  }

  if (DEV_BYPASS_AUTH) {
    return supabase.from('users').select(select).limit(1).single()
  }

  return { data: null, error: null }
}
