# What's new page (#/whatsnew) + Help updates on Archery Calendar. 390px phone, light and dark device setting (site stays light).
import subprocess,sys,time,os,re
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));SH=os.path.join(ROOT,'shots-whatsnew');os.makedirs(SH,exist_ok=True)
PORT='8806';ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,flush=True)
srv=subprocess.Popen([sys.executable,'-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
HASHES=subprocess.run(['git','log','--format=%h','-n','400'],cwd=ROOT,capture_output=True,text=True).stdout.split()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  for scheme in ['light','dark']:
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme=scheme);errs=[]
    ctx.route('https://*.supabase.co/**',lambda r:r.abort())
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(f'http://localhost:{PORT}/#/whatsnew');pg.wait_for_timeout(2500);E=pg.evaluate
    t=f'[{scheme}] '
    chk(t+'page renders with title',pg.locator('#view h1').inner_text().strip().lower()=="what’s new" and 'What’s new' in pg.title())
    chk(t+'one panel per day, newest first',pg.locator('.wn-day').count()==E("CAL_WHATSNEW.length") and E("CAL_WHATSNEW.every((d,i,a)=>!i||a[i-1].d>d.d)"))
    chk(t+'no not-found note',pg.locator('#nfNote').count()==0)
    chk(t+'back link to home',pg.locator('.wn-back a[href="#/home"]').count()==1)
    if scheme=='light':
      cs=E("CAL_WHATSNEW.flatMap(d=>d.items.flatMap(i=>i[2]))")
      real=[c for c in cs if re.fullmatch(r'[0-9a-f]{7}',c)]
      chk('every commit hash is a real commit',len(real)>=15 and all(any(h.startswith(c) for h in HASHES) for c in real))
      chk('only "this release" is not a hash',all(c=='this release' or c in real for c in cs))
      chk('top entry is this release',E("CAL_WHATSNEW[0].items[0][2][0]")=='this release')
      chk('no purple on page',E("[...document.querySelectorAll('.wn-day *')].every(e=>!/rgb\\(1[0-9]{2}, [0-9]{1,2}, 2[0-9]{2}\\)/.test(getComputedStyle(e).color))"))
    pg.screenshot(path=f'{SH}/01-whatsnew-{scheme}.png')
    for a in ['whats-new','news','updates']:
      pg.goto(f'http://localhost:{PORT}/#/{a}');pg.wait_for_timeout(600)
      chk(t+f'alias #/{a} goes to What’s new',pg.url.endswith('#/whatsnew'))
    chk(t+'footer links to What’s new',pg.locator('footer a[href="#/whatsnew"]').count()>=1)
    pg.locator('.wn-back [data-help-open]').click();pg.wait_for_timeout(500)
    chk(t+'Open Help opens the help box',pg.locator('#hbBox').is_visible())
    qs=pg.locator('#hbBox .hb-qs button').all_inner_texts()
    chk(t+'help lists new questions',all(x in qs for x in ['How do I see my ScoreTool scores?','Why do I see another country?',"What's new?"]))
    pg.locator('#hbBox .hb-qs button',has_text="What's new?").click();pg.wait_for_timeout(600)
    chk(t+"help What's new answer links to the page",pg.locator('#hbBox .hb-m.bot a[href="#/whatsnew"]').count()>=1)
    bg=E("getComputedStyle(document.querySelector('#hbBox')).backgroundColor")
    chk(t+'help box uses site card colour',bg==E("getComputedStyle(document.documentElement).getPropertyValue('--card').trim()=='#fff'?'rgb(255, 255, 255)':''"))
    pg.screenshot(path=f'{SH}/02-help-whatsnew-{scheme}.png')
    pg.locator('#hbQ').fill('scoretool scores');pg.locator('.hb-go').click();pg.wait_for_timeout(600)
    last=pg.locator('#hbBox .hb-m.bot').last.inner_text()
    chk(t+'typed question finds ScoreTool answer','Link ScoreTool' in last and 'Me › Settings › Archery Calendar' in last)
    pg.screenshot(path=f'{SH}/03-help-scoretool-{scheme}.png')
    pg.keyboard.press('Escape');pg.wait_for_timeout(200)
    chk(t+'Escape closes help',not pg.locator('#hbBox').is_visible())
    sw=open(os.path.join(ROOT,'sw.js')).read()
    if scheme=='light':chk('sw precaches whatsnew.js',"'./whatsnew.js'" in sw)
    chk(t+'no page errors',not errs);errs and print(errs)
    ctx.close()
  b.close()
finally:
  srv.terminate()
print(f'{len(ok)} passed, {len(bad)} failed')
sys.exit(1 if bad else 0)
