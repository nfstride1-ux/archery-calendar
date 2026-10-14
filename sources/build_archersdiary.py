#!/usr/bin/env python3
"""Merges Archer's Diary results into data/results.json.
- Saved page text (/workspace/archersdiary/*.txt) -> full score tables (only fields the page shows).
- /workspace/archersdiary_results_urls.csv -> 'Results' links for matching past WA calendar events."""
import json, csv, re, glob, os, datetime
CSV = '/workspace/archersdiary_results_urls.csv'; TXT = '/workspace/archersdiary'
TODAY = datetime.date.today().isoformat()
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
rows = [r for r in csv.DictReader(open(CSV)) if r['date'] < TODAY]
def parse(path):
    t = open(path, encoding='utf-8', errors='ignore').read()
    groups = []
    for blk in re.split(r'\n(?=[^\n\t]+ - \d{2}/\d{2}/\d{4}\n)', t):
        m = re.match(r'([^\n\t]+) - (\d{2}/\d{2}/\d{4})\n', blk.strip() + '\n')
        if not m or 'Archer\tGender' not in blk: continue
        lines = blk.split('\n'); hi = next(i for i, l in enumerate(lines) if l.startswith('Archer\tGender'))
        hdr = lines[hi].split('\t'); ti = hdr.index('Total')
        out = []
        for l in lines[hi + 1:]:
            c = l.split('\t')
            if len(c) < len(hdr) - 1 or l.startswith('NOTES'): break
            try: tot = int(c[ti])
            except ValueError: continue
            if tot <= 0: continue
            out.append({'name': c[0].strip(), 'club': c[2].strip(), 'division': f'{c[3].strip()} {c[4].strip()}'.strip(), 'score': str(tot)})
        if out:
            out.sort(key=lambda w: -int(w['score']))
            groups.append({'division': m.group(1).split(', ')[-1].strip() if ', ' in m.group(1) else m.group(1).strip(), 'rows': out})
    return groups
def parse_placed(path):
    lines = open(path, encoding='utf-8', errors='ignore').read().split('\n'); groups = []; cur = None
    for l in lines:
        c = l.split('\t')
        if len(c) >= 5 and re.match(r'^\d+(st|nd|rd|th)$', c[0]):
            try: tot = int(c[4])
            except ValueError: continue
            if tot > 0 and cur is not None: cur['rows'].append({'place': re.sub(r'\D', '', c[0]), 'name': c[1].strip(), 'club': c[2].strip(), 'round': c[3].strip(), 'score': str(tot)})
        elif l.strip() and '\t' not in l and not re.match(r'^(NOTES|Click|Scores shown|DOS|Judge|Level|\d\d/\d\d/\d{4})', l):
            cur = {'division': l.strip(), 'rows': []}; groups.append(cur)
    return [g for g in groups if g['rows']]
def csvrow(fn):
    b = os.path.basename(fn)[:-4]
    for r in rows:
        p = f"{slug(r['club'])}-{r['date']}-{slug(r['event_name'])}"
        if p[:len(b)] == b or b.startswith(p[:60]): return r
D = json.load(open('data/results.json')); R = D['results']; SH = {}
EV = {x['id']: x for x in json.load(open('data/events.json'))['events']}
ATT = {'gosnells-club-champs-2026-target-1': 'Gosnells Archers Inc|2026-10-10', 'wa-31716': 'Kalamunda Governor Stirling Archers|2026-10-11|STATE TARGET'}
full = 0
for fn in sorted(glob.glob(TXT + '/*.txt')):
    r = csvrow(fn); g = parse(fn) or parse_placed(fn)
    if not r or not g: print('skip', fn, bool(r), len(g)); continue
    ent = {'kind': 'full', 'title': r['event_name'].strip(), 'club_name': r['club'], 'date': r['date'], 'source_name': "Archer's Diary", 'source_url': r['results_url'], 'groups': g, 'checked': TODAY,
           'note': 'Placings and scores as published on Archer\'s Diary.' if any(w.get('place') for x in g for w in x['rows']) else 'Scores as published on Archer\'s Diary, highest first in each round (no placings are listed for club shoots).'}
    eid = next((k for k, v in ATT.items() if v.split('|')[0] == r['club'] and v.split('|')[1] == r['date'] and (len(v.split('|')) < 3 or v.split('|')[2] in r['event_name'].upper())), None)
    if eid: R[eid] = ent; ent['event_id'] = eid
    SH.setdefault(r['date'], []).append(ent); full += 1
# links for other matched past WA events
G = set('the of and a 2026 26 club shoot shoots arrows arrow saturday sunday round rounds or new start time am pm wa awa archers archery inc bowmen'.split())
W = lambda s: set(w for w in re.findall(r'[a-z0-9]+', s.lower()) if w not in G and len(w) > 2)
cn = lambda s: re.sub(r'\b(inc|club|archery|archers|bowmen|the|of)\b', '', s.lower()).strip()
CL = {c['id']: c['name'] for c in json.load(open('data/clubs.json'))['clubs']}
links = 0
for x in EV.values():
    if (x.get('state_code') or x.get('state')) != 'WA' or not x.get('start_date') or x['id'] in R: continue
    d0, d1 = x['start_date'], x.get('end_date') or x['start_date']
    if d1 >= TODAY: continue
    ec = CL.get(x.get('club_id')) or ('Archery WA' if x['id'].startswith(('awa', 'wa-')) else '')
    best = None
    for r in rows:
        if not d0 <= r['date'] <= d1: continue
        cm = bool(ec) and cn(ec)[:8] == cn(r['club'])[:8]; ov = W(x['name']) & W(r['event_name'])
        if (cm and ov) or len(ov) >= 2:
            sc = 2 * cm + len(ov)
            if not best or sc > best[0]: best = (sc, r)
    if best:
        r = best[1]; R[x['id']] = {'kind': 'link', 'title': r['event_name'].strip(), 'source_name': "Archer's Diary", 'source_url': r['results_url'], 'checked': TODAY}; links += 1
D['club_shoots'] = SH
json.dump(D, open('data/results.json', 'w'), indent=1, ensure_ascii=False)
print('full', full, 'links', links, {k: len(v) for k, v in SH.items()})
