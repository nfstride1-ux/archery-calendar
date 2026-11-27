#!/usr/bin/env python3
"""The seven Lingkana League nights are public listings with live ScoreTool links."""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
fail = 0

def chk(name, cond, info=''):
    global fail
    if cond:
        return
    fail += 1
    print('FAIL', name, info)

doc = json.load(open(os.path.join(ROOT, 'data/events.json'), encoding='utf-8'))
events = doc['events']
want = [
    ('lk-night-1-2026-11-18', '2026-11-18', 1, False),
    ('lk-night-2-2026-12-02', '2026-12-02', 2, False),
    ('lk-night-3-2026-12-16', '2026-12-16', 3, False),
    ('lk-night-4-2026-12-30', '2026-12-30', 4, False),
    ('lk-night-5-2027-01-13', '2027-01-13', 5, False),
    ('lk-night-6-2027-01-27', '2027-01-27', 6, False),
    ('lk-night-7-2027-02-10', '2027-02-10', 7, True),
]
byid = {e['id']: e for e in events}
for eid, date, night, shootup in want:
    x = byid.get(eid)
    chk(eid + ' exists', bool(x))
    if not x:
        continue
    chk(eid + ' public', not x.get('_ownerOnly') and not x.get('members_only'))
    chk(eid + ' date', x.get('start_date') == date == x.get('end_date'))
    chk(eid + ' night', x.get('night') == night)
    chk(eid + ' location', 'Lingkana Archery range' in (x.get('location') or '') and 'Belmont' in (x.get('location') or ''))
    chk(eid + ' wa', x.get('state_code') == 'WA' and x.get('country_code') == 'AUS')
    if shootup:
        chk(eid + ' shoot-up results', (x.get('results_url') or '').endswith('#lk-home'))
    else:
        chk(eid + ' results hash', (x.get('results_url') or '').endswith('#lk-results&n=' + str(night)))
    chk(eid + ' has scoretool link', 'scoretool-demo' in (x.get('results_url') or ''))
    page = os.path.join(ROOT, 'events', eid, 'index.html')
    chk(eid + ' page', os.path.isfile(page))
    if os.path.isfile(page):
        html = open(page, encoding='utf-8').read()
        chk(eid + ' page scores button', 'Scores and ladder' in html and 'scoretool-demo' in html)

blob = json.dumps([byid[e] for e, *_ in want if e in byid]) + ''.join(
    open(os.path.join(ROOT, 'events', e, 'index.html'), encoding='utf-8').read()
    for e, *_ in want if os.path.isfile(os.path.join(ROOT, 'events', e, 'index.html'))
)
low = blob.lower()
personal = 'nfstride1' + '@' + 'gmail.com'
hold = 'nfs' + 'hold' + '@' + 'gmail.com'
chk('no personal gmail', personal not in low and hold not in low)
chk('no invite code', 'lk-onion' not in low)
chk('no passcode word', 'kana26' not in low and 'passcode' not in low)
chk('no home street', 'calooli' not in low)
chk('privatecal stays out', not os.path.isfile(os.path.join(ROOT, 'privatecal.js')))
app = open(os.path.join(ROOT, 'app.js'), encoding='utf-8').read()
chk('app shows live scores box', 'function lkScoresBox' in app and 'Scores and ladder' in app)
sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
chk('unique cache', "const C='archcal-newsdrop1128b'" in sw)
idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
chk('index cache tags', 'app.js?v=newsdrop1128b' in idx and 'styles.css?v=newsdrop1128b' in idx)
site = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
for eid, *_ in want:
    chk('sitemap ' + eid, f'/events/{eid}/' in site)

print('lingkana_public_test:', 'all passed' if not fail else f'{fail} failed')
sys.exit(1 if fail else 0)
