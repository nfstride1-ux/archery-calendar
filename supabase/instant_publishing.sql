-- Archery Calendar: instant publishing of club event submissions (14 Oct 2026)
-- Run once in Supabase → project archery-calendar (sllsqpfqwckwtljzjxli) → SQL Editor → New query → paste → Run. Safe to re-run.

-- 1. Admins ---------------------------------------------------------------------------------------------------------------
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('nfshold@gmail.com') on conflict do nothing;
alter table public.admins enable row level security;            -- no policies: nobody reads it from the browser
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email)
                 where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. Approved submitters (instant = their events go live straight away) -----------------------------------------------------
create table if not exists public.approved_submitters (
  email text primary key check (email = lower(email)),
  user_id uuid references auth.users(id) on delete set null,
  name text, club text, instant boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.approved_submitters enable row level security;
drop policy if exists "approved submitters: admin all" on public.approved_submitters;
create policy "approved submitters: admin all" on public.approved_submitters for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.approved_lower() returns trigger language plpgsql as $$
begin new.email := lower(trim(new.email)); new.updated_at := now(); return new; end $$;
drop trigger if exists approved_lower on public.approved_submitters;
create trigger approved_lower before insert or update on public.approved_submitters for each row execute function public.approved_lower();
insert into public.approved_submitters (email, name, club, instant) values
  ('president@gosnellsarchers.asn.au', 'Emma', 'Gosnells Archers', true),
  ('dkmason@iinet.net.au', 'Deborah Mason', 'Bowmen of Melville', true),
  ('northernarchersofsyd@gmail.com', 'Jeffrey Lim', 'Northern Archers of Sydney', true)
on conflict (email) do update set name = excluded.name, club = excluded.club, instant = true;

-- 3. Submissions ---------------------------------------------------------------------------------------------------------------
create table if not exists public.submitted_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  submitter_email text,
  status text not null default 'pending' check (status in ('pending', 'live', 'rejected')),
  country text, state text, organisation_type text, club text not null check (length(club) between 1 and 120),
  submitter_name text, role text, contact_email text, phone text,
  name text not null check (length(name) between 1 and 140),
  start_date date not null, end_date date, venue text not null check (length(venue) between 1 and 200),
  discipline text, registration_url text check (registration_url is null or registration_url = '' or registration_url ~* '^https?://'),
  flyer_link text, flyer_path text, flyer_url text, notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by text,
  check (end_date is null or end_date >= start_date));
create index if not exists submitted_events_status on public.submitted_events (status, start_date);
alter table public.submitted_events enable row level security;

-- The browser can't choose its own status/owner: this trigger sets them from the signed-in account.
create or replace function public.submitted_events_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare em text; ok boolean;
begin
  if tg_op = 'INSERT' then
    select lower(u.email), (u.email_confirmed_at is not null) into em, ok from auth.users u where u.id = auth.uid();
    if em is null then raise exception 'sign in to submit an event'; end if;
    new.user_id := auth.uid(); new.submitter_email := em; new.created_at := now(); new.reviewed_at := null; new.reviewed_by := null;
    new.status := case when ok and exists (select 1 from public.approved_submitters s where s.email = em and s.instant) then 'live' else 'pending' end;
    if new.status = 'live' then new.reviewed_at := now(); new.reviewed_by := 'instant'; end if;
    update public.approved_submitters set user_id = auth.uid() where email = em and user_id is null;
  else  -- UPDATE (admins only, by policy)
    new.id := old.id; new.user_id := old.user_id; new.submitter_email := old.submitter_email; new.created_at := old.created_at;
    if new.status is distinct from old.status then new.reviewed_at := now(); new.reviewed_by := (select email from auth.users where id = auth.uid()); end if;
  end if;
  return new;
end $$;
drop trigger if exists submitted_events_guard on public.submitted_events;
create trigger submitted_events_guard before insert or update on public.submitted_events for each row execute function public.submitted_events_guard();

drop policy if exists "submissions: insert own" on public.submitted_events;
drop policy if exists "submissions: read own or admin" on public.submitted_events;
drop policy if exists "submissions: admin update" on public.submitted_events;
drop policy if exists "submissions: admin delete" on public.submitted_events;
create policy "submissions: insert own" on public.submitted_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "submissions: read own or admin" on public.submitted_events for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "submissions: admin update" on public.submitted_events for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "submissions: admin delete" on public.submitted_events for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.submitted_events to authenticated;

-- Public: only live rows, and no emails/phones/ids of people.
create or replace view public.live_events as
  select id, status, country, state, organisation_type, club, name, start_date, end_date, venue, discipline, registration_url, flyer_link, flyer_url, notes, created_at
  from public.submitted_events where status = 'live';
grant select on public.live_events to anon, authenticated;

-- 4. Flyer storage: public bucket (flyers are published anyway), images + PDF, 10 MB, upload only into your own folder ------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "event flyers: owner upload" on storage.objects;
drop policy if exists "event flyers: admin manage" on storage.objects;
create policy "event flyers: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "event flyers: admin manage" on storage.objects for delete to authenticated using (bucket_id = 'event-flyers' and public.is_admin());
