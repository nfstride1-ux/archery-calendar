#!/usr/bin/env python3
"""Builds data/results.json from published official results only (never invented).
Sources: ianseo.net result pages, World Archery public results API (medal matches),
NFAA published results PDFs (link only)."""
import json, re, html, urllib.request, datetime
UA = {'User-Agent': 'Mozilla/5.0 (archerycalendars.com results)'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read().decode('utf-8', 'ignore')
def txt(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

def ianseo(url, title):
    h = get(url); groups = []
    for blk in re.split(r'<thead>', h)[1:]:
        m = re.search(r'<th colspan="20"[^>]*>([^<]+)</th>', blk)
        if not m or 'Result List' in m.group(1): continue
        div = re.sub(r'\s*\[.*?\]', '', html.unescape(m.group(1))).strip()
        rows = []
        for tr in re.findall(r'<tr class="compressed-group[^"]*">(.*?)</tr>', blk, re.S):
            tds = re.findall(r'<td([^>]*)>(.*?)</td>', tr, re.S)
            if len(tds) < 4: continue
            tot = next((txt(v) for a, v in tds[3:] if re.search(r'class="text-right\s*(rank-division-break\s*)?"', a)), '')
            rows.append({'place': txt(tds[0][1]), 'name': txt(tds[1][1]), 'club': re.sub(r'^[A-Z]+ - ', '', txt(tds[2][1])), 'score': tot})
        if rows: groups.append({'division': div, 'rows': rows})
    return {'kind': 'full', 'title': title, 'source_name': 'ianseo (official results)', 'source_url': url, 'groups': groups}

def wa_medals(cid):
    d = json.loads(get(f'https://api.worldarchery.sport/v3/INDIVIDUALMATCHES/?CompId={cid}&RBP=500'))
    cats = {c['Id']: c['Name'] for c in json.loads(get(f'https://api.worldarchery.sport/v3/CATEGORIES/?CompId={cid}&RBP=100'))['items']} if False else {}
    catn = {c['Code']: c['Name'] for c in json.loads(get(f'https://api.worldarchery.sport/v3/CATEGORIES/?CompId={cid}&RBP=100'))['items']}
    groups = []
    for c in d['items']:
        rows = []
        for ph, places in ((0, ('1', '2')), (1, ('3', '4'))):
            m = next((x for x in c['Matches'] if x['Phase'] == ph), None)
            if not m: continue
            a, b = m['Competitor1'], m['Competitor2']
            w, l = (a, b) if a.get('WinLose') else (b, a)
            for p, x in zip(places, (w, l)):
                at = x.get('Athlete') or {}
                if at: rows.append({'place': p, 'name': f"{at.get('GName','')} {at.get('FName','').upper()}".strip(), 'club': at.get('NOC', ''), 'score': str(x.get('Score', ''))})
        if rows: groups.append({'division': catn.get(c['Code'], c['Code']), 'rows': rows})
    return {'kind': 'full', 'title': 'Medal matches (finals)', 'note': 'Top 4 from the gold and bronze medal matches. Full rankings on World Archery.', 'source_name': 'World Archery', 'source_url': f'https://www.worldarchery.sport/competition/{cid}', 'groups': groups}

def link(url, name, title='Official results'):
    return {'kind': 'link', 'title': title, 'source_name': name, 'source_url': url}

NF = 'https://nfaausa.com/files/'
R = {
  'aa-2026-2': ianseo('https://www.ianseo.net/TourData/2026/27859/IC.php', 'Final results by class & division'),
  'aa-2026-1': ianseo('https://www.ianseo.net/TourData/2026/27167/IC.php', '720 qualification by class & division'),
  'wa-29775': wa_medals(29775), 'wa-29776': wa_medals(29776),
  'nfaa-indoor-2026': link(NF + 'indoor-nationals-2026-180326225051.pdf', 'NFAA (PDF)'),
  'nfaa-btb-3d-2026': link(NF + 'btb-amp-nfaa-1-arrow-3d-nationals-2026-070526201953.pdf', 'NFAA (PDF)'),
  'redding-2026': link(NF + 'marked-3d-2026-050526212456.pdf', 'NFAA (PDF)', 'NFAA Marked 3D Nationals results'),
  'nfaa-field-2026': link(NF + 'field-nationals-2026-310726195433.pdf', 'NFAA (PDF)'),
  'nfaa-fdc-2026': link(NF + 'first-dakota-classic-2026-010926203350.pdf', 'NFAA (PDF)'),
  'nfaa-target-2026': link(NF + 'outdoor-target-nationals-2026-010926220750.pdf', 'NFAA (PDF)'),
  'wa-29965': link(NF + 'the-vegas-shoot-2026-150426164548.pdf', 'NFAA (PDF)'),
}
for k, v in R.items(): v['checked'] = datetime.date.today().isoformat()
json.dump({'note': 'Official published results only. Each entry links to its source.', 'results': R}, open('data/results.json', 'w'), indent=1, ensure_ascii=False)
for k, v in R.items(): print(k, v['kind'], sum(len(g['rows']) for g in v.get('groups', [])), len(v.get('groups', [])))
