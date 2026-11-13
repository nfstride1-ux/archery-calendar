#!/usr/bin/env python3
"""Browser checks for the owner-only Lingkana nights.

Signed in as a site-owner admin email, My events lists all seven nights and each one links to ScoreTool.
Signed out, and a different signed-in account, do not see them. Find events, search, Near me, What's new,
the sitemap and a direct event URL do not list them.

  python3 scripts/privatecal_ui_test.py
"""
import os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = Path('/opt/cursor/artifacts')
ART.mkdir(parents=True, exist_ok=True)
PORT = '8765'
BASE = f'http://127.0.0.1:{PORT}'
CHROME = '/usr/local/bin/google-chrome' if os.path.exists('/usr/local/bin/google-chrome') else '/usr/bin/google-chrome'
SECRET = ('Lingkana', 'lk-onion26', 'lk-night-', '107 Robinson', 'Robinson Ave')
fail = 0

def t(name, cond, info=''):
    global fail
    if cond:
        print('ok', name)
    else:
        fail += 1
        print('FAIL', name, info)

def view_text(page):
    return page.locator('#view').inner_text()

def clean(page, where):
    text = view_text(page)
    for s in SECRET:
        t(f'{where} hides {s}', s not in text, s)

def boot(page, hash_):
    page.goto(BASE + '/' + hash_, wait_until='domcontentloaded')
    page.wait_for_function(
        "() => typeof EV !== 'undefined' && EV.length > 100 && typeof pcEvents === 'function' && document.body.dataset.page && !document.querySelector('#view .loading')",
        timeout=45000)

def as_user(page, email, hash_='#/calendar'):
    page.evaluate("""([email, hash]) => {
      AUTH.user = email ? {id: 'ui-test-' + email, email} : null;
      if (hash) location.hash = hash;
      CM = [2026, 10];
      render();
    }""", [email, hash_])
    page.wait_for_timeout(200)

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.4)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, args=['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'])
            ctx = browser.new_context(viewport={'width': 1100, 'height': 900}, device_scale_factor=1)
            ctx.add_init_script("""try{
              localStorage.setItem('archcal.instDismissed', String(Date.now()));
              localStorage.setItem('archcal.appVidSeen','1');
              localStorage.setItem('archreg.popup.v1', JSON.stringify({seen:Date.now(), dismissed:Date.now()}));
              localStorage.setItem('archreg.v1', JSON.stringify({homeCountry:'AUS', v:2}));
            }catch(e){}""")
            page = ctx.new_page()
            boot(page, '#/calendar')
            page.evaluate("() => { CM = [2026, 10]; render(); }")
            page.wait_for_selector('.grid [data-day="2026-11-18"]')
            clean(page, 'signed-out calendar')
            label = page.locator('[data-day="2026-11-18"]').get_attribute('aria-label') or ''
            t('signed-out 18 Nov is not a league night', 'Lingkana' not in label, label)
            t('signed-out has no league list', page.locator('#pcLeague').count() == 0)
            page.screenshot(path=str(ART / 'lingkana-signed-out-my-events.png'), full_page=True)

            page.evaluate("() => { location.hash = '#/home'; }")
            page.wait_for_function("() => document.body.dataset.page === 'home'")
            clean(page, 'signed-out home')

            page.evaluate("() => { location.hash = '#/search?q=Lingkana'; }")
            page.wait_for_function("() => document.body.dataset.page === 'search' && document.querySelector('#view')")
            page.wait_for_timeout(300)
            search_text = view_text(page)
            t('search echoes the query and lists no league night', 'Nothing matches' in search_text and 'Lingkana League' not in search_text and 'lk-night-' not in search_text and page.locator('#view a.mc-row, #view .ev, #view .gs-list a').count() == 0, search_text[:240])
            for s in ('lk-onion26', 'lk-night-', '107 Robinson', 'Robinson Ave'):
                t(f'signed-out search hides {s}', s not in search_text)
            page.screenshot(path=str(ART / 'lingkana-search-absent.png'), full_page=True)

            page.evaluate("() => { BF.q = 'Lingkana'; location.hash = '#/browse'; }")
            page.wait_for_function("() => document.body.dataset.page === 'browse'")
            page.wait_for_timeout(400)
            find_text = view_text(page)
            t('find events lists no league night', 'Lingkana League' not in find_text and 'lk-night-' not in find_text and 'No events match' in find_text, find_text[:300])
            for s in ('lk-onion26', 'lk-night-', '107 Robinson', 'Robinson Ave'):
                t(f'signed-out find events hides {s}', s not in find_text)

            page.evaluate("() => { location.hash = '#/near'; }")
            page.wait_for_function("() => document.body.dataset.page === 'near'")
            page.wait_for_timeout(300)
            clean(page, 'signed-out near me')

            page.evaluate("() => { location.hash = '#/whatsnew'; }")
            page.wait_for_function("() => document.body.dataset.page === 'whatsnew'")
            clean(page, "signed-out what's new")

            page.evaluate("() => { location.hash = '#/intl'; }")
            page.wait_for_function("() => document.body.dataset.page === 'intl'")
            page.wait_for_timeout(300)
            clean(page, 'signed-out international')

            page.evaluate("() => { location.hash = '#/shoot/lk-night-1-2026-11-18'; }")
            page.wait_for_function("() => document.body.dataset.page === 'shoot'")
            clean(page, 'signed-out event url')
            t('signed-out event url is not found', 'find that event' in view_text(page).lower() or "can't find" in view_text(page).lower() or 'can’t find' in view_text(page).lower())

            # Public catalogue in memory, and the sitemap the server actually sends.
            leaked = page.evaluate("""() => ({
              ev: (typeof EV !== 'undefined' ? EV : []).some(x => x && (x._ownerOnly || /lingkana/i.test(x.name || '') || /robinson ave/i.test(x.location || ''))),
              byid: typeof BYID !== 'undefined' && !!BYID['lk-night-1-2026-11-18']
            })""")
            t('not in the loaded public events', leaked['ev'] is False and leaked['byid'] is False, str(leaked))
            sm = page.evaluate("async () => (await fetch('sitemap.xml')).text()")
            t('sitemap omits the nights', 'lk-night-' not in sm and 'Lingkana' not in sm)

            for email in ('nfshold@gmail.com', 'nfstride1@gmail.com'):
                as_user(page, email, '#/calendar')
                page.wait_for_selector('#pcLeague')
                nights = page.locator('[data-pc-night]')
                t(email + ' sees seven nights', nights.count() == 7, str(nights.count()))
                hrefs = page.eval_on_selector_all('[data-pc-res]', 'els => els.map(e => [e.getAttribute("data-pc-res"), e.getAttribute("href")])')
                t(email + ' seven result links', len(hrefs) == 7, str(hrefs))
                for n, href in hrefs:
                    n = int(n)
                    want = f'#lk-results&n={n}' if n <= 6 else '#lk-home'
                    t(f'{email} night {n} results', want in (href or ''), href)
                label = page.locator('[data-day="2026-11-18"]').get_attribute('aria-label') or ''
                t(email + ' 18 Nov is on the calendar', 'Lingkana' in label, label)
                if email.startswith('nfshold'):
                    page.screenshot(path=str(ART / 'lingkana-my-events-owner.png'), full_page=True)
                    page.locator('a.pc-open').first.click()
                    page.wait_for_selector('#pcResults')
                    res = page.locator('#pcResults').get_attribute('href') or ''
                    t('opened night links to night 1 results', '#lk-results&n=1' in res, res)
                    t('opened night shows the venue', '107 Robinson Ave' in view_text(page))
                    t('opened night shows the invite code', page.locator('#pcInvite').inner_text() == 'lk-onion26')
                    t('opened night has no scoring password', 'password' not in view_text(page).lower())
                    page.screenshot(path=str(ART / 'lingkana-night-results-link.png'), full_page=True)

            as_user(page, 'archer@example.com', '#/calendar')
            page.wait_for_timeout(200)
            clean(page, 'other account calendar')
            t('other account has no league list', page.locator('#pcLeague').count() == 0)
            page.evaluate("() => { location.hash = '#/shoot/lk-night-1-2026-11-18'; render(); }")
            page.wait_for_timeout(200)
            clean(page, 'other account event url')
            t('other account event url is not found', 'find that event' in view_text(page).lower() or 'can’t find' in view_text(page).lower() or "can't find" in view_text(page).lower())

            # Back to signed out after having been the owner: the nights must disappear without a reload of secrets into the public lists.
            as_user(page, None, '#/calendar')
            page.wait_for_timeout(200)
            clean(page, 'signed out again')
            still = page.evaluate("""() => (typeof EV !== 'undefined' ? EV : []).some(x => x && (x._ownerOnly || /lingkana/i.test(JSON.stringify(x))))""")
            t('signing in did not publish the nights', still is False)
            browser.close()
    finally:
        srv.kill()
    print(f'{fail} failed' if fail else 'privatecal_ui_test: all passed')
    return fail

if __name__ == '__main__':
    sys.exit(1 if main() else 0)
