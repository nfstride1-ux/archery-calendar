# Archery Calendar (Australia)

Every Australian archery shoot – Archery Australia, ABA and Archery WA; Field, 3D, Target and Indoor – in one calendar.
Save shoots, get reminders before entries close and track what you've paid. Static site / PWA, no build step, no tracking:
your saved shoots and entries stay in your browser (localStorage).

- Live: https://archerycalendars.com/ (the old address https://nfstride1-ux.github.io/archery-calendar/ redirects here)
- Dates come from organisers' public calendars; always check with the organiser.
- Clubs: send us your flyer – nfshold@gmail.com (NFS Strategic Holdings). No online entries? We'll list your shoot, set up a free entry form and send you the entry list. Free until 31 Dec 2026.
- Photo and font credits: [CREDITS.md](CREDITS.md) and the Credits page on the site.

Event flyers: page-1 previews only (bank details removed); organisers can ask for removal or updates at nfshold@gmail.com.

## Organisation status (badge on every shoot card and shoot page, filter on Find shoots)
Worked out in `tools/build_data.py` from the data (field `org_status`), never typed in by hand. Filter options: All / Flyer out / No entry details yet.

| Badge | `org_status` | Rule |
|---|---|---|
| 📄 2026 flyer out (or "Details & entry out" when the details come from an organiser page rather than a flyer) | `flyer` | Confirmed date **and** either a flyer for the event's own year (`flyer_is_current`), or an organiser event/entry page for this year (`registration_url` of kind entry page, Archers Diary, email nomination or ABA Branch J nomination – not one carried over from last year's flyer, and not just the ABA calendar). Coaching/youth/come & try listings with a booking link, and "Book any time" listings, also count. |
| ⏳ No entry details yet | `no_details` | Everything else: the date is on an official calendar (ABA 2026 National Calendar, World Archery/AA calendar, Archery WA feed) but there's no current-year flyer or entry link yet. This includes shoots where we only hold last year's flyer (e.g. Baldivis Breakfast Field, 15 Nov 2026) and placeholders (dates TBC, venue TBA). |

Entry badges come from the same data: 🔒 Entries closed (close date passed), ◷ Entries open <date> (opening date in the future), ✍ Entries open · close <date> (status `flyer` with an entry link or close date). Icons and text are always shown together – never colour alone.

## Club shoots vs competitions (event type)
Every shoot has one type: **🏹 Competition**, **👥 Club shoot**, 🎓 Coaching, 🧒 Youth or 👋 Come & try. Find shoots and Calendars have a type selector (Competitions / Club shoots / Coaching / Youth / Come & try / All), and Club shoots get their own badge (👥 + the words "Club shoot", filled dark, never colour alone). The shoot page shows the reason, e.g. "Competition (ABA-registered shoot)".
Rules (`tools/classify.py`, applied by `tools/build_data.py`; first match wins):
1. Hand-reviewed overrides for borderline events (listed in `OVERRIDES`).
2. **Club shoot**: club championships and members-only days (`members_only`, level "Club Championship", or "club champ" in the name).
3. **Competition**: QRE / World Record Status (level or name).
4. **Competition**: titles and championships at branch, state, national or world level (level says State / National / World / Titles / Championship, or the name says titles, championships, nationals, world…).
5. **Club shoot**: club social words in the name: breakfast, social, fun shoot, monthly, Christmas, novelty, celebration, club challenge, members' day, AGM.
6. **Competition**: Archery Australia registered tournaments, and every other ABA calendar shoot (ABA-registered; scores count for ABA classification).
7. **Club shoot**: other club-run local shoots on the Archery WA calendar (level "Club" – memorial shoots, matchplay challenges, junior days, named club shoots such as Old Coot's).
8. Anything else: Competition (open tournament).
Coaching, youth and come & try events keep their own types. Search: "club" and "club shoot(s)" find club shoots.

## Optional user accounts (Supabase), off until configured
- Built in: `app/sync.js` (sync engine), the Account page (`#/account`), `supabase/schema.sql` (tables + Row Level Security + sync functions), `docs/SUPABASE_SETUP.md` (setup steps).
- Switched on only when `app/config.js` has `SUPABASE_URL` and the public `SUPABASE_ANON_KEY` (publishable/anon key). Empty = no sign-in UI and no extra code loaded.
- Sign-in: magic link by email (PKCE) and optionally Google. Data region: Sydney (ap-southeast-2). Never commit the secret/service_role key; the build refuses one.
- Tests: `node tests/test_sync.js`, `bash tests/test_schema.sh` (local PostgreSQL), `tools/qa_accounts.py <url>` (browser, mock Supabase).
