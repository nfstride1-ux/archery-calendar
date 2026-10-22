-- Archery Calendar <- ScoreTool: finished scores shown in the archer's own My events.
-- ADDITIVE ONLY: two new tables and three new functions. Nothing existing is altered, renamed or dropped.
-- Safe to run more than once. Run in Supabase > SQL Editor (project sllsqpfqwckwtljzjxli), then reload the site.
--
-- How it links (no ScoreTool login needed):
--   1. Signed in on archerycalendars.com, the archer taps "Link ScoreTool". create_scoretool_link() makes a random secret
--      (48 hex chars), stores only its SHA-256 hash, and the page hands the secret to ScoreTool on a fixed address.
--   2. ScoreTool keeps the secret on that phone and, when a round is finished, calls scoretool_save_score(secret, ...).
--      The secret can ONLY add/update/remove that archer's own ScoreTool score entries. It can't read anything,
--      can't touch events, entries, settings or anyone else's data.
--   3. The archer can see and revoke links on the Account page (select/delete own rows only).
-- Privacy: score entries hold no names. Only the owner can read them (RLS: user_id = auth.uid()).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.scoretool_links (
  token_hash  bytea primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text check (label is null or char_length(label) <= 60),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists scoretool_links_user on public.scoretool_links(user_id);
alter table public.scoretool_links enable row level security;
drop policy if exists "own links: read" on public.scoretool_links;
create policy "own links: read" on public.scoretool_links for select to authenticated using (user_id = auth.uid());
drop policy if exists "own links: revoke" on public.scoretool_links;
create policy "own links: revoke" on public.scoretool_links for delete to authenticated using (user_id = auth.uid());
-- no insert/update policies: links are only made by create_scoretool_link()

create table if not exists public.score_entries (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  source      text not null default 'scoretool' check (source in ('scoretool')),
  source_id   text not null check (char_length(source_id) between 1 and 80),
  shot_date   date not null check (shot_date >= date '2000-01-01'),
  round_name  text not null check (char_length(round_name) between 1 and 120),
  score       integer not null check (score between 0 and 5000),
  max_score   integer check (max_score is null or max_score between 1 and 5000),
  location    text check (location is null or char_length(location) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists score_entries_user_date on public.score_entries(user_id, shot_date);
alter table public.score_entries enable row level security;
drop policy if exists "own scores: read" on public.score_entries;
create policy "own scores: read" on public.score_entries for select to authenticated using (user_id = auth.uid());
drop policy if exists "own scores: delete" on public.score_entries;
create policy "own scores: delete" on public.score_entries for delete to authenticated using (user_id = auth.uid());
-- no insert/update policies: rows are only written by scoretool_save_score() for the linked account

-- 1) signed-in archer makes a link secret (max 5 live links; the oldest is replaced)
create or replace function public.create_scoretool_link(p_label text default 'ScoreTool')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); tok text;
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  delete from public.scoretool_links where token_hash in (
    select token_hash from public.scoretool_links where user_id = uid order by created_at desc offset 4);
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.scoretool_links(token_hash, user_id, label) values (extensions.digest(tok, 'sha256'), uid, left(coalesce(p_label, 'ScoreTool'), 60));
  return tok;
end $$;

-- 2) ScoreTool saves (adds or updates) one finished score. Same source_id again = update, never a duplicate.
create or replace function public.scoretool_save_score(p_token text, p_source_id text, p_shot_date date, p_round text,
  p_score integer, p_max integer default null, p_location text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; n int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'not linked' using errcode = '28000'; end if;
  select user_id into uid from public.scoretool_links where token_hash = extensions.digest(p_token, 'sha256');
  if uid is null then raise exception 'not linked' using errcode = '28000'; end if;
  if p_shot_date > current_date + 1 then raise exception 'date in the future'; end if;
  select count(*) into n from public.score_entries where user_id = uid;
  if n >= 20000 then raise exception 'too many scores'; end if;
  insert into public.score_entries(user_id, source, source_id, shot_date, round_name, score, max_score, location)
  values (uid, 'scoretool', p_source_id, p_shot_date, left(p_round, 120), p_score, p_max, nullif(left(coalesce(p_location, ''), 120), ''))
  on conflict (user_id, source, source_id) do update set shot_date = excluded.shot_date, round_name = excluded.round_name,
    score = excluded.score, max_score = excluded.max_score, location = excluded.location, updated_at = now();
  update public.scoretool_links set last_used_at = now() where token_hash = extensions.digest(p_token, 'sha256');
  return jsonb_build_object('ok', true);
end $$;

-- 3) ScoreTool unlinks itself (forgets the secret server-side)
create or replace function public.scoretool_unlink(p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.scoretool_links where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256');
end $$;

revoke all on function public.create_scoretool_link(text) from public, anon;
revoke all on function public.scoretool_save_score(text, text, date, text, integer, integer, text) from public;
revoke all on function public.scoretool_unlink(text) from public;
grant execute on function public.create_scoretool_link(text) to authenticated;
grant execute on function public.scoretool_save_score(text, text, date, text, integer, integer, text) to anon, authenticated;
grant execute on function public.scoretool_unlink(text) to anon, authenticated;
grant select, delete on public.score_entries to authenticated;
grant select, delete on public.scoretool_links to authenticated;
