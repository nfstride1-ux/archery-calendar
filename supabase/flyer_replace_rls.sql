-- Flyer replace on Save live. Project archery-calendar (sllsqpfqwckwtljzjxli).
-- Supabase → SQL Editor → New query → paste this file → Run. Safe to run again. All-or-nothing.
--
-- Why Save live says "Flyer upload failed: new row violates row-level security policy":
-- The fix form uploads with upsert. Storage then runs INSERT ... ON CONFLICT DO UPDATE RETURNING *
-- on storage.objects. The INSERT policy "event flyers: admin overrides insert" allows every admin
-- (public.is_admin(), not one email) to add a file under overrides/. There was no SELECT policy on
-- that row, so Postgres cannot return it and rejects the whole statement with that error.
-- It fails for every admin. Approved editors (approved_submitters / approved_domains) are not admins,
-- so that same INSERT policy refuses them too.
--
-- This adds the missing SELECT (and UPDATE, so a file can be replaced) for every person who is
-- already allowed to publish: all admins, and approved editors. Signed-in people can still only
-- write their own folder. Anonymous users get no write.

begin;

create or replace function public.can_publish_live() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    else coalesce((
      select u.email_confirmed_at is not null and public.email_preapproved(u.email)
      from auth.users u where u.id = auth.uid()
    ), false)
  end;
$$;
revoke all on function public.can_publish_live() from public;
grant execute on function public.can_publish_live() to authenticated;

-- overrides/: read-back (SELECT) plus insert and replace (UPDATE) for every permitted editor.
-- The older admin-only insert/update policies stay; these add the people those policies skip.
drop policy if exists "event flyers: admin overrides select" on storage.objects;
drop policy if exists "event flyers: editors overrides insert" on storage.objects;
drop policy if exists "event flyers: editors overrides select" on storage.objects;
drop policy if exists "event flyers: editors overrides update" on storage.objects;
create policy "event flyers: admin overrides select" on storage.objects for select to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.is_admin());
create policy "event flyers: editors overrides insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.can_publish_live());
create policy "event flyers: editors overrides select" on storage.objects for select to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.can_publish_live());
create policy "event flyers: editors overrides update" on storage.objects for update to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.can_publish_live())
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = 'overrides' and public.can_publish_live());

-- Own folder: the submit form already inserts here. SELECT and UPDATE let that same person replace their file.
drop policy if exists "event flyers: owner select" on storage.objects;
drop policy if exists "event flyers: owner update" on storage.objects;
create policy "event flyers: owner select" on storage.objects for select to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "event flyers: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Same editors can write the listing change, not only the file. Delete stays admin-only (unchanged).
drop policy if exists "overrides: editors insert" on public.event_overrides;
drop policy if exists "overrides: editors update" on public.event_overrides;
create policy "overrides: editors insert" on public.event_overrides for insert to authenticated
  with check (public.can_publish_live());
create policy "overrides: editors update" on public.event_overrides for update to authenticated
  using (public.can_publish_live()) with check (public.can_publish_live());

commit;
