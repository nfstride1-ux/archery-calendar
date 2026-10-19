-- Archery Calendar: flyer-only instant publishing (owner approved 20 Oct 2026).
-- Project archery-calendar (sllsqpfqwckwtljzjxli). Supabase -> SQL Editor -> New query -> paste -> Run. Safe to re-run. All-or-nothing.
-- Needs instant_publishing.sql, admin_requests.sql and event_overrides.sql (already run).
--
-- What it does
--  * An APPROVED submitter (approved_submitters / approved_domains) or an admin can save a flyer with no event name or date.
--    The row goes live straight away with details_pending = true, name 'New event (details coming)', start_date NULL.
--    The site shows it in a "New flyers, details coming" strip, never as a dated calendar event. No date is ever invented.
--  * Anyone NOT approved still can't do this: a flyer-only insert from them is refused (the site then emails it in for review),
--    and their complete submissions still land as 'pending' exactly as before.
--  * When the bot (or an admin) fills in the real name + start date from the flyer, details_pending clears itself.
--  * bot_submission(): the bot's token-checked way to list / fill in / delete these rows (same token as bot_manage_submitter).
begin;

-- 1. Columns / constraints ------------------------------------------------------------------------------------------------
alter table public.submitted_events add column if not exists details_pending boolean not null default false;
alter table public.submitted_events alter column start_date drop not null;
alter table public.submitted_events drop constraint if exists submitted_events_date_or_pending;
alter table public.submitted_events add constraint submitted_events_date_or_pending
  check (start_date is not null or details_pending);

-- 2. Guard trigger (same as admin_requests.sql, plus flyer-only handling) -------------------------------------------------
create or replace function public.submitted_events_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare em text; ok boolean; ap_club text;
begin
  if tg_op = 'INSERT' then
    select lower(u.email), (u.email_confirmed_at is not null) into em, ok from auth.users u where u.id = auth.uid();
    if em is null then raise exception 'sign in to submit an event'; end if;
    new.user_id := auth.uid(); new.submitter_email := em; new.created_at := now(); new.reviewed_at := null; new.reviewed_by := null;
    new.status := case when ok and (public.email_preapproved(em) or public.is_admin()) then 'live' else 'pending' end;
    if new.status = 'live' then new.reviewed_at := now(); new.reviewed_by := 'instant'; end if;
    -- flyer only = no event name or no start date. The browser can't set details_pending itself.
    new.details_pending := (new.start_date is null or coalesce(trim(new.name), '') = '');
    if new.details_pending then
      if new.status <> 'live' then raise exception 'flyer-only submissions need an approved submitter (sent for review by email instead)'; end if;
      if coalesce(new.flyer_path, '') = '' and coalesce(new.flyer_url, '') = '' and coalesce(new.flyer_link, '') = '' then
        raise exception 'a flyer-only submission needs the flyer'; end if;
      if coalesce(trim(new.name), '') = '' then new.name := 'New event (details coming)'; end if;
      if coalesce(trim(new.club), '') = '' then
        select s.club into ap_club from approved_submitters s where s.email = em and s.instant;
        new.club := coalesce(nullif(trim(ap_club), ''), 'Club (details coming)'); end if;
      if coalesce(trim(new.venue), '') = '' then new.venue := 'See flyer'; end if;
      if new.start_date is null then new.end_date := null; end if;
    end if;
    update public.approved_submitters set user_id = auth.uid() where email = em and user_id is null;
  else  -- UPDATE (admins by policy, or bot_submission)
    new.id := old.id; new.user_id := old.user_id; new.submitter_email := old.submitter_email; new.created_at := old.created_at;
    if new.status is distinct from old.status then new.reviewed_at := now(); new.reviewed_by := coalesce((select email from auth.users where id = auth.uid()), 'bot'); end if;
    -- details are in once there is a real name and a start date
    new.details_pending := (new.start_date is null or coalesce(trim(new.name), '') in ('', 'New event (details coming)'));
  end if;
  return new;
end $$;

-- 3. Public view: same columns as before + details_pending at the end. Keeps security_invoker if it was turned on. -------------
do $$
declare inv boolean := coalesce((select option_value::boolean from pg_options_to_table((select reloptions from pg_class where oid = 'public.live_events'::regclass))
                                 where option_name = 'security_invoker'), false);
begin
  execute $v$create or replace view public.live_events as
    select id, status, country, state, organisation_type, club, name, start_date, end_date, venue, discipline, registration_url,
           flyer_link, flyer_url, notes, created_at, register, details_pending
    from public.submitted_events where status = 'live'$v$;
  if inv then execute 'alter view public.live_events set (security_invoker = on)'; end if;
end $$;
grant select on public.live_events to anon, authenticated;
grant select (details_pending) on public.submitted_events to anon;   -- needed only if fix_live_events_security_invoker.sql was run

-- 4. Bot access (no service-role key, same token as bot_manage_submitter) ---------------------------------------------------
--   list   -> live rows still waiting for details (with flyer + submitter)
--   fill   -> p_fields jsonb: club, name, start_date, end_date, venue, state, country, organisation_type, discipline, registration_url, notes
--   delete -> remove one row (the flyer file stays in storage; remove it in Storage -> event-flyers if wanted)
create or replace function public.bot_submission(p_token text, p_action text, p_id uuid default null, p_fields jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare f jsonb := coalesce(p_fields, '{}'::jsonb); r public.submitted_events;
begin
  if p_token is null or not exists (select 1 from bot_tokens where token_hash = encode(digest(p_token, 'sha256'), 'hex')) then
    raise exception 'bad token'; end if;
  if p_action = 'list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'club', club, 'name', name, 'flyer_url', flyer_url, 'flyer_link', flyer_link,
              'notes', notes, 'submitter_email', submitter_email, 'created_at', created_at) order by created_at), '[]')
            from submitted_events where status = 'live' and details_pending);
  end if;
  if p_id is null then raise exception 'p_id needed'; end if;
  if p_action = 'fill' then
    update submitted_events set
      club = coalesce(nullif(f->>'club', ''), club), name = coalesce(nullif(f->>'name', ''), name),
      start_date = coalesce(nullif(f->>'start_date', '')::date, start_date),
      end_date = coalesce(nullif(f->>'end_date', '')::date, nullif(f->>'start_date', '')::date, end_date),
      venue = coalesce(nullif(f->>'venue', ''), venue), state = coalesce(nullif(f->>'state', ''), state),
      country = coalesce(nullif(f->>'country', ''), country), organisation_type = coalesce(nullif(f->>'organisation_type', ''), organisation_type),
      discipline = coalesce(nullif(f->>'discipline', ''), discipline), registration_url = coalesce(nullif(f->>'registration_url', ''), registration_url),
      notes = coalesce(nullif(f->>'notes', ''), notes)
    where id = p_id returning * into r;
    if r.id is null then raise exception 'no such submission'; end if;
    return jsonb_build_object('ok', true, 'id', r.id, 'name', r.name, 'start_date', r.start_date, 'details_pending', r.details_pending);
  elsif p_action = 'delete' then
    delete from submitted_events where id = p_id returning * into r;
    if r.id is null then raise exception 'no such submission'; end if;
    return jsonb_build_object('ok', true, 'deleted', r.id, 'flyer_path', r.flyer_path);
  end if;
  raise exception 'action must be list, fill or delete';
end $$;
revoke all on function public.bot_submission(text, text, uuid, jsonb) from public;
grant execute on function public.bot_submission(text, text, uuid, jsonb) to anon, authenticated;

commit;

-- Check afterwards (read-only):
-- select column_name, is_nullable from information_schema.columns where table_name = 'submitted_events' and column_name in ('start_date', 'details_pending');
-- select pg_get_viewdef('public.live_events'::regclass, true);
