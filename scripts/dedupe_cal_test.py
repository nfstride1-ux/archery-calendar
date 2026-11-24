# Calendar day list: no duplicate diary copies, and a one-event day opens the event page.
# Local:  python3 scripts/dedupe_cal_test.py
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = '8811'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
BASE = f'http://localhost:{PORT}/'
ok, bad = [], []

def chk(n, c):
    (ok if c else bad).append(n)
    print(('PASS ' if c else 'FAIL ') + n, flush=True)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--headless=new'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
        pg.goto(BASE + '#/browse/AUS')
        pg.wait_for_function("typeof EV!=='undefined'&&EV.length>0&&typeof uniqueEvents==='function'", timeout=20000)
        pg.wait_for_timeout(400)

        info = pg.evaluate("""() => {
          Object.assign(BF, {state:'WA', scope:'all', q:'', disc:'', cat:'', ost:'', club:'', clubId:'', past:false, day:''});
          render();
          const src = EV.find(x => x.id === 'ad-kalamunda-governor-stirling-archers-72-arrows-night-2026-11-26-90817');
          if (!src) return {error:'no kalamunda record', evs: EV.filter(x => /Kalamunda/i.test(x.name||'') && x.start_date==='2026-11-26').map(x=>x.id)};
          const copies = [2,3,4,5].map(n => Object.assign({}, src, {id: src.id + '-' + n, registration_url: n===5 ? null : src.registration_url}));
          copies.forEach(c => { EV.push(c); BYID[c.id] = c; });
          render();
          MCAL['find-au'].m = '2026-11';
          MCAL['find-au'].d = '2026-11-26';
          render();
          const rows = [...document.querySelectorAll('.mcal[data-mck="find-au"] .mc-row')].map(a => ({
            id: decodeURIComponent((a.getAttribute('href')||'').replace('#/shoot/','')),
            name: (a.querySelector('.mc-rn')||{}).textContent||''
          }));
          const kal = rows.filter(r => /72 Arrows - Night Shoot/i.test(r.name) && /Kalamunda/i.test(r.name));
          const mel = rows.filter(r => /Midweek Twilight Shoot/i.test(r.name) && /Melville/i.test(r.name));
          const btn = document.querySelector('.mcal[data-mck="find-au"] button[data-mcd="2026-11-26"]');
          return {
            title: (document.querySelector('.mc-title')||{}).textContent||'',
            kal: kal.length, kalIds: kal.map(r=>r.id), mel: mel.length,
            rowCount: rows.length, names: rows.map(r=>r.name),
            hasMcid: !!(btn && btn.dataset.mcid),
            cnt: btn && (btn.querySelector('.mc-cnt')||{}).textContent,
            heading: (document.querySelector('.mcal[data-mck="find-au"] .mc-lh')||{}).textContent||''
          };
        }""")
        print('INFO', info, flush=True)
        if info.get('error'):
            chk('found the Kalamunda 26 Nov record', False)
        else:
            chk('calendar is on November 2026', 'november' in (info.get('title') or '').lower())
            chk('26 Nov lists Kalamunda Night Shoot once (guard drops 4 injected copies)', info['kal'] == 1)
            chk('the kept Kalamunda id is the unsuffixed record', info.get('kalIds') == ['ad-kalamunda-governor-stirling-archers-72-arrows-night-2026-11-26-90817'])
            chk('26 Nov still lists the Melville twilight shoot once', info['mel'] == 1)
            chk('26 Nov has more than one distinct event, so it stays a day list', info['rowCount'] >= 2 and not info['hasMcid'])

        one = pg.evaluate("""() => {
          const btns = [...document.querySelectorAll('.mcal[data-mck="find-au"] button[data-mcid]')];
          // Prefer a future day in the current month after switching to a month that has a one-event day.
          Object.assign(BF, {state:'WA', scope:'all', q:'', disc:'', cat:'', ost:'', club:'', clubId:'', past:false, day:''});
          render();
          MCAL['find-au'].m = '2026-12';
          MCAL['find-au'].d = '';
          render();
          const dec = [...document.querySelectorAll('.mcal[data-mck="find-au"] button[data-mcid]')].map(b => ({day: b.dataset.mcd, id: b.dataset.mcid}));
          const pick = dec.find(x => x.day >= '2026-11-24') || dec[0];
          return {title: (document.querySelector('.mc-title')||{}).textContent||'', count: dec.length, pick};
        }""")
        print('ONE', one, flush=True)
        if not one.get('pick'):
            chk('found a one-event WA day to click', False)
        else:
            day, eid = one['pick']['day'], one['pick']['id']
            btn = pg.locator(f'.mcal[data-mck="find-au"] button[data-mcd="{day}"]')
            chk('the one-event day button has data-mcid', btn.get_attribute('data-mcid') == eid)
            btn.click()
            pg.wait_for_timeout(500)
            h = pg.evaluate('location.hash')
            chk('clicking a one-event day opens that event page', h.startswith('#/shoot/') and eid in h)
            pg.go_back()
            pg.wait_for_timeout(500)
            h2 = pg.evaluate('location.hash')
            cal = pg.locator('.mcal[data-mck="find-au"]').count()
            chk('Back returns to the Find events calendar', h2.startswith('#/browse') and cal == 1)

        chk('no page errors', not errs)
        if errs:
            print('ERRS', errs, flush=True)
        ctx.close(); b.close()
finally:
    srv.terminate()

print(f'{len(ok)} passed, {len(bad)} failed')
if bad:
    sys.exit(1)
