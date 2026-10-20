-- Archery Calendar: daily cap for the AI flyer reader (Edge Function read-flyer). Owner approved 20 Oct 2026.
-- Project archery-calendar (sllsqpfqwckwtljzjxli). Supabase -> SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- One row per flyer read. Only the Edge Function (service role) reads or writes it; nobody can see it from the website.
create table if not exists public.flyer_reads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now());
create index if not exists flyer_reads_user_day on public.flyer_reads (user_id, created_at);
alter table public.flyer_reads enable row level security;   -- no policies: closed to the browser
revoke all on public.flyer_reads from anon, authenticated;
