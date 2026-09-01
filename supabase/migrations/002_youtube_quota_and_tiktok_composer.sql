-- YouTube Data API quota is pooled per Google Cloud project, not per channel.
-- Instead of provisioning one GCP project per connected YouTube channel (the
-- old CLAUDE.md assumption, which costs a repeated OAuth-verification cycle
-- per client for no technical reason), this tracks usage per org against a
-- single shared project's daily quota and rejects new jobs that would exceed it.
create table youtube_quota_usage (
  org_id uuid not null references organizations(id) on delete cascade,
  date date not null,
  units_used integer not null default 0,
  primary key (org_id, date)
);

alter table youtube_quota_usage enable row level security;

create policy "org_members_see_youtube_quota" on youtube_quota_usage
  for all using (
    org_id in (select org_id from users where id = auth.uid())
  );

create or replace function increment_youtube_quota_usage(p_org_id uuid, p_date date, p_units integer)
returns void as $$
begin
  insert into youtube_quota_usage (org_id, date, units_used)
  values (p_org_id, p_date, p_units)
  on conflict (org_id, date)
  do update set units_used = youtube_quota_usage.units_used + excluded.units_used;
end;
$$ language plpgsql;

-- TikTok Content Posting API audit requires these to be real, user-driven
-- choices per post (not app-hardcoded) — see lib/tiktok/creator-info.ts and
-- the ScheduleDialog composer. Interactions default to disabled (opt-in),
-- matching the audit's "toggles must not be pre-checked" requirement.
alter table publish_jobs
  add column tiktok_privacy_level text,
  add column tiktok_disable_duet boolean not null default true,
  add column tiktok_disable_stitch boolean not null default true,
  add column tiktok_disable_comment boolean not null default true,
  add column tiktok_branded_content boolean not null default false;
