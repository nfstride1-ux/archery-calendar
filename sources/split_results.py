#!/usr/bin/env python3
"""Moves each event's score tables into data/results/<id>.json so data/results.json stays a small index."""
import json, os, re
D = json.load(open('data/results.json')); os.makedirs('data/results', exist_ok=True)
for k, v in D['results'].items():
    g = v.pop('groups', None)
    if g is None: continue
    v['n'] = sum(len(x['rows']) for x in g); v['ng'] = len(g); v['split'] = True
    json.dump({'groups': g}, open(f'data/results/{re.sub(r"[^A-Za-z0-9_.-]", "_", k)}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(D, open('data/results.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(os.path.getsize('data/results.json'), len(os.listdir('data/results')))
