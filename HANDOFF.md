# Handoff

Read this file first. Before you stop, add a new entry at the top: who you are, the date and time in Perth (AWST), what is done, what is only half done, what is next, and any decision you made. Sign it. Tag the commit with `[Claude]`, `[ChatGPT]`, `[OpenAI]`, `[Jarvis]`, `[Grok Bot]`, or `[Cursor]`.

The rules for the site are in [PROJECT_RULES.md](PROJECT_RULES.md). Ideas wait in [IDEAS.md](IDEAS.md).

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
