#!/usr/bin/env python3
"""Checks the Google search pages (scripts/build_seo.py) are up to date with data/*.json and well formed.
Run before every push that changes data/events.json or data/intl.json. Fix a failure with: python3 scripts/build_seo.py"""
import os, re, sys, json, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ok = fail = 0
def t(name, cond, info=''):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print('FAIL', name, info)
c = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build_seo.py'), '--check'], capture_output=True, text=True)
t('generated pages match the data (run python3 scripts/build_seo.py)', c.returncode == 0, c.stdout.strip()[:300])
pages = [os.path.join(dp, f) for d in ('events', 'australia', 'organisers', 'countries') for dp, _, fs in os.walk(os.path.join(ROOT, d)) for f in fs if f == 'index.html']
t('pages exist', len(pages) > 100, len(pages))
EM = re.compile(r'[\w.+-]+@[\w-]+\.[a-z]{2,}', re.I)
for p in pages:
    h = open(p, encoding='utf-8').read(); r = os.path.relpath(p, ROOT)
    t('one h1 ' + r, len(re.findall(r'<h1[ >]', h)) == 1)
    t('canonical ' + r, h.count('<link rel="canonical"') == 1)
    t('new name ' + r, 'Archery Calendars' in h and not re.search(r'Archery Calendar(?!s)', h))
    t('no email ' + r, not [m for m in EM.findall(re.sub(r'<script(?![^>]*ld\+json)[^>]*>.*?</script>', '', h, flags=re.S)) if not m.lower().endswith(('.png', '.jpg', '.webp', '.svg'))])
    t('no mailto/tel ' + r, not re.search(r'href="(mailto|tel):', h))
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try: j = json.loads(b)
        except Exception as e: t('json-ld parses ' + r, False, e); continue
        if j.get('@type') == 'Event':
            t('event json-ld fields ' + r, all(j.get(k) for k in ('name', 'startDate', 'location')) and not re.search(r'streetAddress|postalCode|telephone|"email"', b))
sm = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
t('sitemap has event pages', sm.count('/events/') > 100)
print(f'{ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
