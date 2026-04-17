create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_title text not null default '',
  destination text not null,
  start_date date not null,
  end_date date not null,
  days integer not null check (days > 0),
  budget text not null,
  travel_style text not null,
  interests text not null default '',
  notes text not null default '',
  checklist jsonb not null default '[]'::jsonb,
  itinerary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
before update on public.trips
for each row
execute function public.set_updated_at();

alter table public.trips enable row level security;

drop policy if exists "Users can read own trips" on public.trips;
create policy "Users can read own trips" on public.trips
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own trips" on public.trips;
create policy "Users can insert own trips" on public.trips
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own trips" on public.trips;
create policy "Users can delete own trips" on public.trips
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can update own trips" on public.trips;
create policy "Users can update own trips" on public.trips
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
