#!/usr/bin/env python3
"""Refresh the public event JSON that GitHub Pages serves.

    python3 tools/build_public.py
    python3 tools/build_public.py --source world-archery
    python3 tools/build_public.py --source world-archery --if-in-season
    python3 tools/build_public.py --self-test

Implemented sources: world-archery (public competitions API, no API key), any
Australian state association whose WordPress site answers The Events Calendar JSON
API or a real iCal feed, and Archer's Diary (the public CalendarFeed used by its
event calendar). Archery GB and Archery NZ block automated clients. This script
does not try to get around that. A site that returns 403 or a challenge page is
skipped and reported. A source that is actually fetched fails the run (exit 1,
files left untouched) when it returns 0 events or when that source's own upcoming
count drops by more than 30%.

`generated` is a UTC timestamp. Each fetched source records `last_checked` on the
file and, as a date, on the events that source confirmed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = {
    'events': ROOT / 'data' / 'events.json',
    'intl': ROOT / 'data' / 'intl.json',
}
UA = 'ArcheryCalendars/1.0 (scheduled data refresh; contact nfshold@gmail.com)'
WA_API = 'https://api.worldarchery.sport/v3/COMPETITIONS/?CompId={cid}&RBP=1'
WA_ID = re.compile(r'^wa-(\d+)$')
DROP = 0.30
# Outdoor season April–October, indoor season November–February. March is off
# unless a World Archery event already on the calendar falls within 21 days.
SEASON_MONTHS = {1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12}

NOT_FETCHED = (
    'Archery GB and Archery NZ block automated clients. This job does not try to bypass that.',
)


def now_stamp(now=None):
    now = now or dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    return now.strftime('%Y-%m-%dT%H:%M:%SZ'), now.strftime('%Y-%m-%d')


def is_wa(ev):
    eid = str(ev.get('id') or '')
    if WA_ID.match(eid):
        return True
    url = str(ev.get('source_url') or '')
    return 'worldarchery.sport/competition/' in url or 'worldarchery.org/competition/' in url


def wa_cid(ev):
    m = WA_ID.match(str(ev.get('id') or ''))
    if m:
        return m.group(1)
    url = str(ev.get('source_url') or '')
    m = re.search(r'/competition/(\d+)', url)
    return m.group(1) if m else ''


def in_season(today, events):
    if today.month in SEASON_MONTHS:
        return True
    horizon = today + dt.timedelta(days=21)
    for ev in events:
        if not is_wa(ev):
            continue
        try:
            start = dt.date.fromisoformat(ev.get('start_date') or '')
        except ValueError:
            continue
        try:
            end = dt.date.fromisoformat(ev.get('end_date') or ev.get('start_date') or '')
        except ValueError:
            end = start
        if start <= horizon and end >= today:
            return True
    return False


def guard(previous, returned, source):
    """Fail when this source is empty or drops by more than 30% versus its own previous count."""
    if returned <= 0:
        raise SystemExit(f'{source}: source returned 0 events (had {previous}). Not writing.')
    if previous and returned < previous * (1 - DROP):
        raise SystemExit(
            f'{source}: count dropped from {previous} to {returned} '
            f'({(1 - returned / previous) * 100:.0f}%, over 30%). Not writing.')


def load_file(path):
    text = path.read_text(encoding='utf-8')
    sep = (', ', ': ') if '": "' in text[:80] else (',', ':')
    nl = text.endswith('\n')
    return json.loads(text), sep, nl


def dump_file(path, obj, sep, nl):
    text = json.dumps(obj, ensure_ascii=False, separators=sep)
    if nl:
        text += '\n'
    path.write_text(text, encoding='utf-8')


def fetch_comp(cid):
    req = urllib.request.Request(WA_API.format(cid=cid), headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            data = json.loads(res.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    items = data.get('items') or []
    return items[0] if items else None


def apply_comp(ev, comp, day):
    """Stamp last_checked. Names and dates stay as curated: the API's short names and a few
    DFrom values disagree with the records already checked by hand (one 2026 event comes back
    with a 2025 start). The fetch is still the count guard."""
    changed = []
    if (ev.get('last_checked') or '') != day:
        ev['last_checked'] = day
        changed.append('last_checked')
    return changed


def stamp_sources(doc, source, stamp, count, previous, extra=None):
    sources = doc.get('sources')
    if not isinstance(sources, dict):
        sources = {}
        rest = {k: v for k, v in doc.items() if k != 'generated'}
        doc.clear()
        doc['generated'] = stamp
        doc['sources'] = sources
        for k, v in rest.items():
            if k != 'sources':
                doc[k] = v
    doc['generated'] = stamp
    rec = {'last_checked': stamp, 'count': count, 'previous': previous}
    if extra:
        rec.update(extra)
    sources[source] = rec
    doc['sources'] = sources


def world_archery(docs, stamp, day, dry_run):
    rows = []
    for key, (doc, sep, nl) in docs.items():
        for ev in doc.get('events') or []:
            if is_wa(ev):
                cid = wa_cid(ev)
                if cid:
                    rows.append((key, ev, cid))
    ids = sorted({cid for _, _, cid in rows}, key=int)
    previous = len(ids)
    print(f'world-archery: {previous} events in the JSON, fetching {len(ids)} competitions', flush=True)
    found = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        for cid, comp in zip(ids, pool.map(fetch_comp, ids)):
            if comp:
                found[str(cid)] = comp
    returned = len(found)
    print(f'world-archery: API returned {returned} of {len(ids)}', flush=True)
    guard(previous, returned, 'world-archery')
    field_n = {}
    confirmed = 0
    for key, ev, cid in rows:
        comp = found.get(cid)
        if not comp:
            continue
        confirmed += 1
        for field in apply_comp(ev, comp, day):
            field_n[field] = field_n.get(field, 0) + 1
    print(f'world-archery: updated last_checked on {confirmed} event rows; fields {field_n or {"none": 0}}', flush=True)
    if not dry_run:
        for key, (doc, sep, nl) in docs.items():
            stamp_sources(doc, 'world-archery', stamp, returned, previous)
    return returned


# State association sites. Each run tries the Events Calendar JSON API, then iCal.
# A 403 or a challenge page is skipped. HTML that ignores ?ical=1 is not a feed.
STATE_FEEDS = (
    {'id': 'archery-sa', 'name': 'Archery SA', 'state': 'SA', 'org': 'Archery SA',
     'host': 'archerysa.org.au', 'source_name': 'Archery SA calendar',
     'json': 'https://archerysa.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://archerysa.org.au/events/?ical=1',)},
    {'id': 'archery-nsw', 'name': 'Archery NSW', 'state': 'NSW', 'org': 'Archery NSW',
     'host': 'archerynsw.org.au', 'source_name': 'Archery NSW calendar',
     'json': 'https://archerynsw.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://archerynsw.org.au/events/?ical=1',)},
    {'id': 'archery-vic', 'name': 'Archery Victoria', 'state': 'VIC', 'org': 'Archery Victoria',
     'host': 'archeryvic.org.au', 'source_name': 'Archery Victoria calendar',
     'json': 'https://archeryvic.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://archeryvic.org.au/calendar-av-aa/?ical=1', 'https://archeryvic.org.au/events/?ical=1')},
    {'id': 'archery-wa', 'name': 'Archery WA', 'state': 'WA', 'org': 'Archery WA',
     'host': 'www.archerywa.com.au', 'source_name': 'Archery WA calendar',
     'json': 'https://www.archerywa.com.au/wp-json/tribe/events/v1/events',
     'ical': ('https://www.archerywa.com.au/events/?ical=1',)},
    {'id': 'archery-qld', 'name': 'Archery Queensland', 'state': 'QLD', 'org': 'Archery Queensland',
     'host': 'archeryqueensland.org.au', 'source_name': 'Archery Queensland events',
     'json': 'https://archeryqueensland.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://archeryqueensland.org.au/events/?ical=1',)},
    {'id': 'archery-tas', 'name': 'Archery Tasmania', 'state': 'TAS', 'org': 'Archery Tasmania',
     'host': 'www.archerytasmania.org.au', 'source_name': 'Archery Tasmania calendar',
     'json': 'https://www.archerytasmania.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://www.archerytasmania.org.au/events/?ical=1',)},
    {'id': 'archery-act', 'name': 'Archery ACT', 'state': 'ACT', 'org': 'Archery ACT',
     'host': 'www.archeryact.asn.au', 'source_name': 'Archery ACT calendar',
     'json': 'https://www.archeryact.asn.au/wp-json/tribe/events/v1/events',
     'ical': ('https://www.archeryact.asn.au/calendar/?ical=1',)},
    {'id': 'archery-nt', 'name': 'Northern Territory Bowhunters Association', 'state': 'NT', 'org': 'Northern Territory Bowhunters Association',
     'host': 'www.ntarchery.org.au', 'source_name': 'NT Bowhunters calendar',
     'json': 'https://www.ntarchery.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://www.ntarchery.org.au/events/?ical=1',)},
    {'id': 'archery-australia', 'name': 'Archery Australia', 'state': '', 'org': 'Archery Australia',
     'host': 'archery.org.au', 'source_name': 'Archery Australia event calendar',
     'json': 'https://archery.org.au/wp-json/tribe/events/v1/events',
     'ical': ('https://archery.org.au/national-event-calendar/?ical=1', 'https://archery.org.au/events/?ical=1')},
)
NAME_STOP = {'archery', 'the', 'of', 'and', 'club', 'event', 'tournament', 'shoot', 'sa', 'nsw', 'vic', 'wa', 'qld', 'tas', 'act', 'nt', 'a', 'an'}
SKIP_TITLE = re.compile(
    r"^(public holiday|school holidays|mothers. day|fathers. day|end of daylight|start of daylight|buy swap sell)\b",
    re.I)
MEMBERS_RE = re.compile(r"members?\s*[- ]?only|club members only|club championship", re.I)
CHALLENGE_RE = re.compile(r"cf-browser-verification|just a moment|attention required|captcha", re.I)


def aus_today():
    return dt.datetime.now(ZoneInfo('Australia/Sydney')).date()


def fetch_bytes(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, text/calendar, */*'})
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            return res.status, res.headers.get('content-type', ''), res.read()
    except urllib.error.HTTPError as err:
        return err.code, err.headers.get('content-type', '') or '', err.read(800)
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        return 0, type(err).__name__, str(err).encode()


def blocked(status, body):
    if status in (401, 403, 429):
        return True
    text = body[:600].decode('utf-8', 'replace') if isinstance(body, (bytes, bytearray)) else ''
    return bool(CHALLENGE_RE.search(text))


def plain_title(value):
    text = html.unescape(value or '')
    text = text.replace('\u2013', ' - ').replace('\u2014', ' - ')
    return re.sub(r'\s+', ' ', text).strip()


def name_tokens(value):
    words = re.findall(r'[a-z0-9]+', plain_title(value).lower())
    return {w for w in words if w not in NAME_STOP and not re.fullmatch(r'20\d\d', w) and len(w) > 1}


def jaccard(a, b):
    if not a or not b:
        return 0
    return len(a & b) / len(a | b)


def overseas_listing(ev):
    """A state calendar sometimes lists the Olympics or a games meet held overseas."""
    venue = as_venue(ev.get('venue'))
    country = plain_title(str(venue.get('country') or ''))
    blob = plain_title(ev.get('title') or '') + ' ' + venue_text(venue) + ' ' + country
    if country and country.lower() not in ('australia', 'au'):
        return True
    return bool(re.search(r'\b(japan|los angeles|united states|california|tottori)\b', blob, re.I))


def keep_tribe(ev):
    if ev.get('hide_from_listings') or overseas_listing(ev):
        return False
    cats = {c.get('name') for c in ev.get('categories') or []}
    title = plain_title(ev.get('title'))
    if re.match(r'^QRE in SA\b', title, re.I):
        return False
    if SKIP_TITLE.search(title):
        return False
    if 'Meeting' in cats and not (cats & {'Tournament', 'QRE', 'Club Tournament', 'Masters Games'}):
        return False
    if cats & {'Tournament', 'QRE', 'Club Tournament', 'Masters Games'}:
        return True
    if 'Club event' in cats and 'Social' not in cats:
        return True
    return False


def clock12(h, mi):
    suffix = 'am' if h < 12 else 'pm'
    hour = h % 12 or 12
    return f'{hour}:{mi:02d} {suffix}'


def times_text(start, end, all_day):
    if all_day or not start or len(start) < 16:
        return ''
    try:
        sh, sm = int(start[11:13]), int(start[14:16])
        eh, em = (int(end[11:13]), int(end[14:16])) if end and len(end) >= 16 else (sh, sm)
    except ValueError:
        return ''
    if (sh, sm) == (0, 0) and (eh, em) in ((0, 0), (23, 59)):
        return ''
    start_s = clock12(sh, sm)
    if (sh, sm) == (eh, em):
        return start_s + ' start'
    return start_s + ' - ' + clock12(eh, em)


def http_url(value):
    text = (value or '').strip()
    if not text or ' ' in text:
        return ''
    if text.startswith('http://') or text.startswith('https://'):
        return text
    if '.' in text:
        return 'https://' + text.lstrip('/')
    return ''


def as_venue(venue):
    if isinstance(venue, list):
        venue = venue[0] if venue else None
    return venue if isinstance(venue, dict) else {}


def venue_text(venue):
    venue = as_venue(venue)
    if not venue:
        return ''
    parts = []
    for key in ('venue', 'address', 'city', 'province', 'state', 'zip'):
        bit = plain_title(str(venue.get(key) or ''))
        if bit and bit not in parts and bit.lower() != 'none':
            parts.append(bit)
    return ', '.join(parts)


def discipline_of(title):
    t = title.lower()
    if 'indoor' in t:
        return 'Indoor'
    if 'clout' in t:
        return 'Clout'
    if 'field' in t:
        return 'Field'
    if '3d' in t:
        return '3D'
    return 'Target'


def members_only_text(title, cats):
    blob = title + ' ' + ' '.join(cats)
    return MEMBERS_RE.search(blob) is not None


def tribe_to_item(ev, spec):
    title = plain_title(ev.get('title'))
    start = str(ev.get('start_date') or '')
    end = str(ev.get('end_date') or '')
    start_day = start[:10]
    end_day = end[:10] if len(end) >= 10 else start_day
    if not re.fullmatch(r'\d{4}-\d\d-\d\d', start_day):
        return None
    if not re.fullmatch(r'\d{4}-\d\d-\d\d', end_day) or end_day < start_day:
        end_day = start_day
    cats = [c.get('name') or '' for c in ev.get('categories') or []]
    org_name = spec['org']
    orgs = ev.get('organizer') or []
    if isinstance(orgs, dict):
        orgs = [orgs]
    if orgs and isinstance(orgs[0], dict) and orgs[0].get('organizer'):
        org_name = plain_title(orgs[0]['organizer'])
    desc = re.sub(r'<[^>]+>', ' ', ev.get('description') or '')
    desc = plain_title(desc)
    tbc = bool(re.search(r'date to be confirmed|\bdates?\s+tbc\b', desc, re.I))
    modified = str(ev.get('modified_utc') or '')[:10]
    return {
        'tribe_id': ev.get('id'),
        'title': title,
        'start': start_day,
        'end': end_day,
        'times': times_text(start, end, ev.get('all_day')),
        'location': venue_text(ev.get('venue')),
        'url': ev.get('url') or '',
        'registration_url': http_url(ev.get('website')),
        'org': org_name,
        'members_only': members_only_text(title, cats),
        'discipline': discipline_of(title),
        'dates_confirmed': not tbc,
        'modified': modified,
        'state': spec['state'],
        'source_name': spec['source_name'],
        'host': spec['host'],
    }


def parse_ical(body, spec):
    text = body.decode('utf-8', 'replace').replace('\r\n', '\n').replace('\r', '\n')
    lines = []
    for line in text.split('\n'):
        if line.startswith((' ', '\t')) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    items, cur = [], None

    def finish():
        if not cur or not cur.get('title') or not cur.get('start'):
            return
        items.append({
            'tribe_id': None,
            'title': plain_title(cur['title']),
            'start': cur['start'],
            'end': cur.get('end') or cur['start'],
            'times': '',
            'location': plain_title(cur.get('location') or ''),
            'url': cur.get('url') or '',
            'registration_url': '',
            'org': spec['org'],
            'members_only': members_only_text(cur['title'], []),
            'discipline': discipline_of(cur['title']),
            'dates_confirmed': True,
            'modified': '',
            'state': spec['state'],
            'source_name': spec['source_name'],
            'host': spec['host'],
        })

    for line in lines:
        if line == 'BEGIN:VEVENT':
            cur = {}
        elif line == 'END:VEVENT':
            finish()
            cur = None
        elif cur is not None and ':' in line:
            key, val = line.split(':', 1)
            key = key.split(';', 1)[0]
            val = val.replace('\\n', ' ').replace('\\,', ',')
            if key == 'SUMMARY':
                cur['title'] = val
            elif key == 'LOCATION':
                cur['location'] = val
            elif key == 'URL':
                cur['url'] = val
            elif key in ('DTSTART', 'DTEND'):
                digits = re.sub(r'\D', '', val)[:8]
                if len(digits) == 8:
                    day = f'{digits[0:4]}-{digits[4:6]}-{digits[6:8]}'
                    if key == 'DTSTART':
                        cur['start'] = day
                    else:
                        got = dt.date.fromisoformat(day) - dt.timedelta(days=1) if 'VALUE=DATE' in line else dt.date.fromisoformat(day)
                        # all-day DTEND is exclusive; timed DTEND is the end clock, date is inclusive
                        if val.endswith('T000000') or 'VALUE=DATE' in line or len(re.sub(r'\D', '', val)) == 8:
                            got = dt.date.fromisoformat(day) - dt.timedelta(days=1)
                        cur['end'] = got.isoformat()
    return [it for it in items if not SKIP_TITLE.search(it['title'])]


def load_tribe(spec, today):
    query = urllib.parse.urlencode({'start_date': today.isoformat(), 'per_page': 50, 'page': 1, 'status': 'publish'})
    url = spec['json'] + '?' + query
    pages = 0
    kept = []
    raw = 0
    status, ctype = 0, ''
    while url and pages < 20:
        status, ctype, body = fetch_bytes(url)
        if pages == 0 and blocked(status, body):
            return 'blocked', [(f'JSON {status}', spec['json'])], [], 0
        if status != 200 or 'json' not in str(ctype).lower() or not body.lstrip().startswith(b'{'):
            if pages == 0:
                kind = str(ctype).split(';')[0]
                return 'json-failed', [(f'JSON {status} {kind}', spec['json'])], [], 0
            break
        data = json.loads(body.decode('utf-8'))
        batch = data.get('events') or []
        raw += len(batch)
        for ev in batch:
            if keep_tribe(ev):
                item = tribe_to_item(ev, spec)
                if item:
                    kept.append(item)
        pages += 1
        url = data.get('next_rest_url') or ''
    return 'json', [(f'JSON {status}', spec['json'])], kept, raw


def load_feed(spec, today):
    mode, notes, kept, raw = None, [], [], 0
    result = load_tribe(spec, today)
    if result[0] == 'json':
        return result
    mode, notes = result[0], result[1]
    if mode == 'blocked':
        return mode, notes, [], 0
    for ical in spec['ical']:
        status, ctype, body = fetch_bytes(ical)
        label = f'iCal {status} {ctype.split(";")[0]}'
        notes.append((label, ical))
        if blocked(status, body):
            return 'blocked', notes, [], 0
        if status == 200 and body.lstrip().startswith(b'BEGIN:VCALENDAR'):
            items = parse_ical(body, spec)
            return 'ical', notes, items, len(items)
    return 'none', notes, [], raw


def belongs_to_source(ev, spec):
    url = ev.get('source_url') or ''
    name = ev.get('source_name') or ''
    return spec['host'] in url or name == spec['source_name']


def upcoming_for(events, spec, today):
    day = today.isoformat()
    out = []
    for ev in events:
        if not belongs_to_source(ev, spec):
            continue
        end = ev.get('end_date') or ev.get('start_date') or ''
        if end >= day:
            out.append(ev)
    return out


def match_existing(item, events):
    url = item['url']
    if url:
        for ev in events:
            if (ev.get('source_url') or '').rstrip('/') == url.rstrip('/'):
                return ev
    tokens = name_tokens(item['title'])
    best, best_score, second = None, 0, 0
    for ev in events:
        if ev.get('country_code') not in (None, '', 'AUS'):
            continue
        other_state = item['state'] and ev.get('state_code') not in (item['state'], None, '')
        try:
            theirs = dt.date.fromisoformat(ev.get('start_date') or '')
            mine = dt.date.fromisoformat(item['start'])
        except ValueError:
            continue
        if abs((theirs - mine).days) > 3:
            continue
        score = jaccard(tokens, name_tokens(ev.get('name') or ''))
        if item['location'] and ev.get('location'):
            if jaccard(name_tokens(item['location']), name_tokens(ev['location'])) >= 0.34:
                score += 0.15
        if abs((theirs - mine).days) == 0:
            score += 0.05
        if other_state and score < 0.55:
            continue
        if score > best_score:
            second = best_score
            best, best_score = ev, score
        elif score > second:
            second = score
    if best_score >= 0.5 and best_score > second + 0.02:
        return best
    return None


def slug_id(spec, item, taken):
    stem = re.sub(r'[^a-z0-9]+', '-', item['title'].lower()).strip('-')[:48].strip('-')
    prefix = {'SA': 'asa', 'NSW': 'answ', 'VIC': 'avic', 'WA': 'awa', 'QLD': 'aqld', 'TAS': 'atas', 'ACT': 'aact', 'NT': 'ant'}.get(spec['state'], 'aa')
    base = f'{prefix}-{stem}-{item["start"]}'
    if item.get('tribe_id'):
        base = f'{base}-{item["tribe_id"]}'
    eid = base
    n = 2
    while eid in taken:
        eid = f'{base}-{n}'
        n += 1
    return eid


def apply_item(ev, item, day):
    """Fill empty fields. Leave curated text unless the feed was modified after last_checked."""
    changed = []
    if (ev.get('last_checked') or '') != day:
        ev['last_checked'] = day
        changed.append('last_checked')
    if item['registration_url'] and not ev.get('registration_url'):
        ev['registration_url'] = item['registration_url']
        ev['registration_url_verified'] = False
        changed.append('registration_url')
    if item['location'] and not (ev.get('location') or '').strip():
        ev['location'] = item['location']
        changed.append('location')
    if item['times'] and not (ev.get('start_times') or '').strip():
        ev['start_times'] = item['times']
        changed.append('start_times')
    if item['members_only'] and not ev.get('members_only'):
        ev['members_only'] = True
        changed.append('members_only')
    return changed


def _near(old, new):
    try:
        return abs((dt.date.fromisoformat(new) - dt.date.fromisoformat(old)).days) <= 21
    except ValueError:
        return False


def apply_item_dates(ev, item, previous_checked):
    """Move a date only when the feed was edited after our last check, and only by a few weeks."""
    if not item['modified'] or not previous_checked or item['modified'] <= previous_checked:
        return []
    changed = []
    if item['start'] and ev.get('start_date') and item['start'] != ev.get('start_date') and _near(ev['start_date'], item['start']):
        ev['start_date'] = item['start']
        changed.append('start_date')
    if item['end'] and ev.get('end_date') and item['end'] != ev.get('end_date') and _near(ev['end_date'], item['end']):
        ev['end_date'] = item['end']
        changed.append('end_date')
    return changed


def new_event(spec, item, taken):
    members = item['members_only']
    level = 'Club Championship (members only)' if members and re.search(r'club championship', item['title'], re.I) else (
        'Club (members only)' if members else ('State Championship' if re.search(r'\bstate\b', item['title'], re.I) and re.search(r'championship', item['title'], re.I) else 'Tournament'))
    return {
        'id': slug_id(spec, item, taken),
        'name': item['title'],
        'org_id': 'wa-aus',
        'org': item['org'] or spec['org'],
        'country_code': 'AUS',
        'country': 'Australia',
        'state': spec['state'] or None,
        'start_date': item['start'],
        'end_date': item['end'],
        'dates_confirmed': item['dates_confirmed'],
        'location': item['location'] or None,
        'discipline': item['discipline'],
        'level': level,
        'rounds': None,
        'registration_url': item['registration_url'] or None,
        'registration_opens': None,
        'entry_close_date': None,
        'fee': None,
        'notes': None,
        'source_url': item['url'] or spec['json'],
        'source_name': spec['source_name'],
        'last_checked': None,
        'category': 'club' if members else 'competition',
        'world_level': False,
        'registration_url_kind': None,
        'registration_url_verified': False,
        'org_status': 'no_details',
        'state_code': spec['state'] or None,
        'org_group': 'aa',
        'club_id': None,
        'members_only': True if members else None,
        'start_times': item['times'] or None,
    }


def refresh_state(spec, docs, stamp, day, dry_run):
    today = dt.date.fromisoformat(day)
    loaded = load_feed(spec, today)
    mode, notes, kept, raw = loaded
    where = '; '.join(f'{label} {url}' for label, url in notes)
    if mode in ('blocked', 'none', 'json-failed'):
        print(f'{spec["id"]}: no feed ({mode}). {where}', flush=True)
        return 0
    events = docs['events'][0].get('events') or []
    previous_rows = upcoming_for(events, spec, today)
    print(f'{spec["id"]}: {mode} feed, {raw} raw, {len(kept)} shoots, {len(previous_rows)} upcoming already listed. {where}', flush=True)
    if not kept:
        if not raw:
            guard(len(previous_rows), 0, spec['id'])
        print(f'{spec["id"]}: feed had events but none were shoots (meetings and holidays left out)', flush=True)
        return 0
    guard(len(previous_rows), len(kept), spec['id'])
    taken = {e.get('id') for e in events}
    added = updated = 0
    fields = {}
    for item in kept:
        match = match_existing(item, events)
        if match:
            before = match.get('last_checked') or ''
            changed = apply_item(match, item, day)
            changed += apply_item_dates(match, item, before if before != day else '')
            if changed:
                updated += 1
                for name in changed:
                    fields[name] = fields.get(name, 0) + 1
        else:
            ev = new_event(spec, item, taken)
            ev['last_checked'] = day
            events.append(ev)
            taken.add(ev['id'])
            added += 1
    print(f'{spec["id"]}: added {added}, updated {updated}, fields {fields or {"none": 0}}', flush=True)
    if not dry_run:
        doc = docs['events'][0]
        doc['events'] = events
        if added:
            doc['count'] = len(events)
        stamp_sources(doc, spec['id'], stamp, len(kept), len(previous_rows), {'added': added, 'updated': updated, 'via': mode})
    return len(kept)


def _state_runner(spec):
    def run(docs, stamp, day, dry_run):
        return refresh_state(spec, docs, stamp, day, dry_run)
    return run


# Archer's Diary publishes the calendar the site itself renders, as JSON:
# https://www.archersdiary.com/services/CalendarFeed.ashx?start=&end=&state=
# FullCalendar's end date is exclusive. robots.txt is not published (404). The
# disclaimer and privacy statement do not forbid automated reading. A 403 or a
# challenge page stops this source; nothing is retried and no other client is tried.
AD_SOURCE = 'archers-diary'
AD_SOURCE_NAME = "Archer's Diary CalendarFeed"
AD_FEED = 'https://www.archersdiary.com/services/CalendarFeed.ashx'
AD_HOST = 'www.archersdiary.com'
AD_PAGE = 'https://www.archersdiary.com/EventCalendar.aspx'
# RGB values from the calendar's state dropdown. Queensland is two associations.
AD_RGB = (
    ('5', 'ACT', 'Archery ACT'),
    ('2', 'NSW', 'Archery NSW'),
    ('1', 'TAS', 'Archery Tasmania'),
    ('3', 'SA', 'Archery SA'),
    ('4', 'VIC', 'Archery Victoria'),
    ('6', 'WA', 'Archery WA'),
    ('9', 'QLD', 'North Queensland Archery Association'),
    ('7', 'QLD', 'South Queensland Archery Society'),
)
AD_SHOOT = re.compile(
    r'shoot|rounds?|tournaments?|qre|champs?|championships?|match(?:play)?|competitions?|\bcomp\b|'
    r'clout|indoor|field|target|novelty|\bfun\b|league|medal|enduro|come\s*(?:and|&)\s*try|have a go|'
    r'ozbow|arrows?|\b720\b|\b900\b|\b1440\b|canberra|binge|skins|break\s*up|breakup',
    re.I)
AD_NOT_SHOOT = re.compile(
    r'\bno archery\b|range closed|\bcancell?ed\b|\bpostponed\b|^\s*\*+\s*no\b|\bno\s+(?:sat\b|sun\b|sunday|shoot)|'
    r'\btest event\b',
    re.I)
AD_NON_EVENT = re.compile(
    r'\b(agm|annual general meeting|committee meeting|general meeting|working bee|busy bee|meetings?)\b|'
    r'\bcoaching\b|\b(practice|training|traing)\b|\bdevelopment day\b|\byouth development\b|\bparty\b',
    re.I)
AD_MEMBERS = re.compile(
    r"members?\s*[-'’]?\s*only|member'?s\s+only|\bclub\s*champs?\b|\bclub\s+championships?\b",
    re.I)
AD_GENERIC = {
    'target', 'indoor', 'field', 'sunday', 'saturday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'night', 'round', 'rounds', 'arrow', 'arrows', 'open', 'day', 'christmas', 'fun', 'am', 'pm', 'sat', 'sun',
    'thu', 'tue', 'wed', 'fri', 'mon', 'start', 'ranking', 'free', 'choice', 'short', 'long', 'morning',
    'afternoon', 'evening', 'plus', 'annual',
}
AD_SYN = {'xmas': 'christmas', 'champs': 'championship', 'champ': 'championship', 'championships': 'championship'}
AD_CLUB_STOP = {'inc', 'incorporated', 'club', 'the', 'of', 'and', 'ltd'}
AD_HOME = re.compile(
    r'\b\d{1,5}\s+[A-Za-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Crescent|Cres|'
    r'Lane|Ln|Place|Pl|Terrace|Tce|Way|Parade|Pde|Close|Cl)\b',
    re.I)
AD_STREET_WORD = re.compile(
    r'\b(?:street|road|rd|avenue|ave|drive|dr|court|crescent|cres|lane|terrace|parade|close)\b',
    re.I)
AD_HOLIDAY = re.compile(r'christmas|xmas|novelty|break\s*up|breakup|binge', re.I)
AD_QRE_KIND = ('field', 'target', 'indoor', 'clout', '3d')


def ad_tokens(value):
    return {AD_SYN.get(w, w) for w in name_tokens(value)}


def ad_club_tokens(value):
    words = re.findall(r'[a-z0-9]+', plain_title(value).lower())
    return [w for w in words if w not in AD_CLUB_STOP and len(w) > 1]


def ad_phrase_in(short, long):
    """True when the shorter club name sits in the longer one as a whole phrase."""
    if not short or not long:
        return False
    if short == long:
        return True
    if len(short) < 2:
        return False
    for i in range(len(long) - len(short) + 1):
        if long[i:i + len(short)] == short:
            return True
    return False


def ad_same_label(a, b):
    left, right = ad_club_tokens(a), ad_club_tokens(b)
    return ad_phrase_in(left, right) or ad_phrase_in(right, left)


def ad_home_address(value):
    return AD_HOME.search(value or '') is not None


def ad_public_place(value):
    """Club name as printed. A street address is left blank."""
    text = plain_title(value)
    if not text or ad_home_address(text):
        return ''
    return text


def ad_skip_reason(name):
    text = plain_title(name)
    if not text:
        return 'missing name'
    if AD_NOT_SHOOT.search(text):
        return 'not a shoot'
    if AD_SHOOT.search(text):
        return ''
    non = AD_NON_EVENT.search(text)
    if not non:
        return ''
    label = non.group(0).lower()
    if 'coach' in label and re.search(r'\bno coaching\b', text, re.I):
        return ''
    if 'party' in label:
        return 'party'
    if 'coach' in label or 'development' in label or 'youth' in label:
        return 'coaching'
    if 'practice' in label or 'training' in label or 'traing' in label:
        return 'practice'
    return 'meeting'


def ad_members_only(name):
    return AD_MEMBERS.search(plain_title(name)) is not None


def ad_end_date(start, end):
    """CalendarFeed end is exclusive, the same way FullCalendar sends it."""
    try:
        start_d = dt.date.fromisoformat(start)
    except ValueError:
        return start
    try:
        end_d = dt.date.fromisoformat(end)
    except ValueError:
        return start
    if end_d <= start_d:
        return start
    return (end_d - dt.timedelta(days=1)).isoformat()


def ad_reg_url(raw, guid):
    text = (raw or '').strip()
    if not text or not guid:
        return ''
    if text.startswith('http://') or text.startswith('https://'):
        return text
    return 'https://www.archersdiary.com/' + text.lstrip('/')


def ad_event_url(guid):
    if not guid:
        return AD_PAGE
    return 'https://www.archersdiary.com/ViewResults.aspx?id=' + guid


def ad_display_name(name, club):
    name, club = plain_title(name), ad_public_place(club)
    if not club or club.lower() in name.lower() or ad_same_label(club, name):
        return name
    return f'{name} – {club}'


def ad_feed_url(rgb, start, end):
    query = {'start': start.isoformat(), 'end': end.isoformat()}
    if rgb:
        query['state'] = rgb
    return AD_FEED + '?' + urllib.parse.urlencode(query)


def ad_load_feed(url):
    status, ctype, body = fetch_bytes(url)
    if blocked(status, body):
        snippet = body[:240].decode('utf-8', 'replace').replace('\n', ' ')
        return 'blocked', status, str(ctype).split(';')[0], snippet, []
    if status != 200 or not body.lstrip().startswith(b'['):
        kind = str(ctype).split(';')[0]
        snippet = body[:160].decode('utf-8', 'replace').replace('\n', ' ')
        return 'bad', status, kind, snippet, []
    try:
        data = json.loads(body.decode('utf-8'))
    except json.JSONDecodeError:
        return 'bad', status, 'json', 'not json', []
    if not isinstance(data, list):
        return 'bad', status, 'json', 'not a list', []
    return 'ok', status, 'json', '', data


def ad_club_names():
    path = ROOT / 'data' / 'clubs.json'
    if not path.exists():
        return {}, {}
    clubs = json.loads(path.read_text(encoding='utf-8')).get('clubs') or []
    by_id = {}
    index, seen = {}, {}
    for club in clubs:
        by_id[club.get('id')] = club.get('name') or ''
        labels = [club.get('name') or '']
        aliases = club.get('aliases') or []
        if isinstance(aliases, list):
            labels.extend(a for a in aliases if isinstance(a, str))
        for label in labels:
            key = ' '.join(ad_club_tokens(label))
            if not key:
                continue
            if key in seen and seen[key] != club.get('id'):
                index.pop(key, None)
                continue
            seen[key] = club.get('id')
            index[key] = club.get('id')
    return by_id, index


def ad_club_same(feed_club, ev, by_id):
    fields = [ev.get('org') or '', ev.get('host') or '']
    named = by_id.get(ev.get('club_id') or '')
    if named:
        fields.append(named)
    # A street address shares words with unrelated clubs ("Pennant Hills", "Britannia Street").
    location = ev.get('location') or ''
    if location and not AD_STREET_WORD.search(location) and not ad_home_address(location):
        fields.append(location)
    return any(ad_same_label(feed_club, field) for field in fields if field)


def ad_same_qre(feed_name, event_name):
    if not re.search(r'\bqre\b', feed_name or '', re.I) or not re.search(r'\bqre\b', event_name or '', re.I):
        return False
    feed_l, event_l = (feed_name or '').lower(), (event_name or '').lower()
    return any(kind in feed_l and kind in event_l for kind in AD_QRE_KIND)


def ad_score(item, ev, by_id):
    try:
        start = dt.date.fromisoformat(ev.get('start_date') or '')
        end = dt.date.fromisoformat(ev.get('end_date') or ev.get('start_date') or '')
        mine = dt.date.fromisoformat(item['start'])
    except ValueError:
        return 0
    if end < start:
        end = start
    if ev.get('country_code') not in (None, '', 'AUS'):
        return 0
    inside = start <= mine <= end
    gap = 0 if inside else min(abs((mine - start).days), abs((mine - end).days))
    if gap > 3:
        return 0
    same = ad_club_same(item.get('club') or '', ev, by_id)
    ev_state = ev.get('state_code') or ev.get('state') or ''
    my_state = item.get('state') or ''
    if my_state and ev_state and my_state != ev_state and not same:
        return 0
    raw_name = item.get('raw_name') or item['title']
    mine_t, their_t = ad_tokens(raw_name), ad_tokens(ev.get('name') or '')
    overlap = jaccard(mine_t, their_t)
    distinctive = (mine_t & their_t) - AD_GENERIC
    # The club's own words don't count as agreement about which shoot it is.
    distinctive -= set(ad_club_tokens(item.get('club') or ''))
    long_shared = {w for w in distinctive if len(w) >= 5}
    holiday = AD_HOLIDAY.search(raw_name or '') and AD_HOLIDAY.search(ev.get('name') or '')
    states_ok = not (my_state and ev_state and my_state != ev_state)
    if gap > 1 and overlap < 0.62:
        return 0
    if gap == 1 and overlap < 0.5 and not (same and long_shared):
        return 0
    if overlap >= 0.5 and (same or states_ok):
        return overlap + (0.25 if same else 0) + (0.05 if gap == 0 else 0)
    if same and gap == 0 and (long_shared or len(distinctive) >= 2):
        return 0.55 + 0.05 * min(len(long_shared or distinctive), 4) + overlap
    if same and gap == 0 and ad_same_qre(raw_name, ev.get('name') or ''):
        return 0.62
    if same and gap == 0 and holiday:
        return 0.5 + overlap
    if states_ok and gap == 0 and len(long_shared) >= 2:
        return 0.55 + overlap
    return 0


def ad_match(item, events, by_id):
    best, best_score, second = None, 0, 0
    for ev in events:
        score = ad_score(item, ev, by_id)
        if score > best_score:
            second = best_score
            best, best_score = ev, score
        elif score > second:
            second = score
    if best and best_score >= 0.5 and best_score > second + 0.02:
        return best
    return None


def ad_apply(ev, item, day):
    """Stamp last_checked. Fill an empty registration link or start time. Flag members-only.
    Curated names, dates and locations stay as they are."""
    changed = []
    if (ev.get('last_checked') or '') != day:
        ev['last_checked'] = day
        changed.append('last_checked')
    if item['registration_url'] and not ev.get('registration_url'):
        ev['registration_url'] = item['registration_url']
        ev['registration_url_verified'] = False
        changed.append('registration_url')
    if item['times'] and not (ev.get('start_times') or '').strip():
        ev['start_times'] = item['times']
        changed.append('start_times')
    if item['members_only'] and not ev.get('members_only'):
        ev['members_only'] = True
        changed.append('members_only')
    return changed


def ad_new_id(item, taken):
    stem = re.sub(r'[^a-z0-9]+', '-', f"{item.get('club') or ''} {item['raw_name']}".lower()).strip('-')
    stem = stem[:52].strip('-') or 'shoot'
    base = f"ad-{stem}-{item['start']}-{item['feed_id']}"
    eid, n = base, 2
    while eid in taken:
        eid = f'{base}-{n}'
        n += 1
    return eid


def ad_new_event(item, taken, day):
    members = item['members_only']
    title = item['title']
    if members and re.search(r'club championship', title, re.I):
        level = 'Club Championship (members only)'
    elif members:
        level = 'Club (members only)'
    elif re.search(r'\bstate\b', title, re.I) and re.search(r'championship', title, re.I):
        level = 'State Championship'
    else:
        level = 'Tournament'
    return {
        'id': ad_new_id(item, taken),
        'name': title,
        'org_id': 'wa-aus',
        'org': item['org'] or "Archer's Diary",
        'country_code': 'AUS',
        'country': 'Australia',
        'state': item['state'] or None,
        'start_date': item['start'],
        'end_date': item['end'],
        'dates_confirmed': True,
        'location': item['location'] or None,
        'discipline': item['discipline'],
        'level': level,
        'rounds': None,
        'registration_url': item['registration_url'] or None,
        'registration_opens': None,
        'entry_close_date': None,
        'fee': None,
        'notes': None,
        'source_url': item['url'],
        'source_name': AD_SOURCE_NAME,
        'last_checked': day,
        'host': item['club'] or None,
        'category': 'club' if members else 'competition',
        'world_level': False,
        'registration_url_kind': None,
        'registration_url_verified': False,
        'org_status': 'no_details',
        'state_code': item['state'] or None,
        'org_group': 'aa',
        'club_id': item.get('club_id'),
        'members_only': True if members else None,
        'start_times': item['times'] or None,
    }


def ad_blank_stats():
    return {'read': 0, 'kept': 0, 'matched': 0, 'added': 0, 'updated': 0, 'skipped': {}}


def ad_bump(stats, state, key, reason=None):
    row = stats.setdefault(state or 'National', ad_blank_stats())
    if key == 'skipped':
        skipped = row['skipped']
        skipped[reason] = skipped.get(reason, 0) + 1
    else:
        row[key] += 1


def ad_parse_row(raw, state, today):
    name = plain_title(raw.get('name') or raw.get('description') or '')
    club = ad_public_place(raw.get('title') or '')
    start = str(raw.get('start') or '')[:10]
    if not re.fullmatch(r'\d{4}-\d\d-\d\d', start):
        return None, 'bad date'
    if start < today.isoformat():
        return None, 'past'
    reason = ad_skip_reason(name)
    if reason:
        return None, reason
    if ad_home_address(name):
        name = AD_HOME.sub('', name)
        name = plain_title(name)
        if not name:
            return None, 'home address'
    guid = str(raw.get('Guid') or '')
    return {
        'feed_id': raw.get('id'),
        'raw_name': name,
        'title': ad_display_name(name, club),
        'club': club,
        'org': club or "Archer's Diary",
        'start': start,
        'end': ad_end_date(start, str(raw.get('end') or '')[:10]),
        'times': plain_title(raw.get('prettyTime') or ''),
        'registration_url': ad_reg_url(raw.get('regURL') or '', guid),
        'url': ad_event_url(guid),
        'members_only': ad_members_only(name),
        'discipline': discipline_of(name),
        'state': state or '',
        'location': club or None,
    }, ''


def refresh_archers_diary(docs, stamp, day, dry_run):
    today = aus_today()
    horizon = today + dt.timedelta(days=560)
    by_id, club_index = ad_club_names()
    print(f'archers-diary: calendar feed {today.isoformat()} to {horizon.isoformat()} (end exclusive)', flush=True)
    mode, status, kind, snippet, rows = ad_load_feed(ad_feed_url('', today, horizon))
    print(f'archers-diary: all states JSON {status} {kind} rows {len(rows)}. {AD_FEED}', flush=True)
    if mode == 'blocked':
        print(f'archers-diary: blocked ({status}). Not retrying. Body starts: {snippet}', flush=True)
        return 0
    if mode != 'ok':
        print(f'archers-diary: feed unavailable ({status} {kind}). {snippet}', flush=True)
        return 0
    state_of, rgb_of = {}, {}
    blocked_rgb = []
    for rgb, state, assoc in AD_RGB:
        time.sleep(1)
        url = ad_feed_url(rgb, today, horizon)
        smode, sstatus, skind, ssnip, srows = ad_load_feed(url)
        print(f'archers-diary: {assoc} ({state}) JSON {sstatus} {skind} rows {len(srows)}', flush=True)
        if smode == 'blocked':
            blocked_rgb.append((assoc, sstatus, url, ssnip))
            print(f'archers-diary: {assoc} blocked ({sstatus}). Not retrying. Body starts: {ssnip}', flush=True)
            continue
        if smode != 'ok':
            print(f'archers-diary: {assoc} not used ({sstatus} {skind}). {ssnip}', flush=True)
            continue
        for raw in srows:
            state_of[raw.get('id')] = state
            rgb_of[raw.get('id')] = assoc
    if blocked_rgb and not rows:
        return 0
    events = docs['events'][0].get('events') or []
    previous = [ev for ev in events if ad_owns(ev) and (ev.get('end_date') or ev.get('start_date') or '') >= today.isoformat()]
    stats = {}
    kept = []
    seen = set()
    for raw in rows:
        fid = raw.get('id')
        if fid in seen:
            continue
        seen.add(fid)
        state = state_of.get(fid) or ''
        label = state or 'National'
        item, reason = ad_parse_row(raw, state, today)
        ad_bump(stats, label, 'read')
        if reason:
            ad_bump(stats, label, 'skipped', reason)
            continue
        key = ' '.join(ad_club_tokens(item['club']))
        item['club_id'] = club_index.get(key)
        kept.append(item)
        ad_bump(stats, label, 'kept')
    print(f'archers-diary: read {len(rows)}, kept {len(kept)}, skipped {len(rows) - len(kept)}, '
          f'{len(previous)} upcoming already listed', flush=True)
    for label in sorted(stats):
        row = stats[label]
        skipped = ', '.join(f'{k} {v}' for k, v in sorted(row['skipped'].items())) or 'none'
        print(f'archers-diary: {label} read {row["read"]} kept {row["kept"]} skipped {skipped}', flush=True)
    if not kept:
        guard(len(previous), 0, 'archers-diary')
    guard(len(previous), len(kept), 'archers-diary')
    # Match the diary against events already on the calendar. Rows added in this
    # run stay separate, so two sessions on the same day are not folded together.
    original = list(events)
    taken = {ev.get('id') for ev in events}
    added = updated = matched = 0
    fields = {}
    updated_ids = set()
    for item in kept:
        match = ad_match(item, original, by_id)
        label = item['state'] or 'National'
        if match:
            matched += 1
            ad_bump(stats, label, 'matched')
            changed = ad_apply(match, item, day)
            if changed and match.get('id') not in updated_ids:
                updated += 1
                updated_ids.add(match.get('id'))
                ad_bump(stats, label, 'updated')
                for name in changed:
                    fields[name] = fields.get(name, 0) + 1
        else:
            ev = ad_new_event(item, taken, day)
            events.append(ev)
            taken.add(ev['id'])
            added += 1
            ad_bump(stats, label, 'added')
    print(f'archers-diary: matched {matched}, added {added}, updated {updated}, fields {fields or {"none": 0}}', flush=True)
    for label in sorted(stats):
        row = stats[label]
        print(f'archers-diary: {label} matched {row["matched"]} added {row["added"]} updated {row["updated"]}', flush=True)
    if not dry_run:
        doc = docs['events'][0]
        doc['events'] = events
        if added:
            doc['count'] = len(events)
        summary = {}
        for label, row in stats.items():
            summary[label] = {k: row[k] for k in ('read', 'kept', 'matched', 'added', 'updated')}
            summary[label]['skipped'] = row['skipped']
        stamp_sources(doc, AD_SOURCE, stamp, len(kept), len(previous), {
            'added': added, 'updated': updated, 'matched': matched, 'via': 'calendar-feed', 'states': summary,
        })
    return len(kept)


def ad_owns(ev):
    if ev.get('source_name') == AD_SOURCE_NAME:
        return True
    return 'archersdiary.com' in str(ev.get('source_url') or '')


SOURCES = {'world-archery': world_archery, AD_SOURCE: refresh_archers_diary}
for _spec in STATE_FEEDS:
    SOURCES[_spec['id']] = _state_runner(_spec)


def self_test():
    ok = True

    def expect(name, fn):
        nonlocal ok
        try:
            fn()
            print('PASS', name)
        except SystemExit as e:
            print('FAIL', name, e)
            ok = False
        except AssertionError as e:
            print('FAIL', name, e)
            ok = False

    def boom_zero():
        guard(10, 0, 'world-archery')

    def boom_drop():
        guard(100, 69, 'world-archery')

    def ok_edge():
        guard(100, 70, 'world-archery')

    def ok_same():
        guard(466, 466, 'world-archery')

    expect('0 events fails', lambda: (_ for _ in ()).throw(SystemExit('skip')) if False else _raises(boom_zero))
    expect('31% drop fails', lambda: _raises(boom_drop))
    expect('30% drop is allowed', ok_edge)
    expect('same count is allowed', ok_same)
    march = dt.date(2026, 3, 15)
    assert in_season(dt.date(2026, 11, 16), []) is True
    assert in_season(march, []) is False
    soon = [{'id': 'wa-1', 'start_date': '2026-03-20', 'end_date': '2026-03-22'}]
    assert in_season(march, soon) is True
    later = [{'id': 'wa-1', 'start_date': '2026-06-01', 'end_date': '2026-06-02'}]
    assert in_season(march, later) is False
    print('PASS season window')
    ev = {'id': 'x', 'name': 'Curated name', 'start_date': '2026-06-20', 'end_date': '2026-06-20', 'status': 'scheduled'}
    fields = apply_comp(ev, {'DFrom': '2025-06-28', 'DTo': '2026-06-28', 'Name': 'Short name', 'IsCancelled': True}, '2026-11-16')
    assert ev['start_date'] == '2026-06-20' and ev['name'] == 'Curated name' and ev['status'] == 'scheduled'
    assert ev['last_checked'] == '2026-11-16' and fields == ['last_checked']
    print('PASS check stamps last_checked and leaves curated name and dates')
    spec = STATE_FEEDS[0]
    item = {'title': 'Southern Vales The Bulls Tournament', 'start': '2026-12-19', 'end': '2026-12-19',
            'url': 'https://archerysa.org.au/event/southern-vales-archery-club-the-bulls-t/',
            'location': 'Southern Vales', 'registration_url': 'https://example.com/enter', 'times': '9:00 am start',
            'members_only': False, 'modified': '2026-11-01', 'state': 'SA', 'tribe_id': 9, 'org': 'Archery SA',
            'dates_confirmed': True, 'discipline': 'Target', 'source_name': spec['source_name'], 'host': spec['host']}
    existing = {'id': 'old', 'name': 'Southern Vales The Bulls Tournament 2026', 'start_date': '2026-12-19',
                'end_date': '2026-12-19', 'state_code': 'SA', 'country_code': 'AUS', 'source_url': item['url'],
                'location': 'Southern Vales Archery Club', 'registration_url': None, 'start_times': 'Sign-in 8:00 am',
                'last_checked': '2026-10-09', 'notes': 'Hand note'}
    assert match_existing(item, [existing]) is existing
    changed = apply_item(existing, item, '2026-11-16')
    assert existing['registration_url'] == 'https://example.com/enter'
    assert existing['start_times'] == 'Sign-in 8:00 am' and existing['notes'] == 'Hand note'
    assert 'registration_url' in changed and existing['name'].endswith('2026')
    later = dict(existing, id='next-year', start_date='2027-12-19', source_url='https://example.com/other')
    assert match_existing(dict(item, url=''), [later]) is None
    champ = dict(item, title='Gosnells Club Championship', url='', members_only=True, start='2027-01-02', tribe_id=3)
    made = new_event(spec, champ, set())
    assert made['members_only'] is True and made['category'] == 'club'
    assert keep_tribe({'title': 'Public Holiday 2027', 'categories': [{'name': 'Community'}, {'name': 'Home'}]}) is False
    assert keep_tribe({'title': 'State Field Championships', 'categories': [{'name': 'Tournament'}, {'name': 'Home'}]}) is True
    assert keep_tribe({'title': 'QRE in SA (2025 & 2026)', 'categories': [{'name': 'QRE'}, {'name': 'Home'}]}) is False
    assert keep_tribe({'title': '2028 Olympic Games, Los Angeles', 'categories': [{'name': 'Tournament'}], 'venue': {'country': 'United States', 'city': 'Los Angeles'}}) is False
    ical = ('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:State Field\\, 2027\n'
            'DTSTART;VALUE=DATE:20270321\nDTEND;VALUE=DATE:20270322\nURL:https://archerysa.org.au/event/x/\n'
            'END:VEVENT\nEND:VCALENDAR\n').encode()
    parsed = parse_ical(ical, spec)
    assert parsed and parsed[0]['start'] == '2027-03-21' and parsed[0]['end'] == '2027-03-21' and parsed[0]['title'] == 'State Field, 2027'
    moved = {'start_date': '2026-12-19', 'end_date': '2026-12-19', 'last_checked': '2026-10-01'}
    assert apply_item_dates(moved, {'start': '2026-12-20', 'end': '2026-12-20', 'modified': '2026-11-02'}, '2026-10-01') == ['start_date', 'end_date']
    assert moved['start_date'] == '2026-12-20'
    assert apply_item_dates({'start_date': '2026-12-19', 'end_date': '2026-12-19'}, {'start': '2025-01-01', 'end': '2025-01-01', 'modified': '2026-11-02'}, '2026-10-01') == []
    print('PASS state feed matches, keeps curated fields, flags club championships')
    assert ad_end_date('2026-11-01', '2026-11-02') == '2026-11-01'
    assert ad_end_date('2026-11-02', '2026-11-09') == '2026-11-08'
    assert ad_skip_reason('Tuesday Practice') == 'practice'
    assert ad_skip_reason('720 rounds, 8:30am practice - 9am start') == ''
    assert ad_skip_reason('LA *No Archery* - Kapunda Rodeo Clean Up') == 'not a shoot'
    assert ad_skip_reason('** NO SAT AM AJAD\'s - School Holidays') == 'not a shoot'
    assert ad_skip_reason('SOPA Junior Coaching') == 'coaching'
    assert ad_skip_reason('SOPA Christmas Party') == 'party'
    assert ad_skip_reason('Youth Development Program') == 'coaching'
    assert ad_skip_reason('Test Event') == 'not a shoot'
    assert ad_skip_reason('Christmas Fun Shoot') == ''
    assert ad_skip_reason('TTA Competition 900 - No Coaching') == ''
    assert ad_members_only('Sunday 06 Club Championships') is True
    assert ad_members_only("GAC Members ONLY Over 55's Afternoon Indoor") is True
    assert ad_members_only('Tasmanian State Target Championships') is False
    assert ad_skip_reason('HL Outdoors Tournament Diary open shoot') == ''
    assert ad_public_place('12 Smith Street') == ''
    assert ad_public_place('Penrith City Archers') == 'Penrith City Archers'
    champs = {'id': 'ad-waverley-club-champs-6-2026-11-21', 'name': 'Waverley City Archers Club Championship #6 2026',
              'start_date': '2026-11-21', 'end_date': '2026-11-21', 'state_code': 'VIC', 'country_code': 'AUS',
              'org': 'Waverley City Archers', 'registration_url': None, 'start_times': 'Sign-in 8:00 am',
              'last_checked': '2026-10-09', 'notes': 'Hand note', 'members_only': None}
    feed_champs = {'title': 'Club Championship #6 (Grange, Melbourne etc)', 'raw_name': 'Club Championship #6 (Grange, Melbourne etc)',
                   'club': 'Waverley City Archers', 'start': '2026-11-21', 'state': 'VIC',
                   'registration_url': 'https://www.archersdiary.com/EventEnrol.aspx?id=abc', 'times': 'Practice starts at 8:00 AM',
                   'members_only': True}
    assert ad_match(feed_champs, [champs], {'x': 'Waverley City Archers'}) is champs
    changed = ad_apply(champs, feed_champs, '2026-11-16')
    assert champs['name'].endswith('2026') and champs['start_date'] == '2026-11-21' and champs['notes'] == 'Hand note'
    assert champs['start_times'] == 'Sign-in 8:00 am' and champs['registration_url'].endswith('id=abc')
    assert champs['members_only'] is True and 'members_only' in changed and 'start_times' not in changed
    novelty = {'id': 'ad-aac', 'name': 'Adelaide Archery Club Annual Novelty Shoot 2026', 'start_date': '2026-12-05',
               'end_date': '2026-12-05', 'state_code': 'SA', 'country_code': 'AUS', 'org': 'Adelaide Archery Club'}
    club_shoot = {'title': 'AAC Club Shoot Sat PM', 'raw_name': 'AAC Club Shoot Sat PM', 'club': 'Adelaide Archery Club',
                  'start': '2026-12-05', 'state': 'SA'}
    assert ad_match(club_shoot, [novelty], {}) is None
    xmas = {'id': 'ad-x', 'name': 'Warringah Archers Christmas Fun Shoot 2026', 'start_date': '2026-12-20',
            'end_date': '2026-12-20', 'state_code': 'NSW', 'country_code': 'AUS', 'org': 'Warringah Archers'}
    feed_xmas = {'title': 'XMAS Fun Shoot (AM)', 'raw_name': 'XMAS Fun Shoot (AM)', 'club': 'Warringah Archers Inc',
                 'start': '2026-12-20', 'state': 'NSW'}
    assert ad_match(feed_xmas, [xmas], {}) is xmas
    other_round = {'title': 'Canberra Rounds (PM)', 'raw_name': 'Canberra Rounds (PM)', 'club': 'Warringah Archers Inc',
                   'start': '2026-12-20', 'state': 'NSW'}
    assert ad_match(other_round, [xmas], {}) is None
    cressy = {'id': 'ad-cressy', 'name': 'Cressy Archers Club Championships 2026', 'start_date': '2026-12-06',
              'end_date': '2026-12-06', 'state_code': 'SA', 'country_code': 'AUS', 'org': 'Cressy Archers'}
    feed_cressy = {'title': 'Sunday 06 Club Championships', 'raw_name': 'Sunday 06 Club Championships',
                   'club': 'Cressy Archers Inc.', 'start': '2026-12-06', 'state': 'TAS', 'members_only': True,
                   'registration_url': '', 'times': ''}
    assert ad_match(feed_cressy, [cressy], {}) is cressy
    northern = {'id': 'funnel', 'name': 'The Northern Archers FunnelWeb Field & 3D Tournament', 'start_date': '2026-11-22',
                'end_date': '2026-11-22', 'state_code': 'NSW', 'country_code': 'AUS', 'org': 'Northern Archers of Sydney',
                'location': 'Northern Archers of Sydney, Britannia Street, Pennant Hills NSW 2120'}
    hills = {'title': 'Hills Archers Club Shoot', 'raw_name': 'Hills Archers Club Shoot', 'club': 'Hills Archers',
             'start': '2026-11-22', 'state': 'SA'}
    assert ad_match(hills, [northern], {}) is None
    qre = {'id': 'tcag-qre', 'name': 'TCAG Double 720 QRE – Twin City Archers Gippsland', 'start_date': '2026-11-21',
           'end_date': '2026-11-21', 'state_code': 'VIC', 'country_code': 'AUS', 'org': 'Twin City Archers Gippsland'}
    other = {'title': 'TCAG November Club Event 3', 'raw_name': 'TCAG November Club Event 3', 'club': 'Twin City Archers Gippsland',
             'start': '2026-11-21', 'state': 'VIC'}
    assert ad_match(other, [qre], {}) is None
    awa = {'id': 'awa-qre', 'name': 'QRE Field – Archery Park Whiteman', 'start_date': '2026-11-21', 'end_date': '2026-11-21',
           'state_code': 'WA', 'country_code': 'AUS', 'org': 'Archery WA',
           'location': 'Archery Park Whiteman, 111A Jules Steiner Memorial Dr, Whiteman WA'}
    awa_feed = {'title': 'AWA Field QRE - Nov', 'raw_name': 'AWA Field QRE - Nov', 'club': 'Archery WA',
                'start': '2026-11-21', 'state': 'WA'}
    assert ad_match(awa_feed, [awa], {}) is awa
    made = ad_new_event({'feed_id': 9, 'raw_name': 'Safari Club Shoot', 'title': 'Safari Club Shoot – Penrith City Archers',
                         'club': 'Penrith City Archers', 'org': 'Penrith City Archers', 'start': '2026-11-21', 'end': '2026-11-21',
                         'times': 'Practice starts at 8:00 AM', 'registration_url': '', 'url': 'https://www.archersdiary.com/ViewResults.aspx?id=g',
                         'members_only': False, 'discipline': 'Target', 'state': 'NSW', 'location': 'Penrith City Archers',
                         'club_id': None}, set(), '2026-11-16')
    assert made['id'].startswith('ad-') and made['members_only'] is None and made['state_code'] == 'NSW'
    assert 'Smith Street' not in json.dumps(made)
    print('PASS archers diary feed keeps public shoots, matches curated rows, flags club championships')
    if not ok:
        raise SystemExit(1)
    print('self-test ok')


def _raises(fn):
    try:
        fn()
    except SystemExit:
        return
    raise AssertionError('expected SystemExit')


def main(argv=None):
    p = argparse.ArgumentParser(description='Refresh public event JSON from organiser sources.')
    p.add_argument('--source', action='append', default=[], help='source id to refresh (repeatable). Default: every implemented source.')
    p.add_argument('--if-in-season', action='store_true', help='for world-archery, do nothing outside the season')
    p.add_argument('--dry-run', action='store_true', help='fetch and report, do not write')
    p.add_argument('--self-test', action='store_true', help='check the drop guard and season window, no network')
    args = p.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    wanted = args.source or list(SOURCES)
    unknown = [s for s in wanted if s not in SOURCES]
    if unknown:
        raise SystemExit('unknown source: ' + ', '.join(unknown) + '. known: ' + ', '.join(SOURCES))
    for line in NOT_FETCHED:
        print(line, flush=True)
    docs = {}
    for key, path in DATA.items():
        doc, sep, nl = load_file(path)
        docs[key] = [doc, sep, nl]
    all_events = [ev for doc, _, _ in docs.values() for ev in (doc.get('events') or [])]
    if args.if_in_season and wanted == ['world-archery'] and not in_season(dt.datetime.now(dt.timezone.utc).date(), all_events):
        print('world-archery: outside the season, not fetching', flush=True)
        return 0
    stamp, day = now_stamp()
    # Mutable docs for the fetcher: list so it can replace nothing; dicts are in place.
    live = {k: (docs[k][0], docs[k][1], docs[k][2]) for k in docs}
    for source in wanted:
        SOURCES[source](live, stamp, day, args.dry_run)
    if args.dry_run:
        print('dry-run: no files written', flush=True)
        return 0
    for key, path in DATA.items():
        doc, sep, nl = docs[key]
        dump_file(path, doc, sep, nl)
        print(f'wrote {path.relative_to(ROOT)} generated={doc.get("generated")}', flush=True)
    return 0


if __name__ == '__main__':
    main()
