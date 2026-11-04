import sys,subprocess,time,re
from playwright.sync_api import sync_playwright
root,tag,port=sys.argv[1],sys.argv[2],sys.argv[3]
srv=subprocess.Popen(['python3','-m','http.server',port],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
out='/workspace/shots-calendar-mockup'
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  for vn,vw,vh in [('phone',390,844),('desktop',1366,900)]:
   for g in ([False,True] if tag=='after' else [False]):
    ctx=b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=2 if vw<700 else 1,is_mobile=vw<700,has_touch=vw<700,service_workers='block')
    def cfg(r):
      t=open(root+'/config.js').read()
      if g: t=t.replace('window.SUPABASE_GOOGLE = false','window.SUPABASE_GOOGLE = true')
      r.fulfill(status=200,content_type='application/javascript',body=t)
    ctx.route(re.compile(r'.*/config\.js.*'),cfg)
    ctx.route(re.compile(r'https://[^/]*supabase\.co/.*'),lambda r:r.fulfill(status=200,content_type='application/json',body='[]'))
    ctx.add_init_script("try{localStorage.setItem('archreg.popup.v1',JSON.stringify({seen:Date.now(),dismissed:Date.now()}));localStorage.setItem('archcal.instDismissed',String(Date.now()))}catch(e){}")
    pg=ctx.new_page(); pg.add_init_script("localStorage.setItem('archcal.appVidSeen','1')"); pg.goto(f'http://localhost:{port}/#/account'); pg.wait_for_timeout(4000)
    pg.evaluate("document.querySelectorAll('#spPop,.sp-pop,dialog[open],.inst-pop,#appVidPop').forEach(e=>{try{e.close&&e.close()}catch(_){};e.remove()})")
    pg.screenshot(path=f'{out}/{tag}-item8-signin{"-google-on" if g else ""}-{vn}.png')
    if not g:
      pg.goto(f'http://localhost:{port}/#/calendar'); pg.wait_for_timeout(2500)
      print(tag,vn,'signed out: My events button visible =',pg.locator('#navMyEv').is_visible(),'| page:',pg.locator('#view h1, #view h2').first.inner_text()[:60])
      pg.screenshot(path=f'{out}/{tag}-item8-myevents-signed-out-{vn}.png')
    ctx.close()
finally: srv.kill()
