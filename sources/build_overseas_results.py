import json,re,sys,datetime,difflib,concurrent.futures as cf
sys.path.insert(0,'/workspace/archery-calendar/sources'); sys.path.insert(0,'/tmp')
import importlib.util
spec=importlib.util.spec_from_file_location('br','/workspace/archery-calendar/sources/build_results.py')
src=open('/workspace/archery-calendar/sources/build_results.py').read().split('NF = ')[0]
ns={}; exec(src,ns); ianseo=ns['ianseo']
from be import J,tot
TODAY=datetime.date.today().isoformat()
D=json.load(open('/workspace/archery-calendar/data/results.json')); R=D['results']
rem={x['id']:x for x in json.load(open('/tmp/rem.json'))}
# ianseo
for eid,inf in json.load(open('/tmp/ianinfo.json')).items():
  tid=inf['tid']; yr=[l for l in inf['links'] if '/TourData/' in l]; base=f'https://www.ianseo.net/Details.php?toId={tid}'
  ic=[l for l in inf['links'] if l.endswith('/IC.php')]
  if ic:
    try:
      r=ianseo('https://www.ianseo.net'+ic[0],'Results by class & division')
      if r['groups']: R[eid]=r; continue
    except Exception as e: print('ianseo err',eid,e)
  if any(re.search(r'/(I[A-Z0-9]+\.php|Gesamt[^/]*\.pdf)$',l) for l in inf['links']):
    R[eid]={'kind':'link','title':'Official results','source_name':'ianseo','source_url':base}
# BetweenEnds
def berank(tid, top=10):
  t=J(f'https://resultsapi.herokuapp.com/tournaments/{tid}'); groups=[]
  rk=[e for e in t.get('events',[]) if e['event_type']=='RankingEvent']
  for ev in rk:
    e=J(f"https://resultsapi.herokuapp.com/events/{ev['id']}"); sc=J(f"https://resultsapi.herokuapp.com/events/{ev['id']}/scores").get('ars',{})
    for cg in e.get('cgs',[]):
      rows=[]
      for a in cg['ars']:
        p=e['rps'].get(str(a['aid'])); s=sc.get(str(a['aid']))
        if p and s and tot(s)>0: rows.append({'name':f"{p['fnm']} {p['lnm']}".strip(),'club':p.get('tm',''),'score':tot(s)})
      rows.sort(key=lambda r:-r['score']); prev=None
      for i,r in enumerate(rows):
        r['place']=str(i+1) if r['score']!=prev else rows[i-1]['place']; prev=r['score']; r['score']=str(r['score'])
      if rows: groups.append({'division':(ev['event_name']+' – ' if len(rk)>1 else '')+cg['nm'],'rows':rows[:top]})
  return t,groups
bm=json.load(open('/tmp/bematch.json'))
B={t['id']:t for t in json.load(open('/tmp/bet.json'))}
SN='alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming itaa tsaa sam'.split()
def st(s): return set(w for w in SN if re.search(r'\b'+w+r'\b',s.lower()))
pick={}
for eid,tid in bm.items():
  x=rem[eid]; t=B[tid]; r=difflib.SequenceMatcher(None,x['name'].lower(),t['tournament_name'].lower()).ratio()
  if st(x['name'])!=st(t['tournament_name']) or ('joad' in x['name'].lower())!=('joad' in t['tournament_name'].lower()) or 'Indoor Nationals' in x['name']: continue
  pick[eid]=tid
IN={'AZ':(3196,3197),'WA':(3230,3231),'CV':(3229,3232),'KY':(3276,3277),'FL':(3284,3285),'TX':(3286,3287),'UT':(3324,3325),'SD':(3326,3327),'NJ':(3288,3289),'PA':(3364,3365),'MA':(3376,3367),'MN':(3370,3371),'IL':(3372,3373)}
for eid,x in rem.items():
  m=re.match(r'^([A-Z]{2}) [–-] 57th',x['name']) or re.search(r'JOAD Indoor Nationals – ([A-Z]{2})$',x['name'])
  if not m: continue
  j='JOAD' in x['name']; c=m.group(1)
  if c in IN: pick[eid]=IN[c][1 if j else 0]
  else: R[eid]={'kind':'link','title':'Combined national results (all locations)','source_name':'BetweenEnds (USA Archery)','source_url':f"https://www.betweenends.com/tournament/{3332 if j else 3331}"}
def go(item):
  eid,tid=item
  try: return eid,tid,berank(tid)
  except Exception as e: return eid,tid,(None,str(e))
with cf.ThreadPoolExecutor(8) as ex: res=list(ex.map(go,pick.items()))
for eid,tid,(t,g) in res:
  url=f'https://www.betweenends.com/tournament/{tid}'
  if t and g: R[eid]={'kind':'full','title':'Ranking round – top 10 per division','note':'Totals added up from the arrow-by-arrow scores BetweenEnds publishes; ties share a place. Matchplay finals and full lists are on BetweenEnds.','source_name':'BetweenEnds (USA Archery results)','source_url':url,'groups':g}
  elif t: R[eid]={'kind':'link','title':'Official results','source_name':'BetweenEnds (USA Archery results)','source_url':url}
  else: print('be err',eid,g)
for v in R.values(): v.setdefault('checked',TODAY)
json.dump(D,open('/workspace/archery-calendar/data/results.json','w'),indent=1,ensure_ascii=False)
