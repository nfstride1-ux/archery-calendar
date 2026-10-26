# First-visit sign-up pop-up (#spPop) on Archery Calendar. 390x844 phone and 1280x800 desktop.
# Local:  python3 scripts/popup_test.py            (serves this repo)
# Live:   BASE=https://archerycalendars.com/ SHOTS=/some/dir python3 scripts/popup_test.py
# Supabase is always stubbed in the browser (the otp request is captured and answered with {}), so no real email is ever submitted.
import subprocess,sys,time,os,json,re
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));PORT='8807'
BASE=os.environ.get('BASE','');LIVE=bool(BASE);SHOTS=os.environ.get('SHOTS',os.path.join(ROOT,'shots-popup'));os.makedirs(SHOTS,exist_ok=True)
PFX='live-' if LIVE else 'local-'
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,flush=True)
srv=None
if not LIVE:
  srv=subprocess.Popen([sys.executable,'-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1);BASE=f'http://localhost:{PORT}/'
K='archreg.popup.v1'
def sb(ctx,cap):
  def h(r):
    u=r.request.url
    if '/auth/v1/otp' in u and r.request.method=='POST':
      cap.append(json.loads(r.request.post_data or '{}'));return r.fulfill(status=200,content_type='application/json',body='{}')
    if '/rest/v1/' in u:return r.fulfill(status=200,content_type='application/json',body='[]')
    return r.fulfill(status=200,content_type='application/json',body='{}')
  ctx.route(re.compile(r'https://[^/]*supabase\.co/.*'),h)
def mk(b,vw,vh,cap,errs,session=False):
  ctx=b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=2,has_touch=vw<700,is_mobile=vw<700);sb(ctx,cap)
  if session:
    exp=int(time.time())+36000
    ctx.add_init_script("try{localStorage.setItem('archcal.auth',JSON.stringify({access_token:'a.b.c',refresh_token:'r',token_type:'bearer',expires_in:36000,expires_at:%d,user:{id:'00000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'t@example.com',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}))}catch(e){}"%exp)
  pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append('pageerror '+str(e)))
  pg.on('console',lambda m:errs.append('console '+m.text) if m.type=='error' else None)
  pg.clock.install();return ctx,pg
def ready(pg,hash_=''):
  pg.goto("about:blank");pg.goto(BASE+hash_);pg.wait_for_function("typeof AUTH!=='undefined'&&AUTH.ready",timeout=20000);pg.wait_for_timeout(1500)
def st(pg):return pg.evaluate(f"JSON.parse(localStorage.getItem('{K}')||'null')")
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  for name,vw,vh in [('phone',390,844),('desktop',1280,800)]:
    t=f'[{name}] ';cap=[];errs=[]
    ctx,pg=mk(b,vw,vh,cap,errs);ready(pg)
    chk(t+'sign-in is on for this visitor',pg.evaluate("AUTH.on&&AUTH.ready&&!AUTH.user"))
    chk(t+'not shown at load',pg.locator('#spPop').count()==0)
    pg.clock.run_for(8000);chk(t+'not shown after 8 s',pg.locator('#spPop').count()==0)
    pg.clock.run_for(24000);pg.wait_for_timeout(500)
    chk(t+'shown after about 30 s',pg.locator('#spPop').count()==1)
    chk(t+'dialog is aria-modal with a label',pg.evaluate("(()=>{const d=document.querySelector('#spPop .sp-card');return d.getAttribute('role')==='dialog'&&d.getAttribute('aria-modal')==='true'&&!!document.getElementById(d.getAttribute('aria-labelledby'))})()"))
    r=pg.evaluate("(()=>{const r=document.querySelector('#spPop .sp-card').getBoundingClientRect();return {t:r.top,l:r.left,b:r.bottom,r:r.right,h:r.height,w:r.width,sh:document.querySelector('#spPop .sp-card').scrollHeight,ch:document.querySelector('#spPop .sp-card').clientHeight}})()")
    chk(t+f'card fits the viewport {r}',r['t']>=-0.5 and r['l']>=-0.5 and r['b']<=vh+0.5 and r['r']<=vw+0.5)
    chk(t+'nothing is cut off inside the card (no scrolling needed)',r['sh']<=r['ch']+1)
    if name=='phone':chk(t+'bottom sheet, about half the screen',abs(r['b']-vh)<1.5 and 0.38*vh<=r['h']<=0.65*vh)
    else:chk(t+'centred card',abs((r['l']+r['r'])/2-vw/2)<2 and abs((r['t']+r['b'])/2-vh/2)<2 and abs(r['w']-580)<2)
    chk(t+'marketing box is unticked',pg.locator('#spMk').is_checked()==False)
    txt=pg.locator('#spPop').inner_text()
    chk(t+'copy: consent, skip, never-needs-account, button',all(s in txt for s in ['I agree to receive marketing emails','You can unsubscribe at any time.','Not now, just browse','Looking at events never needs an account.','Email me a sign-in code']))
    chk(t+'no emoji and no other app names in the pop-up',not re.search('[\U0001F300-\U0001FAFF\u2600-\u27BF]',txt))
    pg.screenshot(path=f'{SHOTS}/{PFX}{name}.png')
    chk(t+'focus starts inside the dialog',pg.evaluate("!!document.activeElement.closest('#spPop')"))
    ok_trap=True
    for i in range(12):
      pg.keyboard.press('Tab');ok_trap&=pg.evaluate("!!document.activeElement.closest('#spPop')")
    pg.keyboard.press('Shift+Tab');ok_trap&=pg.evaluate("!!document.activeElement.closest('#spPop')")
    chk(t+'focus is trapped (Tab and Shift+Tab stay inside)',ok_trap)
    chk(t+'page behind is not reachable (inert)',pg.evaluate("[...document.body.children].filter(e=>e.id!=='spPop'&&e.id!=='toast'&&!e.matches('script,style,link')).every(e=>e.inert)"))
    chk(t+'close button has a label',pg.locator('#spX').get_attribute('aria-label')=='Close')
    pg.keyboard.press('Escape');pg.wait_for_timeout(400)
    s=st(pg)
    chk(t+'Esc closes it',pg.locator('#spPop').count()==0)
    chk(t+f'dismiss is stored {s}',bool(s) and s.get('n')==1 and s.get('state')=='dismissed' and s.get('dismissedAt'))
    chk(t+'page is usable again (not locked, inert removed)',pg.evaluate("!document.documentElement.classList.contains('sp-lock')&&!document.querySelector('[inert]')"))
    ready(pg);pg.clock.run_for(45000);pg.wait_for_timeout(300)
    chk(t+'does not return after reload',pg.locator('#spPop').count()==0)
    # 14 days later: one more chance, then never
    pg.evaluate(f"localStorage.setItem('{K}',JSON.stringify({{n:1,state:'dismissed',shownAt:Date.now()-15*864e5,dismissedAt:Date.now()-15*864e5}}))")
    ready(pg);pg.clock.run_for(35000);pg.wait_for_timeout(300)
    chk(t+'comes back once after 14 days',pg.locator('#spPop').count()==1 and st(pg)['n']==2)
    pg.locator('#spSkip').click();pg.wait_for_timeout(300)
    chk(t+'Not now, just browse closes it',pg.locator('#spPop').count()==0)
    pg.evaluate(f"localStorage.setItem('{K}',JSON.stringify({{n:2,state:'dismissed',shownAt:Date.now()-90*864e5,dismissedAt:Date.now()-90*864e5}}))")
    ready(pg);pg.clock.run_for(45000);pg.wait_for_timeout(300)
    chk(t+'never a third time',pg.locator('#spPop').count()==0)
    pg.evaluate(f"localStorage.setItem('{K}',JSON.stringify({{n:1,state:'dismissed',shownAt:Date.now()-5*864e5,dismissedAt:Date.now()-5*864e5}}))")
    ready(pg);pg.clock.run_for(45000);pg.wait_for_timeout(300)
    chk(t+'quiet inside the 14 days',pg.locator('#spPop').count()==0)
    chk(t+'no console errors (scenario 1)',not errs)
    if errs:print(errs[:5])
    ctx.close()

    # second event page trigger
    errs=[];ctx,pg=mk(b,vw,vh,cap,errs);ready(pg)
    ids=pg.evaluate("[...document.querySelectorAll('a[href^=\"#/shoot/\"]')].map(a=>a.getAttribute('href').split('/')[2]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,3)")
    chk(t+f'found events to open {ids}',len(ids)>=2)
    pg.evaluate(f"location.hash='#/shoot/{ids[0]}'");pg.clock.run_for(6000);pg.wait_for_timeout(300)
    chk(t+'first event page does not trigger it',pg.locator('#spPop').count()==0 and pg.evaluate("document.body.dataset.page")=='shoot')
    pg.evaluate(f"location.hash='#/shoot/{ids[1]}'");pg.wait_for_timeout(500);pg.clock.run_for(800);pg.wait_for_timeout(200)
    chk(t+'not instantly on the second event',pg.locator('#spPop').count()==0)
    pg.clock.run_for(2500);pg.wait_for_timeout(400)
    chk(t+'shown on opening the second event page',pg.locator('#spPop').count()==1)
    chk(t+'no console errors (scenario 2)',not errs)
    if errs:print(errs[:5])
    ctx.close()

    # sign-in goes through signInWithOtp, nothing real is sent
    cap.clear();errs=[];ctx,pg=mk(b,vw,vh,cap,errs);ready(pg,'#/home');pg.clock.run_for(35000);pg.wait_for_timeout(400)
    pg.locator('#spGo').click();pg.wait_for_timeout(400)
    chk(t+'empty email shows an error and sends nothing',pg.locator('#spErr').is_visible() and len(cap)==0 and pg.locator('#spPop').count()==1)
    pg.fill('#spEm','test+popup@example.com');pg.locator('#spMk').check()
    pg.locator('#spGo').click();pg.wait_for_timeout(1200)
    chk(t+f'request reached signInWithOtp (/auth/v1/otp) {cap[:1]}',len(cap)==1 and cap[0].get('email')=='test+popup@example.com' and cap[0].get('create_user') is True)
    d=(cap[0].get('data') or {}) if cap else {}
    chk(t+'marketing opt-in recorded in user data with a timestamp',d.get('marketing_opt_in') is True and bool(d.get('marketing_opt_in_at')))
    chk(t+'PKCE flow unchanged (code_challenge sent)',bool(cap and cap[0].get('code_challenge')))
    chk(t+'pop-up closes and the account page shows the code box',pg.locator('#spPop').count()==0 and pg.evaluate("location.hash")=='#/account' and pg.locator('#otp').count()==1)
    chk(t+'state is started',(st(pg) or {}).get('state')=='started')
    ready(pg,'#/home');pg.clock.run_for(45000);pg.wait_for_timeout(300)
    chk(t+'never again once sign-up started',pg.locator('#spPop').count()==0)
    # unticked box -> false
    cap.clear();pg.evaluate(f"localStorage.removeItem('{K}');localStorage.removeItem('archcal.otpSent')")
    ready(pg,'#/home');pg.clock.run_for(35000);pg.wait_for_timeout(400)
    pg.fill('#spEm','test+two@example.com');pg.locator('#spGo').click();pg.wait_for_timeout(1000)
    chk(t+'unticked sends marketing_opt_in false',len(cap)==1 and (cap[0].get('data') or {}).get('marketing_opt_in') is False)
    chk(t+'no console errors (scenario 3)',not errs)
    if errs:print(errs[:5])
    ctx.close()

    # signed-in visitor, account page, open dialogs
    errs=[];ctx,pg=mk(b,vw,vh,cap,errs,session=True);ready(pg);pg.wait_for_timeout(1500)
    chk(t+'fake session is seen as signed in',pg.evaluate("!!AUTH.user"))
    pg.clock.run_for(45000);pg.wait_for_timeout(300)
    chk(t+'signed-in visitor never sees it',pg.locator('#spPop').count()==0 and st(pg) is None)
    chk(t+'no page errors (signed in)',not [e for e in errs if 'pageerror' in e])
    ctx.close()
    errs=[];ctx,pg=mk(b,vw,vh,cap,errs);ready(pg,'#/account');pg.clock.run_for(45000);pg.wait_for_timeout(300)
    chk(t+'not shown on the account page',pg.locator('#spPop').count()==0)
    pg.evaluate("location.hash='#/submit'");pg.wait_for_timeout(600);pg.clock.run_for(5000)
    chk(t+'not shown on the submit form',pg.locator('#spPop').count()==0)
    pg.evaluate("location.hash='#/privacy'");pg.wait_for_timeout(600);pg.clock.run_for(3000);pg.wait_for_timeout(300)
    chk(t+'then shown once they leave the form (it waited, not lost)',pg.locator('#spPop').count()==1)
    chk(t+'privacy page mentions the optional marketing consent',pg.evaluate("document.body.innerText.includes('Marketing emails')"))
    ctx.close()
    errs=[];ctx,pg=mk(b,vw,vh,cap,errs);ready(pg,'#/whatsnew')
    pg.locator('.wn-back [data-help-open]').click();pg.wait_for_timeout(500);pg.clock.run_for(40000);pg.wait_for_timeout(300)
    chk(t+'not shown while the help box is open',pg.locator('#hbBox').is_visible() and pg.locator('#spPop').count()==0)
    pg.evaluate("document.querySelector('#hbBox').hidden=true");pg.clock.run_for(3000);pg.wait_for_timeout(400)
    chk(t+'waits, then shows once the help box is closed',pg.locator('#spPop').count()==1)
    pg.keyboard.press('Escape');pg.wait_for_timeout(300)
    chk(t+'Esc closes it from anywhere on the page',pg.locator('#spPop').count()==0)
    # existing pages unaffected
    for h in ['#/home','#/whatsnew','#/privacy','#/map','#/account','#/submit']:
      pg.evaluate(f"location.hash='{h}'");pg.wait_for_timeout(500)
      chk(t+f'{h} renders',pg.locator('#view *').count()>5 and pg.locator('#spPop').count()==0)
    chk(t+'no console errors (other pages)',not errs)
    if errs:print(errs[:5])
    ctx.close()
  b.close()
finally:
  if srv:srv.terminate()
print(f'{len(ok)} passed, {len(bad)} failed',bad)
sys.exit(1 if bad else 0)
