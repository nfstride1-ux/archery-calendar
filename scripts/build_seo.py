#!/usr/bin/env python3
"""Build static, crawlable pages for search and AI search from the event data.
Output (all plain static files, GitHub Pages serves them as-is):
  events/<id>/index.html            one page per event
  australia/index.html, australia/<state>/, australia/<discipline>/, australia/<state>/<discipline>/
  organisers/<org>/                 ABA, Archery WA, Archery Australia, TAA
  countries/index.html, countries/<country>/
  llms.txt, sitemap.xml (generated pages + the kept hand-made entries)
Real data fields only. Never output: notes, contact names, phone numbers, emails, street addresses, bank details,
archer names or scores. The app (#/ routes) is untouched; every page links into it.
Usage:  python3 scripts/build_seo.py                 full build into the repo
        python3 scripts/build_seo.py --sample        small sample (3 events, WA page, Denmark page, llms.txt)
        python3 scripts/build_seo.py --out /tmp/x    write somewhere else (for counts / dry runs)
        python3 scripts/build_seo.py --check         exit 1 if generated files in the repo are stale
Published page groups (PUBLISHED below) grow one release at a time: hubs (Australia hub, states, disciplines,
organisers), events (/events/<id>/), countries (/countries/). Links to a group that is not published yet point into the app.
Run it after any change to data/events.json or data/intl.json, and commit the changed pages with the data."""
import json, os, re, sys, html, datetime, shutil, argparse, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://archerycalendars.com'
ap = argparse.ArgumentParser()
ap.add_argument('--sample', action='store_true'); ap.add_argument('--out'); ap.add_argument('--check', action='store_true')
ap.add_argument('--today'); ap.add_argument('--groups', help='comma list, overrides PUBLISHED (tests only)'); args = ap.parse_args()
PUBLISHED = {'hubs', 'events', 'countries'}
GROUPS = set(args.groups.split(',')) if args.groups else PUBLISHED
BRAND = 'Archery Calendars'
OUT = os.path.abspath(args.out or ROOT)
TODAY = args.today or datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d')   # site runs on Perth time
SAMPLE_EVENTS = ['awa-2026-2', 'aa-2027-open-field', 'bd-8062']
SAMPLE_STATE, SAMPLE_COUNTRY = 'WA', 'DEN'
GEN_DIRS = ['events', 'australia', 'organisers', 'countries']
GROUP_DIRS = {'hubs': ['australia', 'organisers'], 'events': ['events'], 'countries': ['countries']}

def load(p): return json.load(open(os.path.join(ROOT, p), encoding='utf-8'))
A = load('data/events.json'); I = load('data/intl.json'); ORG = {o['id']: o for o in load('data/organisations.json')['organisations']}
for o in I.get('orgs', []): ORG.setdefault(o['id'], o)
CTRY = {c['code']: c for c in I['countries']}; CTRY['AUS'] = {'code': 'AUS', 'name': 'Australia', 'iso2': 'AU'}
DATA_DATE = min(TODAY, max([A.get('generated', ''), I.get('generated', '')] + [x.get('last_checked') or '' for x in A['events'] + I['events']]))   # newest date the data was generated or checked
idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
CSSV = (re.search(r'styles\.css\?v=(\w+)', idx) or [0, 'x'])[1]
GSC = (re.search(r'<meta name="google-site-verification"[^>]*>', idx) or [''])[0]

STATES = [('NSW', 'New South Wales'), ('VIC', 'Victoria'), ('QLD', 'Queensland'), ('WA', 'Western Australia'), ('SA', 'South Australia'), ('TAS', 'Tasmania'), ('ACT', 'Australian Capital Territory'), ('NT', 'Northern Territory')]
SNAME = dict(STATES)
DISC = [('field', 'Field'), ('3d', '3D'), ('indoor', 'Indoor'), ('target', 'Target')]
DNAME = dict(DISC)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
esc = lambda s: html.escape(str(s if s is not None else ''), quote=True)
def slug(s): return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', re.sub(r'[\u0300-\u036f]', '', __import__('unicodedata').normalize('NFD', str(s).lower())))).strip('-')
def d8(s): return datetime.date.fromisoformat(s)

# ---------- privacy: public text may carry venue name and town only ----------
ADDR_WORD = re.compile(r'\b(rd|road|st|street|dr|drive|ave|avenue|pkwy|parkway|lane|ln|way|hwy|highway|blvd|boulevard|court|ct|cres|crescent|place|pl|lot|unit|ste|suite|bldg|po box|mahallesi|bulvar[ıi])\b|vej\b|gade\b|allé\b|plads\b|weg\b|strasse\b|straße\b', re.I)
def addrish(p): return bool(re.search(r'\d', p)) or bool(ADDR_WORD.search(p))
STATE_TOK = r'(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)'
VENUE_WORD = re.compile(r'\b(park|club|clubs|centre|center|archers|archery|range|oval|grounds?|reserve|hall|fields?|sports?|complex|school|college|showground|showgrounds|farm|ranch|camp|lodge|hotel|stadium|arena|gardens?)\b', re.I)
def venue(x):
    """-> (venue name or '', locality). No street, number, postcode or access directions."""
    loc = re.sub(r'\([^)]*\)', '', x.get('location') or '').strip()
    if not loc or re.search(r'\b(tba|tbc|to be confirmed|venue to be)\b', loc, re.I) and len(loc) < 24: return ('', '')
    reg = region_of(x) or ''
    keep = []
    for p in (q.strip() for q in loc.split(',')):
        p = re.sub(r'^\d{4,5}\s+', '', re.sub(r'\s+\d{4,5}(-\d{4})?$', '', p)).strip()      # postcodes, either side
        p = re.sub(r'\s+' + STATE_TOK + r'$', '', p).strip() if x.get('country_code') == 'AUS' else p
        if not p or addrish(p) or p == reg or p in SNAME.values(): continue
        if keep and keep[-1].lower() == p.lower(): continue
        keep.append(p)
    if not keep: return ('', '')
    if len(keep) == 1: return (keep[0], '')
    last = keep[-1]
    if VENUE_WORD.search(last): return (', '.join(keep), '')     # last part is still a venue name, not a town
    return (', '.join(keep[:-1]), last)
def venue_text(x):
    n, l = venue(x); return ', '.join(t for t in (n, l) if t)
PHONE = re.compile(r'(\+?\d[\d ()-]{7,}\d)|@')
def safe_text(s, maxlen=120):
    s = (s or '').strip()
    if not s or PHONE.search(s) or len(s) > maxlen: return ''
    return s

def disc_keys(x):
    d = (x.get('discipline') or '').lower(); k = []
    if 'field' in d or 'hunter' in d: k.append('field')
    if '3d' in d: k.append('3d')
    if 'indoor' in d: k.append('indoor')
    if 'target' in d or 'clout' in d: k.append('target')
    return k
def disc_label(x):
    d = (x.get('discipline') or '').strip()
    return d or 'Archery'
def disc_noun(x):
    """Readable noun phrase for the discipline: 'indoor archery event', '3D / field archery event', 'archery coaching course'."""
    d = disc_label(x); l = d.lower().replace('3d', '3D')
    if l in ('archery', 'various', ''): return 'archery event'
    if l in ('coaching', 'judging'): return f'archery {l} course'
    if l == 'bowfishing': return 'bowfishing event'
    if l.endswith('archery'): return f'{l} event'
    return f'{l} archery event'
def disc_kind(x): n = disc_noun(x); return n.rsplit(' ', 1)[0]   # 'indoor archery', 'archery coaching'
def a_an(w): return 'an' if w[:1].lower() in 'aeiou' else 'a'
def end(x): return x.get('end_date') or x.get('start_date')
def is_past(x): return bool(end(x)) and end(x) < TODAY
def fmt_date(s, wd=True):
    if len(s) == 7: return f'{MONTHS[int(s[5:7])-1]} {s[:4]}'
    if len(s) != 10: return s
    d = d8(s); return (WD[d.weekday()] + ' ' if wd else '') + f'{d.day} {MONTHS[d.month-1][:3]} {d.year}'
def date_range(x):
    s, e = x.get('start_date'), x.get('end_date') or x.get('start_date')
    if not s: return 'Dates to be confirmed'
    if s == e: return fmt_date(s)
    a, b = d8(s), d8(e)
    if a.year == b.year and a.month == b.month: return f'{WD[a.weekday()]} {a.day} to {WD[b.weekday()]} {b.day} {MONTHS[a.month-1][:3]} {a.year}'
    return f'{fmt_date(s)} to {fmt_date(e)}'

# ---------- events ----------
EV = {}
for x in A['events']:
    x = dict(x); x['_src'] = 'AUS'; EV[x['id']] = x
for x in I['events']:
    if x['id'] in EV: continue
    x = dict(x); x['_src'] = 'INTL'; EV[x['id']] = x
EVS = [x for x in EV.values()]
def country_of(x):
    c = x.get('country_code') or 'WORLD'; return c if c in CTRY else None
def state_of(x): return x.get('state_code') if x['_src'] == 'AUS' or x.get('country_code') == 'AUS' else None
def region_of(x):
    if x.get('country_code') == 'AUS': return state_of(x)
    return x.get('us_state')
def ctry_name(x): c = country_of(x); return CTRY[c]['name'] if c else (x.get('country_name') or x.get('country') or '')
def indexable(x): return bool(x.get('start_date'))
def event_path(x): return f'/events/{x["id"]}/'
def event_href(x): return event_path(x) if 'events' in GROUPS else home_of(x)   # app link until event pages are published
CTRY_INDEX = lambda: '/countries/' if 'countries' in GROUPS else '/#/intl'
def country_href(n, code): return f'/countries/{slug(n)}/' if 'countries' in GROUPS else f'/#/home/{code}'
def home_of(x): return f'/#/shoot/{x["id"]}'
def lastmod(x):
    d = x.get('last_checked') or DATA_DATE; return d if d <= TODAY else TODAY
def entry_label(x):
    return {'entry_page': 'Enter online', 'entry_system': 'Enter online', 'wareos': 'Enter online', 'event_page': 'Event page and entry details', 'email': 'Entry by email', 'website': 'Organiser website', 'how_to_guide': 'How to enter', 'volunteer': 'Volunteer sign-up'}.get(x.get('registration_url_kind'), 'Entry information')
def reg_url(x):
    u = x.get('registration_url') or ''
    return u if re.match(r'https?://', u) else ''   # never mailto: (private email addresses)
def flyer_link(x):
    u = x.get('flyer_url') or ''
    if u.startswith('http'): return u
    w = x.get('flyer_web'); return SITE + '/' + w if w else ''
def org_site(x):
    o = ORG.get(x.get('org_id')); return (o or {}).get('website') or ''
def org_page(x): return f'/organisers/{x["org_id"]}/' if x.get('org_id') in ORG_PAGES else ''

def status_text(x):
    if x.get('cancelled'): return 'Cancelled'
    if is_past(x): return 'Past event'
    if x.get('start_date') and x['start_date'] <= TODAY <= end(x): return 'On now'
    return 'Upcoming'

def describe(x):
    """Plain sentence built only from data fields."""
    v = venue_text(x); reg = region_of(x); where = ', '.join(t for t in (v, SNAME.get(reg, reg) if x.get('country_code') == 'AUS' else '', ctry_name(x)) if t)
    dn = disc_noun(x); s = f'{x["name"]} is {a_an(dn)} {dn}' + (f' run by {x["org"]}' if x.get('org') else '')
    if x.get('start_date'): s += f' on {date_range(x)}'
    if where: s += f' at {where}'
    s += '.'
    return s
def meta_desc(x):
    reg = region_of(x); st = SNAME.get(reg) if x.get('country_code') == 'AUS' else reg
    place = ', '.join(t for t in (venue_text(x), st or '', ctry_name(x)) if t)
    tail = ' Entry link, flyer and details.' if (reg_url(x) or flyer_link(x)) else ' Dates, venue and organiser.'
    for opt in (describe(x) + tail, describe(x),
                f'{x["name"]}: {disc_kind(x)}, {date_range(x)}' + (f', {place}' if place else '') + '.',
                f'{x["name"]}: {disc_kind(x)}, {date_range(x)}.'):
        if len(opt) <= 158: return opt
    return opt[:155].rsplit(' ', 1)[0] + '...'

def event_jsonld(x):
    """schema.org Event with real fields only. None when dates or venue are not confirmed (Google needs both)."""
    if not x.get('start_date') or x.get('dates_confirmed') is False: return None
    n, loc = venue(x)
    if not (n or loc): return None
    addr = {'@type': 'PostalAddress'}
    if loc: addr['addressLocality'] = loc.split(',')[0].strip()
    reg = region_of(x)
    if reg: addr['addressRegion'] = reg
    c = country_of(x); iso = CTRY[c]['iso2'] if c else x.get('iso2')
    if iso: addr['addressCountry'] = iso
    d = {'@context': 'https://schema.org', '@type': 'Event', 'name': x['name'], 'startDate': x['start_date'],
         'endDate': end(x), 'eventStatus': 'https://schema.org/EventCancelled' if x.get('cancelled') else 'https://schema.org/EventScheduled',
         'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
         'location': {'@type': 'Place', 'name': n or loc, 'address': addr},
         'description': describe(x), 'url': SITE + event_path(x), 'inLanguage': 'en'}
    if x.get('org'):
        o = {'@type': 'Organization', 'name': x['org']}
        if org_site(x): o['url'] = org_site(x)
        d['organizer'] = o
    fl = flyer_link(x)
    if x.get('flyer_web_sm') or x.get('flyer_web'):
        pass   # flyers are posters with contact details; not used as the schema image
    return d

# ---------- page shell ----------
# Same analytics as the newsletter pages: Microsoft Clarity (masking Strict) and GoatCounter (no cookies).
CLARITY = '<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","z660a5ongn");</script>'
CSS_LINK = f'<link rel="stylesheet" href="/styles.css?v={CSSV}">'
def jsonld_tag(o): return '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>'
def crumbs_html(cs):
    return '<nav class="seo-crumbs" aria-label="Breadcrumb"><ol>' + ''.join(f'<li><a href="{esc(u)}">{esc(n)}</a></li>' if u else f'<li aria-current="page">{esc(n)}</li>' for n, u in cs) + '</ol></nav>'
def crumbs_ld(cs):
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, **({'item': SITE + u} if u else {})} for i, (n, u) in enumerate(cs)]}
def foot_links():
    st = ''.join(f'<a href="/australia/{slug(n)}/">{esc(n)}</a>' for c, n in STATES if c in STATE_SET)
    return f'''<footer class="site-foot"><div class="wrap foot-grid">
<div><a class="logo" href="/"><span class="logo-mark" aria-hidden="true"></span><span>Archery<b>Calendars</b></span></a>
<p>Every archery event &ndash; Field, 3D, Target and Indoor &ndash; in one calendar. Australia-wide, plus the USA, Denmark, New Zealand, Canada and more.</p>
<p class="foot-tag"><i>Created by an archer, for archers.</i></p></div>
<div><h3>Australia</h3><a href="/australia/">All Australian events</a>{st}</div>
<div><h3>Explore</h3><a href="{CTRY_INDEX()}">Events by country</a><a href="/organisers/aba/">ABA shoots</a><a href="/organisers/archery-wa/">Archery WA calendar</a><a href="/#/browse">Find events (app)</a><a href="/newsletter/">Newsletter</a><a href="/#/submit">Submit an event</a><a href="/#/privacy">Privacy &amp; disclaimer</a></div>
</div><div class="wrap foot-small"><b>Dates come from organisers&rsquo; public calendars; always check with the organiser.</b> Visits are counted anonymously, and we use Microsoft Clarity to see how the site is used; typed details are hidden (<a href="/#/privacy">privacy</a>).</div></footer>'''
NAMECOUNT = collections.Counter([x['name'] for x in EVS] + [(x['name'], x.get('start_date')) for x in EVS])
def shell(title, desc, path, h1, body, ld, kicker=BRAND, robots=None, og_type='website'):
    can = SITE + path
    ldt = ''.join(jsonld_tag(o) for o in ld if o)
    rb = f'<meta name="robots" content="{robots}">' if robots else ''
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
{GSC}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
{rb}<link rel="canonical" href="{can}">
<meta name="theme-color" content="#0d1b2a">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Archery Calendars">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{can}">
<meta property="og:image" content="{SITE}/img/target-face.jpg">
<meta property="og:image:alt" content="Arrows grouped in an archery target face">
<meta property="og:locale" content="en_AU">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
<link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32">
<link rel="icon" type="image/png" href="/favicon-16.png" sizes="16x16">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="preload" href="/fonts/Inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/BarlowCondensed-ExtraBold.woff2" as="font" type="font/woff2" crossorigin>
{CSS_LINK}
{ldt}
{CLARITY}
</head>
<body data-page="seo">
<a class="skip" href="#view">Skip to content</a>
<header class="site-head"><div class="wrap head-row">
<a class="logo" href="/" aria-label="Archery Calendars home"><span class="logo-mark" aria-hidden="true"></span><span>Archery<b>Calendars</b></span></a>
<nav class="nav" aria-label="Main"><a href="/#/home">Home</a><a href="/#/browse">Find events</a><a href="/australia/"{' class="on"' if path.startswith('/australia') or path.startswith('/events') else ''}>Australia</a><a href="{CTRY_INDEX()}"{' class="on"' if path.startswith('/countries') else ''}>Countries</a><a href="/#/near">Near me</a><a href="/newsletter/">Newsletter</a></nav>
</div></header>
<main id="view" tabindex="-1">
<section class="seo-hero"><div class="wrap"><p class="kicker">{esc(kicker)}</p><h1>{esc(h1)}</h1></div></section>
<div class="wrap seo-wrap">
{body}
</div>
</main>
{foot_links()}
<script data-goatcounter="https://archerycalendars.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
'''

def ev_row(x, show_ctry=False):
    v = venue_text(x); bits = [t for t in (disc_label(x), v, ctry_name(x) if show_ctry else '') if t]
    st = status_text(x); cls = ' seo-ev-past' if st == 'Past event' else ' seo-ev-cancel' if st == 'Cancelled' else ''
    b = f'<span class="seo-badge">{esc(st)}</span>' if st != 'Upcoming' else ''
    return f'<li class="seo-ev{cls}"><span class="seo-ev-date">{esc(date_range(x))}</span><a class="seo-ev-name" href="{event_href(x)}">{esc(x["name"])}</a>{b}<span class="seo-ev-meta">{esc(" · ".join(bits))}</span></li>'

# ---------- list pages ----------
def year_span(evs):
    ys = sorted({d8(x['start_date']).year for x in evs if x.get('start_date') and not is_past(x)})
    return ('%d' % ys[0] if len(ys) == 1 else '%d-%d' % (ys[0], ys[-1])) if ys else str(d8(TODAY).year)
def top_places(evs, n=6):
    cn = {v['name'].lower() for v in CTRY.values()}   # a locality that is just the country name is not a venue town
    c = collections.Counter(v for v in (venue(x)[1].split(',')[0].strip() for x in evs) if v and v.lower() not in cn)
    return [p for p, _ in c.most_common(n)]
def join_and(items): return ', '.join(items[:-1]) + ' and ' + items[-1] if len(items) > 1 else (items[0] if items else '')

def list_page(kind, key, title_core, h1, scope, evs, crumbs, links_html='', extra_intro='', desc_hint=''):
    evs = sorted(evs, key=lambda x: (x.get('start_date') or '9', x['id']))
    up = [x for x in evs if not is_past(x) and x.get('start_date')]; past = [x for x in evs if is_past(x)]; tbc = [x for x in evs if not x.get('start_date')]
    dn = collections.Counter(k for x in up for k in disc_keys(x))
    dtxt = join_and([f'{DNAME[k]} ({dn[k]})' for k, _ in DISC if dn[k]])
    orgs = collections.Counter(x['org'] for x in up if x.get('org'))
    otxt = join_and([o for o, _ in orgs.most_common(4)])
    pl = join_and(top_places(up))
    yr = year_span(up)
    nxt = up[0] if up else None
    intro = f'Archery Calendars lists {len(up)} upcoming archery event{"s" if len(up) != 1 else ""} {scope}'
    intro += f' ({len(past)} past event{"s" if len(past) != 1 else ""} also listed)' if past else ''
    intro += '.'
    if dtxt: intro += f' By discipline: {dtxt}.'
    if otxt: intro += f' Events come from {otxt}.'
    if len(top_places(up)) >= 2: intro += f' Venues are in {pl}.'
    if nxt: intro += f' The next event is {nxt["name"]} on {date_range(nxt)}.'
    desc = f'{len(up)} upcoming archery events {scope}, {yr}: ' + ((dtxt.replace(' (', ' ').replace(')', '') + '. ') if dtxt else '') + (desc_hint or 'Dates, venues, entry links and flyers.')
    if len(desc) > 158: desc = desc[:155].rsplit(' ', 1)[0] + '...'
    body = crumbs_html(crumbs)
    body += f'<section class="panel seo-intro"><p>{esc(intro)}</p>{extra_intro}<p class="seo-cta"><a class="btn gold" href="/#/browse">Search, save and get reminders in the app</a></p></section>'
    if links_html: body += links_html
    body += f'<h2 class="sec-h">Upcoming events ({len(up)})</h2>'
    body += ('<ul class="seo-list">' + ''.join(ev_row(x, show_ctry=(kind == 'org')) for x in up) + '</ul>') if up else '<p class="note">No upcoming events listed yet. Run a club or tournament here? <a href="/#/submit">Send it in</a> and we will add it.</p>'
    if tbc: body += f'<h2 class="sec-h">Dates to be confirmed ({len(tbc)})</h2><ul class="seo-list">' + ''.join(ev_row(x) for x in tbc) + '</ul>'
    if past: body += f'<h2 class="sec-h">Past events ({len(past)})</h2><ul class="seo-list">' + ''.join(ev_row(x) for x in reversed(past)) + '</ul>'
    body += '<p class="seo-note">Dates come from organisers&rsquo; public calendars; always check with the organiser before you travel.</p>'
    ld = [crumbs_ld(crumbs), {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': h1, 'url': SITE + key, 'description': desc, 'isPartOf': {'@type': 'WebSite', 'name': BRAND, 'url': SITE + '/'}},
          {'@context': 'https://schema.org', '@type': 'ItemList', 'numberOfItems': len(up), 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': SITE + event_href(x), 'name': x['name']} for i, x in enumerate(up[:50])]}]
    title = f'{title_core} | {BRAND}'
    lm = max([lastmod(x) for x in evs] or [DATA_DATE])
    return key, shell(title, desc, key, h1, body, ld, kicker=scope.title() if len(scope) < 40 else 'Archery events'), lm, len(up)

# ---------- event page ----------
def event_page(x, rel):
    v = venue_text(x); n, loc = venue(x)
    reg = region_of(x); cn = ctry_name(x)
    where_short = loc.split(',')[0] if loc else (n or '')
    place = ', '.join(t for t in (where_short, (SNAME.get(reg) if x.get('country_code') == 'AUS' else reg) or '', cn) if t)
    st = status_text(x)
    year = d8(x['start_date']).year if x.get('start_date') else ''
    tiers = [f'{x["name"]}{" " + str(year) if year and str(year) not in x["name"] else ""} – {date_range(x) if x.get("start_date") else "dates TBC"}',
             f'{x["name"]} – {fmt_date(x["start_date"], False) if x.get("start_date") else "dates TBC"}', x['name']]
    title = next((t for t in tiers if len(t) <= 51), tiers[1] if len(tiers[1]) <= 70 else tiers[2])   # brand suffix adds 20
    if NAMECOUNT[x['name']] > 1 and title == x['name']:      # same name, several events: tell them apart
        title = tiers[1] + (f' – {where_short}' if NAMECOUNT[(x['name'], x.get('start_date'))] > 1 and where_short else '')
    title += ' | ' + BRAND
    cs = [('Home', '/')]
    if x.get('country_code') == 'AUS':
        cs += [('Australia', '/australia/')] + ([(SNAME[reg], f'/australia/{slug(SNAME[reg])}/')] if reg in SNAME and reg in STATE_SET else [])
    elif country_of(x) in COUNTRY_SET and 'countries' in GROUPS: cs += [('Countries', '/countries/'), (cn, f'/countries/{slug(cn)}/')]   # until D: Home > event
    cs += [(x['name'], None)]
    facts = [('Status', st), ('Dates', date_range(x) + ('' if x.get('dates_confirmed', True) or not x.get('start_date') else ' (dates not yet confirmed by the organiser)'))]
    if v: facts.append(('Venue', v))
    facts.append(('Location', ', '.join(t for t in ((SNAME.get(reg) if x.get('country_code') == 'AUS' else reg) or '', cn) if t)))
    facts.append(('Discipline', disc_label(x)))
    if x.get('level'): facts.append(('Level', x['level']))
    if x.get('org'):
        op = org_page(x); facts.append(('Organiser', f'<a href="{op}">{esc(x["org"])}</a>' if op else esc(x['org'])))
    for lab, k in (('Rounds', 'rounds'), ('Entry fee', 'fee')):
        t = safe_text(x.get(k) if isinstance(x.get(k), str) else '')
        if t: facts.append((lab, t))
    if x.get('entry_close_date'): facts.append(('Entries close', fmt_date(x['entry_close_date']) + (' (closed)' if x['entry_close_date'] < TODAY else '')))
    if x.get('registration_opens'): facts.append(('Entries open', fmt_date(x['registration_opens'])))
    dl = '<dl class="seo-facts">' + ''.join(f'<dt>{esc(a)}</dt><dd>{b if a == "Organiser" else esc(b)}</dd>' for a, b in facts) + '</dl>'
    links = ''
    if reg_url(x): links += f'<a class="btn gold" href="{esc(reg_url(x))}" rel="noopener" target="_blank">{esc(entry_label(x))}</a> '
    fl = flyer_link(x)
    if fl: links += f'<a class="btn alt" href="{esc(fl)}" rel="noopener" target="_blank">Flyer{"" if x.get("flyer_is_current", True) else " (older)"}</a> '
    if x.get('source_url'): links += f'<a class="btn alt" href="{esc(x["source_url"])}" rel="noopener" target="_blank">Organiser calendar</a> '
    links += f'<a class="btn" href="{home_of(x)}">Open in the Archery Calendars app</a>'
    body = crumbs_html(cs)
    body += f'<article class="panel seo-event"><p class="lead-d">{esc(describe(x))}</p>{dl}<p class="seo-actions">{links}</p>'
    body += '<p class="seo-note">Details come from the organiser&rsquo;s public calendar' + (f' (checked {fmt_date(x["last_checked"], False)})' if x.get('last_checked') else '') + '. Always confirm dates, entry and venue with the organiser. Save this event in the app to get reminders before entries close.</p></article>'
    if rel:
        body += '<h2 class="sec-h">More archery events nearby in the calendar</h2><ul class="seo-list">' + ''.join(ev_row(r) for r in rel) + '</ul>'
    ld = [crumbs_ld(cs), event_jsonld(x)]
    robots = None if indexable(x) else 'noindex,follow'
    return shell(title, meta_desc(x), event_path(x), x['name'], body, ld, kicker=disc_noun(x), robots=robots, og_type='article')

def related(x, pool_by_key, n=5):
    key = (x.get('country_code'), region_of(x))
    pool = [r for r in pool_by_key.get(key, []) if r['id'] != x['id'] and not is_past(r) and r.get('start_date')]
    base = x.get('start_date') or TODAY
    pool.sort(key=lambda r: abs((d8(r['start_date']) - d8(base)).days))
    return sorted(pool[:n], key=lambda r: r['start_date'])

# ---------- build ----------
AUS_EV = [x for x in EVS if x.get('country_code') == 'AUS']
STATE_SET = {s for s, _ in STATES if any(state_of(x) == s for x in AUS_EV)}
COUNTRY_SET = {c for c in CTRY if c != 'AUS' and any(country_of(x) == c for x in EVS)}
ORG_PAGES = {o for o in ('aba', 'archery-wa', 'archery-australia', 'taa', 'wa-aus', 'indoor-archery-wa') if o in ORG and any(x.get('org_id') == o for x in EVS)}
ORG_PAGES.discard('wa-aus')   # World Archery's feed id: not a body members search for
pool_by_key = collections.defaultdict(list)
for x in EVS: pool_by_key[(x.get('country_code'), region_of(x))].append(x)

pages = {}   # url path -> (html, lastmod)
counts = collections.Counter()
def add(path, htmltxt, lm, kind):
    pages[path] = (htmltxt, lm); counts[kind] += 1

sel_events = ([EV[i] for i in SAMPLE_EVENTS] if args.sample else EVS) if 'events' in GROUPS else []
for x in sel_events:
    add(event_path(x), event_page(x, related(x, pool_by_key)), lastmod(x), 'event')

def chip_links(items, label):
    return f'<nav class="seo-chips" aria-label="{esc(label)}">' + ''.join(f'<a class="chip" href="{u}">{esc(n)}{f" <small>{c}</small>" if c is not None else ""}</a>' for n, u, c in items) + '</nav>'
def upn(evs): return sum(1 for x in evs if not is_past(x) and x.get('start_date'))

# Australia hub
if not args.sample and 'hubs' in GROUPS:
    st_items = [(n, f'/australia/{slug(n)}/', upn([x for x in AUS_EV if state_of(x) == c])) for c, n in STATES if c in STATE_SET]
    d_items = [(f'{DNAME[k]} archery', f'/australia/{k}/', upn([x for x in AUS_EV if k in disc_keys(x)])) for k, _ in DISC]
    o_items = [(ORG[o]['name'], f'/organisers/{o}/', upn([x for x in EVS if x.get('org_id') == o])) for o in sorted(ORG_PAGES)]
    k, h, lm, _ = list_page('hub', '/australia/', f'Archery Events Australia {year_span([x for x in AUS_EV if not is_past(x)])}: Competitions Calendar', 'Archery events in Australia', 'in Australia', AUS_EV,
        [('Home', '/'), ('Australia', None)], '<h2 class="sec-h">By state or territory</h2>' + chip_links(st_items, 'States') + '<h2 class="sec-h">By discipline</h2>' + chip_links(d_items, 'Disciplines') + '<h2 class="sec-h">By organiser</h2>' + chip_links(o_items, 'Organisers'),
        desc_hint='Archery Australia, ABA and Archery WA calendars in one place.')
    add(k, h, lm, 'hub')

def state_page(c):
    n = SNAME[c]; evs = [x for x in AUS_EV if state_of(x) == c]
    dk = [(k, upn([x for x in evs if k in disc_keys(x)])) for k, _ in DISC]
    sub = [(f'{DNAME[k]} archery in {n}', f'/australia/{slug(n)}/{k}/', cnt) for k, cnt in dk if cnt >= 3]
    ex = f'<p>{esc(n)} ({c}) events include ABA shoots, Archery Australia events and state association events where listed.</p>' if False else ''
    links = ('<h2 class="sec-h">By discipline</h2>' + chip_links(sub, 'Disciplines')) if sub else ''
    cal = {'WA': ' Archery WA calendar.'}.get(c, '')
    return list_page('state', f'/australia/{slug(n)}/', f'Archery Events in {n} {year_span([x for x in evs if not is_past(x)])}', f'Archery events in {n}', f'in {n}', evs,
        [('Home', '/'), ('Australia', '/australia/'), (n, None)], links, desc_hint='Entry links and flyers.' + cal)
for c, n in STATES:
    if c not in STATE_SET or 'hubs' not in GROUPS: continue
    if args.sample and c != SAMPLE_STATE: continue
    k, h, lm, _ = state_page(c); add(k, h, lm, 'state')
    if args.sample: continue
    evs = [x for x in AUS_EV if state_of(x) == c]
    for dk, dn in DISC:
        de = [x for x in evs if dk in disc_keys(x)]
        if upn(de) < 3: continue
        yr = year_span([x for x in de if not is_past(x)])
        k, h, lm, _ = list_page('statedisc', f'/australia/{slug(n)}/{dk}/', f'{DNAME[dk]} Archery in {n} {yr}', f'{DNAME[dk]} archery events in {n}', f'for {DNAME[dk]} archery in {n}', de,
            [('Home', '/'), ('Australia', '/australia/'), (n, f'/australia/{slug(n)}/'), (DNAME[dk], None)])
        add(k, h, lm, 'state-discipline')
if not args.sample and 'hubs' in GROUPS:
    for dk, dn in DISC:
        de = [x for x in AUS_EV if dk in disc_keys(x)]
        yr = year_span([x for x in de if not is_past(x)])
        t = {'field': f'Field Archery Events Australia {yr}', '3d': f'3D Archery Shoots Australia {yr}', 'indoor': f'Indoor Archery Competitions Australia {yr}', 'target': f'Target Archery Competitions Australia {yr}'}[dk]
        k, h, lm, _ = list_page('disc', f'/australia/{dk}/', t, f'{dn} archery events in Australia', f'for {dn} archery in Australia', de, [('Home', '/'), ('Australia', '/australia/'), (dn, None)])
        add(k, h, lm, 'discipline')
    for o in sorted(ORG_PAGES):
        oe = [x for x in EVS if x.get('org_id') == o]; nm = ORG[o]['name']
        t = {'aba': f'ABA Shoots {year_span([x for x in oe if not is_past(x)])}: ABA Calendar', 'archery-wa': f'Archery WA Calendar {year_span([x for x in oe if not is_past(x)])}'}.get(o, f'{nm} events and calendar {year_span([x for x in oe if not is_past(x)])}')
        site = ORG[o].get('website')
        ex = f'<p>Organiser website: <a href="{esc(site)}" rel="noopener" target="_blank">{esc(site)}</a></p>' if site else ''
        k, h, lm, _ = list_page('org', f'/organisers/{o}/', t, f'{nm} events', f'from {nm}', oe, [('Home', '/'), ('Australia', '/australia/'), (nm, None)], extra_intro=ex)
        add(k, h, lm, 'organiser')

# Countries
def country_page(c):
    evs = [x for x in EVS if country_of(x) == c]; n = CTRY[c]['name']
    yr = year_span([x for x in evs if not is_past(x)])
    extra = ''
    if c == 'USA':
        sc = collections.Counter(x.get('us_state') for x in evs if x.get('us_state') and not is_past(x))
        extra = '<p>Events span ' + str(len(sc)) + ' US states.</p>'
    tn = ('the ' if n in ('United States', 'United Arab Emirates', 'Netherlands', 'Philippines', 'Czech Republic') else '') + n   # "in the United States"
    return list_page('country', f'/countries/{slug(n)}/', f'Archery Events in {tn} {yr}', f'Archery events in {tn}', f'in {tn}', evs,
        [('Home', '/'), ('Countries', '/countries/'), (n, None)], extra_intro=extra, desc_hint='Federation and club tournaments with entry links.')
for c in sorted(COUNTRY_SET, key=lambda c: CTRY[c]['name']):
    if 'countries' not in GROUPS: break
    if args.sample and c != SAMPLE_COUNTRY: continue
    k, h, lm, _ = country_page(c); add(k, h, lm, 'country')
if not args.sample and 'countries' in GROUPS:
    items = [(CTRY[c]['name'], f'/countries/{slug(CTRY[c]["name"])}/', upn([x for x in EVS if country_of(x) == c])) for c in sorted(COUNTRY_SET, key=lambda c: CTRY[c]['name'])]
    body = crumbs_html([('Home', '/'), ('Countries', None)]) + '<section class="panel seo-intro"><p>Archery events outside Australia, listed by country: federation, club and world-level tournaments with dates, venues and entry links. For Australia see <a href="/australia/">archery events in Australia</a>.</p></section>' + chip_links(items, 'Countries')
    add('/countries/', shell('Archery events by country: USA, Denmark, New Zealand, Canada and more | ' + BRAND, f'Archery events in {len(items)} countries, including the USA, Denmark, New Zealand, Canada and Great Britain. Dates, venues and entry links.', '/countries/', 'Archery events by country', body, [crumbs_ld([('Home', '/'), ('Countries', None)])]), DATA_DATE, 'country-index')

# ---------- llms.txt ----------
def llms():
    up_au = upn(AUS_EV); up_all = upn(EVS)
    L = [f'# {BRAND}', '',
         f'> {BRAND} (archerycalendars.com) is a free calendar of archery events and competitions: field, 3D, target and indoor. It covers Australia (Archery Australia, the Australian Bowhunters Association (ABA), Archery WA, the state archery associations and club shoots in every state and territory) plus the USA, Denmark, New Zealand, Canada, Great Britain and many other countries, and world events such as the World Cup and World Championships. Made by an archer, for archers.', '',
         f'Currently {up_all} upcoming events are listed ({up_au} in Australia). Data updated {DATA_DATE}.', '',
         "Each event shows its dates, venue, discipline and organiser, with a link to the organiser's entry page and flyer. Event details come from organisers' public calendars, flyers and club submissions. Always confirm dates and entry details with the organiser. The site does not publish archers' personal contact details or scores in these pages.", '',
         '## Main pages', '',
         f'- [{BRAND}]({SITE}/): the calendar app. Search and filter events by country, state, discipline and organiser, save events, get reminders before entries close, find clubs near you, and score rounds with ScoreTool.']
    if 'hubs' in GROUPS:
        L.append(f'- [Archery events in Australia]({SITE}/australia/): all Australian events, by state, discipline and organiser')
        for c, n in STATES:
            if c in STATE_SET: L.append(f'- [Archery events in {n}]({SITE}/australia/{slug(n)}/)')
        for dk, dn in DISC: L.append(f'- [{dn} archery events in Australia]({SITE}/australia/{dk}/)')
        for o in sorted(ORG_PAGES): L.append(f'- [{ORG[o]["name"]} events]({SITE}/organisers/{o}/)')
    if 'countries' in GROUPS:
        L.append(f'- [Archery events by country]({SITE}/countries/): events outside Australia')
        for c in ('USA', 'DEN', 'NZL', 'CAN', 'GBR'):
            if c in COUNTRY_SET: L.append(f'- [Archery events in {("the " if CTRY[c]["name"] in ("United States", "United Arab Emirates", "Netherlands") else "") + CTRY[c]["name"]}]({SITE}/countries/{slug(CTRY[c]["name"])}/)')
    L += [f'- [Newsletter]({SITE}/newsletter/): event news and results round-ups',
          f'- [Hobart nationals wrap-up]({SITE}/newsletter/hobart-nationals-2026/): the 2026 National Target and Para Championships in Hobart',
          f'- [Yankton world championships wrap-up]({SITE}/newsletter/yankton-world-championships-2026/): World Archery Field and 3D Championships 2026, Yankton, South Dakota', '',
          '## Notes for AI and search tools', '']
    if 'events' in GROUPS:
        L.append(f'- Each event has its own page at {SITE}/events/<id>/ with dates, venue town, discipline, organiser, entry and flyer links, and schema.org Event data where the dates and venue are confirmed.')
    L += ['- The calendar itself is a JavaScript app; the pages listed above are plain HTML built from the same data every time it changes.',
          '- Event times are local to the venue. Where dates are not yet confirmed the page says so.',
          '- Clubs and organisers can add or correct an event with "Submit an event" in the app, or send their whole calendar in any format (PDF, photo, spreadsheet, Word file, link or text).', '']
    return '\n'.join(L)
pages['/llms.txt'] = (llms(), DATA_DATE)

# ---------- sitemap (keep hand-made entries, add generated pages) ----------
kept = []
sm_path = os.path.join(ROOT, 'sitemap.xml')
if os.path.exists(sm_path):
    for m in re.finditer(r'<url>.*?</url>', open(sm_path, encoding='utf-8').read(), re.S):
        loc = re.search(r'<loc>(.*?)</loc>', m.group(0)).group(1)
        if not any(loc.startswith(f'{SITE}/{d}/') for d in GEN_DIRS): kept.append(m.group(0))
entries = []
def freq(p): return 'daily' if p in ('/australia/', '/countries/') else 'weekly' if p.count('/') <= 3 else 'monthly'
for p, (h, lm) in sorted(pages.items()):
    if p == '/llms.txt' or 'name="robots" content="noindex' in h: continue
    entries.append(f'  <url><loc>{SITE}{p}</loc><lastmod>{lm}</lastmod><changefreq>{freq(p)}</changefreq></url>')
sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + '\n'.join(['  ' + k.strip() for k in kept] + entries) + '\n</urlset>\n'

# ---------- write ----------
def write(path, txt):
    full = os.path.join(OUT, path.lstrip('/'))
    if path.endswith('/'): full = os.path.join(full, 'index.html')
    os.makedirs(os.path.dirname(full), exist_ok=True); open(full, 'w', encoding='utf-8').write(txt)
if args.check:
    stale = []
    for p, (h, _) in pages.items():
        full = os.path.join(ROOT, p.lstrip('/')) if not p.endswith('/') else os.path.join(ROOT, p.lstrip('/'), 'index.html')
        if not os.path.exists(full) or open(full, encoding='utf-8').read() != h: stale.append(p)
    if open(sm_path, encoding='utf-8').read() != sitemap: stale.append('/sitemap.xml')
    print('stale:', len(stale), stale[:5]); sys.exit(1 if stale else 0)
for d in GEN_DIRS:
    if not args.sample and os.path.isdir(os.path.join(OUT, d)): shutil.rmtree(os.path.join(OUT, d))
for p, (h, _) in pages.items(): write(p, h)
open(os.path.join(OUT, 'sitemap.xml' if not args.sample else 'sitemap.sample.xml'), 'w', encoding='utf-8').write(sitemap)
print('pages', len(pages), dict(counts), 'sitemap urls', len(entries) + len(kept))
