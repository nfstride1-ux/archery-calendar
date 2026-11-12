-- Proves supabase/flyer_replace_rls.sql against a throwaway database.
-- Run: sudo -u postgres psql -d flyer_rls -v ON_ERROR_STOP=1 -f scripts/flyer_rls_test.sql
-- (the database is created by scripts/flyer_rls_test.py)
\set ON_ERROR_STOP on

create schema if not exists auth;
create schema if not exists storage;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

grant usage on schema public, auth, storage to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create table if not exists public.admins (email text primary key);
create table if not exists public.approved_submitters (
  email text primary key,
  instant boolean not null default true
);
create table if not exists public.approved_domains (domain text primary key);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email)
                 where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;

create or replace function public.email_preapproved(em text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from approved_submitters where email = lower(em) and instant)
      or exists (select 1 from approved_domains d where lower(split_part(em, '@', 2)) = d.domain);
$$;

grant execute on function auth.uid() to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.email_preapproved(text) to anon, authenticated;

drop table if exists storage.objects;
create table storage.objects (
  id bigint generated always as identity primary key,
  bucket_id text,
  name text
);
drop table if exists public.event_overrides;
create table public.event_overrides (
  event_id text primary key,
  fields jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
alter table storage.objects force row level security;
alter table public.event_overrides enable row level security;
alter table public.event_overrides force row level security;

-- Policies already live on production before flyer_replace_rls.sql (no SELECT on event-flyers).
create policy "event flyers: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "event flyers: admin overrides insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin());
create policy "event flyers: admin overrides update" on storage.objects for update to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin())
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin());
create policy "overrides: public read" on public.event_overrides for select to anon, authenticated using (true);
create policy "overrides: admin insert" on public.event_overrides for insert to authenticated with check (public.is_admin());
create policy "overrides: admin update" on public.event_overrides for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "overrides: admin delete" on public.event_overrides for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select, insert, update, delete on public.event_overrides to anon, authenticated;
grant usage, select on all sequences in schema storage to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other.admin@example.com', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'events@archerywa.com.au', now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'stranger@example.com', now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pending@archerywa.com.au', null);
insert into public.admins (email) values ('other.admin@example.com');
insert into public.approved_submitters (email, instant) values
  ('events@archerywa.com.au', true),
  ('pending@archerywa.com.au', true);

\ir ../supabase/flyer_replace_rls.sql

-- The bug: INSERT is allowed, but RETURNING (what storage upsert does) is rejected until a SELECT policy exists.
begin;
savepoint noselect;
drop policy "event flyers: admin overrides select" on storage.objects;
drop policy "event flyers: editors overrides select" on storage.objects;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
do $$
begin
  insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/plain.jpg');
exception when others then
  raise exception 'plain insert should pass the INSERT policy, got: %', sqlerrm;
end $$;
do $$
declare n text;
begin
  insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/returning.jpg') returning name into n;
  raise exception 'RETURNING succeeded with no SELECT policy';
exception when insufficient_privilege then
  if sqlerrm not like '%new row violates row-level security policy%' then
    raise exception 'unexpected error: %', sqlerrm;
  end if;
end $$;
reset role;
rollback to savepoint noselect;

-- Policies restored. An admin who is not the site owner can insert, read back, and replace.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/breakfast.jpg') returning name;
update storage.objects set name = 'overrides/breakfast-replaced.jpg' where name = 'overrides/breakfast.jpg';
do $$
begin
  if not exists (select 1 from storage.objects where name = 'overrides/breakfast-replaced.jpg') then
    raise exception 'admin replace did not update the flyer object';
  end if;
end $$;
insert into public.event_overrides (event_id, fields) values ('awa-baldivis-breakfast-2026', '{"flyer_label":"first"}');
update public.event_overrides set fields = '{"flyer_label":"replaced"}' where event_id = 'awa-baldivis-breakfast-2026';
reset role;

-- A different approved editor, not an admin, can do the same. They cannot delete the listing row.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/editor.jpg') returning name;
update storage.objects set name = 'overrides/editor-replaced.jpg' where name = 'overrides/editor.jpg';
update public.event_overrides set fields = '{"flyer_label":"editor"}' where event_id = 'awa-baldivis-breakfast-2026';
do $$
begin
  if not exists (select 1 from storage.objects where name = 'overrides/editor-replaced.jpg') then
    raise exception 'approved editor could not replace a flyer';
  end if;
  delete from public.event_overrides where event_id = 'awa-baldivis-breakfast-2026';
  if not exists (select 1 from public.event_overrides where event_id = 'awa-baldivis-breakfast-2026') then
    raise exception 'approved editor was allowed to delete an override';
  end if;
end $$;
reset role;

-- A signed-in person with no publish permission cannot write overrides/ or the listing.
-- They can insert, read back, and replace a file in their own folder only.
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);
do $$
begin
  insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/stranger.jpg') returning name;
  raise exception 'stranger wrote overrides/';
exception when insufficient_privilege then
  null;
end $$;
do $$
begin
  update public.event_overrides set fields = '{"flyer_label":"nope"}' where event_id = 'awa-baldivis-breakfast-2026';
  if found then raise exception 'stranger updated the listing'; end if;
end $$;
insert into storage.objects (bucket_id, name) values ('event-flyers', 'cccccccc-cccc-cccc-cccc-cccccccccccc/mine.jpg') returning name;
update storage.objects set name = 'cccccccc-cccc-cccc-cccc-cccccccccccc/mine-replaced.jpg'
  where name = 'cccccccc-cccc-cccc-cccc-cccccccccccc/mine.jpg';
do $$
begin
  update storage.objects set name = 'overrides/stolen.jpg' where name = 'overrides/editor-replaced.jpg';
  if found then raise exception 'stranger replaced someone else''s flyer'; end if;
end $$;
reset role;

-- Approved but email not confirmed: no live write.
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false);
do $$
begin
  insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/unconfirmed.jpg') returning name;
  raise exception 'unconfirmed editor wrote overrides/';
exception when insufficient_privilege then
  null;
end $$;
reset role;

-- Anonymous: no write.
set role anon;
do $$
begin
  insert into storage.objects (bucket_id, name) values ('event-flyers', 'overrides/anon.jpg');
  raise exception 'anon wrote a flyer';
exception when insufficient_privilege then
  null;
end $$;
do $$
begin
  insert into public.event_overrides (event_id, fields) values ('anon-event', '{}');
  raise exception 'anon wrote a listing';
exception when insufficient_privilege then
  null;
end $$;
reset role;

commit;
