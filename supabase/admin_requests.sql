-- Archery Calendar: submitter approval requests on #/admin (16 Oct 2026). Needs instant_publishing.sql first. Safe to re-run.
create table if not exists public.submitter_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)), name text, club text, role text,
  source text not null default 'form', note text,
  status text not null default 'pending' check (status in ('pending','approved','deleted')),
  created_at timestamptz not null default now(), decided_at timestamptz);
create unique index if not exists submitter_requests_one_pending on public.submitter_requests (email) where status = 'pending';
alter table public.submitter_requests enable row level security;
drop policy if exists "requests: admin all" on public.submitter_requests;
create policy "requests: admin all" on public.submitter_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.submitter_requests to authenticated;


-- Approved domains: an email @ one of these (official club / organisation domains) is instant-approved automatically.
-- Free webmail (gmail, hotmail, outlook, yahoo, bigpond, icloud, iinet ...) can never be added here.
create table if not exists public.approved_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
    and domain not in ('gmail.com','googlemail.com','hotmail.com','hotmail.com.au','outlook.com','outlook.com.au','live.com','live.com.au','msn.com',
      'yahoo.com','yahoo.com.au','ymail.com','bigpond.com','bigpond.net.au','bigpond.com.au','icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me',
      'iinet.net.au','optusnet.com.au','tpg.com.au','internode.on.net','westnet.com.au','dodo.com.au','gmx.com','mail.com','zoho.com')),
  label text, created_at timestamptz not null default now());
alter table public.approved_domains enable row level security;
drop policy if exists "domains: admin all" on public.approved_domains;
create policy "domains: admin all" on public.approved_domains for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.approved_domains to authenticated;
insert into public.approved_domains (domain, label) values
  ('archerywa.com.au','Archery WA'), ('assemblesports.com','Assemble Sports'), ('assemblesports.io','Assemble Sports'),
  ('archery.org.au','Archery Australia'), ('bowhunters.org.au','Australian Bowhunters Association'), ('traditionalarcheryaustralia.org','Traditional Archery Australia'),
  ('archerysqas.org.au','Archery SQAS'), ('indoorarcherywa.com.au','Indoor Archery WA'), ('masarchery.org','MAS Archery'),
  ('southwestbowhunters.net','Southwest Bowhunters'), ('gosnellsarchers.asn.au','Gosnells Archers'), ('kgsa.org.au','Kalamunda Governor Stirling Archers'),
  ('whitemanparkarchers.com','Whiteman Park Archers'), ('greatsouthernarchers.com.au','Great Southern Archers'), ('adelaidearchery.org.au','Adelaide Archery Club'),
  ('barossaarcheryclub.org.au','Barossa Archery Club'), ('benarabowmen.com.au','Benara Bowmen'), ('cressyarchers.com','Cressy Archers'),
  ('tuggeranongarchery.com','Tuggeranong Archery'), ('kidman-archers.org.au','Kidman Archers'), ('southernvalesarchery.org.au','Southern Vales Archery'),
  ('victorharborarcheryclub.com','Victor Harbor Archery Club'), ('thefarmindoorarcheryclub.net','The Farm Indoor Archery Club')
on conflict (domain) do nothing;
create or replace function public.email_preapproved(em text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from approved_submitters where email = lower(em) and instant)
      or exists (select 1 from approved_domains d where lower(split_part(em, '@', 2)) = d.domain);
$$;

-- Named pre-approvals
insert into public.approved_submitters (email, name, club, instant) values
  ('events@archerywa.com.au', 'Archery WA events', 'Archery WA', true),
  ('tournament.chair@archerywa.com.au', 'Archery WA tournament chair', 'Archery WA', true),
  ('info@assemblesports.com', 'Assemble Sports', 'Assemble Sports', true)
on conflict (email) do update set instant = true;

-- Instant-publish check now honours approved domains too (same as instant_publishing.sql otherwise).
create or replace function public.submitted_events_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare em text; ok boolean;
begin
  if tg_op = 'INSERT' then
    select lower(u.email), (u.email_confirmed_at is not null) into em, ok from auth.users u where u.id = auth.uid();
    if em is null then raise exception 'sign in to submit an event'; end if;
    new.user_id := auth.uid(); new.submitter_email := em; new.created_at := now(); new.reviewed_at := null; new.reviewed_by := null;
    new.status := case when ok and public.email_preapproved(em) then 'live' else 'pending' end;
    if new.status = 'live' then new.reviewed_at := now(); new.reviewed_by := 'instant'; end if;
    update public.approved_submitters set user_id = auth.uid() where email = em and user_id is null;
  else
    new.id := old.id; new.user_id := old.user_id; new.submitter_email := old.submitter_email; new.created_at := old.created_at;
    if new.status is distinct from old.status then new.reviewed_at := now(); new.reviewed_by := (select email from auth.users where id = auth.uid()); end if;
  end if;
  return new;
end $$;

-- Anyone (site form, signed in or not) can ask; skipped if already approved or already pending.
create or replace function public.request_approval(p_email text, p_name text default null, p_club text default null,
  p_role text default null, p_source text default 'form', p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(p_email,'')));
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if public.email_preapproved(em) then return; end if;
  insert into submitter_requests (email, name, club, role, source, note)
  values (em, left(p_name,120), left(p_club,120), left(p_role,80), left(coalesce(p_source,'form'),20), left(p_note,500))
  on conflict (email) where status = 'pending' do nothing;
end $$;
grant execute on function public.request_approval(text,text,text,text,text,text) to anon, authenticated;

-- Every pending database submission also raises a request.
create or replace function public.submitted_events_request() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then  -- runs after insert
    perform public.request_approval(new.submitter_email, new.submitter_name, new.club, new.role, 'form', 'Shoot: ' || new.name);
  end if; return new;
end $$;
drop trigger if exists submitted_events_request on public.submitted_events;
create trigger submitted_events_request after insert on public.submitted_events for each row execute function public.submitted_events_request();

-- Approve = add to approved_submitters (instant) and close the request.
create or replace function public.approve_request(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare r submitter_requests;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into r from submitter_requests where id = p_id;
  if r.id is null then return; end if;
  insert into approved_submitters (email, name, club, instant) values (r.email, r.name, r.club, true)
  on conflict (email) do update set instant = true, name = coalesce(excluded.name, approved_submitters.name), club = coalesce(excluded.club, approved_submitters.club);
  update submitter_requests set status = 'approved', decided_at = now() where email = r.email and status = 'pending';
end $$;
grant execute on function public.approve_request(uuid) to authenticated;

-- Seed: people who asked by email / FormSubmit and aren't approved yet.
select public.request_approval('info@southwestbowhunters.net', 'Deborah Elliott', 'Southwest Bowhunters', 'Secretary', 'email',
  'FormSubmit 13 Oct: Walk the Trail Shoot (AZ)');

select status, name, email, club from public.submitter_requests order by created_at desc;
