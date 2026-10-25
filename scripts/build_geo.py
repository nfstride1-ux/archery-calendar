#!/usr/bin/env python3
"""Build the small postcode / place lookup files used by 'Near me' (typed postcode or suburb, nothing sent anywhere).
Source: GeoNames postal codes and cities15000 (https://www.geonames.org, Creative Commons Attribution 4.0).
Output: data/geo/AU.json (postcodes + suburbs), data/geo/US.json (ZIP codes), data/geo/world.json (cities for the countries on the site + GB/CA/NZ/DK postcodes).
Usage: python3 scripts/build_geo.py  (downloads from geonames.org)"""
import io, json, os, urllib.request, zipfile, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'data', 'geo'); os.makedirs(OUT, exist_ok=True)
def get(url):
    return zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ArcheryCalendar-build/1.0'}), timeout=120).read()))
def rows(z, name): return [l.split('\t') for l in z.read(name).decode('utf-8').splitlines()]
r3 = lambda v: round(float(v), 3)
dump = lambda o, f: open(os.path.join(OUT, f), 'w').write(json.dumps(o, separators=(',', ':'), ensure_ascii=False))
# Australia: postcode centroids (mean of that postcode's places) + suburb names
au = rows(get('https://download.geonames.org/export/zip/AU.zip'), 'AU.txt')
pc = collections.defaultdict(list); pl = []
for r in au:
    if not r[1] or not r[9] or not r[10]: continue
    pc[r[1]].append((float(r[9]), float(r[10]))); pl.append([r[2], r[4], r[1], r3(r[9]), r3(r[10])])
dump({'src': 'GeoNames postal codes (CC BY 4.0)', 'pc': {k: [r3(sum(a for a, _ in v) / len(v)), r3(sum(b for _, b in v) / len(v))] for k, v in pc.items()}, 'pl': pl}, 'AU.json')
us = rows(get('https://download.geonames.org/export/zip/US.zip'), 'US.txt')
dump({'src': 'GeoNames postal codes (CC BY 4.0)', 'zip': {r[1]: [r3(r[9]), r3(r[10])] for r in us if r[1] and r[9] and r[10]}}, 'US.json')
# World: cities (pop >= 15000) for the countries the calendar lists, plus outward / area postcodes for GB, CA, NZ, DK
ic = json.load(open(os.path.join(ROOT, 'data', 'intl.json')))['countries']
keep = {c['iso2'] for c in ic if c.get('iso2')} | {'AU'}
cities = []
for r in rows(get('https://download.geonames.org/export/dump/cities15000.zip'), 'cities15000.txt'):
    if r[8] in keep: cities.append([r[1], r[2], r[8], r[10] if r[8] in ('US',) else '', r3(r[4]), r3(r[5]), int(r[14] or 0)])
zips = {}
for cc in ('GB', 'CA', 'NZ', 'DK'):
    d = {}
    for r in rows(get('https://download.geonames.org/export/zip/%s.zip' % cc), cc + '.txt'):
        if r[1] and r[9] and r[10]: d.setdefault(r[1].replace(' ', ''), [r3(r[9]), r3(r[10])])
    zips[cc] = d
dump({'src': 'GeoNames cities15000 and postal codes (CC BY 4.0)', 'cities': cities, 'zip': zips}, 'world.json')
for f in os.listdir(OUT): print(f, os.path.getsize(os.path.join(OUT, f)))
