#!/usr/bin/env python3
"""RamRods founding-sponsor card on shoot pages: copy, link, tracking, cache."""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
fail = 0

def chk(name, cond, info=''):
    global fail
    if cond:
        print('PASS', name)
        return
    fail += 1
    print('FAIL', name, info)

app = open(os.path.join(ROOT, 'app.js'), encoding='utf-8').read()
css = open(os.path.join(ROOT, 'styles.css'), encoding='utf-8').read()
sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
wn = open(os.path.join(ROOT, 'whatsnew.js'), encoding='utf-8').read()

chk('spEventCard exists', 'function spEventCard(' in app)
chk('card sits after event details', '</section>\n    ${spEventCard()}' in app and 'Event details' in app)
chk('Supported by RamRods Archery copy', 'Supported by ${esc(s.name)}' in app)
chk('Founding Sponsor of Archery Calendar line', 'Founding Sponsor of Archery Calendar' in app)
chk('uses existing logo asset', 's.logo' in app[app.find('function spEventCard'):app.find('function bindCards')])
chk('href is bare s.url, not spUrl', 'href="${esc(s.url)}"' in app[app.find('function spEventCard'):app.find('function bindCards')])
fn = app[app.find('function spEventCard'):app.find('function bindCards')]
chk('no utm on the event card', 'utm_' not in fn and 'spUrl(' not in fn)
chk('no discount or offer text', not re.search(r'discount|% off|offer code|promo', fn, re.I))
chk('no payment mention', not re.search(r'\bpaid\b|payment|price agreed|what .+ paid', fn, re.I))
chk('click path is sponsor/<id>/event_page', 'data-gc="sponsor/${esc(s.id)}/event_page"' in fn)
chk('click title mentions event page', 'sponsor click (event page)' in fn)
chk('data-sp and rel=sponsored', 'data-sp="${esc(s.id)}"' in fn and 'rel="sponsored noopener"' in fn)
chk('real alt text from sponsor name', 'alt="${esc(s.name)}"' in fn)
chk('visible focus ring', '.sp-event-link:focus-visible' in css and 'outline:3px solid var(--gold)' in css[css.find('.sp-event-link:focus-visible'):css.find('.sp-event-link:focus-visible')+80])
chk('royal blue accent, not purple', 'border:1.5px solid var(--blue)' in css and 'purple' not in css[css.find('.sp-event'):css.find('.sp-event')+800].lower() and '#1e3a8a' in css)
chk('compact mobile styles', '@media (max-width:720px)' in css[css.find('.sp-event'):css.find('.sp-event')+900])

m = re.search(r"const C='(archcal-[^']+)'", sw)
chk('unique cache name', bool(m) and m.group(1) != 'archcal-lkgo1715', m.group(1) if m else 'missing')
tag = m.group(1).replace('archcal-', '') if m else ''
chk('index cache tags match', f'app.js?v={tag}' in idx and f'styles.css?v={tag}' in idx and f'whatsnew.js?v={tag}' in idx, tag)
chk('whatsnew mentions the card', 'RamRods on every event page' in wn and 'Supported by RamRods Archery' in wn)

print('ramrods_event_card_test:', 'all passed' if not fail else f'{fail} failed')
sys.exit(1 if fail else 0)
