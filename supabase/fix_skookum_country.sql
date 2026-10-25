-- Fix one live submission: Skookum Archers "SCARE THE $HIT OUT OF CANCER ARCHERY TOURNAMENT", Sat 31 Oct 2026.
-- Venue is 11209 Shaw Rd E, Puyallup WA 98374 (United States) but it was saved with country AU and no state.
-- Run once in Supabase -> project archery-calendar (sllsqpfqwckwtljzjxli) -> SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Only country and state change. Status stays as it is (it is already live); nothing else is touched.
update public.submitted_events
   set country = 'US', state = 'WA'
 where id = '5a15e5ef-a921-48a5-89b0-f2fc2b72e66e'
   and club = 'Skookum Archers'
   and name = 'SCARE THE $HIT OUT OF CANCER ARCHERY TOURNAMENT'
   and start_date = '2026-10-31';
-- Check (should return 1 row: US, WA, live):
-- select id, status, country, state from public.submitted_events where id = '5a15e5ef-a921-48a5-89b0-f2fc2b72e66e';
