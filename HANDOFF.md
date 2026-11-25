# Handoff

Read this file first. Before you stop, add a new entry at the top: who you are, the date and time in Perth (AWST), what is done, what is only half done, what is next, and any decision you made. Sign it. Tag the commit with `[Claude]`, `[ChatGPT]`, `[OpenAI]`, `[Jarvis]`, `[Grok Bot]`, or `[Cursor]`.

The rules for the site are in [PROJECT_RULES.md](PROJECT_RULES.md). Ideas wait in [IDEAS.md](IDEAS.md).

## 25 Nov 2026, 14:25 AWST — [Jarvis]

- Who: Jarvis.
- Done: branch `cursor/scoretool-delete-score`. Added `scoretool_delete_score(p_token, p_source_id)` in `supabase/scoretool_scores.sql`. The ScoreTool link secret can now remove that archer's own `score_entries` row (source `scoretool` only). Missing rows are ok. New contract test: `scripts/scoretool_delete_score_test.py`. `PROJECT_RULES.md` updated. No app JavaScript, HTML or CSS was changed, so this should not clash with the in-progress "Scores I shot" dropdown work (branch `cursor/stl-scores-dropdown`, JAC-20), except both will add a HANDOFF entry at the top.
- Half-done: PR only; not merged. The new function does nothing for users until it is run in the live Supabase SQL Editor (project sllsqpfqwckwtljzjxli) and the matching ScoreTool PR (`cursor/cal-delete-sync`) is live. Nothing goes live until Nathe says so.
- Next: Run the new statements from `supabase/scoretool_scores.sql` (the `scoretool_delete_score` function and its grant/revoke) in the SQL Editor, then merge only when Nathe says go.
- Decision: The calendar keeps its own copy of each sent score in `score_entries`. There is no tombstone table; deletion is a real delete of that source_id, driven by ScoreTool on the next sync.

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
