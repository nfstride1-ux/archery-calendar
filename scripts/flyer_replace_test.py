# Save live replaces a flyer for every permitted editor, and does not write for anyone else.
# Phone width. Supabase is mocked. The Baldivis breakfast event already has a 2025 flyer.
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SH = os.path.join(ROOT, 'shots-flyer')
os.makedirs(SH, exist_ok=True)
PORT = '8802'
EV = 'awa-baldivis-breakfast-2026'
ok, bad = [], []

def chk(n, c):
    (ok if c else bad).append(n)
    print(('PASS ' if c else 'FAIL ') + n, flush=True)

def jpeg(path):
    im = Image.new('RGB', (80, 120), (240, 220, 40))
    im.save(path, 'JPEG', quality=85)

def png(path):
    im = Image.new('RGB', (200, 200), (20, 90, 180))
    im.save(path, 'PNG')

jpeg(os.path.join(SH, 'flyer.jpg'))
png(os.path.join(SH, 'flyer.png'))
open(os.path.join(SH, 'flyer.pdf'), 'wb').write(b'%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)

SIGN = r"""(o) => {
  const email = o.email, id = o.id, adminRpc = o.adminRpc, approved = o.approved;
  AUTH.on = true; AUTH.ready = true; AUTH.configured = true;
  AUTH.user = {id: id, email: email};
  ADMNAV.ok = !!adminRpc; ADMNAV.uid = id; ADMNAV.t = Date.now(); ADMNAV.n = 0;
  SUBAPP[String(email).toLowerCase()] = !!approved;
  window._up = []; window._wr = []; window._failOverrides = false;
  const finish = (row) => Promise.resolve(row);
  AUTH.client = {
    rpc: async (name) => {
      if (name === 'is_admin') return {data: !!adminRpc, error: null};
      if (name === 'email_preapproved') return {data: !!approved, error: null};
      return {data: null, error: null};
    },
    storage: {from: () => ({
      upload: async (path, file, opts) => {
        if (window._failOverrides && String(path).indexOf('overrides/') === 0)
          return {error: {message: 'new row violates row-level security policy'}};
        window._up.push({path: path, upsert: !!(opts && opts.upsert), type: opts && opts.contentType, name: file && file.name, fileType: file && file.type, size: file && file.size});
        return {error: null};
      },
      getPublicUrl: (path) => ({data: {publicUrl: 'https://sllsqpfqwckwtljzjxli.supabase.co/storage/v1/object/public/event-flyers/' + path}})
    })},
    from: (table) => {
      const api = {
        upsert(row){ window._wr.push({table: table, op: 'upsert', row: row}); return finish({error: null}); },
        insert(row){ window._wr.push({table: table, op: 'insert', row: row});
          const res = {data: {id: 'row1', status: (adminRpc || approved) ? 'live' : 'pending'}, error: null};
          return {select(){ return {single(){ return finish(res); }}; }}; },
        select(){ return api; },
        eq(){ return finish({error: null, count: 0, data: []}); },
        order(){ return api; },
        limit(){ return api; }
      };
      return api;
    }
  };
}"""

def boot(pg):
    pg.goto(f'http://127.0.0.1:{PORT}/', wait_until='domcontentloaded')
    pg.wait_for_function(f"() => typeof BYID !== 'undefined' && BYID['{EV}'] && typeof AUTH !== 'undefined' && AUTH.ready", timeout=30000)
    # A correction still posts the form. Stop that leaving the page (and emailing anyone).
    pg.evaluate("""() => { HTMLFormElement.prototype.submit = function(){ window._posted = (window._posted || 0) + 1; window._snap = {up: (window._up || []).slice(), wr: (window._wr || []).slice()}; }; }""")

def open_fix(pg, email, uid, admin_rpc, approved, fail_overrides=False):
    pg.evaluate(SIGN, {'email': email, 'id': uid, 'adminRpc': admin_rpc, 'approved': approved})
    if fail_overrides:
        pg.evaluate("() => { window._failOverrides = true }")
    pg.evaluate(f"() => {{ location.hash = '#/fix/{EV}'; if (document.body.dataset.page !== 'fix') render(); else render(); }}")
    pg.wait_for_selector('#fixForm', timeout=8000)

def edit_flyer(pg, path):
    pg.click('[data-pen="flyer"]')
    pg.wait_for_selector('#fx_file:not([disabled])')
    pg.set_input_files('#fx_file', path)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--headless=new'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    mailed = []
    ctx.route('**://formsubmit.co/**', lambda r: (mailed.append(r.request.url), r.fulfill(status=200, body='ok')))
    ctx.route('https://*.supabase.co/**', lambda r: r.fulfill(status=401, content_type='application/json', body='{"error":"mocked"}'))
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    boot(pg)
    had = pg.evaluate(f"() => BYID['{EV}'].flyer_label")
    chk('breakfast event already has a flyer to replace', '2025' in (had or ''))

    # Site owner, one of the two UI admin emails.
    open_fix(pg, 'nfshold@gmail.com', '11111111-1111-1111-1111-111111111111', True, True)
    chk('admin sees Save live', pg.locator('#fixBtn').inner_text() == 'Save live')
    chk('admin banner does not call them only an approved editor', 'an admin' in pg.locator('#fxAdmin').inner_text())
    edit_flyer(pg, os.path.join(SH, 'flyer.jpg'))
    pg.click('[data-pen="enotes"]')
    pg.fill('#fx_enotes', 'New breakfast flyer from the club.')
    pg.check('#fx_cancel')
    pg.click('#fixBtn')
    pg.wait_for_selector('#fxLive:not([hidden])', timeout=8000)
    up = pg.evaluate('() => window._up')
    wr = pg.evaluate('() => window._wr')
    chk('admin upload is a plain insert under overrides/', len(up) == 1 and up[0]['upsert'] is False and up[0]['path'].startswith(f'overrides/{EV}-') and up[0]['path'].endswith('.jpg'))
    chk('admin replace writes the listing, not an email', len(wr) == 1 and wr[0]['table'] == 'event_overrides' and wr[0]['op'] == 'upsert' and not mailed)
    fields = wr[0]['row']['fields']
    chk('replaced flyer is current and the other fields saved too', fields.get('flyer_is_current') is True and fields.get('flyer_web', '').endswith(up[0]['path']) and fields.get('flyer_is_pdf') is False and fields.get('notes') == 'New breakfast flyer from the club.' and fields.get('cancelled') is True)
    chk('no RLS error on screen', pg.locator('#fixErr').inner_text() == '' and 'Saved live' in pg.locator('#fxLive').inner_text())
    pg.screenshot(path=os.path.join(SH, 'admin-saved.png'))

    # Second file, after the automatic shrink, replaces the one just saved.
    edit_flyer(pg, os.path.join(SH, 'flyer.png'))
    pg.wait_for_function("() => (document.querySelector('#fx_file_n') || {}).textContent && document.querySelector('#fx_file_n').textContent.indexOf('shrunk') >= 0", timeout=8000)
    pg.click('#fixBtn')
    pg.wait_for_function("() => window._up.length === 2", timeout=8000)
    up2 = pg.evaluate('() => window._up')
    chk('shrunk photo uploads as a new jpeg and replaces the flyer', up2[1]['path'].endswith('.jpg') and up2[1]['path'] != up2[0]['path'] and up2[1]['type'] == 'image/jpeg' and up2[1]['upsert'] is False)
    chk('second save still has no error', pg.locator('#fixErr').inner_text() == '')

    # PDF replace.
    edit_flyer(pg, os.path.join(SH, 'flyer.pdf'))
    pg.click('#fixBtn')
    pg.wait_for_function("() => window._up.length === 3", timeout=8000)
    up3 = pg.evaluate('() => window._up')
    wr3 = pg.evaluate('() => window._wr')
    chk('pdf replace stores the pdf url', up3[2]['path'].endswith('.pdf') and wr3[-1]['row']['fields'].get('flyer_is_pdf') is True and wr3[-1]['row']['fields'].get('flyer_url', '').endswith('.pdf') and not wr3[-1]['row']['fields'].get('flyer_web'))

    # Another admin, not the site owner and not in the hardcoded email list.
    open_fix(pg, 'other.admin@example.com', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', True, False)
    chk('any database admin gets Save live', 'an admin' in pg.locator('#fxAdmin').inner_text() and pg.locator('#fixBtn').inner_text() == 'Save live')
    edit_flyer(pg, os.path.join(SH, 'flyer.jpg'))
    pg.click('#fixBtn')
    pg.wait_for_selector('#fxLive:not([hidden])', timeout=8000)
    upa = pg.evaluate('() => window._up')
    wra = pg.evaluate('() => window._wr')
    chk('other admin writes overrides/ and the listing', upa[0]['path'].startswith('overrides/') and wra[0]['table'] == 'event_overrides' and pg.locator('#fixErr').inner_text() == '')

    # overrides/ insert rejected: fall back to the folder this signed-in admin may already use.
    open_fix(pg, 'nfshold@gmail.com', '11111111-1111-1111-1111-111111111111', True, True, True)
    edit_flyer(pg, os.path.join(SH, 'flyer.jpg'))
    pg.click('#fixBtn')
    pg.wait_for_selector('#fxLive:not([hidden])', timeout=8000)
    upf = pg.evaluate('() => window._up')
    chk('RLS on overrides/ retries the editor\'s own folder and still saves', len(upf) == 1 and upf[0]['path'].startswith('11111111-1111-1111-1111-111111111111/') and pg.locator('#fixErr').inner_text() == '')

    # Approved club editor: not an admin. Same Save live, own folder, listed-event update.
    open_fix(pg, 'events@archerywa.com.au', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', False, True)
    chk('approved editor is not described as an admin', 'approved editor' in pg.locator('#fxAdmin').inner_text() and pg.locator('#fixBtn').inner_text() == 'Save live')
    edit_flyer(pg, os.path.join(SH, 'flyer.pdf'))
    pg.click('#fixBtn')
    pg.wait_for_selector('#fxLive:not([hidden])', timeout=8000)
    upe = pg.evaluate('() => window._up')
    wre = pg.evaluate('() => window._wr')
    chk('approved editor uploads into their own folder', len(upe) == 1 and upe[0]['path'].startswith('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/') and upe[0]['upsert'] is False and upe[0]['path'].endswith('.pdf'))
    chk('approved editor updates the listed event and does not touch event_overrides directly', len(wre) == 1 and wre[0]['table'] == 'submitted_events' and wre[0]['row']['updates_event_id'] == EV and wre[0]['row']['merge_fields'].get('flyer_is_pdf') is True and wre[0]['row']['merge_fields'].get('flyer_url', '').endswith('.pdf'))
    chk('approved editor save shows live, no RLS error', pg.locator('#fixErr').inner_text() == '' and 'Saved live' in pg.locator('#fxLive').inner_text())
    pg.screenshot(path=os.path.join(SH, 'editor-saved.png'))

    # Permission arrives from the database after the form has drawn (not only the two hardcoded emails).
    pg.evaluate("""() => { AUTH.user = {id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email:'events@archerywa.com.au'}; ADMNAV.ok = false; ADMNAV.uid = null; ADMNAV.t = 0; delete SUBAPP['events@archerywa.com.au']; }""")
    pg.evaluate("() => { location.hash = '#/fix/' + %s; render(); }" % repr(EV))
    pg.wait_for_function("() => { const b = document.querySelector('#fixBtn'); return b && b.textContent.indexOf('Save live') === 0; }", timeout=8000)
    chk('approved editor Save live appears once the database confirms them', 'approved editor' in pg.locator('#fxAdmin').inner_text())

    # Signed-in, no permission: correction email only. No storage write.
    before = len(mailed)
    open_fix(pg, 'stranger@example.com', 'cccccccc-cccc-cccc-cccc-cccccccccccc', False, False)
    chk('stranger is asked to send a correction', pg.locator('#fixBtn').inner_text() == 'Send correction' and pg.locator('#fxAdmin').count() == 0)
    edit_flyer(pg, os.path.join(SH, 'flyer.jpg'))
    pg.fill('#fx_who', 'Pat Archer')
    pg.fill('#fx_club', 'Somewhere Archers')
    pg.select_option('#fx_role', 'Secretary')
    pg.fill('#fx_email', 'stranger@example.com')
    pg.click('#fixBtn')
    pg.wait_for_function("() => window._posted >= 1", timeout=8000)
    snap = pg.evaluate('() => window._snap')
    chk('stranger flyer is not uploaded and the listing is not written', snap['up'] == [] and snap['wr'] == [] and len(mailed) == before)

    # Signed out: no form, no write.
    pg.evaluate("() => { AUTH.user = null; window._up = []; window._wr = []; location.hash = '#/fix/' + %s; render(); }" % repr(EV))
    pg.wait_for_timeout(400)
    chk('signed-out visitor does not get Save live', pg.locator('#fixBtn').count() == 0 and pg.evaluate('() => window._up.length + window._wr.length') == 0)
    chk('no page errors', not errs)
    if errs:
        print('PAGEERROR', errs)
    b.close()

srv.terminate()
print(f'{len(ok)} passed, {len(bad)} failed')
if bad:
    print('FAILED:', ', '.join(bad))
    sys.exit(1)
