# ScoreTool score photos on Archery Calendar (scoretool.js): grid + My events show a tiny round thumb in place of the target mark,
# tapping a past scored day shows the score + photo first, the event page's My score shows the photo, tap = full size with Back.
# Missing score_photos table (SQL not run) = no photos, quietly. Supabase is mocked (AUTH.client); TEST rows only. 390px phone.
import subprocess,sys,time,os,json,io,base64
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));SH=os.path.join(ROOT,'shots-photos');os.makedirs(SH,exist_ok=True)
PORT='8801';ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,flush=True)
def jpg(w,h,q):
  im=Image.new('RGB',(w,h),(250,250,245));d=ImageDraw.Draw(im)
  for i,c in enumerate([(255,215,0),(220,40,40),(40,90,220),(20,20,20),(250,250,250)][::-1]):
    r=int(min(w,h)*0.45*(5-i)/5);d.ellipse((w//2-r,h//2-r,w//2+r,h//2+r),fill=c,outline=(0,0,0))
  b=io.BytesIO();im.save(b,'JPEG',quality=q);return base64.b64encode(b.getvalue()).decode()
PHOTO=jpg(640,480,70);THUMB=jpg(96,96,70)
srv=subprocess.Popen([sys.executable,'-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
MOCK="""([rows,photos,full,miss])=>{const q=(t)=>{const st={t,eq:null,cols:''};const res=()=>{
   if(t=='score_entries')return{data:rows,error:null};
   if(t=='scoretool_links')return{data:[{label:'ScoreTool',created_at:'2026-10-22T00:00:00Z',last_used_at:null}],error:null};
   if(t=='score_photos'){if(miss)return{data:null,error:{code:'PGRST205',message:"Could not find the table 'public.score_photos'"}};
     if(st.cols=='photo'){window._phq=(window._phq||0)+1;return{data:full[st.eq]?{photo:full[st.eq]}:null,error:null}}return{data:photos,error:null}}
   return{data:[],error:null}};
  const b={select(c){st.cols=c;return b},order(){return b},eq(k,v){st.eq=v;return b},maybeSingle(){return Promise.resolve(res())},delete(){return b},then(a,r){return Promise.resolve(res()).then(a,r)}};return b};
  AUTH.on=true;AUTH.ready=true;AUTH.user={id:'00000000-0000-0000-0000-000000000001',email:'test@example.com'};AUTH.client={from:q,rpc:async()=>({data:null,error:null})};
  STL.uid=null;STL.rows=null;STL.photos={};}"""
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2);errs=[]
  ctx.route('https://*.supabase.co/**',lambda r:r.abort())
  pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(f'http://localhost:{PORT}/#/calendar');pg.wait_for_timeout(2500)
  E=pg.evaluate
  ev=E("""()=>{const x=Object.values(BYID).find(x=>x.start_date&&x.start_date==(x.end_date||x.start_date)&&x.start_date>='2026-09-01'&&x.start_date<'2026-10-01'&&x.state=='WA')||Object.values(BYID).find(x=>x.start_date&&x.start_date==(x.end_date||x.start_date)&&x.start_date>='2026-09-01'&&x.start_date<'2026-10-01');return x&&{id:x.id,name:x.name,d:x.start_date}}""")
  print('event',ev)
  D1=ev['d'];D2='2026-09-'+('03' if D1!='2026-09-03' else '04');D3='2026-09-'+('24' if D1!='2026-09-24' else '25')
  rows=[{'id':1,'source_id':'steven:p1','shot_date':D1,'round_name':ev['name']+' - Indoor WA 18m','score':540,'max_score':600,'location':None,'updated_at':'x'},
        {'id':2,'source_id':'steven:p2','shot_date':D2,'round_name':'Indoor WA 18m','score':512,'max_score':600,'location':None,'updated_at':'x'},
        {'id':3,'source_id':'steven:p3','shot_date':D3,'round_name':'Indoor WA 18m','score':530,'max_score':600,'location':None,'updated_at':'x'}]
  photos=[{'source_id':'steven:p1','thumb':THUMB},{'source_id':'steven:p3','thumb':THUMB}]
  full={'steven:p1':PHOTO,'steven:p3':PHOTO}
  def setup(miss=False):
    E(f"()=>{{S.saved[{json.dumps(ev['id'])}]={{added:'2026-08-01'}};CM=[2026,8];CD='';location.hash='#/calendar'}}");pg.wait_for_timeout(500)
    E(MOCK,[rows,photos,full,miss]);E("render()");pg.wait_for_timeout(1200)
  # ---- SQL not run: target marks, no thumbs, quiet ----
  setup(True)
  chk('no photo table: target marks only, no thumbs',pg.locator('.grid .stl-dot').count()==3 and pg.locator('.grid .stl-th').count()==0 and not errs)
  # ---- photos ----
  setup(False)
  c3=pg.locator(f'.grid [data-day="{D3}"]');c2=pg.locator(f'.grid [data-day="{D2}"]')
  chk('month grid: scored day with a photo shows a round thumb (not the target mark)',c3.locator('.stl-dot-ph img.stl-th').count()==1 and '🎯' not in c3.inner_text())
  chk('month grid: scored day without a photo keeps the target mark','🎯' in c2.locator('.stl-dot').inner_text())
  box=pg.locator('#stlBox')
  chk('My events list: thumb in place of the target mark for photo rows',box.locator('.stl-phb').count()==2 and box.locator('.stl-row').count()==3)
  pg.locator('.grid').scroll_into_view_if_needed();pg.screenshot(path=os.path.join(SH,'cal-01-month-grid.png'))
  # ---- tap a past day with a score + photo (no event): day panel, score + photo first ----
  c3.click();pg.wait_for_timeout(600)
  dp=pg.locator('#dayPanel')
  first=E("()=>{const h=document.querySelector('#dayPanel .dp-head');return !!h&&h.nextElementSibling&&h.nextElementSibling.id=='stlDay'}")
  chk('past day: day panel opens with my score + photo first',dp.count()==1 and first and dp.locator('#stlDay .stl-phb').count()==1 and '530' in dp.locator('#stlDay').inner_text())
  dp.scroll_into_view_if_needed();pg.screenshot(path=os.path.join(SH,'cal-02-day-score-first.png'))
  pg.click('#stlDay .stl-phb');pg.wait_for_selector('#stlPh .stl-ph-img',timeout=4000)
  chk('photo opens full size with a Back button',pg.locator('#stlPh #stlPhX').count()==1 and E("document.querySelector('#stlPh .stl-ph-img').naturalWidth")==640)
  pg.screenshot(path=os.path.join(SH,'cal-03-full-photo.png'))
  pg.click('#stlPhX');pg.wait_for_timeout(200);chk('Back closes the photo',pg.locator('#stlPh').count()==0)
  pg.click('#stlDay .stl-phb');pg.wait_for_selector('#stlPh');pg.keyboard.press('Escape');pg.wait_for_timeout(200);chk('Escape closes it too',pg.locator('#stlPh').count()==0)
  # ---- tap the past event day: goes to the event as before, My score (with photo) first ----
  E("()=>{CD='';render()}");pg.wait_for_timeout(500)
  pg.locator(f'.grid [data-day="{D1}"]').click();pg.wait_for_timeout(2000)
  h=E("location.hash")
  sh=pg.locator('#stlShoot')
  chk('past event day still opens the event',h.startswith('#/shoot/'))
  chk('event page: My score shows the photo',sh.count()==1 and sh.locator('.stl-phb').count()==1 and '540' in sh.inner_text())
  pos=E("()=>{const s=document.getElementById('stlShoot'),r=document.getElementById('results');return {before:!!s&&(!r||!!(s.compareDocumentPosition(r)&Node.DOCUMENT_POSITION_FOLLOWING)),top:s?Math.round(s.getBoundingClientRect().top):-1}}")
  print('pos',pos)
  chk('from a tapped day: My score is shown first (above Results, scrolled to)',pos['before'] and 0<=pos['top']<300)
  pg.screenshot(path=os.path.join(SH,'cal-04-event-my-score.png'))
  sh.locator('.stl-phb').click();pg.wait_for_selector('#stlPh .stl-ph-img',timeout=4000);pg.wait_for_timeout(200)
  chk('event page photo opens full size with Back',pg.locator('#stlPh #stlPhX').count()==1)
  pg.screenshot(path=os.path.join(SH,'cal-05-event-full-photo.png'))
  pg.click('#stlPhX');pg.wait_for_timeout(200)
  # ---- event page opened directly (not from a day): My score stays under Results ----
  E(f"()=>{{location.hash='#/calendar'}}");pg.wait_for_timeout(500);E(f"()=>{{location.hash='#/shoot/'+encodeURIComponent({json.dumps(ev['id'])})+'?r=1'}}");pg.wait_for_timeout(1500)
  chk('opened directly: My score stays in its usual place (after Results)',pg.locator('#stlShoot').count()==1 and E("()=>{const s=document.getElementById('stlShoot'),r=document.getElementById('results');return !r||!!(r.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_FOLLOWING)}"))
  chk('no page errors',not errs)
  if errs:print(errs[:5])
  b.close()
srv.terminate()
print(f'{len(ok)} passed, {len(bad)} failed',bad)
sys.exit(1 if bad else 0)
