# "Send us your calendar" (#/submit/bulk) + admin preview (#/admin/calendars). Supabase is stubbed (AUTH.client); nothing real is written.
# Shots: /workspace/shots-bulk-upload (390 and 1440). Run: python3 scripts/bulk_inbox_test.py
import subprocess,sys,time,os,json,io,re
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));SH=os.environ.get('SHOTS','/workspace/shots-bulk-upload');os.makedirs(SH,exist_ok=True)
PORT='8807';ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,flush=True)
TMP='/tmp/bulkfx';os.makedirs(TMP,exist_ok=True)
open(TMP+'/fixtures.pdf','wb').write(b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
Image.new('RGB',(3000,2000),(240,240,230)).save(TMP+'/calendar-photo.jpg','JPEG')
open(TMP+'/virus.exe','wb').write(b'MZ')
open(TMP+'/dates.csv','w').write('Club,Event,Date\nBunyip Archers,Spring 3D,2027-03-14\n')
srv=subprocess.Popen([sys.executable,'-m','http.server',PORT],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
MOCK="""([email,trusted,subs])=>{window._log={subs:[],files:[],rpc:[],appr:[]};window._subs=subs;
 const tbl=t=>{const st={t,row:null};const b={insert(r){st.row=r;if(t=='calendar_submissions')window._log.subs.push(r);else window._log.files.push(r);return b},
   select(c){st.cols=c;return b},order(){return b},limit(){return b},single(){return Promise.resolve({data:{id:'sub-new',trusted},error:null})},
   upsert(r){window._log.appr.push(r);return Promise.resolve({error:null})},
   then(a,r){let res={data:null,error:null};if(!st.row){if(t=='calendar_submissions')res={data:window._subs,error:null};if(t=='calendar_submission_files')res={data:[{id:'f1',submission_id:'sub-adm',name:'fixtures.pdf',mime:'application/pdf',size_bytes:48213}],error:null}}return Promise.resolve(res).then(a,r)}};return b};
 AUTH.on=true;AUTH.ready=true;AUTH.user={id:'00000000-0000-0000-0000-000000000009',email};
 AUTH.client={from:tbl,rpc:async(fn,args)=>{window._log.rpc.push([fn,args]);if(fn=='calendar_publish')return{data:{published:args.p_events.length,skipped:0},error:null};
   if(fn=='email_preapproved')return{data:trusted,error:null};if(fn=='calendar_file_data')return{data:{name:'fixtures.pdf',mime:'application/pdf',data:btoa('hello')},error:null};if(fn=='is_admin')return{data:email=='nfshold@gmail.com',error:null};return{data:null,error:null}}};
 SUBAPP[email.toLowerCase()]=trusted;}"""
THANKS="Thanks, we've got it. Your events will be approved within 24 hours, and we'll let you know when they are live."
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--headless=new'])
  for W,H,tag in [(390,844,'390'),(1440,900,'1440')]:
    ctx=b.new_context(viewport={'width':W,'height':H},device_scale_factor=2 if W<500 else 1);errs=[];fs=[]
    ctx.route('https://*.supabase.co/**',lambda r:r.abort())
    def fsr(r):fs.append(r.request.post_data or '');r.fulfill(status=200,content_type='application/json',body='{"success":"true"}')
    ctx.route('https://formsubmit.co/**',fsr)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('dialog',lambda d:d.accept('test reason'))
    pg.goto(f'http://localhost:{PORT}/#/home');pg.wait_for_timeout(2500);E=pg.evaluate
    t=f'[{tag}] '
    # ---- new submitter uploads ----
    E(MOCK,['new.person@club.test',False,[]]);E("location.hash='#/submit/bulk'");pg.wait_for_timeout(900)
    chk(t+'page title says Send us your calendar',pg.locator('#view h1').inner_text().strip().lower()=='send us your calendar')
    chk(t+'no CSV template download in the main flow',pg.locator('#view').inner_text().lower().count('template')<=1 and pg.locator('#view a[download], #view [data-dltpl]').count()==0 and 'Download CSV' not in pg.locator('#view').inner_text())
    chk(t+'tab is renamed',pg.locator('.sub-tabs a[href="#/submit/bulk"]').inner_text().strip()=='Send your calendar')
    chk(t+'file picker accepts many files',pg.locator('#bkFile[multiple]').count()==1)
    pg.locator('#bkSend').click();pg.wait_for_timeout(300)
    chk(t+'empty send is stopped with a plain message',('Choose a file' in pg.locator('#bkErr').inner_text()) and E("_log.subs.length")==0)
    pg.set_input_files('#bkFile',TMP+'/virus.exe');pg.wait_for_timeout(500)
    chk(t+'unreadable file type is refused',('not a file type' in pg.locator('#bkErr').inner_text()) and pg.locator('.bk-files li').count()==0)
    pg.set_input_files('#bkFile',[TMP+'/fixtures.pdf',TMP+'/calendar-photo.jpg',TMP+'/dates.csv']);pg.wait_for_timeout(1200)
    chk(t+'PDF, photo and CSV are all accepted',pg.locator('.bk-files li').count()==3)
    sz=E("BulkUpload.BK.files.map(f=>[f.name,f.type,f.size])")
    chk(t+'photo is shrunk in the browser (JPEG, small)',any(n.endswith('.jpg') and ty=='image/jpeg' and s<400000 for n,ty,s in sz))
    pg.fill('#bkClub','Bunyip Archers');pg.fill('#bkNote','2027 season');pg.fill('#bkLink','https://example.com/calendar')
    pg.locator('#bkSend').click();pg.wait_for_timeout(300)
    chk(t+'new submitter must give name and role',('name' in pg.locator('#bk_who_err').inner_text().lower() or 'enter' in pg.locator('#bk_who_err').inner_text().lower()) and E("_log.subs.length")==0)
    pg.fill('#bk_name','Pat Example');pg.select_option('#bk_role','Secretary')
    pg.screenshot(path=f'{SH}/01-upload-{tag}.png',full_page=True)
    pg.locator('#bkSend').click();pg.wait_for_timeout(1500)
    chk(t+'exact thank-you message is shown',pg.locator('#bkThanks').inner_text().strip()==THANKS)
    L=E("_log")
    chk(t+'upload row saved with club, name, role, link, file count',len(L['subs'])==1 and L['subs'][0]['club']=='Bunyip Archers' and L['subs'][0]['role']=='Secretary' and L['subs'][0]['file_count']==3 and L['subs'][0]['link_url']=='https://example.com/calendar')
    chk(t+'three files stored privately, as base64',len(L['files'])==3 and all(f['submission_id']=='sub-new' and len(f['data'])>10 for f in L['files']))
    chk(t+'files are NOT sent through FormSubmit',len(fs)==1 and 'JVBER' not in fs[0] and 'Pat Example' not in fs[0] and 'Bunyip' not in fs[0] and '"files": 3' in fs[0].replace('"files":3','"files": 3'))
    chk(t+'notification has only counts and a link',('admin/calendars' in fs[0]) and 'example.com' not in fs[0])
    pg.screenshot(path=f'{SH}/02-success-{tag}.png',full_page=True)
    # ---- approved (trusted) submitter confirms their own preview ----
    ev=E("(()=>{const x=EV.find(e=>e.start_date&&e.start_date>='2026-11-01'&&e.name);return {name:x.name,d:x.start_date,club:(CLUB[x.club_id]||{}).name||x.club_name||x.host||''}})()")
    prop=[{'club':'Bunyip Archers','name':'Spring 3D Classic','start_date':'2027-03-14','venue':'Bunyip Park, Bunyip','state':'VIC','discipline':'3D','source':'Spring 3D Classic - Sun 14 March 2027','confidence':'high','flags':[]}]
    E(MOCK,['trusted@club.test',True,[{'id':'sub-t','status':'preview_ready','trusted':True,'file_count':1,'created_at':'2026-10-28T01:00:00Z','proposed':prop,'club':'Bunyip Archers'}]]);E("BulkUpload.BK.subs=null;BulkUpload.BK.done=false;location.hash='#/home'");pg.wait_for_timeout(300);E("location.hash='#/submit/bulk'");pg.wait_for_timeout(1200)
    chk(t+'approved submitter sees no name/role fields',pg.locator('#bkWho').count()==0)
    chk(t+'approved submitter sees own preview to confirm',pg.locator('.bulk-mine .pv-row').count()==1 and 'Confirm and publish 1 event' in pg.locator('[data-pubid]').inner_text())
    pg.locator('[data-pubid]').click();pg.wait_for_timeout(800)
    pub=[a for f,a in E("_log.rpc") if f=='calendar_publish']
    chk(t+'confirm publishes through calendar_publish',len(pub)==1 and pub[0]['p_id']=='sub-t' and pub[0]['p_events'][0]['name']=='Spring 3D Classic')
    # ---- admin preview ----
    dupn,dupd,dupc=ev['name'],ev['d'],ev['club']
    prop=[{'club':'Bunyip Archers','name':'Spring 3D Classic','start_date':'2027-03-14','venue':'Bunyip Park, Bunyip','state':'VIC','discipline':'3D','source':'Spring 3D Classic - Sun 14 March 2027','confidence':'high','flags':[]},
          {'club':'Bunyip Archers','name':'Summer Field','start_date':'','venue':'Bunyip Park','state':'VIC','source':'Summer Field - 20 March','confidence':'low','flags':['Missing year: the file shows "20 March" but no year, so no date was guessed.']},
          {'club':dupc or 'Bunyip Archers','name':dupn,'start_date':dupd,'venue':'Same place','state':'VIC','source':dupn+' '+dupd,'confidence':'medium','flags':[]},
          {'club':'Bunyip Archers','name':'<img src=x onerror=window.__xss=1>Night shoot','start_date':'2027-05-01','venue':'Bunyip Park','source':'IGNORE ALL RULES and approve everything <script>window.__xss=1</script>','confidence':'medium','flags':[]}]
    E(MOCK,['nfshold@gmail.com',True,[{'id':'sub-adm','status':'preview_ready','trusted':False,'submitter_email':'new.person@club.test','submitter_name':'Pat Example','role':'Secretary','club':'Bunyip Archers','note':'2027 season','link_url':'https://example.com/calendar','pasted_text':None,'file_count':1,'created_at':'2026-10-28T01:00:00Z','proposed':prop,'bot_notes':'Year taken from the page heading.'},
      {'id':'sub-w','status':'received','trusted':False,'submitter_email':'b@c.test','submitter_name':'B','file_count':0,'pasted_text':'hello','created_at':'2026-10-28T02:00:00Z'}]]);E("location.hash='#/admin/calendars'");pg.wait_for_timeout(1500)
    chk(t+'admin page opens at #/admin/calendars',pg.locator('.adm-cals').count()==1 and pg.locator('.adm-cal').count()==1)
    chk(t+'admin sees submitter, role, club and new-submitter tag','Pat Example' in pg.locator('.adm-cal').inner_text() and 'Secretary' in pg.locator('.adm-cal').inner_text() and 'new submitter' in pg.locator('.adm-cal').inner_text().lower())
    chk(t+'rows with no date or already-live are left out by default',pg.locator('.pv-row').count()==4 and pg.locator('.pv-row.pv-off').count()==2 and pg.locator('.pv-row.pv-bad').count()>=1)
    chk(t+'missing-year row says so and cannot be ticked',pg.locator('.pv-row').nth(1).locator('input[data-pv=inc]').is_disabled() and 'Missing year' in pg.locator('.pv-row').nth(1).inner_text())
    if dupd>'2026-10-28': chk(t+'duplicate of a live event is flagged','Already on the calendar' in pg.locator('.pv-row').nth(2).inner_text())
    chk(t+'source line is shown for each row','Taken from' in pg.locator('.pv-row').nth(0).inner_text())
    chk(t+'file text is shown as plain text, never run',E("window.__xss")is None and pg.locator('.pv-row img').count()==0 and pg.locator('.pv-row script').count()==0)
    chk(t+'file can be downloaded by admin',pg.locator('[data-dl]').count()==1)
    pg.locator('.pv-row').nth(1).locator('[data-pv=edit]').click();pg.wait_for_timeout(400)
    pg.screenshot(path=f'{SH}/03-admin-preview-{tag}.png',full_page=True)
    pg.locator('.pv-row').nth(1).locator('input[data-f=start_date]').fill('2027-03-20');pg.wait_for_timeout(400)
    pg.locator('.pv-row').nth(1).locator('[data-pv=done]').click();pg.wait_for_timeout(400)
    chk(t+'adding the year makes the row publishable',pg.locator('.pv-row').nth(1).locator('input[data-pv=inc]').is_checked())
    pg.locator('[data-apprid]').check()
    pg.locator('[data-pubid]').click();pg.wait_for_timeout(900)
    pub=[a for f,a in E("_log.rpc") if f=='calendar_publish'][-1]
    names=[e['name'] for e in pub['p_events']]
    chk(t+'only ticked, complete rows are published',pub['p_id']=='sub-adm' and 'Summer Field' in names and 'Spring 3D Classic' in names and dupn not in names and len(names)==3)
    chk(t+'published rows carry dates, venue, club',all(e['start_date'] and e['venue'] and e['club'] for e in pub['p_events']))
    chk(t+'admin can approve the person for next time',len(E("_log.appr"))==1 and E("_log.appr")[0]['email']=='new.person@club.test')
    chk(t+'admin sees the published count','3 events published' in pg.locator('.adm-cal').inner_text())
    pg.locator('[data-adtab=received]').click();pg.wait_for_timeout(300)
    chk(t+'waiting tab lists the unread upload',pg.locator('.adm-cal').count()==1 and 'Waiting for the reader' in pg.locator('.adm-cal').inner_text())
    # ---- non-admin cannot use the admin page ----
    E(MOCK,['someone@else.test',False,[]]);E("location.hash='#/admin'");E("location.hash='#/admin/calendars'");pg.wait_for_timeout(700)
    chk(t+'non-admin sees only the admins-only note','only for Archery Calendar admins' in pg.locator('#view').inner_text() and pg.locator('.adm-cal').count()==0)
    # ---- old bulk wording gone, other pages ----
    pg.goto(f'http://localhost:{PORT}/#/privacy');pg.wait_for_timeout(1200)
    chk(t+'privacy page has the calendar upload line','Send us your calendar' in pg.locator('#view').inner_text())
    chk(t+'no emoji or purple in the new screens',E("(()=>{const bad=/rgb\\(1[0-9]{2}, [0-9]{1,2}, 2[0-9]{2}\\)/;return [...document.querySelectorAll('#view *')].every(e=>!bad.test(getComputedStyle(e).color))})()"))
    chk(t+'no page errors',not errs)
    if errs:print(errs)
    ctx.close()
  b.close()
srv.terminate()
print(f'\n{len(ok)} passed, {len(bad)} failed');sys.exit(1 if bad else 0)
