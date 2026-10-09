-- Archery Calendar – user accounts (Supabase: Auth + Postgres). Run once in the Supabase SQL editor.
-- Safe to re-run: everything is "if not exists" / "or replace" / drop-and-create for policies.
-- Security model: the browser uses the public anon key; Row Level Security limits every signed-in user to their own rows.
-- Never put the service_role key in the site or the repo.

-- 1. Types --------------------------------------------------------------------------------------------
do $$ begin
  create type public.entry_status as enum ('not_entered', 'entered', 'paid');
exception when duplicate_object then null; end $$;

-- 2. Tables -------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,  -- = auth.uid()
  display_name        text check (char_length(display_name) <= 80),
  settings            jsonb not null default '{}'::jsonb,       -- states, organisations, reminder days …
  settings_updated_at timestamptz not null default 'epoch',     -- last-write-wins clock for settings (set by the device)
  created_at          timestamptz not null default now()
);

create table if not exists public.user_events (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id    text not null check (char_length(event_id) between 1 and 200),  -- id from data/events.json
  saved       boolean not null default false,                  -- in "My shoots"
  status      public.entry_status not null default 'not_entered',
  paid_amount numeric(10, 2) check (paid_amount >= 0 and paid_amount < 100000),
  paid_date   date,
  receipt     text check (char_length(receipt) <= 200),
  notes       text check (char_length(notes) <= 2000),
  reminders   jsonb not null default '{}'::jsonb,              -- reminders already sent, e.g. {"sent":{"shoot:14":1760000000000}}
  extra       jsonb not null default '{}'::jsonb,              -- small extras: currency, entered date, entry link, date added
  updated_at  timestamptz not null default now(),              -- when the change was made ON THE DEVICE (last write wins)
  synced_at   timestamptz not null default now(),              -- when the server received it (devices pull by this)
  primary key (user_id, event_id),
  check (pg_column_size(reminders) + pg_column_size(extra) < 8000)
);
create index if not exists user_events_user_synced on public.user_events (user_id, synced_at);

-- server stamps synced_at on every write (so a device that was offline can't hide its changes from other devices)
create or replace function public.stamp_synced_at() returns trigger language plpgsql set search_path = '' as $$
begin new.synced_at := now(); return new; end $$;
drop trigger if exists user_events_synced_at on public.user_events;
create trigger user_events_synced_at before insert or update on public.user_events
  for each row execute function public.stamp_synced_at();

-- 3. Row Level Security: users read and write only their own rows -------------------------------------
alter table public.profiles    enable row level security;
alter table public.user_events enable row level security;

drop policy if exists "own profile: read"   on public.profiles;
drop policy if exists "own profile: insert" on public.profiles;
drop policy if exists "own profile: update" on public.profiles;
drop policy if exists "own profile: delete" on public.profiles;
create policy "own profile: read"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own profile: delete" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "own events: read"   on public.user_events;
drop policy if exists "own events: insert" on public.user_events;
drop policy if exists "own events: update" on public.user_events;
drop policy if exists "own events: delete" on public.user_events;
create policy "own events: read"   on public.user_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "own events: insert" on public.user_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own events: update" on public.user_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own events: delete" on public.user_events for delete to authenticated using ((select auth.uid()) = user_id);

-- signed-out visitors (anon key, no session) get nothing at all
revoke all on public.profiles, public.user_events from anon;
grant select, insert, update, delete on public.profiles, public.user_events to authenticated;

-- 4. New sign-up -> empty profile ----------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 5. Sync: upsert a batch of the caller's rows, last write wins on updated_at ---------------------------
-- SECURITY INVOKER: runs as the signed-in user, so RLS above still applies. Returns the rows that were written;
-- rows where the server already had a newer change are skipped (the device picks the newer one up on its next pull).
create or replace function public.sync_user_events(rows jsonb) returns setof public.user_events
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 500 then raise exception 'rows must be an array of at most 500'; end if;
  return query
  insert into public.user_events as u (user_id, event_id, saved, status, paid_amount, paid_date, receipt, notes, reminders, extra, updated_at)
  select auth.uid(), r.event_id, coalesce(r.saved, false), coalesce(r.status, 'not_entered'), r.paid_amount, r.paid_date,
         r.receipt, r.notes, coalesce(r.reminders, '{}'::jsonb), coalesce(r.extra, '{}'::jsonb),
         least(coalesce(r.updated_at, now()), now() + interval '5 minutes')     -- a device clock far in the future can't win forever
  from jsonb_to_recordset(rows) as r(event_id text, saved boolean, status public.entry_status, paid_amount numeric, paid_date date,
                                     receipt text, notes text, reminders jsonb, extra jsonb, updated_at timestamptz)
  on conflict (user_id, event_id) do update set
    saved = excluded.saved, status = excluded.status, paid_amount = excluded.paid_amount, paid_date = excluded.paid_date,
    receipt = excluded.receipt, notes = excluded.notes, reminders = excluded.reminders, extra = excluded.extra, updated_at = excluded.updated_at
  where u.updated_at < excluded.updated_at
  returning u.*;
end $$;

-- Settings / display name, last write wins on settings_updated_at.
create or replace function public.save_profile(p_display_name text, p_settings jsonb, p_updated_at timestamptz) returns public.profiles
language plpgsql security invoker set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.profiles as x (id, display_name, settings, settings_updated_at)
  values (auth.uid(), left(p_display_name, 80), coalesce(p_settings, '{}'::jsonb), least(coalesce(p_updated_at, now()), now() + interval '5 minutes'))
  on conflict (id) do update set display_name = coalesce(excluded.display_name, x.display_name), settings = excluded.settings, settings_updated_at = excluded.settings_updated_at
  where x.settings_updated_at < excluded.settings_updated_at;
  select * into p from public.profiles where id = auth.uid();
  return p;
end $$;

-- 6. "Delete my account and data": removes the auth user; profiles and user_events go with it (on delete cascade).
-- SECURITY DEFINER because users can't delete from auth.users themselves; it only ever deletes auth.uid().
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.user_events where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.sync_user_events(jsonb), public.save_profile(text, jsonb, timestamptz), public.delete_my_account() from public, anon;
grant execute on function public.sync_user_events(jsonb), public.save_profile(text, jsonb, timestamptz), public.delete_my_account() to authenticated;
revoke all on function public.handle_new_user(), public.stamp_synced_at() from public, anon, authenticated;
