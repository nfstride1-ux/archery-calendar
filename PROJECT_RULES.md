# Project rules

Archery Calendars (https://archerycalendars.com) is a free worldwide archery shoot calendar. Archers use it to find shoots, save events, and score rounds. The live site is this repository, served by GitHub Pages from the `main` branch at `/`. A push to `main` is the live site.

Read [HANDOFF.md](HANDOFF.md) before you start, and add a note there before you stop. New ideas go in [IDEAS.md](IDEAS.md). Build one at a time.

## Must not break

These already work. A change that breaks one of them is not done.

- **Find events** (`#/browse`), **Near me** (`#/near`), **International** (`#/intl`), **Calendars** (`#/calendars`), and **News** (`#/news`).
- **Event pages** at `/events/<id>/`, and the home page that loads them.
- **The daily refresh.** `.github/workflows/refresh-events.yml` runs `python3 tools/build_public.py`, then `python3 scripts/build_seo.py`, and commits `data/events.json`, `data/intl.json`, and the generated pages when they changed. It pushes straight to `main`. Do not make that push fail.
- **NASP is United States only.** There is no NASP Australia. NASP is not part of ScoreTool.
- **Units follow the country.** Near me uses miles in the United States and the United Kingdom, and kilometres everywhere else. Weather uses mph in the United States and the United Kingdom (and a few other places that use mph), and km/h elsewhere. Temperature is °F in the United States and °C elsewhere.
- **Supabase accounts.** Sign-in, saved events, and entries stay on the archer's own account. Row level security is what protects that data.
- **The ScoreTool score bridge.** Finished scores are written only by `scoretool_save_score()` for a linked account (`supabase/scoretool_scores.sql`). Do not write `score_entries` any other way.

## Hard rules

- No personal email address, no home address, and no secret in a file GitHub Pages can serve. This repository is the public site, so that means the whole tree. The smoke check rejects the owner's personal Gmail (the address that starts with `nfstride1`) and the home street address (number 19 on Calooli). The business contact already printed on the site stays as it is.
- The Supabase publishable key in `config.js` is meant to be in the browser. Do not add a service-role key, a password, or any other private key.
- `privatecal.js` stays out of the repository.
- Keep pull requests small.
- Every change goes through a pull request, and the `smoke` check is green before merge.
- **Nathe approves go-live.** Merging to `main` publishes the site. Do not merge your own pull request.

Two jobs are allowed to push to `main` without a pull request, because the site already depends on them:

1. The daily refresh, which updates event data and the generated pages.
2. The preview job, which only adds or removes `pr-preview/pr-<number>/`. It does not edit the live pages at the root.

Anything else is a pull request.

When you commit, start the subject with the tag for who did the work: `[Claude]`, `[ChatGPT]`, `[Jarvis]`, `[Grok Bot]`, or `[Cursor]`.

## Checks

`.github/workflows/smoke.yml` runs on every pull request and on every push to `main`. The job name is `smoke`. It serves the committed files on localhost. It does not run the data refresh. It checks:

- the home page loads and the app reports no JavaScript error
- `data/events.json` and `data/intl.json` parse and each has events
- a sample of event pages listed in `sitemap.xml` exist on disk
- the personal Gmail address and the home street address are not in the files
- `privatecal.js` is absent
- `sitemap.xml` is valid XML, is a urlset, and its links point at archerycalendars.com

Run it locally with `python3 scripts/smoke_test.py`. It needs Chrome. It should finish in well under three minutes.

## Previews

`.github/workflows/preview.yml` runs on each pull request from this repository. It runs the same smoke test first. Only when that passes does it copy the committed site to `pr-preview/pr-<number>/` on `main` and comment the link:

`https://archerycalendars.com/pr-preview/pr-<number>/`

GitHub Pages already serves `main`, so the folder becomes a page on the existing site. Do not switch the Pages source off `main`. That would stop the live site updating when the daily refresh pushes. The preview is not a second data refresh: it publishes the files already in the pull request. Hash links stay in the preview. Links that start with `/` open the live site. The folder is deleted when the pull request is closed.

The `preview` job is not a required check. It does not run on a direct push to `main`, so requiring it would block merges.

## Branch protection

This repository's token could not change branch protection (GitHub returned 403). Nathe turns it on, after the `smoke` workflow has run at least once so GitHub knows the check name.

The daily refresh and the preview job push straight to `main`. The rule has to let GitHub Actions bypass it, or those pushes stop and the calendar stops updating.

1. Sign in as the owner of https://github.com/nfstride1-ux/archery-calendar.
2. Open **Settings → Rules → Rulesets**: https://github.com/nfstride1-ux/archery-calendar/settings/rules
3. Choose **New ruleset**, then **New branch ruleset**.
4. Ruleset name: `Protect main`. Enforcement status: **Active**.
5. **Bypass list → Add bypass**. Choose the **GitHub Actions** app, and set the bypass mode to exempt so the daily refresh and the preview job can still push. Do not add a bypass for everyone with write access.
6. **Target branches**: include the default branch (`main`).
7. Turn these rules on:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging** (1 approval). That approval is Nathe's go-live.
   - **Require status checks to pass**. Add the check named `smoke`. If the list shows `Smoke / smoke`, choose that one. Do not add `preview`.
8. Save the ruleset.

Until that ruleset exists, a push to `main` still goes live. The smoke workflow still runs and reports red or green; it cannot block the push on its own.
