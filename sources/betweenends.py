import json,urllib.request
def J(u): return json.load(urllib.request.urlopen(u,timeout=60))
V={'T':10,'X':10,'M':0}
def tot(s): return sum(V.get(c,int(c) if c.isdigit() else 0) for c in (s or ''))
def be(tid, top=10):
  t=J(f'https://resultsapi.herokuapp.com/tournaments/{tid}')
  groups=[]; mono=True
  for ev in t.get('events',[]):
    if ev['event_type']!='RankingEvent': continue
    e=J(f"https://resultsapi.herokuapp.com/events/{ev['id']}"); sc=J(f"https://resultsapi.herokuapp.com/events/{ev['id']}/scores").get('ars',{})
    multi=sum(1 for x in t['events'] if x['event_type']=='RankingEvent')>1
    for cg in e.get('cgs',[]):
      rows=[]
      for i,a in enumerate(cg['ars']):
        p=e['rps'].get(str(a['aid']));s=sc.get(str(a['aid']))
        if not p or not s: continue
        rows.append({'place':str(len(rows)+1),'name':f"{p['fnm']} {p['lnm']}".strip(),'club':p.get('tm',''),'score':str(tot(s))})
      rows=[r for r in rows if int(r['score'])>0]
      if any(int(rows[i]['score'])<int(rows[i+1]['score']) for i in range(len(rows)-1)): mono=False
      if rows: groups.append({'division':(ev['event_name']+' – ' if multi else '')+cg['nm'],'rows':rows[:top],'n':len(rows)})
  return t,groups,mono
if __name__=='__main__':
  t,g,m=be(3196); print(t['tournament_name'],len(g),m,g[0])
