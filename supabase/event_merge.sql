-- Archery Calendar: "Update the listed event" from Submit an event (owner request 30 Oct 2026).
-- Project archery-calendar (sllsqpfqwckwtljzjxli). Supabase -> SQL Editor -> New query -> paste -> Run. Safe to re-run. All-or-nothing.
-- Needs instant_publishing.sql, admin_requests.sql, event_overrides.sql and flyer_only_publishing.sql (already run).
--
-- What it does
--  * When a flyer matches an event that is already on the calendar, the submit page can send it as an UPDATE to that event
--    instead of a new event. The row is saved in submitted_events like any submission, plus:
--      updates_event_id  the listed event's id (e.g. awa-baldivis-breakfast-2026), so its URL, My events saves and ticks keep working
--      merge_fields      only the fields the submitter chose to change (same keys as event_overrides.fields)
--  * Same approval rules as new events (the guard trigger is unchanged): admins and approved submitters (approved_submitters /
--    approved_domains) are 'live' at once, so the update applies straight away. Anyone else's update is 'pending' and shows in
--    #/admin; approving it (status -> live) applies it then.
--  * Applying = merge merge_fields over public.event_overrides for that event (the same table admin "Fix an event" writes).
--    The previous override is kept in prev_fields on the submission row, so an admin can undo it from #/admin.
--  * Update rows never show as events of their own (the live_events view skips them).
begin;

-- 1. Columns ---------------------------------------------------------------------------------------------------------------
alter table public.submitted_events add column if not exists updates_event_id text;
alter table public.submitted_events add column if not exists merge_fields jsonb;
alter table public.submitted_events add column if not exists prev_fields jsonb;
alter table public.submitted_events add column if not exists applied_at timestamptz;
alter table public.submitted_events drop constraint if exists submitted_events_updates_event_id_ok;
alter table public.submitted_events add constraint submitted_events_updates_event_id_ok
  check (updates_event_id is null or (updates_event_id ~ '^[A-Za-z0-9_.:-]{1,160}$'
         and merge_fields is not null and jsonb_typeof(merge_fields) = 'object' and octet_length(merge_fields::text) <= 20000));

-- 2. Apply an approved update to event_overrides (runs after the guard, so status is final) ------------------------------
--    Only known override keys are copied; anything else in merge_fields is ignored.
create or replace function public.submitted_events_merge() returns trigger language plpgsql security definer set search_path = public as $$
declare keys text[] := array['name','discipline','start_date','end_date','start_times','location','rounds','divisions','entry_close_date','contact',
  'register','bank_account_name','bank_bsb','bank_account','bank_reference','registration_url','registration_url_kind','cancelled','notes',
  'flyer_url','flyer_web','flyer_web_sm','flyer_is_pdf','flyer_label','flyer_year','flyer_is_current','flyer_source_name','org_status','last_checked'];
  f jsonb; cur jsonb;
begin
  if tg_op = 'UPDATE' then   -- the target and the change list can't be swapped after the row is in
    new.updates_event_id := old.updates_event_id;
    if old.applied_at is not null then new.merge_fields := old.merge_fields; new.prev_fields := old.prev_fields; new.applied_at := old.applied_at; end if;
  elsif tg_op = 'INSERT' then new.prev_fields := null; new.applied_at := null;
  end if;
  if new.updates_event_id is null or new.status <> 'live' or new.applied_at is not null then return new; end if;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into f from jsonb_each(coalesce(new.merge_fields, '{}'::jsonb)) as e(k, v) where k = any(keys);
  f := f || jsonb_build_object('last_checked', to_char(now() at time zone 'Australia/Perth', 'YYYY-MM-DD'));
  select o.fields into cur from event_overrides o where o.event_id = new.updates_event_id for update;
  new.prev_fields := coalesce(cur, '{}'::jsonb);
  insert into event_overrides (event_id, fields, updated_by) values (new.updates_event_id, coalesce(cur, '{}'::jsonb) || f, 'update from ' || coalesce(new.submitter_email, 'submit form'))
    on conflict (event_id) do update set fields = coalesce(event_overrides.fields, '{}'::jsonb) || excluded.fields, updated_by = excluded.updated_by;
  new.applied_at := now();
  return new;
end $$;
drop trigger if exists submitted_events_merge on public.submitted_events;
-- BEFORE trigger, named so it sorts after submitted_events_guard (triggers fire in name order) and sees the final status.
create trigger submitted_events_merge before insert or update on public.submitted_events for each row execute function public.submitted_events_merge();

-- 3. Public view: same columns as flyer_only_publishing.sql, minus update rows. Keeps security_invoker if it was turned on. --
do $$
declare inv boolean := coalesce((select option_value::boolean from pg_options_to_table((select reloptions from pg_class where oid = 'public.live_events'::regclass))
                                 where option_name = 'security_invoker'), false);
begin
  execute $v$create or replace view public.live_events as
    select id, status, country, state, organisation_type, club, name, start_date, end_date, venue, discipline, registration_url,
           flyer_link, flyer_url, notes, created_at, register, details_pending
    from public.submitted_events where status = 'live' and updates_event_id is null$v$;
  if inv then execute 'alter view public.live_events set (security_invoker = on)'; end if;
end $$;
grant select on public.live_events to anon, authenticated;
grant select (updates_event_id) on public.submitted_events to anon;   -- needed only if fix_live_events_security_invoker.sql was run

commit;

-- Check afterwards (read-only):
-- select column_name from information_schema.columns where table_name = 'submitted_events' and column_name in ('updates_event_id','merge_fields','prev_fields','applied_at');
-- select tgname from pg_trigger where tgrelid = 'public.submitted_events'::regclass and not tgisinternal order by tgname;
-- select id, status, updates_event_id, applied_at from public.submitted_events where updates_event_id is not null order by created_at desc limit 10;
