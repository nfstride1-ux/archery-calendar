-- Archery Calendar: admin live edits ("Fix an event" saves straight to the site for admins).
-- Run once in the Supabase SQL editor. Needs public.admins + public.is_admin() from instant_publishing.sql.
-- Safe to run again.

-- 1. Admins (UI already treats both as admin; this makes the database agree)
insert into public.admins (email) values ('nfshold@gmail.com'), ('nfstride1@gmail.com') on conflict do nothing;

-- 2. Overrides table: one row per event, only the changed fields as jsonb
create table if not exists public.event_overrides (
  event_id   text primary key,
  fields     jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.event_overrides enable row level security;

drop policy if exists "overrides: public read"   on public.event_overrides;
drop policy if exists "overrides: admin insert"  on public.event_overrides;
drop policy if exists "overrides: admin update"  on public.event_overrides;
drop policy if exists "overrides: admin delete"  on public.event_overrides;
create policy "overrides: public read"  on public.event_overrides for select to anon, authenticated using (true);
create policy "overrides: admin insert" on public.event_overrides for insert to authenticated with check (public.is_admin());
create policy "overrides: admin update" on public.event_overrides for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "overrides: admin delete" on public.event_overrides for delete to authenticated using (public.is_admin());
grant select on public.event_overrides to anon, authenticated;
grant insert, update, delete on public.event_overrides to authenticated;

-- stamp who/when on every write (can't be faked from the browser)
create or replace function public.event_overrides_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select email from auth.users where id = auth.uid()), new.updated_by);
  return new;
end $$;
drop trigger if exists event_overrides_stamp on public.event_overrides;
create trigger event_overrides_stamp before insert or update on public.event_overrides for each row execute function public.event_overrides_stamp();

-- 3. Flyer uploads: admins only, under overrides/ in the public event-flyers bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "event flyers: admin overrides insert" on storage.objects;
drop policy if exists "event flyers: admin overrides update" on storage.objects;
create policy "event flyers: admin overrides insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin());
create policy "event flyers: admin overrides update" on storage.objects for update to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin())
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin());
