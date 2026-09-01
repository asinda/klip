import type { SupabaseClient } from '@supabase/supabase-js'

// YouTube Data API v3 pools quota per Google Cloud project (not per channel).
// One project shared across all orgs, tracked per-org here so no single
// client can starve another's quota — see docs/superpowers/specs/2026-09-01-competitive-catchup-roadmap-design.md
export const YOUTUBE_DAILY_UNIT_QUOTA = 10_000
export const YOUTUBE_UPLOAD_UNIT_COST = 1_600

export function todayUtcDateKey(referenceDate: Date = new Date()): string {
  return referenceDate.toISOString().slice(0, 10)
}

export function wouldExceedYouTubeQuota(unitsUsedToday: number, unitsNeeded: number): boolean {
  return unitsUsedToday + unitsNeeded > YOUTUBE_DAILY_UNIT_QUOTA
}

export async function getYouTubeQuotaUsage(
  supabase: SupabaseClient,
  orgId: string,
  date: string = todayUtcDateKey()
): Promise<number> {
  const { data } = await supabase
    .from('youtube_quota_usage')
    .select('units_used')
    .eq('org_id', orgId)
    .eq('date', date)
    .single()
  return data?.units_used ?? 0
}

export async function incrementYouTubeQuotaUsage(
  supabase: SupabaseClient,
  orgId: string,
  unitsUsed: number,
  date: string = todayUtcDateKey()
): Promise<void> {
  const { error } = await supabase.rpc('increment_youtube_quota_usage', {
    p_org_id: orgId,
    p_date: date,
    p_units: unitsUsed,
  })
  if (error) throw new Error(`Failed to increment YouTube quota usage: ${error.message}`)
}
