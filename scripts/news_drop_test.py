#!/usr/bin/env python3
"""Mobile Latest news drop-down: compact on phones, desktop cards unchanged."""
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

app = open(os.path.join(ROOT, 'app.js'), encoding='utf-8').read()
css = open(os.path.join(ROOT, 'styles.css'), encoding='utf-8').read()
sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

chk('newsCard still builds desktop cards', 'class="news-card nc-main"' in app and 'nc-tag">Latest news' in app)
chk('newsCard builds details drop-down', '<details class="news-drop">' in app and '<summary class="news-drop-sum">' in app)
chk('drop-down shows count and peek headline', 'Latest news (${items.length})' in app and 'news-drop-peek' in app)
chk('drop-down links keep same article URLs and tracking', 'class="news-drop-link"' in app and 'data-gc="home-card/newsletter"' in app)
chk('empty news returns nothing', 'if (!items.length) return' in app)

chk('drop-down hidden by default', '.news-drop{display:none}' in css)
chk('drop-down only at 768px and under', '@media (max-width:768px)' in css and '.news-drop{display:block' in css)
chk('stacked cards hidden on mobile', '.home-wrap > .news-card.nc-main{display:none}' in css)
chk('1280px still hides main cards for side columns', '.home-wrap .news-card.nc-main{display:none}' in css and '@media (min-width:1280px)' in css)
chk('gold / yellow accent kept', 'border-left:6px solid var(--gold)' in css and 'background:#fff8e1' in css)
# Real purple hues, not the misnamed --purple token (which is navy).
chunk = css[css.find('28 Nov 2026'):css.find('28 Nov 2026')+2500] if '28 Nov 2026' in css else ''
chk('no purple in new drop-down CSS', not re.search(r'(?<!-)purple|#7c3aed|#6d28d9|#8b5cf6|#a855f7|#7e22ce', chunk, re.I))

chk('cache bumped in sw', "const C='archcal-newsdrop1128'" in sw)
chk('index cache tags', 'app.js?v=newsdrop1128' in idx and 'styles.css?v=newsdrop1128' in idx)
chk('privatecal stays out', not os.path.isfile(os.path.join(ROOT, 'privatecal.js')))

print('news_drop_test:', 'all passed' if not fail else f'{fail} failed')
sys.exit(1 if fail else 0)
