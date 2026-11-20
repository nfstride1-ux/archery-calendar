/* Lingkana League nights are on any signed-in archer's My events (not the public catalogue).
   node scripts/privatecal_test.js
   Checks the signed-in gate, the seven dates, the ScoreTool results URLs, and that public files do not list the nights. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pc = require('../privatecal.js');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const t = (name, cond, info) => { if (cond) return; fail++; console.log('FAIL', name, info || ''); };

t('signed out sees nothing', pc.pcEventsFor(null).length === 0 && pc.pcEventsFor(undefined).length === 0 && pc.pcEvents().length === 0);
t('other signed-in account sees it too', pc.pcEventsFor({email: 'archer@example.com'}).length === 7);
t('blank email sees nothing', pc.pcEventsFor({email: '  '}).length === 0);

const dates = ['2026-11-18','2026-12-02','2026-12-16','2026-12-30','2027-01-13','2027-01-27','2027-02-10'];
t('seven nights', pc.PC_NIGHTS.length === 7);
['archer@example.com'].concat(pc.PC_OWNER_EMAILS).forEach(em => {
  const L = pc.pcEventsFor({id: 'signed-in', email: em});
  t(em + ' sees seven', L.length === 7);
  L.forEach((x, i) => {
    const wd = new Intl.DateTimeFormat('en-AU', {weekday: 'long', timeZone: 'Australia/Perth'}).format(new Date(x.start_date + 'T12:00:00+08:00'));
    t('wednesday ' + x.start_date, wd === 'Wednesday' && x.start_date === dates[i] && x.night === i + 1);
    t('perth hours ' + x.night, x.tz === 'Australia/Perth' && /6:00 pm/.test(x.start_times) && /6:30 pm/.test(x.start_times));
    t('not-public flag ' + x.night, x._ownerOnly === true && x.info_only === true);
    const expect = i < 6 ? pc.PC_BASE + '#lk-results&n=' + (i + 1) : pc.PC_LEAGUE_URL;
    t('results url ' + x.night, x.results_url === expect && pc.pcResultsUrl(x.night) === expect, x.results_url);
    t('hidden from signed-out ' + x.id, pc.pcByIdFor(null, x.id) === null);
    t(em + ' can open ' + x.id, pc.pcByIdFor({email: em}, x.id) && pc.pcByIdFor({email: em}, x.id).id === x.id);
    const page = pc.pcShootHtml(x);
    t('detail links results ' + x.night, page.includes(expect.replace(/&/g, '&amp;')) && page.includes('id="pcResults"'));
    t('detail omits the invite code ' + x.night, !page.includes('lk-onion26') && !/Invite code/i.test(page) && !page.includes('pcInvite') && !/password/i.test(page));
    if (i === 6) t('shoot-up copy', /warm-up/.test(x.round) && /top 12/.test(x.round) && /Shoot-up/.test(x.name));
    else t('lancaster copy ' + x.night, /Lancaster 660/.test(x.round) && /best 4 of 6/i.test(x.round) && /18 m/.test(x.round));
  });
});
t('league home', pc.PC_LEAGUE_URL === 'https://nfstride1-ux.github.io/scoretool-demo/#lk-home');
global.AUTH = {user: {email: pc.PC_OWNER_EMAILS[0]}};
t('owner season list is not rendered', pc.pcSeasonHtml() === '');
delete global.AUTH;
t('no scoring secret in the nights', !/0b2b4ba6|LK_PW|scoring password/i.test(JSON.stringify(pc.PC_NIGHTS)));
t('script and night data omit the invite code', !/lk-onion26|Invite code|pcInvite/.test(fs.readFileSync(path.join(ROOT, 'privatecal.js'), 'utf8')) && !pc.PC_NIGHTS.some(x => x.invite));

const season = pc.pcShootHtml(pc.PC_NIGHTS[0]);
t('address only on the private detail', season.includes('107 Robinson Ave'));

const allow = new Set(['privatecal.js', 'scripts/privatecal_test.js', 'scripts/privatecal_ui_test.py'].map(p => path.join(ROOT, p)));
const needles = ['Lingkana League', 'lk-onion26', 'lk-night-', '107 Robinson Ave', 'Robinson Ave, Belmont'];
function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = path.join(dir, name);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else if (st.size < 8e6) acc.push(p);
  }
  return acc;
}
const files = walk(ROOT, []);
for (const p of files) {
  if (allow.has(p)) continue;
  const rel = path.relative(ROOT, p);
  if (!/\.(html|js|json|xml|txt|md)$/i.test(p)) continue;
  let text; try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
  for (const n of needles) t('public file omits ' + n + ' in ' + rel, !text.includes(n), rel);
}
t('script is loaded', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('privatecal.js'));
t('service worker caches it', fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('./privatecal.js'));
t('not in the public event catalogue', !fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8').toLowerCase().includes('lingkana'));
t('sitemap has no private night', !fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').includes('lk-night-'));

console.log(fail ? fail + ' failed' : 'privatecal_test: all passed');
process.exit(fail ? 1 : 0);
