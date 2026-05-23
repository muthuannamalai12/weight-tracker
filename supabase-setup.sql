-- ============================================================
-- Weight Tracker — Supabase Database Setup
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. WEIGHT ENTRIES TABLE
create table if not exists weight_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  weight_kg   numeric(6,2) not null,
  note        text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, date)
);

-- 2. USER PREFERENCES TABLE
create table if not exists user_prefs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade unique,
  unit        text default 'kg',
  height_cm   numeric(5,1) default 170,
  goal_kg     numeric(6,2) default 0,
  updated_at  timestamptz default now()
);

-- 3. ROW LEVEL SECURITY (very important — users only see their own data)
alter table weight_entries enable row level security;
alter table user_prefs enable row level security;

-- Weight entries policies
create policy "Users can read own entries"
  on weight_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own entries"
  on weight_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own entries"
  on weight_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete own entries"
  on weight_entries for delete
  using (auth.uid() = user_id);

-- User prefs policies
create policy "Users can read own prefs"
  on user_prefs for select
  using (auth.uid() = user_id);

create policy "Users can insert own prefs"
  on user_prefs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own prefs"
  on user_prefs for update
  using (auth.uid() = user_id);

-- 4. INDEXES for fast queries
create index if not exists idx_weight_entries_user_date on weight_entries(user_id, date);
create index if not exists idx_user_prefs_user on user_prefs(user_id);
