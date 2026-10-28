-- Archery Calendar: "Send us your calendar" inbox (any file, photo, link or pasted text) - 28 Oct 2026
-- Run once in Supabase > project archery-calendar (sllsqpfqwckwtljzjxli) > SQL Editor > New query > paste ALL of this > Run. Safe to re-run.
-- Needs these earlier files to have been run already (they have): instant_publishing.sql, admin_requests.sql (is_admin, email_preapproved, bot_tokens),
-- event_overrides.sql, flyer_only_publishing.sql.
-- ADDITIVE ONLY: two new tables, five new functions, one new nullable column on submitted_events. Nothing existing is changed, renamed or dropped.
--
-- What it makes
--   calendar_submissions        one row per "Send us your calendar" upload (who, note, pasted text, link, status, the events we read from it)
--   calendar_submission_files   the uploaded files, PRIVATE: kept as base64 text in this table (same way score_photos works), never in a public
--                               bucket and never with a public link. The file text itself can't be read from the browser by anyone (column grants);
--                               only the bot (token) and admins (calendar_file_data) can fetch it. Files are DELETED as soon as the events are
--                               published or the upload is rejected, and the bot purges anything older than 30 days.
--   calendar_publish()          admin, or the submitter themselves IF they are an approved submitter, publishes the checked events
--   calendar_reject()           admin turns an upload down (and deletes its files)
--   calendar_file_data()        admin downloads one stored file
--   bot_calendar_inbox()        the bot's token-checked way to list / read / file / save a preview / fail / purge (same token as bot_submission)
-- Why not a Storage bucket: the bot has no service key and a private bucket can only be read with one, so the bot could never read the files.

begin;
create extension if not exists pgcrypto with schema extensions;

alter table public.submitted_events add column if not exists register jsonb;
alter table public.submitted_events add column if not exists calendar_submission_id uuid;   -- which upload an event came from (never shown publicly)

-- 1. Uploads -------------------------------------------------------------------------------------------------------------------
create table if not exists public.calendar_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  submitter_email text,
  submitter_name text check (submitter_name is null or length(submitter_name) <= 80),
  role text check (role is null or length(role) <= 60),
  club text check (club is null or length(club) <= 120),
  note text check (note is null or length(note) <= 2000),
  pasted_text text check (pasted_text is null or length(pasted_text) <= 60000),
  link_url text check (link_url is null or (length(link_url) <= 500 and link_url ~* '^https?://')),
  file_count smallint not null default 0 check (file_count between 0 and 5),
  trusted boolean not null default false,                       -- approved submitter at upload time (set by the trigger, not the browser)
  status text not null default 'received' check (status in ('received', 'preview_ready', 'published', 'rejected', 'failed')),
  proposed jsonb not null default '[]'::jsonb,                  -- events the bot read from the upload, each with its source line and confidence
  bot_notes text check (bot_notes is null or length(bot_notes) <= 4000),
  reject_reason text check (reject_reason is null or length(reject_reason) <= 500),
  published_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  previewed_at timestamptz, reviewed_at timestamptz, reviewed_by text,
  check (file_count > 0 or length(trim(coalesce(pasted_text, ''))) > 0 or length(trim(coalesce(link_url, ''))) > 0)
);
create index if not exists calendar_submissions_status on public.calendar_submissions (status, created_at);
create index if not exists calendar_submissions_user on public.calendar_submissions (user_id, created_at desc);
alter table public.calendar_submissions enable row level security;

create or replace function public.calendar_submissions_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare em text; ok boolean;
begin
  if tg_op = 'INSERT' then
    select lower(u.email), (u.email_confirmed_at is not null) into em, ok from auth.users u where u.id = auth.uid();
    if em is null then raise exception 'sign in to send a calendar'; end if;
    if (select count(*) from public.calendar_submissions where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
      raise exception 'too many uploads today - please try again tomorrow'; end if;
    new.user_id := auth.uid(); new.submitter_email := em; new.created_at := now(); new.updated_at := now();
    new.trusted := coalesce(ok, false) and (public.email_preapproved(em) or public.is_admin());
    new.status := 'received'; new.proposed := '[]'::jsonb; new.bot_notes := null; new.reject_reason := null; new.published_count := 0;
    new.previewed_at := null; new.reviewed_at := null; new.reviewed_by := null;
  else
    new.id := old.id; new.user_id := old.user_id; new.submitter_email := old.submitter_email; new.created_at := old.created_at; new.trusted := old.trusted;
    new.updated_at := now();
    if new.status is distinct from old.status then
      if new.status = 'preview_ready' then new.previewed_at := now(); end if;
      if new.status in ('published', 'rejected') then new.reviewed_at := now(); new.reviewed_by := coalesce((select email from auth.users where id = auth.uid()), 'bot'); end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists calendar_submissions_guard on public.calendar_submissions;
create trigger calendar_submissions_guard before insert or update on public.calendar_submissions for each row execute function public.calendar_submissions_guard();

drop policy if exists "calendar uploads: insert own" on public.calendar_submissions;
drop policy if exists "calendar uploads: read own or admin" on public.calendar_submissions;
drop policy if exists "calendar uploads: admin update" on public.calendar_submissions;
drop policy if exists "calendar uploads: admin delete" on public.calendar_submissions;
create policy "calendar uploads: insert own" on public.calendar_submissions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "calendar uploads: read own or admin" on public.calendar_submissions for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "calendar uploads: admin update" on public.calendar_submissions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "calendar uploads: admin delete" on public.calendar_submissions for delete to authenticated using (public.is_admin());
revoke all on public.calendar_submissions from anon, authenticated;
grant select, insert, update, delete on public.calendar_submissions to authenticated;   -- RLS above decides who can do what

-- 2. Files (private) -----------------------------------------------------------------------------------------------------------
create table if not exists public.calendar_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.calendar_submissions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  mime text check (mime is null or length(mime) <= 120),
  size_bytes integer not null default 0,
  data text not null check (length(data) between 4 and 8400000),   -- base64, about 6 MB of file at most
  created_at timestamptz not null default now()
);
create index if not exists calendar_submission_files_sub on public.calendar_submission_files (submission_id);
alter table public.calendar_submission_files enable row level security;

create or replace function public.calendar_submission_files_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s public.calendar_submissions; n int; tot bigint;
begin
  select * into s from public.calendar_submissions where id = new.submission_id;
  if s.id is null or s.user_id is distinct from auth.uid() or s.status <> 'received' then raise exception 'that upload is not open for files'; end if;
  select count(*), coalesce(sum(length(data)), 0) into n, tot from public.calendar_submission_files where submission_id = new.submission_id;
  if n >= s.file_count then raise exception 'too many files for this upload'; end if;
  if tot + length(new.data) > 20000000 then raise exception 'those files are too big together'; end if;
  new.user_id := auth.uid(); new.size_bytes := (length(new.data) * 3 / 4)::int; new.created_at := now();
  return new;
end $$;
drop trigger if exists calendar_submission_files_guard on public.calendar_submission_files;
create trigger calendar_submission_files_guard before insert on public.calendar_submission_files for each row execute function public.calendar_submission_files_guard();

drop policy if exists "calendar files: insert own" on public.calendar_submission_files;
drop policy if exists "calendar files: read own or admin" on public.calendar_submission_files;
drop policy if exists "calendar files: admin delete" on public.calendar_submission_files;
create policy "calendar files: insert own" on public.calendar_submission_files for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.calendar_submissions s where s.id = submission_id and s.user_id = (select auth.uid())));
create policy "calendar files: read own or admin" on public.calendar_submission_files for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "calendar files: admin delete" on public.calendar_submission_files for delete to authenticated using (public.is_admin());
revoke all on public.calendar_submission_files from anon, authenticated;
grant insert (submission_id, name, mime, data) on public.calendar_submission_files to authenticated;
grant select (id, submission_id, user_id, name, mime, size_bytes, created_at) on public.calendar_submission_files to authenticated;   -- NOT data
grant delete on public.calendar_submission_files to authenticated;

-- 3. Admin: download one stored file (base64) ----------------------------------------------------------------------------------
create or replace function public.calendar_file_data(p_file uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.calendar_submission_files;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into f from public.calendar_submission_files where id = p_file;
  if f.id is null then raise exception 'no such file (files are deleted once an upload is finished)'; end if;
  return jsonb_build_object('name', f.name, 'mime', f.mime, 'data', f.data);
end $$;
revoke all on function public.calendar_file_data(uuid) from public;
grant execute on function public.calendar_file_data(uuid) to authenticated;

-- 4. Publish the checked events ------------------------------------------------------------------------------------------------
-- Allowed: an admin (any upload that has a preview), or the submitter when they were an approved submitter at upload time (their own preview).
-- Events go through the same submitted_events rules as the single-event form: the guard trigger decides live or pending, an event the
-- same club already has on the same day with the same name is skipped, and the table's own checks apply (length limits, dates).
create or replace function public.calendar_publish(p_id uuid, p_events jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.calendar_submissions; e jsonb; n int := 0; skipped int := 0; new_id uuid; adm boolean := public.is_admin(); sd date; ed date; st text;
begin
  select * into s from public.calendar_submissions where id = p_id for update;
  if s.id is null then raise exception 'no such upload'; end if;
  if not (adm or (s.user_id = auth.uid() and s.trusted)) then raise exception 'not allowed'; end if;
  if s.status <> 'preview_ready' then raise exception 'this upload has no preview waiting'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 150 then raise exception 'send up to 150 events at a time'; end if;
  for e in select * from jsonb_array_elements(p_events) loop
    begin sd := nullif(e->>'start_date', '')::date; ed := coalesce(nullif(e->>'end_date', '')::date, sd); exception when others then sd := null; end;
    if sd is null or coalesce(trim(e->>'name'), '') = '' or coalesce(trim(e->>'club'), '') = '' or coalesce(trim(e->>'venue'), '') = '' then skipped := skipped + 1; continue; end if;
    if exists (select 1 from public.submitted_events x where x.status <> 'rejected' and lower(x.club) = lower(e->>'club') and x.start_date = sd and lower(x.name) = lower(e->>'name')) then
      skipped := skipped + 1; continue; end if;
    insert into public.submitted_events (country, state, organisation_type, club, submitter_name, role, contact_email, name, start_date, end_date, venue, discipline,
                                         registration_url, register, notes, calendar_submission_id)
    values (coalesce(nullif(e->>'country', ''), 'AU'), nullif(e->>'state', ''), nullif(e->>'organisation_type', ''), left(e->>'club', 120), left(s.submitter_name, 80), left(s.role, 60),
            left(coalesce(nullif(e->>'contact_email', ''), s.submitter_email), 200), left(e->>'name', 140), sd, ed, left(e->>'venue', 200), nullif(e->>'discipline', ''),
            nullif(e->>'registration_url', ''), case when jsonb_typeof(e->'register') = 'array' then e->'register' else null end, left(nullif(e->>'notes', ''), 1900), s.id)
    returning id, status into new_id, st;
    if adm and st <> 'live' then update public.submitted_events set status = 'live' where id = new_id; end if;   -- the admin has just checked it
    n := n + 1;
  end loop;
  update public.calendar_submissions set status = 'published', published_count = n where id = s.id;
  delete from public.calendar_submission_files where submission_id = s.id;   -- the files are no longer needed
  return jsonb_build_object('published', n, 'skipped', skipped);
end $$;
revoke all on function public.calendar_publish(uuid, jsonb) from public;
grant execute on function public.calendar_publish(uuid, jsonb) to authenticated;

-- 5. Admin turns an upload down ------------------------------------------------------------------------------------------------
create or replace function public.calendar_reject(p_id uuid, p_reason text default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.calendar_submissions set status = 'rejected', reject_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 500) where id = p_id and status <> 'published';
  delete from public.calendar_submission_files where submission_id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.calendar_reject(uuid, text) from public;
grant execute on function public.calendar_reject(uuid, text) to authenticated;

-- 6. Bot access (no service-role key; same token as bot_submission / bot_manage_submitter) -----------------------------------------
--   list      -> uploads waiting to be read (status received, all files saved), or p_fields {"status":"preview_ready"|"all"} for others
--   get       -> one upload: note, pasted text, link, who, the file list (no file text)
--   file      -> p_fields {"file_id": "..."}: one file as base64
--   preview   -> p_fields {"proposed": [...], "notes": "..."}: saves the events we read; status becomes preview_ready
--   fail      -> p_fields {"notes": "..."}: could not read it; status failed
--   purge     -> deletes files older than 30 days and files of finished uploads
create or replace function public.bot_calendar_inbox(p_token text, p_action text, p_id uuid default null, p_fields jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare f jsonb := coalesce(p_fields, '{}'::jsonb); s public.calendar_submissions; fl public.calendar_submission_files; k int;
begin
  if p_token is null or not exists (select 1 from bot_tokens where token_hash = encode(digest(p_token, 'sha256'), 'hex')) then raise exception 'bad token'; end if;
  if p_action = 'list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'trusted', c.trusted, 'club', c.club, 'submitter_email', c.submitter_email,
              'file_count', c.file_count, 'files_saved', (select count(*) from calendar_submission_files x where x.submission_id = c.id),
              'has_text', length(trim(coalesce(c.pasted_text, ''))) > 0, 'link_url', c.link_url, 'created_at', c.created_at) order by c.created_at), '[]'::jsonb)
            from calendar_submissions c
            where case coalesce(f->>'status', 'received') when 'all' then true else c.status = coalesce(f->>'status', 'received') end);
  elsif p_action = 'purge' then
    delete from calendar_submission_files where created_at < now() - interval '30 days'
       or submission_id in (select id from calendar_submissions where status in ('published', 'rejected'));
    get diagnostics k = row_count;
    return jsonb_build_object('ok', true, 'files_deleted', k);
  end if;
  if p_id is null then raise exception 'p_id needed'; end if;
  select * into s from calendar_submissions where id = p_id;
  if s.id is null then raise exception 'no such upload'; end if;
  if p_action = 'get' then
    return to_jsonb(s) || jsonb_build_object('files', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'mime', x.mime, 'size_bytes', x.size_bytes) order by x.created_at), '[]'::jsonb)
                                                       from calendar_submission_files x where x.submission_id = s.id));
  elsif p_action = 'file' then
    select * into fl from calendar_submission_files where id = nullif(f->>'file_id', '')::uuid and submission_id = s.id;
    if fl.id is null then raise exception 'no such file'; end if;
    return jsonb_build_object('name', fl.name, 'mime', fl.mime, 'data', fl.data);
  elsif p_action in ('preview', 'fail') and s.status in ('published', 'rejected') then raise exception 'this upload is already finished';
  elsif p_action = 'preview' then
    if jsonb_typeof(f->'proposed') <> 'array' then raise exception 'proposed must be a list'; end if;
    update calendar_submissions set proposed = f->'proposed', bot_notes = left(f->>'notes', 4000), status = 'preview_ready' where id = s.id;
    return jsonb_build_object('ok', true, 'events', jsonb_array_length(f->'proposed'), 'trusted', s.trusted);
  elsif p_action = 'fail' then
    update calendar_submissions set status = 'failed', bot_notes = left(f->>'notes', 4000) where id = s.id;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'action must be list, get, file, preview, fail or purge';
end $$;
revoke all on function public.bot_calendar_inbox(text, text, uuid, jsonb) from public;
grant execute on function public.bot_calendar_inbox(text, text, uuid, jsonb) to anon, authenticated;

commit;

-- Checks afterwards (read-only, optional):
-- select count(*) from public.calendar_submissions;                                   -- 0 to start with
-- select has_column_privilege('authenticated', 'public.calendar_submission_files', 'data', 'select');   -- must say false
