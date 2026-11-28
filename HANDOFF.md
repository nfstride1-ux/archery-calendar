# Handoff

Read this file first. Before you stop, add a new entry at the top: who you are, the date and time in Perth (AWST), what is done, what is only half done, what is next, and any decision you made. Sign it. Tag the commit with `[Claude]`, `[ChatGPT]`, `[OpenAI]`, `[Jarvis]`, `[Grok Bot]`, or `[Cursor]`.

The rules for the site are in [PROJECT_RULES.md](PROJECT_RULES.md). Ideas wait in [IDEAS.md](IDEAS.md).

## 2026-11-28 19:50 AWST — Grok Bot

- **Who:** Grok Bot.
- **Done:** Pull request only, not merged. The event-page countdown no longer treats a missing shooting time as midnight. It now prefers a published start or shooting time, falls back to practice, muster, or another clock time if that is all there is, and uses the event's own timezone. If no time is known, the badge says "Starts tomorrow" or "Starts in N days" (or "On today" on the day) instead of ticking hours and minutes down to midnight. The Archery WA Non-Elimination Teams Matchplay + AGM (29 Nov 2026) times were wrong in the data: the TIMES card said "Practice starts at 8:00 AM" and the countdown ran to midnight. The official flyer (`flyers/awa-teams-matchplay-2026.jpg`) says "Shooting commences at 8:30 AM" (already in `notes` and `flyer_extract`). `start_times` is now that flyer wording, and the SEO page Times line matches. Cache `archcal-cdfix1128`. `scripts/countdown_tz_test.js` covers this event, the no-time case, and an eastern-states event viewed from Perth. Lingkana data was not touched. `privatecal.js` stays out. PR #46 was not changed.
- **Half done:** Nothing in the change itself. It does not go live until Nathe says so.
- **Next:** Nathe reviews the pull request and the preview. Merge only on his explicit OK.
- **Decisions:** The flyer does not list an 8:00 am practice; the 30-minute team practice is after the ranking round. I did not invent an 8:00 practice time. Events that only publish a practice time now count down to that practice time rather than midnight. Daily refresh will keep the curated 8:30 start because it does not overwrite a filled `start_times` field.

— [Grok Bot]

## 2026-11-25 17:15 AWST — Grok Bot

- **Who:** Grok Bot.
- **Done:** Nathe said "go" on pull request 43. Merged latest `main` (including the live 2027 Archery Australia calendar from PR #42) into this branch with no force-push. The seven Lingkana League nights stay as public listings with live ScoreTool score and ladder links. Cache bumped to `archcal-lkgo1715` so it is unique after the main merge. `privatecal.js` stays out. League relay data was not written.
- **Half done:** Smoke and preview must go green on this commit, then the pull request can be merged and checked on the live site.
- **Next:** Wait for checks, merge, then verify archerycalendars.com at 390×844.
- **Decisions:** No scores, names, passcode or invite code were committed. The 18 Nov night stays listed as a past event.

— [Grok Bot]

## 2026-11-25 16:42 AWST — Grok Bot

- **Who:** Grok Bot.
- **Done:** Pull request only, not merged. The seven Lingkana League nights are public calendar listings again, with live ScoreTool links for scores, the ladder, the registered list and the pot. They were missing because the 25 Nov site audit (PR #37) removed `privatecal.js`, which was the only place the nights lived. They had never been in the public `events.json` catalogue (they started owner-only on My events in PR #12, then any signed-in account in PR #19). This change does not restore `privatecal.js`. Cache `archcal-lkpub1125`. Screenshots (390×844) go in `/workspace/ac-lingkana-cal/` on the box, not in the repo.
- **Half done:** Nothing in the change itself. It does not go live until Nathe says so.
- **Next:** Nathe reviews the pull request and the screenshots. Merge only on his explicit OK.
- **Decisions:** Viewing the registered list, scoresheets, ladder and pot is open to anyone, by linking to the live ScoreTool league pages (`#lk-results&n=N` and `#lk-home`). No scores, names, passcode or invite code were committed. Scoring stays on ScoreTool for registered archers. League relay data was not written. The 18 Nov night is listed as a past event.

— [Grok Bot]
## 2026-11-25 16:46 AWST — Jarvis

- **Who:** Jarvis.
- **Done:** Pull request only until merged on Nathe's "go". Merged latest `main` (event data refresh) into this branch with no force-push, keeping the 2027 calendar additions. Fixed the Asian Para Championships venue so the SEO page says Beijing, China, not "Beijing, China, China". Cache bumped to `archcal-aa20271125b`. Lingkana data was not touched.
- **Half done:** After checks are green, merge pull request 42 and verify the live site.
- **Next:** Merge on this "go", then confirm the live cache and screenshots.
- **Decisions:** Location for Asian Para is now "Beijing" (country still China). Open Field and World Para dates stay as they were.

— [Jarvis]


## 2026-11-25 16:38 AWST — Jarvis

- **Who:** Jarvis.
- **Done:** Pull request only, not merged. Archery Australia 2027 Event Calendar (version 3.3, https://archery.org.au/wp-content/uploads/2026/11/AA-2027-EVENT-CALENDAR.pdf) updates: added Pacific Games (Tahiti, 23 Jul–8 Aug 2027) and Asian Para Championships (Beijing, 17–25 Sep 2027); set National Youth Championships venue to target at Werribee Archery Club (VU Werribee Campus) and field at Geelong Archers, Waurn Ponds; added the eight 2027 AA Matchplay Weekend listings (various clubs, same style as 2026); added Central Coast to the XXI Australian Masters Games location. Open Field and World Para Championship dates were left as they were. All 31 listed 2027 QREs now include the note to register on both Assemble and Archer's Diary. Cache `archcal-aa20271125`. SEO pages rebuilt. Phone screenshots (390×844) are in `/workspace/ac-aa2027/` on the box, not in the repo.
- **Half done:** Nothing in the change itself. It does not go live until Nathe says so.
- **Next:** Nathe reviews the pull request and the screenshots. Merge only on his explicit OK.
- **Decisions:** Open Field stays 21–26 Apr and World Para stays 30 Aug–6 Sep, matching AA's event page and earlier announcement rather than the PDF start days. No events were removed. Lingkana league listings were not part of this change.

— [Jarvis]


## 2026-11-25 14:15 AWST — Jarvis

- **Who:** Jarvis.
- **Done:** Pull request only, not merged. On My events, the Scores I shot in [month] card under the calendar is now a drop-down. It starts closed, with the heading, a score count, and a chevron. Tap the heading to open or close it. The choice is remembered in localStorage (`ac-stl-box-open`). The button uses `aria-expanded`. Score data, the day marks, the day panel, and the event-page My score panel are unchanged. Cache `archcal-stlbox1125` (`styles.css`, `scoretool.js`, `whatsnew.js`, and `help.js` query tags too). What's new and the ScoreTool help line mention the drop-down. Phone screenshots (collapsed and expanded, 390×844, fictional fixture scores) are in `/workspace/ac-scores-dropdown/` on the box, not in the repo.
- **Half done:** Nothing in the change itself. It does not go live until Nathe says so.
- **Next:** Nathe reviews the pull request and the screenshots. Merge only on his explicit OK.
- **Decisions:** Viewing is unchanged. Only the month list is collapsed, so the long list no longer fills the screen. No personal scores or names were committed. `scripts/score_photos_test.py` has one pre-existing failure on main (it still looks for a 🎯 emoji in the month grid; the mark has been an SVG for a while). I did not edit that test.

— [Jarvis]

## 2026-11-25 11:26 AWST — Grok Bot

- **Who:** Grok Bot.
- **Done:** Updated the shipping rule. Jarvis stays the lead and default builder. Claude, OpenAI, and Grok Bot may also ship code, as long as the change goes through a pull request, the `smoke` check is green, and a signed entry is added to this file. Nothing goes live without Nathe's own OK. No app code was changed.
- **Half done:** Branch protection is still not on. Nathe has to add the ruleset in `PROJECT_RULES.md`.
- **Next:** Other AIs can pick up work after a credit drop, using this rule.
- **Decisions:** Nathe approved this on 25 Nov 2026 at 11:20 Perth: any of these AIs may ship under the checks above. He also approved merging this pull request.

— [Grok Bot]

## 2026-11-25 10:56 AWST — Cursor

- **Who:** Cursor (cloud agent).
- **Done:** Pull request 38 is open and not merged. `smoke` passed in 34 seconds and `preview` passed in 38 seconds on commit `a7ba55ba`. The preview is live at https://archerycalendars.com/pr-preview/pr-38/ (banner present, live home page has no banner). The preview commit on `main` only adds `pr-preview/pr-38/`.
- **Half done:** Branch protection is still not on. Nathe has to add the ruleset in `PROJECT_RULES.md`.
- **Next:** Nathe opens the preview, and merges pull request 38 only if he wants it live. Then he turns on the ruleset, with a bypass for GitHub Actions, and leaves GitHub Pages on `main`.
- **Decisions:** None new. Adapter memory could not be saved because that connection is not signed in.

— Cursor

## 2026-11-25 10:53 AWST — Cursor

- **Who:** Cursor (cloud agent).
- **Done:** The first GitHub run of `smoke` and `preview` failed because the runner's Chrome never opened its debugger. The workflows now install Google's Chrome package and the smoke test waits longer and records Chrome's log if it still does not start. Local smoke still passes, 21 checks.
- **Half done:** The new run is not green yet. Branch protection is still not on. The preview URL is not live until the preview job passes.
- **Next:** Confirm `smoke` and `preview` are green on pull request 38. Nathe then reviews https://archerycalendars.com/pr-preview/pr-38/ and merges only if he wants it live. The ruleset steps in `PROJECT_RULES.md` are unchanged.
- **Decisions:** Use `/opt/google/chrome/chrome` from the official package instead of whatever `google-chrome` is already on the runner.

— Cursor

## 2026-11-25 10:50 AWST — Cursor

- **Who:** Cursor (cloud agent).
- **Done:** Added `PROJECT_RULES.md`, this handoff, `AGENTS.md`, `CLAUDE.md`, and `IDEAS.md`. Added the `smoke` workflow (`.github/workflows/smoke.yml`, `scripts/smoke_test.py`) and the free preview workflow (`.github/workflows/preview.yml`). The preview publishes `pr-preview/pr-<number>/` on `main` and comments `https://archerycalendars.com/pr-preview/pr-<number>/`. No app code, event data, or page content was changed.
- **Half done:** Branch protection is not on. The token cannot change it (GitHub 403). The steps for Nathe are in `PROJECT_RULES.md`. The preview link for this pull request does not exist until the preview job finishes after the branch is pushed.
- **Next:** Nathe reads the pull request, waits until `smoke` is green, and merges if he wants it live. After `smoke` has run once, he adds the ruleset in `PROJECT_RULES.md`, with a bypass for GitHub Actions so the daily refresh keeps pushing. He should leave the GitHub Pages source on `main`.
- **Decisions:** Pages stays on `main` `/`, because the daily refresh publishes by pushing to `main`. A separate `gh-pages` branch would not be served, and switching the source would risk the live site. The preview is a folder on `main` instead, and only after the smoke test passes, so a failing pull request is not copied onto the public site. The smoke test reads the committed site and does not run `tools/build_public.py`. Only `smoke` should become a required check. `preview` must not be required, because it does not run on every push.

— Cursor
