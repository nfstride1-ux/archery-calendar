# Handoff

Read this file first. Before you stop, add a new entry at the top: who you are, the date and time in Perth (AWST), what is done, what is only half done, what is next, and any decision you made. Sign it. Tag the commit with `[Claude]`, `[ChatGPT]`, `[Jarvis]`, `[Grok Bot]`, or `[Cursor]`.

The rules for the site are in [PROJECT_RULES.md](PROJECT_RULES.md). Ideas wait in [IDEAS.md](IDEAS.md).

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
