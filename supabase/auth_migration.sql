-- Run this on existing projects that already have public.trips.
-- It adds ownership and replaces public policies with per-user RLS policies.

alter table public.trips
add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Optional: assign legacy rows to a known user before enforcing NOT NULL.
-- update public.trips set user_id = '<USER_UUID>' where user_id is null;

-- Recommended after backfilling legacy rows:
-- alter table public.trips alter column user_id set not null;

create index if not exists trips_user_id_idx on public.trips(user_id);

alter table public.trips enable row level security;

drop policy if exists "Public read trips" on public.trips;
drop policy if exists "Public insert trips" on public.trips;
drop policy if exists "Public delete trips" on public.trips;
drop policy if exists "Public update trips" on public.trips;
drop policy if exists "Users can read own trips" on public.trips;
drop policy if exists "Users can insert own trips" on public.trips;
drop policy if exists "Users can delete own trips" on public.trips;
drop policy if exists "Users can update own trips" on public.trips;

create policy "Users can read own trips" on public.trips
for select
using (auth.uid() = user_id);

create policy "Users can insert own trips" on public.trips
for insert
with check (auth.uid() = user_id);

create policy "Users can delete own trips" on public.trips
for delete
using (auth.uid() = user_id);

create policy "Users can update own trips" on public.trips
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
