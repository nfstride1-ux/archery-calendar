#!/usr/bin/env python3
"""Build data/club_coords.json: coordinates for clubs and event venues, ONLY from real addresses / place names already in
data/clubs.json, data/events.json and data/intl.json. Geocoded with OpenStreetMap Nominatim (1 request per second, identifying
User-Agent), cached in data/.nominatim_cache.json so re-runs only ask for new strings. Anything without a reliable place is
written as null (never guessed). Usage: python3 scripts/build_club_coords.py"""
import json, re, time, sys, os, urllib.request, urllib.parse, collections, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda f: os.path.join(ROOT, 'data', f)
UA = 'ArcheryCalendar-geocoder/1.0 (https://archerycalendars.com; contact nfshold@gmail.com)'
CACHE_F = D('.nominatim_cache.json')
cache = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
last = [0.0]
STATE_NAME = {'WA': 'Western Australia', 'SA': 'South Australia', 'VIC': 'Victoria', 'NSW': 'New South Wales', 'ACT': 'Australian Capital Territory',
              'QLD': 'Queensland', 'TAS': 'Tasmania', 'NT': 'Northern Territory'}
STREET = re.compile(r'\b(\d+[a-z]?\s+\w+|(road|rd|street|st|avenue|ave|drive|dr|lane|ln|way|highway|hwy|parade|pde|court|ct|place|pl|crescent|cres|boulevard|blvd|track|trail|park|oval|reserve|school|college|hall|showground|showgrounds|complex|centre|center|club|range|ground|grounds|field|fields|gym|stadium|arena|lot \d+))\b', re.I)
BAD = re.compile(r'\b(tba|tbc|online|virtual|your own club|own club|various|to be announced|multiple|postal|home range)\b', re.I)

def nominatim(q, cc):
    key = cc + '|' + q
    if key in cache: return cache[key]
    wait = 1.1 - (time.time() - last[0])
    if wait > 0: time.sleep(wait)
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'jsonv2', 'limit': 1, 'addressdetails': 1, 'countrycodes': cc.lower()})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
    for attempt in range(3):
        try:
            last[0] = time.time()
            r = json.load(urllib.request.urlopen(req, timeout=30)); break
        except Exception as e:
            print('  retry', e, file=sys.stderr); time.sleep(5 * (attempt + 1)); r = None
    if r is None: return None   # network failure: do not cache
    res = r[0] if r else None
    out = None
    if res:
        a = res.get('address', {})
        out = {'lat': round(float(res['lat']), 5), 'lng': round(float(res['lon']), 5), 'cls': res.get('category'), 'type': res.get('type'), 'state': a.get('state'), 'cc': (a.get('country_code') or '').upper(), 'name': res.get('display_name', '')[:140]}
    cache[key] = out
    json.dump(cache, open(CACHE_F, 'w'))
    return out

VENUE_TYPES = {'amenity', 'leisure', 'building', 'highway', 'shop', 'tourism', 'office', 'sport', 'club', 'man_made', 'landuse', 'railway'}
def precision(r, lvl=0):
    """'v' = a specific venue / street, 't' = only a suburb, town or city."""
    if lvl >= 1.5: return 't'
    if r['cls'] in ('place', 'boundary') and r['type'] not in ('house', 'building', 'farm', 'isolated_dwelling'):
        return 't'
    return 'v'

def clean_parts(loc, names, state):
    s = re.sub(r'\([^)]*\)', ' ', loc)
    parts = [p.strip() for p in re.split(r',| – | - ', s) if p.strip()]
    keep = []; named = False
    for p in parts:
        pl = p.lower()
        if any(n and (pl == n or pl.startswith(n) or n in pl) for n in names): named = True; continue   # the club's own name is not an address
        keep.append(p)
    clean_parts.named = named
    return keep

def strip_state(p, state):
    p = re.sub(r'\b(%s)\b' % '|'.join(list(STATE_NAME) + ['Australia']), '', p).strip(' ,')
    return p
def only_generic(p, state):
    q = strip_state(p, state)
    q = re.sub(r'\b\d{4}\b', '', q).strip(' ,')
    return not q or q.lower() in {n.lower() for n in STATE_NAME.values()} or q.lower() in ('north queensland', 'south australia', 'tasmania')

BIG_CITIES = {'melbourne', 'sydney', 'brisbane'}

def au_candidates(locs, names, state, trusted=()):
    """Query ladder from most to least specific; each is (query, level). Lone state/club-name-only strings give no candidates."""
    cands = []
    for loc in locs:
        if BAD.search(loc): continue
        rest = clean_parts(loc, names, state)
        rest = [r for r in rest if not only_generic(r, state)]
        if not rest: continue
        full = ', '.join(rest)
        has_street = bool(re.search(r'\d', full)) or bool(re.search(r'\b(road|rd|street|st|avenue|ave|drive|dr|lane|way|highway|parade|court|place|crescent|track)\b', full, re.I))
        # a bare town in an event's location (e.g. just "Brisbane") says where that event was, not where the club is: only trusted for the club's own address / suburb fields
        if names and not clean_parts.named and not has_street and loc not in trusted: continue
        lvl = 0 if has_street else (1 if STREET.search(full) else 2)
        cands.append((full + ', ' + STATE_NAME.get(state, '') + ', Australia', lvl))
        # town-only fallback: last part with the state stripped
        t = re.sub(r'\b\d{4}\b', '', strip_state(rest[-1], state)).strip(' ,')
        if t and not re.search(r'\d', t): cands.append((t + ', ' + STATE_NAME.get(state, '') + ', Australia', 1.5 if has_street else 2))
    # a huge metro's centre is no use for placing one club (the real suburb could be 30 km away), unless the string was trusted
    cands = [c for c in cands if not (c[1] >= 1.5 and c[0].split(',')[0].strip().lower() in BIG_CITIES and not any(t.lower().startswith(c[0].split(',')[0].strip().lower()) for t in trusted))]
    cands.sort(key=lambda c: c[1])
    seen = set(); out = []
    for c in cands:
        if c[0] not in seen: seen.add(c[0]); out.append(c)
    return out

def geocode_au(locs, names, state, trusted=()):
    for q, lvl in au_candidates(locs, names, state, trusted):
        r = nominatim(q, 'AU')
        if not r or r['cc'] != 'AU': continue
        if state and r['state'] != STATE_NAME.get(state): continue
        return {'lat': r['lat'], 'lng': r['lng'], 'p': precision(r, lvl), 'q': q.replace(', Australia', '')}
    return None

def geocode_intl(loc, iso2, us_state):
    if not loc or BAD.search(loc) or len(loc) < 4: return None
    s = re.sub(r'\([^)]*\)', ' ', loc)
    parts = [p.strip() for p in s.split(',') if p.strip()]
    qs = [', '.join(parts + ([us_state] if us_state and us_state not in parts else []))]
    if len(parts) > 1: qs.append(', '.join(parts[-2:] + ([us_state] if us_state and us_state not in parts[-2:] else [])))
    seen = set()
    for q in qs:
        if q in seen: continue
        seen.add(q)
        r = nominatim(q, iso2)
        if r and r['cc'] == iso2.upper():
            return {'lat': r['lat'], 'lng': r['lng'], 'p': precision(r, 2 if (len(qs) > 1 and q == qs[-1]) else 0), 'q': q}
    return None

def main():
    clubs = json.load(open(D('clubs.json')))['clubs']
    ev = json.load(open(D('events.json')))['events']
    iev = json.load(open(D('intl.json')))['events']
    by = collections.defaultdict(list)
    for x in ev:
        if x.get('club_id') and x.get('location'): by[x['club_id']].append(x['location'])
    out = {'clubs': {}, 'places': {}}
    # clubs: the club's own address first, then venues its events were held at
    for i, c in enumerate(clubs):
        names = [n.lower() for n in [c['name']] + (c.get('aliases') or []) if n]
        locs = ([c['address']] if c.get('address') else []) + list(dict.fromkeys(by[c['id']]))
        trusted = []
        if c.get('address'): trusted.append(c['address'])
        if c.get('suburb') and c.get('state'): locs.append(c['suburb'] + ' ' + c['state']); trusted.append(c['suburb'] + ' ' + c['state'])
        if c.get('country'):   # overseas clubs in clubs.json: only individual clubs, from their own suburb field
            iso = {'MAS': 'MY'}.get(c['country'])
            out['clubs'][c['id']] = (geocode_intl(c['suburb'], iso, None) if iso and c.get('suburb') and re.search(r'club', c.get('kind', ''), re.I) else None)
            print('club', i, c['name'], '->', out['clubs'][c['id']]); continue
        out['clubs'][c['id']] = geocode_au(locs, names, c.get('state'), trusted)
        print('club', i, c['name'], '->', out['clubs'][c['id']] and (out['clubs'][c['id']]['p'], out['clubs'][c['id']]['q'])); sys.stdout.flush()
    # event venues (Australian): only locations that are more than a club name or a state
    clubname = {c['id']: [n.lower() for n in [c['name']] + (c.get('aliases') or []) if n] for c in clubs}
    seen = set()
    for x in ev:
        loc = (x.get('location') or '').strip()
        if not loc or loc in seen: continue
        seen.add(loc)
        names = clubname.get(x.get('club_id'), []) + [(x.get('host') or '').lower()]
        r = geocode_au([loc], [n for n in names if n], x.get('state_code'), [loc])
        out['places'][loc] = r
        print('place', loc[:60], '->', r and (r['p'], r['q'][:60])); sys.stdout.flush()
    for x in iev:
        loc = (x.get('location') or '').strip()
        if not loc or loc in out['places']: continue
        r = geocode_intl(loc, x.get('iso2') or '', x.get('us_state'))
        out['places'][loc] = r
        print('intl', loc[:60], '->', r and (r['p'], r['q'][:60])); sys.stdout.flush()
    n_c = sum(1 for v in out['clubs'].values() if v)
    res = {'generated': datetime.date.today().isoformat(),
           'note': 'Coordinates for clubs and event venues, geocoded only from addresses and place names already in the calendar data (OpenStreetMap Nominatim, (c) OpenStreetMap contributors, ODbL). p: v = a venue or street, t = only a suburb, town or city. null = no reliable location, never guessed.',
           'clubs': {k: ({'lat': v['lat'], 'lng': v['lng'], 'p': v['p'], 'q': v['q']} if v else None) for k, v in out['clubs'].items()},
           'places': {k: ({'lat': v['lat'], 'lng': v['lng'], 'p': v['p']} if v else None) for k, v in out['places'].items()}}
    json.dump(res, open(D('club_coords.json'), 'w'), indent=0, ensure_ascii=False, separators=(',', ':'))
    print('clubs with coordinates', n_c, 'of', len(out['clubs']), '| places', sum(1 for v in out['places'].values() if v), 'of', len(out['places']))
if __name__ == '__main__': main()
