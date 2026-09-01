import type { SupabaseClient } from '@supabase/supabase-js'

// YouTube Data API v3 pools quota per Google Cloud project (not per channel).
// One project is shared across all orgs, so the blocking check must be the
// PROJECT-WIDE total (getYouTubeQuotaUsageGlobal); the per-org counter is kept
// for reporting/observability only — see
// docs/superpowers/specs/2026-09-01-competitive-catchup-roadmap-design.md
export const YOUTUBE_DAILY_UNIT_QUOTA = 10_000
export const YOUTUBE_UPLOAD_UNIT_COST = 1_600

// YouTube's daily quota resets at midnight Pacific Time, not midnight UTC, so
// the day bucket must be computed in America/Los_Angeles. 'en-CA' formats as
// YYYY-MM-DD directly.
export function todayPacificDateKey(referenceDate: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate)
}

export function wouldExceedYouTubeQuota(unitsUsedToday: number, unitsNeeded: number): boolean {
  return unitsUsedToday + unitsNeeded > YOUTUBE_DAILY_UNIT_QUOTA
}

// Per-org usage. NOT the blocking check (the quota is pooled project-wide) —
// kept for per-client reporting and observability.
export async function getYouTubeQuotaUsage(
  supabase: SupabaseClient,
  orgId: string,
  date: string = todayPacificDateKey()
): Promise<number> {
  const { data, error } = await supabase
    .from('youtube_quota_usage')
    .select('units_used')
    .eq('org_id', orgId)
    .eq('date', date)
    .maybeSingle()

  // maybeSingle() reports "no row" as data: null, error: null — only a real
  // failure sets error, and swallowing that would silently read as 0 usage.
  if (error) throw new Error(`Failed to read YouTube quota usage: ${error.message}`)

  return data?.units_used ?? 0
}

// Project-wide usage for the day: the quota is pooled across every org sharing
// the single Google Cloud project, so this is what the schedule gate compares
// against YOUTUBE_DAILY_UNIT_QUOTA.
export async function getYouTubeQuotaUsageGlobal(
  supabase: SupabaseClient,
  date: string = todayPacificDateKey()
): Promise<number> {
  const { data, error } = await supabase.from('youtube_quota_usage').select('units_used').eq('date', date)

  if (error) throw new Error(`Failed to read YouTube quota usage: ${error.message}`)

  return (data ?? []).reduce((sum, row) => sum + row.units_used, 0)
}

export async function incrementYouTubeQuotaUsage(
  supabase: SupabaseClient,
  orgId: string,
  unitsUsed: number,
  date: string = todayPacificDateKey()
): Promise<void> {
  const { error } = await supabase.rpc('increment_youtube_quota_usage', {
    p_org_id: orgId,
    p_date: date,
    p_units: unitsUsed,
  })
  if (error) throw new Error(`Failed to increment YouTube quota usage: ${error.message}`)
}
