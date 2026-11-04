import sys,subprocess,shutil,time,os
from playwright.sync_api import sync_playwright
src,tag=sys.argv[1],sys.argv[2]; d='/tmp/sw9-'+tag; shutil.rmtree(d,ignore_errors=True); shutil.copytree(src,d,ignore=shutil.ignore_patterns('.git','shots-*','node_modules'))
port='88'+('51' if tag=='before' else '52'); srv=subprocess.Popen(['python3','-m','http.server',port],cwd=d,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
out='/workspace/shots-calendar-mockup'
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
  ctx.add_init_script("try{localStorage.setItem('archreg.popup.v1',JSON.stringify({seen:Date.now(),dismissed:Date.now()}));localStorage.setItem('archcal.instDismissed',String(Date.now()))}catch(e){}")
  pg=ctx.new_page(); pg.goto(f'http://localhost:{port}/#/calendars/aba'); pg.wait_for_function('navigator.serviceWorker.controller',timeout=30000)
  pg.reload(); pg.wait_for_timeout(3000); pg.evaluate("scrollTo(0,900); window.__mark=1")
  import re; s=re.sub(r"const C='[^']*'","const C='archcal-test9'",open(d+'/sw.js').read(),count=1); open(d+'/sw.js','w').write(s)
  pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())"); pg.wait_for_timeout(8000)
  m=pg.evaluate("[window.__mark||0, !!document.querySelector('#updBar'), scrollY]"); print(tag,'after update: [same page kept, update bar, scrollY]',m)
  pg.screenshot(path=f'{out}/{tag}-item9-sw-update-phone.png')
  pg.evaluate("location.hash='#/home'"); pg.wait_for_timeout(4000)
  print(tag,'after next navigation: page reloaded =', pg.evaluate("!window.__mark"))
finally: srv.kill()
