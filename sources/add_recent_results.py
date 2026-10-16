#!/usr/bin/env python3
"""Adds official ianseo results for recently finished calendar events missing from data/results.json.
Run split_results.py afterwards. Only published official results, each with its source link."""
import json, datetime, os
src = open(os.path.join(os.path.dirname(__file__), 'build_results.py')).read().split('NF = ')[0]
ns = {}; exec(src, ns); ianseo = ns['ianseo']
TODAY = datetime.date.today().isoformat()
D = json.load(open('data/results.json')); R = D['results']
# wa-31958: Slovak Field & 3D Championships (Spišské Vlachy, 26-27 Sep 2026) -> ianseo 30287 individual results
r = ianseo('https://www.ianseo.net/TourData/2026/30287/IC.php', 'Výsledkové listiny – Jednotlivci (individual results by class & division)')
r['note'] = 'Official ianseo results, Majstrovstvá Slovenska v terénnej lukostreľbe 2026 (Spišské Vlachy, 27 Sep 2026).'
if r['groups']: R['wa-31958'] = r
# naam-grand-final-2026: runs 15-18 Oct 2026; ianseo page carries qualification + brackets as published
R['naam-grand-final-2026'] = {'kind': 'link', 'title': 'Official results (qualification & brackets, event runs 15–18 Oct)', 'source_name': 'ianseo (NAAM)', 'source_url': 'https://www.ianseo.net/Details.php?toId=30561'}
for k in ('wa-31958', 'naam-grand-final-2026'):
    if k in R: R[k]['checked'] = TODAY
json.dump(D, open('data/results.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print({k: R[k]['kind'] for k in ('wa-31958', 'naam-grand-final-2026') if k in R}, len(R['wa-31958'].get('groups', [])) if 'wa-31958' in R else 0)
