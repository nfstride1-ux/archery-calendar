#!/usr/bin/env python3
"""Refresh the public event JSON that GitHub Pages serves.

    python3 tools/build_public.py
    python3 tools/build_public.py --source world-archery
    python3 tools/build_public.py --source world-archery --if-in-season
    python3 tools/build_public.py --self-test

Implemented source: world-archery (public World Archery competitions API, no API key).

Archery GB and Archery NZ block automated clients. This script does not try to get
around that, and it does not invent events for the Australian calendars that have
no fetcher in this repository. A source that is actually fetched fails the run
(exit 1, files left untouched) when it returns 0 events or when the number
returned drops by more than 30% against the events already in the JSON.

`generated` is a UTC timestamp. Each fetched source records `last_checked` on the
file and, as a date, on the events that source confirmed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

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
    'Australian state, ABA and club calendars have no fetcher in this repository, so they are not marked checked from here.',
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
    """Fail when a fetch is empty or drops by more than 30% versus the file."""
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


def stamp_sources(doc, source, stamp, count, previous):
    sources = doc.get('sources')
    if not isinstance(sources, dict):
        sources = {}
        # Keep generated first, then sources, then the rest.
        rest = {k: v for k, v in doc.items() if k != 'generated'}
        doc.clear()
        if 'generated' in rest or True:
            pass
        doc['generated'] = stamp
        doc['sources'] = sources
        for k, v in rest.items():
            if k != 'sources':
                doc[k] = v
    doc['generated'] = stamp
    sources[source] = {'last_checked': stamp, 'count': count, 'previous': previous}
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


SOURCES = {'world-archery': world_archery}


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
