-- Pinning search_path (below) makes unqualified names in the function body
-- unresolvable, so the body must be schema-qualified first — otherwise every
-- call fails with "relation youtube_quota_usage does not exist".
create or replace function increment_youtube_quota_usage(p_org_id uuid, p_date date, p_units integer)
returns void as $$
begin
  insert into public.youtube_quota_usage (org_id, date, units_used)
  values (p_org_id, p_date, p_units)
  on conflict (org_id, date)
  do update set units_used = public.youtube_quota_usage.units_used + excluded.units_used;
end;
$$ language plpgsql;

-- Supabase linter best practice: pin search_path on every function to avoid
-- schema-shadowing risk, even though this function is not SECURITY DEFINER.
alter function increment_youtube_quota_usage(uuid, date, integer) set search_path = '';

-- Backfill: publish_jobs rows created before migration 002 have no
-- tiktok_privacy_level. Without this, the worker would send privacy_level:
-- null to TikTok for any pre-existing pending TikTok job. These jobs were
-- previously published under the app's old hardcoded SELF_ONLY behavior,
-- so backfilling to SELF_ONLY preserves their original behavior.
update publish_jobs
set tiktok_privacy_level = 'SELF_ONLY'
where tiktok_privacy_level is null
  and status = 'pending'
  and account_id in (select id from social_accounts where platform = 'tiktok');
