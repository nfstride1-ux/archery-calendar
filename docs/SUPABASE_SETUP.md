# Archery Calendar – switching on user accounts (Supabase)

Accounts are **built but switched off**. While `app/config.js` has an empty `SUPABASE_URL` / `SUPABASE_ANON_KEY`, the site has no
sign-in anywhere, doesn't load the sign-in code, and works exactly as before (everything saved in the browser on the device).

When switched on, the header gets a **Sign in** button. People sign in with an emailed link (no password) or, optionally, Google.
Signing in stays optional. What syncs: saved shoots, "I've entered / I've paid", amount, payment date, receipt/entry number, notes,
reminders already sent, and Settings (states, organisations, reminder days), plus a display name. It is stored in Supabase's
**Sydney (ap-southeast-2)** region, and each person can only read and write their own rows (Row Level Security).

## Keys: what is public and what is secret

| Key | Where it goes | OK to share? |
|---|---|---|
| **Project URL** (`https://<ref>.supabase.co`) | `app/config.js` | Yes, it's public |
| **Publishable key** (`sb_publishable_…`), or the legacy **anon public** key (`eyJ…`) | `app/config.js` | Yes, public by design (it's in every visitor's browser; RLS protects the data) |
| **Secret key** (`sb_secret_…`) / legacy **service_role** key | **Nowhere.** Not in the repo, not in chat, not in email | **NO, never.** It bypasses all security |
| Database password | Your password manager only | No |
| Google OAuth **client secret** (optional step G) | Only pasted into the Supabase dashboard | No |

The site refuses a secret or service_role key: the page ignores it, and `tools/build_public.py` stops the build.
Supabase is replacing the legacy `anon` key with the publishable key (`sb_publishable_…`) during 2026, so use the publishable key.

---

## Part 1: what Nathe does (about 10 minutes)

1. Go to **https://supabase.com** → **Start your project** → sign up with **nfshold@gmail.com** (choose "Continue with GitHub" or email + password; the free plan, no card needed). Turn on two-factor authentication under Account → Security if offered.
2. Create an organisation if asked (name: *NFS Strategic Holdings*, plan: **Free**).
3. **New project**:
   - Name: **archery-calendar**
   - Database password: click **Generate a password** and save it in your password manager. Nobody else needs it.
   - Region: **Asia-Pacific → Sydney (ap-southeast-2)**. This matters, because the privacy page says the data is in Sydney.
   - Click **Create new project** and wait about 2 minutes.
4. Copy the two **public** values:
   - Click **Connect** (top of the project page), or go to **Project Settings → API Keys**.
   - **Project URL**: looks like `https://abcdefghijklmnop.supabase.co`
   - **Publishable key**: starts with `sb_publishable_`. (If the project only shows legacy keys, copy the one labelled **anon / public**. Never the `service_role` or `secret` one.)
5. Send those two values to the assistant in chat. They're public, so chat is fine. **Do not send the secret / service_role key or the database password.**
6. (Optional, for more help with setup) Organisation → **Team** → invite another admin if you want someone else to manage it.

That's it for Nathe, unless you want **Google sign-in** (step G below needs your Google account) or a **custom email sender** (step E).

---

## Part 2: what the assistant / developer does (needs dashboard access, so Nathe either does these with the guide below or shares a screen)

### A. Create the database tables and security rules
1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole of **`supabase/schema.sql`** → **Run**. It's safe to run again later.
3. Check under **Table Editor**: `profiles` and `user_events` both show **RLS enabled** (a lock icon), each with 4 policies under Authentication → Policies.

What it creates:
- `profiles`: id (= the user's id), display_name, settings (jsonb), settings_updated_at, created_at. Created automatically at sign-up.
- `user_events`: user_id, event_id, saved, status (`not_entered` / `entered` / `paid`), paid_amount, paid_date, receipt, notes, reminders (jsonb), extra (jsonb), updated_at, synced_at. The primary key is (user_id, event_id).
- RLS: signed-in users can only read and write their own rows; signed-out visitors get nothing.
- `sync_user_events(rows)`: batch save, last write wins on `updated_at`. `save_profile(...)`: the same for settings and name. `delete_my_account()`: deletes the user and all their rows.

### B. Sign-in URLs
**Authentication → URL Configuration**
- **Site URL:** `https://archerycalendars.com/`
- **Redirect URLs** → Add:
  - `https://archerycalendars.com/**`
  - `https://www.archerycalendars.com/**` (www redirects to the main address, but harmless to allow)
  - `https://nfstride1-ux.github.io/archery-calendar/**` (old address; keep it)
  - `http://localhost:8765/**` (local testing only; remove it later if you like)

### C. Email sign-in settings
**Authentication → Sign In / Providers → Email**: Email provider **on**; "Confirm email" **on** (the magic link is the confirmation).
**Authentication → Settings / Sessions**: leave the defaults. The magic-link expiry is 1 hour.

### D. Email templates
**Authentication → Emails → Templates** (editing needs custom SMTP on new free projects, see E). Suggested text:
- **Magic Link**: Subject `Your Archery Calendar sign-in link`.
  Body: `<h2>Sign in to Archery Calendar</h2><p><a href="{{ .ConfirmationURL }}">Sign in</a></p><p>The link works once and expires in an hour. Open it in the same browser you asked from. If you didn't ask for this, ignore this email.</p><p>Archery Calendar · nfshold@gmail.com</p>`
- **Confirm signup**: Subject `Welcome to Archery Calendar – confirm your email`, same body with "Confirm and sign in".
Keep `{{ .ConfirmationURL }}`. The site uses the secure PKCE flow, and this link brings people back to the site with a one-time code.

### E. Email sender (IMPORTANT before real users sign up)
Supabase's built-in email sender is **for testing only**. It only sends to members of the Supabase organisation's team (e.g. nfshold@gmail.com),
about **2 emails per hour**. Anyone else gets "Email address not authorized". Before inviting archers, set **Authentication → Emails → SMTP Settings**:
- Easiest with no domain: **Gmail SMTP** from nfshold@gmail.com. Turn on 2-step verification on the Google account, create an **App password**
  (myaccount.google.com → Security → App passwords). Then host `smtp.gmail.com`, port `465`, username `nfshold@gmail.com`, password = the app password,
  sender name `Archery Calendar`. Gmail allows about 500 emails a day. The app password goes only into this Supabase form.
- Better deliverability later: a transactional email service (e.g. Resend, Brevo, Postmark) with your own domain.
- Then **Authentication → Rate Limits** → emails per hour: 30 is fine to start.
Google sign-in (G) doesn't need email at all.

### F. Switch it on
1. Put the two public values in `app/config.js`:
   ```js
   window.SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
   window.SUPABASE_ANON_KEY = 'sb_publishable_…';   // publishable or legacy anon key, never the secret/service_role key
   window.SUPABASE_GOOGLE = false;                  // true after step G
   ```
2. `python3 tools/build_public.py`, test locally (`tools/qa_accounts.py` + a real sign-in with nfshold@gmail.com), then push `dist/`.
3. Live check: Sign in → email arrives → link opens the site signed in → mark a shoot paid → open the site on a phone, sign in → the shoot shows as paid.

### G. Google sign-in (optional, needs Nathe's Google account)
1. **https://console.cloud.google.com** (signed in as nfshold@gmail.com) → create a project **Archery Calendar**.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding):
   app name *Archery Calendar*, support email nfshold@gmail.com, app logo optional,
   **Authorised domains**: `supabase.co` and `archerycalendars.com` (home page `https://archerycalendars.com/`, privacy `https://archerycalendars.com/#/privacy`).
   Audience: **External**. Scopes: only `openid`, `email`, `profile` (no verification needed for these). Then **Publish app**; in "Testing" mode only listed test users can sign in.
3. **Clients → Create client → Web application**:
   - Authorised JavaScript origins: `https://archerycalendars.com`
   - Authorised redirect URIs: `https://<your-ref>.supabase.co/auth/v1/callback` (copy the exact one from Supabase → Authentication → Sign In / Providers → Google)
4. Copy the **Client ID** and **Client secret** into **Supabase → Authentication → Sign In / Providers → Google** → enable → Save.
   The client secret only ever goes into that Supabase form.
5. Set `window.SUPABASE_GOOGLE = true;` in `app/config.js`, rebuild and push. The sign-in page then shows **Continue with Google**.

### H. Things to know about the free plan
- Free projects **pause after about 7 days with no activity**. Normal use keeps it awake; if it pauses, click **Restore** in the dashboard. While it's paused, the site still works from each device and changes sync once it's back.
- Limits: 500 MB database, 50,000 monthly active users. This app stores about 1 KB per saved shoot, so it's nowhere near the limits.
- Backups: free projects have no point-in-time recovery. Download a copy occasionally (Database → Backups, or `pg_dump` with the database password).

---

## How sync works (for the developer)
- Everything still saves to `localStorage` first, so the site is instant and works offline and signed out.
- `app/sync.js` compares the device data with what the server last had after every save, and queues changed shoots with a device timestamp (`updated_at`). The queue lives in `localStorage` (`archreg.sync.v1`), so it survives closing the tab and being offline.
- Pushing calls `sync_user_events` in batches of 200. The server keeps whichever change is newer (last write wins), and caps device clocks at +5 minutes so a wrong clock can't win forever.
- Pulling fetches rows changed since the last pull, using the **server's** receive time (`synced_at`, with a 2-minute overlap), so a change made offline days ago still reaches other devices.
- Sync runs after each change (1.5 s debounce), on sign-in, when the tab becomes visible, when the browser comes back online, and every 5 minutes.
- First sign-in on a device that already has data asks the person what to do: **add it to the account** (merge; where the same shoot differs, the newest change wins) or **use the account's data only**.
- Sign out keeps the device's copy, or "Sign out and remove my shoots from this device" clears it. **Delete account and data** calls `delete_my_account()`, which removes the user and all their rows.

## Tests
- `node tests/test_sync.js`: sync logic against an in-memory server with the same rules as the SQL (13 tests: mapping, merge, last write wins, offline queue, late-arriving offline changes, tombstones, settings, user isolation, clock skew, errors, batching).
- `bash tests/test_schema.sh`: runs `supabase/schema.sql` on a throwaway local PostgreSQL with a stand-in for Supabase's `auth` schema, and checks RLS (users can't see or change each other's rows, anon gets nothing), last write wins, limits, re-runnability and account deletion.
- `tools/qa_accounts.py <url>`: browser tests. With the real (empty) config it checks there's no sign-in UI; with a test config and a mock supabase-js it covers sign-in, merge, sync, offline, second device, settings, sign-out and delete.
