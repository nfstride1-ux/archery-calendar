#!/usr/bin/env python3
"""Archery Calendar: 'Add my score' windows (shoot start date 00:00 local -> end of the day after the last day, local).
Local time zone: intl events' tz, Australian state zone, else Australia/Perth.
  python3 scripts/score_windows.py sql    -> prints the seed INSERT (used to build supabase/self_scores.sql)
  python3 scripts/score_windows.py push   -> upserts every window via rpc bot_set_score_windows (needs ARCHCAL_BOT_TOKEN)"""
import json, os, sys, urllib.request, datetime as dt
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_TZ = {'WA': 'Australia/Perth', 'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney', 'VIC': 'Australia/Melbourne', 'TAS': 'Australia/Hobart',
            'QLD': 'Australia/Brisbane', 'SA': 'Australia/Adelaide', 'NT': 'Australia/Darwin'}
def windows():
    out, seen = [], set()
    for f in ('events.json', 'intl.json'):
        for x in json.load(open(os.path.join(ROOT, 'data', f)))['events']:
            s = x.get('start_date'); e = x.get('end_date') or s
            # One window per event id: an event cross-listed in both files (e.g. wa-31555) keeps the events.json copy.
            # A duplicate id in one upsert makes Postgres reject the whole push ('cannot affect row a second time').
            if not s or x['id'] in seen: continue
            seen.add(x['id'])
            tz = x.get('tz') or STATE_TZ.get(x.get('state_code') or x.get('state') or '') or 'Australia/Perth'
            try: z = ZoneInfo(tz)
            except Exception: tz, z = 'Australia/Perth', ZoneInfo('Australia/Perth')
            o = dt.datetime.fromisoformat(s).replace(tzinfo=z)
            c = (dt.datetime.fromisoformat(e) + dt.timedelta(days=2)).replace(tzinfo=z)
            out.append({'event_id': x['id'], 'opens_at': o.isoformat(), 'closes_at': c.isoformat(), 'tz': tz})
    return out
if __name__ == '__main__':
    W = windows()
    if sys.argv[1:] == ['sql']:
        q = lambda v: "'" + v.replace("'", "''") + "'"
        print('insert into public.score_windows (event_id, opens_at, closes_at, tz) values')
        print(',\n'.join(f"  ({q(w['event_id'])}, {q(w['opens_at'])}, {q(w['closes_at'])}, {q(w['tz'])})" for w in W))
        print('on conflict (event_id) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, tz = excluded.tz;')
    elif sys.argv[1:] == ['push']:
        cfg = open(os.path.join(ROOT, 'config.js')).read(); import re
        url = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1); key = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
        req = urllib.request.Request(url + '/rest/v1/rpc/bot_set_score_windows', data=json.dumps({'p_token': os.environ['ARCHCAL_BOT_TOKEN'], 'p_rows': W}).encode(),
                                     headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
        print(urllib.request.urlopen(req).read().decode())
    else: print(__doc__)
