"""Item 7: add British events from NFAS, Essex & Suffolk (ECAA) and Yorkshire (YAA) to data/intl.json as separate orgs.
Real data only, read from each org's public calendar page (source_url on every event). Dedupes against the events
already listed for Great Britain (Archery GB / World Archery): same date (within 1 day) plus a shared club/name word.
HL Tournament Diary is NOT used: its terms (hl-outdoors.co.uk/terms, Oct 2026) forbid copying or republishing its listings
without written permission. Re-runnable: it replaces this script's own events each time. Run build_seo.py afterwards."""
import re, html, json, datetime, urllib.request, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); P = os.path.join(ROOT, 'data', 'intl.json')
TODAY = datetime.date.today().isoformat(); CHK = datetime.date.today().strftime('%-d %b %Y')
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (ArcheryCalendars)'}), timeout=40).read().decode('utf-8', 'ignore')
T = lambda x: re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', x))).strip()
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]
ORGS = [
 {"id": "nfas", "name": "National Field Archery Society (NFAS)", "website": "https://nfas.net/", "events_url": "https://nfas.net/clubs/shoot-dates", "country_code": "GBR"},
 {"id": "ecaa", "name": "Essex & Suffolk County Archery Association (ECAA)", "website": "https://ecaa.org.uk/", "events_url": "https://ecaa.org.uk/2026-events-in-essex-suffolk", "country_code": "GBR"},
 {"id": "yaa", "name": "Yorkshire Archery Association (YAA)", "website": "https://www.yorkshirearchery.co.uk/", "events_url": "https://www.yorkshirearchery.co.uk/upcoming.html", "country_code": "GBR"}]
ON = {o['id']: o['name'] for o in ORGS}
def ev(org, name, sd, ed, loc, disc, src, notes, reg=None, conf=True, cat='competition', level=None):
    return {"id": f"{org}-{sd}-{slug(name)}", "name": name, "org_id": org, "org": ON[org], "country_code": "GBR", "country": "Great Britain",
            "start_date": sd, "end_date": ed or sd, "dates_confirmed": conf, "location": loc, "discipline": disc, "level": level or ON[org].split(' (')[0] + ' calendar',
            "registration_url": reg, "notes": notes, "source_url": src, "source_name": ON[org], "world_level": False, "category": cat, "org_status": "no_details",
            "tz": "Europe/London", "country_name": "Great Britain", "iso2": "GB", "last_checked": TODAY,
            "status": "completed" if (ed or sd) < TODAY else "scheduled"}

def nfas():
    src = ORGS[0]['events_url']; h = get(src); cl = get('https://nfas.net/clubs'); out = []
    venue = {m[0]: T(m[1]) for m in re.findall(r'<tr id="(club-\d+)">.*?<p>Venue: (.*?)</p>', cl)}
    for a, d, c, ds in re.findall(r'<td class="shoots__date"([^>]*)>(.*?)</td>\s*<td class="shoots__club"[^>]*>(.*?)</td>\s*<td class="shoots__desc"[^>]*>(.*?)</td>', h, re.S):
        sd = re.search(r'data-date="(\d{4}-\d\d-\d\d)"', a).group(1); dd = T(d)
        m = re.search(r'(\d+)\s*to\s*(\d+)', dd); ed = sd[:8] + '%02d' % int(m.group(2)) if m and int(m.group(2)) > int(sd[8:]) else sd
        club = re.sub(r'^NEW\s+', '', T(c)); desc = T(ds); cid = re.search(r'#(club-\d+)', c)
        if re.search(r'(?i)general meeting|\bAGM\b', club + ' ' + desc): continue
        x = ev('nfas', f"{club.title() if club.isupper() else club} – NFAS shoot" if not club.isupper() else f"NFAS {club.title()}", sd, ed,
               venue.get(cid.group(1)) if cid else None, 'Field / 3D (NFAS)', src, f"From the NFAS Shoot Dates list (checked {CHK}): {desc}"[:600], level='NFAS shoot')
        if re.search(r'(?i)\bcancell?ed\b', desc): x['status'] = 'cancelled'; x['cancelled'] = True
        out.append(x)
    return out

def ecaa():
    src = ORGS[1]['events_url']; h = get(src); out = []
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', h, re.S):
        c = [T(x) for x in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
        if len(c) < 7: continue
        ds = re.findall(r'(\d{1,2})/(\d{2})/(\d{2,4})', c[1]); name, rnd, rec, where = c[2], c[3], c[4], c[5]
        if not ds or not where or where.lower() == 'online': continue           # placeholders, meetings and national events carry no venue
        if re.search(r'(?i)\b(AGM|council meeting|national tour|national indoor)\b', name): continue
        iso = lambda t: f"{t[2] if len(t[2]) == 4 else '20' + t[2]}-{t[1]}-{int(t[0]):02d}"
        sd, ed = iso(ds[0]), iso(ds[-1])
        if sd < '2026-10-01': continue                                          # 30/05/2026 sits among the 2027 rows: a likely typo, left out rather than guessed
        reg = (re.findall(r'href="([^"]+)"', r) or [None])[0]
        sem = 'Coaching Session' in name
        disc = 'Indoor' if re.search(r'WA18|Portsmouth|Worcester|Indoor', name + rnd) else 'Field' if 'Field' in name else 'Target (outdoor)'
        x = ev('ecaa', name if not name.startswith('Rayleigh Town Archery Club') or not rnd else f"{name} – {rnd}", sd, ed, where, disc, src,
               '; '.join(filter(None, [rnd and f"Round: {rnd}", rec and f"Status: {rec}", f"From the ECAA county calendar (checked {CHK})."])), reg,
               cat='seminar' if sem else 'competition', level='Coaching / development day' if sem else None)
        if reg: x['registration_url_kind'] = 'entry'
        out.append(x)
    return out

def yaa():
    src = ORGS[2]['events_url']; h = get(src); out = []
    MO = {m: i for i, m in enumerate('january february march april may june july august september october november december'.split(), 1)}
    for s in re.findall(r'<div class=story>(.*?)</div>', h, re.S):
        nm = re.search(r'<h3>.*?id="([^"]+)"[^>]*>(.*?)</a>', s, re.S); dt = T(re.search(r'<h4>(.*?)</h4>', s, re.S).group(1))
        days = [int(x) for x in re.findall(r'(\d{1,2})(?:st|nd|rd|th)', dt)]; my = re.search(r'([A-Za-z]+) (\d{4})$', dt)
        if not days or not my: continue                                         # month-only postal league rounds are not shoots at a venue
        mo, yr = MO[my.group(1).lower()], my.group(2); body = T(s)
        v = re.search(r'To be held at (.*?)(?:,? which |\.\s|\.$)', body); loc = v.group(1) if v else None
        reg = next((u for u in re.findall(r'href="([^"]+)"', s) if not u.startswith('./') or u.endswith('.pdf')), None)
        if reg and reg.startswith('./'): reg = 'https://www.yorkshirearchery.co.uk/' + reg[2:]
        out.append(ev('yaa', T(nm.group(2)), f"{yr}-{mo:02d}-{days[0]:02d}", f"{yr}-{mo:02d}-{days[-1]:02d}", loc,
                      'Indoor' if re.search(r'(?i)indoor|WA18|Portsmouth|Worcester|Vegas', body) else 'Target (outdoor)', src + '#' + nm.group(1),
                      f"From the YAA upcoming tournaments page (checked {CHK}). " + re.sub(r'\s*Entry form.*$', '', body.split(dt, 1)[-1]).strip()[:400], reg))
    # The YAA's own championships for 2027 from its county calendar (dates set by formula; the YAA says to confirm with the organiser)
    cal = 'https://www.yorkshirearchery.co.uk/calendar.html'; ch = get(cal)
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', ch, re.S):
        c = [T(x) for x in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
        if len(c) < 6 or c[0] != 'YAA' or c[1].startswith('AGM') or not re.match(r'\d', c[5]): continue
        mon = None
        for prev in re.findall(r'<th class="calendarHead1" colspan="6">\s*([A-Z]+)', ch[:ch.find(r)]): mon = prev
        if not mon: continue
        dd = [int(x) for x in re.findall(r'\d+', c[5])]; mo = MO[mon.lower()]
        nm = re.sub(r'\s*\d{4} (Metric |AGB |junior |senior )?results.*$', '', c[1]).strip(); host = re.search(r'Hosted by (.*?)(?: \d{4}|$)', nm)
        nm = re.sub(r'\s*Hosted by.*$', '', nm); nm = nm if nm.startswith('YAA') else 'YAA ' + nm[0].upper() + nm[1:]
        out.append(ev('yaa', nm + ' 2027', f"2027-{mo:02d}-{dd[0]:02d}", f"2027-{mo:02d}-{dd[-1]:02d}", host.group(1) if host else 'Yorkshire (venue to be confirmed)',
                      'Indoor' if 'Indoor' in nm else 'Clout' if 'Clout' in nm else 'Target (outdoor)', cal,
                      f"From the YAA county calendar (checked {CHK}): {c[3] or 'date set by the YAA'}; {c[2] or ''}. The YAA says calendar dates can change, so confirm with the organiser.".replace('; .', '.'), conf=False, level='YAA championship'))
    return out

STOP = set('archers archery club bowmen open shoot the and of a wa18 wa indoor outdoor 2026 2027 championships championship tournament competition county series double day session coaching sessions regional national nfas shoot memorial south north east west yaa ecaa nfas wrs ukrs'.split())
def words(x): return {w for w in re.findall(r'[a-z]{4,}', x.get('name', '').lower()) if w not in STOP}
def near(a, b): return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days) <= 1

d = json.load(open(P)); mine = {o['id'] for o in ORGS}
d['events'] = [e for e in d['events'] if e['org_id'] not in mine]
gb = [e for e in d['events'] if e['country_code'] == 'GBR']
new, dup = [], []
for x in nfas() + ecaa() + yaa():
    m = next((e for e in gb + new if near(e['start_date'], x['start_date']) and words(e) & words(x)), None)
    (dup if m else new).append((x, m) if m else x)
seen = set(); new = [x for x in new if not (x['id'] in seen or seen.add(x['id']))]
d['orgs'] = [o for o in d['orgs'] if o['id'] not in mine] + ORGS
d['events'] += new; d['count'] = len(d['events'])
for c in d['countries']:
    if c['code'] == 'GBR':
        g = [e for e in d['events'] if e['country_code'] == 'GBR']; c['count'] = len(g); c['upcoming'] = sum(e['status'] == 'scheduled' for e in g)
json.dump(d, open(P, 'w'), ensure_ascii=False, separators=(',', ':'))
print('added', len(new), {o: sum(x['org_id'] == o for x in new) for o in mine})
for x, m in dup: print('  dup skipped:', x['start_date'], x['name'], '==', m['name'], f"({m['org']})")
