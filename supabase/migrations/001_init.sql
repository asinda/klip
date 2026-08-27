-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Organizations (multi-tenant)
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plan text not null default 'starter', -- 'starter' | 'agency' | 'white_label'
  created_at timestamptz not null default now()
);

-- Users (extends Supabase auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member', -- 'owner' | 'member'
  created_at timestamptz not null default now()
);

-- Social accounts connected by org
create table social_accounts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  platform text not null, -- 'tiktok' | 'youtube'
  account_id text not null,
  username text not null,
  avatar_url text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(org_id, platform, account_id)
);

-- Videos uploaded by org
create table videos (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  r2_key text not null,
  r2_url text not null,
  thumbnail_url text,
  duration integer, -- seconds
  file_size bigint, -- bytes
  format text not null default 'short', -- 'short' | 'long'
  status text not null default 'uploaded', -- 'uploaded' | 'scheduled' | 'published' | 'failed'
  created_at timestamptz not null default now()
);

-- Publish jobs (one per video × account)
create table publish_jobs (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references videos(id) on delete cascade,
  account_id uuid not null references social_accounts(id) on delete cascade,
  scheduled_at timestamptz not null,
  published_at timestamptz,
  status text not null default 'pending', -- 'pending' | 'processing' | 'published' | 'failed'
  error_message text,
  platform_post_id text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- RLS Policies
alter table organizations enable row level security;
alter table users enable row level security;
alter table social_accounts enable row level security;
alter table videos enable row level security;
alter table publish_jobs enable row level security;

-- Users can only see their own org
create policy "users_own_org" on users
  for all using (id = auth.uid());

create policy "org_members_see_org" on organizations
  for select using (
    id in (select org_id from users where id = auth.uid())
  );

create policy "org_members_see_accounts" on social_accounts
  for all using (
    org_id in (select org_id from users where id = auth.uid())
  );

create policy "org_members_see_videos" on videos
  for all using (
    org_id in (select org_id from users where id = auth.uid())
  );

create policy "org_members_see_jobs" on publish_jobs
  for all using (
    video_id in (
      select id from videos where org_id in (
        select org_id from users where id = auth.uid()
      )
    )
  );

-- Indexes
create index idx_social_accounts_org on social_accounts(org_id);
create index idx_videos_org on videos(org_id);
create index idx_publish_jobs_status on publish_jobs(status, scheduled_at);
create index idx_publish_jobs_video on publish_jobs(video_id);
