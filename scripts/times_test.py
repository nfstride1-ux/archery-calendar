# Event times block + sign-in countdown (Nathe 23 Oct 2026: "Show register time and other times noted").
# 390px phone, light and dark device setting, clock frozen at Fri 23 Oct 2026 2:04 pm Perth; also a Sydney viewer.
import subprocess,sys,time,os,re,json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));SH=os.path.join(ROOT,'shots-times');os.makedirs(SH,exist_ok=True)
PORT='8820';ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,flush=True)
EVS={x['id']:x for x in json.load(open(os.path.join(ROOT,'data/events.json')))['events']}
PEEL=EVS['aba-2026-097']['start_times'];BM=EVS['benchmark-classic-2026']['start_times']
NOW='2026-10-23T14:04:00+08:00'
srv=subprocess.Popen([sys.executable,'-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
NOPURPLE="[...document.querySelectorAll('#evTimes, #evTimes *')].every(e=>{const s=getComputedStyle(e);return ![s.color,s.backgroundColor,s.borderLeftColor].some(c=>{const m=c.match(/\\d+/g);if(!m)return false;const[r,g,b]=m.map(Number);return b>150&&r>100&&g<100;});})"
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  def page(scheme,tz):
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme=scheme,timezone_id=tz);errs=[]
    ctx.route('https://*.supabase.co/**',lambda r:r.abort())
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)));pg.clock.install(time=NOW)
    return ctx,pg,errs
  for scheme in ['light','dark']:
    t=f'[{scheme}] ';ctx,pg,errs=page(scheme,'Australia/Perth');E=pg.evaluate
    pg.goto(f'http://localhost:{PORT}/#/shoot/aba-2026-097');pg.wait_for_timeout(2500)
    box=pg.locator('#evTimes')
    chk(t+'Peel: Times block shown',box.count()==1 and box.is_visible())
    y=lambda s:E(f"document.querySelector('{s}').getBoundingClientRect().top")
    chk(t+'Peel: Times block below the hero chips and above the Entries box',y('.dhero .badges')<y('#evTimes')<y('.side .act'))
    chk(t+'Peel: full width on the phone',abs(E("document.querySelector('#evTimes').getBoundingClientRect().width")-E("document.querySelector('.side .act').getBoundingClientRect().width"))<2)
    heads=pg.locator('#evTimes .tm-day h3').all_inner_texts()
    chk(t+'Peel: one group per day (Sat 24, Sun 25)',len(heads)==2 and '24' in heads[0] and '25' in heads[1] and heads[0].lower().startswith('sat'))
    days=E("[...document.querySelectorAll('#evTimes .tm-day')].map(d=>[...d.querySelectorAll('li')].map(l=>[l.className,l.textContent,!!l.querySelector('b')]))")
    chk(t+'Peel: sign-in first and bold on each day',all(d[0][0]=='tm-signin' and d[0][2] and d[0][1].startswith('sign-in') for d in days))
    chk(t+'Peel: every line is the organiser\'s text verbatim',all(l[1] in PEEL for d in days for l in d) and sum(len(d) for d in days)==9)
    chk(t+'Peel: order sign-in, practice, muster, start (, finish)',[l[0] for l in days[0]]==['tm-signin','tm-practice','tm-muster','tm-start'] and [l[0] for l in days[1]][-1]=='tm-finish')
    chk(t+'Peel: no zone note for a Perth viewer',pg.locator('#evTimes .tm-tz').count()==0)
    cd=pg.locator('.dhero .b.cd').first.inner_text()
    chk(t+f'Peel: countdown says Sign-in in 19h 55m ({cd})',bool(re.search(r'Sign-in in 19h 5[56]m',cd)))
    chk(t+'Peel: countdown target = Sat 24 Oct 10:00 am Perth (02:00 UTC)',E("+document.querySelector('.dhero .b.cd').dataset.cdt.split('~')[0]")==E("Date.UTC(2026,9,24,2,0)"))
    chk(t+'Peel: countdown tooltip names sign-in and Perth time',re.search(r'sign-in: .*10:00.*Perth time',pg.locator('.dhero .b.cd').first.get_attribute('title') or '',re.I) is not None)
    chk(t+'Peel: Event details still lists the full times',PEEL in pg.locator('.kv').first.inner_text())
    chk(t+'no purple in the Times block',E(NOPURPLE))
    pg.screenshot(path=f'{SH}/01-peel-{scheme}.png')
    box.screenshot(path=f'{SH}/01b-peel-times-{scheme}.png')
    pg.goto(f'http://localhost:{PORT}/#/shoot/benchmark-classic-2026');pg.wait_for_timeout(1500)
    heads=pg.locator('#evTimes .tm-day h3').all_inner_texts()
    chk(t+'Benchmark: Fri 23 (pre-day), Sat 24, Sun 25 groups',len(heads)==3 and heads[0].lower().startswith('fri') and '23' in heads[0])
    days=E("[...document.querySelectorAll('#evTimes .tm-day')].map(d=>[...d.querySelectorAll('li')].map(l=>[l.className,l.textContent]))")
    chk(t+'Benchmark: sign-on first on Fri and Sat',days[0][0][0]=='tm-signin' and 'sign-on' in days[0][0][1] and days[1][0][0]=='tm-signin')
    chk(t+'Benchmark: lines verbatim',all(l[1] in BM for d in days for l in d))
    chk(t+'Benchmark: zone note (Sydney/Canberra time) for a Perth viewer','Sydney/Canberra time' in pg.locator('#evTimes .tm-tz').inner_text())
    chk(t+'Benchmark: countdown target Fri 23 Oct 6:00 pm Sydney (07:00 UTC), then Sat sign-on',E("cdTargets(BYID['benchmark-classic-2026']).map(t=>t[0]+t[1]).join()")==E("[Date.UTC(2026,9,23,7,0)+'Sign-in',Date.UTC(2026,9,23,19,30)+'Sign-in'].join()"))
    chk(t+'Benchmark: cdText says Sign-in in 56m',E("cdText(...cdSE(BYID['benchmark-classic-2026']),cdTargets(BYID['benchmark-classic-2026']))").startswith('⏱ Sign-in in 5'))
    chk(t+'no purple in the Times block (Benchmark)',E(NOPURPLE))
    pg.screenshot(path=f'{SH}/02-benchmark-{scheme}.png')
    pg.locator('#evTimes').screenshot(path=f'{SH}/02b-benchmark-times-{scheme}.png')
    if scheme=='light':
      chk('card: compact first line "Sign-in 10:00–11:00 am"',E("evCard(BYID['aba-2026-097'])").count('tm-line')==1 and 'Sign-in 10:00–11:00 am' in E("evCard(BYID['aba-2026-097'])"))
      chk('day panel line: Sun 25 = Sun sign-in',E("tmLine(BYID['aba-2026-097'],'2026-10-25')").find('Sign-in 7:00–8:00 am')>0)
      chk('card: Benchmark first sign-on is the Fri one, day named',E("evTimesShort(BYID['benchmark-classic-2026'])").startswith('Fri: Night sign-on 6-9 pm'))
      chk('fallback: US m/d/yyyy text shows raw',E("(()=>{const x={start_times:'Shooting lines: Saturday, 11/7/2026 and Sunday, 11/8/2026 at 9:00 AM & 1:00 PM',start_date:'2026-11-07',end_date:'2026-11-08',tz:'America/New_York'};return !evTimes(x).ok && timesBox(x).includes('tm-raw') && timesBox(x).includes('11/7/2026') && !cdTargets(x) && evTimesShort(x)===''})()"))
      chk('no times: countdown keeps the midnight start',E("(()=>{const x={name:'Test Nationals',start_date:'2026-11-07',end_date:'2026-11-08',state:'WA'};return cdTargets(x)===null && cdBadge(x).includes('Starts in')})()"))
      chk('start-time fallback labelled Starts',E("(()=>{const x={name:'Test Championships',start_times:'4:00 pm start',start_date:'2026-11-07',state:'SA'};return cdTargets(x)[0][1]==='Starts' && cdTargets(x)[0][0]===Date.UTC(2026,10,7,5,30)})()"))
      chk('AM/PM sessions: live from the first session',E("(()=>{const x=BYID['answ-westlakes-double-qre-2026-11-15'];return !x||cdTargets(x).length===1})()"))
      pg.goto(f'http://localhost:{PORT}/#/shoot/gosnells-club-champs-2026-target-1');pg.wait_for_timeout(1200)
      chk('past event: no Times block at the top',pg.locator('#evTimes').count()==0)
    chk(t+'no page errors',not errs);errs and print(errs)
    ctx.close()
  ctx,pg,errs=page('light','Australia/Sydney');E=pg.evaluate
  pg.goto(f'http://localhost:{PORT}/#/shoot/aba-2026-097');pg.wait_for_timeout(2500)
  cd=pg.locator('.dhero .b.cd').first.inner_text()
  chk(f'[Sydney viewer] Peel countdown still Sign-in in 19h 55m ({cd})',bool(re.search(r'Sign-in in 19h 5[56]m',cd)))
  chk('[Sydney viewer] zone note: Perth time',re.search(r'Perth time',pg.locator('#evTimes .tm-tz').inner_text()) is not None)
  chk('[Sydney viewer] hero dates note Perth time',re.search(r'local: Perth time',pg.locator('.dhero .sub').inner_text()) is not None)
  chk('[Sydney viewer] card line notes Perth time',E("evTimesShort(BYID['aba-2026-097'])")=='Sign-in 10:00–11:00 am (Perth time)')
  pg.screenshot(path=f'{SH}/03-peel-sydney-viewer.png')
  chk('[Sydney viewer] no page errors',not errs)
  b.close()
finally: srv.terminate()
print(f'\n{len(ok)} passed, {len(bad)} failed');sys.exit(1 if bad else 0)
