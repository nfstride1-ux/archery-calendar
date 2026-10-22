-- Archery Calendar <- ScoreTool: a photo for a ScoreTool score (score sheet, target, the day), shown only to the archer in My events.
-- ADDITIVE ONLY: one new table and two new functions. Nothing existing is altered, renamed or dropped.
-- Needs supabase/scoretool_scores.sql first (it uses public.scoretool_links). Safe to run more than once.
-- Run in Supabase > SQL Editor (project sllsqpfqwckwtljzjxli), then reload the site.
--
-- Same token check as scoretool_save_score(): ScoreTool holds the archer's link secret (48 hex chars); only its SHA-256 hash is
-- stored. The secret can ONLY add, replace or remove that archer's own photos. It can't read anything.
-- The phone shrinks each photo first (long edge about 640px, JPEG about 40 KB, plus a 96px thumb), so photos are kept in this
-- private table as base64 JPEG (no public bucket, no public URL). Only the owner can read them (RLS: user_id = auth.uid()).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.score_photos (
  user_id     uuid not null references auth.users(id) on delete cascade,
  source      text not null default 'scoretool' check (source in ('scoretool')),
  source_id   text not null check (char_length(source_id) between 1 and 80),   -- same as score_entries.source_id (<tester>:<session id>)
  photo       text not null check (char_length(photo) between 100 and 200000 and photo ~ '^/9j/[A-Za-z0-9+/]+=*$'),   -- base64 JPEG
  thumb       text not null check (char_length(thumb) between 100 and 40000 and thumb ~ '^/9j/[A-Za-z0-9+/]+=*$'),
  width       integer check (width is null or width between 1 and 2000),
  height      integer check (height is null or height between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, source, source_id)
);
alter table public.score_photos enable row level security;
drop policy if exists "own photos: read" on public.score_photos;
create policy "own photos: read" on public.score_photos for select to authenticated using (user_id = auth.uid());
drop policy if exists "own photos: delete" on public.score_photos;
create policy "own photos: delete" on public.score_photos for delete to authenticated using (user_id = auth.uid());
-- no insert/update policies: rows are only written by scoretool_save_photo() for the linked account

-- 1) ScoreTool adds or replaces the photo for one score (same source_id again = replace)
create or replace function public.scoretool_save_photo(p_token text, p_source_id text, p_photo text, p_thumb text,
  p_width integer default null, p_height integer default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; n int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'not linked' using errcode = '28000'; end if;
  select user_id into uid from public.scoretool_links where token_hash = extensions.digest(p_token, 'sha256');
  if uid is null then raise exception 'not linked' using errcode = '28000'; end if;
  select count(*) into n from public.score_photos where user_id = uid;
  if n >= 3000 and not exists (select 1 from public.score_photos where user_id = uid and source = 'scoretool' and source_id = p_source_id)
    then raise exception 'too many photos'; end if;
  insert into public.score_photos(user_id, source, source_id, photo, thumb, width, height)
  values (uid, 'scoretool', p_source_id, p_photo, p_thumb, p_width, p_height)
  on conflict (user_id, source, source_id) do update set photo = excluded.photo, thumb = excluded.thumb,
    width = excluded.width, height = excluded.height, updated_at = now();
  update public.scoretool_links set last_used_at = now() where token_hash = extensions.digest(p_token, 'sha256');
  return jsonb_build_object('ok', true);
end $$;

-- 2) ScoreTool removes the photo for one score
create or replace function public.scoretool_remove_photo(p_token text, p_source_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'not linked' using errcode = '28000'; end if;
  select user_id into uid from public.scoretool_links where token_hash = extensions.digest(p_token, 'sha256');
  if uid is null then raise exception 'not linked' using errcode = '28000'; end if;
  delete from public.score_photos where user_id = uid and source = 'scoretool' and source_id = p_source_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.scoretool_save_photo(text, text, text, text, integer, integer) from public;
revoke all on function public.scoretool_remove_photo(text, text) from public;
grant execute on function public.scoretool_save_photo(text, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.scoretool_remove_photo(text, text) to anon, authenticated;
grant select, delete on public.score_photos to authenticated;
