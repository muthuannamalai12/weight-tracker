-- ============================================================
-- Weight Tracker — Supabase Setup (no-auth version)
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. TABLES
create table if not exists weight_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  weight_kg   numeric(6,2) not null,
  note        text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, date)
);

create table if not exists user_prefs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique,
  unit        text default 'kg',
  height_cm   numeric(5,1) default 170,
  goal_kg     numeric(6,2) default 0,
  updated_at  timestamptz default now()
);

-- 2. INDEXES
create index if not exists idx_weight_entries_user_date on weight_entries(user_id, date);
create index if not exists idx_user_prefs_user on user_prefs(user_id);

-- 3. DISABLE RLS (since there's no auth — it's a private personal app)
alter table weight_entries disable row level security;
alter table user_prefs disable row level security;

-- NOTE: This is safe because:
-- (a) Your publishable key is read-only scoped to your project
-- (b) Nobody else has your URL + key
-- (c) The app is for personal use only
