# Archery Calendar (Australia)

Every Australian archery shoot – Archery Australia, ABA and Archery WA; Field, 3D, Target and Indoor – in one calendar.
Save shoots, get reminders before entries close and track what you've paid. Static site / PWA, no build step, no tracking:
your saved shoots and entries stay in your browser (localStorage).

- Live: https://nfstride1-ux.github.io/archery-calendar/
- Dates come from organisers' public calendars; always check with the organiser.
- Clubs: send us your flyer – nfshold@gmail.com (NFS Strategic Holdings). No online entries? We'll list your shoot, set up a free entry form and send you the entry list. Free until 31 Dec 2026.
- Photo and font credits: [CREDITS.md](CREDITS.md) and the Credits page on the site.

Event flyers: page-1 previews only (bank details removed); organisers can ask for removal or updates at nfshold@gmail.com.

## Organisation status (badge on every shoot card, filter on Find shoots)
Worked out in `tools/build_data.py` from the data (field `org_status`), never typed in by hand:

| Badge | `org_status` | Rule |
|---|---|---|
| 📄 2026 flyer out / Details & entry out | `flyer` | We hold a flyer for the event's own year (`flyer_is_current`), **or** the organiser has an event/entry page for this year (`registration_url` of kind entry page, Archers Diary, email nomination, ABA Branch J nomination – not one carried over from last year's flyer and not just the ABA calendar), **or** it's a coaching/youth/come & try listing with a booking link (incl. "Book any time"). |
| 📅 Date confirmed · no flyer yet | `date` | On an official calendar with a confirmed date and venue (e.g. ABA 2026 National Calendar, World Archery/AA calendar, Archery WA feed) but no flyer or event page yet. |
| ⏳ Not organised yet | `not_organised` | Only last year's flyer/info exists (e.g. Baldivis Breakfast Field 15 Nov 2026 – only the 2025 flyer), or the listing is a placeholder: no date, dates TBC, or venue TBA. |

Entry badges come from the same data: 🔒 Entries closed (close date passed), ◷ Entries open <date> (opening date in the future), ✍ Entries open · close <date> (status `flyer` with an entry link or close date). Icons and text are always shown together – never colour alone.
