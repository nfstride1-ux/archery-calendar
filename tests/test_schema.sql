-- RLS + sync function tests (run as the two test users). Every check raises an exception on failure.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111', 'alex@example.com', '{"full_name":"Alex T"}'),
 ('22222222-2222-2222-2222-222222222222', 'other@example.com', '{}');
do $$ begin assert (select count(*) from public.profiles) = 2, 'profiles auto-created';
  assert (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alex T', 'name from Google/metadata'; end $$;

-- user 1 writes
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select count(*) as written from public.sync_user_events('[{"event_id":"e1","saved":true,"status":"paid","paid_amount":45.5,"paid_date":"2026-10-02","receipt":"AD#1","notes":"bale 4","reminders":{"sent":{"shoot:14":1}},"extra":{"currency":"AUD"},"updated_at":"2026-10-09T05:00:00Z"},
                                                    {"event_id":"e2","saved":true,"updated_at":"2026-10-09T05:00:00Z"}]');
do $$ begin assert (select count(*) from public.user_events) = 2, 'user 1 sees own 2 rows';
  assert (select status from public.user_events where event_id='e1') = 'paid';
  assert (select paid_amount from public.user_events where event_id='e1') = 45.50; end $$;
-- older write loses, newer wins
select count(*) as older_written from public.sync_user_events('[{"event_id":"e1","saved":true,"status":"entered","updated_at":"2026-10-09T04:00:00Z"}]');
do $$ begin assert (select status from public.user_events where event_id='e1') = 'paid', 'older change ignored'; end $$;
select count(*) as newer_written from public.sync_user_events('[{"event_id":"e1","saved":false,"status":"not_entered","updated_at":"2026-10-09T06:00:00Z"}]');
do $$ begin assert (select status from public.user_events where event_id='e1') = 'not_entered', 'newer change applied (tombstone)'; end $$;
-- future clock capped
select count(*) from public.sync_user_events('[{"event_id":"e3","saved":true,"updated_at":"2030-01-01T00:00:00Z"}]');
do $$ begin assert (select updated_at from public.user_events where event_id='e3') <= now() + interval '5 minutes', 'future timestamp capped'; end $$;
-- can't write as someone else (direct insert)
do $$ begin
  begin insert into public.user_events (user_id, event_id) values ('22222222-2222-2222-2222-222222222222', 'hack'); raise exception 'FAIL: wrote another user row';
  exception when insufficient_privilege then null; end; end $$;
-- settings LWW + name kept
select display_name from public.save_profile(null, '{"states":["WA"]}', '2026-10-09T05:00:00Z');
do $$ begin assert (select display_name from public.profiles where id = auth.uid()) = 'Alex T', 'name not wiped';
  assert (select settings->'states'->>0 from public.profiles where id = auth.uid()) = 'WA'; end $$;
select 1 from public.save_profile('Alex', '{"states":["SA"]}', '2026-10-09T04:00:00Z');
do $$ begin assert (select settings->'states'->>0 from public.profiles where id = auth.uid()) = 'WA', 'older settings ignored'; end $$;
-- limits
do $$ begin begin perform public.sync_user_events((select jsonb_agg(jsonb_build_object('event_id','x'||g)) from generate_series(1,501) g)); raise exception 'FAIL: 501 rows accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end; end $$;
do $$ begin begin perform public.sync_user_events(jsonb_build_array(jsonb_build_object('event_id','n','notes',repeat('x',2001)))); raise exception 'FAIL: long notes';
  exception when check_violation then null; end; end $$;

-- user 2 sees nothing of user 1, and can't update/delete it
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin assert (select count(*) from public.user_events) = 0, 'user 2 sees no rows of user 1';
  assert (select count(*) from public.profiles) = 1, 'user 2 sees only own profile'; end $$;
update public.user_events set notes = 'x'; delete from public.user_events;
select count(*) from public.sync_user_events('[{"event_id":"e1","saved":true,"status":"paid","updated_at":"2030-01-01T00:00:00Z"}]');   -- own e1, not user 1's
reset role;
do $$ begin assert (select status from public.user_events where user_id='11111111-1111-1111-1111-111111111111' and event_id='e1') = 'not_entered', 'user 2 could not touch user 1';
  assert (select count(*) from public.user_events where user_id='22222222-2222-2222-2222-222222222222') = 1; end $$;

-- signed-out (anon) gets nothing
set role anon; select set_config('request.jwt.claim.sub', '', false);
do $$ begin begin perform count(*) from public.user_events; raise exception 'FAIL: anon read';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_my_account(); raise exception 'FAIL: anon delete';
  exception when insufficient_privilege then null; end; end $$;
reset role;

-- delete my account (user 2) removes only user 2 and their rows
set role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.delete_my_account();
reset role;
do $$ begin assert (select count(*) from auth.users) = 1, 'user 2 gone'; assert (select count(*) from public.user_events where user_id='22222222-2222-2222-2222-222222222222') = 0;
  assert (select count(*) from public.profiles) = 1; assert (select count(*) from public.user_events) = 3, 'user 1 untouched'; end $$;
select 'ALL SCHEMA TESTS PASSED' as result;
