# Archery Calendar (Australia)

Every Australian archery shoot – Archery Australia, ABA and Archery WA; Field, 3D, Target and Indoor – in one calendar.
Save shoots, get reminders before entries close and track what you've paid. Static site / PWA, no build step, no tracking:
your saved shoots and entries stay in your browser (localStorage).

- Live: https://archerycalendars.com/ (the old address https://nfstride1-ux.github.io/archery-calendar/ redirects here)
- Dates come from organisers' public calendars; always check with the organiser.
- Clubs: send us your flyer – nfshold@gmail.com (NFS Strategic Holdings). No online entries? We'll list your shoot, set up an entry form and send you the entry list.
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

## Club directory, My clubs and Watching
`tools/clubs.py` (run by `tools/build_data.py`) builds `app/data/clubs.json` – one record per club: `id`, `name`, `aliases`, `state`, `suburb`, `address` (only when an event's venue line names the club and has a street address), `website`, `orgs` (aa / awa / aba), `sources`, `n_events` – and sets `club_id` on every event.
- Sources: Archery WA club list (research/awa_clubs.json), Archery SA, SQAS and Archery Victoria club pages (research/clubs/*.html, saved 9 Oct 2026), plus the host, contact email, name and venue of every shoot. ABA clubs come from the ABA calendar (no public ABA club list). NSW/ACT/TAS/NT lists are map widgets, so those clubs come from events only.
- Name clean-up: curated aliases in `SEED` (e.g. Gosnells Archers = Gosnells Archery Club; Kalamunda Governor Stirling Archers = KGSA = Kalamunda Archery; Whiteman Park Archers = WPA; Bowmen of Melville = BOM; Waverley City Archers = Waverly Archers; Cressy Archers = Cressy Bowmen; SOPA = Sydney Olympic Park Archery Centre). Longest alias match wins; a contact email on the club's own domain also counts (Old Coot's → Whiteman Park Archers).
- State-body events (Archery WA QREs at Archery Park Whiteman, AA Matchplay at "various clubs", Archery SA / SQAS championships, nationals) have no host club (`club_id: null`).
- Users: Settings → Your clubs (search by name, alias, suburb or state; "+ My club", "+ Watch", one home club). Stored in `myClubs`, `homeClub`, `watchClubs`, `clubNotify` – saved locally and synced via `profiles.settings`. "New" detection is per device (`clubSeen`, `clubNew`): a shoot or a current-year flyer that appears for a followed club after it was first followed gets a ✦ New badge for 14 days or until opened; optional browser notification if notifications are on.
- Pages: `#/clubs` (directory), `#/club/<id>` (upcoming + past shoots, map link, website, Join / Watch). Find shoots and Calendars have 🏠 My clubs / 👁 Watching / ✦ New chips.

## Optional user accounts (Supabase), off until configured
- Built in: `app/sync.js` (sync engine), the Account page (`#/account`), `supabase/schema.sql` (tables + Row Level Security + sync functions), `docs/SUPABASE_SETUP.md` (setup steps).
- Switched on only when `app/config.js` has `SUPABASE_URL` and the public `SUPABASE_ANON_KEY` (publishable/anon key). Empty = no sign-in UI and no extra code loaded.
- Sign-in: email with a 6-digit code (typed into the site, `verifyOtp` type `email`; the way to sign in inside the installed Home Screen app, whose storage is separate from the browser) plus the magic link (PKCE), and optionally Google. The code only appears in the email if the Supabase Magic Link / Confirm signup templates contain `{{ .Token }}` (docs/SUPABASE_SETUP.md, step D). In the installed app the sign-in page says to use the code. QA: `tools/qa_otp.py <url>`. Data region: Sydney (ap-southeast-2). Never commit the secret/service_role key; the build refuses one.
- Tests: `node tests/test_sync.js`, `bash tests/test_schema.sh` (local PostgreSQL), `tools/qa_accounts.py <url>` (browser, mock Supabase).

## Date clashes
Any shoot whose dates overlap a shoot you've saved, entered or paid (every day of multi-day shoots counts) shows a
`⚠️ Clashes with <shoot>` badge on cards (Find shoots, Calendars, club pages, Home, My shoots) and on the shoot page,
which also lists the clashing shoots with links. Entered/paid clashes are listed first and worded
"Clashes with your entered shoot: …"; several clashes add "+N more". The same shoot listed twice (same dates and name or club)
is not a clash, and finished shoots are never flagged. My shoots and Entries list pairs of your own shoots that clash.
Find shoots has a "Hide clashes with my shoots" toggle (your own shoots stay listed). QA: `tools/qa_clashes.py`.

## ABA Branch J (WA) and several flyers per shoot
- `app/sources/aba-j-2026-branch-calendar.jpg` is the ABA Branch J (WA) Shoot Calendar 2026, the branch source for WA ABA shoots.
  `tools/build_data.py` (step 1b) adds the shoots missing from the national calendar: 3D Sat 28 Feb + ABA Interclub Sun 1 Mar at Peel, and the Stick Bow Shoot on 28 Nov at WAFBC.
  It also adds the interclub times, fixes the "Western Plains" spelling, and flags the IFAA State Titles date clash between the branch calendar (28–29 Mar) and the national calendar (25–26 Apr) with `date_note`.
  Each WA ABA shoot links to the branch calendar (`branch_source`). Calendars → ABA → "Branch J (WA)" (`#/calendars/aba-j`) shows the branch view.
- A shoot can have several flyers in `tools/flyers.json`, one entry per file. The primary flyer is picked in this order: current year first, then the lowest `priority`, then the newest year.
  The primary drives the flyer panel and status; the others are listed under "More flyers", and older years are marked "archive".
  Old-year flyers never count as current, so those shoots keep the "No entry details yet" status. QA: `tools/qa_aba_j.py`.

## Visit stats (GoatCounter)
We count visits anonymously with GoatCounter (`https://archerycalendars.goatcounter.com/count`, script `gc.zgo.at/count.js`, async, `no_onload`). It sets no cookies.
The app counts each hash route as a page view (`gcPage()` in `route()`). Find-shoots searches are counted as events at `search/<normalised-words>`; anything that looks like an email address or phone number is dropped.
If GoatCounter is down or blocked, nothing is counted and nothing breaks. count.js ignores localhost. QA: `tools/qa_goatcounter.py`, which stubs the script so no real counts are sent.

## International (USA only for now)
- Home has an **🌐 International** panel with a country dropdown. Only the USA is selectable; Canada, Great Britain and New Zealand show "coming soon". Choosing USA opens `#/intl/USA`, a separate find-shoots page (search, US state, discipline, organisation chips: USA Archery / NFAA / ASA / IBO / TAC / Redding / Lancaster Classic / World events, Include finished).
- Data: `app/data/intl.json` + `intl_countries.json`, written by `tools/build_data.py` step 7b. `INTL_COUNTRIES = ('USA',)` controls which countries are published; everything else stays in `data/` only. The Australian Find shoots, My shoots and Calendars never load `intl.json`.
- Sources (checked 9 Oct 2026): World Archery calendar API (US events re-checked against the live API), USA Archery's 2027 events calendar (13 Aug 2026 announcement), NFAA event pages + 2027 indoor calendar news, thevegasshoot.com, lancasterarcheryclassic.com, totalarcherychallenge.com, iboarchery.com/schedule, asaarchery.com/events. Unknown venues/dates are left blank.
- Cards show the organiser's logo (`img/clubs/us-*.webp`, sources in `data/club_logos.json`) or an initials badge – never photos of people. Club-run USA Archery-sanctioned shoots show the host's initials.
- QA: `tools/qa_intl.py <url> <out>`.

## Indoor Archery WA (venue)
- Privately run 24/7 indoor range at 12 Alex Wood Dr, Forrestdale (indoorarcherywa.com.au, info@indoorarcherywa.com.au, 0447 741 974). Not an Archery WA / ABA club. Listed under its own name (alias "WA Indoor"); events have `org_group: 'venue'`, which always shows with Australian shoots (no association chip or label).
- Listed: Indoor Archery WA League, 14 fortnightly Thursday nights 15 Oct 2026 – 29 Apr 2027, 7:30–8:30 pm (from its event page), and Come and Try (book any time, daily sessions). Logo: header logo from its website.

## Service worker
`img/credits.json` is data, so it is network-first like the rest of `data/` (it used to be cache-first because it lives under `img/`, which let an installed app keep a stale photo list). Install uses `cache: 'reload'`. A header photo that fails to load removes itself. QA: `tools/qa_images.py <url> <out>` (every route, desktop + mobile, no broken images).
