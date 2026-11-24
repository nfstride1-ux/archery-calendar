#!/usr/bin/env python3
"""Auto-fetches World Archery medal-match results for wa-<CompId> events already on the
calendar (data/events.json, data/intl.json), once they're over, and adds them to
data/results.json + data/results/<id>.json — same format sources/build_results.py and
sources/split_results.py produce by hand.

Only touches events whose id matches wa-<CompId> (so the World Archery competition id
is exact, never guessed) and whose end date has passed. An event with no medal matches
recorded in World Archery's system yet is skipped, not stubbed, so it's checked again
next run. Never invents data: a competition is only added once the API returns real rows.

Run by .github/workflows/refresh-events.yml, daily.
"""
import datetime
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = {'User-Agent': 'ArcheryCalendars/1.0 (scheduled results refresh; contact nfshold@gmail.com)'}
WA_ID = re.compile(r'^wa-(\d+)$')


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode('utf-8', 'ignore')


def wa_medals(cid):
    """Top 4 (gold + bronze medal matches) per category, straight from World Archery's API."""
    try:
        matches = json.loads(get(f'https://api.worldarchery.sport/v3/INDIVIDUALMATCHES/?CompId={cid}&RBP=500'))['items']
        cats = json.loads(get(f'https://api.worldarchery.sport/v3/CATEGORIES/?CompId={cid}&RBP=100'))['items']
    except Exception:
        return None
    catn = {c['Code']: c['Name'] for c in cats}
    groups = []
    for c in matches:
        rows = []
        for ph, places in ((0, ('1', '2')), (1, ('3', '4'))):
            m = next((x for x in c['Matches'] if x['Phase'] == ph), None)
            if not m:
                continue
            a, b = m['Competitor1'], m['Competitor2']
            w, l = (a, b) if a.get('WinLose') else (b, a)
            for p, x in zip(places, (w, l)):
                at = x.get('Athlete') or {}
                if at:
                    rows.append({
                        'place': p,
                        'name': f"{at.get('GName', '')} {at.get('FName', '').upper()}".strip(),
                        'club': at.get('NOC', ''),
                        'score': str(x.get('Score', '')),
                    })
        if rows:
            groups.append({'division': catn.get(c['Code'], c['Code']), 'rows': rows})
    return groups


def past_wa_events(today):
    """wa-<CompId> events already on the calendar whose end date has passed."""
    found = {}
    for name in ('events.json', 'intl.json'):
        path = ROOT / 'data' / name
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding='utf-8'))
        for ev in doc.get('events') or []:
            m = WA_ID.match(str(ev.get('id') or ''))
            if not m:
                continue
            end = ev.get('end_date') or ev.get('start_date')
            if not end or end >= today:
                continue
            cid = m.group(1)
            url = ev.get('source_url') or f'https://www.worldarchery.sport/competition/{cid}'
            found[ev['id']] = (cid, url)
    return found


def main():
    today = datetime.date.today().isoformat()
    results_path = ROOT / 'data' / 'results.json'
    results_dir = ROOT / 'data' / 'results'
    results_dir.mkdir(exist_ok=True)

    index = json.loads(results_path.read_text(encoding='utf-8'))
    todo = {eid: v for eid, v in past_wa_events(today).items() if eid not in index['results']}
    if not todo:
        print('fetch-wa-results: no past World Archery events without a results entry')
        return
    print(f'fetch-wa-results: checking {len(todo)} past World Archery events for medal results')

    with ThreadPoolExecutor(max_workers=8) as pool:
        groups_list = list(pool.map(lambda kv: wa_medals(kv[1][0]), todo.items()))

    added = 0
    for (eid, (cid, url)), groups in zip(todo.items(), groups_list):
        if not groups:
            continue
        index['results'][eid] = {
            'kind': 'full',
            'title': 'Medal matches (finals)',
            'note': 'Top 4 from the gold and bronze medal matches. Full rankings on World Archery.',
            'source_name': 'World Archery',
            'source_url': url,
            'checked': today,
            'n': sum(len(g['rows']) for g in groups),
            'ng': len(groups),
            'split': True,
        }
        (results_dir / f'{eid}.json').write_text(
            json.dumps({'groups': groups}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        added += 1

    print(f'fetch-wa-results: added results for {added} of {len(todo)} events checked')
    if added:
        results_path.write_text(
            json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    main()
