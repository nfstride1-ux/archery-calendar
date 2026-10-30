/* Archery Calendar – prototype PWA. No build step. All user data stays in localStorage on this device. */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'archreg.v1';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT = {
  countries: ['AUS'],                          // national calendars to show
  orgs: ['aba','archery-wa','archery-australia'], // extra bodies
  world: true,                                 // world-level events (WA, Vegas, Lancaster, TAC, ASA, Masters…)
  saved: {},                                   // id -> {added}
  entries: {},                                 // id -> {date, amount, currency, ref, link, notes}
  remindDays: [14, 2, 1],
  closeDays: [7, 2],
  notified: {},                                // reminder key -> timestamp
  notify: false,
  states: [],                                  // AUS scope: empty = all states
  groups: ['aa','aba','awa','taa'],                  // AUS scope: Archery Australia (incl. RGBs/clubs), ABA, Archery WA
  myClubs: [],                                 // club ids I belong to (clubs.json)
  homeClub: null,                              // one of myClubs
  watchClubs: [],                              // clubs I watch
  clubNotify: false,                           // browser notification for new events / flyers from my clubs (needs notifications on)
  clubSeen: {},                                // device only: event id -> flyer key, for "New" detection
  clubSeenClubs: {},                           // device only: club ids whose events have been baselined
  clubNew: {}                                  // device only: event id -> {t, why: 'event'|'flyer'}
};
let S = load(), EV = [], ORGS = [], CLUBS = [], CLUB = {}, BYID = {}, CMAP = {}, PH = {}, SCOPE = 'WORLD';
const STATES = [['WA','Western Australia'],['SA','South Australia'],['VIC','Victoria'],['NSW','New South Wales'],['ACT','Australian Capital Territory'],['QLD','Queensland'],['TAS','Tasmania'],['NT','Northern Territory']];
const GROUPS = [['aa','Archery Australia','State associations (RGBs) and clubs – target, field, indoor, clout, QREs'],['aba','Australian Bowhunters Association (ABA)','All 10 branches (A–J) – field, 3D, IFAA'],['awa','Archery WA','WA state events, QREs and club events'],['taa','Traditional Archery Australia (TAA)','Traditional archery musters and club events from TAA-affiliated clubs']];
const AUS = () => SCOPE === 'AUS';
const SITE = Object.assign({flyers:'local', ads:true, contact:'nfshold@gmail.com'}, window.SITE || {});
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const pd = s => s ? new Date(s + 'T00:00:00') : null;
const daysTo = s => Math.round((pd(s) - today()) / 864e5);

function load(){ try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return {...DEFAULT}; } }
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); if (typeof AUTH !== 'undefined' && AUTH.sync) AUTH.sync.track(); }
/* ---------- my entry status: none | entered | paid ----------
   Works for ANY event (no need to save it first): marking entered/paid adds it to My events automatically.
   Old records (before status existed) meant "entered and paid". */
const ST = id => { const e = S.entries[id]; return !e ? 'none' : (e.status === 'entered' ? 'entered' : 'paid'); };
const ST_TXT = {none:'☐ Not entered', entered:'✓ Entered · ☐ not paid', paid:'✓ Entered · $ Paid'};
function setStatus(id, st){
  const x = BYID[id]; if (!x) return;
  const was = ST(id);
  if (st === 'none') delete S.entries[id];
  else { const e = S.entries[id] || {date: iso(new Date()), currency: x.country_code === 'USA' ? 'USD' : 'AUD'};
    e.status = st; if (!e.date) e.date = iso(new Date()); if (st === 'paid' && !e.paid_date) e.paid_date = iso(new Date());
    e.saved = new Date().toISOString(); S.entries[id] = e; }
  const added = st !== 'none' && !S.saved[id]; if (added) S.saved[id] = {added: iso(new Date())};
  save();
  toast(st === 'none' ? '☐ Marked as not entered' : st === 'entered' ? `✓ Marked as entered${was === 'paid' ? ' – not paid' : ''}${added ? ' · added to My events' : ''}` : `$ Marked as entered + paid${added ? ' · added to My events' : ''}`);
}
function statusToggles(x, big){
  const s = ST(x.id), n = esc(x.name);
  return `<div class="est${big ? ' big' : ''}" role="group" aria-label="My entry for ${n}">
    <button type="button" class="et" data-ent="${esc(x.id)}" data-st="entered" aria-pressed="${s !== 'none'}"><span class="ico" aria-hidden="true">${s !== 'none' ? '☑' : '☐'}</span> I’ve entered</button>
    <button type="button" class="et" data-ent="${esc(x.id)}" data-st="paid" aria-pressed="${s === 'paid'}"><span class="ico" aria-hidden="true">${s === 'paid' ? '☑' : '☐'}</span> I’ve paid</button></div>`;
}
function bindToggles(root = document){
  root.querySelectorAll('[data-ent]').forEach(b => b.onclick = ev => { ev.stopPropagation(); ev.preventDefault();
    const id = b.dataset.ent, s = ST(id), on = b.getAttribute('aria-pressed') === 'true';
    setStatus(id, b.dataset.st === 'entered' ? (on ? 'none' : 'entered') : (on ? 'entered' : 'paid'));
    const y = scrollY; render(); scrollTo(0, y);
    const nb = document.querySelector(`[data-ent="${CSS.escape(id)}"][data-st="${b.dataset.st}"]`); nb && nb.focus({preventScroll: true}); });
}
/* 'Sign in' in the header: go to the account page and bring the email box into view (also when already there). */
function focusSignin(){ const go = () => { const em = $('#em'), f = em || $('#view .panel'); if (!f) return;
    const r = f.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 20) f.scrollIntoView({block: 'center'});
    if (em && matchMedia('(hover: hover) and (pointer: fine)').matches) em.focus({preventScroll: true}); };
  requestAnimationFrame(() => setTimeout(go, 60)); }
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#navAcct'); if (!a) return;
  if ((location.hash || '').startsWith('#/account')) { e.preventDefault(); focusSignin(); } else setTimeout(focusSignin, 0); });
/* Install as an app: our own small, dismissible bar instead of the browser's prompt; never blocks the page. */
let instEv = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instEv = e; showInstall(); });
window.addEventListener('appinstalled', () => { instEv = null; const b = $('#instBar'); if (b) b.remove(); document.body.classList.remove('has-inst'); });
function showInstall(){
  if (!instEv || $('#instBar') || matchMedia('(display-mode: standalone)').matches) return;
  if (+localStorage.getItem('archcal.instDismissed') > Date.now() - 30 * 864e5) return;     // dismissed: ask again after 30 days
  const b = document.createElement('div'); b.id = 'instBar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Install the app');
  b.innerHTML = `<span>📲 Add Archery Calendar to your home screen</span><button type="button" class="ib-go">Install</button><button type="button" class="ib-x" aria-label="Dismiss">✕</button>`;
  document.body.appendChild(b); document.body.classList.add('has-inst');
  const close = () => { b.remove(); document.body.classList.remove('has-inst'); };
  b.querySelector('.ib-x').onclick = () => { localStorage.setItem('archcal.instDismissed', String(Date.now())); close(); };
  b.querySelector('.ib-go').onclick = async () => { const ev = instEv; instEv = null; close(); if (!ev) return; ev.prompt(); try { const r = await ev.userChoice; if (r && r.outcome === 'dismissed') localStorage.setItem('archcal.instDismissed', String(Date.now())); } catch {} };
}
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

async function boot(){
  $('#todayLbl').textContent = today().toLocaleDateString(LOC(), {weekday:'short', day:'numeric', month:'short'});
  const [e, o, ph, cl] = await Promise.all([fetch('data/events.json').then(r => r.json()), fetch('data/organisations.json').then(r => r.json()), fetch('img/credits.json', {cache: 'no-cache'}).then(r => r.json()).catch(() => ({})), fetch('data/clubs.json').then(r => r.json()).catch(() => ({clubs: []})), fetch('data/club_logos.json').then(r => r.json()).then(j => { LOGO = j.logos || {}; }).catch(() => {}), fetch('data/intl_countries.json').then(r => r.json()).then(j => { ICTRY = j; }).catch(() => {}), fetch('data/results.json').then(r => r.json()).then(j => { RES = j.results || {}; CSHOOT = j.club_shoots || {}; }).catch(() => {})]);
  CLUBS = cl.clubs || []; CLUBS.forEach(c => CLUB[c.id] = c);
  PH = ph; SCOPE = e.scope || 'WORLD';
  migrateSettings();
  EV = e.events.filter(x => !x.info_only || true); ORGS = o.organisations;
  EV.forEach(x => BYID[x.id] = x);
  ORGS.filter(x => x.country_code).forEach(x => { CMAP[x.country_code] = CMAP[x.country_code] || x.country; });
  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // A new service worker takes over at once (skipWaiting + clients.claim); reload once so this tab runs the new code too.
    const hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadSW) return;
      if (globeBusy()) { window.SW_PENDING = true; return; }   // never reload under an open or loading globe; offer the refresh after it closes
      const busy = /^#\/(submit|fix|account|settings)/.test(location.hash) && [...document.querySelectorAll('#view input:not([type=hidden]),#view textarea')].some(i => i.type === 'checkbox' ? false : i.value && i.value !== i.defaultValue);
      const last = +sessionStorage.getItem('swReloadedAt') || 0;
      if (!busy && Date.now() - last > 15000) { sessionStorage.setItem('swReloadedAt', Date.now()); location.reload(); return; }
      showUpdateBar(); });
    navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(r => { r.update().catch(() => {});   // offline or mid-deploy: try again on the next foreground

      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); }); }).catch(() => {});
  }
  importHandoff(); clubUpdates();
  const bare = !location.hash || location.hash === '#';
  if (bare && S.homeCountry && S.homeCountry !== 'AUS') history.replaceState(null, '', homeHash(S.homeCountry));
  route(); setHomeLinks(); window.addEventListener('hashchange', () => { geoLand.moved = true; setHomeLinks(); }, {once: false});
  { const sw = $('#ctrySw'); if (sw) sw.onclick = ctryMenu; }
  if (!S.homeCountry) geoLand().catch(() => {});   // deep links too (e.g. #/fans), so country-aware pages follow the visitor's country
  setTimeout(() => loadIntl().then(() => setHomeLinks()).catch(() => {}), 2500); window.LIVEP = Promise.all([loadLiveSubs(), loadClubApi()]).then(([n, k]) => loadOverrides().then(m => { if (n || k || m) softRender(); })); cardsLoad().catch(() => {});
  if (Object.keys(S.saved).concat(Object.keys(S.entries)).some(id => !BYID[id])) loadIntl().then(() => { const y = scrollY; render(); scrollTo(0, y); }).catch(() => {}); checkReminders(); setInterval(checkReminders, 60 * 60 * 1000);
  initAuth().catch(e => console.warn('auth', e));
}

function showUpdateBar(){
  if ($('#updBar')) return;
  const d = document.createElement('div'); d.id = 'updBar'; d.className = 'upd-bar'; d.setAttribute('role', 'status');
  d.innerHTML = '<span>A new version of Archery Calendar is ready.</span><button type="button" class="btn gold" id="updGo">Refresh</button><button type="button" class="upd-x" aria-label="Later">✕</button>';
  document.body.appendChild(d); $('#updGo').onclick = () => location.reload(); d.querySelector('.upd-x').onclick = () => d.remove();
}
/* ---------- settings migration: never let stale/odd saved settings hide everything ---------- */
function migrateSettings(){
  const codes = STATES.map(s => s[0]), gk = GROUPS.map(g => g[0]);
  const st = Array.isArray(S.states) ? S.states : typeof S.states === 'string' ? S.states.split(',') : [];
  S.states = [...new Set(st.map(v => String(v).trim().toUpperCase()).map(v => (STATES.find(s => s[1].toUpperCase() === v) || [v])[0]).filter(v => codes.includes(v)))];
  if (S.states.length === codes.length) S.states = [];
  const gr = Array.isArray(S.groups) ? S.groups.map(v => String(v).trim().toLowerCase()).filter(v => gk.includes(v)) : [];
  S.groups = gr.length ? [...new Set(gr)] : DEFAULT.groups.slice();
  if (!S.taaAdded) { if (['aa', 'aba', 'awa'].every(g => S.groups.includes(g)) && !S.groups.includes('taa')) S.groups.push('taa'); S.taaAdded = 1; }   // TAA added Oct 2026: on for anyone who had every organisation on
  for (const k of ['countries', 'orgs']) if (!Array.isArray(S[k])) S[k] = DEFAULT[k].slice();
  for (const k of ['saved', 'entries', 'notified']) if (!S[k] || typeof S[k] !== 'object' || Array.isArray(S[k])) S[k] = {};
  S.v = 2; try { save(); } catch {}
}
/* ---------- helpers ---------- */
const inGrp = (x, g) => x.org_group === g || (x.also_groups || []).includes(g);   // events open to several bodies (e.g. BOM 3D: AWA + AA + TAA)
function visible(x, anyState){
  if (S.saved[x.id]) return true;
  if (AUS()) return (S.groups.some(g => inGrp(x, g)) || x.org_group === 'venue') && (anyState || !S.states.length || !x.state_code || S.states.includes(x.state_code));
  if (S.world && x.world_level) return true;
  if (S.orgs.includes(x.org_id)) return true;
  if (x.country_code && S.countries.includes(x.country_code) && !x.world_level) {
    // ABA / Archery WA events only show if that body is ticked (they're not WA-sanctioned)
    if (['aba','archery-wa'].includes(x.org_id)) return S.orgs.includes(x.org_id);
    return true;
  }
  return false;
}
const THEMES = {field:['🌲','Field'], '3d':['🦌','3D'], target:['🎯','Target'], indoor:['🏠','Indoor'], mixed:['🏹','Archery']};
const photo = t => PH[t === 'mixed' ? 'hero' : t] || PH.hero || {};
const cHero = code => 'c_' + String(iIso(code) || '').toLowerCase();   // per-country hero key in img/credits.json (c_us, c_gb, c_dk…); falls back to the generic photo
// ABA pages never show Archery Australia / World Archery team imagery: ABA events use their own bush / 3D animal photo set.
// ABA logo (transparent; 32/64/128/256 px PNG + WebP). Only ever used on ABA content.
const abaLogo = (n = 32, cls = 'org-logo') => `<picture class="${cls}"><source type="image/webp" srcset="img/logos/aba-logo-${n}.webp 1x, img/logos/aba-logo-${Math.min(n * 2, 256)}.webp 2x"><img src="img/logos/aba-logo-${n}.png" srcset="img/logos/aba-logo-${Math.min(n * 2, 256)}.png 2x" alt="Australian Bowhunters Association" height="${n}" width="${Math.round(n * 263 / 342)}" loading="lazy" decoding="async"></picture>`;
const isAba = x => x && (x.org_group === 'aba' || x.org_id === 'aba');
const abaKey = t => t === '3d' ? 'aba_3d' : 'aba_field';
const evTheme = x => isAba(x) ? abaKey(theme(x)) : theme(x);
const evPhoto = x => photo(evTheme(x));
/* Host mark: each event shows its HOST CLUB's logo (img/clubs/, sources in img/clubs/logos.json), never a person's photo.
   No club logo found: ABA events show the ABA logo; everyone else gets a navy/gold initials badge. Logos are never invented. */
let LOGO = {};
const ORG_HOST = {aba: 'Australian Bowhunters Association', 'archery-wa': 'Archery WA', 'archery-australia': 'Archery Australia', 'wa-aus': 'Archery Australia', 'world-archery': 'World Archery'};
const hslug = n => (n || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function hostOf(x){
  const c = CLUB[x.club_id]; if (c) return {id: c.id, name: c.name, club: true};
  const h = (x.host || '').replace(/\s*\(.*\)/, '').trim(); if (h) return {id: hslug(h), name: h};
  return {id: x.org_id === 'wa-aus' ? 'archery-australia' : x.org_id, name: ORG_HOST[x.org_id] || x.org || 'Archery', org: true};
}
function initials(n){
  const w = (n || '').replace(/&/g, ' ').split(/[\s\-–]+/).filter(s => s && !/^(of|the|and|inc\.?|incorporated)$/i.test(s));
  if (w.length === 1 && /^[A-Z]{2,4}$/.test(w[0])) return w[0];
  let i = w.map(s => s[0]).join('').toUpperCase(); if (i.length < 2) i = (w[0] || 'AC').slice(0, 2).toUpperCase();
  return i.slice(0, 4);
}
function hostMark(x, big){
  const h = hostOf(x), L = LOGO[h.id];
  if (L) return `<span class="hm hm-logo${big ? ' big' : ''}"${L.bg ? ` style="background:${esc(L.bg)}"` : ''}><img src="${esc(big ? L.file : (L.sm || L.file))}" alt="${esc(h.name)} logo" loading="lazy" decoding="async"></span>`;
  if (isAba(x)) return `<span class="hm hm-logo hm-aba${big ? ' big' : ''}">${abaLogo(big ? 128 : 64, 'aba-pic')}</span>`;
  const i = initials(h.name);
  return `<span class="hm hm-ini${big ? ' big' : ''}" data-n="${i.length}" role="img" aria-label="${esc(h.name)}"><b aria-hidden="true">${esc(i)}</b></span>`;
}
const credit = () => '';   // photo credits live on the Credits page only (linked from every footer), not on the photos
function theme(x){
  const d = (x.discipline || '') + ' ' + (x.name || '') + ' ' + (x.rounds || '');
  if (/indoor|vegas|18 ?m/i.test(d)) return 'indoor';
  if (/3d|bowfish|trail event|bowhunter|safari/i.test(d)) return '3d';
  if (/field|ifaa|hunter round|aba/i.test(d)) return 'field';
  if (/target|clout|para|matchplay|qre|1440|720|900|canberra|olympic|world cup|championships/i.test(d)) return 'target';
  return 'mixed';
}
const CATS = {competition:['🏹','Competition','Competitions'], club:['👥','Club event','Club events'], coaching:['🎓','Coaching course','Coaching courses'], youth:['🧒','Youth training','Youth training'], come_try:['👋','Come & try','Come & try / have-a-go'], seminar:['🎤','Seminar / workshop','Seminars & workshops']};   // seminar: coaching seminars / workshops (owner 10 Oct 2026)
const catOf = x => CATS[x.category] ? x.category : 'competition';
const isShoot = x => ['competition', 'club'].includes(catOf(x));   // real events (have a discipline theme), vs courses / programs
const catTag = x => catOf(x) === 'competition' ? '' : `<span class="tag cat cat-${catOf(x)}">${CATS[catOf(x)][0]} ${CATS[catOf(x)][1]}</span>`;
const TSEL = [['competition','🏹 Competitions'], ['club','👥 Club events'], ['coaching','🎓 Coaching'], ['youth','🧒 Youth'], ['come_try','👋 Come & try'], ['seminar','🎤 Seminars'], ['','All']];
const typeSel = (cur, counts) => `<div class="typesel" role="group" aria-label="Type of event">${TSEL.map(([k, l]) => `<button type="button" class="tsel" data-tcat="${k}" aria-pressed="${(cur || '') === k}">${l}${counts ? ` <small>${counts[k] || 0}</small>` : ''}</button>`).join('')}</div>`;
const typeCounts = list => list.reduce((c, x) => (c[catOf(x)] = (c[catOf(x)] || 0) + 1, c['']++, c), {'': 0});
const tagHtml = t => `<span class="tag">${THEMES[t][0]} ${THEMES[t][1]}</span>`;
const isPast = x => x.end_date && daysTo(x.end_date) < 0;
function dateBox(x){
  if (x.book_anytime) return `<div class="date tbc any" aria-label="Book any time">Book<br>any time</div>`;
  if (!x.start_date) return `<div class="date tbc" aria-label="Dates to be confirmed">Dates<br>TBC</div>`;
  const d = pd(x.start_date);
  return `<div class="date" aria-label="${d.toDateString()}"><div class="d">${d.getDate()}</div><div class="m">${MON[d.getMonth()]}</div></div>`;
}
function range(x){
  if (x.book_anytime) return 'Book any time – no fixed date';
  if (!x.start_date) return 'Dates to be confirmed';
  const a = pd(x.start_date), b = pd(x.end_date || x.start_date), o = {day:'numeric', month:'short', year:'numeric'};
  return x.start_date === x.end_date || !x.end_date ? a.toLocaleDateString(LOC(), {weekday:'short', ...o}) : `${a.toLocaleDateString(LOC(),{day:'numeric',month:'short'})} – ${b.toLocaleDateString(LOC(), o)}`;
}
const OST = {flyer:['📄','2026 flyer out','Flyer out'], no_details:['⏳','No entry details yet','No entry details yet']};
function orgBadge(x){
  const k = x.org_status; if (!OST[k] || x.info_only && !x.book_anytime) return '';
  const lbl = k === 'flyer' ? (x.flyer_is_current ? `${x.flyer_year || (x.start_date || '').slice(0, 4)} flyer out` : 'Details & entry out') : k === 'no_details' && entryUrl(x) ? 'No flyer yet' : OST[k][1];   // has an entry link, so don't say "no entry details"
  return `<span class="b ost ost-${k}">${OST[k][0]} ${lbl}</span>`;
}
function entryBadge(x){
  if (isPast(x) || x.info_only) return '';
  const c = x.entry_close_date, f = d => pd(d).toLocaleDateString(LOC(),{day:'numeric',month:'short'});
  if (c && daysTo(c) < 0) return `<span class="b closed">🔒 Entries closed ${f(c)}</span>`;
  if (x.registration_opens && daysTo(x.registration_opens) > 0) return `<span class="b tbc">◷ Entries open ${f(x.registration_opens)}</span>`;
  if (x.org_status === 'flyer' && (x.registration_url || c)) return `<span class="b open">✍ Entries open${c ? ' · close ' + f(c) : ''}</span>`;
  return '';
}
function badges(x, onCard){
  const b = (x.cancelled ? ['<span class="b cancelled">✕ Cancelled</span>', clubBadge(x)] : [clubBadge(x), clashBadge(x), orgBadge(x), entryBadge(x)]).filter(Boolean), en = S.entries[x.id];
  if (x.book_anytime) b.push(`<span class="b tbc">📞 Book any time</span>`);
  else if (x.info_only) b.push(`<span class="b tbc">${isShoot(x) ? 'ℹ Info only' : '↻ Ongoing program'}</span>`);
  if (x.titles) b.push(`<span class="b titles">🏅 ${x.titles === 'state' ? 'State Titles' : 'Branch Titles'}</span>`);
  else if (/state champ/i.test(x.level || '')) b.push(`<span class="b titles">🏅 State Championship</span>`);
  if (x.members_only) b.push(`<span class="b members">👥 Club members only</span>`);
  else if (x.also_groups && x.also_groups.length) b.push(`<span class="b open-to">✅ Open to ${esc([x.org_group, ...x.also_groups].filter(g => g === 'aa' || g === 'taa').map(g => g.toUpperCase()).join(' & '))} members</span>`);
  if (x.series_part) b.push(`<span class="b series">${esc(x.series_part)}</span>`);
  if (isPast(x)) b.push(`<span class="b past">◷ Finished</span>`); else if (!x.cancelled) { const c = cdBadge(x, !onCard); if (c) b.unshift(c); }
  const st = ST(x.id);
  if (!onCard) {
    if (st === 'paid') b.push(`<span class="b paid">✓ Entered · $ Paid${en.amount ? ' ' + esc(en.currency || '') + ' ' + esc(en.amount) : ''}</span>`);
    else if (st === 'entered') b.push(`<span class="b ent">✓ Entered · ☐ Not paid yet</span>`);
    else if (S.saved[x.id] && !isPast(x) && !x.info_only) b.push(`<span class="b todo">☐ Not entered yet</span>`);
  }
  if (!x.dates_confirmed) b.push(`<span class="b tbc">? Dates TBC</span>`);
  if (x.world_level) b.push(AUS() ? `<span class="b world">🏆 International event</span>` : `<span class="b world">🌐 World / major</span>`);
  return b.length ? `<div class="badges">${b.join('')}</div>` : '';
}
/* One-tap entry link (owner 22 Oct 2026): the event's own registration/entry page as a gold button wherever an event shows.
   Only http(s) URLs from the event's registration_url (never invented); nothing for info-only, cancelled or finished events. */
const safeHttp = u => { u = String(u || '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(u) ? u : ''; };
function entryUrl(x){ return !x || (x.info_only && !x.book_anytime) || x.cancelled ? '' : safeHttp(x.registration_url); }
function entryLbl(x){
  const closed = !!x.entry_close_date && daysTo(x.entry_close_date) < 0;
  if (closed) return 'Entry page (entries closed)';
  if (catOf(x) === 'come_try') return 'Book a place';
  if (!isShoot(x)) return 'Register / book';
  return {event_page: 'Event page & entry', entry_system: 'Enter via Archers Diary', wareos: 'Enter via World Archery', how_to_guide: 'How to enter', volunteer: 'Volunteer application'}[x.registration_url_kind] || 'Register / Enter';
}
function entryBtn(x, cls = '', past){
  const u = entryUrl(x); if (!u || (past !== undefined ? past : (x.end_date || x.start_date) && daysTo(x.end_date || x.start_date) < 0)) return '';
  const lb = entryLbl(x), closed = /closed/.test(lb);
  if (closed && !cls.includes('keep-closed')) return '';   // cards skip closed entries; the event page still links the entry page
  return `<a class="btn sm ${closed ? 'alt' : 'gold'} ev-reg ${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(lb)}: ${esc(x.name)} (opens in a new tab)"><span aria-hidden="true">✍</span> ${esc(lb)} <span aria-hidden="true">↗</span></a>`;
}
function evCard(x){
  const on = !!S.saved[x.id], t = theme(x);
  return `<article class="ev th-${t}" role="link" tabindex="0" data-open="${esc(x.id)}" aria-label="${esc(x.name)}">
    <div class="ev-img ev-host">${dateBox(x)}${hostMark(x)}</div>
    <div class="body"><div class="tags">${catTag(x)}${t !== 'mixed' && isShoot(x) ? tagHtml(t) : ''}${x.flyer_local ? `<span class="tag fl">📄 ${x.flyer_is_current ? x.flyer_year + ' flyer' : 'Last year’s flyer'}</span>` : ''}${resOf(x) ? `<span class="tag res">🏆 ${resOf(x).kind === 'full' ? 'Scores' : 'Results'}</span>` : ''}</div>
      <h3 class="name">${esc(x.name)}</h3>${tmLine(x)}
      <div class="meta">${esc([x.location, x.country_code && x.country_code !== 'AUS' ? [x.country_code === 'USA' && x.us_state && US_ST[x.us_state] && !String(x.location || '').includes(US_ST[x.us_state]) ? US_ST[x.us_state] : '', x.country_name || x.country].filter(Boolean).join(', ') : x.state].filter(Boolean).join(' · '))}</div>
      <div class="meta">${isAba(x) ? abaLogo(32, 'org-logo') : ''}${esc([x.discipline, x.org, x.aba_branch && x.aba_branch.split(' – ')[0]].filter(Boolean).join(' · '))}</div>${badges(x, true)}
      ${entryBtn(x)}
      ${x.info_only ? '' : statusToggles(x)}</div>
    ${x.info_only ? '' : `<button class="star" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} my events" data-star="${esc(x.id)}">${on ? '★' : '☆'}</button>`}
  </article>`;
}
function adSlot(kind, t){
  if (!SITE.ads) return '';
  const what = {field:'field archery', '3d':'3D', target:'target archery', indoor:'indoor'}[t];
  if (kind === 'banner') return `<aside class="ad ad-banner" aria-label="Advertising space (placeholder)"><span class="ad-lbl">Sponsor space · placeholder</span>
    <div class="ad-copy"><b>Your shop here — advertise to archers</b><span>Bows, arrows, targets, coaching and ranges. Reach archers planning their next event.</span></div>
    <a class="btn gold" href="#/advertise">Advertise with us</a></aside>`;
  if (kind === 'feed') return `<aside class="ad ad-feed" aria-label="Featured retailer (placeholder)"><span class="ad-lbl">Featured retailer · placeholder</span>
    <div class="ad-copy"><b>Your shop here — advertise to archers</b><span>A featured card like this appears every 10 events in the list.</span></div>
    <a class="btn alt" href="#/advertise">Find out more</a></aside>`;
  return `<aside class="ad ad-side" aria-label="Sponsor (placeholder)"><span class="ad-lbl">Sponsor · placeholder</span>
    <b class="ad-head">${what ? 'Gear up for ' + what : 'Gear up for your next event'}</b>
    <span>Your archery shop here. Show ${what ? what + ' ' : ''}archers your gear on every ${what ? what + ' ' : ''}event page.</span>
    <a class="btn gold block" href="#/advertise">Advertise with us</a></aside>`;
}
/* Sponsors (paid, always on - not tied to SITE.ads). Desktop: rails in the empty side margins (home page, wide screens).
   Smaller screens: a swipeable strip between sections. Every sponsor link is UTM-tagged so clicks can be reported. */
/* RamRods: 6-month founding-sponsor trial 2026-10-21 to 2027-04-21. start/end are records only - nothing auto-hides; renewal is a manual decision. */
const SPONSORS = [{id:'ramrods', name:'RamRods Archery', founding:true, start:'2026-10-21', end:'2027-04-21', url:'https://ramrods.com/', logo:'img/logos/sponsor-ramrods.png', w:640, h:188, txt:'Bow stabilizers, weights & accessories', cta:'Visit ramrods.com'}];
function spUrl(s, medium, content){ return s.url + (s.url.includes('?') ? '&' : '?') + 'utm_source=archerycalendars&utm_medium=' + medium + '&utm_campaign=founding_sponsor&utm_content=' + content; }
function spCard(s, medium, content, strip){
  const logo = `<div class="sp-logo"><img src="${esc(s.logo)}" alt="${esc(s.name)}" width="${s.w}" height="${s.h}" loading="lazy" decoding="async"></div>`;
  return `<a class="sp${s.founding ? ' sp-founding' : ''}" href="${esc(spUrl(s, medium, content))}" target="_blank" rel="sponsored noopener" data-sp="${esc(s.id)}" data-gc="sponsor/${esc(s.id)}/${esc(content)}" data-gc-t="${esc(s.name)} sponsor click (${esc(content.replace(/_/g, ' '))})" aria-label="${esc(s.name)}${s.founding ? ', founding sponsor' : ''} (opens ${esc(s.url.replace(/^https?:\/\/|\/$/g, ''))})">
    ${s.founding ? `<span class="sp-badge"><span aria-hidden="true">★</span> ${strip ? 'Founding' : 'Founding Sponsor'}</span>` : ''}${strip ? `<span class="sp-body">${logo}<span class="sp-cta">${esc(s.cta)} →</span></span>` : `${logo}<span class="sp-txt">${esc(s.txt)}</span><span class="sp-cta">${esc(s.cta)} →</span>`}</a>`;
}
const SP_OPEN_SPOTS = false;   // true = show the dashed "Sponsor spot open" cards again (left rail, right rail, strip)
const spOpen = (more) => SP_OPEN_SPOTS ? `<a class="sp sp-open" href="#/advertise"><b>Sponsor spot open</b><span>Your logo + link here</span>${more ? '<em>Advertise with us →</em>' : ''}</a>` : '';
/* RamRods inside the page banner ("poster") on desktop: a footer strip along the bottom of the hero photo, white logo blended into the artwork.
   Phone and narrow screens (720px and under) keep the swipeable strip below (spStrip); the strip is hidden on desktop. */
function spHero(cc, where = 'home'){
  if (!SPONSORS.length) return '';
  const s = SPONSORS[0], c = esc(where + '_hero' + (cc ? '_' + cc : ''));
  /* Desktop ticker: one group of "Supported by + logo" repeated, and an identical hidden copy, so the CSS loop (translateX) has no jump. */
  const item = `<span class="sp-tk-i"><span class="sp-hero-by">Supported by</span><img src="${esc(s.logo)}" alt="" width="${s.w}" height="${s.h}" decoding="async"></span>`;
  const grp = (hid) => `<span class="sp-tk-g"${hid ? ' aria-hidden="true"' : ''}>${item.repeat(8)}</span>`;
  return `<div class="sp-hero" aria-label="Sponsor"><a class="sp-hero-link" href="${esc(spUrl(s, 'sponsor_hero', where + '_hero' + (cc ? '_' + cc : '')))}" target="_blank" rel="sponsored noopener" data-sp="${esc(s.id)}" data-gc="sponsor/${esc(s.id)}/${c}" data-gc-t="${esc(s.name)} sponsor click (${esc((where + ' hero').replace(/_/g, ' '))})" aria-label="${esc(s.name)}${s.founding ? ', founding sponsor' : ''} (opens ${esc(s.url.replace(/^https?:\/\/|\/$/g, ''))} in a new tab)"><span class="sp-tk">${grp(false)}${grp(true)}</span></a></div>`;
}
/* Right-hand sponsor rail (empty while SP_OPEN_SPOTS is off). The newsletter columns are newsCols (below). */
function spRails(cc, newsCode){
  const side = '', right = spOpen(true) + spOpen(true);
  return `${side}${right ? `<aside class="sp-rail sp-rail-r" aria-label="More sponsor spots"><div class="sp-rail-in"><div class="sp-rail-h">Sponsors</div>${right}</div></aside>` : ''}`;
}
function spStrip(cc, where = 'home'){
  if (!SPONSORS.length) return '';
  const cards = SPONSORS.map(s => spCard(s, 'sponsor_strip', where + '_strip' + (cc ? '_' + cc : ''), true)).join('') + spOpen() + spOpen(), n = SPONSORS.length + (SP_OPEN_SPOTS ? 2 : 0);
  return `<section class="sp-strip${n === 1 ? ' one' : ''}" aria-label="Sponsors"><div class="sp-strip-h"><span>Supported by</span>${n > 1 ? '<span aria-hidden="true">Swipe →</span>' : ''}</div>
    <div class="sp-strip-row">${cards}</div></section>`;
}
function bindCards(root = document){
  bindToggles(root);
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = ev => { ev.stopPropagation(); toggleSave(b.dataset.star); });
  root.querySelectorAll('[data-open]').forEach(c => { c.onclick = ev => { const i = ev && ev.target.closest && ev.target.closest('a,button,input,select,textarea,label'); if (i && i !== c && c.contains(i)) return; location.hash = '#/shoot/' + encodeURIComponent(c.dataset.open); };
    c.onkeydown = e => { if (e.key === 'Enter' && e.target === c) c.click(); }; });
}
function toggleSave(id){
  if (S.saved[id]) { delete S.saved[id]; toast('Removed from My events'); }
  else { S.saved[id] = {added: iso(new Date())}; toast('★ Added to My events'); }
  save(); const y = scrollY; render(); scrollTo(0, y);
}
function setTitle(t){ document.title = t === 'Archery Calendar' ? 'Archery Calendar – every archery event in one calendar' : t + ' · Archery Calendar'; }
/* Banners: wide photos fill the banner (with a per-photo focal point, credits.json "pos"); group photos ("layout":"split")
   sit beside the text at their full 16:9 frame so nobody's face is cut off. */
function heroOpen(cls, p){
  return p.layout === 'split' ? `<section class="${cls} split${p.keep || p.shape === 'wide' ? ' keep' : ''}${p.shape === 'wide' ? ' wide' : ''}"><div class="wrap split-row"><div class="split-txt">`
    : `<section class="${cls}" style="--img:url('${esc(p.file)}');--pos:${esc(p.pos || 'center 35%')}"><div class="wrap">`;
}
const heroClose = p => p.layout === 'split' ? `</div><figure class="split-img${p.shape === 'portrait' ? ' tall' : p.shape === 'wide' ? ' wide' : ''}">${p.webp ? `<picture><source type="image/webp" srcset="${esc(p.webp)}">` : ''}<img src="${esc(p.file)}" onerror="this.closest('figure').remove()" alt="${esc(p.alt || p.title || '')}" style="object-position:${esc(p.shape === 'portrait' ? 'center' : (p.pos || 'center'))}" width="${p.shape === 'portrait' ? 960 : p.shape === 'wide' ? 2000 : 1600}" height="${p.shape === 'portrait' ? 1200 : p.shape === 'wide' ? 875 : 900}">${p.webp ? '</picture>' : ''}</figure></div></section>` : `</div></section>`;
const srcTxt = v => /^correction/i.test(v) ? v : 'from ' + v;
function pageHead(title, sub, t = 'mixed'){
  const p = (t === 'youth' || t === 'come_try') ? Object.assign({keep: true}, PH[t] || photo('mixed')) : photo(t);
  return `${heroOpen('phead', p)}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}${heroClose(p)}`;
}
function clubCta(compact){
  const m = `mailto:${SITE.contact}?subject=${encodeURIComponent('Our event / flyer for Archery Calendar')}`;
  return `<aside class="cta${compact ? ' compact' : ''}"><span class="kicker">Clubs &amp; organisers</span><b class="cta-h">Send us your flyer</b>
    <p>We'll list your event for free.</p>
    <div class="cta-btns"><a class="btn gold" href="#/submit">Submit an event</a><a class="cta-mail" href="${m}">or email ${esc(SITE.contact)}</a></div></aside>`;
}
function flyerLinkCard(x){
  const ex = x.flyer_extract || {}, cur = x.flyer_is_current, ly = cur ? '' : '<span class="lastyr">Last year</span>';
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString(LOC(),{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
  const rows = [['How to enter', ex.registration], [cur && !(ex.entry_close && daysTo(ex.entry_close) < 0) ? 'Entries close' : 'Entries closed', close], ['Fee', ex.fee], ['Rounds', ex.rounds], ['Times', ex.start_times], ['Contact', ex.contact], ['Notes', ex.notes]].filter(r => r[1]);
  const src = x.flyer_source_url;
  return `<section class="panel flyer-panel"><div class="flyer-link">
    <span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' flyer' : '⚠ ' + x.flyer_year + ' flyer – last year'}</span>
    <p class="fl-label">${esc(x.flyer_label)}</p>
    ${src ? `<a class="btn alt" href="${esc(src)}" target="_blank" rel="noopener">📄 View flyer at source ↗</a><p class="note">Opens the organiser's own page or file${x.flyer_source_name ? ' (' + esc(x.flyer_source_name) + ')' : ''}.</p>`
          : cur && rows.length ? `<p class="soon">📄 Details below are from the ${x.flyer_year} flyer${x.flyer_source_name ? ' (' + esc(x.flyer_source_name) + ')' : ''}. The flyer image isn't published here.</p>`
          : `<p class="soon">📄 Flyer coming soon${x.flyer_source_name ? ` – details below are from the ${esc(x.flyer_source_name)}` : ''}.</p>`}</div>
    ${rows.length ? `<h2 class="sec">${cur ? 'From the flyer' : 'From last year’s flyer – may change this year'}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${ly}${esc(v)}</dd>`).join('')}</dl>` : ''}</section>`;
}
function flyerHosted(x){
  const ex = x.flyer_extract || {}, cur = x.flyer_is_current, ly = cur ? '' : '<span class="lastyr">Last year</span>';
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString(LOC(),{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
  const rows = [['How to enter', ex.registration], [cur && !(ex.entry_close && daysTo(ex.entry_close) < 0) ? 'Entries close' : 'Entries closed', close], ['Fee', ex.fee], ['Rounds', ex.rounds], ['Times', ex.start_times], ['Contact', ex.contact], ['Notes', ex.notes]].filter(r => r[1]);
  const src = x.flyer_source_url, org = x.flyer_org || x.org || 'the organiser';
  const mail = `mailto:${SITE.contact}?subject=${encodeURIComponent('Flyer on Archery Calendar: ' + x.name)}`;
  const ey = x.start_date ? +x.start_date.slice(0, 4) : 0, lastYr = !ey || x.flyer_year === ey - 1, oldH = lastYr ? 'Last year’s flyer' : `Earlier flyer (${x.flyer_year})`;
  const oldB = `⚠ ${lastYr ? `Last year’s flyer (${x.flyer_year})` : `Earlier flyer from ${x.flyer_year}`} – ${isPast(x) ? `we don’t have the ${ey || 'new'} flyer` : `the ${ey || 'new'} flyer isn’t out yet; details may change`}`;
  return `<section class="panel flyer-panel" id="flyer"><h2 class="sec">${cur ? '📄 ' + esc(x.flyer_kind || 'Flyer') : '⚠ ' + oldH}</h2>
    <span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' ' + esc((x.flyer_kind || 'flyer').toLowerCase()) : oldB}</span>
    <a class="flyer-big${cur ? '' : ' old'}" href="${esc(x.flyer_web)}" target="_blank" rel="noopener" aria-label="Open the flyer full size">
      <img src="${esc(x.flyer_web_sm)}" alt="${esc((cur ? '' : 'Last year’s ') + 'flyer for ' + x.name + (x.flyer_is_pdf ? ' (page 1)' : ''))}" loading="lazy" width="640">
      <span class="zoom">🔍 Tap to enlarge${x.flyer_is_pdf ? ' (page 1)' : ''}</span></a>
    <p class="fl-cap">Flyer: ${esc(org)}. Organisers: want it removed or updated? Email <a href="${mail}">${esc(SITE.contact)}</a>.</p>
    ${src ? `<p class="note"><a href="${esc(src)}" target="_blank" rel="noopener">📄 View the original at source ↗</a>${x.flyer_source_name ? ' (' + esc(x.flyer_source_name) + ')' : ''}${x.flyer_is_pdf ? ' – all pages' : ''}</p>` : ''}
    ${rows.length ? `<h2 class="sec">${cur ? 'From the ' + esc((x.flyer_kind || 'flyer').toLowerCase()) : `From the ${x.flyer_year} flyer – may change this year`}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${cur ? '' : `<span class="lastyr">${x.flyer_year}</span>`}${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${moreFlyers(x)}</section>`;
}
function moreFlyers(x){
  const m = (x.flyers_more || []).filter(f => f.web); if (!m.length) return '';
  return `<h2 class="sec" id="moreFlyers">More flyers (${m.length})</h2><div class="more-flyers">${m.map(f => `<a class="mf${f.is_current ? '' : ' old'}" href="${esc(f.web)}" target="_blank" rel="noopener" aria-label="Open ${esc(f.label)} full size">
    <img src="${esc(f.web_sm)}" alt="${esc(f.label + ' – ' + x.name)}" loading="lazy" width="200"><span>${f.is_current ? '📄' : '🗂'} ${esc(f.label)}</span></a>`).join('')}</div>`;
}
function flyerCard(x){
  if (!x.flyer_year) return '';
  if (SITE.flyers === 'hosted' && x.flyer_web) return flyerHosted(x);
  if (SITE.flyers !== 'local' || !x.flyer_local) return flyerLinkCard(x);
  const ex = x.flyer_extract || {}, cur = x.flyer_is_current, ly = cur ? '' : '<span class="lastyr">Last year</span>';
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString(LOC(),{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
  const rows = [['How to enter', ex.registration], [cur && !(ex.entry_close && daysTo(ex.entry_close) < 0) ? 'Entries close' : 'Entries closed', close], ['Fee', ex.fee], ['Rounds', ex.rounds], ['Times', ex.start_times], ['Contact', ex.contact], ['Notes', ex.notes]].filter(r => r[1]);
  return `<section class="panel flyer-panel"><div class="flyer"><a class="thumb" href="${esc(x.flyer_local)}" target="_blank" rel="noopener" aria-label="Open the full flyer"><img src="${esc(x.flyer_thumb)}" alt="Flyer page 1" loading="lazy"><span>View flyer ↗</span></a>
    <div><span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' flyer – current' : '⚠ ' + x.flyer_year + ' flyer – last year'}</span>
    <p class="fl-label">${esc(x.flyer_label)}</p><p class="note">Tap the flyer to open it full size.<br>${x.flyer_url ? `Original: <a href="${esc(x.flyer_url)}" target="_blank" rel="noopener">organiser's file</a>` : esc(x.flyer_found_on || '')}</p></div></div>
    ${rows.length ? `<h2 class="sec">${cur ? 'From the flyer' : 'From last year’s flyer – may change this year'}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${ly}${esc(v)}</dd>`).join('')}</dl>
    ${!cur && safeHttp(ex.registration_url) ? `<p class="note">Last year's entry link: <a href="${esc(safeHttp(ex.registration_url))}" target="_blank" rel="noopener">${esc(ex.registration_url.slice(0,60))}…</a> (may not work this year)</p>` : ''}` : ''}</section>`;
}
/* REG-START ---------- How to register: structured entry methods (x.register = [{m, url, note, name, email, phone, phone_src, acct_name, bsb, acct, ref, text}]) ----------
   Options per region come from the entry systems actually used in our data (events.json / intl.json registration links) plus the bodies' own pages:
   AU  Archer's Diary + iScored.today (AA's official scoring/registration system; iScored registration is club shoots only), Assemble Sports (AA/RGB registrations), TryBooking, Eventbrite
   NZ  ArcheryOSA · US USA Archery + NFAA (both on Sport80), Stride Events, ASA, IBO (3D-Scoring) · CA 2MEV · UK Archery GB Members' Portal (Sport80) · DK Bueskydning Danmark calendar
   World Archery events: entries go through your national federation. Ianseo publishes target lists/results, so it isn't offered as an entry method. */
const REG_ALL = ['AU', 'NZ', 'US', 'CA', 'UK', 'DK', 'INTL'];
const REG_M = {
  archers_diary: {label: "Archer's Diary", kind: 'url', host: /archersdiary\.com/i, def: 'https://archersdiary.com/', regions: ['AU']},
  iscored: {label: 'iScored.today', kind: 'url', host: /iscored\.today/i, def: 'https://iscored.today/', regions: ['AU'], hint: 'Registration on iScored is for club shoots only.'},
  assemble: {label: 'Assemble Sports', kind: 'url', host: /assemblesports\.io/i, def: 'https://account.archery.assemblesports.io/login', regions: ['AU']},
  archeryosa: {label: 'ArcheryOSA', kind: 'url', host: /archeryosa\.com/i, def: 'https://archeryosa.com/', regions: ['NZ']},
  usa_archery: {label: 'USA Archery (Sport80)', kind: 'url', host: /usarchery\.sport80\.com/i, def: 'https://usarchery.sport80.com/', regions: ['US']},
  nfaa: {label: 'NFAA (Sport80)', kind: 'url', host: /nfaausa\.com|nfaa.*sport80/i, def: 'https://nfaausa.com/', regions: ['US']},
  stride: {label: 'Stride Events', kind: 'url', host: /strideevents\.com/i, def: 'https://www.strideevents.com/', regions: ['US']},
  asa: {label: 'ASA Archery', kind: 'url', host: /asaarchery\.com/i, def: 'https://asaarchery.com/', regions: ['US']},
  ibo: {label: 'IBO (3D-Scoring)', kind: 'url', host: /3d-scoring\.com/i, def: 'https://www.3d-scoring.com/', regions: ['US']},
  twomev: {label: '2MEV', kind: 'url', host: /2mev\.com/i, def: 'https://2mev.com/', regions: ['CA']},
  agb: {label: "Archery GB Members' Portal", kind: 'url', host: /archerygb/i, def: 'https://archerygb.org/', regions: ['UK']},
  dk: {label: 'Bueskydning Danmark calendar', kind: 'url', host: /bueskydningdanmark\.dk/i, def: 'https://bueskydningdanmark.dk/kalender/', regions: ['DK']},
  trybooking: {label: 'TryBooking', kind: 'url', host: /trybooking\.com/i, regions: ['AU', 'NZ', 'UK']},
  eventbrite: {label: 'Eventbrite', kind: 'url', host: /eventbrite\./i, regions: REG_ALL},
  online_form: {label: 'Online form (Google Forms, JotForm…)', kind: 'url', host: /forms\.gle|docs\.google\.com\/forms|jotform\.com/i, regions: REG_ALL},
  website: {label: 'Club / event website', kind: 'url', regions: REG_ALL},
  federation: {label: 'Through your national federation', kind: 'text', regions: ['INTL', 'UK', 'DK', 'NZ', 'CA', 'US']},
  email: {label: 'Email the organiser', kind: 'contact', regions: REG_ALL},
  bank: {label: 'Bank transfer', kind: 'bank', regions: ['AU', 'NZ', 'UK', 'DK', 'INTL']},
  day: {label: 'Pay on the day (cash / card)', kind: 'day', regions: REG_ALL},
  other: {label: 'Other', kind: 'text', regions: REG_ALL}};
const REG_NO_EMAIL = /nfshold@|nfstride/i;   // never publish the site owner's own address as an event contact
const regRegion = cc => ({AUS: 'AU', AU: 'AU', NZL: 'NZ', NZ: 'NZ', USA: 'US', US: 'US', CAN: 'CA', CA: 'CA', GBR: 'UK', UK: 'UK', DEN: 'DK', DK: 'DK'})[cc] || 'INTL';
const regOpts = rg => Object.keys(REG_M).filter(k => REG_M[k].regions.includes(rg));
const regLabel = m => (REG_M[m.m] || REG_M.other).label;
const regMethodOfUrl = u => { if (/^mailto:/i.test(u)) return 'email'; const k = Object.keys(REG_M).find(k => REG_M[k].host && REG_M[k].host.test(u)); return k || 'website'; };
/* Migration / fallback: turn the old free-text + link fields into methods. Unclear text is kept as 'Other'. Original fields are never removed. */
function deriveRegister(x){
  const out = [], has = m => out.some(o => o.m === m), fx = String((x.flyer_extract || {}).registration || '').trim(), u = x.registration_url || '';
  let fromText = false;
  if (u && !/^mailto:/i.test(u)) { const m = regMethodOfUrl(u), o = {m, url: u};
    if (x.registration_url_kind === 'wareos') o.wa = true; else if (x.registration_url_kind === 'how_to_guide') o.note = 'How-to-enter guide'; else if (x.registration_url_kind === 'volunteer') o.note = 'Volunteer application';
    else if (fx && m === 'archers_diary' && /→|–|club:|select|pick/i.test(fx)) o.note = fx.split(/;|, pay|\. /i)[0].replace(/^(Enter via |Register on )/i, '');
    out.push(o); }
  const mails = [];
  if (x.registration_email && x.registration_email.to) mails.push({email: x.registration_email.to, href: u.startsWith('mailto:') ? u : ''});
  else if (/^mailto:/i.test(u)) mails.push({email: decodeURIComponent(u.slice(7).split('?')[0]), href: u});
  if (typeof x.contact === 'string' && x.contact) { const em = (x.contact.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0];
    if (em) mails.push({email: em, name: x.contact.split(/\s+[–-]\s+|,\s*[\w.+-]+@/)[0].replace(em, '').replace(/[·,\s]+$/, '').trim()}); }
  mails.filter(m => !REG_NO_EMAIL.test(m.email)).forEach(m => { if (!out.some(o => o.m === 'email' && o.email === m.email)) out.push(Object.assign({m: 'email', email: m.email}, m.name ? {name: m.name} : {}, m.href ? {href: m.href} : {})); });
  if (/archer'?s'? ?diary/i.test(fx)) { fromText = true; if (!has('archers_diary')) out.push({m: 'archers_diary', url: REG_M.archers_diary.def, note: fx.split(/;|, pay|\. /i)[0].replace(/^(Enter via |Register on )/i, '')}); }
  if (/assemble/i.test(fx)) { fromText = true; if (!has('assemble')) out.push(Object.assign({m: 'assemble'}, /QR/i.test(fx) ? {note: 'Scan the QR code on the flyer (the Assemble page needs a login).'} : {url: REG_M.assemble.def})); }
  if (/iscored/i.test(fx)) { fromText = true; if (!has('iscored')) out.push({m: 'iscored', url: REG_M.iscored.def}); }
  if (/google form|jotform/i.test(fx)) { fromText = true; if (!has('online_form') && u) out.push({m: 'online_form', url: u}); }
  if (/club website|on the .*page|straight arrow|seminar page/i.test(fx) && u) fromText = true;
  if (/nominat|email|contact/i.test(fx) && has('email')) fromText = true;
  const bankTxt = /bank transfer|\bEFT\b|direct deposit/i.test(fx);
  if (x.bank_bsb || x.bank_account || bankTxt) { fromText = fromText || bankTxt;
    out.push(Object.assign({m: 'bank'}, x.bank_account_name ? {acct_name: x.bank_account_name} : {}, x.bank_bsb ? {bsb: x.bank_bsb} : {}, x.bank_account ? {acct: x.bank_account} : {}, x.bank_reference ? {ref: x.bank_reference} : {},
      !x.bank_bsb && !x.bank_account ? {note: (fx.match(/[^;.]*(bank transfer|EFT)[^;.]*/i) || [''])[0].trim()} : {})); }
  const day = fx.match(/[^;.]*(on the day|cash|pay at (the )?club|sign up at the club)[^;.]*/i);
  if (day) { fromText = true; out.push({m: 'day', note: day[0].replace(/^.*?\bor\s+/i, '').replace(/^\s*(bring|and)\s+/i, s => s.trim().toLowerCase() === 'and' ? '' : s).trim().replace(/^./, c => c.toUpperCase())}); }
  if (fx && !fromText && !(u && out.length && /^(Enter through |Online entry form|Assemble)/i.test(fx))) out.push({m: 'other', text: fx});
  return out;
}
const regOf = x => Array.isArray(x.register) ? x.register : deriveRegister(x);
const regText = L => (L || []).map(o => [regLabel(o), o.url, o.name, o.email, o.phone && o.phone_src === 'flyer' && o.phone, o.acct_name, o.bsb && 'BSB ' + o.bsb, o.acct && 'Acct ' + o.acct, o.ref && 'Ref ' + o.ref, o.note, o.text].filter(Boolean).join(' · ')).join('\n');
if (typeof module !== 'undefined') module.exports = {REG_M, deriveRegister, regRegion, regOpts};
/* REG-END */
/* ---------- How to register: picker used by Submit, Fix and the admin live edit ---------- */
function regPicker(p, rg, L){
  L = L || []; const opts = regOpts(rg); L.forEach(o => { if (!opts.includes(o.m)) opts.splice(opts.length - 1, 0, o.m); });
  const got = m => L.find(o => o.m === m) || {}, v = s => esc(s || ''), bsbLbl = rg === 'AU' ? 'BSB' : rg === 'UK' ? 'Sort code' : 'Bank / branch code';
  const sub = m => { const d = REG_M[m] || REG_M.other, o = got(m), id = `${p}_${m}`;
    const urlF = `<label class="sub-lab">Link${d.def ? '' : ' <span class="req">*</span>'}<input id="${id}_url" type="url" inputmode="url" maxlength="500" placeholder="${v(d.def || 'https://…')}" value="${v(o.url)}"></label>`;
    const noteF = ph => `<label class="sub-lab">Details <span class="opt">(optional)</span><input id="${id}_note" maxlength="300" placeholder="${v(ph)}" value="${v(o.note)}"></label>`;
    const body = d.kind === 'url' ? urlF + noteF(d.hint || 'e.g. club, event name to search for') + (d.hint ? `<p class="hint">${v(d.hint)}</p>` : '')
      : d.kind === 'bank' ? `<div class="grid2"><label class="sub-lab">Account name<input id="${id}_acct_name" maxlength="80" value="${v(o.acct_name)}"></label><label class="sub-lab">${bsbLbl}<input id="${id}_bsb" maxlength="20" inputmode="numeric" value="${v(o.bsb)}"></label>
          <label class="sub-lab">Account number<input id="${id}_acct" maxlength="34" value="${v(o.acct)}"></label><label class="sub-lab">Reference<input id="${id}_ref" maxlength="60" placeholder="e.g. Name/3D" value="${v(o.ref)}"></label></div>${noteF('e.g. Pay by 31 Oct')}`
      : d.kind === 'contact' ? `<div class="grid2"><label class="sub-lab">Name<input id="${id}_name" maxlength="80" placeholder="e.g. Club secretary" value="${v(o.name)}"></label><label class="sub-lab">Email <span class="req">*</span><input id="${id}_email" type="email" inputmode="email" maxlength="120" value="${v(o.email)}"></label></div>
          <label class="sub-lab">Phone <span class="opt">(only if it's printed on the club's flyer)</span><input id="${id}_phone" type="tel" maxlength="30" value="${v(o.phone_src === 'flyer' ? o.phone : '')}"></label>`
      : d.kind === 'day' ? noteF('e.g. Cash only · or sign up at the club by Fri 31 Oct')
      : `<label class="sub-lab">Details <span class="req">*</span><textarea id="${id}_text" rows="2" maxlength="600">${v(o.text || o.note)}</textarea></label>`;
    return `<div class="reg-sub" data-rm="${m}" ${L.some(o => o.m === m) ? '' : 'hidden'}><p class="reg-sub-h">${esc(d.label)}</p>${body}</div>`; };
  return `<div class="reg-pick" id="${p}_regpick" data-rg="${rg}"><details class="reg-dd"><summary><span class="reg-sum" id="${p}_regsum">${L.length ? esc(L.map(regLabel).join(', ')) : 'Choose one or more'}</span></summary>
    <div class="reg-opts" role="group" aria-label="How to register">${opts.map(m => `<label class="chk"><input type="checkbox" data-regm="${m}" ${L.some(o => o.m === m) ? 'checked' : ''}> <span>${esc(REG_M[m].label)}</span></label>`).join('')}</div></details>
    ${opts.map(sub).join('')}</div>`;
}
function regBind(p){
  const box = document.getElementById(p + '_regpick'); if (!box) return;
  const upd = () => { const on = [...box.querySelectorAll('[data-regm]:checked')].map(c => c.dataset.regm);
    box.querySelectorAll('.reg-sub').forEach(s => s.hidden = !on.includes(s.dataset.rm));
    document.getElementById(p + '_regsum').textContent = on.length ? on.map(m => REG_M[m].label).join(', ') : 'Choose one or more'; };
  box.querySelectorAll('[data-regm]').forEach(c => c.addEventListener('change', upd));
}
/* Read the picker: {list, err} – err names the first problem (https links, an email for contacts, bank needs an account). */
function regRead(p){
  const box = document.getElementById(p + '_regpick'); if (!box) return {list: [], err: ''};
  const g = (m, k) => { const el = document.getElementById(`${p}_${m}_${k}`); return el ? el.value.trim() : ''; };
  const list = [], errs = [];
  box.querySelectorAll('[data-regm]:checked').forEach(c => { const m = c.dataset.regm, d = REG_M[m] || REG_M.other, o = {m};
    if (d.kind === 'url') { o.url = g(m, 'url') || d.def || ''; if (!o.url) errs.push(`${d.label}: add the link.`); else if (!/^https:\/\/[^\s]+\.[^\s]+/i.test(o.url)) errs.push(`${d.label}: the link must start with https://`); }
    if (d.kind === 'bank') { ['acct_name', 'bsb', 'acct', 'ref'].forEach(k => { if (g(m, k)) o[k] = g(m, k); }); if (!o.bsb && !o.acct && !g(m, 'note')) errs.push('Bank transfer: add the account details.'); }
    if (d.kind === 'contact') { o.name = g(m, 'name'); o.email = g(m, 'email'); const ph = g(m, 'phone'); if (ph) { o.phone = ph; o.phone_src = 'flyer'; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.email)) errs.push('Email the organiser: add a valid email.'); else if (REG_NO_EMAIL.test(o.email)) errs.push('Email the organiser: use the club\u2019s own email, not the site\u2019s.');
      if (!o.name) delete o.name; }
    if (d.kind === 'text') { o.text = g(m, 'text'); if (!o.text) errs.push(`${d.label}: add the details.`); }
    if (d.kind !== 'text' && g(m, 'note')) o.note = g(m, 'note');
    list.push(o); });
  return {list, err: errs[0] || ''};
}
const regFirstUrl = L => (L.find(o => o.url) || {}).url || null;
/* Event page: one clean block, a button or line per method. */
function regSection(x){
  const hasPay = !!payBox(x), L = regOf(x).filter(o => !(hasPay && o.m === 'bank')); if (!L.length) return '';
  const row = o => { const d = REG_M[o.m] || REG_M.other, note = o.note ? `<p class="note">${esc(o.note)}</p>` : '';
    if (d.kind === 'url' && safeHttp(o.url)) return `<li><a class="btn gold block" href="${esc(safeHttp(o.url))}" target="_blank" rel="noopener">${o.wa ? '↗ Enter via World Archery' : o.m === 'website' || o.m === 'online_form' ? '↗ Register online' : `↗ Register on ${esc(d.label)}`}</a>${o.m === 'website' || o.m === 'online_form' ? `<p class="note">${esc(d.label)}</p>` : ''}${note}</li>`;
    if (d.kind === 'url') return `<li><b>${esc(d.label)}</b>${note}</li>`;
    if (d.kind === 'contact') return !(o.href || o.email) ? `<li><b>✉ Contact${o.name ? ' ' + esc(o.name) : ''}</b>${note}</li>` : `<li><a class="btn alt block" href="${esc(o.href || 'mailto:' + o.email + '?subject=' + encodeURIComponent('Entry: ' + x.name))}">✉ Email ${esc(o.name || o.email)}</a><p class="note">${esc(o.email)}${o.phone && o.phone_src === 'flyer' ? ' · ' + esc(o.phone) + ' (from the flyer)' : ''}</p>${note}</li>`;
    if (d.kind === 'bank') return `<li class="reg-bank"><b>💳 Bank transfer</b>${note}</li>`;
    if (d.kind === 'day') return `<li><b>💵 ${esc(d.label)}</b>${note}</li>`;
    return `<li><b>${esc(d.label)}</b><p class="note">${esc(o.text || '')}</p></li>`; };
  return `<section class="panel how-reg" id="howReg"><h2 class="sec">✍ How to register</h2><ul class="reg-list">${L.map(row).join('')}</ul></section>`;
}
const regBank = x => (regOf(x).find(o => o.m === 'bank' && (o.bsb || o.acct)) || null);
/* ---------- payment details pulled from the club's flyer (or the structured Bank transfer method) ---------- */
function payBox(x){
  const rb = regBank(x) || {}, bk = {name: rb.acct_name || x.bank_account_name, bsb: rb.bsb || x.bank_bsb, acct: rb.acct || x.bank_account, ref: rb.ref || x.bank_reference};
  const rows = [['Account name', bk.name], [regRegion(x.country_code) === 'UK' ? 'Sort code' : 'BSB', bk.bsb], ['Account number', bk.acct], ['Reference', bk.ref]].filter(r => r[1]);
  if (!rows.some(r => r[0] === 'BSB' || r[0] === 'Sort code' || r[0] === 'Account number')) return '';
  const cv = (k, v) => k === 'BSB' || k === 'Sort code' || k === 'Account number' ? String(v).replace(/[\s-]/g, '') : String(v);
  return `<section class="panel pay-box" id="payBox"><h2 class="sec">💳 Payment details${x.bank_source === 'flyer' || !rb.bsb ? ' (from the flyer)' : ''}</h2>
    <dl class="pay-rows">${rows.map(([k, v]) => `<div class="pay-row"><dt>${k}</dt><dd><span class="pay-val">${esc(v)}</span><button type="button" class="btn alt pay-copy" data-copy="${esc(cv(k, v))}" data-copylbl="${esc(k)}" aria-label="Copy ${esc(k)}">Copy</button></dd></div>`).join('')}</dl>
    ${bk.ref ? '<p class="note">Put your own name in the reference where the flyer says Name or Surname.</p>' : ''}
    <p class="note pay-warn">Details taken from the club's flyer, so check against the flyer before paying.</p></section>`;
}
async function copyText(t){
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch (e) {}
  try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, t.length); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest && ev.target.closest('.pay-copy'); if (!b) return;
  const ok = await copyText(b.dataset.copy);
  toast(ok ? `✓ Copied ${b.dataset.copylbl}` : 'Couldn’t copy – press and hold the number to copy it');
  if (ok) { b.textContent = 'Copied'; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = 'Copy'; }, 1800); }
});
/* ---------- reminders ---------- */
function reminders(){
  const out = [], pl = n => `${n} day${n !== 1 ? 's' : ''}`;
  for (const id of Object.keys(S.saved)) {
    const x = BYID[id]; if (!x || !x.start_date || isPast(x) || x.info_only) continue;
    const dt = daysTo(x.start_date), st = ST(id);
    for (const d of S.remindDays) if (dt <= d && dt >= 0) { out.push({key:`${id}:shoot:${d}`, x, when:dt, kind:'shoot', st, text: dt === 0 ? 'is TODAY' : `starts in ${pl(dt)}`}); break; }
    if (st === 'none' && x.entry_close_date) {           // enter-now reminder only while NOT entered
      const dc = daysTo(x.entry_close_date);
      for (const d of S.closeDays) if (dc <= d && dc >= 0) { out.push({key:`${id}:close:${d}`, x, when:dc, kind:'close', st, text:`entries close in ${pl(dc)} – you haven't entered`}); break; }
    }
    if (st === 'entered') {                               // pay reminder only if entered but not paid
      const ref = x.entry_close_date && daysTo(x.entry_close_date) >= 0 ? x.entry_close_date : x.start_date, dp = daysTo(ref), days = ref === x.start_date ? S.remindDays : S.closeDays;
      for (const d of days) if (dp <= d && dp >= 0) { out.push({key:`${id}:pay:${d}`, x, when:dp, kind:'pay', st, text: ref === x.start_date ? `you're entered but haven't marked it paid – event in ${pl(dp)}` : `you're entered but haven't marked it paid – entries close in ${pl(dp)}`}); break; }
    }
  }
  return out.sort((a, b) => a.when - b.when);
}
const REM_BADGE = {none:'<span class="b todo">☐ Not entered</span>', entered:'<span class="b ent">✓ Entered · ☐ Not paid</span>', paid:'<span class="b paid">✓ Entered · $ Paid</span>'};
const REM_ICON = {shoot:'⏰', close:'⏳', pay:'$'};
function checkReminders(){
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const r of reminders()) {
    if (S.notified[r.key]) continue;
    const body = `${range(r.x)} · ${r.x.location || ''}\n${r.kind === 'close' ? 'Tap to open the entry page.' : r.kind === 'pay' ? 'Tap to open the event and mark it paid.' : {paid:'✓ You are entered and paid.', entered:'✓ Entered · ☐ not marked paid.', none:'☐ You have NOT marked this as entered.'}[r.st]}`;
    const opts = {body, tag:r.key, icon:'icons/icon-192.png', data:{id:r.x.id}};
    navigator.serviceWorker?.ready.then(reg => reg.showNotification(`${r.x.name} ${r.text}`, opts)).catch(() => new Notification(`${r.x.name} ${r.text}`, opts));
    S.notified[r.key] = Date.now();
  }
  save();
}

/* ---------- views ---------- */
// Live stream countdown – Archery Australia National Target & Para Championships finals (Hobart, 24 Oct 2026, 9am AEDT). Shows to target, LIVE NOW for 10 h, then turns into a replay link (no timer).
const LS = {id: 'aa-2026-4', title: 'Watch live: AA National Target & Para Champs finals 2026', start: Date.parse('2026-10-24T09:00:00+11:00'), hrs: 10, watch: 'https://archery.org.au/videos/', post: 'https://www.facebook.com/share/19ufdj2yVj/', replay: 'Watch the replay: AA National Target & Para Champs finals 2026'};
function lsZone(d){
  const nm = loc => { try { return (new Intl.DateTimeFormat(loc, {timeZoneName: 'short'}).formatToParts(d).find(x => x.type === 'timeZoneName') || {}).value || ''; } catch (e) { return ''; } };
  const tries = ['en-AU', 'en-US', 'en-GB', 'en-NZ', 'en-IN', navigator.language || 'en'].map(nm);
  return tries.find(z => z && !/^(GMT|UTC)[+-]/.test(z)) || tries.find(Boolean) || '';
}
function lsWhen(){
  const d = new Date(LS.start), o = {weekday: 'short', day: 'numeric', month: 'short'};
  let day, tm;
  try { day = new Intl.DateTimeFormat('en-AU', o).format(d).replace(/,/g, ''); tm = new Intl.DateTimeFormat('en-AU', {hour: 'numeric', minute: '2-digit', hour12: true}).format(d).replace(/\s/g, '').toLowerCase(); }
  catch (e) { day = d.toDateString().slice(0, 10); tm = d.toTimeString().slice(0, 5); }
  return `${day}, ${tm} your time (${lsZone(d)})`;
}
function lsCount(ms){
  const t = Math.max(0, Math.floor(ms / 1000)), p = n => String(n).padStart(2, '0');
  const u = [[Math.floor(t / 86400), 'days', 'd'], [Math.floor(t / 3600) % 24, 'hrs', 'h'], [Math.floor(t / 60) % 60, 'min', 'm'], [t % 60, 'sec', 's']];
  return u.map(([n, l], i) => `<span class="ls-u"><b>${i ? p(n) : n}</b><small>${l}</small></span>`).join('');
}
function lsState(now = Date.now()){ return now < LS.start ? 'soon' : now < LS.start + LS.hrs * 3600e3 ? 'live' : 'over'; }
function lsBox(){
  const st = lsState();
  if (st === 'over') {   // finals are over: same box, no timer, just the replay link
    const gr = `data-gc="watch-replay/${esc(LS.id)}" data-gc-t="${esc(LS.replay)}"`;
    return `<aside class="ls-box rp" id="lsBox" aria-label="Replay: National Target and Para Championships finals">
    <a class="ls-thumb" href="${LS.watch}" ${gr} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><picture><source type="image/webp" srcset="img/aa-target-para-2026-stream.webp"><img src="img/aa-target-para-2026-stream.jpg" alt="" width="440" height="550" loading="lazy"></picture></a>
    <div class="ls-body">
      <p class="ls-tag">▶ Replay</p>
      <h2 class="ls-h">${esc(LS.replay)}</h2>
      <p class="ls-when">Finals streamed from Hobart on Sat 24 Oct 2026<small>Archery Australia</small></p>
    </div>
    <div class="ls-links"><a class="btn gold ls-watch" href="${LS.watch}" ${gr} target="_blank" rel="noopener">▶ Watch the replay</a>
      <a class="ls-url" href="${LS.watch}" ${gr} target="_blank" rel="noopener">archery.org.au/videos</a>
      <a class="ls-post" href="${LS.post}" target="_blank" rel="noopener">Archery Australia post ↗</a></div>
  </aside>`;
  }
  const gw = `data-gc="watch-live/${esc(LS.id)}" data-gc-t="${esc(LS.title)}"`;   // click counted in GoatCounter (gcClicks)
  const live = st === 'live';
  return `<aside class="ls-box${live ? ' on' : ''}" id="lsBox" aria-label="Live stream: National Target and Para Championships finals">
    <a class="ls-thumb" href="${LS.watch}" ${gw} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><picture><source type="image/webp" srcset="img/aa-target-para-2026-stream.webp"><img src="img/aa-target-para-2026-stream.jpg" alt="" width="440" height="550" loading="lazy"></picture></a>
    <div class="ls-body">
      <p class="ls-tag">${live ? '<span class="ls-dot" aria-hidden="true"></span> LIVE NOW' : '▶ Live stream'}</p>
      <h2 class="ls-h">${live ? 'LIVE NOW, watch the finals' : 'Target &amp; Para Champs finals'}</h2>
      ${live ? '' : `<div class="ls-count" id="lsCount" role="timer" aria-live="off">${lsCount(LS.start - Date.now())}</div>`}
      <p class="ls-when">${live ? 'Streaming now from Hobart' : `Starts ${esc(lsWhen())}`}<small>9:00am AEDT, Tasmania · Archery Australia</small></p>
    </div>
    <div class="ls-links"><a class="btn gold ls-watch" href="${LS.watch}" ${gw} target="_blank" rel="noopener">▶ Watch live</a>
      <a class="ls-url" href="${LS.watch}" ${gw} target="_blank" rel="noopener">archery.org.au/videos</a>
      <a class="ls-post" href="${LS.post}" target="_blank" rel="noopener">Archery Australia post ↗</a></div>
  </aside>`;
}
function TICKS_LS(){
  const b = document.getElementById('lsBox'); if (!b) return;
  const st = lsState(), on = b.classList.contains('on');
  if (st === 'over') { if (!b.classList.contains('rp')) { const t = document.createElement('div'); t.innerHTML = lsBox(); b.replaceWith(...t.childNodes); } return; }
  if ((st === 'live') !== on) { const t = document.createElement('div'); t.innerHTML = lsBox(); b.replaceWith(...t.childNodes); return; }
  const c = document.getElementById('lsCount'); if (c) c.innerHTML = lsCount(LS.start - Date.now());
}
function appVideoBox(){
  if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone) return '';   // already installed: hide
  return `<section class="appvid" id="appVid" aria-labelledby="appVidH"><div class="av-copy"><span class="kicker">Free, no app store</span>
    <h2 class="av-h" id="appVidH">Put Archery Calendar on your phone like an app</h2>
    <p>Watch how, it takes 30 seconds. Works on iPhone and Samsung, no app store.</p>
    <details class="av-steps"><summary>Prefer to read the steps?</summary>
      <h3>iPhone (Chrome)</h3><ol><li>Open archerycalendars.com in Chrome.</li><li>Tap the Share icon.</li><li>Tap Add to Home Screen, then Add.</li></ol>
      <h3>Samsung (Chrome)</h3><ol><li>Open archerycalendars.com in Chrome.</li><li>Tap the three dots menu.</li><li>Tap Add to Home screen or Install app, then Install.</li></ol>
    </details></div>
    <div class="av-vid"><video controls preload="none" playsinline poster="img/howto-app-poster.jpg" width="540" height="960" aria-label="How to put Archery Calendar on your phone like an app"><source src="media/add-to-home-screen.mp4" type="video/mp4">Your browser can't play this video.</video></div>
  </section>`;
}
// Latest news: one-line cards linking to newsletter issues (static pages under /newsletter/), newest first. Update NEWS when a new issue goes up.
// where: which home pages show the card (AUS = Australian home, otherwise the country's home page by code).
const NEWS = [
  {url: 'newsletter/yankton-world-championships-2026/', title: 'Yankton world championships wrap-up: who won in South Dakota, Aussie gold, and where to watch', where: ['AUS', 'USA', 'GER', 'FRA', 'DEN', 'GBR', 'ITA', 'SWE', 'SLO', 'AUT', 'ESP']}  /* the countries in the article; SWE has no country page yet, so it shows once one exists */,
  {url: 'newsletter/hobart-nationals-2026/', title: 'Hobart nationals wrap-up: who won, the Para world records, and where to watch', where: ['AUS']}
];
/*NEWS_COLS:BEGIN (generated by scripts/build_news_cols.py from the newsletter pages; do not edit by hand)*/
const NEWS_COLS = [{"url":"newsletter/yankton-world-championships-2026/","short":"Yankton world championships","title":"Yankton world championships wrap-up: who won in South Dakota, Aussie gold, and where to watch","date":"Tuesday 27 October 2026","blocks":[["p","The 2026 World Archery Field Championships and the World Archery 3D Championships were held back to back at the NFAA Easton Yankton Archery Center in Yankton, South Dakota, from late September into early October. The organisers describe it as the first combined event of its kind. World Archery reports 244 field archers from 31 nations and 231 3D archers from 25 nations. Modelled historical weather data (not an official report) suggests it was wet around the field eliminations and finals, and Brady Ellison said he struggled in the rain."],["h","FIELD CHAMPIONS"],["n","(senior gold medal matches, from the official Results Book, Saturday 26 September)"],["li","<b>Recurve Men:</b> Florian Unruh (Germany) beat Brady Ellison (USA) 66-65, finishing with a perfect last arrow. The pair have now met ten times, with five wins each."],["li","<b>Recurve Women:</b> Casey Kaufhold (USA) beat Audrey Machinet (France) 62-52, her first world title."],["li","<b>Compound Men:</b> Mathias Fullerton (Denmark) beat Gaius Carter (USA) 71-70."],["li","<b>Compound Women:</b> Ella Gibson (Great Britain) beat Paige Pearce (USA) 69-68."],["li","<b>Barebow Men:</b> Giuseppe Seimandi (Italy) beat Erik Jonsson (Sweden) 52-46."],["li","<b>Barebow Women:</b> Eleonora Strobbe (Italy) beat Nora Kipferler (Germany) 54-44, her second world field title, 16 years after her first."],["h","FIELD TEAM FINALS"],["n","(Sunday 27 September)"],["li","<b>Men&#x27;s Team:</b> USA (Gaius Carter, Ryan Davis, Brady Ellison) beat Italy after a shoot-off. The match finished 53-53, and the shoot-off went 17 to 14. Davis opened with a six."],["li","<b>Women&#x27;s Team:</b> USA (Paige Pearce, Erin Hollom, Casey Kaufhold) beat Italy 58-55."],["li","<b>Compound Mixed Team:</b> USA (Paige Pearce, Gaius Carter) beat Italy 91-87."],["li","<b>Barebow Mixed Team:</b> Italy (Cinzia Noziglia, Matteo Uggeri) beat Germany 67-56. It was Noziglia&#x27;s 10th World Field medal, across five editions."],["li","<b>Recurve Mixed Team:</b> Australia (Alexandra Feeney, Ryan Tyack) beat Italy 78-77."],["h","AN AUSSIE HIGHLIGHT"],["p","That last result was the surprise of the day. Alexandra Feeney and Ryan Tyack qualified sixth, beat Great Britain and the USA on the way to the final, then edged the top-seeded Italians by a single point. The semi-final against the USA was settled by a shoot-off. Both were on the podium at the Hobart nationals too, Tyack with silver and Feeney with bronze. May Hu, who won barebow women gold in Hobart, took bronze in the barebow women&#x27;s final in Yankton (45-43 over Nicky Fairweather), and Nicky and Simon Fairweather took bronze in the barebow mixed team. Australia finished fifth on World Archery&#x27;s field medal table, which ranks by gold medals, with six medals in all. Italy led it with 16 medals, ahead of the USA with 15 (totals include the under-21 events)."],["h","UNDER 21 AUSTRALIANS"],["p","Xavier Clark, 20, had a busy week in the under 21 events. In the barebow under 21 men he qualified fifth with 301 and lost the quarter-final 57-59 to Jacob Olmstead (USA), finishing fifth. He then shot the men&#x27;s under 21 team with Christopher Jackson and Joshua Turner. Seeded second, they went straight into the semi-final and beat the USA 55-54, then lost the gold medal match 58-65 to Great Britain to take silver on Sunday 27 September. Jackson also took bronze in the recurve men at the Hobart nationals. Clark also shot the barebow under 21 mixed team, which finished third of three teams behind Italy and the USA."],["h","3D CHAMPIONS"],["n","(individual gold medal matches, Results Book, Saturday 3 October; the team finals were on Friday 2 October)"],["li","<b>Compound Men:</b> Tim Jevsnik (Slovenia) beat Nico Wiener (Austria) 84-75."],["li","<b>Compound Women:</b> Aude Ama-Cormerais (France) beat Ingrid Ronacher (Austria) 72-65."],["li","<b>Barebow Men:</b> David Jackson (France) beat Cesar Vera Bringas (Spain) 81-66, his third world 3D title."],["li","<b>Barebow Women:</b> Virginie Chevrier (France) beat Rosemarie Leitner (Austria) 57-44."],["li","<b>Longbow Men:</b> Mikhail Poddevalin (listed as Russia) beat Robin Gardeur (France) 62-60."],["li","<b>Longbow Women:</b> Johanna Pitschmann (Austria), aged 63, beat Cecile Lafaurie (France) 60-39."],["li","<b>Traditional Men:</b> Zibrandt Christensen (Denmark) beat Kevin Gheda (Italy) after a 63-63 tie, decided on closest to the centre."],["li","<b>Traditional Women:</b> Judith Wenzl (Germany) beat Julie Jones (USA) 60-49."],["p","France topped the 3D medal table with five golds and eight medals, ahead of Austria and Russia on golds."],["h","WATCH THE FINALS"],["p","World Archery said before the event that live footage of the field finals on 26 and 27 September would be on archery+ (subscription): <a href=\"https://archery.tv/home/events/A9eiZQ5VVlGv1dwx2By9\" target=\"_blank\" rel=\"noopener\">https://archery.tv/home/events/A9eiZQ5VVlGv1dwx2By9</a>. World Archery has also posted three full gold medal matches free on its YouTube channel: Unruh v Ellison <a href=\"https://www.youtube.com/watch?v=srEbWtVHbKg\" target=\"_blank\" rel=\"noopener\">https://www.youtube.com/watch?v=srEbWtVHbKg</a>, Fullerton v Carter <a href=\"https://www.youtube.com/watch?v=JzxDv9KNSsc\" target=\"_blank\" rel=\"noopener\">https://www.youtube.com/watch?v=JzxDv9KNSsc</a> and Seimandi v Jonsson <a href=\"https://www.youtube.com/watch?v=6Qq50zPwNaA\" target=\"_blank\" rel=\"noopener\">https://www.youtube.com/watch?v=6Qq50zPwNaA</a>. The 3D event was not livestreamed. Full brackets and scorecards are in the official Results Books on the World Archery website."],["p","Congratulations to every archer who made the trip to Yankton, and to the volunteers and judges who kept it all running."]]},{"url":"newsletter/hobart-nationals-2026/","short":"Hobart nationals","title":"Hobart nationals wrap-up: who won, the Para world records, and where to watch","date":"Tuesday 27 October 2026","blocks":[["p","The 2026 National Target and Para Championships wrapped up at the University of Tasmania, Sandy Bay Campus, in Hobart this past weekend, and there were some great stories. Conditions were warm and breezy early in the week, with some very gusty days, and Archery Australia says finals day on Saturday 24 October had gold medal matches in sunshine, wind and rain, with a few shoot-outs along the way."],["h","INDIVIDUAL CHAMPIONS"],["n","(gold medal match scores from the official Ianseo results)"],["li","<b>Recurve Men:</b> Jai Crawley (Archery VIC) beat Ryan Tyack 6-2. Christopher Jackson took bronze."],["li","<b>Recurve Women:</b> Seoyoon An beat Megan Denier 6-0. Alexandra Feeney took bronze."],["li","<b>Compound Men:</b> Matt McDougall beat Nathan Rowley 147-144, a cracker of a final. Bailey Wildman took bronze."],["li","<b>Compound Women:</b> Vida Halimian beat Liezel-Marié Roux 143-135. Rhiannon Mills took bronze."],["li","<b>Barebow Men:</b> Judah Holmes won gold for Tasmania, beating Rayan Valian 7-3. Matthew Shears took bronze."],["li","<b>Barebow Women:</b> May Hu beat Tracy Bryen 6-2. Hannah Potter took bronze for Tasmania."],["h","PARA CHAMPIONS"],["n","(Ianseo, Para event, Hobart 21 to 24 October)"],["li","<b>Para Compound Men:</b> Jonathon Milne beat Lewis Matthews 144-140."],["li","<b>Para Compound Women:</b> Ameera Christina Lee beat Amanda Jennings 124-115."],["li","<b>Para Recurve Men:</b> Huynh Duong beat Stuart Hume 6-5 in a shoot-off. Thomas Holland took bronze."],["li","<b>Para Recurve Women:</b> Sonia Withey beat Imalia Oktrininda 6-2."],["li","<b>Visually Impaired 1:</b> Craig Newbery beat Lewis Parkins 6-2. Glen Baxter took bronze, beating Hockley 6-0."],["li","<b>W1:</b> Christopher Davis beat Jadein Burns 6-0."],["li","<b>Para Compound Doubles:</b> Jadein Burns and Lewis Matthews won gold, 139-132 over Lee and Georgelin. Jennings and Dinnerville took bronze."],["li","<b>Para Recurve Doubles:</b> Huynh Duong and Stuart Hume won gold, 6-2 over Richard Davis and Thomas Holland. Oktrininda and Marek Steiner took bronze."],["h","JONATHON MILNE&#x27;S WORLD RECORDS"],["p","Jonathon Milne shot 1401 in the 90/1440 round on day one. World Archery reports that his Para world records at 50 m (354) and 30 m (360) were set at these championships and have been ratified. Archery Australia&#x27;s day one post had the 30 m score at 360 with 24 Xs."],["h","A WORD FOR PAT COGHLAN"],["p","Pat Coghlan (Victor Harbor Archery Club, shooting for Archery SA) had a busy week. He qualified 5th in Compound Men with 691, won his first two rounds (144-112 over Glen Preece, then 142-136 over Lewis Matthews) and lost a one-point quarter-final, 143-144, to Matt McDougall, who went on to win gold. Pat finished 5th. In the Compound Mixed Team, Pat and Rhiannon Mills took GOLD, after qualifying 4th with 1335 and winning a tied final against Robin Hastie and Bailey Wildman on the tie-break. Pat&#x27;s Compound Men Team, Pats Archery (Pat, Matt McDougall and Sonter), finished 4th: they beat HAM 221-214, lost the semi-final 224-229 to Clear Advantage, and lost the bronze match 222-229 to Wild Concept. Pat also won the 900 round in the 50+ male compound with 884, ahead of Byron Boucher (878) and Jeffrey Lim (848)."],["h","TEAM HIGHLIGHTS"],["p","Compound Mixed Team: gold to Pat Coghlan and Rhiannon Mills (Archery SA)."],["p","South Queensland Archery Society won both the Recurve (6404) and Compound (6835) RGB teams awards, and the Archery Society of Tasmania won the Barebow award (3737). Gold medal teams in all nine team events are listed on Ianseo."],["h","THANKS TO THE SPONSORS"],["p","The event manual names Pat&#x27;s Archery as a long-term partner and sponsor, and Ramrod as sponsor of the mixed team prize. Archery Australia also thanked Hoyt, Easton and Ramrods products for their ongoing support."],["h","WATCH THE FINALS"],["p","Archery Australia streamed the gold medal matches on YouTube. The replay runs about nine hours, from 8:24am Hobart time on Saturday 24 October: <a href=\"https://www.youtube.com/watch?v=mgnsBwlBfck\" target=\"_blank\" rel=\"noopener\">https://www.youtube.com/watch?v=mgnsBwlBfck</a> (Archery Australia channel). Full brackets and scores are on Ianseo (search for the 2026 National Target Championships). Archery Australia has also said a recap newsletter with photos is on the way."],["p","Congratulations to every archer who made the trip, and to the volunteers and judges who kept it all running."]]}];
/*NEWS_COLS:END*/
/* Tall newsletter columns (desktop, 1280px and up): Yankton on the left, Hobart on the right, each the real article text, running down the side space of the home page
   and scrolling with the page. Text is clipped at a whole paragraph / list item to the page height (fitNewsCols); the full article is one tap away. Below 1280px and on phones the stacked
   Latest news cards (newsCard) are used and these columns are hidden. */
const newsCols = () => NEWS_COLS.map((n, i) => `<section class="news-col ${i ? 'nc-r' : 'nc-l'}" aria-labelledby="ncH${i}"><div class="nc-in">
  <p class="nc-kick">Archery Calendar newsletter</p><h2 class="nc-h" id="ncH${i}"><a href="${esc(n.url)}" data-gc="home-card/newsletter-col" data-gc-t="Newsletter column headline (${esc(n.short)})">${esc(n.title)}</a></h2><p class="nc-date">${esc(n.date)}</p>
  <div class="nc-body">${n.blocks.map(([k, h]) => k === 'h' ? `<h3 class="nc-sub">${h}</h3>` : k === 'n' ? `<p class="nc-note">${h}</p>` : k === 'li' ? `<p class="nc-li">${h}</p>` : `<p>${h}</p>`).join('')}</div>
  <p class="nc-more"><a class="btn gold" href="${esc(n.url)}" data-gc="home-card/newsletter-col-read" data-gc-t="Read the full article (${esc(n.short)})">Read the full article</a> <a class="nc-all" href="newsletter/">All newsletters</a></p></div></section>`).join('') + (setTimeout(initNewsFit, 0), '');
let _ncRO = null, _ncRaf = 0;
function fitNewsCols(){
  document.querySelectorAll('.news-col').forEach(c => {
    const b = c.querySelector('.nc-body'); if (!b || !c.offsetParent) return;
    const key = c.clientWidth + 'x' + c.clientHeight; if (c.dataset.fit === key && b.dataset.n === String(b.children.length)) return;
    const u = [...b.children]; u.forEach(e => e.hidden = false);
    let k = u.length - 1; while (k > 0 && b.scrollHeight > b.clientHeight + 1) u[k--].hidden = true;
    while (k > 0 && (u[k].classList.contains('nc-sub') || u[k].classList.contains('nc-note') || u[k].hidden)) u[k--].hidden = true;   // never end on a heading or its note
    c.dataset.fit = key; b.dataset.n = String(u.length);
    c.classList.toggle('nc-cut', u.some(e => e.hidden));
  });
}
function initNewsFit(){
  const go = () => { cancelAnimationFrame(_ncRaf); _ncRaf = requestAnimationFrame(fitNewsCols); };
  if (!_ncRO && window.ResizeObserver) { _ncRO = new ResizeObserver(go); _ncRO.observe(document.body); addEventListener('resize', go); }
  document.querySelectorAll('.news-col').forEach(c => delete c.dataset.fit); go();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { document.querySelectorAll('.news-col').forEach(c => delete c.dataset.fit); go(); });
}
const newsItems = code => NEWS.filter(n => n.where.includes(code || 'AUS'));
const newsCard = code => newsItems(code).map(n => `<a class="news-card nc-main" href="${esc(n.url)}" data-gc="home-card/newsletter" data-gc-t="Latest news card (home)"><span class="nc-tag">Latest news</span><span class="nc-t">${esc(n.title)}</span><span class="nc-go" aria-hidden="true">&rarr;</span></a>`).join('');
/* Help panel "What is Archery Calendar?" text: names the country the visitor is viewing (country home / international page), else their home country.
   Organisations are only ones the site really lists for that country (from data/intl.json sources); countries with none listed get the plain country line. Australia keeps its own text (in help.js). */
const HELP_ORGS = {USA: 'USA Archery, NFAA, IBO and the Archery Shooters Association', DEN: 'Bueskydning Danmark', NZL: 'Archery New Zealand, NZ Field Archery Association, the NZ Bowhunters Society and ArcheryOSA',
  GBR: 'Archery GB', CAN: 'Archery Canada and Archery Manitoba', AUT: 'the Österreichischer Bogensportverband', SUI: 'Swiss Archery', MAS: 'NAAM', KOR: 'the Korea Archery Association', NED: 'IFAA',
  TUR: 'the Turkish Archery Federation', FRA: 'the FFTA', IRL: 'Archery Ireland', LUX: "the Fédération Luxembourgeoise de Tir à l'Arc", ITA: 'the Italian Archery Federation', SVK: 'the Slovak Archery Association',
  BEL: 'the Belgian Archery Federation', GER: 'IFAA', HUN: 'IFAA'};
function helpAbout(){
  let c = ''; try { const [, p, a] = (location.hash || '').split('?')[0].split('/'); if (p === 'home' && !a) return ''; if ((p === 'home' || p === 'intl') && a) c = iso3of(decodeURIComponent(a)) || ''; } catch {}
  if (!c) { try { c = homeCode(); } catch {} }
  if (!c || c === 'AUS') return '';
  if (c === 'WORLD') return `<p>Archery Calendar puts archery events from around the world in one place, from World Archery and national federations. It's free.</p><p>Tap any event for dates, venue, entry details and the flyer.</p>`;
  let nm = ''; try { nm = iName(c); } catch {} if (!nm || nm === c) return '';
  const the = /^(United|Netherlands)/.test(nm) ? 'the ' : '', o = HELP_ORGS[c];
  return `<p>Archery Calendar puts archery events from around ${the}${esc(nm)} (and overseas) in one place${o ? `, including events from ${esc(o)}` : ''}. It's free.</p><p>Tap any event for dates, venue, entry details and the flyer.</p>`;
}
function vHome(){
  setTitle('Archery Calendar');
  const mine = Object.keys(S.saved).map(id => BYID[id]).filter(Boolean);
  const up = mine.filter(x => !isPast(x)).sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
  const nEnt = up.filter(x => ST(x.id) !== 'none').length, nPay = up.filter(x => ST(x.id) === 'entered').length, nTodo = up.filter(x => ST(x.id) === 'none' && !x.info_only).length;
  const rem = reminders();
  const next = up.find(x => x.start_date);
  const h = photo('mixed');
  return `
  <section class="hero" style="--img:url('${esc(h.file)}');--pos:${esc(h.pos || 'center 35%')}"><div class="wrap hero-grid">
    <div class="hero-copy"><p class="kicker">Field · 3D · Target · Indoor</p><h1>Every archery event.<br><span>One calendar.</span></h1>
      <p class="lead">${AUS() ? 'Find archery events across Australia – Archery Australia, ABA and Archery WA.' : 'Find events across WA, Australia and the world.'} Save them, get reminders before entries close, and keep track of what you've paid.</p>
      <form class="hero-search" id="heroSearch" role="search"><input type="search" id="hq" placeholder="Search an event, club or town…" aria-label="Search events"><button class="btn gold" type="submit">Find events</button></form><p class="hero-near"><a class="nm-hero-btn" href="#/near"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>Find clubs near me</a></p></div>
    ${next ? `<a class="next-card" href="#/shoot/${esc(next.id)}"><span class="kicker">Your next event</span>${bigCd(next)}
      <span class="nm">${esc(next.name)}</span><span>${esc(range(next))}</span><span class="st">${ST_TXT[ST(next.id)]}</span></a>` : ''}
  </div>${credit('mixed')}${spHero('', 'home')}</section>
  <div class="wrap home-wrap">${spRails('')}${newsCols()}
    <div class="stats four"><a class="stat" href="#/calendar"><b>${up.length}</b><span>★ My events</span></a><a class="stat" href="#/entries"><b>${nEnt}</b><span>✓ Entered</span></a><a class="stat" href="#/entries"><b>${nTodo}</b><span>☐ To enter</span></a><a class="stat" href="#/entries"><b>${nPay}</b><span>$ To pay</span></a></div>
    ${newsCard('AUS')}
    ${spStrip()}
    ${pendStrip()}
    ${adSlot('banner')}
    <h2 class="sec-h">Pick your discipline</h2>
    <div class="types">${['field','3d','target','indoor'].map(t => `<a class="type th-${t}" href="#/browse" data-th="${t}" style="--img:url('${esc(photo(t === 'field' ? 'aba_field' : t).sm)}');--pos:${esc(photo(t === 'field' ? 'aba_field' : t).pos || 'center')}"><span class="type-name">${THEMES[t][0]} ${THEMES[t][1]}</span><span class="type-sub">${{field:'Bush courses, marked & unmarked', '3d':'Foam animals in the bush', target:'Outdoor ranges, 18–90 m', indoor:'18 m halls, 3-spot & Vegas'}[t]}</span></a>`).join('')}</div>
    <div class="cats-row" aria-label="Club events, coaching, youth and come & try">${['club', 'coaching', 'youth', 'come_try'].map(c => `<a class="cat-link cat-${c}" href="#/browse" data-cat="${c}">${(k => PH[k] ? `<span class="cat-img" aria-hidden="true" style="background-image:url('${esc(PH[k].sm)}');background-position:${esc(PH[k].pos || 'center')}"></span>` : '')({club: 'us_field', coaching: 'aba_field', youth: 'youth', come_try: 'come_try'}[c])}<span class="ci" aria-hidden="true">${CATS[c][0]}</span><b>${CATS[c][2]}</b><span>${EV.filter(x => catOf(x) === c && visible(x) && !isPast(x)).length} coming up</span></a>`).join('')}</div>
    ${homeClubs()}
    <div class="two">
      <section><h2 class="sec-h">Reminders</h2>
      ${rem.length ? rem.map(r => `<div class="panel rem" data-open="${esc(r.x.id)}" role="link" tabindex="0"><b><span aria-hidden="true">${REM_ICON[r.kind]}</span> ${esc(r.x.name)}</b><div>${esc(r.text)}</div><div class="badges">${r.kind === 'close' ? '<span class="b close">⏳ Enter now</span>' : r.kind === 'pay' ? '<span class="b ent">$ Pay now</span>' : REM_BADGE[r.st]}</div></div>`).join('')
        : `<p class="note">Nothing due. You'll get reminders ${S.remindDays.join(', ')} days before each event, and ${S.closeDays.join(' / ')} days before entries close (only if you haven't entered), plus a pay reminder if you've entered but not paid.</p>`}</section>
      <section><h2 class="sec-h">Coming up in my events</h2>
      ${up.length ? `<div class="list">${up.slice(0, 4).map(evCard).join('')}</div>` : `<div class="empty">No events yet. Tap ☆ on any event in <a href="#/browse">Find events</a>.</div>`}</section>
    </div>
    ${appVideoBox()}
    ${clubCta()}
    <p class="center see-all"><a class="btn" href="#/browse" id="seeAll">See all events →</a></p>
  </div>`;
}
/* ---------- smart search: every word must match (AND); synonyms, state names/capitals, months, status; light typo tolerance ---------- */
const CAPITAL = {WA:'perth', SA:'adelaide', VIC:'melbourne', NSW:'sydney', ACT:'canberra', QLD:'brisbane', TAS:'hobart', NT:'darwin'};
const STATE_ALIASES = {wa:'WA', 'western australia':'WA', sa:'SA', 'south australia':'SA', vic:'VIC', victoria:'VIC', nsw:'NSW', 'new south wales':'NSW', act:'ACT',
  'australian capital territory':'ACT', qld:'QLD', queensland:'QLD', tas:'TAS', tasmania:'TAS', nt:'NT', 'northern territory':'NT',
  perth:'WA', adelaide:'SA', melbourne:'VIC', sydney:'NSW', canberra:'ACT', brisbane:'QLD', hobart:'TAS', darwin:'NT'};
const PHRASES = [[/\b(come (and|n|&) try|come ?n ?try|have ?a ?go|cnt|try archery|come and trial)\b/g, ' cometry '], [/\bworld record status\b/g, ' qre '], [/\bclub ?shoots?\b/g, ' clubshoot '],
  [/\b3 ?- ?d\b/g, ' 3d '], [/\bnats\b/g, ' nationals '], [/\bchamps?\b/g, ' championships '], [/\btitle\b/g, ' titles '], [/\bover ?50s?\b/g, ' over50 '], [/\b(wa|fita) (1440|720|960)\b/g, ' $2 '], [/\bhunter round\b/g, ' hunter round '],
  [/\bstate titles\b/g, ' statetitles state titles '], [/\bbranch titles\b/g, ' branchtitles branch titles ']];
function snorm(t){
  let s = ' ' + String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/3-d/g, '3d').replace(/[^a-z0-9]+/g, ' ') + ' ';
  for (const [re, r] of PHRASES) s = s.replace(re, r);
  return s.replace(/\s+/g, ' ').trim();
}
function hay(x){
  if (x._hay) return x._hay;
  const sc = x.state_code, st = STATES.find(z => z[0] === sc), months = [];
  if (x.start_date) for (let d = pd(x.start_date); d <= pd(x.end_date || x.start_date) && months.length < 14; d.setMonth(d.getMonth() + 1, 1)) months.push(MONL[d.getMonth()], MON[d.getMonth()], String(d.getFullYear()));
  if (x.end_date) { const e = pd(x.end_date); months.push(MONL[e.getMonth()], MON[e.getMonth()]); }
  const GT = {aa:'aa archery australia', aba:'aba bowhunters australian bowhunters association', awa:'awa archery wa archerywa', taa:'taa traditional archery australia trad'}, grpTxt = [x.org_group, ...(x.also_groups || [])].map(g => GT[g] || '').join(' ');
  const lvl = [x.level, x.rounds, x.titles === 'state' ? 'state titles' : x.titles === 'branch' ? 'branch titles' : '', /\bqre\b|world record/i.test((x.name || '') + ' ' + (x.level || '')) ? 'qre world record status' : '',
    /national/i.test((x.level || '') + ' ' + x.name) && !/registered/i.test(x.level || '') ? 'nationals national' : '', x.members_only ? 'club championship members' : ''];
  const cat = catOf(x), catTxt = {competition:'competition event shoot tournament', club:'club event clubshoot social local', coaching:'coaching course coach', youth:'youth junior kids training', come_try:'come and try beginners', seminar:'seminar workshop clinic coaching coach masterclass'}[cat] + (x.book_anytime ? ' corporate team building book anytime' : '');
  const stat = [x.org_status === 'flyer' ? 'flyer out details' : 'no entry details yet', x.entry_close_date ? (daysTo(x.entry_close_date) < 0 ? 'entries closed' : 'entries open') : x.registration_url ? 'entries open' : ''];
  const cb = CLUB[x.club_id], words = snorm([x.name, x.host, cb && cb.name, ...(cb ? cb.aliases : []), x.location, x.org, sc, st && st[1], sc && CAPITAL[sc], x.discipline, catTxt, ...lvl, grpTxt, x.branch ? 'branch ' + x.branch : '', x.branch_name, ...months, ...stat, x.series_part, x.notes, x.country, x.country_name, x.country_code, x.us_state, x.us_org, x.org_id, acroTxt(x), ...Object.entries(x.flyer_extract || {}).filter(([k, v]) => typeof v === 'string' && !/url|source/.test(k)).map(([, v]) => v), roundTerms(x)].filter(Boolean).join(' '));
  return x._hay = {s: ' ' + words + ' ', w: [...new Set(words.split(' '))]};
}
const ACRO = [[/total archery challenge/i, 'tac'], [/indoor world series/i, 'iws'], [/\bnfaa\b|national field archery association/i, 'nfaa national field archery association'], [/\bifaa\b|international field archery/i, 'ifaa international field archery association'],
  [/\baba\b|bowhunters association/i, 'aba australian bowhunters association'], [/\btaa\b|traditional archery australia/i, 'taa traditional archery australia'], [/\bibo\b|international bowhunting/i, 'ibo international bowhunting organization'],
  [/\basa\b|archery shooters association/i, 'asa archery shooters association'], [/usa archery/i, 'usa archery usaa'], [/las vegas/i, 'vegas'], [/olympic/i, 'olympics olympic games']];
function acroTxt(x){ const t = [x.name, x.org, x.org_id, x.us_org, x.host, x.location].filter(Boolean).join(' '); return ACRO.filter(([re]) => re.test(t)).map(([, a]) => a).join(' '); }
function roundTerms(x){   // archery jargon derived from rounds/discipline text
  const t = [x.rounds, x.discipline, x.name, x.level, x.flyer_extract && x.flyer_extract.rounds].filter(Boolean).join(' ').toLowerCase(), out = [];
  for (const m of t.matchAll(/\b(wa|aa|fita)\s?(\d{2,3})\s?\/?\s?(1440|720|960|1080|900)?/g)) { out.push(m[2] + 'm'); if (m[3]) out.push(m[3], 'wa' + m[3]); if (m[1] !== 'aa') out.push('fita world archery'); }
  for (const m of t.matchAll(/\b(1440|720|960|900|1080)\b/g)) out.push(m[1], 'wa' + m[1]);
  if (/world archery|\bwa\s?(1440|720|70|60|50)|fita|qre|registered tournament/.test(t)) out.push('fita');
  if (/indoor/.test((x.discipline || '') + ' ' + (x.name || ''))) out.push('18m 25m indoor');
  if (/ifaa/.test(t)) out.push('ifaa');
  if (/aus\s?960|crossbow/.test(t)) out.push('aus960 crossbow');
  if (/clout/.test(t)) out.push('clout');
  if (/50 ?plus|over 50|masters|veteran|old coot/.test(t)) out.push('masters veterans over50 50plus');
  if (/junior|youth|young|kid|cub|u21|u18|tyro/.test(t + ' ' + (x.category || ''))) out.push('junior youth kids');
  if (x.org_group === 'aba' && /\baba\b|3d|ifaa|field/.test(t)) out.push('hunter round animal round field round');
  return out.join(' ');
}
const QSYN = {fita:['fita','world archery'], veterans:['masters','veterans'], vets:['masters','veterans'], masters:['masters','veterans'], over50:['over50','50plus','masters'],
  juniors:['junior'], kids:['junior','youth','kids'], wa1440:['1440'], wa720:['720'], fita1440:['1440'], trad:['traditional','longbow','barebow'], traditional:['traditional','longbow','barebow'], longbow:['longbow','traditional'], bowhunter:['bowhunters','aba']};
function lev1(a, b){   // edit distance <= 1 (incl. one swap of neighbours)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i >= a.length && i >= b.length) return true;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
}
function parseQuery(q){
  let s = ' ' + snorm(q) + ' ', states = [];
  for (const [k, v] of Object.entries(STATE_ALIASES).sort((a, b) => b[0].length - a[0].length)) if (s.includes(' ' + k + ' ')) { states.push(v); s = s.replace(' ' + k + ' ', ' '); }
  const words = s.trim().split(' ').filter(Boolean);
  return {words, states: [...new Set(states)]};
}
function wordHit(w, H){
  if (QSYN[w]) return QSYN[w].some(v => v.includes(' ') ? H.s.includes(' ' + v + ' ') : wordHit1(v, H)) || wordHit1(w, H);
  return wordHit1(w, H);
}
function wordHit1(w, H){
  if (H.s.includes(' ' + w + ' ')) return true;
  if (w.length >= 3 && H.w.some(h => h.startsWith(w))) return true;
  if (w.length >= 5 && H.w.some(h => h.length >= 4 && lev1(w, h.slice(0, Math.max(w.length, Math.min(h.length, w.length + 1)))))) return true;
  return false;
}
const DISC_Q = {indoor: /indoor|18 ?m\b|vegas/i, field: /field|ifaa|arrowhead/i, target: /target|qre|1440|720|900|matchplay/i, clout: /clout/i, '3d': /\b3d\b|3-d|bowhunt/i};
const discTxt = x => [x.discipline, x.name, x.rounds].filter(Boolean).join(' ');
const NOT_FITA = /field|\b3d\b|clout|ifaa|bowhunt|arrowhead/i;
const matchQ = (x, Q) => (!Q.states.length || Q.states.includes(x.state_code)) && Q.words.every(w =>
  w === 'fita' ? !NOT_FITA.test(discTxt(x)) && wordHit(w, hay(x))
  : DISC_Q[w] && x.discipline ? DISC_Q[w].test(discTxt(x))
  : wordHit(w, hay(x)));
let BF = {day:'', q:'', disc:'', cat:'', ost:'', scope:'all', state:'', club:'', clubId:'', mc:false, past:false, hideClash:false, limit:60};
/* Disciplines listed on an event: 'Field, Target, 3D' -> [Field, Target, 3D]; 'Target (outdoor, 720)' -> [Target]; 'Target / Para' -> [Target, Para]. */
const discsOf = x => [...new Set(String(x.discipline || '').replace(/\([^)]*\)/g, ' ').split(/[,/]/).map(t => t.trim().split(/\s+/)[0]).filter(Boolean))];
function vBrowse(){
  setTitle('Find events');
  const grp = AUS() && BF.scope.startsWith('g:') ? BF.scope.slice(2) : null;
  if (AUS() && grp && !GROUPS.some(g => g[0] === grp)) BF.scope = 'all';
  // A chip always wins over Settings: ABA chip = every ABA event (only the page's own state filter applies).
  // Picking a state on this page overrides 'My states' from Settings.
  const Q = BF.q ? parseQuery(BF.q) : null, qState = !!(Q && Q.states.length);
  // A state named in the search (e.g. 'target sa') also overrides 'My states' from Settings.
  const vis = grp ? EV.filter(x => inGrp(x, grp)) : Q ? EV.slice() : EV.filter(x => visible(x, !!BF.state || qState));   // a typed search looks at every event, whatever Settings hide
  const scopes = AUS() ? [['all','All Australia'], ...GROUPS.map(g => ['g:' + g[0], {aa:'Archery Australia', aba:'ABA', awa:'Archery WA', taa:'TAA'}[g[0]]])] : [['all','All'], ['world','🌐 World'], ...S.countries.map(c => [c, CMAP[c] || c]), ...S.orgs.map(o => [o, (ORGS.find(x => x.id === o) || {}).name?.replace(/\s*\(.*\)/,'') || o])];
  const discs = [...new Set(vis.filter(x => (BF.past || !isPast(x)) && isShoot(x) && !/^(meeting|judging|coaching)/i.test(x.discipline || '')).flatMap(discsOf))].sort();   // only disciplines with events to show
  if (BF.disc && !discs.includes(BF.disc)) discs.push(BF.disc);   // never hide an active filter behind 'All disciplines'
  let list = vis.slice();
  if (BF.scope.startsWith('g:')) list = list.filter(x => inGrp(x, BF.scope.slice(2)));
  else if (BF.scope === 'world') list = list.filter(x => x.world_level);
  else if (BF.scope !== 'all') list = list.filter(x => x.country_code === BF.scope && !x.world_level && !['aba','archery-wa'].includes(x.org_id) || x.org_id === BF.scope);
  if (BF.clubId) list = EV.filter(x => x.club_id === BF.clubId);
  else if (BF.club) list = (BF.state ? EV.filter(x => x.state_code === BF.state) : EV).filter(clubFilter(BF.club));
  else if (BF.state) list = list.filter(x => x.state_code === BF.state);
  const nHiddenClub = (BF.clubId || BF.club || Q) ? 0 : list.filter(x => !clubOk(x, Q) && (BF.past || !isPast(x))).length;
  if (!BF.clubId && !BF.club && !Q) list = list.filter(x => clubOk(x, Q));
  const active = [BF.day && `on ${esc(pd(BF.day).toLocaleDateString(LOC(), {weekday:'short', day:'numeric', month:'short', year:'numeric'}))}`, BF.q && `search “${esc(BF.q)}”`, BF.state && (STATES.find(s => s[0] === BF.state) || [, BF.state])[1], BF.disc && `discipline ${esc(BF.disc)}`, BF.cat && CATS[BF.cat] && CATS[BF.cat][2], BF.ost && OST[BF.ost] && OST[BF.ost][2], BF.club && CLUBF[BF.club], BF.clubId && CLUB[BF.clubId] && `club: ${esc(CLUB[BF.clubId].name)}`, BF.cat === 'club' && BF.mc && 'only my clubs', qState && `state from your search: ${Q.states.join(', ')}${!grp && !BF.state && S.states.length ? ' (overrides your Settings states)' : ''}`, !grp && !BF.state && !qState && S.states.length && AUS() && `your states in Settings (${S.states.join(', ')})`].filter(Boolean);
  // Search results first (owner 30 Oct 2026): on phones, a search or filter puts the count, Clear and matching events above the filter panel.
  // Desktop already shows them at the top beside the filters. Not while typing in the box, so the box doesn't jump.
  const bfOn = !BF.typing && !!(BF.day || BF.q || BF.state || BF.disc || BF.cat || BF.ost || BF.club || BF.clubId || BF.scope !== 'all');
  const actTop = [BF.scope !== 'all' && !BF.club && !BF.clubId && (scopes.find(([k]) => k === BF.scope) || [])[1], ...active.filter(a => !/^your states in Settings/.test(a))].filter(Boolean);
  if (BF.day) list = list.filter(x => datable(x) && x.start_date <= BF.day && evEnd(x) >= BF.day);
  if (BF.disc) list = list.filter(x => discsOf(x).includes(BF.disc));
  const tc = typeCounts(list.filter(x => BF.past || !isPast(x)));
  if (BF.cat) list = list.filter(x => catOf(x) === BF.cat);
  if (BF.cat === 'club' && BF.mc) list = list.filter(x => followed().includes(x.club_id));
  if (BF.ost) list = list.filter(x => x.org_status === BF.ost);
  if (Q) list = list.filter(x => matchQ(x, Q));
  // A search covers every shoot everywhere: overseas events (data/intl.json) join the results unless a state/club/group filter narrows to Australia.
  if (Q && !grp && !BF.state && !qState && !BF.clubId && !BF.club && !BF.scope.startsWith('g:')) {
    if (!INTL) loadIntl().then(() => { if ((location.hash || '').startsWith('#/browse') && BF.q) { const y = scrollY, a = document.activeElement && document.activeElement.id; BF.typing = a === 'q'; render(); BF.typing = false; scrollTo(0, y); const e = a && $('#' + a); if (e && e.setSelectionRange) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } } }).catch(() => {});
    else { const have = new Set(list.map(x => x.id)); let ix = INTL.events.filter(x => !have.has(x.id) && matchQ(x, Q));
      if (BF.day) ix = ix.filter(x => datable(x) && x.start_date <= BF.day && evEnd(x) >= BF.day);
      if (BF.disc) ix = ix.filter(x => discsOf(x).includes(BF.disc));
      if (BF.cat) ix = ix.filter(x => catOf(x) === BF.cat);
      if (BF.ost) ix = ix.filter(x => x.org_status === BF.ost);
      list = list.concat(ix); }
  }
  const myD = myDated(), nClash = myD.length ? list.filter(x => !BF.past && !S.saved[x.id] && !S.entries[x.id] && clashes(x, myD).length).length : 0;
  if (BF.hideClash && myD.length) list = list.filter(x => S.saved[x.id] || S.entries[x.id] || !clashes(x, myD).length);
  let showPastNote = false;
  if (!BF.past) { const up = list.filter(x => !isPast(x)); if (!up.length && Q && list.length) showPastNote = true; else list = up; }
  const sk = x => x.book_anytime ? '9999-99' : x.start_date || '9999';
  list.sort((a, b) => sk(a) < sk(b) ? -1 : 1);
  const total = list.length; list = list.slice(0, BF.limit);
  let html = `${pageHead('Find an event', 'Field, 3D, Target and Indoor events from the calendars you follow.', BF.cat === 'youth' && BF.scope !== 'g:aba' && PH.youth ? 'youth' : BF.cat === 'come_try' && PH.come_try ? 'come_try' : BF.scope === 'g:aba' ? abaKey(BF.disc === '3D' ? '3d' : 'field') : BF.disc === 'Field' && !['g:aa', 'g:awa'].includes(BF.scope) ? 'aba_field' : {Field:'field','3D':'3d',Target:'target',Indoor:'indoor'}[BF.disc] || 'mixed')}<div class="wrap">${clubNotice()}${typeSel(BF.cat, tc)}${BF.cat === 'club' ? clubDrop(BF, x => !isPast(x) || BF.past) : ''}</div><div class="wrap browse${bfOn ? ' res-first' : ''}"><div class="filters"><input type="search" id="q" placeholder="Search event, club, town…" value="${esc(BF.q)}" aria-label="Search events" enterkeyhint="search">
  ${Q ? `<p class="qcount" id="qCount" aria-live="polite">${total ? `<a href="#qres" id="qGo">${total} event${total !== 1 ? 's' : ''} match “${esc(BF.q.trim())}” ↓</a>` : `No events match “${esc(BF.q.trim())}”.`} <a href="#/search?q=${esc(encodeURIComponent(BF.q.trim()))}" class="gs-all">Search every country, club and organisation →</a></p>` : ''}
  <div class="chips" role="group" aria-label="Show">${scopes.map(([k, l]) => `<button class="chip" data-scope="${esc(k)}" aria-pressed="${BF.scope === k && !BF.club}">${k === 'g:aba' ? abaLogo(32, 'chip-logo') : ''}${esc(l)}</button>`).join('')}</div>
  ${AUS() ? `<label for="st" class="sr">State</label><select id="st" aria-label="State"><option value="">All states &amp; territories</option>${STATES.map(([c, n]) => `<option value="${c}" ${BF.state === c ? 'selected' : ''}>${n}</option>`).join('')}</select>` : ''}
  <label for="ost" class="sr">Organisation status</label><select id="ost" aria-label="Organisation status"><option value="">All – any status</option>${Object.entries(OST).map(([k, v]) => `<option value="${k}" ${BF.ost === k ? 'selected' : ''}>${v[0]} ${v[2]}</option>`).join('')}</select>
  <div class="row"><select id="disc" aria-label="Discipline"><option value="">All disciplines</option>${discs.map(d => `<option ${BF.disc === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
  <label style="display:flex;align-items:center;gap:8px;margin:0;flex:0 0 auto"><input type="checkbox" id="past" ${BF.past ? 'checked' : ''} style="width:22px;min-height:22px"> Show finished</label></div>
  ${myD.length ? `<label class="chk hide-clash" style="display:flex;align-items:center;gap:8px;margin:6px 0 0"><input type="checkbox" id="hideClash" ${BF.hideClash ? 'checked' : ''} style="width:22px;min-height:22px"> ⚠️ Hide clashes with my events${BF.hideClash ? '' : ` (${nClash})`}</label>` : ''}
  ${showPastNote ? `<p class="note" id="pastNote">◷ No upcoming events match – showing finished events.</p>` : ''}
  ${BF.clubId && CLUB[BF.clubId] ? `<p class="club-filter"><button type="button" class="chip" id="clubChipX" aria-pressed="true" aria-label="Remove club filter ${esc(CLUB[BF.clubId].name)}">Club: ${esc(CLUB[BF.clubId].name)} ✕</button></p>` : ''}
  ${active.length && total ? `<p class="note" id="activeF">Filtered by: ${active.join(' · ')} <button class="linkbtn" id="clearF2">✕ Clear</button></p>` : ''}
  <p class="note" id="countNote">${total} event${total !== 1 ? 's' : ''}. Change ${AUS() ? 'states &amp; organisations' : 'countries &amp; bodies'} in <a href="#/settings">Settings</a>.${nHiddenClub ? ` <span id="clubOnlyNote">${nHiddenClub} club-only event${nHiddenClub !== 1 ? 's' : ''} (club championships, members only) hidden – add your club in <a href="#/clubs">My clubs</a> to see them.</span>` : ''}</p></div><div class="results" id="qres">${bfOn ? `<p class="note res-top" id="resTop">${total} event${total !== 1 ? 's' : ''}${actTop.length ? ' · ' + actTop.join(' · ') : ''} <button class="linkbtn" id="clearF3">✕ Clear</button></p>` : ''}`;
  let m = '', n = 0;
  for (const x of list) { const k = x.book_anytime ? 'ANY' : x.start_date ? x.start_date.slice(0, 7) : 'TBC'; if (k !== m) { m = k; html += `<div class="month">${k === 'ANY' ? '📞 Book any time' : k === 'TBC' ? 'Dates to be confirmed' : MONL[+k.slice(5) - 1] + ' ' + k.slice(0, 4)}</div>`; } html += evCard(x); if (++n % 10 === 0 && n < list.length) html += adSlot('feed'); }
  if (!total) html += `<div class="empty">No events match${active.length ? ': ' + active.join(' · ') : ''}. ${active.length ? '<button class="btn alt" id="clearF">✕ Clear filters</button>' : `Try another filter${AUS() ? '' : ' or add countries in Settings'}.`}</div>`;
  if (total > BF.limit) html += `<button class="btn alt more" id="more">Show more (${total - BF.limit} left)</button>`;
  return html + '</div></div>';
}
function bindBrowse(){
  const toRes = () => { const r = $('#qres'); if (r) r.scrollIntoView({block: 'start', behavior: 'smooth'}); };
  const qg = $('#qGo'); if (qg) qg.onclick = e => { e.preventDefault(); toRes(); };
  const q = $('#q'); q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(bindBrowse.t); BF.q = q.value; BF.limit = 60; render(); const n = $('#q'); if (n) n.blur(); toRes(); } };
  q.oninput = () => { BF.q = q.value; gcSearch(q.value); BF.limit = 60; clearTimeout(bindBrowse.t); bindBrowse.t = setTimeout(() => { if (!(location.hash || '').startsWith('#/browse')) return; BF.typing = true; render(); BF.typing = false; const n = $('#q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  document.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { BF.scope = b.dataset.scope; BF.club = ''; BF.clubId = ''; BF.disc = ''; BF.limit = 60; render(); });
  document.querySelectorAll('[data-clubf]').forEach(b => b.onclick = () => { BF.club = BF.club === b.dataset.clubf ? '' : b.dataset.clubf; BF.limit = 60; render(); });
  bindClubNotice();
  const clr = () => { Object.assign(BF, {day:'', q:'', disc:'', cat:'', ost:'', state:'', club:'', clubId:'', mc:false, limit:60}); if (S.states.length) { S.states = []; save(); } render(); };
  ['#clearF', '#clearF2'].forEach(s => { const b = $(s); if (b) b.onclick = clr; });
  const c3 = $('#clearF3'); if (c3) c3.onclick = () => { Object.assign(BF, {day:'', q:'', disc:'', cat:'', ost:'', state:'', club:'', clubId:'', mc:false, scope:'all', limit:60}); render(); };
  const cx = $('#clubChipX'); if (cx) cx.onclick = () => { BF.clubId = ''; BF.limit = 60; render(); };
  $('#disc').onchange = e => { BF.disc = e.target.value; render(); };
  document.querySelectorAll('[data-tcat]').forEach(b => b.onclick = () => { BF.cat = b.dataset.tcat; BF.limit = 60; render(); });
  bindClubDrop(BF);
  $('#ost').onchange = e => { BF.ost = e.target.value; BF.limit = 60; render(); };
  const st = $('#st'); if (st) st.onchange = e => { BF.state = e.target.value; BF.limit = 60; render(); };
  $('#past').onchange = e => { BF.past = e.target.checked; render(); };
  const hc = $('#hideClash'); if (hc) hc.onchange = e => { BF.hideClash = e.target.checked; BF.limit = 60; render(); };
  const mo = $('#more'); if (mo) mo.onclick = () => { BF.limit += 60; render(); };
}

function myEntry(x){
  const s = ST(x.id), en = S.entries[x.id] || {};
  return `<div class="myent" id="myEntry"><h2 class="sec">My entry</h2>
    <p class="st-now st-${s}" id="stNow">${ST_TXT[s]}</p>
    ${statusToggles(x, true)}
    ${s === 'none' ? `<p class="note">Entered somewhere else (Assemble, Archers Diary, email)? Tick it here. It's added to My events automatically.</p>` : `
    <form id="entryForm" class="ent-form"><p class="note">Optional details</p>
      <div class="row"><div><label for="f_amt">Amount paid ($)</label><input id="f_amt" inputmode="decimal" placeholder="e.g. 85" value="${esc(en.amount || '')}"></div>
      <div><label for="f_pd">Date paid</label><input type="date" id="f_pd" value="${esc(en.paid_date || '')}"></div></div>
      <label for="f_ref">Receipt / entry number</label><input id="f_ref" value="${esc(en.ref || '')}" placeholder="e.g. Assemble #12345">
      <label for="f_notes">Notes (division, target, camping…)</label><textarea id="f_notes" rows="2">${esc(en.notes || '')}</textarea>
      <button class="btn alt block" type="submit">Save details</button></form>`}</div>`;
}
/* ---------- Results (data/results.json, built by sources/build_results.py) ----------
   Only official published results, each with its source link. "full" = score table we show; "link" = official results page/PDF only. */
let RES = {}, CSHOOT = {};
const resOf = x => x && isPast(x) ? RES[x.id] : null;
function resTables(r, nOpen){
  const med = p => p === '1' ? '🥇' : p === '2' ? '🥈' : p === '3' ? '🥉' : '';
  const hasPl = r.groups.some(g => g.rows.some(w => w.place));
  const sub = w => [w.division, w.round, w.club].filter(Boolean).map(esc).join(' · ');
  return r.groups.map((g, i) => `<details class="res-grp"${i < nOpen ? ' open' : ''}><summary>${esc(g.division)} <span class="res-n">(${g.rows.length})</span></summary><table class="res-tbl"><caption class="sr-only">${esc(g.division)} results</caption><thead><tr>${hasPl ? '<th scope="col">Place</th>' : ''}<th scope="col">Archer</th><th scope="col" class="num">Score</th></tr></thead><tbody>${g.rows.map(w => `<tr>${hasPl ? `<td class="pl">${med(w.place)}${esc(w.place || '')}</td>` : ''}<td><b>${esc(w.name)}</b>${sub(w) ? `<br><small>${sub(w)}</small>` : ''}</td><td class="num">${esc(w.score)}</td></tr>`).join('')}</tbody></table></details>`).join('');
}
function clubShootsHtml(k){
  const L = CSHOOT[k] || []; if (!L.length || k >= iso(today())) return '';
  return `<h3 class="dp-sub">🏆 Club shoot results (${L.length})</h3><p class="note">Published on Archer's Diary. Tap a shoot to see the scores.</p>${L.map(r => `<details class="res-shoot"><summary><b>${esc(r.club_name)}</b><br><small>${esc(r.title)} · ${r.groups.reduce((a, g) => a + g.rows.length, 0)} archers</small></summary>${r.event_id && BYID[r.event_id] ? `<p><a href="#/shoot/${encodeURIComponent(r.event_id)}?r=1">Open the event card ›</a></p>` : ''}<div class="results-box">${resTables(r, 1)}</div><p class="note"><a href="${esc(r.source_url)}" target="_blank" rel="noopener">Source: Archer's Diary ↗</a></p></details>`).join('')}`;
}
/* ---------- Map link → 3D globe overlay ----------
   Venue points come from data/club_coords.json (places by location, then the club). With a point, Map opens the globe in place
   (globe/globe.js + globe.gl + textures + Leaflet load only on that tap; never precached). No point but a real address: the old
   Google Maps link. Placeholder or unreliable locations (TBA, online, "see listing", club names with no address in Australia): no link. */
let GCO = null, GCOP = null, GLP = null;
const MAP_PH = /^\s*(see |tba|tbc|t\.b\.c\.|venue (not|tba|tbc|to be)|host (city|club) (to be confirmed|tba)|host ranges|your home range|various|online|postal|shot at your own|at your own club)|listing/i;   // 884a155's check, plus locations that are only "to be confirmed" or a placeholder (Venue TBA, Host club TBA, your home range): no link at all, never a Google search for the placeholder
const loadCoords = () => GCO ? Promise.resolve(GCO) : (GCOP = GCOP || fetch('data/club_coords.json').then(r => r.json()).then(j => (GCO = j)).catch(() => { GCOP = null; return null; }));
// The club's own ground stands in for an event only when the event's location names that club; otherwise the club point would send the globe
// and Directions to the club's home range while the panel names another venue.
const MAPCLUB_GENERIC = new Set('archers archery club bowmen bowman bowhunters field target association society inc incorporated the and of sports sporting club range park'.split(' '));
const locNamesClub = x => { const cb = CLUB[x.club_id]; if (!cb) return false; const l = ' ' + snorm(x.location) + ' '; return [cb.name, ...(cb.aliases || [])].filter(Boolean).some(n => { const nn = snorm(n); if (nn && l.includes(' ' + nn + ' ')) return true; return nn.split(/\s+/).some(w => w.length >= 4 && !MAPCLUB_GENERIC.has(w) && l.includes(' ' + w + ' ')); }); };
const evPt = x => { if (!GCO || !x || !x.location || MAP_PH.test(x.location) || /to be confirmed/i.test(x.location)) return null; /* venue still to be confirmed: old Google Maps link, no pin */ const c = GCO.places[x.location] || (x.club_id && locNamesClub(x) && GCO.clubs[x.club_id]); return c && isFinite(c.lat) && isFinite(c.lng) ? c : null; };
const mapWhere = x => { const l = (x.location || '').replace(/[,\s]+$/, ''); return (x._intl ? [l, x.us_state && US_ST[x.us_state], x.country_name || x.country] : [l, x.state, 'Australia']).filter(Boolean).filter((v, i, a) => !(i && (a[0] || '').includes(v))).join(', '); };
function mapLinkHtml(x){
  const l = x.location || ''; if (!l || MAP_PH.test(l)) return '';
  const ext = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapWhere(x));
  if (!GCO) { loadCoords().then(fillMapSlot); return ''; }
  const c = evPt(x);   // with a point, every Google Maps link uses its coordinates (a bare place name can land on the wrong spot)
  if (c) return `<br><a href="${esc('https://www.google.com/maps/dir/?api=1&destination=' + c.lat.toFixed(6) + ',' + c.lng.toFixed(6))}" id="mapLink" data-globe="1" aria-haspopup="dialog">📍 Map</a>`;
  return x._intl || /\d|,/.test(l) ? `<br><a href="${esc(ext)}" target="_blank" rel="noopener" id="mapLink">📍 Map ↗</a>` : '';
}
function fillMapSlot(){ const el = document.getElementById('mapSlot'), x = el && BYID[el.dataset.ev]; if (x && GCO) el.innerHTML = mapLinkHtml(x); }
const loadGlobe = () => GLP || (GLP = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'globe/globe.js?v=globe1030d';
  sc.onload = () => window.ACGlobe ? res(window.ACGlobe) : rej(new Error('globe')); sc.onerror = () => { GLP = null; sc.remove(); rej(new Error('globe')); }; document.head.appendChild(sc); }));
function globePins(){   // gold circles: upcoming events (Australia + overseas) with a map point, one per spot (the soonest)
  return loadIntl().catch(() => null).then(() => { const seen = {}, out = [];
    EV.concat(INTL ? INTL.events : []).filter(e => !isPast(e) && !e.cancelled && evPt(e)).sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')).forEach(e => {
      const c = evPt(e), k = c.lat.toFixed(3) + ',' + c.lng.toFixed(3); if (seen[k]) return; seen[k] = 1;
      out.push({id: e.id, name: e.name, place: (e.location || '').split(',')[0].trim(), country: e._intl ? (e.country_name || e.country || '') : 'Australia', date: range(e), lat: c.lat, lng: c.lng, p: c.p}); });
    return out; });
}
function globeBusy(){ return !!((window.ACGlobe && ACGlobe.isOpen()) || document.querySelector('#mapLink[aria-busy]')); }
function openGlobe(x, a){
  const c = evPt(x); if (!c) return;
  const h = location.hash; a.setAttribute('aria-busy', 'true');
  loadGlobe().then(G => {
    a.removeAttribute('aria-busy'); if (location.hash !== h) { if (window.SW_PENDING) { window.SW_PENDING = false; showUpdateBar(); } return; }
    G.open({id: x.id, name: x.name, when: range(x), venue: (x.location || '').split(',')[0].trim() || x.name, where: mapWhere(x), lat: c.lat, lng: c.lng, prec: c.p === 'v' ? 'venue' : 'approx'},
      {pins: globePins(), from: a, onClose: silent => { if (!silent && history.state && history.state.globe) history.back(); if (window.SW_PENDING) { window.SW_PENDING = false; setTimeout(showUpdateBar, 600); } }});
    try { history.pushState({globe: 1}, '', location.href); } catch (e) {}   // the phone's back gesture closes the globe, not the page
  }).catch(() => { a.removeAttribute('aria-busy'); location.assign(a.href); });
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('#mapLink[data-globe]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const el = document.getElementById('mapSlot'), x = el && BYID[el.dataset.ev]; if (!x || !evPt(x)) return;
  e.preventDefault(); openGlobe(x, a);
});
window.addEventListener('popstate', () => { if (window.ACGlobe && ACGlobe.isOpen()) ACGlobe.close(true); });
window.addEventListener('hashchange', () => { if (window.ACGlobe && ACGlobe.isOpen()) ACGlobe.close(true); });

function resultsBox(x){
  if (!x || !isPast(x)) return '';
  const r = RES[x.id];
  if (!r) return `<section class="panel results-box" id="results"><h2 class="sec">🏆 Results</h2><p class="note">We haven't found published results for this event yet. Clubs often post them on Archer's Diary or their own page${x.source_url ? ` – try the <a href="${esc(x.source_url)}" target="_blank" rel="noopener">event source ↗</a>` : ''}.</p></section>`;
  const src = `<a class="btn alt block" href="${esc(r.source_url)}" target="_blank" rel="noopener">↗ ${r.kind === 'full' ? 'Full results on' : 'Open results on'} ${esc(r.source_name)}</a>`;
  if (r.kind !== 'full') return `<section class="panel results-box" id="results"><h2 class="sec">🏆 Results</h2><p>${esc(r.title || 'Official results')} are published by the organiser.</p>${src}</section>`;
  const n = r.groups ? r.groups.reduce((a, g) => a + g.rows.length, 0) : r.n, ng = r.groups ? r.groups.length : r.ng;
return `<section class="panel results-box" id="results"><h2 class="sec">🏆 Results</h2><p class="note">${esc(r.title)} · ${n} archer${n === 1 ? '' : 's'} in ${ng} division${ng === 1 ? '' : 's'}.${r.note ? ' ' + esc(r.note) : ''} Source: <a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.source_name)} ↗</a></p>${r.groups ? resTables(r, 2) : `<div id="resTables" data-id="${esc(x.id)}"><p class="loading">Loading scores…</p></div>`}${src}</section>`;
}
function vShoot(id){
  const x = BYID[id]; if (!x) return vNotFound('event', id);
  setTitle(x.name);
  const on = !!S.saved[id], en = S.entries[id];
  const kind = {how_to_guide:'How to enter (guide)', event_page:'Event page & entry', entry_page:'Register / enter', entry_system:'Enter via Archers Diary (search the event)', wareos:'Enter via World Archery', email:'✉ Email your nomination', nominate_aba_j:'How to nominate (ABA Branch J contacts)'}[x.registration_url_kind] || 'Register / enter';
  const kindLbl = catOf(x) === 'come_try' && x.registration_url ? 'Book a place' : !isShoot(x) && x.registration_url ? 'Register / book' : null;
  const t = theme(x), isMail = x.registration_url_kind === 'email';
  const closedNow = !!x.entry_close_date && daysTo(x.entry_close_date) < 0;
  const regU = /^mailto:[^\s<>"'`]+$/i.test(String(x.registration_url || '').trim()) ? String(x.registration_url).trim() : safeHttp(x.registration_url);   // http(s) or mailto only
  const regBtn = x.info_only && !x.book_anytime ? '' : regU ? `<a class="btn ${closedNow ? 'alt' : 'gold'} block big-btn" id="regBtn" href="${esc(regU)}" ${/^mailto:/i.test(regU) ? '' : 'target="_blank" rel="noopener noreferrer"'}>${isMail ? '' : '↗ '}${kindLbl && !closedNow ? kindLbl : closedNow ? kind.replace(/^Register \/ enter$/, 'Entry page') + ' (entries closed)' : kind}</a>
      ${x.registration_email ? `<p class="note">Opens your email app addressed to <b>${esc(x.registration_email.to)}</b>${x.registration_email.cc ? `, cc ${esc(x.registration_email.cc)}` : ''}, with ${esc(x.registration_email.fields.join(', '))} ready to fill in.</p>` : ''}
      ${x.registration_note ? `<p class="note reg-note">ℹ ${esc(x.registration_note)}</p>` : ''}
      ${x.registration_url_source ? `<p class="note">Entry details from ${esc(x.registration_url_source)}.</p>` : ''}`
      : regOf(x).length ? `<p class="note">✍ See How to register below</p>` : `<div class="warn">⚠ No online entry link found yet. ${x.org_id === 'aba' ? 'ABA events are entered through the host club.' : 'Check the source page below.'}</div>`;
  const closed = !!x.entry_close_date && daysTo(x.entry_close_date) < 0 && !isPast(x) && !x.info_only;
  const closeTxt = x.entry_close_date ? pd(x.entry_close_date).toLocaleDateString(LOC(),{weekday:'short',day:'numeric',month:'long',year:'numeric'}) + (x.entry_close_time ? ', ' + x.entry_close_time : '') : '';
  /* International events (data/intl.json): same page, plus country, venue time zone and a map link; back goes to the country page. */
  const I = !!x._intl, back = I ? iBackHash(x) : '#/browse', AUTZ = {'Australia/Perth': 'Perth time', 'Australia/Darwin': 'Darwin time', 'Australia/Adelaide': 'Adelaide time', 'Australia/Brisbane': 'Brisbane time', 'Australia/Sydney': 'Sydney/Canberra time', 'Australia/Melbourne': 'Melbourne time', 'Australia/Hobart': 'Hobart time'},
    tzTxt = I && x.tz ? TZ_NAME[x.tz] || x.tz : !I && evTz(x) && tzDiff(evTz(x), x.start_date) ? AUTZ[evTz(x)] || '' : '';
  const where = I ? [(x.location || '').replace(/[,\s]+$/, ''), x.us_state && US_ST[x.us_state], x.country_name || x.country].filter(Boolean).filter((v, i, a) => !(i && (a[0] || '').includes(v))).join(', ') : '';
  const mapSlot = `<span id="mapSlot" data-ev="${esc(x.id)}">${mapLinkHtml(x)}</span>`;   // Map link: 3D globe in place when we have the venue point (globe/globe.js, loaded on tap)
  const srcName = x.source_name || (() => { try { return new URL(x.source_url).hostname.replace(/^www\./, ''); } catch { return x.source_url; } })();
  return `<section class="dhero host-hero"><div class="wrap host-row"><div class="host-txt">
    <a class="crumb" href="${back}" id="backLink">← ${I ? esc(back === '#/intl/WORLD' ? 'World' : iName(back.split('/')[2])) + ' events' : 'All events'}</a>
    <div class="tags">${I ? `<span class="tag ctry">${flag(x.iso2)} ${esc(x.country_name || 'International')}</span>` : ''}${catTag(x)}${isShoot(x) ? tagHtml(t) : ''}${x.level ? `<span class="tag lvl">${esc(x.level)}</span>` : ''}</div>
    <h1>${esc(x.name)}</h1><p class="sub">${esc(range(x))}${tzTxt ? ` <small>(local: ${esc(tzTxt)})</small>` : ''}${I ? (where ? ' · ' + esc(where) : '') : x.location ? ' · ' + esc(x.location) : ''}</p>${I ? `<div class="badges">${cdBadge(x, true)}${iStatus(x)}${x.world_level ? '<span class="b world">🌐 World event</span>' : ''}</div>` : badges(x)}
  </div>${(() => { const fig = `<figure class="host-fig">${I ? iMark(x).replace('class="hm ', 'class="hm big ') : hostMark(x, true)}<figcaption>${I ? 'Organised by' : hostOf(x).org ? 'Listed by' : 'Hosted by'}<br><b>${esc(I ? iHost(x).name : hostOf(x).name)}</b></figcaption></figure>`, cid = !I && CLUB[x.club_id] ? x.club_id : '';
    if (!cid) return fig; const n = EV.filter(e => e.club_id === cid && e.id !== x.id && !isPast(e)).length, href = '#/club/' + encodeURIComponent(cid);
    return `<div class="host-col"><a class="host-link" href="${href}" aria-label="More events from ${esc(CLUB[cid].name)}">${fig}</a><a class="btn alt host-more" href="${href}">More from this club${n ? ` (${n})` : ''} →</a></div>`; })()}</div></section>
  <div class="wrap detail">
   <div class="main">
    ${x.date_note ? `<div class="warn date-note" id="dateNote">⚠ <b>Check the dates:</b> ${esc(x.date_note)}</div>` : ''}
    ${clashBox(x)}
    ${x.id === LS.id && lsState() === 'over' ? `<section class="panel" id="replayBox"><h2 class="sec">Finals replay</h2><p class="note">Watch the replay of the finals, streamed from Hobart on Sat 24 Oct 2026.</p><a class="btn gold block" href="${LS.watch}" data-gc="watch-replay/${esc(LS.id)}" data-gc-t="${esc(LS.replay)}" target="_blank" rel="noopener">▶ Watch the replay</a></section>` : ''}
    ${resultsBox(x)}
    ${typeof selfBox === 'function' ? selfBox(x) : ''}
    ${flyerCard(x)}
    ${regSection(x)}
    ${payBox(x)}
    <section class="panel"><h2 class="sec">Event details</h2><dl class="kv">
      <dt>When</dt><dd>${esc(range(x))}${I ? `<br><span class="note">Dates are local to the venue${tzTxt ? ' (' + esc(tzTxt) + ')' : ''}.</span>` : ''}${x.date_note ? '<br><span class="note">⚠ Dates differ between sources – see the note above.</span>' : ''}</dd>
      ${I ? `<dt>Where</dt><dd>${esc(where || 'Venue not published yet')}${mapSlot}</dd>` : `<dt>Where</dt><dd>${esc(x.location || '—')}${x.host ? `<br><span class="note">Host club: ${esc(x.host)}${x.venue_is_host_only ? ' – check the organiser for the exact range' : ''}</span>` : ''}${x.state && !(x.location || '').includes(' ' + x.state) ? ' · ' + esc(x.state) : ''}${x.country ? '<br><span class="note">' + esc(x.country) + '</span>' : ''}${mapSlot}</dd>`}
      ${CLUB[x.club_id] ? `<dt>Club</dt><dd><button type="button" class="linkbtn club-name" data-clubpop="${esc(x.club_id)}" aria-haspopup="dialog">${esc(CLUB[x.club_id].name)}</button>${clubBadge(x) ? ' ' + clubBadge(x) : ''}</dd>` : ''}
      ${(x.intl_clubs || []).filter(id => CLUB[id]).length ? `<dt>Club${x.intl_clubs.length > 1 ? 's' : ''}</dt><dd>${x.intl_clubs.filter(id => CLUB[id]).map(id => `<button type="button" class="linkbtn club-name" data-clubpop="${esc(id)}" aria-haspopup="dialog">${esc(CLUB[id].name)}</button>${followed().includes(id) ? ' <span class="b watching">👁 Watching</span>' : ''}`).join(', ')}</dd>` : ''}
      ${x.coach ? `<dt>Coach</dt><dd>${esc(x.coach)}</dd>` : ''}
      <dt>Type</dt><dd>${CATS[catOf(x)][0]} ${CATS[catOf(x)][1]}${x.class_basis ? ` <span class="note">(${esc(x.class_basis)})</span>` : ''}</dd>
      <dt>Discipline</dt><dd>${esc(x.discipline || '—')}</dd>
      <dt>Level</dt><dd>${esc(x.level || '—')}</dd>
      <dt>Organiser</dt><dd>${!I && isAba(x) ? abaLogo(32, 'org-logo') : ''}${esc(x.org || '—')}${x.aba_branch ? '<br><span class="note">ABA ' + esc(x.aba_branch) + '</span>' : ''}</dd>
      ${x.rounds && x.rounds !== x.name && !x.name.includes(x.rounds) ? `<dt>Rounds</dt><dd>${esc(x.rounds)}${x.field_sources?.rounds ? ` <span class="src">${esc(srcTxt(x.field_sources.rounds))}</span>` : ''}</dd>` : ''}
      ${x.start_times ? `<dt>Times</dt><dd>${esc(x.start_times)}${x.field_sources?.start_times ? ` <span class="src">${esc(srcTxt(x.field_sources.start_times))}</span>` : ''}</dd>` : ''}
      ${x.divisions ? `<dt>Divisions</dt><dd>${esc(x.divisions)}${x.field_sources?.divisions ? ` <span class="src">${esc(srcTxt(x.field_sources.divisions))}</span>` : ''}</dd>` : ''}
      ${x.registration_opens ? `<dt>Entries open</dt><dd>${esc(x.registration_opens)}</dd>` : ''}
      ${closeTxt ? `<dt>Entries close</dt><dd>${esc(closeTxt)}${x.field_sources?.entry_close_date ? ` <span class="src">from ${esc(x.field_sources.entry_close_date)}</span>` : ''}</dd>` : ''}
      ${x.fee ? `<dt>Fee</dt><dd>${esc(x.fee)}${x.field_sources?.fee ? ` <span class="src">from ${esc(x.field_sources.fee)}</span>` : ''}</dd>` : ''}
    </dl>${x.notes ? `<p class="note">${esc(x.notes)}</p>` : ''}</section>
    ${CALS[x.org_group] ? `<p class="note"><a href="#/calendars/${x.org_group}">📅 See it in the full ${esc(CALS[x.org_group].name)} calendar</a></p>` : ''}
    <p class="note" id="srcLine">${I ? 'Official source' : 'Source'}: ${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(srcName)}</a>` : esc(srcName || 'organiser')}${x.source_extra ? ` · <a href="${esc(x.source_extra)}" target="_blank" rel="noopener">host club's event page</a>` : ''}${x.also_listed ? ` · also <a href="${esc(x.also_listed)}" target="_blank" rel="noopener">${/worldarchery/.test(x.also_listed) ? 'World Archery listing' : 'listed here'}</a>` : ''}${x.source_note ? `<br>${esc(x.source_note)}` : ''}${x.branch_source ? `<br>Branch source: <a href="${esc(x.branch_source.url)}" target="_blank" rel="noopener" id="branchSrc">${esc(x.branch_source.name)}</a>` : ''}<br>${x.last_checked ? `Checked ${esc(x.last_checked)}. ` : ''}Always confirm details with the organiser.</p>
    <p class="note fix-link">${isAdmin() ? `<a class="btn gold" href="#/fix/${esc(encodeURIComponent(x.id))}" id="adminEdit">✏️ Edit (admin)</a> ` : ''}<a href="#/fix/${esc(encodeURIComponent(x.id))}" id="fixLink">✏️ Something wrong? Suggest a fix</a></p>
   </div>
   <aside class="side">
    ${isPast(x) || x.cancelled || x.status === 'cancelled' ? '' : timesBox(x)}
    <section class="panel act">${closeTxt && ST(id) === 'none' && daysTo(x.entry_close_date) >= 0 ? `<p class="closes">⏳ Entries close<br><b>${esc(closeTxt)}</b></p>` : ''}
      ${closed ? `<p class="closed-note" id="closedNote">🔒 <b>Entries closed</b><br>${esc(closeTxt)}${x.flyer_extract && /no late/i.test(x.flyer_extract.entry_close_note || '') ? ' · no late entries' : ''}</p>` : ''}
      ${regBtn}
      ${x.info_only ? '' : myEntry(x)}
      ${x.info_only ? '' : `<button class="btn ${on ? 'alt' : ''} block" id="saveBtn" aria-pressed="${on}">${on ? '★ In My events – remove' : '☆ Add to My events'}</button>`}
      ${x.start_date && !x.info_only ? `<button class="btn alt block" id="icsOne">▦ Add to my calendar (.ics)</button>` : ''}</section>
    ${adSlot('side', t)}
    ${I ? '' : clubCta(true)}
   </aside>
  </div>`;
}
function bindShoot(id){
  const rt = $('#resTables'); if (rt) fetch('data/results/' + id.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json').then(r => r.json()).then(j => { RES[id].groups = j.groups; rt.innerHTML = resTables(RES[id], 2); if (/[?&]r=1/.test(location.hash)) { const b = $('#results'); if (b) b.scrollIntoView({block: 'start'}); } }).catch(() => { rt.innerHTML = '<p class="note">Couldn\'t load the scores – use the link below.</p>'; });
  if (/[?&]r=1/.test(location.hash)) setTimeout(() => { const r = $('#results'); if (r) r.scrollIntoView({block: 'start'}); }, 30);
  const sb = $('#saveBtn'); if (sb) sb.onclick = () => toggleSave(id);
  bindToggles($('#view'));
  const f = $('#entryForm'); if (f) {
    const keep = () => { const e = S.entries[id]; if (!e) return;
      const amt = $('#f_amt').value.trim().replace(/^\$/, ''); if (amt && isNaN(parseFloat(amt))) { toast('Amount should be a number, e.g. 85'); return false; }
      Object.assign(e, {amount: amt, paid_date: $('#f_pd').value, ref: $('#f_ref').value.trim(), notes: $('#f_notes').value.trim(), saved: new Date().toISOString()});
      if (amt && e.status === 'entered') { e.status = 'paid'; if (!e.paid_date) e.paid_date = iso(new Date()); }
      save(); return true; };
    f.onchange = () => keep();
    f.onsubmit = e => { e.preventDefault(); if (keep()) { toast('✓ Details saved'); const y = scrollY; render(); scrollTo(0, y); } };
  }
  const ic = $('#icsOne'); if (ic) ic.onclick = () => downloadIcs([BYID[id]], 'shoot');
}

let CM = null, CD = '';
const folIds = x => [x.club_id, ...(x.intl_clubs || [])].filter(Boolean);
function folOnDay(k){
  const fol = followed(); if (!fol.length) return [];
  const pool = EV.concat(typeof INTL !== 'undefined' && INTL ? INTL.events.filter(x => !EV.includes(x) && BYID[x.id] === x) : []);
  return pool.filter(x => datable(x) && !x.cancelled && x.start_date <= k && evEnd(x) >= k && folIds(x).some(id => fol.includes(id)))
    .sort((a, b) => (a.start_times || '') < (b.start_times || '') ? -1 : 1);
}
/* Past day the user had an event: just that shoot, where it was, and its full results with their own row highlighted.
   Matched by the account display name against Archer's Diary "Surname, First" names (results carry no AA numbers). */
const nmKey = n => String(n || '').toLowerCase().replace(/[^a-z, ]/g, '').split(/[ ,]+/).filter(Boolean).sort().join(' ');
function myName(){ try { return AUTH && AUTH.user && AUTH.sync.state().displayName || ''; } catch { return ''; } }
function myDayHtml(x, k){
  const cs = (CSHOOT[k] || []).find(r => r.event_id === x.id), r = RES[x.id] || cs, grp = (cs && cs.groups) || (r && r.groups);
  const id = encodeURIComponent(x.id), me = nmKey(myName());
  const venue = [x.location, x.state && !(x.location || '').includes(x.state) ? x.state : ''].filter(Boolean).join(', ');
  let h = `<div class="my-day"><h3 class="dp-sub">★ <a href="#/shoot/${id}?r=1">${esc(x.name)}</a></h3><p class="meta">📍 ${esc(venue || (CLUB[x.club_id] || {}).name || x.host || '')}</p>`;
  if (r && r.kind !== 'full') return h + `<a class="btn alt block" href="${esc(r.source_url)}" target="_blank" rel="noopener">↗ Results on ${esc(r.source_name)}</a></div>`;
  if (!r) return h + `<p class="note">No published results found for this shoot yet.</p></div>`;
  if (!grp) { fetch('data/results/' + x.id.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json').then(q => q.json()).then(j => { RES[x.id].groups = j.groups; if (CD === k) render(); }).catch(() => {}); return h + '<p class="loading">Loading scores…</p></div>'; }
  let mine = null;
  const hasPl = grp.some(g => g.rows.some(w => w.place));
  const tb = [...grp].sort((a, b) => (me && b.rows.some(w => nmKey(w.name) === me)) - (me && a.rows.some(w => nmKey(w.name) === me))).map(g => { const hit = me && g.rows.some(w => nmKey(w.name) === me);
    return `<details class="res-grp" open><summary>${esc(g.division)} <span class="res-n">(${g.rows.length})</span></summary><table class="res-tbl"><caption class="sr-only">${esc(g.division)} results</caption><thead><tr>${hasPl ? '<th scope="col">Place</th>' : ''}<th scope="col">Archer</th><th scope="col" class="num">Score</th></tr></thead><tbody>${g.rows.map((w, i) => { const m = me && nmKey(w.name) === me; if (m && !mine) mine = {w, g, pos: i + 1, n: g.rows.length};
      return `<tr${m ? ' class="me" aria-current="true"' : ''}>${hasPl ? `<td class="pl">${esc(w.place || '')}</td>` : ''}<td><b>${esc(w.name)}</b>${m ? ' <span class="b myclub">You</span>' : ''}${[w.division, w.round].filter(Boolean).length ? `<br><small>${[w.division, w.round].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</td><td class="num">${esc(w.score)}${w.xs ? `<br><small>${esc(w.xs)} X</small>` : ''}${w.tens ? `<small> ${esc(w.tens)}×10</small>` : ''}</td></tr>`; }).join('')}</tbody></table></details>`; }).join('');
  if (mine) h += `<div class="my-score"><b>Your score: ${esc(mine.w.score)}</b><br><small>${[mine.g.division, mine.w.division, mine.w.place ? 'Place ' + mine.w.place : `${mine.pos} of ${mine.n} in this round`].filter(Boolean).map(esc).join(' · ')}</small></div>`;
  return h + `<div class="results-box">${tb}</div><p class="note">Source: <a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.source_name || "Archer's Diary")} ↗</a></p></div>`;
}
function dayPanel(k, mineDay){
  const d = pd(k), lbl = d.toLocaleDateString(LOC(), {weekday:'long', day:'numeric', month:'long', year:'numeric'}), fol = followed();
  const clubNm = x => (CLUB[x.club_id] || {}).name || folIds(x).map(id => (CLUB[id] || {}).name).filter(Boolean)[0] || x.host || x.org || '';
  const where = x => x.state || (x._intl ? x.country_name || x.country || '' : '');
  const row = x => { const on = !!S.saved[x.id]; return `<li class="dp-row"><div class="dp-main"><a href="#/shoot/${encodeURIComponent(x.id)}${isPast(x) ? '?r=1' : ''}"><b>${esc(x.name)}</b></a>${isPast(x) ? ` <a class="b res-lnk" href="#/shoot/${encodeURIComponent(x.id)}?r=1">🏆 ${resOf(x) ? (resOf(x).kind === 'full' ? 'See scores' : 'Results link') : 'Results'}</a>` : ''}${tmLine(x, k)}<div class="meta">${esc([clubNm(x), (evTimesShort(x, k) ? '' : x.start_times) || (x.end_date && x.end_date !== x.start_date ? range(x) : ''), where(x)].filter(Boolean).join(' · '))}</div>${isPast(x) ? '' : entryBtn(x, 'dp-reg', false)}${S.myClubs.some(id => folIds(x).includes(id)) ? '<span class="b myclub">🏠 My club</span>' : '<span class="b watching">👁 Watching</span>'}${clubOnly(x) ? ' <span class="b members">👥 Members only</span>' : ''}</div>${x.info_only ? '' : `<button class="star dp-star" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} my events" data-star="${esc(x.id)}">${on ? '★' : '☆'}</button>`}</li>`; };
  const fs = folOnDay(k).filter(x => !mineDay.some(y => y.id === x.id));
  const homeSt = (CLUB[S.homeClub] || CLUB[fol[0]] || {}).state || (S.states.length === 1 ? S.states[0] : '');
  const stCode = homeSt && (STATES.find(s => s[0] === homeSt || s[1] === homeSt) || [])[0] || '';
  const find = `<a href="#/browse" class="btn alt block" id="dpFind" data-day="${k}" data-st="${esc(stCode)}">🔎 Find events on this day${stCode ? ' in ' + esc(stCode) : AUS() ? ' in Australia' : ''}</a>`;
  let h = `<section class="panel day-panel" id="dayPanel" aria-live="polite"><div class="dp-head"><h2 class="sec">${esc(lbl)}</h2><button class="linkbtn" id="dpX" aria-label="Close">✕</button></div>`;
  if (k < iso(today()) && mineDay.length) return h + mineDay.map(x => myDayHtml(x, k)).join('') + '</section>';
  if (mineDay.length) h += `<h3 class="dp-sub">★ My events</h3><ul class="dp-list">${mineDay.map(row).join('').replace(/<span class="b (myclub|watching)">[^<]*<\/span>/g, '')}</ul>`;
  const isW = x => folIds(x).some(id => S.watchClubs.includes(id)), fw = fs.filter(isW), fm = fs.filter(x => !isW(x));
  const watchBtn = `<a href="#/clubs" class="btn gold block" id="dpClubs">👁 Add clubs to watch</a>`;
  if (!fol.length) h += `<p class="note">Watch some clubs to see their events on any day here, including members-only club events.</p>${watchBtn}`;
  else {
    if (fw.length) h += `<h3 class="dp-sub">👁 Clubs I watch</h3><ul class="dp-list">${fw.map(row).join('')}</ul>`;
    if (fm.length) h += `<h3 class="dp-sub">🏠 My clubs</h3><ul class="dp-list">${fm.map(row).join('')}</ul>`;
    if (!fs.length) h += `<p class="note">None of the clubs you watch have an event on this day.</p>${find}`;
    if (!S.watchClubs.some(id => CLUB[id])) h += `<p class="note">You're not watching any clubs yet.</p>${watchBtn}`;
  }
  return h + clubShootsHtml(k) + '</section>';
}
let dayMine = {};
function vCalendar(){
  setTitle('My events');
  const mine = Object.keys(S.saved).map(id => BYID[id]).filter(Boolean).sort((a, b) => (a.start_date || '9999') < (b.start_date || '9999') ? -1 : 1);
  if (!CM) { const n = mine.find(x => x.start_date && !isPast(x)); const d = n ? pd(n.start_date) : today(); CM = [d.getFullYear(), d.getMonth()]; }
  const [y, m] = CM, sun = SUN_WEEK.includes(homeCode()), first = new Date(y, m, 1), start = sun ? first.getDay() : (first.getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  for (const x of mine) { if (!x.start_date) continue; for (let d = pd(x.start_date); d <= pd(x.end_date || x.start_date); d.setDate(d.getDate() + 1)) (byDay[iso(d)] = byDay[iso(d)] || []).push(x); }
  let g = (sun ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map(d => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < start; i++) g += `<div class="c o"></div>`;
  for (let d = 1; d <= dim; d++) { const k = iso(new Date(y, m, d)), ev = byDay[k] || [], t = k === iso(today());
    const fd = followed().length ? folOnDay(k).filter(x => !ev.some(y => y.id === x.id)).length : 0;
    const allPaid = ev.length && ev.every(x => ST(x.id) === 'paid'), allEnt = ev.length && ev.every(x => ST(x.id) !== 'none');
    const mk = allPaid ? '✓$' : allEnt ? '✓' : '';
    g += `<div class="c ${ev.length ? 'has' : ''} ${t ? 't' : ''} ${CD === k ? 'sel' : ''}" data-day="${k}" role="button" tabindex="0" aria-label="${d} ${MONL[m]}${ev.length ? ': ' + esc(ev.map(x => x.name + ' – ' + ST_TXT[ST(x.id)].replace(/[☐✓$·]/g, '').replace(/\s+/g, ' ').trim()).join(', ')) : ''}${fd ? ` – ${fd} from your clubs` : ''}">${d}${fd ? '<span class="fdot" aria-hidden="true"></span>' : ''}${mk ? `<span class="mk" aria-hidden="true">${mk}</span>` : ''}${ev.length ? `<span class="dot">${ev.length > 1 ? ev.length + ' events' : '●'}</span>` : ''}</div>`; }
  dayMine = byDay;
  const inMonth = mine.filter(x => x.start_date && (x.start_date.slice(0, 7) === iso(first).slice(0, 7) || (x.end_date || '').slice(0, 7) === iso(first).slice(0, 7)));
  /* Upcoming / in progress first (soonest first); then Completed in the order they finished (venue/state end of last day). */
  const endMs = x => { const e = x.end_date || x.start_date; if (!e) return Infinity; try { return ssMidnight(e, ssTz(x), 1); } catch { return pd(e).getTime() + 864e5; } };
  const done = x => endMs(x) <= Date.now(), byEnd = (a, b) => endMs(a) - endMs(b) || ((a.start_date || '') < (b.start_date || '') ? -1 : 1);
  const split = L => [L.filter(x => !done(x)), L.filter(done).sort(byEnd)];
  const up = mine.filter(x => !done(x)), past = mine.filter(done).sort(byEnd), [mUp, mPast] = split(inMonth);
  return `${pageHead('My events', 'Your saved events, month by month.', 'target')}<div class="wrap narrow"><a class="btn gold block mcc-quick" href="#/cards">🪪 My membership cards${MCD.list.length ? ` (${MCD.list.length})` : ''}</a><div class="calnav"><button id="pm" aria-label="Previous month">‹</button><b>${MONL[m]} ${y}</b><button id="nm" aria-label="Next month">›</button></div>
  <div class="grid">${g}</div>
  ${CD && CD.slice(0, 7) === iso(first).slice(0, 7) ? dayPanel(CD, byDay[CD] || []) : ''}
  ${clashPairsHtml()}
  <div class="legend"><span class="b lg-day">■ event day</span><span class="b lg-day">✓ entered</span><span class="b lg-day">✓$ entered + paid</span><span class="b lg-today">□ today</span>${followed().length ? '<span class="b lg-day"><span class="fdot lg" aria-hidden="true"></span> your clubs</span>' : ''}</div><p class="note">Tap any day to see events from your clubs. Tap a finished day to see the results.</p>
  ${inMonth.length ? `<h2>In ${MONL[m]}</h2>${mUp.map(evCard).join('')}${mPast.length ? `<h3 class="dp-sub">Completed (${mPast.length})</h3>${mPast.map(evCard).join('')}` : ''}` : ''}
  <h2>All my upcoming events (${up.length})</h2>
  ${up.length ? up.map(evCard).join('') : `<div class="empty">Nothing saved yet. Tap ☆ on events in <a href="#/browse">Browse</a>.</div>`}
  ${up.length ? `<button class="btn block" id="icsAll">▦ Export all to phone calendar (.ics)</button>` : ''}
  ${past.length ? `<h2>Completed (${past.length})</h2>${past.map(evCard).join('')}` : ''}</div>`;
}
function bindCalendar(){
  document.querySelectorAll('.grid [data-day]').forEach(c => { c.onclick = () => { const k = c.dataset.day; if (k < iso(today()) && !(CSHOOT[k] || []).length) { const evs = [...(dayMine[k] || []), ...(followed().length ? folOnDay(k) : [])].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i); if (evs.length === 1) { location.hash = '#/shoot/' + encodeURIComponent(evs[0].id) + '?r=1'; return; } } CD = CD === k ? '' : k; render(); const p = $('#dayPanel'); if (p) p.scrollIntoView({block: 'nearest', behavior: 'smooth'}); };
    c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } }; });
  const dx = $('#dpX'); if (dx) dx.onclick = () => { CD = ''; render(); };
  const df = $('#dpFind'); if (df) df.onclick = () => { Object.assign(BF, {day: df.dataset.day, state: df.dataset.st || '', q: '', disc: '', cat: '', ost: '', club: '', clubId: '', mc: false, scope: 'all', past: false, limit: 60}); };
  $('#pm').onclick = () => { CM = CM[1] ? [CM[0], CM[1] - 1] : [CM[0] - 1, 11]; render(); };
  $('#nm').onclick = () => { CM = CM[1] < 11 ? [CM[0], CM[1] + 1] : [CM[0] + 1, 0]; render(); };
  const a = $('#icsAll'); if (a) a.onclick = () => downloadIcs(Object.keys(S.saved).map(i => BYID[i]).filter(x => x && x.start_date && !isPast(x)), 'my-archery-shoots');
}

function vEntries(){
  setTitle('Entries & payments');
  const ids = Object.keys(S.saved).filter(id => BYID[id] && !BYID[id].info_only);
  const by = st => ids.filter(id => ST(id) === st).map(id => BYID[id]);
  const paid = by('paid'), ent = by('entered').filter(x => !isPast(x)), todo = by('none').filter(x => !isPast(x));
  const tot = {}; paid.forEach(x => { const e = S.entries[x.id]; const v = parseFloat(e.amount); if (!isNaN(v)) tot[e.currency || 'AUD'] = (tot[e.currency || 'AUD'] || 0) + v; });
  const byDate = (a, b) => (a.entry_close_date || a.start_date || '9') < (b.entry_close_date || b.start_date || '9') ? -1 : 1;
  return `${pageHead('Entries &amp; payments', 'What you have entered, paid and still need to enter.', 'field')}<div class="wrap narrow"><div class="panel dark"><div class="kicker">Total entry fees recorded</div><div class="big">${Object.keys(tot).length ? Object.entries(tot).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(' + ') : '—'}</div></div>
  ${clashPairsHtml()}
  <h2>☐ Still to enter (${todo.length})</h2>${todo.length ? todo.sort(byDate).map(evCard).join('') : '<p class="note">Nothing waiting. 👍</p>'}
  <h2>$ Entered – still to pay (${ent.length})</h2>${ent.length ? ent.sort(byDate).map(evCard).join('') : '<p class="note">Nothing to pay.</p>'}
  <h2>✓$ Entered + paid (${paid.length})</h2>${paid.length ? paid.map(x => { const e = S.entries[x.id]; return evCard(x).replace('</h3>', `</h3><div class="badges"><span class="b paid">$ Paid${e.amount ? ' ' + esc(e.currency || 'AUD') + ' ' + esc(e.amount) : ''}${e.paid_date ? ' · ' + esc(pd(e.paid_date).toLocaleDateString(LOC(), {day:'numeric', month:'short'})) : ''}</span>${e.ref ? `<span class="b world"># ${esc(e.ref)}</span>` : ''}</div>`); }).join('') : '<p class="note">Tick “I’ve entered” and “I’ve paid” on any event to track it here.</p>'}</div>`;
}

function vSettings(){
  setTitle('Settings');
  const countries = Object.entries(CMAP).sort((a, b) => a[1].localeCompare(b[1]));
  const counts = {}; EV.forEach(x => { if (x.country_code && !x.world_level) counts[x.country_code] = (counts[x.country_code] || 0) + 1; });
  const bodies = ORGS.filter(o => !o.id.startsWith('wa-') && !['world-archery','archery-australia'].includes(o.id) || o.id === 'archery-australia');
  const perm = !('Notification' in window) ? 'not supported on this browser' : Notification.permission;
  const cnt = f => EV.filter(f).length;
  const ausHtml = `<h2>States &amp; territories</h2><p class="note">Pick the states you shoot in. Leave all unticked to see the whole of Australia. National events always show.</p>
  <div class="list-check">${STATES.map(([c, n]) => `<label><input type="checkbox" data-s="${c}" ${S.states.includes(c) ? 'checked' : ''}> <span style="flex:1">${n} (${c})</span><span class="note">${cnt(x => x.state_code === c)} events</span></label>`).join('')}</div>
  <h2>Organisations</h2><div class="list-check">${GROUPS.map(([g, n, d]) => `<label><input type="checkbox" data-g="${g}" ${S.groups.includes(g) ? 'checked' : ''}> <span style="flex:1"><b>${n}</b><br><span class="note">${d}</span></span><span class="note">${cnt(x => x.org_group === g)} events</span></label>`).join('')}</div>`;
  return `${pageHead('Settings', 'Choose your clubs, calendars and reminders.', 'indoor')}<div class="wrap narrow">${clubSettings()}${AUS() ? ausHtml : `<h2>Countries</h2><p class="note">Shows each country's national calendar. Pick as many as you like.</p>
  <input type="search" id="cq" placeholder="Find a country…" aria-label="Find a country">
  <div class="list-check" id="clist">${countries.map(([c, n]) => `<label data-n="${esc(n.toLowerCase())}"><input type="checkbox" data-c="${c}" ${S.countries.includes(c) ? 'checked' : ''}> <span style="flex:1">${esc(n)}</span><span class="note">${counts[c] ? counts[c] + (counts[c] === 1 ? ' event' : ' events') : 'no calendar yet'}</span></label>`).join('')}</div>
  <h2>Organisations &amp; series</h2>
  <div class="list-check">${bodies.map(o => `<label><input type="checkbox" data-o="${o.id}" ${S.orgs.includes(o.id) ? 'checked' : ''}> <span style="flex:1">${esc(o.name)}</span></label>`).join('')}
    <label><input type="checkbox" id="world" ${S.world ? 'checked' : ''}> <span style="flex:1"><b>🌐 World &amp; major events</b><br><span class="note">World Cup, Worlds, Indoor World Series, Vegas, Lancaster, TAC, ASA, Masters, Olympics</span></span></label></div>`}
  <h2>Reminders</h2>
  <label for="rd">Remind me this many days before an event</label><input id="rd" value="${esc(S.remindDays.join(', '))}">
  <label for="cd">…and before entries close (if not entered)</label><input id="cd" value="${esc(S.closeDays.join(', '))}">
  <p class="note">Phone notifications: <b>${esc(perm)}</b>. On iPhone, first tap Share → “Add to Home Screen”, then open from the icon (needs iOS 16.4+).</p>
  <button class="btn block" id="notif">🔔 ${S.notify && perm === 'granted' ? 'Notifications on – send a test' : 'Turn on notifications'}</button>
  ${S.notify ? `<button class="btn alt block" id="notifOff">🔕 Turn notifications off</button>` : ''}
  <h2>Backup</h2><p class="note">${AUTH.on && AUTH.user && AUTH.sync && AUTH.sync.linked() ? 'Your events and entries are saved on this device and synced to your <a href="#/account">account</a>.' : 'Your events and entries are stored only on this device.'}${AUTH.on && !AUTH.user ? ' <a href="#/account">Sign in</a> to keep them on all your devices.' : ''}</p>
  <div class="row"><button class="btn alt" id="exp">⇩ Export backup</button><label class="btn alt" style="margin:0">⇧ Import<input type="file" id="imp" accept="application/json" hidden></label></div>
  <p class="note">Data: ${EV.length} events from ${ORGS.length} organisations. Sources: ${AUS() ? 'World Archery calendar (Australian events),' : 'World Archery calendar,'} ABA 2026 National Calendar, Archery Australia, Archery WA, organiser sites. Checked 9 Oct 2026.</p></div>`;
}
function bindSettings(){
  bindClubPicker();
  document.querySelectorAll('[data-s]').forEach(c => c.onchange = () => { S.states = c.checked ? [...new Set([...S.states, c.dataset.s])] : S.states.filter(x => x !== c.dataset.s); BF.state = ''; save(); toast('Saved'); });
  document.querySelectorAll('[data-g]').forEach(c => c.onchange = () => { S.groups = c.checked ? [...new Set([...S.groups, c.dataset.g])] : S.groups.filter(x => x !== c.dataset.g); BF.scope = 'all'; save(); toast('Saved'); });
  if (!$('#cq')) { bindCommon(); return; }
  $('#cq').oninput = e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#clist label').forEach(l => l.hidden = q && !l.dataset.n.includes(q)); };
  document.querySelectorAll('[data-c]').forEach(c => c.onchange = () => { S.countries = c.checked ? [...new Set([...S.countries, c.dataset.c])] : S.countries.filter(x => x !== c.dataset.c); save(); toast('Saved'); });
  document.querySelectorAll('[data-o]').forEach(c => c.onchange = () => { S.orgs = c.checked ? [...new Set([...S.orgs, c.dataset.o])] : S.orgs.filter(x => x !== c.dataset.o); save(); toast('Saved'); });
  $('#world').onchange = e => { S.world = e.target.checked; save(); toast('Saved'); };
  bindCommon();
}
function bindCommon(){
  const nums = v => v.split(/[ ,]+/).map(Number).filter(n => n >= 0 && n < 366).sort((a, b) => b - a);
  $('#rd').onchange = e => { S.remindDays = nums(e.target.value); save(); toast('Saved'); };
  $('#cd').onchange = e => { S.closeDays = nums(e.target.value); save(); toast('Saved'); };
  $('#notif').onclick = async () => {
    if (!('Notification' in window)) return toast('This browser can’t show notifications');
    const p = await Notification.requestPermission(); S.notify = p === 'granted'; save();
    if (S.notify) { const reg = await navigator.serviceWorker?.getRegistration(); const o = {body:'Reminders are on. You’ll hear from us before your events.', icon:'icons/icon-192.png'};
      reg ? reg.showNotification('🎯 Archery Calendar', o) : new Notification('🎯 Archery Calendar', o); S.notified = {}; checkReminders(); }
    render();
  };
  const off = $('#notifOff'); if (off) off.onclick = () => { S.notify = false; save(); toast('Notifications off'); render(); };
  $('#exp').onclick = () => dl(new Blob([JSON.stringify(S, null, 1)], {type:'application/json'}), 'archery-calendar-backup.json');
  $('#imp').onchange = async e => { try { S = Object.assign({}, DEFAULT, JSON.parse(await e.target.files[0].text())); save(); toast('Backup restored'); render(); } catch { toast('That file isn’t a valid backup'); } };
}

/* ---------- advertise & credits ---------- */
const CONTACT = 'nfshold@gmail.com';
const AD_MAIL = 'mailto:' + CONTACT + '?subject=Advertising%20on%20Archery%20Calendar';
function vAdvertise(){
  setTitle('Advertise with us');
  const n = photo('advertise');
  return `<section class="phead tall" style="--img:url('${esc(n.file)}')"><div class="wrap"><p class="kicker">For archery shops, ranges, coaches &amp; brands</p><h1>Advertise to archers</h1>
    <p>Put your shop in front of archers while they plan their next event and the gear they need for it.</p><a class="btn gold" href="${AD_MAIL}">Email us about advertising</a></div></section>
  <div class="wrap narrow adv">
    <section class="panel"><h2 class="sec">Who sees your ad</h2>
      <ul class="ticks"><li>Archers looking for Field, 3D, Target and Indoor events. Australia-wide: Archery Australia, ABA and Archery WA events in every state and territory.</li>
      <li>People about to travel, enter and buy. They're checking dates, entry closing times and what to bring.</li>
      <li>Ads can match the discipline: 3D gear on 3D events, indoor gear on indoor events.</li></ul>
      <p class="note">We'll share visitor numbers once the site is live. We won't quote figures before we have them.</p></section>
    <section class="panel"><h2 class="sec">Ad spaces</h2>
      <div class="table-wrap"><table class="slots"><thead><tr><th>Space</th><th>Where</th><th>Size</th></tr></thead><tbody>
      <tr><td><b>Home banner</b></td><td>Home page, under the stats</td><td>970×250 desktop<br>320×100 mobile</td></tr>
      <tr><td><b>Featured retailer</b></td><td>Find events list, every 10 events</td><td>Native card: logo, 2 lines, link</td></tr>
      <tr><td><b>Event page sponsor</b></td><td>Beside each event, by discipline ("Gear up for 3D")</td><td>300×250 or logo + text</td></tr>
      <tr><td><b>Discipline sponsor</b> <span class="note">(later)</span></td><td>Every Field, 3D, Target or Indoor page</td><td>All slots in one discipline</td></tr>
      </tbody></table></div></section>
    <section class="panel"><h2 class="sec">How it works</h2>
      <ul class="ticks"><li>Arranged directly with archery businesses. Email us to talk it through.</li>
      <li>Every ad is clearly labelled "Sponsored". Archery-related businesses only.</li>
      <li>No cookies or ad trackers (visits are counted anonymously). Ads link straight to your website.</li></ul></section>
    <section class="panel dark"><h2 class="sec">Get in touch</h2><p class="big-mail"><a href="${AD_MAIL}">${CONTACT}</a></p>
      <p class="foot-tag"><i>Created by an archer, for archers.</i></p>
      <nav class="foot-social" aria-label="Follow us"><p class="foot-social-label">Follow us</p><div class="foot-social-row"><a class="foot-social-link" href="https://www.facebook.com/profile.php?id=61595338617579" target="_blank" rel="noopener" aria-label="Archery Calendar on Facebook"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M22 12.07A10 10 0 1 0 10.4 21.9v-6.94H7.9v-2.9h2.5V9.8c0-2.47 1.47-3.84 3.72-3.84 1.08 0 2.2.2 2.2.2v2.42h-1.24c-1.22 0-1.6.76-1.6 1.54v1.85h2.72l-.43 2.9h-2.29v6.94A10 10 0 0 0 22 12.07z"/></svg><span>Facebook</span></a><a class="foot-social-link" href="https://www.instagram.com/archerycalendar/" target="_blank" rel="noopener" aria-label="Archery Calendar on Instagram"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9zm9.75 1.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 .002 6.002A3 3 0 0 0 12 9z"/></svg><span>Instagram</span></a></div></nav>
      <p class="note">NFS Strategic Holdings</p></section>
  </div>`;
}
function vPrivacy(){
  setTitle('Privacy & disclaimer');
  return `${pageHead('Privacy &amp; disclaimer', 'Short version: your data stays in your browser.', 'mixed')}<div class="wrap narrow"><section class="panel"><h2 class="sec">Privacy</h2>
    <ul class="ticks"><li>Your country: the first time you open the home page, your browser asks Cloudflare's public trace page (cloudflare.com/cdn-cgi/trace) which country your connection is in, so we can show your country's home page. We keep only the country code, in this browser for this visit. Pick a country in the header and that choice is used instead (and saved with your settings if you sign in).</li><li>${AUTH.on ? 'You only need an account to submit or fix an event. If you don’t sign in, the' : 'No account, no sign-up. The'} events you save, your entries and payments, your reminder settings and your remembered club details (Submit an event) are stored only in <b>your browser on this device</b> (localStorage). They are never sent to us.</li>
    <li><b>Near me:</b> if you tap “Find clubs near me”, your browser asks your permission and gives your location to this page only. The distances are worked out on your phone. Your location is not sent to us or anyone else, and it is not saved: it is forgotten when you close or reload the page. If you type a suburb or postcode instead, it is looked up in a list that loads into your browser, so it is not sent anywhere either. We only keep your choice of km or miles on this device.</li>
    <li>Club details you send with an event are remembered on this device${AUTH.on ? ' (and in your account if you are signed in)' : ''} so you don't retype them. Tap “Not you? Clear” on the Submit form to wipe them.</li>
    <li>Clearing your browser data deletes them. Use <a href="#/settings">Settings → Export backup</a> to keep a copy or move to another device.</li>
    <li id="privStats"><b>Visit counts:</b> we count visits anonymously with <a href="https://www.goatcounter.com/" target="_blank" rel="noopener">GoatCounter</a>: which pages are viewed and the words typed into Find events search. <b>No cookies</b>, no advertising trackers and nothing that identifies you. Searches that look like an email address or phone number are never counted. Reminders are made on your device.</li>
    <li>"Register / enter" and email links go straight to the organiser. Anything you send them is between you and the organiser.</li>
    <li><b>Submit an event form:</b> what a club sends us (contact name, email, phone, event details and flyer, plus the email and ID of the signed-in account that sent it) is emailed to us at ${esc(SITE.contact)} via the form service FormSubmit (formsubmit.co). When you’re signed in, the event, flyer and your details are also saved to your account on Supabase so we can review and publish it; only the event details and flyer are shown publicly once it’s live. We use it only to check and list the event. Contact details aren't published unless they're on your flyer. Ask us any time to correct or delete them.</li>
    <li><b>Send us your calendar:</b> when you send a calendar (a file, photo, link or pasted text), it is saved privately to your account on Supabase, not emailed. Only we can open it, and only to put your events on the calendar. We email ourselves a short note with a link and a count, never the contents. We publish event details only (name, date, place, club and entry link), never personal contact details or the names of anyone under 16. Your files are deleted once your events are published or turned down, and in any case after 30 days. The email address you are signed in with is kept with the upload so we can tell you when your events are live.</li>
    <li><b>Marketing emails:</b> when you sign up, there is an optional tick box to agree to marketing emails. It is never ticked for you. If you tick it, we record that you agreed, and when, with your account. You can unsubscribe at any time.</li>
    <li><b>Fans photos:</b> if you send us a photo, your name, email, the photo and its details are emailed to us via FormSubmit. We publish only approved photos with the caption and your name as credit – never your email. In a photo and want it removed? Email ${esc(SITE.contact)}.</li>
    <li><b>Membership cards:</b> photos of your membership cards, card names, member numbers and links you add in <a href="#/cards">My membership cards</a> are stored only in this browser on this device. They’re never uploaded, published or sent to us${window.SUPABASE_CARD_SYNC ? ', unless you turn on the private backup to your account (private storage only you can open)' : ''}. Photos are shrunk and saved without their hidden location data. Delete them any time on that page.</li>
    <li>The site is hosted on GitHub Pages, which keeps standard server logs (e.g. IP address) – see GitHub's privacy statement.</li></ul>
    <p class="note">Questions: <a href="mailto:${SITE.contact}">${SITE.contact}</a> (NFS Strategic Holdings).</p></section>
    ${AUTH.on ? `<section class="panel" id="privAcct"><h2 class="sec">If you create an account (optional)</h2><ul class="ticks">
    <li><b>What we store:</b> your email address; a display name if you add one; the events you save; your entry status (entered / paid), amount paid, payment date, receipt or entry number and notes; which reminders have been sent; and your Settings (states, organisations, reminder days). Sign-in with Google also gives us your name from Google. We never see or store passwords.</li>
    <li><b>Where:</b> Supabase (supabase.com), our database and sign-in provider, in its <b>Sydney, Australia</b> region (AWS ap-southeast-2). Sign-in emails are sent through Supabase. Supabase keeps standard security logs (e.g. IP address, sign-in times).</li>
    <li><b>Who can see it:</b> only you. Every row is locked to your account by the database (row-level security). We don’t sell it, share it or use it for advertising.</li>
    <li><b>Deleting it:</b> <a href="#/account">Account → Delete account and data</a> removes your account and everything in it straight away. Signing out keeps a copy on your device unless you choose “remove from this device”. Or email us and we’ll delete it.</li></ul></section>` : ''}
    <section class="panel"><h2 class="sec">Disclaimer</h2><p><b>Dates come from organisers' public calendars; always check with the organiser.</b></p>
    <p class="note">Event details are collected from Archery Australia, Archery WA, the ABA, World Archery and club websites and flyers, and can change at any time. Archery Calendar is independent and is not run by or affiliated with any of these organisations. Flyers belong to their organisers – we link to them at the source.</p></section></div>`;
}
function vCredits(){
  setTitle('Credits');
  return `${pageHead('Photo &amp; font credits', 'Thanks to the photographers who share their work under open licences, and to the clubs and archery associations named below, whose photos are used with credit.', 'mixed')}<div class="wrap narrow"><section class="panel"><ul class="credits">${Object.entries(PH).filter(([k], i, all) => PH[k].file && all.findIndex(([, q]) => q.file === PH[k].file) === i).map(([k, p]) => `<li><img src="${esc(p.sm)}" alt="" loading="lazy"><div><b>${esc(p.title)}</b><br>${esc([p.by, p.source].filter(Boolean).join(' · '))}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">source</a>` : ''}${p.license ? `<br>${p.license_url ? `<a href="${esc(p.license_url)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license)}. Resized for this site.` : ''}</div></li>`).join('')}</ul>
  <p class="note">Near me: club and event locations are placed using OpenStreetMap data (© OpenStreetMap contributors, <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">ODbL</a>, via Nominatim). Suburb, town and postcode lists are from <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0).</p>
  <p class="note">Fonts: Inter and Barlow Condensed, SIL Open Font License 1.1, self-hosted. Event flyers belong to their organisers${SITE.flyers === 'local' ? ' and are shown for private testing only' : ' – we link to them at the source and do not host copies'}.</p></section></div>`;
}

/* ---------- .ics export ---------- */
function icsEsc(s){ return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
// RFC 5545: lines max 75 OCTETS (UTF-8), continuation lines start with a space; never split a character.
function fold(l){ const enc = new TextEncoder(), out = []; let cur = '', n = 0, lim = 75;
  for (const ch of l) { const b = enc.encode(ch).length; if (n + b > lim) { out.push(cur); cur = ''; n = 0; lim = 74; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n '); }
const SITE_URL = () => (SITE.url || location.origin + location.pathname).replace(/[^/]*$/, '');   // https://archerycalendars.com/
function downloadIcs(list, name){
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Archery Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:My archery events'];
  for (const x of list) {
    const e = S.entries[x.id], end = pd(x.end_date || x.start_date); end.setDate(end.getDate() + 1);
    const st = ST(x.id), desc = [st === 'paid' ? `ENTERED + PAID${e.amount ? ' ' + (e.currency || 'AUD') + ' ' + e.amount : ''}${e.ref ? ' (#' + e.ref + ')' : ''}` : st === 'entered' ? 'ENTERED – NOT PAID YET' : 'NOT ENTERED YET', x.discipline, x.registration_url ? 'Entry: ' + x.registration_url : '', 'Source: ' + x.source_url, 'Archery Calendar: ' + SITE_URL() + '#/shoot/' + encodeURIComponent(x.id)].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:${x.id}@archery-calendar`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${x.start_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${iso(end).replace(/-/g, '')}`,
      fold(`SUMMARY:${icsEsc((st === 'paid' ? '✓$ ' : st === 'entered' ? '✓ ' : '') + x.name)}`), fold(`LOCATION:${icsEsc([x.location, x.country].filter(Boolean).join(', '))}`), fold(`DESCRIPTION:${icsEsc(desc)}`));
    if (x.registration_url || x.source_url) L.push(fold(`URL:${x.registration_url || x.source_url}`));
    for (const d of S.remindDays) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc(x.name)}`), `TRIGGER:-P${d}D`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  dl(new Blob([L.join('\r\n')], {type:'text/calendar'}), name + '.ics'); toast('Calendar file downloaded – open it to add');
}
function dl(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------- org calendars (rebuilt from our data) ---------- */
const CALS = {aba:{name:'ABA', full:'Australian Bowhunters Association', src:'ABA 2026 National Calendar (12 Jun 2026)', url:'https://www.bowhunters.org.au/aba-shoot-calendar/', by:'Branch'},
  aa:{name:'Archery Australia', full:'Archery Australia (national, state and club events)', src:'Archery Australia events + World Archery calendar (Australian events)', url:'https://www.archery.org.au/events/', by:'State'},
  awa:{name:'Archery WA', full:'Archery WA (state events, QREs and club events)', src:'Archery WA events', url:'https://www.archerywa.com.au/', by:'State'},
  taa:{name:'TAA', full:'Traditional Archery Australia (musters and club events)', src:'TAA Club Events Calendar 2026 + club event calendars', url:'https://www.traditionalarcheryaustralia.org/club-shoot-calendars', by:'State'}};
let CF = {org:'aba', where:'', disc:'', cat:'', club:'', mc:false, past:true};
const calWhere = x => x.org_group === 'aba' ? (x.branch ? `${x.branch} – ${x.branch_name || ''}` : (x.state_code || '')) : (x.state_code || '');
function vCals(arg){
  if (arg === 'aba-j') { CF.org = 'aba'; CF.where = 'J – WA'; CF.disc = ''; }
  else if (CALS[arg]) { if (CF.org !== arg) { CF.where = ''; CF.disc = ''; } CF.org = arg; }
  const c = CALS[CF.org]; setTitle(c.name + ' calendar');
  const all = EV.filter(x => inGrp(x, CF.org) && x.start_date && x.start_date >= '2026-01-01').sort((a, b) => a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.name < b.name ? -1 : 1);
  const years = [...new Set(all.map(x => x.start_date.slice(0, 4)))];
  const wheres = [...new Set(all.map(calWhere).filter(Boolean))].sort();
  const discs = [...new Set(all.filter(x => isShoot(x) && !/^(meeting|judging|coaching)/i.test(x.discipline || '')).flatMap(discsOf))].sort();
  if (CF.where && !wheres.includes(CF.where)) CF.where = ''; if (CF.disc && !discs.includes(CF.disc)) CF.disc = '';
  let list = all.filter(x => (!CF.where || calWhere(x) === CF.where) && (!CF.disc || discsOf(x).includes(CF.disc)) && (CF.past || !isPast(x)));
  if (CF.club) list = list.filter(clubFilter(CF.club));
  else list = list.filter(x => clubOk(x));
  const tc = typeCounts(list); if (CF.cat) list = list.filter(x => catOf(x) === CF.cat);
  if (CF.cat === 'club' && CF.mc) list = list.filter(x => followed().includes(x.club_id));
  const nPast = list.filter(isPast).length;
  let html = `${pageHead('Calendars', 'Each organisation’s full calendar, in one place. Tap an event for details, entry and reminders.', CF.org === 'aba' ? 'aba_field' : CF.cat === 'youth' && PH.youth ? 'youth' : CF.cat === 'come_try' && PH.come_try ? 'come_try' : 'mixed')}<div class="wrap cals">
  <div class="tabs" role="tablist" aria-label="Organisation">${Object.entries(CALS).map(([k, o]) => `<a role="tab" class="tab" href="#/calendars/${k}" aria-selected="${k === CF.org}">${k === 'aba' ? abaLogo(32, 'chip-logo') : ''}${esc(o.name)}</a>`).join('')}</div>
  <div class="panel cal-head"><h2 class="sec${CF.org === 'aba' ? ' with-logo' : ''}">${CF.org === 'aba' ? abaLogo(64, 'head-logo') : ''}<span>${esc(c.full)} – ${years.join(' & ') || '2026'}</span></h2>
  ${typeSel(CF.cat, tc)}${CF.cat === 'club' ? clubDrop(CF, x => inGrp(x, CF.org) && (CF.past || !isPast(x))) : ''}
  ${CF.org === 'aba' ? `<div class="chips" role="group" aria-label="Branch"><a class="chip" href="#/calendars/aba" id="brAll" aria-pressed="${!CF.where}">All branches</a><a class="chip" href="#/calendars/aba-j" id="brJ" aria-pressed="${CF.where === 'J – WA'}">Branch J (WA)</a></div>` : ''}
  ${CF.org === 'aba' && CF.where === 'J – WA' ? `<div class="branch-src" id="branchJ"><a class="bs-img" href="sources/aba-j-2026-branch-calendar.jpg" target="_blank" rel="noopener" aria-label="Open the Branch J calendar full size"><img src="sources/aba-j-2026-branch-calendar-sm.jpg" alt="ABA Branch J (WA) Event Calendar 2026" width="110" loading="lazy"></a>
    <div><b>ABA Branch J (WA) Event Calendar 2026</b><p class="note">The branch source for WA ABA events (supported by the WA Government and Lotterywest).<br><b>Interclub times:</b> Sat sign-in 10:00–11:00, muster 11:45, start 12:00 · Sun sign-in 8:00–9:00, muster 9:45, start 10:00.</p>
    <a href="sources/aba-j-2026-branch-calendar.jpg" target="_blank" rel="noopener">📄 View the Branch J calendar ↗</a></div></div>` : ''}
  <div class="cal-filters"><label>${c.by}<select id="cw"><option value="">All ${c.by === 'Branch' ? 'branches' : 'states'}</option>${wheres.map(w => `<option ${CF.where === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label>
  <label>Discipline<select id="cd"><option value="">All disciplines</option>${discs.map(d => `<option ${CF.disc === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
  <label class="chk"><input type="checkbox" id="cp" ${CF.past ? 'checked' : ''}> Show finished</label></div>
  <p class="note">${list.length} event${list.length !== 1 ? 's' : ''}${CF.past && nPast ? ` (${nPast} finished, shown greyed out)` : ''}. Official source: <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.src)} ↗</a></p></div>
  <div class="cal-list" role="table" aria-label="${esc(c.name)} calendar"><div class="cal-row cal-th" role="row"><span role="columnheader">Date</span><span role="columnheader">Event</span><span role="columnheader">Club / venue</span><span role="columnheader">${c.by}</span><span role="columnheader">Discipline</span></div>`;
  let m = '';
  for (const x of list) {
    const k = x.start_date.slice(0, 7);
    if (k !== m) { m = k; html += `<div class="cal-month" role="row"><span role="cell">${MONL[+k.slice(5) - 1]} ${k.slice(0, 4)}</span></div>`; }
    const past = isPast(x), st = ST(x.id);
    const tb = x.titles ? `<span class="b titles">🏅 ${x.titles === 'state' ? 'State Titles' : 'Branch Titles'}</span>` : /state champ/i.test(x.level || '') ? '<span class="b titles">🏅 State Championship</span>' : /national/i.test(x.level || '') && !/registered/i.test(x.level || '') ? `<span class="b titles">🏅 ${esc(x.level)}</span>` : '';
    const stb = st === 'paid' ? '<span class="b paid">✓$ Paid</span>' : st === 'entered' ? '<span class="b ent">✓ Entered</span>' : '';
    html += `<a class="cal-row${past ? ' past' : ''}" role="row" href="#/shoot/${esc(x.id)}">
      <span class="c-date" role="cell">${esc(range(x).replace(/ 20\d\d$/, ''))}${past ? '<small> · finished</small>' : ''}</span>
      <span class="c-name" role="cell"><b>${esc(x.name.replace(/ – [^–]+$/, '') || x.name)}</b>${tb}${stb}${catTag(x)}${clubBadge(x)}${clashBadge(x)}</span>
      <span class="c-club" role="cell">${esc(x.host || x.location || '')}</span>
      <span class="c-where" role="cell">${esc(calWhere(x))}</span>
      <span class="c-disc" role="cell">${esc(x.discipline || '')}</span></a>`;
  }
  if (!list.length) html += `<div class="empty">No events match these filters.</div>`;
  return html + `</div><p class="note">Rebuilt from the organisers’ published calendars and checked ${esc(EV[0] ? EV[0].last_checked || '' : '')}. Always confirm with the host club.</p></div>`;
}
function bindCals(){
  [['#brAll', ''], ['#brJ', 'J – WA']].forEach(([sel, w]) => { const a = $(sel); if (a) a.onclick = e => { CF.where = w; if (location.hash === a.getAttribute('href')) { e.preventDefault(); render(); } }; });
  $('#cw').onchange = e => { CF.where = e.target.value; render(); };
  $('#cd').onchange = e => { CF.disc = e.target.value; render(); };
  $('#cp').onchange = e => { CF.past = e.target.checked; render(); };
  document.querySelectorAll('[data-tcat]').forEach(b => b.onclick = () => { CF.cat = b.dataset.tcat; render(); });
  bindClubDrop(CF);
  document.querySelectorAll('[data-clubf]').forEach(b => b.onclick = () => { CF.club = CF.club === b.dataset.clubf ? '' : b.dataset.clubf; render(); });
}
/* ---------- clubs: directory, my clubs / watching, club pages, "New from your clubs" ---------- */
const CLUBF = {mine: '🏠 My clubs', watch: '👁 Watching', new: '✦ New from your clubs'};
const isMine = id => S.myClubs.includes(id), isWatch = id => S.watchClubs.includes(id);
const followed = () => [...new Set([...S.myClubs, ...S.watchClubs])].filter(id => CLUB[id]);
/* Club-only events (members-only listings and club championships): shown in general lists (Find events, Calendars) only to
   people who have that club in My clubs / Clubs I watch, who saved or entered the event, who pick that club, or who search its name.
   Open special events stay visible to everyone. My events is unaffected. */
const clubOnly = x => !!(x.members_only || /club champ/i.test((x.level || '') + ' ' + (x.name || '')));
const CLUB_GENERIC = new Set(['archers', 'archery', 'archer', 'club', 'bowmen', 'bowhunters', 'field', 'target', 'inc', 'incorporated', 'the', 'and', 'of', 'city', 'park', 'centre', 'association', 'championships', 'championship']);
function clubNamed(x, Q){
  if (!Q || !Q.words.length) return false;
  const c = CLUB[x.club_id], nm = snorm([c && c.name, ...(c && c.aliases || []), x.host].filter(Boolean).join(' ')).split(' ');
  return Q.words.some(w => w.length >= 3 && !CLUB_GENERIC.has(w) && nm.some(h => !CLUB_GENERIC.has(h) && h.startsWith(w)));
}
const clubOk = (x, Q) => !clubOnly(x) || !!S.saved[x.id] || !!S.entries[x.id] || (!!x.club_id && (S.myClubs.includes(x.club_id) || S.watchClubs.includes(x.club_id))) || clubNamed(x, Q);
const clubFilter = k => k === 'mine' ? x => isMine(x.club_id) : k === 'watch' ? x => isWatch(x.club_id) : k === 'new' ? x => !!S.clubNew[x.id] : () => true;
/* ---------- date clashes: overlap (every day of multi-day events) with events I've saved / entered / paid ---------- */
const evEnd = x => x.end_date && x.end_date >= x.start_date ? x.end_date : x.start_date;
const datable = x => x && x.start_date && !x.book_anytime && !x.info_only;
const overlaps = (a, b) => a.start_date <= evEnd(b) && b.start_date <= evEnd(a);
const normName = n => (n || '').toLowerCase().replace(/20\d\d|[^a-z0-9]+/g, '');
// Same real-world event listed twice (e.g. AA + state calendar) is not a clash.
const sameShoot = (a, b) => a.id === b.id || (a.start_date === b.start_date && evEnd(a) === evEnd(b) && (normName(a.name) === normName(b.name) || (a.club_id && a.club_id === b.club_id)));
const isEnt = x => ST(x.id) !== 'none';
function myDated(){ return Object.keys(S.saved).concat(Object.keys(S.entries)).filter((v, i, a) => a.indexOf(v) === i).map(id => BYID[id]).filter(datable); }
function clashes(x, mine = myDated()){
  if (!datable(x) || isPast(x)) return [];
  return mine.filter(y => !sameShoot(x, y) && !isPast(y) && overlaps(x, y))
    .sort((a, b) => (isEnt(b) - isEnt(a)) || (a.start_date < b.start_date ? -1 : 1));
}
const shortName = n => { n = n || ''; return n.length > 52 ? n.slice(0, 50).replace(/\s+\S*$/, '') + '…' : n; };
function clashBadge(x){
  const c = clashes(x); if (!c.length) return '';
  const lead = isEnt(c[0]) ? 'Clashes with your entered event: ' : 'Clashes with ';
  return `<span class="b clash" title="${esc(c.map(y => y.name + ' (' + range(y) + ')').join('; '))}">⚠️ ${lead}${esc(shortName(c[0].name))}${c.length > 1 ? ` +${c.length - 1} more` : ''}</span>`;
}
function clashBox(x){
  const c = clashes(x); if (!c.length) return '';
  return `<section class="panel clash-box" id="clashBox"><h2 class="sec">⚠️ Date clash</h2><p class="note">This event overlaps ${c.length === 1 ? 'an event' : c.length + ' events'} in My events:</p><ul>${c.map(y => `<li><a href="#/shoot/${encodeURIComponent(y.id)}">${esc(y.name)}</a> · ${esc(range(y))}${isEnt(y) ? ` <span class="b ${ST(y.id) === 'paid' ? 'paid' : 'ent'}">${ST(y.id) === 'paid' ? '✓$ Entered + paid' : '✓ Entered'}</span>` : ' <span class="b todo">★ Saved</span>'}</li>`).join('')}</ul></section>`;
}
// Pairs of my own upcoming events that clash (for My events / Entries).
function myClashPairs(){
  const m = myDated().filter(x => !isPast(x)).sort((a, b) => a.start_date < b.start_date ? -1 : 1), out = [];
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) if (!sameShoot(m[i], m[j]) && overlaps(m[i], m[j])) out.push([m[i], m[j]]);
  return out;
}
function clashPairsHtml(){
  const p = myClashPairs(); if (!p.length) return '';
  const lnk = y => `<a href="#/shoot/${encodeURIComponent(y.id)}">${esc(shortName(y.name))}</a> <small>(${esc(range(y))}${isEnt(y) ? ', entered' : ''})</small>`;
  return `<section class="panel clash-box" id="myClashes"><h2 class="sec">⚠️ Date clashes in your events (${p.length})</h2><ul>${p.map(([a, b]) => `<li>${lnk(a)} <b>↔</b> ${lnk(b)}</li>`).join('')}</ul><p class="note">Overlapping dates – check you can get to both, or remove one.</p></section>`;
}
function clubBadge(x){
  const id = x.club_id; if (!id) return '';
  const nw = S.clubNew[x.id] ? `<span class="b new">✦ New${S.clubNew[x.id].why === 'flyer' ? ' flyer' : ''}</span>` : '';
  return isMine(id) ? `<span class="b myclub">🏠 My club</span>${nw}` : isWatch(id) ? `<span class="b watching">👁 Watching</span>${nw}` : '';
}
/* 'My clubs' dropdown on the Club events filter: the watchlist lives here (add / remove clubs; synced like other settings),
   and 'Only my clubs' filters Club events to those clubs. Separate club pages are de-emphasised. */
const MC = {open: false, q: ''};
function clubDrop(F, keep){
  const f = followed(), n = EV.filter(x => catOf(x) === 'club' && f.includes(x.club_id) && keep(x)).length;
  const res = MC.q.trim() ? clubSearch(MC.q) : [];
  return `<div class="mc" id="mc"><button type="button" class="mc-btn" id="mcBtn" aria-expanded="${MC.open}" aria-controls="mcPanel">🏠 My clubs${f.length ? ` (${f.length})` : ''}${F.mc ? ' · only these' : ''} <span aria-hidden="true">▾</span></button>
  <div class="mc-panel" id="mcPanel" ${MC.open ? '' : 'hidden'}>
    <fieldset class="mc-opts"><legend>Show club events from</legend>
      <label><input type="radio" name="mcf" value="all" ${F.mc ? '' : 'checked'}> All clubs</label>
      <label><input type="radio" name="mcf" value="mine" ${F.mc ? 'checked' : ''} ${f.length ? '' : 'disabled'}> Only my clubs <small>(${n} event${n === 1 ? '' : 's'})</small></label></fieldset>
    <h3 class="mc-h">My clubs</h3>
    ${f.length ? `<ul class="mc-list" id="mcList">${f.map(id => `<li data-club="${esc(id)}"><span>${isMine(id) ? '🏠' : '👁'} ${esc(CLUB[id].name)} <small>${esc(CLUB[id].state || '')}</small></span><button type="button" class="tbtn" data-mcrm="${esc(id)}" aria-label="Remove ${esc(CLUB[id].name)}">✕ Remove</button></li>`).join('')}</ul>` : '<p class="note" id="mcEmpty">No clubs yet. Add one below.</p>'}
    <label for="mcQ" class="mc-h">Add a club</label><input type="search" id="mcQ" placeholder="Club name, suburb or state" value="${esc(MC.q)}" autocomplete="off">
    <ul class="mc-list" id="mcRes">${res.map(c => `<li data-club="${esc(c.id)}"><span>${esc(c.name)} <small>${esc(clubLine(c))}</small></span>${f.includes(c.id) ? '<span class="note">✓ Added</span>' : `<button type="button" class="tbtn" data-mcadd="${esc(c.id)}">+ Add</button>`}</li>`).join('')}${MC.q.trim() && !res.length ? '<li class="note">No club found. Try part of the name or the state.</li>' : ''}</ul>
    <p class="note">Saved to your account when you're signed in.</p></div></div>`;
}
function bindClubDrop(F){
  const b = $('#mcBtn'); if (!b) return;
  const rer = focusSel => { const y = scrollY; render(); scrollTo(0, y); const e = focusSel && $(focusSel); if (e) { e.focus({preventScroll: true}); if (e.setSelectionRange) e.setSelectionRange(e.value.length, e.value.length); } };
  b.onclick = () => { MC.open = !MC.open; rer(MC.open ? '#mcQ' : '#mcBtn'); };
  document.querySelectorAll('input[name="mcf"]').forEach(r => r.onchange = () => { F.mc = r.value === 'mine'; F.limit = 60; rer('#mcBtn'); });
  const q = $('#mcQ'); if (q) q.oninput = () => { MC.q = q.value; clearTimeout(bindClubDrop.t); bindClubDrop.t = setTimeout(() => rer('#mcQ'), 200); };
  document.querySelectorAll('[data-mcadd]').forEach(x => x.onclick = () => { const id = x.dataset.mcadd; if (!isWatch(id) && !isMine(id)) toggleClub('watch', id); rer('#mcQ'); });
  document.querySelectorAll('[data-mcrm]').forEach(x => x.onclick = () => { const id = x.dataset.mcrm;
    S.myClubs = S.myClubs.filter(c => c !== id); S.watchClubs = S.watchClubs.filter(c => c !== id); if (S.homeClub === id) S.homeClub = S.myClubs[0] || null;
    if (!followed().length) F.mc = false; save(); toast('Removed from My clubs'); rer('#mcQ'); });
  document.addEventListener('click', e => { if (MC.open && !e.target.closest('#mc') && !e.target.closest('#clubPop') && $('#mc')) { MC.open = false; const p = $('#mcPanel'); if (p) p.hidden = true; const bb = $('#mcBtn'); if (bb) bb.setAttribute('aria-expanded', 'false'); } }, {once: true, capture: false});
}
/* Club popover: club names open this small panel instead of a separate page (the #/club/<id> URL still works). */
function clubPop(id, from){
  const c = CLUB[id]; if (!c) return; closeClubPop();
  const up = c.country ? iClubEv(id).filter(x => !iPast(x)).length || (INTL ? 0 : c.n_events) : EV.filter(x => x.club_id === id && !isPast(x)).length, q = encodeURIComponent([c.name, c.address || c.suburb, c.state].filter(Boolean).join(', '));
  const d = document.createElement('div'); d.className = 'club-pop-wrap'; d.id = 'clubPop';
  d.innerHTML = `<div class="club-pop" role="dialog" aria-modal="true" aria-labelledby="cpT"><button type="button" class="cp-x" id="cpX" aria-label="Close">✕</button>
    <h2 id="cpT">${esc(c.name)}</h2><p class="note">${esc(clubLine(c))}</p>
    ${c.address ? `<p>${esc(c.address)} · <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">📍 Map ↗</a></p>` : ''}
    ${c.website ? `<p><a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))} ↗</a></p>` : ''}
    <div class="club-acts"><button type="button" class="tbtn" data-join="${esc(id)}" aria-pressed="${isMine(id)}">${isMine(id) ? '✓ 🏠 My club' : '+ 🏠 My club'}</button><button type="button" class="tbtn" data-watch="${esc(id)}" aria-pressed="${isWatch(id)}">${isWatch(id) ? '✓ 👁 Watching' : '+ 👁 Watch'}</button></div>
    <button type="button" class="btn alt block" id="cpShoots">Show its events (${up} upcoming)</button></div>`;
  document.body.appendChild(d);
  const back = () => { closeClubPop(); from && from.focus && from.focus(); };
  d.onclick = e => { if (e.target === d) back(); };
  $('#cpX').onclick = back; $('#cpX').focus();
  d.querySelectorAll('[data-join],[data-watch]').forEach(b => b.onclick = () => { if (b.dataset.join) toggleClub('my', id); else toggleClub('watch', id); const y = scrollY; render(); scrollTo(0, y); clubPop(id, from); });
  $('#cpShoots').onclick = () => { closeClubPop(); showClubShoots(id); };
}
/* Show only one club's events in Find events (same set as the popover's "N upcoming": every event with that club_id). */
function showClubShoots(id){ const c = CLUB[id]; if (c && c.country) { location.hash = '#/intl/' + c.country; return; }
  Object.assign(BF, {clubId: id, club: '', q: '', cat: '', disc: '', ost: '', state: '', scope: 'all', past: false, limit: 60}); if (location.hash === '#/browse') render(); else location.hash = '#/browse'; }
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-clubgo]'); if (b) { e.preventDefault(); showClubShoots(b.dataset.clubgo); } });
function closeClubPop(){ const d = $('#clubPop'); if (d) d.remove(); }
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-clubpop]'); if (b) { e.preventDefault(); e.stopPropagation(); clubPop(b.dataset.clubpop, b); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#clubPop')) closeClubPop(); else if (MC.open && $('#mc')) { MC.open = false; render(); const b = $('#mcBtn'); b && b.focus(); } } });
window.addEventListener('hashchange', () => { closeClubPop(); MC.open = false; });
/* ---------- in-app image viewer (flyers, source calendars) ----------
   An installed iPhone app (standalone, no browser chrome) has no back button, so opening a flyer image as its own page
   (same window or target=_blank inside the app's scope) strands the user. Every same-site image link opens here instead:
   big ✕, tap outside, Escape, and the back gesture / back button all close it; pinch or double-tap to zoom. */
const LB_RE = /\.(jpe?g|png|webp|gif)$/i;
function lbOpen(href, label, o = {}){
  lbClose(true);
  const w = document.createElement('div'); w.id = 'flb'; w.className = 'flb' + (o.light ? ' flb-light' : ''); w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', label || 'Flyer');
  const full = isStandalone() || o.noFull ? '' : `<a class="flb-full" href="${esc(href)}" target="_blank" rel="noopener">Open full size ↗</a>`;
  w.innerHTML = `<div class="flb-bar"><span class="flb-t">${esc(label || '')}</span>${full}<button type="button" class="flb-x" aria-label="Close">✕</button></div>
    <div class="flb-sc"><img class="flb-img" src="${esc(href)}" alt="${esc(label || 'Flyer')}"></div>${o.cap ? `<p class="flb-cap">${esc(o.cap)}</p>` : ''}<p class="flb-hint">${esc(o.hint || 'Pinch or double-tap to zoom · tap ✕ or swipe back to close')}</p>`;
  document.body.appendChild(w); document.documentElement.classList.add('flb-on');
  const sc = w.querySelector('.flb-sc'), img = w.querySelector('.flb-img'); let z = 1;
  const setZ = (nz, cx, cy) => { nz = Math.max(1, Math.min(5, nz)); cx = cx ?? sc.clientWidth / 2; cy = cy ?? sc.clientHeight / 2; const ox = (sc.scrollLeft + cx) / z, oy = (sc.scrollTop + cy) / z;
    z = nz; img.style.width = z === 1 ? '' : (z * sc.clientWidth) + 'px'; img.style.maxHeight = z === 1 ? '' : 'none'; w.classList.toggle('zoomed', z > 1);
    sc.scrollLeft = ox * z - cx; sc.scrollTop = oy * z - cy; };
  let lastTap = 0, pinch = null;
  sc.addEventListener('touchstart', e => { if (e.touches.length === 2) { const [a, b] = e.touches; pinch = {d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z}; } }, {passive: true});
  sc.addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) { e.preventDefault(); const [a, b] = e.touches, r = sc.getBoundingClientRect();
    setZ(pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); } }, {passive: false});
  sc.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
  img.addEventListener('click', e => { e.stopPropagation(); const now = Date.now(), r = sc.getBoundingClientRect();
    if (now - lastTap < 350 || e.detail === 2 || !('ontouchstart' in window)) setZ(z > 1 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top); lastTap = now; });
  w.addEventListener('click', e => { if (e.target === w || e.target === sc || e.target.classList.contains('flb-hint') || e.target.classList.contains('flb-bar')) lbClose(); });
  w.querySelector('.flb-x').onclick = () => lbClose(); w.querySelector('.flb-x').focus();
  try { history.pushState({lb: 1}, '', location.href); } catch (e) {}
}
function lbClose(silent){
  const w = $('#flb'); if (!w) return; w.remove(); document.documentElement.classList.remove('flb-on');
  if (!silent && history.state && history.state.lb) history.back();
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.closest('#flb') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (er) { return; }
  if (u.origin !== location.origin || !LB_RE.test(u.pathname)) return;
  e.preventDefault(); e.stopPropagation();
  const img = a.querySelector('img'); lbOpen(u.href, (img && img.alt) || a.getAttribute('aria-label') || 'Flyer');
}, true);
window.addEventListener('popstate', () => { if ($('#flb')) lbClose(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#flb')) { e.stopImmediatePropagation(); lbClose(); } }, true);
window.addEventListener('hashchange', () => { if ($('#flb')) lbClose(true); });
function clubChips(cur, past, extra){
  const f = followed(); if (!f.length) return `<p class="note club-hint">🏠 <a href="#/settings/clubs">Pick your clubs</a> to see their events here.</p>`;
  const n = k => EV.filter(x => clubFilter(k)(x) && (!extra || extra(x)) && (past || !isPast(x))).length, nn = Object.keys(S.clubNew).filter(id => BYID[id]).length;
  const ks = [S.myClubs.length && 'mine', S.watchClubs.length && 'watch', nn && 'new'].filter(Boolean);
  return `<div class="chips club-chips" role="group" aria-label="Clubs">${ks.map(k => `<button class="chip" data-clubf="${k}" aria-pressed="${cur === k}">${CLUBF[k]} <small>${n(k)}</small></button>`).join('')}</div>`;
}
const flyerKey = x => x.flyer_is_current ? 'f' + (x.flyer_year || '') : '';
// Baseline a club's events (no "New" flood when you first follow it, or when follows arrive from another device).
function baselineClub(id){ EV.filter(x => x.club_id === id).forEach(x => { S.clubSeen[x.id] = flyerKey(x); }); S.clubSeenClubs[id] = 1; }
function clubUpdates(){
  const now = Date.now(), fresh = [];
  for (const [id, v] of Object.entries(S.clubNew)) if (!BYID[id] || now - v.t > 14 * 864e5) delete S.clubNew[id];   // New lasts 14 days or until opened
  for (const id of followed()) {
    if (!S.clubSeenClubs[id]) { baselineClub(id); continue; }
    for (const x of EV.filter(e => e.club_id === id)) {
      const fk = flyerKey(x), was = S.clubSeen[x.id];
      if (was === undefined) { if (!isPast(x)) { S.clubNew[x.id] = {t: now, why: 'event'}; fresh.push(x); } }
      else if (fk && was !== fk && !isPast(x)) { S.clubNew[x.id] = {t: now, why: 'flyer'}; fresh.push(x); }
      S.clubSeen[x.id] = fk;
    }
  }
  save(true);
  if (fresh.length && S.clubNotify && S.notify && 'Notification' in window && Notification.permission === 'granted')
    for (const x of fresh.slice(0, 5)) { const why = S.clubNew[x.id].why === 'flyer' ? 'New flyer' : 'New event', o = {body: `${range(x)} · ${(CLUB[x.club_id] || {}).name || ''}`, tag: 'club-new-' + x.id, icon: 'icons/icon-192.png', data: {id: x.id}};
      navigator.serviceWorker?.ready.then(reg => reg.showNotification(`${why}: ${x.name}`, o)).catch(() => {}); }
  return fresh;
}
function clubNotice(){
  const ids = Object.keys(S.clubNew).filter(id => BYID[id]); if (!ids.length) return '';
  const nf = ids.filter(id => S.clubNew[id].why === 'flyer').length, ne = ids.length - nf;
  return `<div class="club-new" role="status"><span>✦ <b>New from your clubs:</b> ${[ne && `${ne} new event${ne === 1 ? '' : 's'}`, nf && `${nf} new flyer${nf === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
    <button type="button" class="linkbtn" id="cnView">Show</button><button type="button" class="linkbtn" id="cnClear" aria-label="Dismiss new from your clubs">✕ Dismiss</button></div>`;
}
function bindClubNotice(){
  const v = $('#cnView'), c = $('#cnClear');
  if (v) v.onclick = () => { Object.assign(BF, {club: 'new', q: '', cat: '', disc: '', state: '', limit: 60}); if (location.hash.startsWith('#/browse')) render(); else location.hash = '#/browse'; };
  if (c) c.onclick = () => { S.clubNew = {}; save(); render(); };
}
function homeClubs(){
  const f = followed();
  if (!f.length) return `<section class="panel your-clubs empty-clubs"><h2 class="sec-h">Your clubs</h2><p>Follow your club to see its next events here, and get a “New” badge when it adds an event or a flyer.</p><a class="btn alt" href="#/settings/clubs">🏠 Pick your clubs</a></section>`;
  const next = EV.filter(x => f.includes(x.club_id) && !isPast(x) && x.start_date).sort((a, b) => a.start_date < b.start_date ? -1 : 1).slice(0, 4);
  return `<section class="your-clubs"><h2 class="sec-h">Your clubs</h2>${clubNotice()}
    <p class="club-links">${f.map(id => `<span class="chip-pair"><button type="button" class="chip" data-clubgo="${esc(id)}" aria-label="Show ${esc(CLUB[id].name)} events">${isMine(id) ? '🏠 ' : '👁 '}${esc(CLUB[id].name)}${S.homeClub === id ? ' · home' : ''}</button><button type="button" class="chip chip-info" data-clubpop="${esc(id)}" aria-haspopup="dialog" aria-label="About ${esc(CLUB[id].name)}" title="Club info">ⓘ</button></span>`).join('')}</p>
    ${next.length ? `<div class="list">${next.map(evCard).join('')}</div>` : '<p class="note">No upcoming events listed for your clubs yet.</p>'}
    <p><a href="#/browse" id="ycAll" class="linkbtn">All events from my clubs →</a></p></section>`;
}
// picker
const clubKey = c => snorm([c.name, ...(c.aliases || []), c.suburb, c.state, (STATES.find(s => s[0] === c.state) || [])[1]].filter(Boolean).join(' '));
function clubSearch(q){
  const w = snorm(q).split(' ').filter(Boolean); if (!w.length) return [];
  return CLUBS.filter(c => { const k = ' ' + clubKey(c) + ' '; return w.every(t => k.includes(' ' + t) ); })
    .sort((a, b) => (b.n_events > 0) - (a.n_events > 0) || a.name.localeCompare(b.name)).slice(0, 15);
}
const clubLine = c => [c.suburb, c.state, c.country_name && `${flag(({MAS: 'MY'})[c.country] || '')} ${c.country_name}`, c.kind, c.venue && 'Indoor range', (c.orgs || []).map(o => ({aa: 'Archery Australia', awa: 'Archery WA', aba: 'ABA', taa: 'TAA'}[o])).filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
function clubRow(c){
  const up = c.country ? iClubEv(c.id).filter(x => !iPast(x)).length || (INTL ? 0 : c.n_events) : EV.filter(x => x.club_id === c.id && !isPast(x)).length;
  return `<li class="club-row" data-club="${esc(c.id)}"><button type="button" class="linkbtn club-name" data-clubpop="${esc(c.id)}" aria-haspopup="dialog"><b>${esc(c.name)}</b></button><span class="note">${esc(clubLine(c))}${up ? ` · ${up} upcoming event${up === 1 ? '' : 's'}` : ''}</span>
    <span class="club-acts"><button type="button" class="tbtn" data-join="${esc(c.id)}" aria-pressed="${isMine(c.id)}">${isMine(c.id) ? '✓ 🏠 My club' : '+ 🏠 My club'}</button><button type="button" class="tbtn" data-watch="${esc(c.id)}" aria-pressed="${isWatch(c.id)}">${isWatch(c.id) ? '✓ 👁 Watching' : '+ 👁 Watch'}</button>${isMine(c.id) ? `<button type="button" class="tbtn" data-home="${esc(c.id)}" aria-pressed="${S.homeClub === c.id}">${S.homeClub === c.id ? '★ Home club' : '☆ Make home club'}</button>` : ''}</span></li>`;
}
function clubPickerHtml(){
  const mine = S.myClubs.filter(id => CLUB[id]).map(id => CLUB[id]), watch = S.watchClubs.filter(id => CLUB[id] && !isMine(id)).map(id => CLUB[id]);
  return `<div class="club-picker" id="clubPicker">
    <h3>🏠 My clubs <span class="note">(clubs I belong to)</span></h3>${mine.length ? `<ul class="club-list" id="myClubList">${mine.map(clubRow).join('')}</ul>` : '<p class="note" id="myClubList">None yet – search below and tap “+ My club”.</p>'}
    <h3>👁 Clubs I watch</h3>${watch.length ? `<ul class="club-list" id="watchList">${watch.map(clubRow).join('')}</ul>` : '<p class="note" id="watchList">None yet – watch a club to see its events and new flyers.</p>'}
    <label for="clubQ">Find a club by name, suburb or state</label><input type="search" id="clubQ" placeholder="e.g. Gosnells, KGSA, Yokine, QLD…" autocomplete="off" value="${esc(clubPickerHtml.q || '')}">
    <ul class="club-list" id="clubRes" aria-live="polite">${clubPickerHtml.q ? clubSearch(clubPickerHtml.q).map(clubRow).join('') || '<li class="note">No club found. Try part of the name or the state.</li>' : ''}</ul>
    <p class="note">${CLUBS.length} clubs from the Archery WA, Archery SA, SQAS and Archery Victoria club lists and the events on our calendars. Missing yours? <a href="#/submit">Tell us</a>.</p></div>`;
}
function clubSettings(){
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<h2 id="clubs">Your clubs</h2><p class="note">Saved on this device${AUTH.on ? ' and in your account if you sign in' : ''}. Their events get a 🏠 My club or 👁 Watching badge, and a ✦ New badge when they add an event or a current flyer.</p>
  ${clubPickerHtml()}
  <label class="chk"><input type="checkbox" id="clubNotify" ${S.clubNotify ? 'checked' : ''}> 🔔 Also send a phone/browser notification for new events and flyers from my clubs${perm !== 'granted' || !S.notify ? ' <span class="note">(turns on notifications)</span>' : ''}</label>`;
}
function toggleClub(kind, id){
  const was = kind === 'my' ? isMine(id) : isWatch(id), k = kind === 'my' ? 'myClubs' : 'watchClubs';
  S[k] = was ? S[k].filter(x => x !== id) : [...S[k], id];
  if (kind === 'my' && was && S.homeClub === id) S.homeClub = null;
  if (kind === 'my' && !was && !S.homeClub) S.homeClub = id;
  if (!was && !S.clubSeenClubs[id]) baselineClub(id);
  save(); toast(was ? 'Removed' : kind === 'my' ? '✓ Added to My clubs' : '✓ Watching');
}
function bindClubBtns(root){
  root.querySelectorAll('[data-join],[data-watch],[data-home]').forEach(b => b.onclick = () => {
    const d = b.dataset, sel = d.join ? `[data-join="${CSS.escape(d.join)}"]` : d.watch ? `[data-watch="${CSS.escape(d.watch)}"]` : `[data-home="${CSS.escape(d.home)}"]`, inRes = !!b.closest('#clubRes');
    if (d.join) toggleClub('my', d.join); else if (d.watch) toggleClub('watch', d.watch); else { S.homeClub = d.home; save(); toast('★ Home club set'); }
    const y = scrollY; render(); scrollTo(0, y); const nb = (inRes && $('#clubRes ' + sel)) || $(sel); nb && nb.focus({preventScroll: true});
  });
}
function bindClubPicker(){
  const q = $('#clubQ');
  if (q) q.oninput = () => { clubPickerHtml.q = q.value; $('#clubRes').innerHTML = q.value.trim() ? clubSearch(q.value).map(clubRow).join('') || '<li class="note">No club found. Try part of the name or the state.</li>' : ''; bindClubBtns($('#clubRes')); };
  bindClubBtns($('#view'));
  const cn = $('#clubNotify'); if (cn) cn.onchange = async () => {
    S.clubNotify = cn.checked;
    if (cn.checked && (!S.notify || !('Notification' in window) || Notification.permission !== 'granted')) {
      if (!('Notification' in window)) { S.clubNotify = false; toast('This browser can’t show notifications'); }
      else { const p = await Notification.requestPermission(); S.notify = p === 'granted'; if (!S.notify) { S.clubNotify = false; toast('Notifications are blocked in this browser'); } }
    }
    save(); toast(S.clubNotify ? '🔔 We’ll notify you about new events from your clubs' : 'Saved'); render();
  };
}
function vClubs(){
  setTitle('Clubs');
  return `${pageHead('Clubs', 'Find your club, follow it, and see all its events in one place.', 'mixed')}<div class="wrap narrow"><section class="panel">${clubPickerHtml()}</section>
  ${STATES.map(([c, n]) => { const cs = CLUBS.filter(x => x.state === c); return cs.length ? `<details class="panel"><summary><b>${n}</b> <span class="note">${cs.length} clubs</span></summary><ul class="club-list">${cs.map(clubRow).join('')}</ul></details>` : ''; }).join('')}</div>`;
}
function vClub(id){
  const c = CLUB[id];
  if (!c) { setTitle('Club'); return `${pageHead('Club not found', '', 'mixed')}<div class="wrap narrow"><p>We couldn’t find that club. <a href="#/clubs">All clubs</a></p></div>`; }
  setTitle(c.name);
  const evs = EV.filter(x => x.club_id === id).sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1), up = evs.filter(x => !isPast(x)), past = evs.filter(isPast).reverse();
  const addr = c.address || [c.name, c.suburb, c.state, 'Australia'].filter(Boolean).join(', ');
  const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  return `${pageHead(c.name, clubLine(c), (c.orgs || []).includes('aba') && !(c.orgs || []).some(o => o !== 'aba') ? 'aba_field' : 'mixed')}<div class="wrap narrow club-page">
    <section class="panel"><div class="club-acts big">
      <button type="button" class="btn ${isMine(id) ? '' : 'alt'}" data-join="${esc(id)}" aria-pressed="${isMine(id)}">${isMine(id) ? '✓ 🏠 My club' : '🏠 Join – add to My clubs'}</button>
      <button type="button" class="btn ${isWatch(id) ? '' : 'alt'}" data-watch="${esc(id)}" aria-pressed="${isWatch(id)}">${isWatch(id) ? '✓ 👁 Watching' : '👁 Watch this club'}</button>
      ${isMine(id) ? `<button type="button" class="btn alt" data-home="${esc(id)}" aria-pressed="${S.homeClub === id}">${S.homeClub === id ? '★ Home club' : '☆ Make home club'}</button>` : ''}</div>
      <p class="note">“Join” here just marks it as your club in this app – to become a member, contact the club.</p>
      <dl class="kv">${c.aliases && c.aliases.length ? `<dt>Also known as</dt><dd>${esc(c.aliases.join(', '))}</dd>` : ''}
        <dt>Where</dt><dd>${esc(c.address || [c.suburb, c.state].filter(Boolean).join(', ') || '—')}<br><a href="${esc(map)}" target="_blank" rel="noopener">📍 Open in Maps ↗</a></dd>
        ${c.website ? `<dt>Website</dt><dd><a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 50))} ↗</a></dd>` : ''}
        ${c.email || c.phone ? `<dt>Contact</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.email && c.phone ? '<br>' : ''}${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>` : ''}</dd>` : ''}
        ${c.venue ? '' : `<dt>Calendars</dt><dd>${esc((c.orgs || []).map(o => ({aa: 'Archery Australia', awa: 'Archery WA', aba: 'ABA', taa: 'TAA'}[o])).filter(Boolean).join(', ') || '—')}</dd>`}</dl></section>
    <h2 class="sec-h">Upcoming events (${up.length})</h2>${up.length ? `<div class="list">${up.map(evCard).join('')}</div>` : '<p class="note">No upcoming events listed yet. Watch the club to get a “New” badge when one is added.</p>'}
    ${past.length ? `<details class="past-shoots"><summary><h2 class="sec-h">Past events (${past.length})</h2></summary><div class="list">${past.map(evCard).join('')}</div></details>` : ''}
    <p class="note"><a href="#/clubs">← All clubs</a></p></div>`;
}
function bindClub(id){ bindClubPicker(); }
/* ---------- router ---------- */
/* ---------- optional accounts (Supabase) ----------
   Off unless config.js sets SUPABASE_URL + SUPABASE_ANON_KEY. Off = the site works exactly as before (no sign-in UI, nothing loaded).
   On = "Sign in" in the header; sign-in by emailed magic link (and Google if SUPABASE_GOOGLE). Data stays in localStorage as before and
   is synced to the account by sync.js (queue + last write wins), so the site keeps working offline and without signing in. */
const SB_URL = String(window.SUPABASE_URL || '').trim(), SB_KEY = String(window.SUPABASE_ANON_KEY || '').trim();
function sbKeyOk(k){
  if (!k || /YOUR|PLACEHOLDER|xxx/i.test(k) || /^sb_secret_/.test(k)) return false;       // never accept a secret key
  if (/^sb_publishable_/.test(k)) return true;
  try { const p = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.role === 'anon'; } catch { return false; }
}
const AUTH = {configured: false, on: /^https:\/\/[^\s/]+\/?$/.test(SB_URL) && sbKeyOk(SB_KEY), client: null, user: null, sync: null, ready: false, msg: '', sent: '', chain: Promise.resolve()};
AUTH.configured = AUTH.on; AUTH.auto = window.SUPABASE_ENABLED === 'auto'; if (window.SUPABASE_ENABLED !== true && !AUTH.auto) AUTH.on = false;   // master switch in config.js
if (SB_URL && !AUTH.on) console.warn('Archery Calendar: Supabase config ignored – needs SUPABASE_URL (https://…supabase.co) and the PUBLIC anon/publishable key (never the service_role/secret key).');
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load ' + src)); document.head.appendChild(s); });
const redirectUrl = () => location.origin + location.pathname;
// Installed app (Home Screen): its storage is separate from the browser's, so an emailed link signs in the BROWSER, not the app.
// The emailed one-time code (verifyOtp) signs in wherever it's typed. The 'code sent to' email is kept for an hour so it survives
// the app being reloaded while you switch to your mail app.
const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const OTP_KEY = 'archcal.otpSent';
function setSent(em){ AUTH.sent = em || ''; try { em ? localStorage.setItem(OTP_KEY, JSON.stringify({em, t: Date.now()})) : localStorage.removeItem(OTP_KEY); } catch {} }
function loadSent(){ try { const o = JSON.parse(localStorage.getItem(OTP_KEY) || 'null'); if (o && o.em && Date.now() - o.t < 60 * 60 * 1000) AUTH.sent = o.em; else localStorage.removeItem(OTP_KEY); } catch {} }
function softRender(){ const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#view')) return; keepForm(() => { const y = scrollY; render(); scrollTo(0, y); }); }
/* A background re-render (data arriving, sign-in finishing) must never wipe what someone has typed or picked: values are put back by id. */
function keepForm(f){
  const pg = document.body.dataset.page, els = [...document.querySelectorAll('#view input[id], #view textarea[id], #view select[id]')].filter(i => i.type !== 'hidden' && i.type !== 'submit');
  const vals = els.filter(i => i.type === 'file' ? i.files && i.files.length : i.type === 'checkbox' || i.type === 'radio' ? i.checked !== i.defaultChecked : i.value !== (i.tagName === 'SELECT' ? (i.querySelector('option[selected]') || i.options[0] || {}).value : i.defaultValue))
    .map(i => [i.id, i.type, i.type === 'file' ? i.files : i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.value]);
  f();
  if (!vals.length || document.body.dataset.page !== pg) return;
  for (const [id, t, v] of vals) { const e = document.getElementById(id); if (!e || e.type !== t) continue;
    try { if (t === 'file') { e.files = v; e.dispatchEvent(new Event('change', {bubbles: true})); } else if (t === 'checkbox' || t === 'radio') e.checked = v; else e.value = v; } catch {} }
}
// pages whose content depends on sign-in; other pages aren't re-drawn when sign-in finishes loading (no jumps mid-click)
function authRender(){ if (['account', 'privacy', 'settings', 'submit', 'fix', 'admin'].includes(document.body.dataset.page)) softRender(); }
function updateNav(){
  const a = $('#navAcct'); if (!a) return; a.hidden = !(AUTH.on && AUTH.ready); if (a.hidden) return;
  const fs = $('#footStore'); if (fs) fs.textContent = 'Your saved events and entries are kept in your browser on this device, and in your account if you sign in';
  const n = AUTH.sync ? AUTH.sync.pending() : 0, linked = AUTH.sync && AUTH.sync.linked();
  if (AUTH.user) { a.innerHTML = `👤${linked && n ? ' ⏳' : ''}<span class="pl"> Account</span>`; a.setAttribute('aria-label', 'Account'); } else { a.textContent = 'Sign in'; a.removeAttribute('aria-label'); }
  a.classList.toggle('on', (location.hash || '').startsWith('#/account'));
  admNav();
}
/* Admin link: shown only to admins (UI check by email, confirmed by rpc is_admin – the database enforces it anyway) */
const ADMNAV = {uid: null, ok: false, n: 0, t: 0};
function admNavPaint(){
  const b = $('#navAdmin'); if (!b) return; const ok = !!(AUTH.user && (ADMNAV.ok || isAdmin()));
  b.hidden = !ok; b.classList.toggle('on', (location.hash || '').startsWith('#/admin'));
  const g = $('#navAdmBadge'); if (g) { g.hidden = !(ok && ADMNAV.n > 0); g.textContent = ADMNAV.n > 99 ? '99+' : String(ADMNAV.n); }
  b.setAttribute('aria-label', ADMNAV.n ? `Admin – ${ADMNAV.n} waiting` : 'Admin');
}
async function admNav(){
  admNavPaint(); const u = AUTH.user;
  if (!u || !AUTH.client) { ADMNAV.uid = null; ADMNAV.ok = false; ADMNAV.n = 0; return; }
  if (ADMNAV.uid === u.id && Date.now() - ADMNAV.t < 60000) return;
  ADMNAV.uid = u.id; ADMNAV.t = Date.now();
  try { const r = await AUTH.client.rpc('is_admin'); if (!r.error) ADMNAV.ok = !!r.data; } catch (e) {}
  if (ADMNAV.ok || isAdmin()) try { const c = await AUTH.client.from('submitter_requests').select('email', {count: 'exact', head: true}).eq('status', 'pending'); if (!c.error) ADMNAV.n = c.count || 0; } catch (e) {}
  admNavPaint();
}
/* Tables-ready check (no library needed): as a signed-out visitor, the tables and sync function must EXIST (answering
   "permission denied" is fine – that's RLS/grants working). Missing (PGRST205 / PGRST202 / 404) = schema.sql not run yet:
   keep sign-in hidden and stay local-only. Offline: reuse the last answer. */
async function sbReady(){
  const prev = (localStorage.getItem('archcal.sbReady') || '').split(':');      // '0:<time>' = not ready; re-check at most every 30 min
  if (prev[0] === '0' && Date.now() - (+prev[1] || 0) < 30 * 60 * 1000) return false;
  const h = {apikey: SB_KEY}, base = SB_URL.replace(/\/$/, '');
  const missing = r => r.status === 404;     // PostgREST answers 404 (PGRST205 table / PGRST202 function not found)
  try {
    const [t, f] = await Promise.all([fetch(base + '/rest/v1/user_events?select=event_id&limit=1', {headers: h}),
      fetch(base + '/rest/v1/rpc/sync_user_events', {method: 'POST', headers: Object.assign({'Content-Type': 'application/json'}, h), body: '{"rows":[]}'})]);
    const ok = !missing(t) && !missing(f) && t.status < 500 && f.status < 500;
    localStorage.setItem('archcal.sbReady', ok ? '1' : '0:' + Date.now()); return ok;
  } catch { return localStorage.getItem('archcal.sbReady') === '1'; }
}
async function initAuth(){
  // The SUPABASE_ENABLED switch is the gate now (it is set only after schema.sql has run). The tables-ready probe is kept for a
  // config without the switch confirmed (SUPABASE_ENABLED = 'auto'); it logs harmless 401s in the console, so it isn't run by default.
  if (AUTH.on && AUTH.auto && !(await sbReady())) { AUTH.on = false; AUTH.pending = true; console.info('Archery Calendar: accounts configured but the database tables are not set up yet (run supabase/schema.sql) – sign-in hidden.'); }
  updateNav(); if (!AUTH.on) { authRender(); return; }
  try { if (!window.supabase) await loadScript('vendor/supabase-js-2.117.3.js'); }
  catch { AUTH.msg = 'Sign-in couldn’t load. Are you offline? Your events are still saved on this device.'; AUTH.ready = true; authRender(); return; }
  loadSent();
  const qp = new URLSearchParams(location.search);
  if (qp.get('error_description') || qp.get('error')) AUTH.msg = 'Sign-in didn’t work: ' + (qp.get('error_description') || qp.get('error')) + '. Links expire after an hour and only work once – ask for a new one.';
  AUTH.client = window.supabase.createClient(SB_URL, SB_KEY, {auth: {flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'archcal.auth'}});
  AUTH.sync = ArchSync.create({client: AUTH.client, storage: localStorage, getS: () => S, saveS: () => { save(); softRender(); },
    isOnline: () => navigator.onLine, onChange: () => { updateNav(); if (document.body.dataset.page === 'account') authRender(); }});
  const cameBack = qp.has('code') || qp.has('error');
  AUTH.client.auth.onAuthStateChange((ev, sess) => { const u = sess ? sess.user : null; AUTH.chain = AUTH.chain.then(() => onUser(u, ev)).catch(e => { AUTH.msg = String(e.message || e); }); });
  await AUTH.client.auth.getSession().catch(() => {});
  await AUTH.chain;
  if (cameBack) { const back = AUTH.user && takeAfter(); history.replaceState(null, '', location.pathname + (back || (AUTH.user ? '#/account' : (location.hash || '#/account')))); if (back) render(); }
  AUTH.ready = true; updateNav(); authRender();
  addEventListener('online', () => AUTH.sync.flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) AUTH.sync.flush(); });
  setInterval(() => AUTH.sync.flush(), 5 * 60 * 1000);
}
async function onUser(u){
  const prev = AUTH.user && AUTH.user.id; AUTH.user = u;
  if (!u) { AUTH.sync.setUser(null); updateNav(); authRender(); return; }
  setSent('');
  if (prev === u.id && AUTH.sync.linked()) return;
  AUTH.sync.setUser(u);
  if (!AUTH.sync.linked()) {
    if (AUTH.sync.needsMergeChoice(u)) { AUTH.ask = true; if (!location.hash.startsWith('#/account')) location.hash = '#/account'; }
    else await AUTH.sync.link(u, 'account');
  }
  if (!AUTH.ask && AUTH.ready && (location.hash || '').startsWith('#/account')) { const back = takeAfter(); if (back) { location.hash = back; return; } }
  updateNav(); authRender();
}
/* ---------- sign-in required to submit (owner 14 Oct 2026): submissions are tied to a known account so known submitters can be fast-approved.
   Browsing stays fully public. The page to come back to after sign-in is kept for an hour (the emailed link may open a new tab). ---------- */
const AFTER_KEY = 'archcal.after';
function setAfter(h){ try { localStorage.setItem(AFTER_KEY, JSON.stringify({h, t: Date.now()})); } catch {} }
function takeAfter(){ try { const o = JSON.parse(localStorage.getItem(AFTER_KEY) || 'null'); localStorage.removeItem(AFTER_KEY); return o && o.h && Date.now() - o.t < 60 * 60 * 1000 ? o.h : ''; } catch { return ''; } }
const subGate = () => AUTH.configured && window.SUPABASE_ENABLED === true && !AUTH.user;
function vSubGate(fix, bulk){
  setTitle(bulk ? 'Send us your calendar' : fix ? 'Fix an event' : 'Submit an event');
  const head = pageHead(bulk ? 'Send us your calendar' : fix ? 'Fix an existing event' : 'Submit an event', 'Sign in first – it takes a minute and it’s free.', '3d');
  if (!AUTH.ready) return `${head}<div class="wrap narrow"><p class="loading">Checking sign-in…</p></div>`;
  return `${head}<div class="wrap narrow sub"><section class="panel sub-gate" aria-labelledby="gateH">
    <h2 class="sec" id="gateH">🔒 Please sign in to ${bulk ? 'send your calendar' : fix ? 'send a correction' : 'submit an event'}</h2>
    <p>Looking at events never needs an account. To ${fix ? 'send a correction' : 'send an event'}, we ask you to sign in, so we know who it’s from. Events from people we already know get <b>approved faster</b>.</p>
    <ul class="ticks"><li><b>Free</b>, quick sign up – no password. We email you a code.</li><li>Your name, club and email are filled in for you next time.</li><li>We never publish your email.</li></ul>
    ${AUTH.msg ? `<p class="err" role="alert">${esc(AUTH.msg)}</p>` : ''}
    <div class="row"><a class="btn gold" href="#/account" data-gate="in">Sign in</a><a class="btn alt" href="#/account" data-gate="new">Create a free account</a></div>
    <p class="note">New here? “Create a free account” works the same way: type your email, then the code we send you. You’ll come straight back here after.</p></section></div>`;
}
function bindSubGate(){ const h = location.hash || '#/submit'; document.querySelectorAll('[data-gate]').forEach(a => a.onclick = () => setAfter(h)); }
const acctHidden = () => `<input type="hidden" name="account_email" value="${esc(AUTH.user ? AUTH.user.email || '' : '')}"><input type="hidden" name="account_user_id" value="${esc(AUTH.user ? AUTH.user.id : '')}">`;
const counts = () => ({saved: Object.keys(S.saved).length, ent: Object.keys(S.entries).length});
/* First visit to the sign-in page on a phone: small dismissible sheet with the how-to video (once only; not on desktop; not when already installed). */
function appVidPopup(){
  const K = 'archcal.appVidSeen';
  try { if (localStorage.getItem(K)) return; } catch { return; }
  if (!matchMedia('(max-width:640px)').matches || !(navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches)) return;
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone || AUTH.user || $('#appVidPop')) return;
  try { localStorage.setItem(K, '1'); } catch {}      // closing counts as seen
  const d = document.createElement('div'); d.className = 'avp-wrap'; d.id = 'appVidPop';
  d.innerHTML = `<div class="avp" role="dialog" aria-modal="true" aria-labelledby="avpT"><button type="button" class="avp-x" id="avpX" aria-label="Close">✕</button>
    <h2 id="avpT">Put Archery Calendar on your phone like an app</h2>
    <p class="note">Watch how, it takes 30 seconds. iPhone and Samsung, no app store.</p>
    <video controls preload="none" playsinline poster="img/howto-app-poster.jpg" width="540" height="960" aria-label="How to put Archery Calendar on your phone like an app"><source src="media/add-to-home-screen.mp4" type="video/mp4"></video>
    <div class="avp-btns"><button type="button" class="btn gold" id="avpClose">Close</button><button type="button" class="btn alt" id="avpNever">Don't show again</button></div></div>`;
  document.body.appendChild(d);
  const close = () => { const v = d.querySelector('video'); if (v) v.pause(); d.remove(); };
  d.onclick = e => { if (e.target === d) close(); };
  ['avpX', 'avpClose', 'avpNever'].forEach(i => d.querySelector('#' + i).onclick = close);
  d.querySelector('#avpClose').focus();
}
window.addEventListener('hashchange', () => { const d = $('#appVidPop'); if (d) d.remove(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const d = $('#appVidPop'); if (d) d.remove(); } });
/* ---------- First-visit sign-up pop-up (owner 27 Oct 2026; copy and layout from the approved mockup, timing from Marketing) ----------
   Only for visitors who are NOT signed in. Never on first load: about 30 seconds in, or when they open a second event page.
   Phone: bottom sheet. Desktop: centred card. One screen: email, unticked marketing-email tick box, "Not now, just browse".
   Sign-in itself is unchanged: the same signInWithOtp call as the account page, then the account page shows the code box.
   Shown once; dismissed (Not now / X / Esc) = quiet for 14 days, then at most one more time; started sign-up = never again.
   State lives in localStorage 'archreg.popup.v1'. The tick box is only recorded as auth user metadata (marketing_opt_in), nothing is sent. */
const SP = {K: 'archreg.popup.v1', EV: 'archreg.popup.ev', el: null, shown: false, timeAt: Date.now() + 30000, evAt: 0, inert: [], prev: null};
const spLoad = () => { try { const o = JSON.parse(localStorage.getItem(SP.K) || 'null'); return o && typeof o === 'object' ? o : {n: 0}; } catch { return {n: 0}; } };
const spSave = o => { try { localStorage.setItem(SP.K, JSON.stringify(o)); return true; } catch { return false; } };
function spEligible(){
  try { localStorage.setItem(SP.K + '.t', '1'); localStorage.removeItem(SP.K + '.t'); } catch { return false; }   // can't remember the choice, so don't show
  const o = spLoad(), n = +o.n || 0;
  if (o.state === 'started' || o.startedAt || n >= 2) return false;
  if (n === 0) return true;
  return Date.now() - Math.max(+o.dismissedAt || 0, +o.shownAt || 0) >= 14 * 864e5;      // second and last chance, 14 days after the first
}
function spBlocked(){
  if (!AUTH.on || !AUTH.ready || !AUTH.client || AUTH.user || AUTH.sent || AUTH.ask || document.hidden) return true;
  if (['account', 'submit', 'fix', 'admin', 'cards', 'import'].includes(document.body.dataset.page)) return true;   // sign-in page itself, forms, admin
  if (document.querySelector('#clubPop,#appVidPop,#flb,.flb,#stlPh,.stl-ph,[aria-modal="true"]:not(#spPop *):not(#gov),#gov.open,#hbBox:not([hidden]),.ctry-menu')) return true;   // another dialog or menu is open
  if (document.querySelector('#view button:disabled')) return true;                       // something is being sent
  const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.closest('#spPop')) return true;   // typing
  return false;
}
function spNav(){      // called after every page change
  if (document.body.dataset.page !== 'shoot') { SP.evAt = 0; return; }
  let ids = []; try { ids = JSON.parse(sessionStorage.getItem(SP.EV) || '[]'); } catch {}
  const id = decodeURIComponent((location.hash || '').split('?')[0].split('/')[2] || '');
  if (id && !ids.includes(id)) { ids.push(id); try { sessionStorage.setItem(SP.EV, JSON.stringify(ids.slice(-10))); } catch {} if (ids.length === 2) SP.evAt = Date.now() + 1500; }
}
setInterval(() => {
  if (SP.shown || SP.el) return;
  const now = Date.now(); if (!((SP.timeAt && now >= SP.timeAt) || (SP.evAt && now >= SP.evAt && document.body.dataset.page === 'shoot'))) return;
  if (!spEligible()) { SP.timeAt = SP.evAt = 0; return; }
  if (!spBlocked()) spShow();
}, 1000);
const SP_IC = {
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M12 12.6l1.1 2.2 2.4.35-1.75 1.7.4 2.4L12 18l-2.15 1.25.4-2.4-1.75-1.7 2.4-.35z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  rec: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 13l2.3 2.3 4.7-4.8"/></svg>',
  plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h2M14 14h2M8 17.5h2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5l8.5 6 8.5-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'};
function spShow(){
  if ($('#spPop')) return;
  const o = spLoad(); SP.shown = true;
  spSave(Object.assign(o, {n: (+o.n || 0) + 1, state: 'shown', shownAt: Date.now()}));
  gc({path: 'popup/shown', title: 'Sign-up pop-up shown', event: true});
  SP.prev = document.activeElement;
  const d = document.createElement('div'); d.id = 'spPop'; d.className = 'sp-wrap';
  d.innerHTML = `<div class="sp-card" role="dialog" aria-modal="true" aria-labelledby="spT" tabindex="-1">
    <div class="sp-grab" aria-hidden="true"></div>
    <button type="button" class="sp-x" id="spX" aria-label="Close">${SP_IC.x}</button>
    <div class="sp-brand" aria-hidden="true"><span class="logo-mark"></span>Archery <b>Calendar</b></div>
    <h2 id="spT">Never miss a <em>shoot</em></h2>
    <p class="sp-lead">Make an account in under a minute. No password.</p>
    <ul class="sp-ben">
      <li><span class="sp-ic">${SP_IC.cal}</span>Your own calendar of the events you care about</li>
      <li><span class="sp-ic">${SP_IC.pin}</span>Events near you, and wherever you travel</li>
      <li><span class="sp-ic">${SP_IC.rec}</span>A record of your entries and what you spend</li>
      <li><span class="sp-ic">${SP_IC.plan}</span>A plan for your whole year of shoots</li></ul>
    <p class="sp-voice">Always know what's coming up, all in one place.</p>
    <form id="spF" novalidate>
      <label class="sr" for="spEm">Your email</label>
      <input id="spEm" class="sp-in" type="email" autocomplete="email" inputmode="email" placeholder="Your email" required>
      <p class="sp-err" id="spErr" role="alert" hidden></p>
      <button type="submit" class="sp-btn" id="spGo">${SP_IC.mail}<span>Email me a sign-in code</span></button>
      <label class="sp-consent"><input type="checkbox" id="spMk"><span><b>I agree to receive marketing emails</b><small>You can unsubscribe at any time.</small></span></label>
      <p class="sp-note">We'll email you a code. No password needed.</p></form>
    <div class="sp-later"><button type="button" class="sp-skip" id="spSkip">Not now, just browse</button><small>Looking at events never needs an account.</small></div></div>`;
  document.body.appendChild(d); SP.el = d;
  const sbw = innerWidth - document.documentElement.clientWidth; document.documentElement.classList.add('sp-lock'); if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
  SP.inert = [...document.body.children].filter(e => e !== d && e.id !== 'toast' && e.tagName !== 'SCRIPT'); SP.inert.forEach(e => { e.inert = true; });
  d.onclick = e => { if (e.target === d) spClose('dismissed'); };
  $('#spX').onclick = () => spClose('dismissed'); $('#spSkip').onclick = () => spClose('dismissed');
  $('#spF').onsubmit = spSubmit;
  d.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = [...d.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(x => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) return; const first = f[0], last = f[f.length - 1], c = d.querySelector('.sp-card');
    if (e.shiftKey && (document.activeElement === first || document.activeElement === c)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } });
  const card = d.querySelector('.sp-card');
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) $('#spEm').focus({preventScroll: true}); else card.focus({preventScroll: true});   // a phone keyboard would cover the sheet
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && SP.el) { e.preventDefault(); e.stopImmediatePropagation(); spClose('dismissed'); } }, true);   // Esc closes it wherever focus is
function spClose(why){
  const d = SP.el; if (!d) return; SP.el = null;
  d.remove(); document.documentElement.classList.remove('sp-lock'); document.body.style.paddingRight = '';
  SP.inert.forEach(e => { e.inert = false; }); SP.inert = [];
  if (why === 'dismissed') { spSave(Object.assign(spLoad(), {state: 'dismissed', dismissedAt: Date.now()})); gc({path: 'popup/dismissed', title: 'Sign-up pop-up dismissed', event: true}); }
  const p = SP.prev; SP.prev = null; if (why !== 'started' && p && p.isConnected && p.focus) { try { p.focus({preventScroll: true}); } catch {} }
}
async function spSubmit(e){
  e.preventDefault();
  const em = $('#spEm').value.trim(), err = $('#spErr'), b = $('#spGo'), say = t => { err.textContent = t; err.hidden = !t; };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say('Please enter a valid email address.'); $('#spEm').focus(); return; }
  if (!AUTH.client) { say('Sign-in is not available right now. Please try again in a moment.'); return; }
  say(''); b.disabled = true; const lbl = b.querySelector('span'); lbl.textContent = 'Sending…';
  const data = {marketing_opt_in: $('#spMk').checked, marketing_opt_in_at: new Date().toISOString()};      // consent record only; no marketing email is sent
  let error = null;
  try { ({error} = await AUTH.client.auth.signInWithOtp({email: em, options: {emailRedirectTo: redirectUrl(), shouldCreateUser: true, data}})); } catch (x) { error = x || new Error('Could not send the email.'); }
  if (!SP.el) return;
  if (error) { say(/rate|seconds/i.test(error.message || '') ? 'Too many sign-in emails – please wait a minute and try again.' : (error.message || 'Could not send the email. Please try again.')); b.disabled = false; lbl.textContent = 'Email me a sign-in code'; return; }
  setSent(em); AUTH.msg = '';
  spSave(Object.assign(spLoad(), {state: 'started', startedAt: Date.now()}));
  gc({path: 'popup/signup-started', title: 'Sign-up pop-up: sign-up started', event: true});
  const back = location.hash || '#/home'; if (!back.startsWith('#/account')) setAfter(back);      // after signing in, come back to the page they were on
  spClose('started'); toast('Sign-in email sent. Check your inbox.');
  if (!(location.hash || '').startsWith('#/account')) location.hash = '#/account'; else render();
  setTimeout(() => { const o = $('#otp'); if (o) { o.scrollIntoView({block: 'center'}); o.focus({preventScroll: true}); } }, 300);
}
window.addEventListener('hashchange', () => spClose('left'));
function vAccount(){
  setTitle(AUTH.user ? 'Account' : 'Sign in');
  const head = pageHead(AUTH.user ? 'Your account' : 'Sign in', 'Optional. Keep your events, entries and settings on all your devices.', 'mixed');   // short banner: the form stays above the fold on small phones
  const msg = AUTH.msg ? `<div class="warn" role="alert">⚠ ${esc(AUTH.msg)}</div>` : '';
  if (!AUTH.on) return `${head}<div class="wrap narrow"><section class="panel"><p>Accounts aren’t switched on yet. Everything you save is kept in this browser on this device – no sign-up needed.</p><p><a class="btn" href="#/browse">Find events</a></p></section></div>`;
  if (!AUTH.ready) return `${head}<div class="wrap narrow"><p class="loading">Loading…</p></div>`;
  if (!AUTH.client) return `${head}<div class="wrap narrow">${msg}</div>`;
  if (!AUTH.user) return `${head}<div class="wrap narrow">${msg}
    <section class="panel"><h2 class="sec">Sign in or create an account</h2>
    ${AUTH.sent ? `<div class="okbox" role="status">✉ <b>Check your email.</b> We sent a sign-in email to <b>${esc(AUTH.sent)}</b>.${isStandalone() ? ' <b>Use the code from the email to sign in here</b> – the link in the email opens in your browser, not in this app.' : ' Type the code from it below, or tap the link in it <b>in this browser on this device</b>.'} It works once and expires in an hour.</div>
      <form id="otpf" novalidate><label for="otp">Enter the code from the email</label>
      <input id="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required placeholder="••••••" class="otp-in">
      <button class="btn gold block" type="submit">✓ Sign in with code</button></form>
      <p class="note">No email? Check junk, or <button type="button" class="linkbtn" id="again">send it again</button> (or use a different email).</p>`
      : `${isStandalone() ? '<p class="okbox hint-app" role="note">📱 <b>Use the code from the email to sign in here.</b> The link in the email opens in your browser, not in this app.</p>' : ''}<form id="signin" novalidate><label for="em">Email</label><input id="em" type="email" autocomplete="email" required placeholder="you@example.com">
      <button class="btn gold block" type="submit">✉ Email me a sign-in code</button></form>
      <p class="note">No password. We email you a code (and a link). New here? The same email creates your account.</p>`}
    ${window.SUPABASE_GOOGLE ? `<div class="or"><span>or</span></div><button class="btn alt block" id="google" type="button"><b>G</b>&nbsp; Continue with Google</button>` : ''}
    </section>
    <section class="panel"><h2 class="sec">What an account does</h2><ul class="ticks">
      <li>Your saved events, “I’ve entered / I’ve paid”, amounts, receipt numbers, notes, reminders and Settings are kept in your account and synced across your devices.</li>
      <li>Not signed in? Everything still works and stays on this device, as now.</li>
      <li>Stored in Australia (Sydney). Delete your account and data any time. <a href="#/privacy">Privacy</a></li></ul></section></div>`;
  const u = AUTH.user, st = AUTH.sync.state(), c = counts();
  if (!AUTH.sync.linked()) return `${head}<div class="wrap narrow">${msg}<section class="panel"><h2 class="sec">Add this device’s events to your account?</h2>
    <p>Signed in as <b>${esc(u.email)}</b>. This device has <b>${c.saved}</b> saved event${c.saved === 1 ? '' : 's'} and <b>${c.ent}</b> entr${c.ent === 1 ? 'y' : 'ies'} recorded.</p>
    <button class="btn gold block" id="mergeYes">✓ Yes, add them to my account</button>
    <button class="btn alt block" id="mergeNo">✕ No, use my account’s data only</button>
    <p class="note">“Yes” combines both; where the same event differs, the most recent change wins. “No” replaces what’s on this device with your account’s events – <button type="button" class="linkbtn" id="bk">download a backup first</button>.</p>
    <button class="linkbtn" id="so0">Sign out instead</button></section></div>`;
  const n = AUTH.sync.pending(), when = st.lastSync ? new Date(st.lastSync).toLocaleString(LOC(), {weekday: 'short', hour: 'numeric', minute: '2-digit'}) : '';
  const syncTxt = !navigator.onLine ? `⏳ Offline – ${n} change${n === 1 ? '' : 's'} saved on this device, will sync when you’re back online`
    : st.error && n ? `⚠ ${n} change${n === 1 ? '' : 's'} not synced yet (${esc(st.error)}). We’ll keep trying.` : n ? `⏳ Syncing ${n} change${n === 1 ? '' : 's'}…` : `✓ Synced${when ? ' · ' + esc(when) : ''}`;
  const stTxt = S.states.length ? S.states.join(', ') : 'All of Australia', grTxt = GROUPS.filter(g => S.groups.includes(g[0])).map(g => g[0] === 'aba' ? 'ABA' : g[0] === 'taa' ? 'TAA' : g[1]).join(', ');
  return `${head}<div class="wrap narrow">${msg}
   <section class="panel"><h2 class="sec">Your details</h2><dl class="kv"><dt>Email</dt><dd>${esc(u.email || '—')}</dd></dl>
    <form id="dn"><label for="dname">Display name</label><input id="dname" maxlength="80" autocomplete="nickname" value="${esc(st.displayName || '')}">
    <button class="btn alt" type="submit">Save name</button></form></section>
   <section class="panel"><h2 class="sec">My states &amp; organisations</h2><dl class="kv"><dt>States</dt><dd>${esc(stTxt)}</dd><dt>Organisations</dt><dd>${esc(grTxt || '—')}</dd>
    <dt>Reminders</dt><dd>${esc(S.remindDays.join(', '))} days before · entries close ${esc(S.closeDays.join(' / '))}</dd></dl>
    <dl class="kv"><dt>My clubs</dt><dd>${esc(S.myClubs.map(i => (CLUB[i] || {}).name).filter(Boolean).map(n => n + (CLUB[S.homeClub] && CLUB[S.homeClub].name === n ? ' (home)' : '')).join(', ') || '—')}</dd><dt>Watching</dt><dd>${esc(S.watchClubs.map(i => (CLUB[i] || {}).name).filter(Boolean).join(', ') || '—')}</dd></dl>
    <a class="btn alt" href="#/settings">Change in Settings</a><p class="note">Settings and clubs sync to your other devices.</p></section>
   <section class="panel"><h2 class="sec">Sync</h2><p class="sync-st" id="syncSt">${syncTxt}</p>
    <p class="note">${c.saved} saved event${c.saved === 1 ? '' : 's'} · ${c.ent} entr${c.ent === 1 ? 'y' : 'ies'}. Changes save on this device straight away and sync in the background, also after being offline.</p>
    <button class="btn alt" id="syncNow">↻ Sync now</button></section>
   ${isAdmin() || ADMNAV.ok ? `<section class="panel"><h2 class="sec">🛡 Admin</h2><p>You’re an Archery Calendar admin.${ADMNAV.n ? ` <b>${ADMNAV.n} waiting for approval.</b>` : ''}</p><p class="row"><a class="btn gold" href="#/admin">Requests &amp; submissions</a><a class="btn alt" href="#/admin/approved">Approved people</a><a class="btn alt" href="#/admin/scores">Self-reported scores</a><a class="btn alt" href="#/admin/calendars">Calendar uploads</a></p></section>` : ''}
   <section class="panel"><h2 class="sec">Sign out</h2>
    <button class="btn alt block" id="so">Sign out (keep my events on this device)</button>
    <button class="btn alt block" id="soClear">Sign out and remove my events from this device</button>
    <p class="note">Use the second one on a shared or borrowed device.</p></section>
   <section class="panel danger"><h2 class="sec">Delete account and data</h2>
    <p>Permanently deletes your account and everything stored in it (saved events, entries, payments, notes, reminders, settings). This can’t be undone.</p>
    <form id="del"><label for="delc">Type <b>DELETE</b> to confirm</label><input id="delc" autocomplete="off" autocapitalize="characters">
    <label class="chk"><input type="checkbox" id="delLocal" checked> Also remove my events from this device</label>
    <button class="btn danger block" type="submit">🗑 Delete my account and data</button></form></section></div>`;
}
function cardsAcctPanel(){
  const n = MCD.list.length;
  return `<section class="panel mcc-acct"><h2 class="sec">🪪 My membership cards</h2><p>${n ? `${n} card${n === 1 ? '' : 's'} saved on this device.` : 'Keep your Archery Australia, ABA, state, club or other membership cards on your phone to show at the event.'} They work offline${window.SUPABASE_CARD_SYNC ? '' : ' and stay on this device'}.</p>
    <a class="btn gold block" href="#/cards">${n ? 'Show my cards' : '＋ Add a card'}</a></section>`;
}
function bindAccount(){
  const busy = (b, t) => { if (b) { b.disabled = true; b.dataset.t = b.textContent; b.textContent = t; } };
  const f = $('#signin');
  if (f) f.onsubmit = async e => { e.preventDefault(); const em = $('#em').value.trim(), b = f.querySelector('button');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { AUTH.msg = 'Please enter a valid email address.'; return softRenderForce(); }
    busy(b, 'Sending…'); AUTH.msg = '';
    const {error} = await AUTH.client.auth.signInWithOtp({email: em, options: {emailRedirectTo: redirectUrl(), shouldCreateUser: true}});
    if (error) AUTH.msg = /rate|seconds/i.test(error.message) ? 'Too many sign-in emails – please wait a minute and try again.' : error.message; else setSent(em);
    softRenderForce(); if (AUTH.sent) { toast('✉ Sign-in email sent – check your inbox'); const o = $('#otp'); if (o) { o.scrollIntoView({block: 'center'}); o.focus({preventScroll: true}); } } };
  const of = $('#otpf');
  if (of) of.onsubmit = async e => { e.preventDefault(); const tok = $('#otp').value.replace(/\D/g, ''), b = of.querySelector('button');
    if (tok.length < 6) { AUTH.msg = 'Enter the code from the email.'; return softRenderForce(); }
    busy(b, 'Signing in…'); AUTH.msg = '';
    const {error} = await AUTH.client.auth.verifyOtp({email: AUTH.sent, token: tok, type: 'email'});
    if (error) { AUTH.msg = /expired|invalid/i.test(error.message) ? 'That code didn’t work – it may have expired or been used already. Check the newest email, or send a new one.' : /rate|seconds/i.test(error.message) ? 'Too many tries – please wait a minute and try again.' : error.message; return softRenderForce(); }
    await AUTH.chain; setSent(''); toast('✓ Signed in'); location.hash = '#/account'; softRenderForce(); };
  const ag = $('#again'); if (ag) ag.onclick = () => { setSent(''); AUTH.msg = ''; softRenderForce(); };
  const g = $('#google'); if (g) g.onclick = async () => { const {error} = await AUTH.client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: redirectUrl()}}); if (error) { AUTH.msg = error.message; softRenderForce(); } };
  const my = $('#mergeYes'), mn = $('#mergeNo');
  if (my) my.onclick = async () => { busy(my, 'Adding…'); await AUTH.sync.link(AUTH.user, 'merge'); AUTH.ask = false; toast('✓ Added to your account'); softRenderForce(); };
  if (mn) mn.onclick = async () => { busy(mn, 'Loading your account…'); await AUTH.sync.link(AUTH.user, 'account'); AUTH.ask = false; toast('Using your account’s events'); softRenderForce(); };
  const bk = $('#bk'); if (bk) bk.onclick = () => dl(new Blob([JSON.stringify(S, null, 1)], {type: 'application/json'}), 'archery-calendar-backup.json');
  const out = async clear => { await AUTH.client.auth.signOut({scope: 'local'}).catch(() => {}); AUTH.sync.unlink(clear); AUTH.user = null; AUTH.msg = ''; toast(clear ? 'Signed out · removed from this device' : 'Signed out'); location.hash = '#/account'; softRenderForce(); };
  for (const [id, c] of [['so', false], ['so0', false], ['soClear', true]]) { const b = $('#' + id); if (b) b.onclick = () => out(c); }
  const dn = $('#dn'); if (dn) dn.onsubmit = async e => { e.preventDefault(); await AUTH.sync.setDisplayName($('#dname').value); toast('Name saved'); softRenderForce(); };
  const sn = $('#syncNow'); if (sn) sn.onclick = async () => { busy(sn, 'Syncing…'); const r = await AUTH.sync.flush(); toast(r && r.ok ? '✓ Synced' : r && r.skipped === 'offline' ? 'You’re offline – will sync later' : '⚠ Couldn’t sync yet'); softRenderForce(); };
  const del = $('#del'); if (del) del.onsubmit = async e => { e.preventDefault();
    if ($('#delc').value.trim().toUpperCase() !== 'DELETE') { toast('Type DELETE to confirm'); return; }
    const b = del.querySelector('button'), clearLocal = $('#delLocal').checked; busy(b, 'Deleting…');
    if (window.SUPABASE_CARD_SYNC) await cardSyncWipe(AUTH.client, AUTH.user.id).catch(() => {});
    const {error} = await AUTH.client.rpc('delete_my_account');
    if (error) { AUTH.msg = 'Couldn’t delete: ' + error.message + '. Nothing was deleted – try again, or email ' + SITE.contact + '.'; return softRenderForce(); }
    await AUTH.client.auth.signOut({scope: 'local'}).catch(() => {}); AUTH.sync.unlink(clearLocal); AUTH.user = null;
    AUTH.msg = ''; toast('Your account and its data were deleted'); softRenderForce(); };
}
function softRenderForce(){ keepForm(() => { const y = scrollY; render(); scrollTo(0, y); }); }
/* ---------- My membership cards ----------
   Archers keep photos of (or links to) their membership cards to show at the event. Stored ON THIS DEVICE in IndexedDB
   ('archcal-cards'), so they open offline at ranges with no signal. Photos are re-encoded in the browser (max 1600 px JPEG,
   which also drops EXIF/location data) and are never uploaded, logged or made public. Optional private backup to the
   user's account (Supabase Storage, private bucket + RLS) only when window.SUPABASE_CARD_SYNC is switched on – see supabase/membership_cards.sql. */
const CARD_BODIES = [['aa', 'Archery Australia'], ['aba', 'ABA (Australian Bowhunters Association)'], ['state', 'State body (e.g. Archery WA)'], ['ifaa', 'IFAA'],
  ['club', 'Club'], ['usa', 'USA Archery'], ['nfaa', 'NFAA'], ['other', 'Other']];
const CARD_BODY = Object.fromEntries(CARD_BODIES), CARD_MAX = 1600, CARD_BUCKET = 'membership-cards', CARD_DEL_KEY = 'archcal.cardDel', CARD_SYNC_KEY = 'archcal.cardSync';
const MCD = {db: null, list: [], loaded: false, loading: null, edit: null, err: '', urls: [], kind: 'photo', draft: {}};
function cardDb(){
  return MCD.db || (MCD.db = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('This browser can’t store cards on the device.'));
    const r = indexedDB.open('archcal-cards', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('cards')) r.result.createObjectStore('cards', {keyPath: 'id'}); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('Couldn’t open card storage'));
    r.onblocked = () => rej(new Error('Card storage is busy – close other tabs of this site and try again.')); }));
}
async function cardTx(mode, fn){
  const db = await cardDb();
  return new Promise((res, rej) => { const t = db.transaction('cards', mode), req = fn(t.objectStore('cards'));
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Not saved')); });
}
const cardClean = c => { const o = {}; for (const k in c) if (k[0] !== '_') o[k] = c[k]; return o; };
const cardPut = c => cardTx('readwrite', s => s.put(cardClean(c)));
const cardDel = id => cardTx('readwrite', s => s.delete(id));
function cardUrl(img){ if (!img || !img.buf) return ''; const u = URL.createObjectURL(new Blob([img.buf], {type: img.type || 'image/jpeg'})); MCD.urls.push(u); return u; }
async function cardsLoad(force){
  if (MCD.loading && !force) return MCD.loading;
  return MCD.loading = (async () => {
    try { const all = await cardTx('readonly', s => s.getAll()); MCD.urls.forEach(u => URL.revokeObjectURL(u)); MCD.urls = [];
      MCD.list = (all || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); MCD.list.forEach(c => { c._f = cardUrl(c.front); c._b = cardUrl(c.back); }); MCD.err = ''; }
    catch (e) { MCD.err = (e && e.message) || 'Couldn’t open card storage'; MCD.list = []; }
    MCD.loaded = true; updateCardsNav(); return MCD.list; })();
}
function updateCardsNav(){ const a = $('#navCards'); if (!a) return; a.hidden = false; a.classList.toggle('on', (location.hash || '').startsWith('#/cards')); }
async function cardImg(file){   // File -> {type, buf, w, h}: JPEG, longest side <= 1600 px, metadata (EXIF/GPS) dropped by re-encoding
  if (!file) return null;
  if (file.size > 40 * 1024 * 1024) throw new Error('That photo is too big. Try a smaller one or a screenshot.');
  let src, w, h, url;
  try { src = await createImageBitmap(file); w = src.width; h = src.height; }
  catch { url = URL.createObjectURL(file); src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Couldn’t read that photo. Try a JPG or PNG, or take a screenshot of the card.')); i.src = url; }); w = src.naturalWidth; h = src.naturalHeight; }
  try { const k = Math.min(1, CARD_MAX / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)); if (!blob) throw new Error('Couldn’t process that photo.');
    return {type: 'image/jpeg', buf: await blob.arrayBuffer(), w: c.width, h: c.height}; }
  finally { if (url) URL.revokeObjectURL(url); if (src && src.close) src.close(); }
}
const cardLinkOk = u => { try { const x = new URL(u); return x.protocol === 'https:' && !!x.hostname; } catch { return false; } };
const cardSyncAvail = () => !!(window.SUPABASE_CARD_SYNC && AUTH.on && AUTH.client && AUTH.user);
const cardSyncOn = () => cardSyncAvail() && localStorage.getItem(CARD_SYNC_KEY) === '1';
function cardShow(id, side){
  const c = MCD.list.find(x => x.id === id); if (!c) return; const u = side === 'back' ? c._b : c._f; if (!u) return;
  lbOpen(u, `${c.label}${side === 'back' ? ' (back)' : ''}`, {light: true, noFull: true, cap: c.number ? `No. ${c.number}` : '',
    hint: 'Turn your screen brightness up · pinch to zoom · tap ✕ or swipe back to close'});
}
function vCards(){
  setTitle('My membership cards');
  if (!MCD.loaded) { cardsLoad().then(() => { if (document.body.dataset.page === 'cards') softRender(); }); }
  const head = pageHead('My membership cards', 'Show your membership card at the event. Saved on this device – works with no signal.', 'target');
  const sync = cardSyncAvail() ? `<section class="panel"><h2 class="sec">Back up to my account</h2><label class="chk"><input type="checkbox" id="mcSync" ${cardSyncOn() ? 'checked' : ''}> Keep a private copy of my cards in my account, so they’re on my other devices</label>
    <p class="note">Only you can open them (private storage locked to your account). Off by default.</p>${MCD.syncMsg ? `<p class="note">${esc(MCD.syncMsg)}</p>` : ''}</section>` : '';
  const list = !MCD.loaded ? '<p class="loading">Loading your cards…</p>' : MCD.list.length ? MCD.list.map((c, i) => `<article class="mcc" data-mc="${esc(c.id)}">
      <div class="mcc-top"><span class="mcc-body mcc-${esc(c.body)}">${esc(CARD_BODY[c.body] || 'Other')}</span><h2 class="mcc-name">${esc(c.label)}</h2>
      ${c.number ? `<p class="mcc-num"><span>Member no.</span> <b>${esc(c.number)}</b></p>` : ''}</div>
      ${c.kind === 'link' ? `<a class="btn gold block mcc-link" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">🪪 Open my card on the official site ↗</a><p class="note">${esc((() => { try { return new URL(c.link).hostname; } catch { return ''; } })())} · needs signal</p>`
        : `<div class="mcc-imgs"><button type="button" class="mcc-img" data-mcshow="${esc(c.id)}" data-side="front" aria-label="Show ${esc(c.label)} full screen">${c._f ? `<img src="${esc(c._f)}" alt="${esc(c.label)} – front">` : '<span>No photo</span>'}</button>
          ${c._b ? `<button type="button" class="mcc-img mcc-back" data-mcshow="${esc(c.id)}" data-side="back" aria-label="Show the back of ${esc(c.label)}"><img src="${esc(c._b)}" alt="${esc(c.label)} – back"><span>Back</span></button>` : ''}</div>
          <button type="button" class="btn gold block" data-mcshow="${esc(c.id)}" data-side="front">🔆 Show full screen</button>`}
      <div class="mcc-ctl"><button type="button" class="btn alt sm" data-mcup="${i}" ${i ? '' : 'disabled'} aria-label="Move ${esc(c.label)} up">↑</button><button type="button" class="btn alt sm" data-mcdn="${i}" ${i < MCD.list.length - 1 ? '' : 'disabled'} aria-label="Move ${esc(c.label)} down">↓</button>
        <button type="button" class="btn alt sm" data-mcedit="${esc(c.id)}">✎ Edit</button><button type="button" class="btn alt sm danger-t" data-mcdel="${esc(c.id)}">🗑 Delete</button></div></article>`).join('')
    : `<div class="empty">No cards yet. Add a photo of your Archery Australia, ABA, state, club or other membership card, or a link to your digital card.</div>`;
  return `${head}<div class="wrap narrow cards-page">${MCD.err ? `<div class="warn" role="alert">⚠ ${esc(MCD.err)}</div>` : ''}
    ${MCD.edit !== null ? cardForm() : `<button type="button" class="btn gold block mcc-addbig" id="mcAdd">＋ Add card</button>`}
    <div class="mcc-list">${list}</div>${sync}
    <section class="panel"><h2 class="sec">🔒 Private to you</h2><ul class="ticks">
      <li>Card photos stay on this device. They’re not uploaded or shown on the site${window.SUPABASE_CARD_SYNC ? ' unless you turn on the private backup above' : ''}.</li>
      <li>Photos are shrunk and saved without their hidden location data.</li>
      <li>Anyone who can open this app on your phone can see them – lock your phone.</li>
      <li>Add the site to your home screen so your cards are one tap away at the range.</li></ul>
      ${MCD.list.length ? `<button type="button" class="linkbtn" id="mcWipe">Delete all cards from this device</button>` : ''}</section></div>`;
}
/* Add-card flow: 1) pick the organisation (logos)  2) Take photo / Choose from photos / Paste link  3) name + number, save.
   Member-login links verified 11 Oct 2026 against each body's own site; bodies without a verified link get none. */
const CARD_LOGO = {aa: 'img/clubs/archery-australia-sm.webp', aba: 'img/logos/aba-logo-64.png', state: 'img/clubs/archery-wa-sm.webp', ifaa: 'img/clubs/intl-ifaa-sm.webp',
  usa: 'img/clubs/us-usa-archery-sm.webp', nfaa: 'img/clubs/us-nfaa-sm.webp'};
const CARD_ICON = {club: '🏠', other: '🪪'};
const ASSEMBLE = {url: 'https://account.archery.assemblesports.io/login', name: 'Assemble Sports member login',
  tip: 'Archery Australia memberships (and state bodies such as Archery WA) are held in Assemble Sports. Log in → your profile → Registration History → ⋯ on your membership to see your card or add it to your phone wallet. A screenshot of the card works with no signal.'};
const CARD_PORTAL = {
  aa: ASSEMBLE, state: ASSEMBLE,
  aba: {url: 'https://members.bowhunters.org.au/', name: 'ABA members area', tip: 'Log in to the ABA members area (ABA’s own member site). A photo of your ABA card works with no signal.'},
  usa: {url: 'https://www.usarchery.org/dashboard/login', name: 'USA Archery member dashboard', tip: 'Log in to your USA Archery member dashboard to find your membership.'},
  nfaa: {url: 'https://nfaausa.sport80.com/', name: 'NFAA membership login (Sport:80)', tip: 'NFAA emails your digital card as a PDF when you join – a screenshot of it works with no signal.'}};
const cardLogo = (k, n = 40) => CARD_LOGO[k] ? `<img src="${CARD_LOGO[k]}" alt="" width="${n}" height="${n}" loading="lazy">` : `<span class="mcc-ico" aria-hidden="true">${CARD_ICON[k] || '🪪'}</span>`;
/* Archery Australia / state bodies: Assemble Sports puts the membership card in the phone wallet (AA guide 'Assemble Sports Membership Card – Digital',
   Apr 2026: Registration History → ⋯ → Add to Apple Wallet; Assemble Sports, Jul 2026: Apple and Google Wallet, Member → Details → Add to Wallet,
   availability depends on the device). Lead with that; a photo/link copy here is the second option. */
const WALLET_BODIES = ['aa', 'state'];
const walletPanel = body => `<div class="mcc-wallet" id="mcWallet"><h3>📲 Add your ${body === 'aa' ? 'AA' : 'membership'} card to Apple Wallet</h3>
  <p>Archery Australia memberships${body === 'state' ? ' (and state bodies such as Archery WA)' : ''} live in Assemble Sports, and Assemble can put your card straight into your phone’s wallet.</p>
  <ol><li>Log in to Assemble Sports on your phone.</li><li>Open your profile → <b>Registration History</b> and find your current membership.</li>
    <li>Tap the <b>⋯</b> (three dots) on it → <b>Add to Apple Wallet</b>.</li></ol>
  <p class="note">On Android, Assemble also offers <b>Google Wallet</b> (it depends on your phone). Renewed? Remove the old card from your wallet and add it again.</p>
  <a class="btn gold block" href="${esc(ASSEMBLE.url)}" target="_blank" rel="noopener noreferrer">${cardLogo('aa', 24)} Log in to Assemble Sports ↗</a></div>`;
function cardForm(){
  const old = MCD.edit && MCD.edit !== 'new' ? MCD.list.find(x => x.id === MCD.edit) || null : null, d = MCD.draft;
  const step = d.step || (old ? 'details' : 'body'), body = d.body || (old && old.body) || '', kind = d.kind || (old && old.kind) || 'photo';
  const cancel = `<button class="btn alt" type="button" id="mcCancel">Cancel</button>`;
  if (step === 'body') return `<section class="panel mcc-form" id="mcForm"><h2 class="sec">Add a card · 1 of 3</h2><p class="mcc-q">Which organisation is the card from?</p>
    <div class="mcc-pick">${CARD_BODIES.map(([k, n]) => `<button type="button" class="mcc-opt" data-mcbody="${k}">${cardLogo(k)}<span>${esc(n)}</span></button>`).join('')}</div>
    <div class="mcc-ctl">${cancel}</div></section>`;
  const bn = esc(CARD_BODY[body] || 'Other'), portal = CARD_PORTAL[body];
  if (step === 'method') return `<section class="panel mcc-form" id="mcForm"><h2 class="sec">Add a card · 2 of 3</h2><p class="mcc-chosen">${cardLogo(body, 32)} <b>${bn}</b> <button type="button" class="linkbtn" data-mcstep="body">change</button></p>
    ${WALLET_BODIES.includes(body) ? walletPanel(body) : ''}
    <p class="mcc-q">${WALLET_BODIES.includes(body) ? 'Or save a copy here' : 'How do you want to add it?'}</p>
    <div class="mcc-pick mcc-ways"><label class="mcc-opt" for="mcCam"><span class="mcc-ico">📷</span><span>Take photo</span></label><input id="mcCam" class="mcc-file" type="file" accept="image/*" capture="environment">
      <label class="mcc-opt" for="mcLib"><span class="mcc-ico">🖼</span><span>Choose from photos</span></label><input id="mcLib" class="mcc-file" type="file" accept="image/*">
      <button type="button" class="mcc-opt" data-mckind="link"><span class="mcc-ico">🔗</span><span>Paste link</span></button></div>
    <p class="note">A photo or screenshot works with no signal. A link needs signal.</p><p class="err sum" id="mcErr" role="alert"></p>
    <div class="mcc-ctl">${cancel}</div></section>`;
  const v = k => esc(d[k] ?? (old && old[k]) ?? '');
  const front = 'front' in d ? d.front : old && old.front, back = d.noBack ? null : 'back' in d ? d.back : old && old.back;
  const fu = front ? cardUrl(front) : '', bu = back ? cardUrl(back) : '';
  const label = d.label ?? (old ? old.label : ({aa: 'Archery Australia', aba: 'ABA', ifaa: 'IFAA', usa: 'USA Archery', nfaa: 'NFAA'}[body] || ''));
  return `<form class="panel mcc-form" id="mcForm" novalidate><h2 class="sec">${old ? 'Edit card' : 'Add a card · 3 of 3'}</h2>
    <p class="mcc-chosen">${cardLogo(body, 32)} <b>${bn}</b> <button type="button" class="linkbtn" data-mcstep="body">change</button></p>
    ${kind === 'photo' ? `<div class="mcc-shots"><figure>${fu ? `<img class="mcc-prev" src="${esc(fu)}" alt="Front of the card">` : '<span class="mcc-none">No photo yet</span>'}<figcaption>Front</figcaption>
        <label class="btn alt sm" for="mcFrontCam">📷 ${fu ? 'Retake' : 'Take photo'}</label><input id="mcFrontCam" class="mcc-file" type="file" accept="image/*" capture="environment">
        <label class="btn alt sm" for="mcFrontLib">🖼 ${fu ? 'Change' : 'Choose'}</label><input id="mcFrontLib" class="mcc-file" type="file" accept="image/*"></figure>
      <figure>${bu ? `<img class="mcc-prev" src="${esc(bu)}" alt="Back of the card">` : '<span class="mcc-none">Optional</span>'}<figcaption>Back</figcaption>
        <label class="btn alt sm" for="mcBackCam">📷 ${bu ? 'Retake' : 'Take'}</label><input id="mcBackCam" class="mcc-file" type="file" accept="image/*" capture="environment">
        <label class="btn alt sm" for="mcBackLib">🖼 ${bu ? 'Change' : 'Choose'}</label><input id="mcBackLib" class="mcc-file" type="file" accept="image/*">
        ${bu ? `<button type="button" class="btn alt sm danger-t" id="mcNoBack">Remove</button>` : ''}</figure></div>
      <button type="button" class="linkbtn" data-mckind="link">Use a link instead</button>`
    : `<div class="mcc-linkbox">${portal ? `<p class="mcc-q">1. Open your member site and find your card:</p><a class="btn gold block" href="${esc(portal.url)}" target="_blank" rel="noopener noreferrer">${cardLogo(body, 24)} ${esc(portal.name)} ↗</a><p class="note">${esc(portal.tip)}</p><p class="mcc-q">2. Copy the link to your card and paste it here:</p>`
        : `<p class="mcc-q">Paste the link to your digital card or member page from your organisation’s own site:</p>`}
      <label for="mcLink">Card link</label><div class="mcc-paste"><input id="mcLink" type="url" inputmode="url" maxlength="500" placeholder="https://…" value="${v('link')}">${navigator.clipboard && navigator.clipboard.readText ? `<button type="button" class="btn alt sm" id="mcPasteBtn">📋 Paste</button>` : ''}</div>
      <button type="button" class="linkbtn" data-mckind="photo">Use a photo instead</button></div>`}
    <label for="mcLabel">Card name</label><input id="mcLabel" maxlength="80" required placeholder="e.g. Archery WA 2026 or My club card" value="${esc(label)}">
    <label for="mcNum">Member number <small>(optional)</small></label><input id="mcNum" maxlength="40" autocomplete="off" value="${v('number')}">
    <p class="err sum" id="mcErr" role="alert"></p>
    <div class="mcc-ctl"><button class="btn gold" type="submit" id="mcSave">✓ Save card</button>${cancel}</div></form>`;
}
function bindMCards(){
  const r = () => softRenderForce(), d = () => MCD.draft;
  const add = $('#mcAdd'); if (add) add.onclick = () => { MCD.edit = 'new'; MCD.draft = {step: 'body'}; r(); const f = $('#mcForm'); if (f) f.scrollIntoView({block: 'start'}); };
  document.querySelectorAll('[data-mcshow]').forEach(b => b.onclick = () => cardShow(b.dataset.mcshow, b.dataset.side));
  document.querySelectorAll('[data-mcedit]').forEach(b => b.onclick = () => { MCD.edit = b.dataset.mcedit; MCD.draft = {}; r(); scrollTo(0, 0); });
  document.querySelectorAll('[data-mcdel]').forEach(b => b.onclick = async () => { const c = MCD.list.find(x => x.id === b.dataset.mcdel); if (!c || !confirm(`Delete “${c.label}” from this device?`)) return;
    await cardDel(c.id); cardQueueDel(c.id); await cardsLoad(true); toast('Card deleted'); r(); cardSyncSoon(); });
  const move = async (i, j) => { const a = MCD.list[i], b = MCD.list[j]; if (!a || !b) return; const now = Date.now();
    MCD.list.forEach((c, k) => c.order = k); [a.order, b.order] = [j, i]; a.updated = b.updated = now; for (const c of MCD.list) await cardPut(c); await cardsLoad(true); r(); cardSyncSoon(); };
  document.querySelectorAll('[data-mcup]').forEach(b => b.onclick = () => move(+b.dataset.mcup, +b.dataset.mcup - 1));
  document.querySelectorAll('[data-mcdn]').forEach(b => b.onclick = () => move(+b.dataset.mcdn, +b.dataset.mcdn + 1));
  const wipe = $('#mcWipe'); if (wipe) wipe.onclick = async () => { if (!confirm('Delete all your membership cards from this device?')) return; for (const c of MCD.list) { await cardDel(c.id); cardQueueDel(c.id); } await cardsLoad(true); toast('Cards deleted from this device'); r(); cardSyncSoon(); };
  const sy = $('#mcSync'); if (sy) sy.onchange = () => { localStorage.setItem(CARD_SYNC_KEY, sy.checked ? '1' : '0'); MCD.syncMsg = ''; if (sy.checked) cardSyncSoon(10); else r(); };
  const f = $('#mcForm'); if (!f) return;
  const keep = () => { const g = id => { const e = $('#' + id); return e ? e.value : undefined; }; for (const [k, id] of [['label', 'mcLabel'], ['number', 'mcNum'], ['link', 'mcLink']]) { const x = g(id); if (x !== undefined) d()[k] = x; } };
  const err = m => { const e = $('#mcErr'); if (e) e.textContent = m; };
  const go = o => { keep(); Object.assign(MCD.draft, o); r(); const nf = $('#mcForm'); if (nf && nf.getBoundingClientRect().top < 0) nf.scrollIntoView({block: 'start'}); };
  $('#mcCancel').onclick = () => { MCD.edit = null; MCD.draft = {}; r(); };
  f.querySelectorAll('[data-mcbody]').forEach(b => b.onclick = () => go({body: b.dataset.mcbody, step: MCD.edit === 'new' ? 'method' : 'details'}));
  f.querySelectorAll('[data-mcstep]').forEach(b => b.onclick = () => go({step: b.dataset.mcstep}));
  f.querySelectorAll('[data-mckind]').forEach(b => b.onclick = () => go({kind: b.dataset.mckind, step: 'details'}));
  const photo = (id, side, extra) => { const i = $('#' + id); if (!i) return; i.onchange = async () => { const file = i.files[0]; if (!file) return; keep(); err('Processing photo…');
    try { const img = await cardImg(file); go(Object.assign({[side]: img, kind: 'photo', step: 'details'}, side === 'back' ? {noBack: false} : {}, extra)); } catch (x) { err((x && x.message) || 'Couldn’t read that photo.'); } }; };
  photo('mcCam', 'front'); photo('mcLib', 'front'); photo('mcFrontCam', 'front'); photo('mcFrontLib', 'front'); photo('mcBackCam', 'back'); photo('mcBackLib', 'back');
  const nb = $('#mcNoBack'); if (nb) nb.onclick = () => go({noBack: true, back: null});
  const pb = $('#mcPasteBtn'); if (pb) pb.onclick = async () => { try { const t = (await navigator.clipboard.readText() || '').trim(); if (t) { $('#mcLink').value = t; err(cardLinkOk(t) ? '' : 'That doesn’t look like a full https:// link.'); } else err('Nothing to paste – copy the card link first.'); } catch { err('Couldn’t paste – long-press in the box and choose Paste.'); } };
  if (f.tagName !== 'FORM') return;
  f.onsubmit = async e => { e.preventDefault(); keep(); const dd = d(), btn = $('#mcSave'), old = MCD.edit !== 'new' ? MCD.list.find(x => x.id === MCD.edit) : null;
    const kind = dd.kind || (old && old.kind) || 'photo', body = dd.body || (old && old.body) || 'other';
    const label = (dd.label ?? '').trim(), number = (dd.number ?? '').trim(), link = (dd.link ?? '').trim();
    const front = 'front' in dd ? dd.front : old && old.front, back = dd.noBack ? null : 'back' in dd ? dd.back : old && old.back;
    if (!label) return err('Give the card a name, e.g. “Archery WA 2026”.');
    if (kind === 'link' && !cardLinkOk(link)) return err('Paste the full link to your card, starting with https://');
    if (kind === 'photo' && !front) return err('Add a photo of the front of the card.');
    btn.disabled = true; btn.textContent = 'Saving…'; err('');
    try {
      const c = {id: old ? old.id : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), body, label, number, kind,
        link: kind === 'link' ? link : '', front: kind === 'photo' ? front : null, back: kind === 'photo' ? back || null : null,
        order: old ? old.order : (MCD.list.length ? Math.max(...MCD.list.map(x => x.order ?? 0)) + 1 : 0), created: old ? old.created : Date.now(), updated: Date.now()};
      await cardPut(c); if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      MCD.edit = null; MCD.draft = {}; await cardsLoad(true); toast('✓ Card saved on this device'); r(); cardSyncSoon();
    } catch (x) { btn.disabled = false; btn.textContent = '✓ Save card'; err((x && x.message) || 'Couldn’t save the card.'); }
  };
}
/* ----- optional private backup (behind window.SUPABASE_CARD_SYNC; needs supabase/membership_cards.sql run first) ----- */
function cardQueueDel(id){ if (!window.SUPABASE_CARD_SYNC) return; const q = new Set(JSON.parse(localStorage.getItem(CARD_DEL_KEY) || '[]')); q.add(id); localStorage.setItem(CARD_DEL_KEY, JSON.stringify([...q])); }
function cardSyncSoon(ms = 1500){ if (!cardSyncOn()) return; clearTimeout(cardSyncSoon.t); cardSyncSoon.t = setTimeout(async () => {
  const r = await cardSync(AUTH.client, AUTH.user.id).catch(e => ({error: e && e.message}));
  MCD.syncMsg = r.error ? `⚠ Backup not done yet (${r.error}). We’ll try again.` : `✓ Backed up${r.pulled ? ` · ${r.pulled} card${r.pulled === 1 ? '' : 's'} added from your account` : ''}`;
  if (r.pulled) await cardsLoad(true); if (document.body.dataset.page === 'cards') softRender(); }, ms); }
async function cardSync(client, uid, opts = {}){   // two-way, last change wins; images go to the PRIVATE bucket under <uid>/<card id>/
  if (!navigator.onLine && !opts.force) return {skipped: 'offline'};
  const B = client.storage.from(CARD_BUCKET), T = () => client.from('membership_cards'), path = (id, s) => `${uid}/${id}/${s}.jpg`;
  const local = await cardTx('readonly', s => s.getAll()) || [], byId = Object.fromEntries(local.map(c => [c.id, c]));
  const dels = JSON.parse(localStorage.getItem(CARD_DEL_KEY) || '[]');
  for (const id of dels) {
    await B.remove([path(id, 'front'), path(id, 'back')]);
    const {error} = await T().upsert({user_id: uid, card_id: id, deleted: true, body: null, label: null, number: null, link: null, has_front: false, has_back: false, updated_at: new Date().toISOString()}, {onConflict: 'user_id,card_id'});
    if (error) throw new Error(error.message);
  }
  localStorage.setItem(CARD_DEL_KEY, '[]');
  const {data: rows, error} = await T().select('*'); if (error) throw new Error(error.message);
  const rem = Object.fromEntries((rows || []).map(x => [x.card_id, x])); let pushed = 0, pulled = 0, removed = 0;
  for (const c of local) {
    const x = rem[c.id], t = x ? Date.parse(x.updated_at) : 0;
    if (x && t >= (c.updated || 0)) continue;
    for (const s of ['front', 'back']) {
      if (c[s] && c[s].buf) { const {error: e} = await B.upload(path(c.id, s), new Blob([c[s].buf], {type: 'image/jpeg'}), {upsert: true, contentType: 'image/jpeg', cacheControl: '0'}); if (e) throw new Error(e.message); }
      else if (x && x['has_' + s]) await B.remove([path(c.id, s)]);
    }
    const {error: e} = await T().upsert({user_id: uid, card_id: c.id, deleted: false, body: c.body, label: c.label, number: c.number || null, link: c.link || null, kind: c.kind,
      sort: c.order ?? 0, has_front: !!(c.front && c.front.buf), has_back: !!(c.back && c.back.buf), updated_at: new Date(c.updated || Date.now()).toISOString()}, {onConflict: 'user_id,card_id'});
    if (e) throw new Error(e.message); pushed++;
  }
  for (const x of rows || []) {
    const c = byId[x.card_id], t = Date.parse(x.updated_at);
    if (c && (c.updated || 0) >= t) continue;
    if (x.deleted) { if (c) { await cardDel(c.id); removed++; } continue; }
    const img = async s => { if (!x['has_' + s]) return null; const {data, error: e} = await B.download(path(x.card_id, s)); if (e || !data) throw new Error((e && e.message) || 'download failed'); return {type: 'image/jpeg', buf: await data.arrayBuffer()}; };
    await cardPut({id: x.card_id, body: x.body || 'other', label: x.label || 'Card', number: x.number || '', kind: x.kind || (x.link ? 'link' : 'photo'), link: x.link || '',
      front: await img('front'), back: await img('back'), order: x.sort ?? 0, created: t, updated: t}); pulled++;
  }
  return {pushed, pulled, removed};
}
async function cardSyncWipe(client, uid){   // before "Delete account": remove this user's card files from the private bucket
  const {data: rows} = await client.from('membership_cards').select('card_id'); const paths = [];
  (rows || []).forEach(x => paths.push(`${uid}/${x.card_id}/front.jpg`, `${uid}/${x.card_id}/back.jpg`));
  if (paths.length) await client.storage.from(CARD_BUCKET).remove(paths);
}
/* ---------- Fans: community photo wall ----------
   Photos come from data/fans.json (added by hand after review). "Send us your photo" posts to FormSubmit like the event form;
   big or non-JPEG photos are shrunk in the browser first (max 2400 px JPEG) so they fit the email. */
let FANS = null;
const FAN_MAX_MB = 8;
function loadFans(){ return FANS ? Promise.resolve(FANS) : fetch('data/fans.json').then(r => r.json()).then(j => (FANS = j.photos || [])).catch(() => (FANS = [])); }
function vFans(){
  setTitle('Fans');
  const hc0 = homeCode(), head = pageHead('Fans', 'Photos from the archery community: podiums, club days and events. Send us yours.', hc0 !== 'AUS' && PH[cHero(hc0)] ? cHero(hc0) : 'field');
  if (!FANS) { loadFans().then(() => { if (document.body.dataset.page === 'fans') softRenderForce(); }); return `${head}<div class="wrap"><p class="loading">Loading photos…</p></div>`; }
  const sent = /(?:^|[?&])fsent=1/.test(location.search);
  if (sent) history.replaceState(null, '', location.pathname + '#/fans');
const fdate = d => !d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(d) ? pd(d).toLocaleDateString(LOC(), {day: 'numeric', month: 'short', year: 'numeric'}) : d;
  const hc = homeCode(), FW = FANS.map((f, i) => [f, i]).filter(([f]) => (f.country || 'AUS') === hc), nHere = FW.length, cnm = hc === 'AUS' ? 'Australia' : hc === 'WORLD' ? '' : iName(hc), cthe = /^(United|Netherlands)/.test(cnm) ? 'the ' : '';   // each country shows only its own fan photos (photo.country, default AUS)
  const wall = FW.map(([f, i]) => `<figure class="fan"><button type="button" class="fan-img" data-zoom="${i}" aria-label="Enlarge: ${esc(f.caption)}"><img src="${esc(f.sm)}" alt="${esc(f.alt || f.caption)}" loading="lazy" width="${f.w ? 480 : ''}" height="${f.w ? Math.round(480 * f.h / f.w) : ''}"><span class="zoom" aria-hidden="true">⤢ Enlarge</span></button>
    <figcaption><b>${esc(f.caption)}</b>${[f.credit && '📷 ' + f.credit, f.event, fdate(f.date)].filter(Boolean).length ? `<span class="fan-meta">${esc([f.credit && '📷 ' + f.credit, f.event, fdate(f.date)].filter(Boolean).join(' · '))}</span>` : ''}</figcaption></figure>`).join('');
  const fld = (id, lab, inp, hint = '', req = true) => `<div class="fld" data-f="${id}"><label for="${id}">${lab}${req ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>${inp}${hint ? `<p class="hint">${hint}</p>` : ''}<p class="err" id="${id}_e" role="alert"></p></div>`;
  return `${head}<div class="wrap fans">
  ${sent ? `<section class="panel thanks" id="fanThanks" tabindex="-1"><span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Thanks, we’ve got your photo</h2><p>We check every photo before it goes up, usually within a few days. We’ll email you if we have a question.</p></section>` : ''}
  ${nHere ? `<p class="fan-add-top"><a class="btn gold" href="#send" data-fansend>📷 Add your fan photo</a></p><div class="fan-wall">${wall}</div>` : `<section class="panel fan-empty"><h2 class="sec-h">No fan photos from ${cnm ? cthe + esc(cnm) : 'your country'} yet</h2><p>Be the first: podiums, club days, a great shot on the course. It takes a minute, like adding an event, and we check every photo before it goes up.</p><p><a class="btn gold big-btn" href="#send" data-fansend>📷 Add your fan photo</a></p></section>`}
  <p class="note fan-rm">In a photo and want it removed? Email <a href="mailto:${esc(SITE.contact)}?subject=${encodeURIComponent('Photo removal – Archery Calendar Fans page')}">${esc(SITE.contact)}</a> and we’ll take it down.</p>
  <section class="panel sub fan-send" id="send"><h2 class="sec">📷 Send us your photo</h2>
   <ul class="ticks"><li>Podiums, club days, a great shot on the course – archery photos from ${cnm ? cthe + esc(cnm) : 'your country'}.</li><li>Every photo is <b>reviewed before it’s posted</b>. We may crop or resize it.</li><li>Fields marked <span class="req">*</span> are required.</li></ul>
   <form id="fanForm" class="sub-form" method="POST" enctype="multipart/form-data" action="${esc(SITE.formEndpoint || '')}" novalidate>
    <input type="hidden" name="_subject" value="Fan photo – Archery Calendar"><input type="hidden" name="_template" value="table"><input type="hidden" name="_next" value="">
    <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="hidden" name="_captcha" value="false">
    <div class="grid2">${fld('f_name', 'Your name', `<input id="f_name" name="name" required maxlength="80" autocomplete="name">`, 'Shown as the photo credit.')}
    ${fld('f_email', 'Your email', `<input id="f_email" name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email">`, 'Not published.')}</div>
    ${fld('f_file', 'Photo', `<input id="f_file" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic" required><div class="fan-prev" id="f_prev" hidden aria-live="polite"><div class="fan-prev-box"><img id="f_prev_img" alt="Preview of the photo you chose"><p class="fan-prev-na" id="f_prev_na" hidden>Preview not available, photo will still be sent.</p></div><p class="fan-prev-meta"><span id="f_prev_n"></span> <button type="button" class="linkbtn" id="f_prev_x">Remove photo</button></p></div>`, `JPG, PNG or phone photo, up to ${FAN_MAX_MB} MB.`)}
    ${fld('f_ctry', 'Country', `<input id="f_ctry" name="country" required maxlength="60" autocomplete="country-name" value="${esc(cnm)}">`, 'Change it if the photo is from somewhere else.')}
    ${fld('f_cap', 'Caption', `<input id="f_cap" name="caption" required maxlength="200" placeholder="e.g. Our juniors at the Gosnells club champs">`)}
    <div class="grid2">${fld('f_event', 'Event or club', `<input id="f_event" name="event_or_club" maxlength="140">`, '', false)}
    ${fld('f_date', 'Date taken', `<input id="f_date" name="date_taken" type="date" max="${iso(today())}">`, '', false)}</div>
    <div class="fld consent" data-f="f_ok"><label class="chk tick"><input type="checkbox" id="f_ok" name="consent" value="Yes – took the photo or has permission; everyone pictured is happy for it to be shown" required><span>I took this photo or have permission to share it, and everyone pictured is happy for it to be shown. <span class="req" aria-hidden="true">*</span></span></label><p class="err" id="f_ok_e" role="alert"></p></div>
    <p class="note">👪 <b>Under 18s:</b> we only post photos of archers under 18 with a parent or guardian’s consent. If a child is pictured, please tell us in the caption that their parent/guardian agreed (or send it from the parent’s email).</p>
    <p class="note priv">🔒 Your name, email and photo are emailed to us (${esc(SITE.contact)}, NFS Strategic Holdings) via FormSubmit. Only the photo, caption and your name as credit are published, and only if we approve it. <a href="#/privacy">Privacy</a></p>
    <p class="err sum" id="fanErr" role="alert"></p>
    <button class="btn gold block" id="fanBtn" type="submit">Send my photo</button>
   </form></section></div>
  <dialog id="lb" class="lb" aria-label="Photo"><form method="dialog"><button class="lb-x" aria-label="Close">✕</button></form><img id="lbImg" alt=""><p id="lbCap"></p></dialog>`;
}
async function shrinkPhoto(file){   // -> File (JPEG, max 2400 px) or the original if the browser can't decode it
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {type: 'image/jpeg'}) : file;
  } catch { return file; }
}
/* "Sending as" card for Fans + Fix forms: prefill from remembered submit details (S.subMe) and the signed-in email,
   hide those fields behind a card with ✏️ Change. Hidden fields still submit and validate (errors re-open them). */
function sendAsCard(fm, map, roleP){
  const keyOf = {name: 's_name', email: 's_email', club: 's_club'};
  fm.addEventListener('change', e => { const k = Object.keys(map).find(k => map[k] === e.target.id); if (k) rememberMe({[keyOf[k]]: e.target.value.trim()});
    if (roleP && (e.target.id === roleP + '_role' || e.target.id === roleP + '_role_other')) rememberMe({s_role: ($('#' + roleP + '_role') || {}).value, s_role_other: ($('#' + roleP + '_role_other') || {}).value}); });
  sendAsCardInner(fm, map, roleP);
}
function sendAsCardInner(fm, map, roleP){
  const m = S.subMe || {}, acct = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.email) || '';
  const acctName = acct ? (myName() || acct.split('@')[0]) : '';
  const src = {name: m.s_name || acctName, email: acct || m.s_email || '', club: m.s_club || '', role: m.s_role || '', role_other: m.s_role_other || ''};
  Object.entries(map).forEach(([k, id]) => { if (k === 'posting') return; const el = $('#' + id); if (el && src[k] && (!el.value || k === 'club')) el.value = src[k];  /* your own club beats the event's host club */ });
  if (roleP && src.role) { const r = $('#' + roleP + '_role'); if (r && !r.value) { r.value = src.role; const o = $('#' + roleP + '_role_other'); if (o) o.value = src.role_other; r.dispatchEvent(new Event('change', {bubbles: true})); } }
  const ids = Object.entries(map).filter(([k]) => k !== 'posting').map(([, v]) => v).concat(roleP ? [roleP + '_role'] : []), wraps = [...new Set(ids.map(id => { const el = $('#' + id); return el && (el.closest('.grid2') || el.closest('.fld')); }).filter(Boolean))];
  if (!ids.every(id => { const el = $('#' + id); return el && el.value.trim(); })) return;
  const card = document.createElement('div'); card.className = 'vcard me-card';
  const who = $('#' + map.name).value, em = $('#' + map.email).value, cl = map.club ? $('#' + map.club).value : '', rl = roleP ? roleVal(roleP) : '';
  card.innerHTML = map.posting ? `<div><span>Posting as <b>${esc(who)}</b> · ${esc(em)}</span></div><div class="me-btns"><button type="button" class="btn sm">Change</button></div>` : `<div><span>Sending as <b>${esc(who)}</b>${rl ? ', ' + esc(rl) : ''}${cl ? ' – ' + esc(cl) : ''} · ${esc(em)}</span></div><div class="me-btns"><button type="button" class="btn sm">✏️ Change</button></div>`;
  wraps[0].before(card); const show = on => { card.hidden = !on; wraps.forEach(w => w.hidden = on); };
  card.querySelector('button').onclick = () => show(false); show(true);
  fm.addEventListener('submit', () => setTimeout(() => { if (wraps.some(w => w.querySelector('.bad, [aria-invalid=true]'))) show(false); }), true);
}
const rememberMe = o => { S.subMe = Object.assign({}, S.subMe || {}, Object.fromEntries(Object.entries(o).filter(([, v]) => v))); save(); };
function bindFans(){
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { const f = FANS[+b.dataset.zoom], d = $('#lb');
    $('#lbImg').src = f.file; $('#lbImg').alt = f.alt || f.caption; $('#lbCap').textContent = f.caption + (f.credit ? ' · 📷 ' + f.credit : ''); d.showModal ? d.showModal() : d.setAttribute('open', ''); });
  const lb = $('#lb'); if (lb) lb.onclick = e => { if (e.target === lb) lb.close(); };
  const t = $('#fanThanks'); if (t) t.focus();
  document.querySelectorAll('[data-fansend]').forEach(a => a.onclick = e => { e.preventDefault(); const sd = $('#send'); if (sd) { sd.scrollIntoView({behavior: 'smooth', block: 'start'}); const f = $('#f_file'); f && setTimeout(() => f.focus({preventScroll: true}), 400); } });
  const fm = $('#fanForm'); if (!fm) return;
  sendAsCard(fm, {name: 'f_name', email: 'f_email', posting: 1});
  const g = id => $('#' + id), val = id => (g(id).value || '').trim();
  const setErr = (id, m) => { g(id + '_e').textContent = m || ''; const w = fm.querySelector(`[data-f="${id}"]`); w && w.classList.toggle('bad', !!m); const i = g(id); i && i.setAttribute('aria-invalid', m ? 'true' : 'false'); };
  function check(){
    const errs = [], add = (id, m) => { setErr(id, m); if (m) errs.push(id); };
    add('f_name', val('f_name') ? '' : 'Enter your name.');
    const em = val('f_email'); add('f_email', !em ? 'Enter your email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) ? '' : 'That email doesn’t look right.');
    const f = g('f_file').files[0];
    add('f_file', !f ? 'Choose a photo.' : !/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name) ? 'That isn’t a photo file.' : f.size > FAN_MAX_MB * 1048576 ? `That photo is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${FAN_MAX_MB} MB.` : '');
    add('f_cap', val('f_cap') ? '' : 'Add a caption.');
    add('f_ctry', val('f_ctry') ? '' : 'Enter the country.');
    add('f_date', val('f_date') && val('f_date') > iso(today()) ? 'The date is in the future.' : '');
    add('f_ok', g('f_ok').checked ? '' : 'Please tick to confirm.');
    return errs;
  }
  // Small preview under the file input (display only; the form still submits the chosen file as before)
  let prevUrl = '';
  const showPrev = () => {
    const f = g('f_file').files[0], box = g('f_prev'), im = g('f_prev_img'), na = g('f_prev_na');
    if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; }
    im.onload = im.onerror = null; im.removeAttribute('src');
    if (!f) { box.hidden = true; return; }
    const mb = f.size / 1048576;
    g('f_prev_n').textContent = `${f.name} · ${mb >= 1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'}`;
    box.hidden = false; im.hidden = false; na.hidden = true;
    prevUrl = URL.createObjectURL(f);
    im.onerror = () => { im.hidden = true; na.hidden = false; if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; } };
    im.onload = () => { if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; } };
    im.src = prevUrl;
  };
  g('f_file').addEventListener('change', showPrev);
  g('f_prev_x').onclick = () => { const i = g('f_file'); i.value = ''; showPrev(); i.dispatchEvent(new Event('change', {bubbles: true})); i.focus(); };
  if (g('f_file').files.length) showPrev();
  fm.addEventListener('change', () => { if (fm.dataset.tried) check(); });
  fm.onsubmit = async e => {
    e.preventDefault(); fm.dataset.tried = 1;
    const errs = check();
    if (errs.length) { $('#fanErr').textContent = `Please fix ${errs.length === 1 ? 'the highlighted field' : `the ${errs.length} highlighted fields`}.`; const i = g(errs[0]); i && i.focus(); return; }
    $('#fanErr').textContent = '';
    if (!SITE.formEndpoint || !navigator.onLine) { location.href = `mailto:${SITE.contact}?subject=${encodeURIComponent('Fan photo: ' + val('f_cap'))}&body=${encodeURIComponent(`Name: ${val('f_name')}\nCaption: ${val('f_cap')}\nEvent/club: ${val('f_event')}\nCountry: ${val('f_ctry')}\nDate: ${val('f_date')}\nConsent: Yes\n\n>>> Please attach your photo to this email. <<<\n`)}`; return; }
    const b = g('fanBtn'); b.disabled = true; b.textContent = 'Preparing photo…';
    const f = g('f_file').files[0];
    if (f.size > 4 * 1048576 || !/^image\/(jpeg|png)$/.test(f.type)) {
      const s = await shrinkPhoto(f);
      if (s !== f && typeof DataTransfer === 'function') { try { const dt = new DataTransfer(); dt.items.add(s); g('f_file').files = dt.files; } catch {} }
    }
    fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?fsent=1#/fans'; rememberMe({s_name: val('f_name'), s_email: val('f_email')});
    fm.querySelector('[name=_subject]').value = `Fan photo (${val('f_ctry').slice(0, 40)}): ${val('f_cap').slice(0, 80)} – ${val('f_name')}`;
    b.textContent = 'Sending…'; HTMLFormElement.prototype.submit.call(fm);
  };
}
/* Moving from the old github.io address: its migration page sends this device's saved data here as
   #/import/<base64url JSON>. We merge it (events and entries added; where both have an entry the newer change wins) and never delete. */
function importHandoff(){
  const m = (location.hash || '').match(/^#\/import\/([A-Za-z0-9_-]+)$/); if (!m) return false;
  history.replaceState(null, '', location.pathname + '#/calendar');
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/'), txt = new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - b.length % 4) % 4)), c => c.charCodeAt(0)));
    const o = JSON.parse(txt); let n = 0;
    for (const [id, v] of Object.entries(o.saved || {})) if (!S.saved[id]) { S.saved[id] = v; n++; }
    for (const [id, e] of Object.entries(o.entries || {})) { const cur = S.entries[id]; if (!cur || (e.saved || '') > (cur.saved || '')) { S.entries[id] = e; n++; } }
    for (const k of ['states', 'groups', 'remindDays', 'closeDays']) if (Array.isArray(o[k]) && !localStorage.getItem('archreg.moved')) S[k] = o[k];
    Object.assign(S.notified, o.notified || {}); localStorage.setItem('archreg.moved', new Date().toISOString());
    migrateSettings(); save(); setTimeout(() => toast(`✓ Moved to archerycalendars.com${n ? ` · ${n} saved event${n === 1 ? '' : 's'}/entries brought across` : ''}`), 600);
  } catch { setTimeout(() => toast('Couldn’t bring your saved events across – use Settings → Export/Import backup'), 600); }
  return true;
}
/* ---------- anonymous visit stats: GoatCounter (no cookies, no personal data; fails silently) ---------- */
const GCQ = [];
function gc(o){ try { const g = window.goatcounter; if (g && typeof g.count === 'function') g.count(o); else if (GCQ.length < 30) GCQ.push(o); } catch {} }
window.gcFlush = () => { const g = window.goatcounter; if (g && typeof g.count === 'function') GCQ.splice(0).forEach(gc); };
/* Outbound clicks as GoatCounter events: any element with data-gc="<path>" (live-stream watch links: watch-live/<event-id>;
   sponsor links: sponsor/<id>/<placement>). Capture phase, never preventDefault, so the link always opens; gc() swallows errors and
   queues until count.js loads. auxclick covers middle-click "open in new tab". */
function gcClick(e){
  if (e.type === 'auxclick' && e.button !== 1) return;
  const a = e.target && e.target.closest && e.target.closest('[data-gc]'); if (!a) return;
  const now = Date.now(); if (a === gcClick.el && now - gcClick.t < 800) return; gcClick.el = a; gcClick.t = now;   // one count per tap
  gc({path: a.dataset.gc, title: a.dataset.gcT || a.dataset.gc, event: true});
}
document.addEventListener('click', gcClick, true); document.addEventListener('auxclick', gcClick, true);
function gcPage(){
  const path = (location.hash || '#/home').replace(/^#/, '').split('?')[0].replace(/[^\w\/.-]/g, '').slice(0, 120) || '/home';
  if (path === gcPage.last) return; gcPage.last = path; gc({path, title: document.title});
}
// Find-shoots searches as events: lower-case words only; nothing that looks like an email or a phone number is sent.
function gcSearch(q){
  clearTimeout(gcSearch.t);
  gcSearch.t = setTimeout(() => {
    if (/@/.test(q || '')) return;
    const n = (q || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (n.length < 2 || /\d{5,}/.test(n.replace(/ /g, '')) || n === gcSearch.last) return;
    gcSearch.last = n; gc({path: 'search/' + n.replace(/ /g, '-'), title: 'Search', event: true});
  }, 1500);
}
/* ---------- International: a SEPARATE find-shoots page per country (#/intl/USA). USA only for now.
   Loaded on demand from data/intl.json and never mixed into the Australian Find events, My events or Calendars. ---------- */
let ICTRY = {countries: []}, INTL = null, INTLP = null;
let IF = {code: '', q: '', disc: '', org: '', st: '', past: false, limit: 60};
const flag = iso => iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map(c => 0x1F1A5 + c.charCodeAt(0))) : '🌐';
/* Events pushed by overseas organiser API keys (club-events, key country not AU) join intl.json on that country's page. */
const API_INTL = [];
function apiIntl(x, row){
  const iso = String(row.country).toUpperCase(), c = ICTRY.countries.find(k => k.iso2 === iso || k.code === iso);
  Object.assign(x, {_intl: true, iso2: c ? c.iso2 : iso, country_code: c ? c.code : x.country_code, country_name: c ? c.name : row.country, world_page: false, status: x.cancelled ? 'cancelled' : 'scheduled', source_name: row.club});
  if (INTL) { if (!INTL.events.some(e => e.id === x.id)) INTL.events.push(x); } else API_INTL.push(x); BYID[x.id] = x;
}
const loadIntl = () => INTL ? Promise.resolve(INTL) : (INTLP = INTLP || fetch('data/intl.json').then(r => r.json()).then(j => {
  API_INTL.forEach(x => { if (!j.events.some(e => e.id === x.id)) j.events.push(x); });
  { const m = {}; j.events.forEach(x => { const c = x.country_code; if (!c || c === 'AUS') return; const o = m[c] = m[c] || {code: c, name: x.country_name || c, iso2: x.iso2, count: 0, upcoming: 0}; o.count++; if (!iPast(x) && x.status !== 'cancelled') o.upcoming++; if (!o.iso2 && x.iso2) o.iso2 = x.iso2; });
    const prev = ICTRY.countries.map(c => c.code); ICTRY.countries = Object.values(m).sort((a, b) => (prev.indexOf(a.code) + 1 || 999) - (prev.indexOf(b.code) + 1 || 999)); }   // country list from intl.json itself (intl_countries.json is only a first-paint summary)
  j.events.forEach(x => { x._intl = true; if (OVR[x.id]) applyOvr(x, OVR[x.id]); if (!BYID[x.id]) BYID[x.id] = x; }); return (INTL = j); }));
/* Back from an international event page returns to the same country page, filters (IF) and scroll position. */
const IBACK = {};
const iBackHash = x => '#/intl/' + (IF.code && (IF.code === 'WORLD' ? x.country_code !== 'USA' || x.world_major : IF.code === x.country_code) ? IF.code : x.country_code === 'USA' ? 'USA' : x.world_page === false ? x.country_code : 'WORLD');
const US_ST = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',
  IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
  RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',PR:'Puerto Rico'};
const US_ORGS = [['usa-archery', 'USA Archery'], ['nfaa', 'NFAA'], ['asa', 'ASA'], ['ibo', 'IBO'], ['tac', 'TAC'], ['redding', 'Redding'], ['lancaster', 'Lancaster Classic'], ['world', '🌐 World events']];
const US_ORG_WORDS = {'usa-archery': 'usa archery joad usat', nfaa: 'nfaa national field archery association', asa: 'asa archery shooters association pro am proam', ibo: 'ibo international bowhunting organization triple crown',
  tac: 'tac total archery challenge', redding: 'redding western classic straight arrow bowhunters marked 3d', lancaster: 'lancaster classic lac', world: 'world archery international ifaa olympic'};
const TZ_NAME = {'America/New_York': 'Eastern Time', 'America/Chicago': 'Central Time', 'America/Denver': 'Mountain Time', 'America/Phoenix': 'Arizona Time',
  'America/Los_Angeles': 'Pacific Time', 'America/Anchorage': 'Alaska Time', 'Pacific/Honolulu': 'Hawaii Time', 'America/Puerto_Rico': 'Atlantic Time', 'Europe/Copenhagen': 'Danish time', 'Asia/Kuala_Lumpur': 'Malaysia time', 'Asia/Seoul': 'Korea time', 'Pacific/Auckland': 'NZ time', 'America/Toronto': 'Eastern Time', 'America/Winnipeg': 'Central Time', 'America/Regina': 'Saskatchewan time', 'America/Edmonton': 'Mountain Time', 'America/Vancouver': 'Pacific Time'};
const IDISC = [['Target', /target|clout|flight|para|outdoor/i], ['Indoor', /indoor/i], ['Field', /field/i], ['3D', /3d|bowhunt|trail/i], ['Clout', /clout/i], ['Flight', /\bflight\b/i], ['Run Archery', /run archery/i], ['Traditional', /traditional/i], ['Bowfishing', /bowfish/i]];
const iPast = x => (x.end_date || x.start_date) && daysTo(x.end_date || x.start_date) < 0;
const iEv = code => (INTL && INTL.events.find(x => x.country_code === code)) || {};
const iName = code => code === 'WORLD' ? 'World events' : (ICTRY.countries.find(c => c.code === code) || {}).name || iEv(code).country_name || code;
const iIso = code => (ICTRY.countries.find(c => c.code === code) || {}).iso2 || iEv(code).iso2;
const SOON = [];
/* Countries with every event listed (their national body's calendar), shown at the top of the country dropdown. Denmark: Bueskydning Danmark; Malaysia: NAAM; South Korea: Korea Archery Association (owner, 10 Oct 2026). */
const I_FULL = ['USA', 'DEN', 'MAS', 'KOR', 'NZL', 'CAN'];   // + Canada (Archery Canada, ianseo, provincial bodies), owner 13 Oct 2026
//   // + New Zealand (ArcheryOSA / Archery NZ, NZFAA, NZBS), owner 13 Oct 2026
//   // + Malaysia (NAAM calendar) and South Korea (Korea Archery Association), owner 10 Oct 2026
/* Outside the USA we list 3D / bowhunter events and IFAA / continental majors only (owner, 9 Oct 2026).
   'WORLD' = every country except the USA; single countries only appear once they have an upcoming event. */
const iWorldCtrs = () => ICTRY.countries.filter(c => c.code !== 'USA' && (INTL ? iUpN(c.code) > 0 : c.upcoming > 0));
function intlOptions(cur){
  const o = c => `<option value="${esc(c.code)}" ${cur === c.code ? 'selected' : ''}>${flag(c.iso2)} ${esc(c.name)}</option>`;
  const usa = I_FULL.map(k => ICTRY.countries.find(c => c.code === k)).filter(Boolean), wc = iWorldCtrs().filter(c => !I_FULL.includes(c.code)), soon = SOON.filter(([c]) => !wc.some(x => x.code === c));
  return usa.map(o).join('') + (ICTRY.countries.length > 1 ? `<option value="WORLD" ${cur === 'WORLD' ? 'selected' : ''}>🌐 World events (World Cup, Worlds, Olympics, 3D &amp; majors)</option>` : '')
    + (wc.length ? `<optgroup label="By country (3D &amp; majors)">${wc.map(o).join('')}</optgroup>` : '')
    + (soon.length ? `<optgroup label="Coming soon">${soon.map(([c, n]) => `<option value="${c}" disabled>${esc(n)} – coming soon</option>`).join('')}</optgroup>` : '');
}
function intlMenu(){
  if (!ICTRY.countries.length) return '';
  return `<section class="panel intl-menu" aria-labelledby="intlH"><h2 class="sec-h" id="intlH">🌐 International</h2>
    <p class="note">Events outside Australia, each country on its own page, plus World events: World Cup, World Championships, World Masters Games and the LA28 Olympics &amp; Paralympics. Find events stays Australia-only.</p>
    <form id="intlForm" class="intl-form"><label for="intlSel">Country</label><select id="intlSel">${intlOptions('USA')}</select><button class="btn" type="submit">Show events →</button></form>${iCtryStrip('')}</section>`;
}
function bindIntlMenu(){ const f = $('#intlForm'); if (f) f.onsubmit = e => { e.preventDefault(); location.hash = '#/intl/' + $('#intlSel').value; }; }
/* Card mark: the organising body's / host's own logo (img/clubs/us-*.webp, sources in data/club_logos.json), never a photo of people.
   Club-run USA Archery-sanctioned events show the host's initials (we don't hold their logos). */
const US_LOGO = {'usa-archery': 'us-usa-archery', nfaa: 'us-nfaa', asa: 'us-asa', ibo: 'us-ibo', tac: 'us-tac', lancaster: 'us-lancaster', redding: 'us-sab'};
function iHost(x){
  if (/vegas shoot/i.test(x.name) && LOGO['us-vegas']) return {id: 'us-vegas', name: 'The Vegas Shoot'};
  if (x.org_id === 'world-archery') return {id: 'world-archery', name: 'World Archery'};
  if (x.org_id === 'ifaa') return {id: 'intl-ifaa', name: 'IFAA'};
  if (x.org_id === 'wa-europe') return {id: 'intl-wae', name: 'World Archery Europe'};
  if (x.org_id === 'wa-sui') return {id: 'intl-swiss-archery', name: 'Swiss Archery'};
  if (x.org_id === 'ioc-la28') return {id: 'la28', name: 'LA28'};
  if (x.org_id === 'bueskydning-dk') return !x.host || x.host === 'Bueskydning Danmark' ? {id: 'intl-bueskydning-dk', name: 'Bueskydning Danmark'} : {id: '', name: x.host};
  if (x.us_org === 'usa-archery' && !/usa archery|\busat\b|joad|indoor nationals|target nationals|collegiate/i.test(x.name)) {
    const h = (x.location || '').split(',')[0].trim(); return {id: '', name: h && !/^\d/.test(h) ? h : x.name}; }
  return {id: US_LOGO[x.us_org] || '', name: x.org || 'Archery'};
}
/* Olympic / Paralympic events: the five rings or the Paralympic Agitos (Wikimedia Commons SVGs) on a white circle. */
const GAMES_LOGO = x => /paralympic/i.test(x.name) ? {file: 'img/logos/paralympic-agitos.svg', alt: 'Paralympic Agitos'} : /olympic/i.test(x.name) ? {file: 'img/logos/olympic-rings.svg', alt: 'Olympic rings'} : null;
function iMark(x){
  const gl = GAMES_LOGO(x);
  if (gl) return `<span class="hm hm-logo hm-games" style="background:#fff"><img src="${gl.file}" alt="${gl.alt}" loading="lazy" decoding="async"></span>`;
  const h = iHost(x), L = LOGO[h.id];
  if (L) return `<span class="hm hm-logo"${L.bg ? ` style="background:${esc(L.bg)}"` : ''}><img src="${esc(L.sm || L.file)}" alt="${esc(h.name)} logo" loading="lazy" decoding="async"></span>`;
  const i = h.id === 'la28' ? 'LA28' : initials(h.name);
  return `<span class="hm hm-ini" data-n="${i.length}" role="img" aria-label="${esc(h.name)}"><b aria-hidden="true">${esc(i)}</b></span>`;
}
const ICW = {MAS: 'malaysia malaysian my naam memanah', KOR: 'korea south korea korean kor kaa 대한양궁협회 양궁', NZL: 'new zealand nz kiwi aotearoa archery nz anz nzfaa nzbs bowhunters field', CAN: 'canada canadian ca archery canada tir a l arc manitoba bc british columbia alberta saskatchewan quebec ontario mica cwg winter games ianseo'};
/* Watchable international clubs (clubs.json, country set): their events are the international events listing them in intl_clubs. */
const iClubEv = id => INTL ? INTL.events.filter(x => (x.intl_clubs || []).includes(id)) : [];
function iHay(x){
  if (!x._h) { const st = x.us_state ? `${x.us_state} ${US_ST[x.us_state] || ''}` : '';
    x._h = snorm([x.name, x.location, x.org, x.discipline, x.level, x.country_name, st, US_ORG_WORDS[x.us_org] || '', x.country_code === 'USA' ? 'usa us united states america' : x.country_code === 'DEN' ? 'denmark danmark danish dk bueskydning' : '', ICW[x.country_code] || '', x.world_level ? 'world international major' : '', x.coach || '', x.host || '', x.category === 'seminar' ? 'seminar seminars workshop workshops clinic coaching coach' : ''].join(' ')); }
  return x._h;
}
function iMatch(x, q){
  let t = ' ' + snorm(q) + ' ';
  const st = [];
  for (const [c, n] of Object.entries(US_ST).sort((a, b) => b[1].length - a[1].length)) { const nn = ' ' + snorm(n) + ' '; if (t.includes(nn)) { st.push(c); t = t.replace(nn, ' '); } }
  const words = t.split(/\s+/).filter(Boolean), H = ' ' + iHay(x) + ' ';
  for (const w of words) { const c = w.toUpperCase();
    if (w.length === 2 && US_ST[c] && x.country_code === 'USA') { if (x.us_state !== c && !H.includes(' ' + w + ' ')) return false; else continue; }
    if (w.length <= 2 ? !H.includes(' ' + w + ' ') : !H.includes(' ' + w)) return false; }   // words match from the start of a word (asa ≠ Renasant)
  return !st.length || st.includes(x.us_state);
}
function iStatus(x){
  if (x.status === 'dates_tba' || !x.start_date) return `<span class="b tbc">? Dates not published yet</span>`;
  if (iPast(x)) return `<span class="b past">◷ Finished</span>`;
  if (x.entry_close_date && daysTo(x.entry_close_date) >= 0) return `<span class="b open">✍ Entries close ${esc(pd(x.entry_close_date).toLocaleDateString(LOC(), {day: 'numeric', month: 'short', year: 'numeric'}))}</span>`;
  return `<span class="b open">✓ Scheduled</span>`;
}
function iCard(x){
  const t = theme(x), here = [x.location || 'Venue not published yet', x.us_state && US_ST[x.us_state] && !String(x.location || '').includes(US_ST[x.us_state]) && US_ST[x.us_state]].filter(Boolean).join(' · ');
  return `<article class="ev iev th-${t}" data-iid="${esc(x.id)}" role="link" tabindex="0" data-open="${esc(x.id)}" aria-label="${esc(x.name)}">
    <div class="ev-img ev-host">${dateBox(x)}${iMark(x)}</div>
    <div class="body"><div class="tags"><span class="tag ctry">${flag(x.iso2)} ${esc(x.country_name || 'International')}</span>${catTag(x)}${t !== 'mixed' && isShoot(x) ? tagHtml(t) : ''}</div>
      <h3 class="name"><a class="iopen" href="#/shoot/${esc(encodeURIComponent(x.id))}">${esc(x.name)}</a></h3>${tmLine(x)}
      <div class="meta">📅 ${esc(range(x))}${x.tz ? ` <small>(local: ${esc(TZ_NAME[x.tz] || x.tz)})</small>` : ''}</div>
      <div class="meta">📍 ${esc(here)}</div>
      <div class="meta">${esc([x.discipline || 'Discipline not listed', x.org].filter(Boolean).join(' · '))}</div>
      <div class="badges">${cdBadge(x)}${iStatus(x)}${x.category === 'seminar' ? '<span class="b sem">🎤 Seminar / workshop</span>' : ''}${(x.intl_clubs || []).some(id => followed().includes(id)) ? '<span class="b watching">👁 Watching</span>' : ''}${x.dates_confirmed === false && x.start_date && !iPast(x) ? '<span class="b tbc">? Dates TBC</span>' : ''}${x.world_major ? '<span class="b world">🏆 World major</span>' : x.world_level && x.us_org === 'world' ? '<span class="b world">🌐 World event</span>' : ''}${x.registration_opens && !iPast(x) && !(x.registration_url && /^\d{4}-/.test(x.registration_opens) && daysTo(x.registration_opens) < 0) ? `<span class="b tbc">◷ Entries open ${esc(/^\d{4}-\d\d-\d\d$/.test(x.registration_opens) ? pd(x.registration_opens).toLocaleDateString(LOC(), {day: 'numeric', month: 'short', year: 'numeric'}) : x.registration_opens)}</span>` : ''}</div>
      ${x.notes ? `<p class="note">${esc(x.notes)}</p>` : ''}
      <p class="iacts">${entryUrl(x) ? (iPast(x) ? `<a class="btn sm alt" href="${esc(entryUrl(x))}" target="_blank" rel="noopener noreferrer">✍ Entry / event page ↗</a>` : entryBtn(x, '', false)) : '<span class="note">No entry link published yet.</span>'}
        ${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">Source${x.source_name ? ': ' + esc(x.source_name) : ''} ↗</a>` : `<span class="note">Source: ${esc(x.source_name || 'organiser')}</span>`}${x.also_listed ? ` · <a href="${esc(x.also_listed)}" target="_blank" rel="noopener">Also listed ↗</a>` : ''}</p></div>
  </article>`;
}
function iClubsPanel(cc){
  const cs = CLUBS.filter(c => c.country === cc); if (!cs.length) return '';
  return `<section class="panel iclubs" id="iclubs"><h2 class="sec">Clubs &amp; associations behind these events</h2><p class="note">Watch a club to get a 👁 badge on its events. It's saved on this device with your other clubs.</p><ul class="club-list">${cs.map(clubRow).join('')}</ul></section>`;
}
/* ---------- Country home pages, major-event countdowns, organiser API page (preview, 22 Oct 2026) ----------
   Upcoming counts come from data/intl.json itself once loaded (intl_countries.json is only a fallback summary).
   A country with a hero photo in img/credits.json (c_xx) always gets its own page, even with no upcoming events. */
const iUpN = code => INTL ? INTL.events.filter(x => x.country_code === code && !iPast(x) && x.status !== 'cancelled').length : ((ICTRY.countries.find(c => c.code === code) || {}).upcoming || 0);
const iHasPage = code => code === 'USA' || iUpN(code) > 0 || !!PH[cHero(code)];
function iCtryList(){
  const seen = new Set(), out = [];
  ICTRY.countries.forEach(c => { if (!seen.has(c.code) && iHasPage(c.code)) { seen.add(c.code); out.push(c); } });
  if (INTL) INTL.events.forEach(x => { const c = x.country_code; if (c && c !== 'AUS' && !seen.has(c) && iHasPage(c)) { seen.add(c); out.push({code: c, name: x.country_name || c, iso2: x.iso2}); } });
  return out.sort((a, b) => (b.code === 'USA') - (a.code === 'USA') || iUpN(b.code) - iUpN(a.code) || (a.name < b.name ? -1 : 1));
}
function iCtryStrip(cur){
  const cs = iCtryList(); if (!cs.length) return '';
  return `<nav class="ctry-strip" aria-label="Country home pages">${cs.map(c => `<a class="ctry-chip" href="#/intl/${esc(c.code)}"${cur === c.code ? ' aria-current="page"' : ''}><span aria-hidden="true">${flag(c.iso2)}</span> ${esc(c.name)}${INTL ? ` <small>${iUpN(c.code)}</small>` : ''}</a>`).join('')}<a class="ctry-chip" href="#/intl/WORLD"${cur === 'WORLD' ? ' aria-current="page"' : ''}><span aria-hidden="true">🌐</span> World events</a></nav>`;
}
/* Major events: flagged from existing data only (world majors / world-level, titles, championships, nationals, national tours, world cups, games, QREs) or a 'major' field. */
const MAJOR_RE = /champion|\bnationals\b|national tour|world cup|grand prix|olympic games|paralympic games|world masters|winter games|\bDM\b|\bqre\b|world record status/i;
const isMajor = x => !!x && x.major !== false && (x.major === true || !!x.world_major || !!x.world_level || !!x.titles || (!/\bclub\b.{0,30}champ|club level/i.test([x.name, x.level].join(' ')) && (/champion|\bqre\b/i.test(x.level || '') || MAJOR_RE.test(x.name || ''))));
/* Venue-local midnight of a date (no start times are invented: the count runs to the start of the first day, venue time if known). */
const AU_TZ = {WA: 'Australia/Perth', NT: 'Australia/Darwin', SA: 'Australia/Adelaide', QLD: 'Australia/Brisbane', NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', VIC: 'Australia/Melbourne', TAS: 'Australia/Hobart'};
const evTz = x => x.tz || (!x._intl && AU_TZ[x.state]) || '';
function tzMid(d, tz){
  const [y, m, dd] = d.split('-').map(Number), g = Date.UTC(y, m - 1, dd);
  if (!tz) return new Date(y, m - 1, dd).getTime();
  try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'}).formatToParts(new Date(g)).map(o => [o.type, o.value]));
    const off = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) - g; return g - off; } catch { return new Date(y, m - 1, dd).getTime(); }
}
const dayLbl = n => n === 1 ? '1 day' : n + ' days';
const cdSE = x => { const tz = evTz(x); return [tzMid(x.start_date, tz), tzMid(x.end_date || x.start_date, tz) + 864e5]; };
// Big next-card number: whole days left, floor of the same remaining time the badge ticks down (badge 112d 7h → big 112 days).
function bigText(s, e){ const n = Date.now(); if (n >= e) return 'Finished'; if (n >= s) return 'On now'; const d = Math.floor((s - n) / 864e5); return d < 1 ? 'Under 1 day' : dayLbl(d); }
function bigCd(x){ if (!x || !/^\d{4}-\d\d-\d\d$/.test(x.start_date || '')) return '<b class="big">–</b>'; const [s, e] = cdSE(x), L = cdTargets(x), g = L ? L[0][0] : s;
  return `<b class="big" data-cdb="${g}" data-cde="${e}">${bigText(g, e)}</b><small class="cd-cap">${L ? `full days until ${L[0][1] === 'Sign-in' ? 'sign-in opens' : 'the start'}` : 'full days until the first day starts'}</small>`; }
function cdBadge(x, big){
  if (!x || !isMajor(x) || !/^\d{4}-\d\d-\d\d$/.test(x.start_date || '') || x.cancelled || x.status === 'cancelled' || x.status === 'dates_tba') return '';
  if (iPast(x)) return '';
  const [s, e] = cdSE(x), L = cdTargets(x), tz = evTz(x);
  const when = L && new Date(L[0][0]).toLocaleString(LOC(), {timeZone: tz || undefined, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'});
  const ttl = L ? `Counts down to ${L[0][1] === 'Sign-in' ? 'sign-in' : 'the start'}: ${when}${tz ? ' ' + tzNm(tz) : ''}, from the organiser's published times.` : "Counts down to the start of the first day (midnight, venue time). Start times aren't shown unless the organiser publishes them.";
  return `<span class="b cd${big ? ' cd-big' : ''}" data-cd="${s}" data-cde="${e}"${L ? ` data-cdt="${cdEnc(L)}"` : ''} title="${esc(ttl)}">${cdText(s, e, L)}</span>`;
}
function cdText(s, e, L){
  const n = Date.now(), live = L ? L[L.length - 1][0] : s, nx = L ? L.find(t => t[0] > n) : null;
  if (n >= e) return '◷ Finished';
  if (n >= live) { const tot = Math.max(1, Math.round((e - s) / 864e5)), d = Math.min(tot, Math.floor((n - s) / 864e5) + 1); return `● Live now · day ${d} of ${tot}`; }
  const t = Math.floor(((nx ? nx[0] : s) - n) / 1000), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
  return `⏱ ${nx ? nx[1] : 'Starts'} in ${d ? d + 'd ' : ''}${d || h ? h + 'h ' : ''}${m}m ${sec}s`;
}
/* ---------- Event times (Nathe 23 Oct 2026: "Show register time and other times noted") ----------
   The organiser's start_times text, laid out per day: sign-in/registration first (bold), then the rest in the
   organiser's order. Every line is the source text verbatim; anything the parser can't place falls back to the raw text. */
const TM_KIND = [['finish', /\bfinish|\bclose[sd]?\b|presentation/i], ['signin', /\bsign[\s-]?(?:in|on)\b|\bregistration\b|\bregister\b|\bcheck[\s-]?in\b/i],
  ['practice', /practi[cs]e|warm[\s-]?up/i], ['muster', /\bmuster|\bassembly\b/i], ['start', /\bstart|ranges? open|commence|first arrow|kick[\s-]?off|\bshooting\b|\bcompetition\b|\bscoring\b|\bround\b/i]];
const TM_TOK = /\b(\d{1,2})(?:[:.](\d\d))?\s*(am|pm|a\.m\.|p\.m\.)?(?:\s*(?:[–—-]|to|for|and)\s*(\d{1,2})(?:[:.](\d\d))?)?\s*(am|pm|a\.m\.|p\.m\.|noon)(?![a-z])|\b(noon|midday)\b/i;
const TM_WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TM_LBL = /(^|[.;]\s+)((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?(?:\s+\d{1,2}(?:\s+[a-z]{3,9}\.?)?)?(?:\s*\([^)]{1,40}\))?|am|pm|(?:morning|afternoon|evening)(?:\s+(?:round|session))?|(?:session|round|day)\s+\d+(?:\s*\([^)]{1,40}\))?)\s*:\s*/gi;
function tmTime(s){
  const m = TM_TOK.exec(s); if (!m) return null;
  if (m[7]) return [12, 0];
  const mer = v => (v || '').toLowerCase().replace(/\./g, ''), m6 = mer(m[6]);
  let h = +m[1], mi = +(m[2] || 0), md = mer(m[3]);
  if (!md) { md = m6 === 'noon' ? 'pm' : m6; if (m[4] && md === 'pm' && h > +m[4] && +m[4] !== 12) md = 'am'; }
  if (h > 12 || mi > 59) return null;
  if (m6 === 'noon' && !m[4] && !m[3]) return [12, mi];
  return [h % 12 + (md === 'pm' ? 12 : 0), mi];
}
function tmSplit(body){   // top-level commas/semicolons and sentence stops; pieces without a time join the previous piece (source text kept exactly)
  const cut = [], n = body.length; let dep = 0, st = 0;
  for (let i = 0; i < n; i++) { const c = body[i];
    if (c === '(') dep++; else if (c === ')') dep = Math.max(0, dep - 1);
    else if (!dep && (c === ',' || c === ';' || (c === '.' && (i === n - 1 || /\s/.test(body[i + 1])) && !/[ap]\.m$/i.test(body.slice(Math.max(0, i - 3), i))))) { cut.push([st, i]); st = i + 1; } }
  cut.push([st, n]);
  const out = [];
  cut.forEach(([a, b]) => { const t = body.slice(a, b).trim(); if (!t) return;
    if (out.length && !TM_TOK.test(t) && !/^and\b/i.test(t)) { out[out.length - 1].b = b; return; }
    if (out.length && !TM_TOK.test(out[out.length - 1].t())) { out[out.length - 1].b = b; return; }
    out.push({a, b, t(){ return body.slice(this.a, this.b).trim().replace(/[\s,;]+$/, ''); }}); });
  return out.map(o => o.t()).filter(Boolean);
}
function tmDate(x, wd){   // a weekday label → the event date with that weekday (or the matching pre-day within the week before)
  const s = x.start_date, e = x.end_date || s; if (!/^\d{4}-\d\d-\d\d$/.test(s || '')) return '';
  const D = k => { const d = pd(s); d.setDate(d.getDate() + k); return iso(d); };
  for (let k = 0; k < 14; k++) { const d = D(k); if (d > e) break; if (pd(d).getDay() === wd) return d; }
  for (let k = 1; k <= 6; k++) { const d = D(-k); if (pd(d).getDay() === wd) return d; }
  return '';
}
function evTimes(x){
  const raw = String(x && x.start_times || '').replace(/\s+/g, ' ').trim(); if (!raw) return null;
  if (x._tmc && x._tmc.raw === raw) return x._tmc;
  const T = {raw, days: [], ok: false}; Object.defineProperty(x, '_tmc', {value: T, writable: true, configurable: true, enumerable: false});
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(raw) || !TM_TOK.test(raw)) return T;
  const segs = []; let m, last = 0, lab = null; TM_LBL.lastIndex = 0;
  while ((m = TM_LBL.exec(raw))) { const at = m.index + m[1].length;
    if (at > last || lab !== null) segs.push({lab, body: raw.slice(last, at)}); lab = m[2].trim(); last = TM_LBL.lastIndex; }
  segs.push({lab, body: raw.slice(last)});
  const multi = (x.end_date || x.start_date) !== x.start_date;
  segs.forEach(g => { const items = tmSplit(g.body).map((text, i) => { const k = TM_KIND.find(([, re]) => re.test(text)), kw = k ? (text.match(k[1]) || [''])[0] : '';
      return {text, i, kind: k ? k[0] : '', kw, t: tmTime(text)}; });
    if (!items.length) return;
    const w = g.lab && TM_WD.indexOf(g.lab.slice(0, 3).toLowerCase()), date = g.lab && w >= 0 ? tmDate(x, w) : (!g.lab || !multi ? x.start_date : '');
    const head = g.lab ? (w >= 0 && date ? pd(date).toLocaleDateString(LOC(), {weekday: 'short', day: 'numeric', month: 'short'}) + ((g.lab.match(/\([^)]*\)/) || [''])[0] ? ' ' + g.lab.match(/\([^)]*\)/)[0] : '') : g.lab) : '';
    items.sort((a, b) => (a.kind === 'signin' ? 0 : 1) - (b.kind === 'signin' ? 0 : 1) || a.i - b.i);
    T.days.push({lab: g.lab, head, date, items}); });
  const all = T.days.flatMap(d => d.items);
  T.ok = all.length > 0 && all.filter(i => i.t).length * 2 >= all.length;
  return T;
}
function tzAt(d, h, mi, tz){   // venue-local wall time → epoch ms (generalises tzMid)
  const [y, m, dd] = d.split('-').map(Number), g = Date.UTC(y, m - 1, dd, h, mi);
  if (!tz) return new Date(y, m - 1, dd, h, mi).getTime();
  try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'}).formatToParts(new Date(g)).map(o => [o.type, o.value]));
    const off = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) - g; return g - off; } catch { return new Date(y, m - 1, dd, h, mi).getTime(); }
}
const AUTZ_NM = {'Australia/Perth': 'Perth time', 'Australia/Darwin': 'Darwin time', 'Australia/Adelaide': 'Adelaide time', 'Australia/Brisbane': 'Brisbane time', 'Australia/Sydney': 'Sydney/Canberra time', 'Australia/Melbourne': 'Melbourne time', 'Australia/Hobart': 'Hobart time'};
const tzNm = tz => AUTZ_NM[tz] || TZ_NAME[tz] || tz;
// True when the viewer's clock differs from the venue's on that date (same offset under another name counts as the same).
const tzDiff = (tz, d) => { if (!tz || !VTZ || tz === VTZ) return false; const k = d || iso(new Date()); return tzMid(k, tz) !== tzMid(k, VTZ); };
const fmt12 = ([h, m]) => `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
const capF = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// Countdown targets: the first sign-in of each day up to day 1 (else day 1's first start time). Last entry = when it goes live.
function cdTargets(x){
  const T = evTimes(x); if (!T || !T.ok) return null; const tz = evTz(x), s = x.start_date;
  const pick = k => T.days.filter(d => d.date && d.date <= s).map(d => { const it = d.items.find(i => i.kind === k && i.t); return it ? [tzAt(d.date, it.t[0], it.t[1], tz), k === 'signin' ? 'Sign-in' : 'Starts', d.date] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
  const one = A => A.filter((t, i) => !A.slice(0, i).some(u => u[2] === t[2]));   // AM/PM sessions: only a day's first time counts
  let L = one(pick('signin')); if (!L.length) L = one(pick('start')); if (!L.length) return null;
  if (L[L.length - 1][2] !== s) L.push([tzMid(s, tz), 'Starts', s]);
  return L;
}
const cdEnc = L => L ? L.map(t => t[0] + '~' + t[1]).join(',') : '';
const cdDec = v => v ? v.split(',').map(t => { const [a, b] = t.split('~'); return [+a, b]; }) : null;
// Compact line for cards and the day panel: e.g. "Sign-in 10:00 am" (that day's, or the first one). '' when nothing parses.
function evTimesShort(x, day){
  const T = evTimes(x); if (!T || !T.ok) return '';
  const ds = T.days.filter(d => d.items.some(i => i.t)); if (!ds.length) return '';
  let d, it;
  if (day) { d = ds.find(g => g.date === day) || (ds.length === 1 && !ds[0].date ? ds[0] : null) || ds.find(g => !g.date && !g.lab); if (!d) return ''; }
  const fromDay = g => g.items.find(i => i.kind === 'signin' && i.t) || g.items.find(i => i.kind === 'start' && i.t) || g.items.find(i => i.t);
  if (d) it = fromDay(d);
  else { const si = ds.map(g => [g, g.items.find(i => i.kind === 'signin' && i.t)]).filter(p => p[1]).sort((a, b) => (a[0].date || '9') < (b[0].date || '9') ? -1 : 1)[0];
    [d, it] = si || [ds[0], fromDay(ds[0])]; }
  if (!it) return '';
  // The organiser's words, trimmed after the first time when long ("night sign-on 6-9 pm at the Bat Cave…" → "night sign-on 6-9 pm").
  const tk = TM_TOK.exec(it.text), cut = tk ? it.text.slice(0, tk.index + tk[0].length) : it.text;
  let txt = capF(it.text.length <= 34 ? it.text : it.kw && cut.toLowerCase().includes(it.kw.toLowerCase()) || !it.kind ? cut : capF(it.kw.toLowerCase()) + ' ' + fmt12(it.t));
  if (!day && d.date && d.date !== x.start_date) txt = pd(d.date).toLocaleDateString(LOC(), {weekday: 'short'}) + ': ' + txt;
  const tz = evTz(x); if (tzDiff(tz, x.start_date)) txt += ' (' + tzNm(tz) + ')';
  return txt;
}
const tmLine = (x, day) => { if ((x._intl ? iPast(x) : isPast(x)) || x.cancelled) return ''; const t = evTimesShort(x, day); return t ? `<div class="meta tm-line">◷ <b>${esc(t)}</b></div>` : ''; };
function timesBox(x){
  const T = evTimes(x); if (!T) return '';
  const tz = evTz(x), src = x.field_sources && x.field_sources.start_times, note = tzDiff(tz, x.start_date) ? `<p class="note tm-tz">All times are ${esc(tzNm(tz))}, local to the venue.</p>` : '';
  const li = i => `<li class="tm-${i.kind || 'other'}">${i.kind === 'signin' ? `<b>${esc(i.text)}</b>` : esc(i.text)}</li>`;
  const body = T.ok ? T.days.map(d => `<div class="tm-day">${d.head ? `<h3>${esc(d.head)}</h3>` : ''}<ul>${d.items.map(li).join('')}</ul></div>`).join('') : `<p class="tm-raw">${esc(T.raw)}</p>`;
  return `<section class="panel ev-times" id="evTimes"><h2 class="sec">◷ Times</h2>${body}${note}${src ? `<p class="note tm-src">${esc(capF(srcTxt(src)))}</p>` : ''}</section>`;
}
// One shared 1-second ticker for every countdown on the page (badges, next-card big number, livestream box); paused while the tab is hidden.
const TICKS = [TICKS_LS, () => {
  document.querySelectorAll('[data-cd]').forEach(el => { const t = cdText(+el.dataset.cd, +el.dataset.cde, cdDec(el.dataset.cdt)); if (el.textContent !== t) el.textContent = t; el.classList.toggle('cd-live', t.startsWith('●')); });
  document.querySelectorAll('[data-cdb]').forEach(el => { const t = bigText(+el.dataset.cdb, +el.dataset.cde); if (el.textContent !== t) el.textContent = t; });
}];
const tickAll = () => { if (!document.hidden) TICKS.forEach(f => { try { f(); } catch (_) {} }); };
setInterval(tickAll, 1000);
document.addEventListener('visibilitychange', tickAll);
/* Country home: intro from the data itself, next events, majors, US states, then the full list (vIntl). */
function iMini(x){
  const u = entryUrl(x);
  return `<li class="imini"><a class="imini-n" href="#/shoot/${esc(encodeURIComponent(x.id))}">${esc(x.name)}</a><span class="imini-m">📅 ${esc(range(x))} · 📍 ${esc([x.location || 'Venue not published yet', x.us_state && US_ST[x.us_state] && !String(x.location || '').includes(US_ST[x.us_state]) && US_ST[x.us_state]].filter(Boolean).join(', '))}</span>
    <span class="badges">${cdBadge(x)}${iStatus(x)}</span>${u ? entryBtn(x, 'imini-reg', false) : ''}</li>`;
}
function iHome(code, all){
  const nm = iName(code), up = all.filter(x => !iPast(x) && x.status !== 'cancelled').sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
  const p = PH[cHero(code)], orgs = [...new Set(up.map(x => x.source_name || x.org).filter(Boolean))];
  const nReg = up.filter(x => entryUrl(x)).length;
  const cred = p && p.by ? `<p class="ph-credit">Photo: ${esc(p.by)}${p.source ? ` (${esc(p.source)})` : ''}. More on the <a href="#/credits">Credits page</a>.</p>` : '';
  if (!up.length) return `<section class="panel ihome iempty">${cred}<h2 class="sec-h">No upcoming events in ${esc(nm)} yet</h2>
    <p>We haven't got any upcoming ${esc(nm)} events listed right now. Run a club or tournament there? Send it in and we'll add it.</p>
    <p class="iacts"><a class="btn gold" href="#/submit?country=OTHER">➕ Submit an event</a> <a class="btn alt" href="#/intl/WORLD">🌐 World events</a></p></section>`;
  const maj = up.filter(isMajor), next = up.slice(0, 3);
  const sts = code === 'USA' ? Object.entries(up.reduce((a, x) => (x.us_state && (a[x.us_state] = (a[x.us_state] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]) : [];
  return `<section class="panel ihome">${cred}
    <p class="ihome-intro"><b>${up.length} upcoming event${up.length === 1 ? '' : 's'} in ${esc(nm)}</b>${orgs.length ? `, from ${esc(orgs.slice(0, 4).join(', '))}${orgs.length > 4 ? ` and ${orgs.length - 4} more` : ''}` : ''}. ${nReg ? `${nReg} with an online entry link.` : 'Entry details are on each event page.'}</p>
    <div class="ihome-grid"><div><h2 class="sec-h">Coming up next</h2><ul class="imini-list">${next.map(iMini).join('')}</ul></div>
    ${maj.length ? `<div><h2 class="sec-h">🏆 Major events &amp; championships</h2><ul class="imini-list">${maj.slice(0, 6).map(iMini).join('')}</ul>${maj.length > 6 ? `<p class="note">${maj.length - 6} more in the full list below.</p>` : ''}</div>` : ''}</div>
    ${sts.length ? `<h2 class="sec-h">By state</h2><div class="chips" role="group" aria-label="Events by US state">${sts.map(([s, n]) => `<button class="chip" data-ihst="${s}" aria-pressed="${IF.st === s}">${esc(US_ST[s] || s)} <small>${n}</small></button>`).join('')}</div>` : ''}</section>
    <h2 class="sec-h" id="iall">All ${esc(nm)} events</h2>`;
}
/* ---------- Home country (owner 22 Oct 2026): every country gets its own home page (#/home/USA), built like the Australian home.
   Which home: the country the archer picked (S.homeCountry; synced to their account when signed in, so the profile wins on sign-in)
   > the country detected for this visit (Cloudflare's public trace page: country code only, kept in sessionStorage) > Australia.
   Nothing else is sent anywhere. ---------- */
const GEO3 = 'archcal.geo3';
function iso3of(cc){
  cc = String(cc || '').toUpperCase(); if (!cc) return ''; if (cc === 'AU' || cc === 'AUS') return 'AUS'; if (cc === 'WORLD') return 'WORLD';
  const c = ICTRY.countries.find(k => k.iso2 === cc || k.code === cc); if (c) return c.code;
  const x = INTL && INTL.events.find(e => e.iso2 === cc || e.country_code === cc); return x ? x.country_code : '';
}
const homeCode = () => S.homeCountry || (() => { try { return sessionStorage.getItem(GEO3) || ''; } catch { return ''; } })() || 'AUS';
const homeHash = c => !c || c === 'AUS' ? '#/home' : c === 'WORLD' ? '#/intl/WORLD' : '#/home/' + c;
const LOC = () => ({USA: 'en-US', CAN: 'en-CA', AUS: 'en-AU', NZL: 'en-NZ'})[homeCode()] || 'en-GB';
const SUN_WEEK = ['USA', 'CAN', 'MEX', 'JPN', 'KOR', 'BRA', 'PHI', 'TPE'];
const VTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
const TZ_CC = {'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ', 'Europe/London': 'GB', 'Europe/Copenhagen': 'DK', 'Asia/Tokyo': 'JP', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL',
  'America/Mexico_City': 'MX', 'America/Tijuana': 'MX', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Seoul': 'KR', 'Europe/Istanbul': 'TR', 'Europe/Zurich': 'CH', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Regina': 'CA', 'America/St_Johns': 'CA'};
const tzCountry = () => /^Australia\//.test(VTZ) ? 'AU' : TZ_CC[VTZ] || (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota|Menominee|Juneau|Sitka|Nome|Adak)|^Pacific\/Honolulu$/.test(VTZ) ? 'US' : '');
function ctryHasHome(c){ return c === 'AUS' || (!!c && c !== 'WORLD' && iHasPage(c)); }
/* Bare home page only (no hash), first visit this session, nothing picked: detect, then switch. Never blocks render (AU home shows meanwhile). */
async function geoLand(){
  if (S.homeCountry) return;
  let c = ''; try { c = sessionStorage.getItem(GEO3) || ''; } catch {}
  const fresh = !c;
  if (!c) {
    let cc = '';
    try { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 1500);
      const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {signal: ac.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'}); clearTimeout(t);
      const m = (await r.text()).match(/^loc=([A-Z]{2})$/m); cc = m && !/^(XX|T1)$/.test(m[1]) ? m[1] : ''; } catch {}
    if (!cc) cc = tzCountry();
    if (!cc) return;
    c = iso3of(cc) || 'WORLD'; if (c !== 'AUS' && c !== 'WORLD' && !ctryHasHome(c)) c = 'WORLD';
    try { sessionStorage.setItem(GEO3, c); } catch {}
  }
  setHomeLinks();
  if (fresh && c !== 'AUS' && /^#\/(fans|calendar|browse)/.test(location.hash || '') && typeof softRender === 'function') softRender();
  if (c !== 'AUS' && (!location.hash || location.hash === '#' || location.hash === '#/home') && !geoLand.moved) location.replace(homeHash(c));
}
function setHomeLinks(){
  const c = homeCode(), h = homeHash(c);
  document.querySelectorAll('.nav a[data-tab=home], .site-head .logo').forEach(a => a.setAttribute('href', h));
  const fe = $('.nav a[data-tab=browse]'); if (fe) fe.setAttribute('href', c === 'AUS' ? '#/browse' : '#/intl/' + c);
  const b = $('#ctrySw'); if (b) { const cur = curHomePage() || c; b.innerHTML = `<span aria-hidden="true">${cur === 'AUS' ? flag('AU') : cur === 'WORLD' ? '🌐' : flag(iIso(cur))}</span><span class="pl"> ${esc(cur === 'AUS' ? 'Australia' : iName(cur))}</span> ▾`; b.setAttribute('aria-label', `Country: ${cur === 'AUS' ? 'Australia' : iName(cur)}. Change country`); }
}
const curHomePage = () => { const [, p, a] = (location.hash || '').split('?')[0].split('/'); return p === 'home' ? (a ? iso3of(a) || '' : 'AUS') : ''; };
function ctryMenu(){
  const old = $('#ctryMenu'); if (old) { old.remove(); $('#ctrySw').setAttribute('aria-expanded', 'false'); return; }
  const b = $('#ctrySw'), r = b.getBoundingClientRect(), cur = homeCode();
  const opts = [{code: 'AUS', name: 'Australia', iso2: 'AU'}, ...iCtryList().filter(c => c.code !== 'AUS')];
  const m = document.createElement('div'); m.id = 'ctryMenu'; m.className = 'ctry-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Choose your country');
  m.innerHTML = `<p class="cm-h">Your country</p>${opts.map(c => `<button type="button" role="menuitemradio" aria-checked="${cur === c.code}" data-cm="${esc(c.code)}"><span aria-hidden="true">${flag(c.iso2)}</span> ${esc(c.name)}${cur === c.code ? ' <b aria-hidden="true">✓</b>' : ''}</button>`).join('')}<button type="button" role="menuitemradio" aria-checked="${cur === 'WORLD'}" data-cm="WORLD"><span aria-hidden="true">🌐</span> Somewhere else (World events)</button>`;
  document.body.appendChild(m);
  m.style.top = (r.bottom + scrollY + 6) + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  b.setAttribute('aria-expanded', 'true'); const f = m.querySelector('[aria-checked=true]') || m.querySelector('button'); f && f.focus();
  m.onclick = e => { const t = e.target.closest('[data-cm]'); if (!t) return; S.homeCountry = t.dataset.cm; save(); m.remove(); b.setAttribute('aria-expanded', 'false'); CM = null; setHomeLinks(); location.hash = homeHash(S.homeCountry); if (location.hash === homeHash(S.homeCountry)) softRenderForce(); };
  m.onkeydown = e => { if (e.key === 'Escape') { m.remove(); b.setAttribute('aria-expanded', 'false'); b.focus(); } };
  setTimeout(() => document.addEventListener('click', function off(e){ if (!m.contains(e.target) && e.target !== b && !b.contains(e.target)) { m.remove(); b.setAttribute('aria-expanded', 'false'); } if (!document.body.contains(m)) document.removeEventListener('click', off); }), 0);
}
/* Discipline tiles per country: photo c_<iso2>_<disc> > generic discipline photo > no photo. Names are ours unless the country's own body is cited. */
const CDISC = [['target', 'Target', /target|outdoor|para|\b(720|1440|900)\b/i, 'target'], ['indoor', 'Indoor', /indoor|\b18 ?m\b|vegas/i, 'indoor'], ['field', 'Field', /field/i, 'aba_field'],
  ['3d', '3D', /^(?!.*bowfish).*(\b3d\b|bowhunt)/i, '3d'], ['clout', 'Clout', /clout/i, ''], ['flight', 'Flight', /\bflight\b/i, ''], ['run', 'Run Archery', /run archery/i, ''],
  ['trad', 'Traditional', /traditional/i, ''], ['bowfishing', 'Bowfishing', /bowfish/i, '']];
const discPhoto = (code, k, gen) => PH['c_' + String(iIso(code) || '').toLowerCase() + '_' + k] || (gen && PH[gen]) || null;
function vCountryHome(code){
  const nm = iName(code), the = /^(United|Netherlands)/.test(nm) ? 'the ' : '';
  setTitle(`Archery in ${the}${nm} · Archery Calendar`);
  const h = PH[cHero(code)] || (code === 'USA' ? PH.us_field : PH['3d']) || photo('mixed');
  const hero = `<section class="hero" style="--img:url('${esc(h.file)}');--pos:${esc(h.pos || 'center 35%')}"><div class="wrap hero-grid">
    <div class="hero-copy"><p class="kicker">${flag(iIso(code))} ${esc(nm)}</p><h1>Every archery event in ${the}${esc(nm)}.<br><span>One calendar.</span></h1>
      <p class="lead" id="chLead">${INTL ? '' : 'Loading events…'}</p>
      <form class="hero-search" id="chSearch" role="search"><input type="search" id="chq" placeholder="Search events in ${the}${esc(nm)}…" aria-label="Search events in ${esc(nm)}"><button class="btn gold" type="submit">Find events</button></form><p class="hero-near"><a class="nm-hero-btn" href="#/near"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>Find clubs near me</a></p>${h.by ? `<p class="ch-credit">Photo: ${esc(h.by)}${h.source ? ` (${esc(h.source)})` : ''} · <a href="#/credits">Credits</a></p>` : ''}</div>
    NEXTCARD</div>SPHERO</section>`;
  if (!INTL) { loadIntl().then(() => { if (curHomePage() === code) softRenderForce(); }).catch(() => {}); return hero.replace('NEXTCARD', '').replace('SPHERO', spHero(String(iIso(code) || code).toLowerCase(), 'home')) + '<div class="wrap"><p class="loading">Loading events…</p></div>'; }
  const all = INTL.events.filter(x => x.country_code === code), up = all.filter(x => !iPast(x) && x.status !== 'cancelled').sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
  const maj = up.filter(isMajor), nReg = up.filter(x => entryUrl(x)).length, orgs = [...new Set(up.map(x => x.source_name || x.org).filter(Boolean))];
  const mine = Object.keys(S.saved).map(id => BYID[id]).filter(x => x && x.country_code === code && !iPast(x)).sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
  const nx = mine[0] || maj.find(x => x.start_date);
  const next = nx ? `<a class="next-card" href="#/shoot/${esc(encodeURIComponent(nx.id))}"><span class="kicker">${mine[0] ? 'Your next event' : 'Next major event'}</span>${bigCd(nx)}
      <span class="nm">${esc(nx.name)}</span><span>${esc(range(nx))}</span>${cdBadge(nx)}</a>` : '';
  const lead = up.length ? `${up.length} upcoming event${up.length === 1 ? '' : 's'}${orgs.length ? ` from ${esc(orgs.slice(0, 3).join(', '))}${orgs.length > 3 ? ` and ${orgs.length - 3} more` : ''}` : ''}. Save them, get reminders before entries close, and keep track of what you've paid.` : `No upcoming events listed in ${the}${esc(nm)} yet.`;
  const disc = CDISC.map(([k, lbl, re, gen]) => { const ev = up.filter(x => re.test(x.discipline || x.name || '')); return {k, lbl, n: ev.length, ph: discPhoto(code, k, gen), by: [...new Set(ev.map(x => x.org).filter(Boolean))].slice(0, 3)}; }).filter(d => d.n);
  const sts = code === 'USA' ? Object.entries(up.reduce((a, x) => (x.us_state && (a[x.us_state] = (a[x.us_state] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]) : [];
  const cc = String(iIso(code) || code).toLowerCase();
  return hero.replace('NEXTCARD', next).replace('SPHERO', spHero(cc, 'home')).replace('<p class="lead" id="chLead"></p>', `<p class="lead" id="chLead">${lead}</p>`) + `
  <div class="wrap home-wrap">${spRails(cc)}${newsCols()}
    <div class="stats four"><a class="stat" href="#/intl/${esc(code)}"><b>${up.length}</b><span>Upcoming events</span></a><a class="stat" href="#chMaj"><b>${maj.length}</b><span>🏆 Major events</span></a><a class="stat" href="#/intl/${esc(code)}"><b>${nReg}</b><span>✍ Online entry</span></a><a class="stat" href="#/calendar"><b>${mine.length}</b><span>★ My events here</span></a></div>
    ${newsCard(code)}
    ${spStrip(cc)}
    ${up.length ? '' : `<section class="panel iempty"><h2 class="sec-h">No upcoming events in ${the}${esc(nm)} yet</h2><p>Run a club or tournament there? Send it in and we'll add it.</p><p class="iacts"><a class="btn gold" href="#/submit?country=OTHER">➕ Submit an event</a> <a class="btn alt" href="#/intl/WORLD">🌐 World events</a></p></section>`}
    ${disc.length ? `<h2 class="sec-h">Pick your discipline</h2><div class="types">${disc.map(d => `<a class="type${d.ph ? '' : ' type-plain'}" href="#/intl/${esc(code)}" data-chd="${esc(d.lbl)}" style="${d.ph ? `--img:url('${esc(d.ph.sm)}');--pos:${esc(d.ph.pos || 'center')}` : ''}"><span class="type-name">${esc(d.lbl)}</span><span class="type-sub">${d.n} coming up${d.by.length ? ' · ' + esc(d.by.join(', ')) : ''}</span></a>`).join('')}</div>` : ''}
    ${up.length ? `<div class="two"><section><h2 class="sec-h">Coming up</h2><div class="list">${up.slice(0, 4).map(iCard).join('')}</div></section>
      <section id="chMaj"><h2 class="sec-h">🏆 Major events &amp; championships</h2>${maj.length ? `<div class="list">${maj.slice(0, 4).map(iCard).join('')}</div>` : '<p class="note">No major events listed yet.</p>'}</section></div>` : ''}
    ${sts.length ? `<h2 class="sec-h">By state</h2><div class="chips" role="group" aria-label="Events by US state">${sts.map(([s, n]) => `<a class="chip" href="#/intl/USA" data-chst="${s}">${esc(US_ST[s] || s)} <small>${n}</small></a>`).join('')}</div>` : ''}
    ${iClubsPanel(code)}
    ${appVideoBox()}
    ${clubCta()}
    <p class="center see-all"><a class="btn" href="#/intl/${esc(code)}">See all ${esc(nm)} events →</a></p>
  </div>`;
}
function bindCountryHome(code){
  const reset = o => Object.assign(IF, {code, q: '', disc: '', org: '', st: '', ctry: '', major: false, cat: '', past: false, limit: 60}, o);
  const f = $('#chSearch'); if (f) f.onsubmit = e => { e.preventDefault(); gsGo($('#chq').value); };   // free-text search is global, not limited to this country
  document.querySelectorAll('[data-chd]').forEach(a => a.onclick = () => { const d = a.dataset.chd; reset(IDISC.some(x => x[0] === d) ? {disc: d} : {q: d}); });
  document.querySelectorAll('[data-chst]').forEach(a => a.onclick = () => reset({st: a.dataset.chst}));
  bindClubBtns($('#view'));
}
function vIntl(arg){
  let code = String(decodeURIComponent(arg || 'USA')).toUpperCase();
  if (ICTRY.countries.length && code !== 'WORLD' && code !== 'USA' && !iHasPage(code) && !(INTL && INTL.events.some(x => x.country_code === code))) code = ICTRY.countries.some(c => c.code === code) ? 'WORLD' : 'USA';
  const usa = code === 'USA', world = code === 'WORLD';
  if (IF.code !== code) Object.assign(IF, {code, q: '', disc: '', org: '', st: '', ctry: '', major: false, cat: '', past: false, limit: 60});
  let nm = iName(code), head = pageHead(world ? '🌐 World events: find an event' : `${flag(iIso(code) || 'US')} Archery in ${/^(United|Netherlands)/.test(nm) ? 'the ' : ''}${esc(nm)}`,
    world ? 'World majors – Hyundai Archery World Cup, World Championships, World Masters Games, LA28 Olympics and Paralympics – plus 3D and bowhunter events, IFAA and continental championships, and seminars & workshops. Dates are local to each venue.'
      : `Archery events in ${esc(nm)}${usa ? ' – USA Archery, NFAA, ASA, IBO, TAC, Redding, Lancaster and The Vegas Shoot' : code === 'DEN' ? " – every event on Bueskydning Danmark's calendar: indoor, target, field and 3D, including the Danish championships (DM)" : code === 'MAS' ? " – events on NAAM's national calendar (Persatuan Memanah Kebangsaan Malaysia) and club seminars & workshops" : code === 'KOR' ? ' – events on the Korea Archery Association calendar (대한양궁협회) and the World Archery calendar' : code === 'NZL' ? ' – Archery NZ club tournaments (ArcheryOSA), NZ Field Archery Association field and 3D events, and NZ Bowhunters Society events' : code === 'GBR' ? ' – Archery GB national events: the National Tour, British and national championships and the Run Archery series' : code === 'CAN' ? ' – the Canadian Outdoor Championships, Archery Canada registered club events (ianseo) and provincial events such as the Canada Winter Games trials' : ' – 3D events and majors'}. Dates are local to each venue.`, world ? '3d' : PH[cHero(code)] ? cHero(code) : usa ? 'us_field' : '3d');
  setTitle(`Archery events in ${nm}`);
  head = head.replace(/<\/section>\s*$/, m => spHero(world ? 'world_intl' : String(iIso(code) || code).toLowerCase() + '_intl', 'intl') + m).replace(/(<\/h1>(?:<p>[\s\S]*?<\/p>)?)/, `$1<p class="intl-add"><a class="btn gold sm" id="iAdd" href="#/submit?country=${usa ? 'US' : 'OTHER'}">➕ Add your club's event</a> <span>Clubs add their own events (free account) – we check every event before it goes live.</span></p>`);
  if (!INTL) { loadIntl().then(() => { if ((location.hash || '').startsWith('#/intl')) { const y = scrollY; render(); scrollTo(0, y); } }).catch(() => {}); return `${head}<div class="wrap"><p class="note" id="icount">Loading events…</p></div>`; }
  const all = INTL.events.filter(x => world ? (x.country_code !== 'USA' && x.world_page !== false) || x.world_major : x.country_code === code);
  let list = all.filter(x => IF.past || !iPast(x));
  if (world && IF.ctry) list = list.filter(x => x.country_code === IF.ctry);
  if (world && IF.major) list = list.filter(x => x.world_major);
  const nSem = all.filter(x => x.category === 'seminar' && (IF.past || !iPast(x))).length;
  if (IF.cat === 'seminar') list = list.filter(x => x.category === 'seminar'); else if (IF.cat === 'shoots') list = list.filter(x => x.category !== 'seminar');
  if (usa && IF.org) list = list.filter(x => x.us_org === IF.org);
  if (usa && IF.st) list = list.filter(x => x.us_state === IF.st);
  if (IF.disc) { const re = IDISC.find(d => d[0] === IF.disc)[1]; list = list.filter(x => re.test((x.discipline || '') + ' ' + x.name)); }
  if (IF.q.trim()) list = list.filter(x => iMatch(x, IF.q));
  list.sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : (a.start_date || '9') > (b.start_date || '9') ? 1 : a.name < b.name ? -1 : 1);
  const sts = usa ? [...new Set(all.map(x => x.us_state).filter(Boolean))].sort((a, b) => US_ST[a] < US_ST[b] ? -1 : 1) : [];
  const wctr = world ? [...new Set(all.filter(x => IF.past || !iPast(x)).map(x => x.country_code).filter(Boolean))].sort((a, b) => iName(a) < iName(b) ? -1 : 1) : [];
  const active = [IF.q && `search “${esc(IF.q)}”`, IF.org && US_ORGS.find(o => o[0] === IF.org)[1], IF.st && US_ST[IF.st], world && IF.ctry && iName(IF.ctry), world && IF.major && 'World majors', IF.cat === 'seminar' ? 'Seminars & workshops' : IF.cat === 'shoots' && 'Events only', IF.disc].filter(Boolean);
  // Search results first (owner 30 Oct 2026): with a search or filter on, the count, Clear and matching events sit straight under the header;
  // the country panels and filters follow. While typing in this page's box the layout stays put so the box doesn't jump.
  const first = active.length > 0 && !IF.typing;
  const cnt = `<p class="note" id="icount">${list.length} event${list.length === 1 ? '' : 's'}${active.length ? ' · ' + active.join(' · ') + ' <button class="linkbtn" id="iclr">✕ Clear</button>' : ''}.</p>`;
  const res = `<div class="results">${list.slice(0, IF.limit).map(iCard).join('') || `<div class="empty">No events match${active.length ? ': ' + active.join(' · ') : ''}.</div>`}</div>
    ${list.length > IF.limit ? `<p class="center"><button class="btn alt" id="imore">Show more (${list.length - IF.limit})</button></p>` : ''}`;
  return `${head}<div class="wrap intl-page home-wrap">${spRails(world ? 'world_intl' : String(iIso(code) || code).toLowerCase() + '_intl')}
    ${first ? `<section class="i-first" id="ifirst" aria-label="Matching events">${cnt}${res}</section>` : ''}
    <section class="panel intl-menu intl-panel" aria-labelledby="intlH"><h2 class="sec-h" id="intlH">🌐 International</h2>
      <form id="intlForm" class="intl-form"><label for="intlSel">Country</label><select id="intlSel">${intlOptions(code)}</select><button class="btn" type="submit">Show events →</button>
      <a class="note" href="#/browse">🇦🇺 Australian events are in Find events</a></form>${iCtryStrip(code)}</section>
    ${world ? '' : iHome(code, all)}${spStrip(world ? 'world' : String(iIso(code) || code).toLowerCase(), 'intl')}
    <div class="browse"><div class="filters"><input type="search" id="iq" placeholder="${usa ? 'Search: vegas, nfaa, ibo, texas, CA…' : code === 'DEN' ? 'Search: DM, indoor, 3D, Aarhus, Taastrup…' : code === 'MAS' ? 'Search: indoor, Selangor, Kedah, seminar…' : code === 'KOR' ? 'Search: festival, trials, Jeju, workshop…' : code === 'NZL' ? 'Search: Auckland, Christchurch, 720, NZFAA, 3D…' : code === 'CAN' ? 'Search: Manitoba, BC, MICA, 18m, nationals…' : 'Search event, club, town…'}" value="${esc(IF.q)}" aria-label="Search events in ${esc(nm)}">${IF.q.trim() ? `<p class="note gs-hint">Showing ${world ? 'world' : esc(nm)} events only. <a href="#/search?q=${esc(encodeURIComponent(IF.q.trim()))}">Search every country for “${esc(IF.q.trim())}” →</a></p>` : ''}
      ${world ? `<label for="ictr2" class="sr">Country</label><select id="ictr2" aria-label="Country"><option value="">All countries</option>${wctr.map(c => `<option value="${c}" ${IF.ctry === c ? 'selected' : ''}>${flag(iIso(c))} ${esc(iName(c))}</option>`).join('')}</select>` : ''}
      ${usa ? `<label for="ist" class="sr">State</label><select id="ist" aria-label="US state"><option value="">All states</option>${sts.map(c => `<option value="${c}" ${IF.st === c ? 'selected' : ''}>${esc(US_ST[c])} (${c})</option>`).join('')}</select>` : ''}
      <label for="idisc" class="sr">Discipline</label><select id="idisc" aria-label="Discipline"><option value="">All disciplines</option>${IDISC.map(([d]) => `<option ${IF.disc === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      ${world ? `<label class="chk"><input type="checkbox" id="imajor" ${IF.major ? 'checked' : ''}> 🏆 World majors only</label>` : ''}
      <label class="chk"><input type="checkbox" id="ipast" ${IF.past ? 'checked' : ''}> Include finished</label></div>
    ${usa ? `<div class="chips" role="group" aria-label="Organisation"><button class="chip" data-iorg="" aria-pressed="${!IF.org}">All USA</button>${US_ORGS.map(([k, l]) => `<button class="chip" data-iorg="${k}" aria-pressed="${IF.org === k}">${esc(l)} <small>${all.filter(x => x.us_org === k && (IF.past || !iPast(x))).length}</small></button>`).join('')}</div>` : ''}
    ${nSem ? `<div class="chips" role="group" aria-label="Type of event"><button class="chip" data-icat="" aria-pressed="${!IF.cat}">All</button><button class="chip" data-icat="shoots" aria-pressed="${IF.cat === 'shoots'}">🏹 Events</button><button class="chip" data-icat="seminar" aria-pressed="${IF.cat === 'seminar'}">🎤 Seminars &amp; workshops <small>${nSem}</small></button></div>` : ''}
    ${first ? '' : cnt}</div>
    ${first ? '' : res}
    ${code === 'DEN' ? `<p class="note bd-src">${LOGO['intl-bueskydning-dk'] ? `<img src="${esc(LOGO['intl-bueskydning-dk'].sm)}" alt="Bueskydning Danmark logo" width="32" height="32" style="vertical-align:middle;margin-right:.4em">` : ''}Source: <a href="https://bueskydningdanmark.dk/kalender/" target="_blank" rel="noopener">Bueskydning Danmark's calendar ↗</a> (the national body for archery in Denmark), checked 10 Oct 2026. Event names are as published in Danish; the discipline is given in English. Venues not published yet are marked “to be confirmed”.</p>` : ''}
    ${code === 'MAS' ? iClubsPanel('MAS') : ''}
    ${code === 'MAS' ? `<p class="note my-src">Sources: <a href="https://mareos.masarchery.org/v2/takwim.php" target="_blank" rel="noopener">NAAM's national calendar (Takwim Memanah Kebangsaan 2026, MAREOS) ↗</a>, updated 18 Sep 2026 and checked 10 Oct 2026, and the organising club's own flyer for seminars. Event names are as published; organisers are shown only where NAAM lists them. The 2027 national calendar isn't out yet. World Archery's calendar has no upcoming events in Malaysia.</p>` : ''}
    ${code === 'NZL' ? `<p class="note nz-src">Sources: <a href="https://archeryosa.com/events" target="_blank" rel="noopener">ArcheryOSA ↗</a> (the entry system Archery NZ clubs use), the <a href="https://sites.google.com/view/nz-field-archery-association/events-calendar" target="_blank" rel="noopener">NZ Field Archery Association calendar ↗</a> and <a href="https://nzbowhunters.nz/" target="_blank" rel="noopener">NZ Bowhunters Society ↗</a>, checked 13 Oct 2026. Archery NZ's 2027 national championships aren't published yet. Fees are in NZ dollars.</p>` : ''}
    ${code === 'CAN' ? `<p class="note ca-src">Sources: <a href="https://archerycanada.ca/events-results/" target="_blank" rel="noopener">Archery Canada's calendar ↗</a>, <a href="https://can.service.ianseo.net/General/CompetitionList.php?Year=2026" target="_blank" rel="noopener">Archery Canada's ianseo competition list ↗</a> (registered club events) and <a href="https://archerymanitoba.ca/events/" target="_blank" rel="noopener">Archery Manitoba ↗</a>, checked 13 Oct 2026. Other provincial associations had no upcoming events published online. Fees are in Canadian dollars; times are local.</p>` : ''}
    ${code === 'KOR' ? `<p class="note kr-src">Sources: <a href="https://www.archery.or.kr/competition/schedule" target="_blank" rel="noopener">Korea Archery Association schedule (대한양궁협회 대회일정) ↗</a> and the World Archery calendar, checked 10 Oct 2026. Names are as published in Korean with an English label. The Association's 2027 domestic schedule (Yecheon, Gwangju and the rest) isn't published yet, and no World Cup or Asia Cup stage is in Korea in 2026–27.</p>` : ''}
    <p class="note">${code === 'DEN' ? "Entry details are on each event's Bueskydning Danmark page. Where World Archery's calendar shows different dates, the event page says so – check with the organiser." : !usa ? "Sources: the World Archery calendar (World Cup, World Championships and 3D events registered by each national federation), LA28 (Olympic and Paralympic schedules), World Masters Games 2027 Kansai, World Archery Europe's 2027 events and the IFAA tournament calendar. Outside the USA we list world majors, 3D events and IFAA / continental championships. Details not published yet are left blank or marked TBC, not guessed. Archery is not on the Glasgow 2026 Commonwealth Games programme and is not yet confirmed for 2030." : "Sources: USA Archery's 2027 calendar, the World Archery calendar, and each organiser's official site (NFAA, The Vegas Event, ASA, IBO, TAC, Straight Arrow Bowhunters, Lancaster Archery, and Pro Line Archery Lanes for its seminar). Details not published yet are left blank, not guessed."}</p></div>`;
}
function bindIntl(){
  const rer = sel => { const y = scrollY, was = !!$('#ifirst'); render(); scrollTo(0, y); const e = sel && $(sel); if (e) { e.focus({preventScroll: true}); if (e.type === 'search' || e.type === 'text') e.setSelectionRange(e.value.length, e.value.length); }
    const now = $('#ifirst'); if (!!now !== was) { const t = now || e || $('#iall'); if (t) t.scrollIntoView({block: now ? 'start' : 'center'}); } };   // results moved to/from the top: follow them
  bindIntlMenu(); const c = $('#intlSel'); if (c) c.onchange = () => { location.hash = '#/intl/' + c.value; };
  const q = $('#iq'); if (q) q.onkeydown = e => { if (e.key === 'Enter' && q.value.trim()) { e.preventDefault(); gsGo(q.value); } };
  if (q) q.oninput = () => { IF.q = q.value; IF.limit = 60; clearTimeout(bindIntl.t); bindIntl.t = setTimeout(() => { IF.typing = true; rer('#iq'); IF.typing = false; gcSearch(IF.q); }, 250); };
  const st = $('#ist'); if (st) st.onchange = () => { IF.st = st.value; rer('#ist'); };
  const c2 = $('#ictr2'); if (c2) c2.onchange = () => { IF.ctry = c2.value; IF.limit = 60; rer('#ictr2'); };
  const d = $('#idisc'); if (d) d.onchange = () => { IF.disc = d.value; rer('#idisc'); };
  const p = $('#ipast'); if (p) p.onchange = () => { IF.past = p.checked; rer('#ipast'); };
  const mj = $('#imajor'); if (mj) mj.onchange = () => { IF.major = mj.checked; IF.limit = 60; rer('#imajor'); };
  document.querySelectorAll('[data-icat]').forEach(b => b.onclick = () => { IF.cat = b.dataset.icat; IF.limit = 60; rer(); });
  bindClubBtns($('#view'));
  document.querySelectorAll('[data-iorg]').forEach(b => b.onclick = () => { IF.org = b.dataset.iorg; IF.limit = 60; rer(); });
  const cl = $('#iclr'); if (cl) cl.onclick = () => { Object.assign(IF, {q: '', disc: '', org: '', st: '', ctry: '', major: false, cat: '', limit: 60}); rer('#iq'); };
  const m = $('#imore'); if (m) m.onclick = () => { IF.limit += 60; rer(); };
  document.querySelectorAll('[data-ihst]').forEach(b => b.onclick = () => { IF.st = IF.st === b.dataset.ihst ? '' : b.dataset.ihst; IF.limit = 60; rer(); const a = $('#ifirst') || $('#iall'); if (a) a.scrollIntoView({block: 'start'}); });
}
/* Not found: missing event (old/renamed link) or unknown page. Back link + search pre-filled from the link's words. */
function nfWords(id){ return String(id || '').replace(/^(sub|wa|ad|aba|awa|ian|nfaa|nast|kaa|bd|agb|aa)-/i, '').replace(/[-_+.]+/g, ' ').replace(/\b(19|20)\d\d\b/g, ' ').replace(/\b\d{1,2}\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
function vNotFound(kind, id){
  const ev = kind === 'event'; setTitle(ev ? 'Event not found' : 'Page not found');
  return `<div class="wrap narrow nf-wrap"><section class="panel nf-box" aria-labelledby="nfH">
    <p class="nf-back"><a href="#/browse">← All events</a></p>
    <h1 class="sec" id="nfH">🔎 ${ev ? 'We can’t find that event' : 'Page not found'}</h1>
    <p>${ev ? 'It may have been renamed, merged with another listing or removed, or the link was cut short. Try a search:' : 'That link doesn’t match a page on Archery Calendar. Try a search:'}</p>
    <form class="nf-search" id="nfSearch" role="search"><label class="sr" for="nfq">Search events</label><input id="nfq" type="search" value="${esc(nfWords(id))}" placeholder="Search an event, club or town…" autocomplete="off"><button class="btn gold" type="submit">Search</button></form>
    <div class="nf-links"><a class="btn alt" href="#/browse">← Find events</a><a class="btn alt" href="#/intl">🌐 International</a><a class="btn alt" href="#/home">Home</a></div></section></div>`;
}
function bindNotFound(){ const f = $('#nfSearch'); if (!f) return; f.onsubmit = e => { e.preventDefault(); gsGo($('#nfq').value); }; }
/* Friendly aliases for links people type or share. */
const ROUTE_ALIAS = {find: '#/browse', events: '#/browse', international: '#/intl', world: '#/intl/world', 'my-events': '#/calendar', myevents: '#/calendar', 'whats-new': '#/whatsnew', news: '#/whatsnew', updates: '#/whatsnew', nearme: '#/near', 'near-me': '#/near', nearby: '#/near', 'clubs-near-me': '#/near'};
const KNOWN_PAGES = ['home', 'browse', 'shoot', 'calendar', 'entries', 'settings', 'advertise', 'credits', 'privacy', 'fans', 'account', 'admin', 'cards', 'fix', 'submit', 'calendars', 'club', 'clubs', 'intl', 'import', 'whatsnew', 'near', 'search'];
function route(){
  const h = location.hash || '#/home', last = route.last; route.last = h;
  if (last && last.startsWith('#/intl')) IBACK[last] = scrollY;
  render();
  window.scrollTo(0, h.startsWith('#/intl') && last && last.startsWith('#/shoot/') && IBACK[h] ? IBACK[h] : 0); gcPage(); spNav(); }
function render(){
  const h0 = location.hash || '#/home', h = h0.split('?')[0], HQ = new URLSearchParams(h0.split('?')[1] || ''), [, p, arg] = h.split('/'), v = $('#view');
  if (ROUTE_ALIAS[p]) { location.replace(ROUTE_ALIAS[p] + (h0.includes('?') ? '?' + h0.split('?')[1] : '')); return; }
  document.querySelectorAll('.nav a').forEach(a => { const on = a.dataset.tab === (p || 'home') || (p === 'shoot' && a.dataset.tab === ((BYID[decodeURIComponent(arg || '')] || {})._intl ? 'intl' : 'browse')); a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); }); { const me = $('#navMyEv'); if (me) { const on = p === 'calendar'; me.classList.toggle('on', on); on ? me.setAttribute('aria-current', 'page') : me.removeAttribute('aria-current'); } }
  document.body.dataset.page = p || 'home';
  if (p === 'browse') { v.innerHTML = vBrowse(); bindBrowse(); }
  else if (p === 'shoot') { const id = decodeURIComponent(arg || ''); if (S.clubNew[id]) { delete S.clubNew[id]; save(); }
    if (!BYID[id] && !INTL) { v.innerHTML = '<div class="wrap"><p class="loading">Loading event…</p></div>'; loadIntl().then(() => { if (location.hash.split('?')[0] === h) render(); }).catch(() => { if (location.hash.split('?')[0] === h) { v.innerHTML = vShoot(id); } }); }
    else { v.innerHTML = vShoot(id); bindShoot(id); if (typeof selfBind === 'function') selfBind(id); } }
  else if (p === 'calendar') { v.innerHTML = vCalendar(); bindCalendar(); }
  else if (p === 'entries') v.innerHTML = vEntries();
  else if (p === 'settings') { v.innerHTML = vSettings(); bindSettings(); if (arg === 'clubs') setTimeout(() => { const c = $('#clubs'); c && c.scrollIntoView(); }, 30); }
  else if (p === 'advertise') v.innerHTML = vAdvertise();
  else if (p === 'credits') v.innerHTML = vCredits();
  else if (p === 'privacy') v.innerHTML = vPrivacy();
  else if (p === 'fans') { v.innerHTML = vFans(); bindFans(); }
  else if (p === 'account') { v.innerHTML = vAccount(); const aw = v.querySelector('.wrap.narrow'), ap = aw && AUTH.user ? aw.querySelector('section.panel') : null;
    if (aw) aw.insertAdjacentHTML('afterbegin', cardsAcctPanel()); bindAccount(); setTimeout(appVidPopup, 700); }
  else if (p === 'admin') { v.innerHTML = vAdmin(); bindAdmin(); if (location.hash.split('?')[0] === '#/admin/scores') bindAdmScores(); if (location.hash.split('?')[0] === '#/admin/calendars' && typeof bulkAdminBind === 'function') bulkAdminBind(); }
  else if (p === 'cards') { v.innerHTML = vCards(); bindMCards(); }
  else if ((p === 'fix' || p === 'submit') && !/(?:^|[?&])f?sent=1/.test(location.search) && !(p === 'submit' && (SUBDONE.sid || SUBDONE.upd)) && subGate()) { v.innerHTML = vSubGate(p === 'fix' || arg === 'fix', p === 'submit' && arg === 'bulk'); bindSubGate(); }
  else if (p === 'submit' && arg === 'bulk' && typeof bulkView === 'function') { v.innerHTML = bulkView(); bulkBind(); }
  else if (p === 'fix' || (p === 'submit' && arg === 'fix')) { v.innerHTML = vFix(decodeURIComponent(p === 'fix' ? (arg || '') : (h.split('/')[3] || ''))); bindFix(); }
  else if (p === 'submit') { v.innerHTML = vSubmit(HQ.get('country')); bindSubmit(); }
  else if (p === 'calendars') { v.innerHTML = vCals(arg); bindCals(); }
  else if (p === 'club') { const id = decodeURIComponent(arg || ''); v.innerHTML = vClub(id); bindClub(id); }
  else if (p === 'clubs') { v.innerHTML = vClubs(); bindClubPicker(); }
  else if (p === 'intl') { v.innerHTML = vIntl(arg); bindIntl(arg); }
  else if (p === 'search' && typeof gsView === 'function') { const sq = HQ.get('q') || ''; v.innerHTML = gsView(sq); gsBind(sq); }
  else if (p === 'near' && typeof nmView === 'function') { v.innerHTML = nmView(); nmBind(); }
  else if (p === 'whatsnew' && typeof vWhatsNew === 'function') { v.innerHTML = vWhatsNew(); if (typeof bindWhatsNew === 'function') bindWhatsNew(v); }
  else if (p === 'home' && arg && iso3of(decodeURIComponent(arg)) && iso3of(decodeURIComponent(arg)) !== 'AUS') { const c = iso3of(decodeURIComponent(arg)); if (c === 'WORLD') { location.replace('#/intl/WORLD'); return; } v.innerHTML = vCountryHome(c); bindCountryHome(c); }
  else { const unknown = !!(p && !KNOWN_PAGES.includes(p) && h.startsWith('#/'));
    v.innerHTML = (unknown ? `<div class="wrap"><p class="nf-note" role="status" id="nfNote">⚠ Page not found: <code>${esc(decodeURIComponent(h0).slice(0, 60))}</code> – here’s the home page instead. <a href="#/browse">Find events →</a></p></div>` : '') + vHome();
    v.querySelectorAll('[data-cat]').forEach(a => a.onclick = () => { BF.cat = a.dataset.cat; BF.disc = ''; BF.scope = 'all'; });
    v.querySelectorAll('[data-th]').forEach(a => a.onclick = () => { BF.cat = ''; BF.disc = {field:'Field','3d':'3D',target:'Target',indoor:'Indoor'}[a.dataset.th]; BF.scope = 'all'; });
    bindIntlMenu(); bindClubNotice(); const ya = $('#ycAll'); if (ya) ya.onclick = () => { Object.assign(BF, {club: S.myClubs.length ? 'mine' : 'watch', q: '', cat: '', disc: '', state: '', limit: 60}); };
    $('#heroSearch').onsubmit = e => { e.preventDefault(); gsGo($('#hq').value); }; }
  bindNotFound(); bindCards(v); updateNav(); updateCardsNav();
}
/* ---------- instant publishing (owner 14 Oct 2026) ----------
   Signed-in submissions are saved to Supabase (public.submitted_events). A database trigger sets status: 'live' straight away
   for instant-approved submitters (public.approved_submitters), otherwise 'pending'. Live rows are read by everyone from the
   public.live_events view (no emails/phones) and merged into the calendar, so it works without anyone running a script.
   Flyers go to the public 'event-flyers' bucket (images/PDF, 10 MB). The FormSubmit email still goes out for every submission.
   Needs supabase/instant_publishing.sql. If the table isn't there yet, submissions are email-only exactly as before. */
const SUBDONE = {sid: '', html: '', upd: null};
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#subThanks a[href="#/submit"]'); if (a) { SUBDONE.sid = SUBDONE.html = ''; SUBDONE.upd = null; e.preventDefault(); location.hash === '#/submit' ? render() : (location.hash = '#/submit'); } });
const ADMIN_EMAILS = ['nfshold@gmail.com', 'nfstride1@gmail.com'];   // UI only – the database checks public.admins
const isAdmin = () => !!(AUTH.user && ADMIN_EMAILS.includes(String(AUTH.user.email || '').toLowerCase()));
const FLY_BUCKET = 'event-flyers', FLY_MAX = 10 * 1048576;
const CC3 = {AU: 'AUS', US: 'USA'};
const pendCard = r => { const u = r.flyer_url || r.flyer_link || '', pdf = /\.pdf($|\?)/i.test(u), img = r.flyer_url && !pdf;
  return `<a class="pend-card" href="${esc(u)}" target="_blank" rel="noopener">${img ? `<img src="${esc(r.flyer_url)}" alt="Flyer from ${esc(r.club || 'a club')}" loading="lazy">` : `<span class="pend-ic" aria-hidden="true">${pdf ? '📄' : '🔗'}</span>`}
    <span class="pend-txt"><b>${esc(r.club || 'New flyer')}</b><span class="tag pend-tag">Details coming</span><span class="note">Open the flyer ↗</span></span></a>`; };
const pendStrip = () => FLYQ.rows.length ? `<section class="pend-strip" aria-label="New flyers, details coming"><h2 class="sec-h">New flyers, details coming</h2>
  <p class="note">Just in from clubs. We're adding the dates from the flyers now.</p><div class="pend-row">${FLYQ.rows.map(pendCard).join('')}</div></section>` : '';
function subToEv(r){
  const pdf = /\.pdf($|\?)/i.test(r.flyer_url || ''), y = r.start_date ? +r.start_date.slice(0, 4) : null;
  const ev = {id: 'sub-' + r.id, _sub: r.id, name: r.name, org: r.club, org_id: 'club-submission', org_group: 'club', club_name: r.club, country_code: CC3[r.country] || r.country || '', country: r.country === 'AU' ? 'Australia' : r.country === 'US' ? 'United States' : (r.country || ''),
    state: r.state || null, state_code: r.state || null, start_date: r.start_date, end_date: r.end_date || r.start_date, dates_confirmed: true, location: r.venue, discipline: r.discipline || 'Target',
    level: 'Club', category: 'competition', registration_url: r.registration_url || null, register: Array.isArray(r.register) && r.register.length ? r.register : undefined, notes: r.notes || null, source_url: r.flyer_link || null, last_checked: (r.created_at || '').slice(0, 10),
    flyer_year: r.flyer_url ? y : null, flyer_is_current: true, flyer_kind: 'Flyer', flyer_label: 'Flyer from the club', flyer_web: r.flyer_url || null, flyer_web_sm: r.flyer_url ? (pdf ? 'icons/icon-512.png' : r.flyer_url) : null,
    flyer_is_pdf: pdf, flyer_org: r.club, flyer_source_url: pdf ? r.flyer_url : null, flyer_extract: r.notes ? {notes: r.notes, is_current: true} : null};
  return clubDefaults(ev);
}
/* Club-level default (clubs.json default_open_groups / default_open_match): e.g. Bowmen of Melville 3D and Looking Glass shoots are open to AA & TAA members. */
function clubDefaults(ev){
  const n = snorm(ev.club_name || ''), c = CLUBS.find(k => k.default_open_groups && [k.name, ...(k.aliases || [])].some(a => snorm(a) === n));
  if (!c) return ev;
  ev.club_id = ev.club_id || c.id;
  if (new RegExp(c.default_open_match || '.', 'i').test(`${ev.name} ${ev.discipline || ''}`)) Object.assign(ev, {also_groups: c.default_open_groups.slice(), level: 'Open competition', category: 'competition'});
  return ev;
}
/* Public read of live club submissions – plain REST with the publishable key, no library needed. */
/* Admin live edits: public.event_overrides (supabase/event_overrides.sql) merged over events.json / intl.json. */
const OVR = {};
const OVR_KEYS = ['name', 'discipline', 'start_date', 'end_date', 'start_times', 'location', 'rounds', 'divisions', 'entry_close_date', 'contact', 'register', 'bank_account_name', 'bank_bsb', 'bank_account', 'bank_reference', 'registration_url', 'registration_url_kind', 'cancelled', 'notes',
  'flyer_url', 'flyer_web', 'flyer_web_sm', 'flyer_is_pdf', 'flyer_label', 'flyer_year', 'flyer_is_current', 'flyer_source_name', 'org_status', 'last_checked'];
function applyOvr(x, f){ OVR_KEYS.forEach(k => { if (f && k in f && !((k === 'name' || k === 'start_date') && !f[k])) x[k] = f[k]; }); delete x._hay; x._ovr = true; return x; }   // never blanks a name or start date
async function loadOverrides(){
  if (!AUTH.configured) return 0;
  try { const r = await fetch(SB_URL.replace(/\/$/, '') + '/rest/v1/event_overrides?select=event_id,fields', {headers: {apikey: SB_KEY}, cache: 'no-cache'});
    if (!r.ok) return 0; const rows = await r.json(); let n = 0;
    rows.forEach(o => { OVR[o.event_id] = o.fields || {}; const x = BYID[o.event_id]; if (x) { applyOvr(x, OVR[o.event_id]); n++; } });
    if (n) EV.sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
    return n; } catch { return 0; }
}
/* Flyer-only live (owner 20 Oct 2026, supabase/flyer_only_publishing.sql): approved flyers with no name/date yet are live with
   details_pending = true. They show in the "New flyers, details coming" strip, never as dated events. FLYQ.ok = the SQL is live. */
const FLYQ = {ok: false, rows: []};
/* Country/state corrections for named live submissions (owner 26 Oct 2026): data/submission_overrides.json, keyed by submission id.
   Only country (2 letters) and state (2-3 letters) are read; unknown ids and any other field are ignored. Applied before routing, display only. */
async function subFixes(rows){
  try { const r = await fetch('data/submission_overrides.json', {cache: 'no-cache'}); if (!r.ok) return; const o = (await r.json() || {}).overrides || {};
    rows.forEach(row => { const f = Object.prototype.hasOwnProperty.call(o, row.id) && o[row.id]; if (!f || typeof f !== 'object') return;
      if (typeof f.country === 'string' && /^[A-Za-z]{2}$/.test(f.country)) row.country = f.country.toUpperCase();
      if (typeof f.state === 'string' && /^[A-Za-z]{2,3}$/.test(f.state)) row.state = f.state.toUpperCase(); }); } catch {}
}
async function loadLiveSubs(){
  if (!AUTH.configured) return 0;
  try { const base = SB_URL.replace(/\/$/, '') + '/rest/v1/live_events?order=start_date.asc.nullslast&select=', hd = {headers: {apikey: SB_KEY}};
    let r = await fetch(base + '*,details_pending', hd); FLYQ.ok = r.ok;
    if (!r.ok) r = await fetch(base + '*', hd);   // before flyer_only_publishing.sql: same as before
    if (!r.ok) return 0; const rows = await r.json(); let n = 0;
    await subFixes(rows);   // data/submission_overrides.json: country/state corrections for named live submissions
    FLYQ.rows = rows.filter(row => row.details_pending || !row.start_date); n += FLYQ.rows.length;
    rows.filter(row => !(row.details_pending || !row.start_date)).forEach(row => { const x = subToEv(row);
      if (row.country && !/^(AU|AUS|Australia)$/i.test(row.country)) { const us = /^(US|USA)$/i.test(row.country); if (us && US_ST[row.state]) x.us_state = row.state; apiIntl(x, row); if (us) Object.assign(x, {country_code: 'USA', country_name: 'United States', iso2: 'US'}); return; }   // overseas submission: that country's page, not Find events
      if (!BYID[x.id]) { EV.push(x); n++; } BYID[x.id] = Object.assign(BYID[x.id] || {}, x); });
    if (n) EV.sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
    return n; } catch { return 0; }
}
/* Club events API (owner 21 Oct 2026, supabase/functions/club-events, docs club-api.html): trusted clubs push their own events
   from their own software. The function writes the public fields to storage club-api-public/events.json; this merges them in.
   Everything is escaped on display like every other event. */
const API_REG_URL = ['archers_diary', 'iscored', 'assemble', 'trybooking', 'eventbrite', 'online_form', 'website'];
function apiToEv(r){
  const pdf = /\.pdf($|\?)/i.test(r.flyer_url || ''), reg = [];
  if (API_REG_URL.includes(r.entry_method) && /^https?:\/\//i.test(r.entry_link || '')) reg.push({m: r.entry_method, url: r.entry_link});
  if (r.entry_method === 'email' && r.entry_email) reg.push({m: 'email', email: r.entry_email});
  if (r.entry_method === 'day') reg.push({m: 'day'});
  if (r.bank_bsb || r.bank_account) reg.push({m: 'bank', acct_name: r.bank_account_name || '', bsb: r.bank_bsb || '', acct: r.bank_account || '', ref: r.bank_reference || ''});
  const ev = {id: ('api-' + r.club_slug + '-' + r.id).replace(/[^A-Za-z0-9_-]/g, '-'), _api: true, name: r.title, org: r.club, org_id: 'club-submission', org_group: 'club', club_name: r.club,
    country_code: CC3[r.country] || r.country || '', country: r.country === 'AU' ? 'Australia' : (r.country || ''), state: r.state || null, state_code: r.state || null,
    start_date: r.start_date, end_date: r.end_date || r.start_date, dates_confirmed: true, location: r.venue, discipline: r.shoot_type || 'Target', level: 'Club', category: 'competition',
    start_times: r.start_time || null, rounds: r.rounds || null, entry_close_date: r.entry_close_date || null, registration_url: /^https?:\/\//i.test(r.entry_link || '') ? r.entry_link : null,
    register: reg.length ? reg : undefined, notes: r.notes || null, cancelled: !!r.cancelled, last_checked: String(r.updated_at || '').slice(0, 10),
    flyer_year: r.flyer_url ? +r.start_date.slice(0, 4) : null, flyer_is_current: true, flyer_kind: 'Flyer', flyer_label: 'Flyer from the club', flyer_web: r.flyer_url || null,
    flyer_web_sm: r.flyer_url ? (pdf ? 'icons/icon-512.png' : r.flyer_url) : null, flyer_is_pdf: pdf, flyer_org: r.club, flyer_source_url: pdf ? r.flyer_url : null};
  return clubDefaults(ev);
}
async function loadClubApi(){
  if (!SB_URL) return 0;
  try { const r = await fetch(SB_URL.replace(/\/$/, '') + '/storage/v1/object/public/club-api-public/events.json', {cache: 'no-cache'});
    if (!r.ok) return 0; const d = await r.json(); let n = 0;
    (Array.isArray(d.events) ? d.events : []).filter(e => e && e.id && e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.start_date || '')).forEach(row => {
      const x = apiToEv(row);
      if (row.country && !/^(AU|AUS|Australia)$/i.test(row.country)) { apiIntl(x, row); return; }   // overseas organiser keys go to that country's page, not Find events
      if (!BYID[x.id]) { EV.push(x); n++; } BYID[x.id] = Object.assign(BYID[x.id] || {}, x); });
    if (n) EV.sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
    return n; } catch { return 0; }
}
/* Save a submission. Returns {id, status, flyer_url} or null (not signed in / table not set up / error → email-only). */
async function dbSubmit(rec, file){
  if (!AUTH.client || !AUTH.user) return null;
  try {
    let flyer_path = null, flyer_url = null;
    if (file && file.size <= FLY_MAX && (/^image\//.test(file.type) || /pdf/.test(file.type) || /\.pdf$/i.test(file.name))) {
      const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i) || [, /pdf/.test(file.type) ? 'pdf' : 'jpg'])[1].toLowerCase();
      flyer_path = `${AUTH.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await AUTH.client.storage.from(FLY_BUCKET).upload(flyer_path, file, {contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'), upsert: false});
      if (up.error) flyer_path = null; else flyer_url = AUTH.client.storage.from(FLY_BUCKET).getPublicUrl(flyer_path).data.publicUrl;
    }
    const row = Object.assign({}, rec, {flyer_path, flyer_url, start_date: rec.start_date || null, end_date: rec.end_date || rec.start_date || null});
    if (!row.start_date && !flyer_url && !row.flyer_link) return null;   // flyer only, but the upload failed: email it instead
    let {data, error} = await AUTH.client.from('submitted_events').insert(row).select('id,status,flyer_url,details_pending').single();
    if (error && /details_pending/i.test(error.message || '')) ({data, error} = await AUTH.client.from('submitted_events').insert(row).select('id,status,flyer_url').single());
    if (error && /register/i.test(error.message || '')) { delete row.register; ({data, error} = await AUTH.client.from('submitted_events').insert(row).select('id,status,flyer_url').single()); }   // before event_overrides.sql adds the column
    if (error) { console.warn('Archery Calendar: submission not saved to the database (email still sent):', error.message); return null; }
    return data;
  } catch (e) { console.warn('Archery Calendar: submission not saved to the database:', e); return null; }
}
/* Thanks page after FormSubmit sends people back with ?sid=: live → show the finished event card; pending → waiting for review. */
async function subDoneLoad(sid){
  const box = () => $('#subThanks'); let tries = 0;
  while (!(AUTH.ready && AUTH.client) && tries++ < 40) await new Promise(r => setTimeout(r, 250));
  let row = null;
  try { if (AUTH.client) { const {data} = await AUTH.client.from('submitted_events').select('*').eq('id', sid).maybeSingle(); row = data; } } catch {}
  const b = {set innerHTML(h){ SUBDONE.html = h; }};
  if (row && row.status === 'live' && (row.details_pending || !row.start_date)) {
    if (!FLYQ.rows.some(r => r.id === row.id)) FLYQ.rows.unshift(row);
    b.innerHTML = `<span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">🎉 Your flyer is live</h2>
      <p>It's on the site now under <b>New flyers, details coming</b>. Live now, we'll add the dates from your flyer shortly.</p>
      <div class="pend-row">${pendCard(row)}</div>
      <div class="row"><a class="btn gold" href="#/">See it on the home page</a><a class="btn alt" href="#/submit">Send another event</a></div>`;
  } else if (row && row.status === 'live') {
    const x = subToEv(row); if (!BYID[x.id]) EV.push(x); BYID[x.id] = x;
    b.innerHTML = `<span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">🎉 Your event is live</h2>
      <p>You’re an approved submitter, so <b>${esc(row.name)}</b> is on the calendar now. Share the link with your club.</p>
      <div class="live-card">${evCard(x)}</div>
      <p class="live-link"><a href="#/shoot/${esc(x.id)}">${esc(location.origin + location.pathname)}#/shoot/${esc(x.id)}</a> <button type="button" class="btn sm" id="liveCopy">Copy link</button></p>
      <div class="row"><a class="btn gold" href="#/shoot/${esc(x.id)}">Open your event</a><a class="btn alt" href="#/submit">Send another event</a></div>`;
  } else {
    b.innerHTML = `<span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Thanks, it’s waiting for review</h2>
      <p>We’ll check ${row ? `<b>${esc(row.name)}</b>` : 'your event'} and put it on the calendar, usually within 48 hours. Once your club is approved, your next events go live straight away.</p>
      <div class="row"><a class="btn gold" href="#/submit">Send another event</a><a class="btn alt" href="#/browse">Find events</a></div>`;
  }
  if (document.body.dataset.page !== 'submit') return;
  render(); bindCards($('#view'));
  const c = $('#liveCopy'); if (c) c.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.origin + location.pathname + '#/shoot/sub-' + sid); toast('Link copied'); };
  const t = $('#subThanks'); t && t.focus();
}
/* ---------- #/admin: review club submissions (admins only; the database enforces it with public.is_admin()) ---------- */
const ADM = {rows: null, subs: null, err: '', tab: 'pending'};
function vAdmin(){
  setTitle('Admin');
  const head = pageHead('Admin', 'Club submissions', 'mixed');
  if (!AUTH.ready) return `${head}<div class="wrap"><p class="loading">Checking sign-in…</p></div>`;
  if (!isAdmin()) return `${head}<div class="wrap narrow"><section class="panel"><p>This page is only for Archery Calendar admins. <a href="#/account">Sign in</a></p></section></div>`;
  if (location.hash.split('?')[0] === '#/admin/calendars' && typeof bulkAdminView === 'function') return bulkAdminView();
  if (!ADM.rows) { admLoad(); return `${head}<div class="wrap"><p class="loading">Loading submissions…</p></div>`; }
  if (location.hash.split('?')[0] === '#/admin/approved') return vAdmApproved(head);
  if (location.hash.split('?')[0] === '#/admin/scores') return vAdmScores(head);
  const inst = new Map((ADM.subs || []).map(s => [String(s.email).toLowerCase(), s]));
  const reqs = (ADM.reqs || []).filter(q => q.status === 'pending' && !(inst.get(q.email) || {}).instant);
  const reqHtml = `<section class="panel adm-reqs"><h2 class="sec">People asking to add shoots (${reqs.length})</h2>${reqs.length ? reqs.map(q => `<div class="adm-req" data-rid="${esc(q.id)}"><div><b>${esc(q.name || '(no name)')}</b>${q.role ? ' · ' + esc(q.role) : ''}<br>${esc(q.club || '')}<br><span class="note">${esc(q.email)} · ${q.source === 'email' ? '✉️ email' : '📝 form'} · ${esc(new Date(q.created_at).toLocaleDateString(LOC()))}</span>${q.note ? `<br><span class="note">${esc(q.note)}</span>` : ''}</div>
      <div class="adm-btns row"><button class="btn gold" data-ract="approve">✓ Approve</button><button class="btn alt" data-ract="delete">✕ Delete</button></div></div>`).join('') : '<p class="note">No one waiting. 🎉</p>'}<p><a href="#/admin/approved">Approved people (${(ADM.subs || []).length}) · add someone →</a></p><p><a href="#/admin/scores">Self-reported scores · remove entries →</a></p></section>`;
  const rows = ADM.rows.filter(r => ADM.tab === 'all' || r.status === ADM.tab);
  const tabs = ['pending', 'live', 'rejected', 'all'].map(t => `<button type="button" class="btn sm ${ADM.tab === t ? 'gold' : 'alt'}" data-atab="${t}">${t[0].toUpperCase() + t.slice(1)} (${t === 'all' ? ADM.rows.length : ADM.rows.filter(r => r.status === t).length})</button>`).join(' ');
  const one = r => { const em = String(r.submitter_email || '').toLowerCase(), s = inst.get(em), pdf = /\.pdf/i.test(r.flyer_url || ''), uid = r.updates_event_id, ut = uid && BYID[uid];
    const uHtml = !uid ? '' : `<p class="adm-upd"><b>Update to a listed event:</b> <a href="#/shoot/${esc(encodeURIComponent(uid))}">${esc(ut ? ut.name : uid)}</a>${r.applied_at ? ` <span class="note">(applied ${esc(new Date(r.applied_at).toLocaleString('en-AU'))})</span>` : ''}</p>
      <ul class="adm-chg">${Object.entries(r.merge_fields || {}).filter(([k]) => !/^(flyer_(?!web$)|bank_|last_checked|registration_url_kind|org_status)/.test(k)).map(([k, v]) => `<li><b>${esc(k === 'flyer_web' ? 'flyer' : k)}</b>: ${esc(Array.isArray(v) ? regText(v).replace(/\n/g, ' · ') : String(v))}</li>`).join('')}</ul>`;
    return `<article class="panel adm-row" data-id="${esc(r.id)}"><div class="adm-fl">${r.flyer_url ? `<a href="${esc(r.flyer_url)}" target="_blank" rel="noopener">${pdf ? '📄 PDF flyer ↗' : `<img src="${esc(r.flyer_url)}" alt="Flyer" loading="lazy">`}</a>` : r.flyer_link ? `<a href="${esc(r.flyer_link)}" target="_blank" rel="noopener">🔗 Flyer link ↗</a>` : '<span class="note">No flyer</span>'}</div>
      <div class="adm-body"><p><span class="tag st-${esc(r.status)}">${esc(r.status)}</span> <span class="note">${esc(new Date(r.created_at).toLocaleString('en-AU'))}</span></p>
      ${uHtml}<h3>${esc(r.name)}${r.details_pending ? ' <span class="tag pend-tag">Details coming</span>' : ''}</h3><p>${r.start_date ? esc(r.start_date) : 'No date yet'}${r.end_date && r.end_date !== r.start_date ? ' to ' + esc(r.end_date) : ''} · ${esc(r.venue || '')} · ${esc(r.discipline || '')}</p>
      <p><b>${esc(r.club)}</b> (${esc([r.state, r.country].filter(Boolean).join(', '))}) – ${esc(r.organisation_type || '')}</p>
      <p>From <b>${esc(r.submitter_name || '')}</b>, ${esc(r.role || '')} · ${esc(r.submitter_email || '')}${r.contact_email && r.contact_email !== r.submitter_email ? ' · contact ' + esc(r.contact_email) : ''}</p>
      ${safeHttp(r.registration_url) ? `<p>Entry: <a href="${esc(safeHttp(r.registration_url))}" target="_blank" rel="noopener">${esc(r.registration_url)}</a></p>` : ''}${r.notes ? `<p class="note">${esc(r.notes)}</p>` : ''}
      <div class="row adm-btns">${r.status !== 'live' ? `<button class="btn gold sm" data-act="live">${uid ? '✓ Approve update' : '✓ Approve'}</button>` : `<a class="btn alt sm" href="#/shoot/${uid ? esc(encodeURIComponent(uid)) : 'sub-' + esc(r.id)}">${uid ? 'View event' : 'View live'}</a>`}${uid && r.applied_at && r.status === 'live' ? `<button class="btn alt sm" data-act="undo">↩ Undo update</button>` : r.status !== 'rejected' ? `<button class="btn alt sm" data-act="rejected">✕ Reject</button>` : ''}${uid ? '' : `<button class="btn alt sm" data-act="edit">✏️ Edit</button>`}<button class="btn alt sm" data-act="delete">🗑 Delete</button>
      <label class="chk adm-inst"><input type="checkbox" data-inst="${esc(em)}" data-club="${esc(r.club)}" data-name="${esc(r.submitter_name || '')}" ${s && s.instant ? 'checked' : ''}> Instant-approve ${esc(em)}</label></div></div></article>`; };
  return `${head}<div class="wrap adm"><section class="panel"><p>${tabs} <button type="button" class="btn sm alt" id="admReload">↻ Reload</button></p>${ADM.err ? `<p class="err" role="alert">${esc(ADM.err)}</p>` : ''}</section>
    ${reqHtml}<h2 class="sec">Shoots sent in</h2>
    ${rows.length ? rows.map(one).join('') : '<p class="empty">Nothing here.</p>'}</div>`;
}
function vAdmApproved(head){
  const subs = (ADM.subs || []).filter(s => s.instant);
  return `${head}<div class="wrap adm"><p><a href="#/admin">← Back to requests</a></p>${ADM.err ? `<p class="err" role="alert">${esc(ADM.err)}</p>` : ''}
    <section class="panel"><h2 class="sec">Add someone</h2><form id="admAdd" class="adm-add"><input name="name" placeholder="Name" autocomplete="off" required><input name="email" type="email" placeholder="Email" autocomplete="off" required><input name="club" placeholder="Club" autocomplete="off"><button class="btn gold">✓ Approve</button></form></section>
    <section class="panel"><h2 class="sec">Approved people (${subs.length})</h2>${subs.length ? subs.map(s => `<div class="adm-req" data-sem="${esc(s.email)}"><div><b>${esc(s.name || '')}</b><br>${esc(s.club || '')}<br><span class="note">${esc(s.email)}</span></div><div class="adm-btns row"><button class="btn alt" data-sact="remove">Remove</button></div></div>`).join('') : '<p class="note">No one yet.</p>'}</section>
    <section class="panel"><h2 class="sec">Approved club &amp; organisation email domains (${(ADM.doms || []).length})</h2><p class="note">Anyone emailing from these is approved automatically. Gmail, Hotmail, Bigpond and other free email can’t be added.</p>
      <form id="admDom" class="adm-add"><input name="domain" placeholder="e.g. archerywa.com.au" autocomplete="off" required><input name="label" placeholder="Club / organisation" autocomplete="off"><button class="btn gold">+ Add domain</button></form>
      ${(ADM.doms || []).map(d => `<div class="adm-req" data-dom="${esc(d.domain)}"><div><b>@${esc(d.domain)}</b><br><span class="note">${esc(d.label || '')}</span></div><div class="adm-btns row"><button class="btn alt" data-dact="remove">Remove</button></div></div>`).join('')}</section></div>`;
}
async function admLoad(){
  ADM.err = '';
  try { const [a, b] = await Promise.all([AUTH.client.from('submitted_events').select('*').order('created_at', {ascending: false}).limit(300), AUTH.client.from('approved_submitters').select('*').order('club')]);
    if (a.error) throw a.error; if (b.error) throw b.error; ADM.rows = a.data; ADM.subs = b.data;
    const c = await AUTH.client.from('submitter_requests').select('*').eq('status', 'pending').order('created_at', {ascending: false});
    const dm = await AUTH.client.from('approved_domains').select('*').order('domain'); ADM.doms = dm.error ? [] : dm.data;
    ADM.reqs = c.error ? [] : c.data; if (c.error) ADM.err = 'Requests list needs supabase/admin_requests.sql to be run once.';
  } catch (e) { ADM.rows = ADM.rows || []; ADM.subs = ADM.subs || []; ADM.err = 'Couldn’t load: ' + (e.message || e) + ' (has supabase/instant_publishing.sql been run?)'; }
  if (document.body.dataset.page === 'admin') softRenderForce();
}
function bindAdmin(){
  const v = $('#view');
  v.querySelectorAll('[data-atab]').forEach(b => b.onclick = () => { ADM.tab = b.dataset.atab; softRenderForce(); });
  const rl = $('#admReload'); if (rl) rl.onclick = () => { ADM.rows = null; softRenderForce(); };
  v.querySelectorAll('.adm-row [data-act]').forEach(b => b.onclick = async () => {
    const id = b.closest('.adm-row').dataset.id, r = ADM.rows.find(x => x.id === id), act = b.dataset.act; let patch;
    if (act === 'delete') { if (!confirm('Delete “' + r.name + '” for good?')) return; b.disabled = true;
      const {error} = await AUTH.client.from('submitted_events').delete().eq('id', id);
      if (error) { toast('Not deleted: ' + error.message); b.disabled = false; return; }
      ADM.rows = ADM.rows.filter(x => x.id !== id); FLYQ.rows = FLYQ.rows.filter(x => x.id !== id); EV = EV.filter(x => x.id !== 'sub-' + id); delete BYID['sub-' + id];
      toast('Deleted'); softRenderForce(); return; }
    if (act === 'undo') { if (!confirm('Undo this update to “' + ((BYID[r.updates_event_id] || r).name) + '”? The event goes back to how it was just before it. Any later fixes to that event are undone too.')) return; b.disabled = true;
      const prev = r.prev_fields || {}, q = Object.keys(prev).length ? await AUTH.client.from('event_overrides').upsert({event_id: r.updates_event_id, fields: prev}, {onConflict: 'event_id'}) : await AUTH.client.from('event_overrides').delete().eq('event_id', r.updates_event_id);
      if (q.error) { toast('Not undone: ' + q.error.message); b.disabled = false; return; }
      const u = await AUTH.client.from('submitted_events').update({status: 'rejected'}).eq('id', id).select('*').single(); if (!u.error) Object.assign(r, u.data); else r.status = 'rejected';
      if (Object.keys(prev).length) OVR[r.updates_event_id] = prev; else delete OVR[r.updates_event_id];
      toast('Update undone. Reload the page to see the event as it was.'); softRenderForce(); return; }
    if (act === 'edit') { const f = [['club', 'Club'], ['name', 'Event name'], ['start_date', 'Start date (YYYY-MM-DD)'], ['end_date', 'End date (YYYY-MM-DD)'], ['venue', 'Venue'], ['discipline', 'Type'], ['registration_url', 'Entry link'], ['notes', 'Notes']];
      patch = {}; for (const [k, l] of f) { const nv = prompt(l, r[k] || ''); if (nv === null) return; if (nv !== (r[k] || '')) patch[k] = nv || null; } if (!Object.keys(patch).length) return; }
    else patch = {status: act};
    b.disabled = true;
    const {data, error} = await AUTH.client.from('submitted_events').update(patch).eq('id', id).select('*').single();
    if (error) { toast('Not saved: ' + error.message); b.disabled = false; return; }
    Object.assign(r, data); FLYQ.rows = FLYQ.rows.filter(x => x.id !== id); if (data.status === 'live' && (data.details_pending || !data.start_date)) FLYQ.rows.unshift(data); else if (data.status === 'live' && data.updates_event_id) loadOverrides().then(softRenderForce, () => {}); else if (data.status === 'live') { const x = subToEv(data); if (!BYID[x.id]) EV.push(x); BYID[x.id] = x; } else if (BYID['sub-' + id]) { EV = EV.filter(x => x.id !== 'sub-' + id); delete BYID['sub-' + id]; }
    toast(act === 'live' && data.updates_event_id ? 'Approved – the listed event is updated' : act === 'live' ? 'Approved – it’s live' : act === 'rejected' ? 'Rejected' : 'Saved'); softRenderForce(); });
  v.querySelectorAll('[data-ract]').forEach(b => b.onclick = async () => {
    const el = b.closest('.adm-req'), id = el.dataset.rid, q = (ADM.reqs || []).find(x => x.id === id); el.querySelectorAll('button').forEach(x => x.disabled = true);
    const {error} = b.dataset.ract === 'approve' ? await AUTH.client.rpc('approve_request', {p_id: id}) : await AUTH.client.from('submitter_requests').update({status: 'deleted', decided_at: new Date().toISOString()}).eq('id', id);
    if (error) { toast('Not saved: ' + error.message); el.querySelectorAll('button').forEach(x => x.disabled = false); return; }
    ADM.reqs = ADM.reqs.filter(x => x.id !== id); if (b.dataset.ract === 'approve' && q) ADM.subs = (ADM.subs || []).concat({email: q.email, name: q.name, club: q.club, instant: true});
    toast(b.dataset.ract === 'approve' ? `Approved – ${q && q.name || 'their'} shoots now go live straight away` : 'Request deleted'); softRenderForce(); });
  v.querySelectorAll('[data-sact]').forEach(b => b.onclick = async () => {
    const em = b.closest('[data-sem]').dataset.sem; if (!confirm('Remove ' + em + '? Their next shoots will need approving again.')) return; b.disabled = true;
    const {error} = await AUTH.client.from('approved_submitters').delete().eq('email', em);
    if (error) { toast('Not removed: ' + error.message); b.disabled = false; return; }
    ADM.subs = ADM.subs.filter(s => s.email !== em); toast('Removed'); softRenderForce(); });
  v.querySelectorAll('[data-dact]').forEach(b => b.onclick = async () => { const d = b.closest('[data-dom]').dataset.dom; if (!confirm('Remove @' + d + '?')) return; b.disabled = true;
    const {error} = await AUTH.client.from('approved_domains').delete().eq('domain', d); if (error) { toast('Not removed: ' + error.message); b.disabled = false; return; }
    ADM.doms = ADM.doms.filter(x => x.domain !== d); toast('Removed'); softRenderForce(); });
  const df = $('#admDom'); if (df) df.onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(df)), d = String(f.domain).trim().toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (/^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|bigpond|icloud|me|mac|aol|proton|protonmail|iinet|optusnet|tpg|westnet|internode|dodo|gmx|mail|zoho)\./.test(d)) { toast('Free email like @' + d + ' can’t be auto-approved'); return; }
    const {error} = await AUTH.client.from('approved_domains').upsert({domain: d, label: f.label.trim() || null}, {onConflict: 'domain'}); if (error) { toast('Not saved: ' + error.message); return; }
    ADM.doms = (ADM.doms || []).filter(x => x.domain !== d).concat({domain: d, label: f.label.trim()}).sort((a, b) => a.domain < b.domain ? -1 : 1); toast('Added @' + d); softRenderForce(); };
  const af = $('#admAdd'); if (af) af.onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(af)), em = String(d.email).trim().toLowerCase();
    const {error} = await AUTH.client.from('approved_submitters').upsert({email: em, name: d.name.trim(), club: d.club.trim() || null, instant: true}, {onConflict: 'email'});
    if (error) { toast('Not saved: ' + error.message); return; }
    await AUTH.client.from('submitter_requests').update({status: 'approved', decided_at: new Date().toISOString()}).eq('email', em).eq('status', 'pending');
    ADM.subs = (ADM.subs || []).filter(s => s.email !== em).concat({email: em, name: d.name.trim(), club: d.club.trim(), instant: true}); ADM.reqs = (ADM.reqs || []).filter(q => q.email !== em);
    toast('Approved ' + d.name); softRenderForce(); };
  v.querySelectorAll('[data-inst]').forEach(c => c.onchange = async () => {
    const {error} = await AUTH.client.from('approved_submitters').upsert({email: c.dataset.inst, club: c.dataset.club, name: c.dataset.name, instant: c.checked}, {onConflict: 'email'});
    if (error) { toast('Not saved: ' + error.message); c.checked = !c.checked; return; }
    toast(c.checked ? 'Instant approval on' : 'Instant approval off'); ADM.subs = null; ADM.rows = null; softRenderForce(); });
}
/* ---------- known clubs: label submissions for review (never auto-publishes) ----------
   data/known_clubs.json holds salted SHA-256 hashes of verified clubs' emails and own email domains (built by tools/build_known_clubs.py
   from the private research/known_clubs.json). A match puts '[KNOWN CLUB] ' in front of the email subject and known_club=yes; otherwise
   '[NEW SUBMITTER] ' and known_club=no. */
const KC = {p: null, memo: {}};
const KC_SALT = 'archerycalendar-known-club:v1:';
const kcNorm = e => { e = String(e || '').trim().toLowerCase(); const i = e.lastIndexOf('@'); return i < 1 ? e : e.slice(0, i).split('+')[0] + e.slice(i); };
const kcHash = async s => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(KC_SALT + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
const kcLoad = () => KC.p = KC.p || fetch('data/known_clubs.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : {}).catch(() => ({}));
async function kcCheck(email){
  const n = kcNorm(email); if (n in KC.memo) return KC.memo[n];
  let known = false;
  try { if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(n) && window.crypto && crypto.subtle) { const j = await kcLoad();
    known = (j.emails || []).includes(await kcHash(n)) || (j.domains || []).includes(await kcHash(n.slice(n.lastIndexOf('@')))); } } catch { known = false; }
  return (KC.memo[n] = known);
}
const kcTag = known => known ? '[KNOWN CLUB] ' : '[NEW SUBMITTER] ';
/* Sets known_club + subject prefix, then lets the browser post. If the check for this email hasn't finished yet, wait for it, then post. */
function kcSubmit(e, fm, email, setSubject){
  const n = kcNorm(email), apply = k => { fm.querySelector('[name=known_club]').value = k ? 'yes' : 'no'; setSubject(kcTag(k)); };
  if (n in KC.memo) { apply(KC.memo[n]); return; }
  e.preventDefault();
  Promise.race([kcCheck(email), new Promise(r => setTimeout(() => r(false), 4000))]).then(k => { apply(k); HTMLFormElement.prototype.submit.call(fm); });
}
/* ---------- submit an event (clubs) ----------
   Static site, no backend: the form POSTs (multipart, with the flyer file) to SITE.formEndpoint (FormSubmit), which emails
   SITE.contact. If no endpoint is configured, or the browser is offline, "Email it instead" builds a pre-filled email. */
/* Archery Australia's Recognised Governing Bodies (archery.org.au, Oct 2026). Queensland is split North/South; there is no NT body. */
const AA_STATE_BODIES = [['Archery NSW', 'NSW'], ['Archery ACT', 'ACT'], ['Archery Victoria', 'VIC'], ['Archery Tasmania', 'TAS'], ['Archery SA (South Australia)', 'SA'], ['Archery WA', 'WA'],
  ['North Queensland Archery (NQAA)', 'QLD'], ['South Queensland Archery (SQAS)', 'QLD']];
const ORG_TYPES = ['Archery Australia club', ...AA_STATE_BODIES.map(b => b[0]), 'ABA club or branch', 'TAA club (Traditional Archery Australia)', 'Other'];
/* Flyer-only submit (owner 20 Oct 2026): the flyer is all we need. Admins and approved submitters (approved_submitters / approved_domains,
   checked with public.email_preapproved) skip the identity questions and publish straight away; everyone else needs the flyer + an email. */
const SUBAPP = {};   // email -> true/false (approved), cached for this visit
const subApproved = () => { const em = String(AUTH.user && AUTH.user.email || '').toLowerCase(); return !!em && (isAdmin() || SUBAPP[em] === true); };
/* Who is submitting (owner 12 Oct 2026): a real person's name + their role at the club, so we can check with the club.
   Verified club officials get fast approvals. Used by #/submit and #/fix; sent as contact_name + role_at_club. */
const ROLE_OPTS = ['President', 'Secretary', 'Treasurer', 'Tournament/Competition organiser', 'Committee member', 'Coach', 'Other'];
const VERIFY_NOTE = 'We check your name and role with the club before anything goes live. Verified club officials get fast approvals – it keeps the calendar safe and accurate for archers.';
const roleFld = (p, f) => f(p + '_role', 'Your role at the club', `<select id="${p}_role" required><option value="">Choose…</option>${ROLE_OPTS.map(o => `<option>${esc(o)}</option>`).join('')}</select><input id="${p}_role_other" maxlength="80" placeholder="Your role, e.g. Range officer" aria-label="Your role (other)" hidden><input type="hidden" name="role_at_club" id="${p}_role_val">`);
const roleVal = p => { const s = $('#' + p + '_role'), o = $('#' + p + '_role_other'), v = s ? s.value : ''; return v === 'Other' ? ((o && o.value.trim()) ? 'Other: ' + o.value.trim() : '') : v; };
const roleBind = p => { const s = $('#' + p + '_role'), o = $('#' + p + '_role_other'); if (!s) return; s.addEventListener('change', () => { o.hidden = s.value !== 'Other'; if (!o.hidden) o.focus(); }); };
const roleErr = p => { const v = ($('#' + p + '_role') || {}).value; return !v ? 'Choose your role at the club.' : v === 'Other' && !roleVal(p) ? 'Type your role at the club.' : ''; };
/* A real person's name: at least two letters, not the club's name and not a club-style name ("Northern Archers", "XYZ Archery Club"). */
const personErr = (name, club) => { const n = (name || '').trim(), c = (club || '').trim().toLowerCase();
  return !n ? 'Enter your name.' : n.length < 2 || !/[a-z]/i.test(n) ? 'Enter your full name.' : (c && n.toLowerCase() === c) || /\b(club|archers|archery|bowmen|bowhunters|association|assoc|inc|committee|admin)\b/i.test(n) ? 'Enter your own name (a real person), not the club’s name.' : ''; };
/* Submit form country settings (#/submit?country=US): organisation list, state list (or free-text region) and phone hint. */
const SUB_CTRY = {
  AU: {name: 'Australia', tag: '', loc: 'en-AU', orgs: ORG_TYPES, state: 'State',  phone: 'e.g. 0412 345 678'},
  US: {name: 'United States', tag: 'USA', loc: 'en-US', orgs: ['USA Archery club / JOAD', 'NFAA club', 'ASA (Archery Shooters Association)', 'IBO (International Bowhunting Organization)', 'Independent club or range', 'Other'],
       state: 'State',  phone: 'e.g. (555) 123-4567'},
  OTHER: {name: 'Other country', tag: '', loc: 'en-GB', orgs: ['National federation / World Archery member club', 'IFAA club', '3D / bowhunting club', 'Independent club or range', 'Other'],
       state: 'Region / province',  phone: 'include the country code, e.g. +44 20 7946 0000'}};
const subCtry = v => { v = String(v || '').toUpperCase(); return v === 'US' || v === 'USA' ? 'US' : v === 'OTHER' ? 'OTHER' : 'AU'; };
function subStateField(c){
  if (c === 'OTHER') return `<input id="s_state" name="region" maxlength="80" placeholder="e.g. Ontario, Bavaria, Canterbury" autocomplete="address-level1">`;
  const list = c === 'US' ? Object.entries(US_ST).sort((a, b) => a[1] < b[1] ? -1 : 1) : STATES;
  return `<select id="s_state" name="state" required><option value="">Choose…</option>${list.map(([k, n]) => `<option value="${k}">${esc(n)}${c === 'US' ? ` (${k})` : ''}</option>`).join('')}</select>`;
}
const MAX_MB = 4, FS_TOTAL_MB = 9.5;   // FormSubmit: all attachments together must stay under 10 MB.
/* Shrink any browser-decodable photo (incl. HEIC on Safari) to JPEG ≤ ~4 MB, max 2400px long edge, and swap it into the file input. */
async function shrinkImg(inp, note){
  const f = inp.files[0]; if (!f || !(/^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name))) { if (note) note.textContent = ''; return; }
  if (f.size <= MAX_MB * 1048576 && /^image\/jpeg$/.test(f.type)) { if (note) note.textContent = ''; return; }
  inp.dataset.busy = '1'; if (note) note.textContent = 'Shrinking photo…';
  try { const bmp = await createImageBitmap(f).catch(async () => { const u = URL.createObjectURL(f), im = new Image(); im.src = u; await im.decode(); return im; });
    let w = bmp.width, h = bmp.height, k = Math.min(1, 2400 / Math.max(w, h)), q = .85, blob;
    for (let n = 0; n < 12; n++) { const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (blob && blob.size <= MAX_MB * 1048576) break; if (q > .6) q -= .1; else k *= .8; }
    const dt = new DataTransfer(); dt.items.add(new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', {type: 'image/jpeg'})); inp.files = dt.files;
    if (note) note.textContent = `Photo shrunk to ${(blob.size / 1048576).toFixed(1)} MB.`;
  } catch { if (note) note.textContent = 'Couldn’t read that photo here – try a JPG or a screenshot.'; }
  delete inp.dataset.busy; inp.dispatchEvent(new Event('shrunk', {bubbles: true}));
}
/* ---------- Flyer preview before publish (owner approved 20 Oct 2026) ----------
   As soon as a flyer (file or link) is loaded, the submit button locks and a preview shows the flyer beside the event card exactly as
   it will be published (the site's own evCard / pendCard / payBox / regSection). Every line has a pencil to fix it in place.
   The AI reader is the Supabase Edge Function read-flyer (supabase/functions/read-flyer, key in the GEMINI_API_KEY secret, never here).
   No function / not signed in / it fails: the preview still works with every line blank and marked "Check this". */
const FP_ROWS = [['title', 'Event name', 'text', 's_ename'], ['club', 'Club', 'text', 's_club'], ['start_date', 'Start date', 'date', 's_start'], ['end_date', 'End date', 'date', 's_end'],
  ['start_time', 'Start time', 'text'], ['venue', 'Venue', 'text', 's_venue'], ['shoot_type', 'Type of event', 'disc', 's_disc'], ['entry', 'How to enter (link or method)', 'text'],
  ['bank_account_name', 'Account name', 'text'], ['bank_bsb', 'BSB', 'text'], ['bank_account', 'Account number', 'text'], ['bank_reference', 'Payment reference', 'text']];
const FP = {on: false, busy: false, rendered: false, src: '', url: '', pdf: false, v: {}, conf: {}, ok: {}, msg: '', reqId: 0};
const FP_DISC = ['Target', 'Field', '3D', 'Indoor', 'Clout', 'Other'];
const fpSure = k => FP.ok[k] || (FP.conf[k] || 0) >= 0.8;
const fpPanel = () => `<section class="fp" id="s_prev" hidden aria-labelledby="fp_h">
    <h3 class="fp-h" id="fp_h">Check your event before it goes live</h3>
    <p class="fp-status" id="fp_status" role="status" aria-live="polite"></p>
    <div class="fp-match" id="fp_match" hidden></div>
    <div class="fp-grid"><figure class="fp-fly" id="fp_fly"></figure>
      <div class="fp-right"><p class="fp-lbl">How it will look on the calendar</p><div class="fp-card" id="fp_card" inert></div>
        <ul class="fp-list" id="fp_list"></ul><div class="fp-extra" id="fp_extra" inert></div></div></div>
    <label class="chk tick fp-only"><input type="checkbox" id="fp_only"><span id="fp_only_t">Publish flyer-only, details coming</span></label></section>`;
/* Shrink a photo to max 1600px JPEG for the reader (small = cheap); PDFs go as they are if under ~2 MB. */
async function fpB64(file){
  if (/pdf/.test(file.type) || /\.pdf$/i.test(file.name)) { if (file.size > 2.1 * 1048576) return null;
    return {mime: 'application/pdf', data: await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(file); })}; }
  const bmp = await createImageBitmap(file).catch(async () => { const u = URL.createObjectURL(file), im = new Image(); im.src = u; await im.decode(); return im; });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  return {mime: 'image/jpeg', data: c.toDataURL('image/jpeg', .8).split(',')[1]};
}
/* Ask read-flyer. Returns {fields, confidence} or {err: 'sign_in' | 'off' | 'cap' | 'fail'}. */
async function fpRead(file){
  if (!SB_URL || !(AUTH.client && AUTH.user)) return {err: 'sign_in'};
  try { const img = await fpB64(file); if (!img) return {err: 'fail'};
    const {data} = await AUTH.client.auth.getSession(), tok = data && data.session && data.session.access_token; if (!tok) return {err: 'sign_in'};
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 30000);
    const r = await fetch(SB_URL.replace(/\/$/, '') + '/functions/v1/read-flyer', {method: 'POST', signal: ac.signal,
      headers: {'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + tok}, body: JSON.stringify({image: img.data, mime: img.mime})});
    clearTimeout(t);
    if (r.status === 404 || r.status === 503) return {err: 'off'}; if (r.status === 429) return {err: 'cap'}; if (r.status === 401) return {err: 'sign_in'};
    if (!r.ok) return {err: 'fail'}; const j = await r.json(); return j && j.fields ? j : {err: 'fail'};
  } catch { return {err: 'fail'}; }
}
/* ---------- Known club -> state, and "is this already on the calendar?" (owner 30 Oct 2026) ----------
   A known club's state comes from data/clubs.json, never from the state remembered from an earlier submission (that made a
   Baldivis WA flyer show as "Rockingham - VIC (Melbourne time)"). With no club match, a state written in the venue
   (", WA", "Perth", a postcode at the end) is used. */
const clubNames = k => [k.name, ...(k.aliases || [])].map(snorm).filter(Boolean);
function clubRec(club, venue){
  const n = snorm(club), v = ' ' + snorm(venue) + ' ';
  if (n) { const k = CLUBS.find(c => clubNames(c).includes(n)); if (k) return k;
    let best = null, bl = 0;   // "Baldivis Archery Club Inc" -> Baldivis Archery Club (longest whole-word name inside, 8+ letters)
    CLUBS.forEach(c => clubNames(c).forEach(a => { if (a.length >= 8 && a.length > bl && (' ' + n + ' ').includes(' ' + a + ' ')) { best = c; bl = a.length; } }));
    if (best) return best; }
  if (v.trim()) { let best = null, bl = 0;   // the venue names the club: "Baldivis Archery Club, Ennis Ave"
    CLUBS.forEach(c => clubNames(c).forEach(a => { if (a.includes(' ') && a.length >= 10 && a.length > bl && v.includes(' ' + a + ' ')) { best = c; bl = a.length; } }));
    if (best) return best; }
  return null;
}
const AU_PC = pc => { const n = +pc; return n >= 800 && n <= 999 ? 'NT' : (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920) ? 'ACT' : n >= 1000 && n <= 2999 ? 'NSW' : n >= 3000 && n <= 3999 ? 'VIC'
  : n >= 4000 && n <= 4999 ? 'QLD' : n >= 5000 && n <= 5999 ? 'SA' : n >= 6000 && n <= 6999 ? 'WA' : n >= 7000 && n <= 7999 ? 'TAS' : ''; };
function venueState(venue){
  const t = String(venue || ''); if (!t.trim()) return '';
  const m = t.match(/\b(WA|NSW|VIC|QLD|SA|TAS|ACT|NT)\b(?:\s+(\d{4}))?/); if (m) return m[1];
  const pc = t.match(/\b(\d{4})\s*(?:,?\s*(?:Australia|AUS?))?\s*$/i); if (pc && AU_PC(pc[1])) return AU_PC(pc[1]);
  const w = ' ' + snorm(t) + ' ';
  for (const [k, st] of Object.entries(STATE_ALIASES)) if (k.length > 3 && w.includes(' ' + k + ' ')) return st;
  const c = CLUBS.find(k => !k.country && k.suburb && k.state && w.includes(' ' + snorm(k.suburb) + ' ')); return c ? c.state : '';
}
/* Listed events that look like the same shoot: dates overlap AND (same club, or the venue shares a real place word) AND the names
   share a word (or the listed name is generic, e.g. "Club shoot"). Best first, at most 4. */
const M_STOP = new Set(('the and of for a at in on club clubs archery archers archer bowmen bowhunters field archers inc tournament tournaments shoot shoots event events open annual ' +
  'day days round rounds comp competition championship championships cup series round road rd street st ave avenue drive dr reserve oval range park grounds see flyer').split(' '));
const mWords = s => new Set(snorm(s).split(' ').filter(w => w.length > 2 && !M_STOP.has(w) && !/^\d+$/.test(w)));
const stCode = s => String(s || '').trim().split(/[\s(/]/)[0].toUpperCase();
function listedMatches(x, k){
  if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.start_date || '')) return [];
  const xe = x.end_date || x.start_date, xn = mWords(x.name), xv = mWords(x.location), xs = stCode(x.state), out = [];
  const seen = new Set();
  Object.values(BYID).forEach(y => {
    if (!y || seen.has(y.id) || y.id === 'preview' || !y.start_date || y.info_only) return; seen.add(y.id);
    const ye = evEnd(y); if (!(x.start_date <= ye && y.start_date <= xe)) return;
    const txt = ' ' + snorm([y.name, y.location, y.club_name, y.host].join(' ')) + ' ';
    const club = !!k && (y.club_id === k.id || clubNames(k).some(a => (a.length >= 6 || a.includes(' ')) && txt.includes(' ' + a + ' ')));
    const yv = mWords(y.location), vHit = [...xv].filter(w => yv.has(w)).length;
    const ys = stCode(y.state_code || y.state); if (!club && xs && ys && xs !== ys) return;
    if (!club && !vHit) return;
    const yn = mWords(y.name); const nHit = [...xn].filter(w => yn.has(w)).length;
    if (!nHit && yn.size && xn.size) return;
    out.push({y, s: (club ? 4 : 0) + Math.min(vHit, 2) + nHit * 2 + (y.start_date === x.start_date ? 2 : 0)});
  });
  return out.sort((a, b) => b.s - a.s).slice(0, 4).map(o => o.y);
}
function vSubmit(country){
  setTitle('Submit an event');
  const C = subCtry(country), K = SUB_CTRY[C];
  const sent = /(?:^|[?&])sent=1/.test(location.search), sid = new URLSearchParams(location.search).get('sid') || (sent ? '' : SUBDONE.sid);
  const qs = new URLSearchParams(location.search), updId = sent && qs.get('upd');
  if (sent) { SUBDONE.sid = sid || ''; SUBDONE.upd = updId ? {id: updId, st: qs.get('us') || ''} : null; history.replaceState(null, '', location.pathname + '#/submit'); }
  if (sent && sid) { SUBDONE.html = '<p class="loading">Checking your event…</p>'; setTimeout(() => subDoneLoad(sid), 0); }
  const head = pageHead('Submit an event', 'Just send your flyer — we read it and build your event card for you.', '3d');
  if (SUBDONE.upd) { const u = SUBDONE.upd, y = BYID[u.id], nm = y ? `<b>${esc(y.name)}</b>` : 'the listed event', live = u.st === 'live';
    return `${head}<div class="wrap narrow"><section class="panel thanks" id="subThanks" tabindex="-1"><span class="thanks-mark" aria-hidden="true">✓</span>
      <h2 class="sec">${live ? 'The listed event is updated' : 'Thanks, your update is in'}</h2>
      <p>${live ? `${nm} now has the details from your flyer.` : `We’ll check it and update ${nm}, usually within 48 hours.`} It keeps the same link, so anyone who saved it still has it in My events.</p>
      ${y && live ? `<div class="live-card">${evCard(y)}</div>` : ''}
      <div class="row">${y ? `<a class="btn gold" href="#/shoot/${esc(encodeURIComponent(u.id))}">Open the event</a>` : ''}<a class="btn alt" href="#/submit">Send another event</a></div></section></div>`; }
  if (SUBDONE.sid && SUBDONE.html) return `${head}<div class="wrap narrow"><section class="panel thanks" id="subThanks" tabindex="-1">${SUBDONE.html}</section></div>`;
  if (sent) return `${head}<div class="wrap narrow"><section class="panel thanks" id="subThanks" tabindex="-1">
    <span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Thanks, your flyer is in</h2>
    <p>We'll read your flyer and put your event on the calendar for you.</p>
    <div class="row"><a class="btn gold" href="#/submit">Send another flyer</a><a class="btn alt" href="#/browse">Find events</a></div></section></div>`;
  const opt = (a, ph) => `<option value="">${ph}</option>` + a.map(x => `<option>${esc(x)}</option>`).join('');
  const f = (id, lab, inp, hint = '', req = true) => `<div class="fld" data-f="${id}"><label for="${id}">${lab}${req ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>${inp}${hint ? `<p class="hint" id="${id}_h">${hint}</p>` : ''}<p class="err" id="${id}_e" role="alert"></p></div>`;
  const ap = subApproved();
  return `${head}<div class="wrap narrow sub">${subTabs('new')}
  <section class="panel sub-intro"><p class="sub-lead"><b>Just send your flyer.</b> That's all we need. We read it and build your event card for you.</p>
    <p class="note sub-mode" id="s_mode">${ap ? '✓ You’re an approved submitter, so your events go live straight away.' : 'We check each flyer and put it on the calendar, usually within 48 hours. Approved clubs go live straight away.'}</p></section>
  <form id="subForm" class="panel sub-form" method="POST" enctype="multipart/form-data" action="${esc(SITE.formEndpoint || '')}" novalidate>
    <input type="hidden" name="_subject" value="New flyer – Archery Calendar"><input type="hidden" name="known_club" value="">${acctHidden()}<input type="hidden" name="submission_id" value=""><input type="hidden" name="submission_status" value="email only (not saved to database)"><input type="hidden" name="flyer_stored" value="">
    <input type="hidden" name="_template" value="table">
    <input type="hidden" name="_next" value="">
    <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="hidden" name="_captcha" value="false">
    <input type="hidden" name="consent" value="Yes – sent by the club / organiser, permission to publish the event details and flyer">
    ${f('s_file', 'Your flyer', `<input id="s_file" name="attachment" type="file" accept=".pdf,application/pdf,image/*,.heic,.heif">`, `A photo, screenshot or PDF. Big photos are shrunk automatically. <span id="s_file_n" class="note"></span>`)}
    ${f('s_flink', '…or a link to it', `<input id="s_flink" name="flyer_link" type="url" maxlength="300" placeholder="https://" inputmode="url">`, 'e.g. your website or Facebook post.', false)}
    ${fpPanel()}<input type="hidden" name="start_time" id="s_time"><input type="hidden" name="payment_details" id="s_paytxt">
    <div id="s_email_w" ${ap ? 'hidden' : ''}>${f('s_email', 'Your email', `<input id="s_email" name="email" type="email" maxlength="120" autocomplete="email" inputmode="email">`, 'So we can reply if we have a question.')}</div>
    <details class="sub-more" id="s_more"><summary>Add details (optional)</summary>
    <p class="hint">Anything you leave out, we take from the flyer.</p>
    <div class="vcard me-card" id="s_mecard" hidden><div><span id="s_me_txt"></span></div><div class="me-btns"><button type="button" class="btn sm" id="s_me_edit">✏️ Change</button><button type="button" class="btn alt sm" id="s_me_clr">Not you? Clear</button></div></div>
    <div id="s_mefields">
      <div class="grid2">${f('s_country', 'Country', `<select id="s_country" name="country">${Object.entries(SUB_CTRY).map(([k, v]) => `<option value="${k}" ${k === C ? 'selected' : ''}>${k === 'US' ? '🇺🇸 ' : k === 'AU' ? '🇦🇺 ' : '🌐 '}${esc(v.name)}</option>`).join('')}</select>`, '', false)}
      <div id="s_ctryname_w" ${C === 'OTHER' ? '' : 'hidden'}>${f('s_ctryname', 'Which country?', `<input id="s_ctryname" name="country_name" maxlength="60" autocomplete="country-name" placeholder="e.g. Canada" ${C === 'OTHER' ? '' : 'disabled'}>`, '', false)}</div>
      <div id="s_state_w">${f('s_state', K.state, subStateField(C), '', false)}</div></div>
      ${f('s_orgtype', 'Organisation', `<select id="s_orgtype" name="organisation_type">${opt(K.orgs, 'Choose…')}</select>`, '', false)}
      ${f('s_club', 'Club or organisation name', `<div class="cb"><input id="s_club" name="club_name" maxlength="120" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="s_club_lb" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" placeholder="Start typing your club's name"><ul class="cb-lb" id="s_club_lb" role="listbox" hidden></ul></div>`, '', false)}
      <div id="s_who" ${ap ? 'hidden' : ''}><div class="grid2">${f('s_name', 'Your name', `<input id="s_name" name="contact_name" maxlength="80" autocomplete="name">`, '', false)}
      ${roleFld('s', f)}</div>
      ${f('s_phone', 'Phone', `<input id="s_phone" name="phone" type="tel" maxlength="20" autocomplete="tel" inputmode="tel" placeholder="${esc(K.phone)}">`, '', false)}</div>
    </div>
      ${f('s_ename', 'Event name', `<input id="s_ename" name="event_name" maxlength="140" placeholder="e.g. Club 3D Championships 2027">`, '', false)}
      <div class="grid2">${f('s_start', 'Start date', `<input id="s_start" name="start_date" type="date">`, '', false)}
      ${f('s_end', 'End date', `<input id="s_end" name="end_date" type="date">`, '', false)}</div>
      <p class="note past-warn" id="s_past" role="status" hidden></p>
      ${f('s_venue', 'Venue / address', `<input id="s_venue" name="venue" maxlength="200" placeholder="e.g. Club range, 12 Range Rd, Town">`, '', false)}
      ${f('s_disc', 'Type of event', `<select id="s_disc" name="discipline"><option value="">Choose…</option>${['Target', 'Field', '3D', 'Indoor', 'Clout', 'Other'].map(o => `<option>${o}</option>`).join('')}</select>`, '', false)}
      ${f('s_regm', 'How to register', `<div id="s_regbox">${regPicker('sr', regRegion(C), [])}</div><input type="hidden" name="how_to_register" id="s_regtxt">`, '', false)}
      ${f('s_notes', 'Notes', `<textarea id="s_notes" name="notes" rows="3" maxlength="2000" placeholder="Anything that isn't on the flyer"></textarea>`, '', false)}
    </details>
    <p class="err sum" id="subErr" role="alert"></p>
    <div class="sub-actions"><button class="btn gold" type="submit" id="subBtn">${ap ? 'Publish now' : 'Send flyer'}</button>
      <a class="btn alt" id="subMail" href="mailto:${esc(SITE.contact)}">Email it instead</a></div>
    <p class="note sub-how" id="s_how"></p>
    <p class="note priv">By sending, you confirm you're allowed to share this flyer. 🔒 Your details go to us (${esc(SITE.contact)}) via FormSubmit and your account (Supabase, Sydney). We only use them to list your event and never publish or sell them. <a href="#/privacy">Privacy</a></p>
  </form></div>`;
}
function bindSubmit(){
  const fm = $('#subForm');
  if (!fm) { const t = $('#subThanks'); t && t.focus(); return; }
  const g = id => $('#' + id), val = id => (g(id).value || '').trim();
  const setErr = (id, msg) => { const e = g(id + '_e'), w = fm.querySelector(`[data-f="${id}"]`), inp = g(id);
    if (e) e.textContent = msg || ''; w && w.classList.toggle('bad', !!msg);
    if (inp && inp.matches('input,select,textarea')) { inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); msg ? inp.setAttribute('aria-describedby', id + '_e') : inp.removeAttribute('aria-describedby'); } };
  const isUrl = s => { try { const u = new URL(s); return /^https?:$/.test(u.protocol); } catch { return false; } };
  const ctry = () => subCtry(val('s_country')), K = () => SUB_CTRY[ctry()];
  function applyCountry(){
    const c = ctry(), k = SUB_CTRY[c], el = g('s_orgtype'), v = el.value;
    el.outerHTML = `<select id="s_orgtype" name="organisation_type"><option value="">Choose…</option>${k.orgs.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
    if ([...g('s_orgtype').options].some(o => o.value === v)) g('s_orgtype').value = v;
    g('s_state').outerHTML = subStateField(c);
    fm.querySelector('label[for=s_state]').innerHTML = esc(k.state) + ' <span class="opt">(optional)</span>';
    g('s_ctryname_w').hidden = c !== 'OTHER'; g('s_ctryname').disabled = c !== 'OTHER'; g('s_phone').placeholder = k.phone;
    if (fm.dataset.tried) check();
  }
  const subRg = () => ctry() === 'OTHER' ? ({'new zealand': 'NZ', 'canada': 'CA', 'united kingdom': 'UK', 'uk': 'UK', 'england': 'UK', 'scotland': 'UK', 'wales': 'UK', 'northern ireland': 'UK', 'denmark': 'DK'})[val('s_ctryname').toLowerCase()] || 'INTL' : regRegion(ctry());
  const regRe = () => { const box = g('sr_regpick'); if (box && box.dataset.rg === subRg()) return; const keep = regRead('sr').list; g('s_regbox').innerHTML = regPicker('sr', subRg(), keep); regBind('sr'); };
  regBind('sr'); g('s_ctryname').addEventListener('change', regRe);
  g('s_country').onchange = () => { applyCountry(); regRe(); history.replaceState(null, '', location.pathname + location.search + (ctry() === 'AU' ? '#/submit' : '#/submit?country=' + ctry())); };
  /* Club type-ahead: clubs.json filtered by the chosen country + state/region; match anywhere, prefix matches first; free text allowed. */
  (function clubAhead(){ const inp = g('s_club'), lb = g('s_club_lb'); let shown = [];
    const pool = () => { const c = ctry(), st = val('s_state'), cn = (val('s_ctryname') || '').trim().toLowerCase(), rg = st.toLowerCase();
      return CLUBS.filter(k => c === 'AU' ? !k.country && (!st || k.state === st) : c === 'US' ? k.country === 'USA' && (!st || !k.state || k.state === st)
        : k.country && k.country !== 'USA' && (!cn || [k.country, k.country_name].some(n => (n || '').toLowerCase() === cn)) && (!rg || !k.state || (k.state || '').toLowerCase().includes(rg))); };
    const close = () => { lb.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
    const open = () => { const q = inp.value.trim().toLowerCase(); if (!q) { close(); return; }
      shown = pool().map(k => ({k, i: k.name.toLowerCase().indexOf(q), w: (' ' + k.name.toLowerCase()).indexOf(' ' + q)})).filter(o => o.i >= 0)
        .sort((a, b) => (a.i === 0 ? 0 : a.w >= 0 ? 1 : 2) - (b.i === 0 ? 0 : b.w >= 0 ? 1 : 2) || a.k.name.localeCompare(b.k.name)).slice(0, 40).map(o => o.k);
      if (!shown.length || (shown.length === 1 && shown[0].name.toLowerCase() === q)) { close(); return; }
      lb.innerHTML = shown.map((k, i) => `<li role="option" class="cb-o" data-i="${i}"><b>${esc(k.name)}</b><span>${esc([k.suburb, k.state, k.country_name].filter(Boolean).join(' · '))}</span></li>`).join('');
      lb.hidden = false; inp.setAttribute('aria-expanded', 'true');
      lb.querySelectorAll('.cb-o').forEach(li => li.onmousedown = e => { e.preventDefault(); inp.value = shown[+li.dataset.i].name; close(); inp.dispatchEvent(new Event('change', {bubbles: true})); }); };
    inp.addEventListener('input', open); inp.addEventListener('focus', open); inp.addEventListener('blur', () => setTimeout(close, 150));
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    fm.addEventListener('change', e => { if (['s_country', 's_state', 's_ctryname'].includes(e.target.id) && document.activeElement === inp) open(); else if (e.target.id !== 's_club') close(); });
  })();
  fm.addEventListener('change', e => { if (e.target.id !== 's_orgtype' || ctry() !== 'AU') return;
    const b = AA_STATE_BODIES.find(x => x[0] === e.target.value), st = g('s_state');
    if (b && st && (!st.value || !AA_STATE_BODIES.some(x => x[0] === e.target.value && x[1] === st.value))) { st.value = b[1]; st.dispatchEvent(new Event('change', {bubbles: true})); } });
  g('s_file').addEventListener('change', async () => { upd(); await shrinkImg(g('s_file'), g('s_file_n')); fpStart(); });
  fm.addEventListener('shrunk', () => { if (fm.dataset.tried) check(); });
  /* Past date: a warning only (late listings and results are fine), never blocks sending. */
  const pastWarn = () => { const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const st = val('s_start'), en = val('s_end') || st, w = g('s_past'); if (!w) return;
    const msg = !/^\d{4}-\d{2}-\d{2}$/.test(st) || st >= today ? '' : en < today ? '⚠ These dates have already passed. You can still send it (for example to share results), but check the year is right.' : '⚠ The start date is before today. That’s fine if the event is already running – otherwise check the date.';
    w.textContent = msg; w.hidden = !msg; };
  ['input', 'change'].forEach(t => { g('s_start').addEventListener(t, pastWarn); g('s_end').addEventListener(t, pastWarn); });
  if (ctry() === 'OTHER') applyCountry();
  /* Remembered club details (S.subMe: this device, plus the signed-in profile's settings via sync). */
  const ME = ['s_ctryname', 's_state', 's_orgtype', 's_club', 's_name', 's_role', 's_role_other', 's_email', 's_phone'];
  const meShow = card => { g('s_mecard').hidden = !card; g('s_mefields').hidden = card; };
  (function meLoad(){ const m = S.subMe; if (!m || !m.s_email || !m.s_club) { const a = typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.email; if (a && !val('s_email')) g('s_email').value = a; if (m) ME.forEach(id => { if (g(id) && m[id] && !g(id).value) g(id).value = m[id]; }); return; }
    if (m.country && m.country !== val('s_country')) { g('s_country').value = m.country; applyCountry(); }
    ME.forEach(id => { if (g(id) && m[id] != null) g(id).value = m[id]; });
    g('s_role').dispatchEvent(new Event('change', {bubbles: true}));
    const st = m.s_state || m.s_ctryname;
    g('s_me_txt').innerHTML = `Sending as <b>${esc(m.s_name)}</b>, ${esc(roleVal('s'))} – ${esc(m.s_club)}${st ? ` (${esc(st)})` : ''} · ${esc(m.s_email)}`;
    meShow(true); })();
  g('s_me_edit').onclick = () => { meShow(false); g('s_club').focus(); };
  g('s_me_clr').onclick = () => { delete S.subMe; save(); ME.forEach(id => { if (g(id)) g(id).value = ''; }); g('s_role').dispatchEvent(new Event('change', {bubbles: true})); meShow(false); toast('Saved details cleared'); };
  const meSave = () => { const m = {country: val('s_country')}; ME.forEach(id => { if (g(id)) m[id] = g(id).value; }); S.subMe = Object.assign({}, S.subMe || {}, m); save(); };
  fm.addEventListener('change', e => { if (ME.includes(e.target.id) || e.target.id === 's_country') meSave(); });   // shared details: saved as typed, reused on every form
  /* Flyer-only: the flyer (or a link to it) is the only must-have, plus an email for people we don't know yet. Optional details are only checked if typed. */
  function check(){
    const errs = [], add = (id, m) => { setErr(id, m); if (m) errs.push(id); }, ap = subApproved();
    const file = g('s_file').files[0], fl = val('s_flink'), isPdf = file && /\.pdf$/i.test(file.name);
    add('s_file', !file ? (fl ? '' : 'Add your flyer (or paste a link to it below).') : g('s_file').dataset.busy ? 'Still shrinking the photo – one moment.' : !isPdf && !/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) ? 'Flyers must be a PDF or a photo.'
      : file.size > MAX_MB * 1048576 ? (isPdf ? `That PDF is ${(file.size / 1048576).toFixed(1)} MB (limit ${MAX_MB} MB). Upload a JPG or screenshot of the flyer instead, or paste a link.` : 'That photo is still too big – try a screenshot.')
      : file.size > FS_TOTAL_MB * 1048576 ? 'That file is too big to send.' : '');
    add('s_flink', fl && !isUrl(fl) ? 'Use a full link starting with https://' : '');
    const em = val('s_email'); add('s_email', ap ? '' : !em ? 'Add your email so we can reply.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) ? '' : 'That email doesn’t look right.');
    const ph = ap ? '' : val('s_phone'); add('s_phone', !ph || /^[+()\d\s.-]{7,20}$/.test(ph) ? '' : `Use digits only, ${K().phone}.`);
    add('s_end', val('s_end') && val('s_start') && val('s_end') < val('s_start') ? 'The end date is before the start date.' : '');
    add('s_regm', regRead('sr').list.length ? regRead('sr').err : '');
    return errs;
  }
  /* Enough typed for a calendar card right now (club, event name, start date)? Then a signed-in submission is saved and approved ones go live. */
  const complete = () => !!(val('s_club') && val('s_ename') && /^\d{4}-\d{2}-\d{2}$/.test(val('s_start')));
  /* ---- flyer preview (see FP_ROWS above vSubmit) ---- */
  const fpRow = k => FP_ROWS.find(x => x[0] === k);
  const fpVal = k => { const r = fpRow(k); return r && r[3] ? val(r[3]) : String(FP.v[k] || '').trim(); };
  const fpSet = (k, v) => { const r = fpRow(k); v = String(v == null ? '' : v);
    if (r && r[3]) { const el = g(r[3]); if (!el) return; if (r[2] === 'disc') { const o = FP_DISC.find(d => d.toLowerCase() === v.trim().toLowerCase()); el.value = o || (v.trim() ? 'Other' : ''); } else el.value = v; }
    else FP.v[k] = v; };
  const fpIsDate = k => /^\d{4}-\d{2}-\d{2}$/.test(fpVal(k));
  /* How to register for the card: the picker under "Add details", plus the entry line and bank details from the preview. */
  const fpReg = () => { const L = regRead('sr').list.slice(), e = fpVal('entry');
    if (e) { const u = (e.match(/https:\/\/[^\s]+\.[^\s]+/i) || [])[0], rest = u ? e.replace(u, '').replace(/^[\s:–-]+|[\s:–-]+$/g, '') : e;
      if (u) { const m = regMethodOfUrl(u); if (!L.some(o => o.m === m)) L.push(Object.assign({m, url: u}, rest ? {note: rest} : {})); }
      else if (!L.some(o => o.m === 'other')) L.push({m: 'other', text: e}); }
    const bk = {acct_name: fpVal('bank_account_name'), bsb: fpVal('bank_bsb'), acct: fpVal('bank_account'), ref: fpVal('bank_reference')};
    if ((bk.bsb || bk.acct) && !L.some(o => o.m === 'bank' && (o.bsb || o.acct))) { const o = {m: 'bank'}; Object.keys(bk).forEach(k => { if (bk[k]) o[k] = bk[k]; }); L.push(o); }
    return L; };
  const fpEv = () => { const L = fpReg(), st = fpIsDate('start_date') ? fpVal('start_date') : null;
    const x = subToEv({id: 'preview', name: fpVal('title') || 'Event name', club: fpVal('club'), country: ctry() === 'OTHER' ? val('s_ctryname') : ctry(), state: val('s_state'),
      start_date: st, end_date: (fpIsDate('end_date') && fpVal('end_date')) || st, venue: fpVal('venue') || 'See flyer', discipline: fpVal('shoot_type'),
      registration_url: regFirstUrl(L), register: L, notes: null, flyer_url: FP.pdf ? null : FP.url || null, flyer_link: val('s_flink'), created_at: new Date().toISOString()});
    if (fpVal('start_time')) x.start_times = fpVal('start_time');
    return x; };
  const fpStatus = t => { const s = g('fp_status'); if (s) s.textContent = t; };
  /* ---- State from the club record (or the venue), not the state remembered from last time. Re-checked whenever club or venue changes;
     a state picked by hand stays until club or venue changes again. ---- */
  let stKey = null;
  const syncState = () => { if (ctry() !== 'AU') return; const club = val('s_club'), ven = val('s_venue'), key = club + '|' + ven; if (key === stKey) return; stKey = key;
    const k = clubRec(club, ven), st = k && !k.country && k.state ? k.state : venueState(ven), el = g('s_state');
    if (st && el && [...el.options].some(o => (o.value || o.text) === st) && el.value !== st) el.value = st; };
  /* ---- "This event is already on the calendar": update the listed event (same id, same link) or add a separate one ---- */
  FP.m = {ids: [], pick: '', mode: '', ch: {}, html: ''};
  const MF = [['name', 'Event name'], ['dates', 'Dates'], ['start_times', 'Start time'], ['location', 'Venue'], ['discipline', 'Type of event'], ['register', 'How to enter'], ['notes', 'Notes'], ['flyer', 'Flyer']];
  const mTarget = () => FP.on && !g('fp_only').checked && FP.m.mode === 'update' && FP.m.ids.includes(FP.m.pick) && BYID[FP.m.pick] || null;
  const mNew = k => k === 'name' ? fpVal('title') : k === 'dates' ? (fpIsDate('start_date') ? fpVal('start_date') + '|' + ((fpIsDate('end_date') && fpVal('end_date') >= fpVal('start_date') && fpVal('end_date')) || fpVal('start_date')) : '')
    : k === 'start_times' ? fpVal('start_time') : k === 'location' ? fpVal('venue') : k === 'discipline' ? fpVal('shoot_type') : k === 'register' ? (fpReg().length ? JSON.stringify(fpReg()) : '')
    : k === 'notes' ? val('s_notes') : k === 'flyer' ? (g('s_file').files[0] ? 'new' : '') : '';
  const mOld = (k, y) => k === 'name' ? y.name || '' : k === 'dates' ? (y.start_date ? y.start_date + '|' + evEnd(y) : '') : k === 'start_times' ? y.start_times || '' : k === 'location' ? y.location || ''
    : k === 'discipline' ? y.discipline || '' : k === 'register' ? (regOf(y).length ? JSON.stringify(regOf(y)) : '') : k === 'notes' ? y.notes || '' : k === 'flyer' ? (y.flyer_web || y.flyer_url ? 'old' : '') : '';
  const mShow = (k, v) => !v ? '' : k === 'dates' ? (([a, b]) => fdate(a) + (b && b !== a ? ' to ' + fdate(b) : ''))(v.split('|')) : k === 'register' ? regText(JSON.parse(v)).replace(/\n/g, ' · ')
    : k === 'flyer' ? (v === 'new' ? 'Your flyer' : 'The flyer we have now') : v;
  const mSame = (k, a, b) => k === 'flyer' ? false : k === 'dates' ? a === b : snorm(mShow(k, a)) === snorm(mShow(k, b));
  /* The fields that change on the listed event: empty ones are filled from the flyer; where both have a value, the person's pick (flyer by default). */
  function mFields(y){ const p = {};
    MF.forEach(([k]) => { const n = mNew(k), o = mOld(k, y); if (!n || (o && mSame(k, n, o)) || (o && FP.m.ch[k] === 'old')) return;
      if (k === 'dates') { const [a, b] = n.split('|'); p.start_date = a; p.end_date = b; }
      else if (k === 'register') { const L = fpReg(), u = regFirstUrl(L), bk = L.find(r => r.m === 'bank') || {}; Object.assign(p, {register: L, registration_url: u || null, registration_url_kind: u ? 'entry_page' : null});
        if (bk.bsb || bk.acct) Object.assign(p, {bank_account_name: bk.acct_name || null, bank_bsb: bk.bsb || null, bank_account: bk.acct || null, bank_reference: bk.ref || null}); }
      else if (k === 'flyer') p._flyer = true;
      else p[k] = n; });
    return p; }
  const mMerged = y => { const p = mFields(y), z = applyOvr(Object.assign({}, y), p); delete z._ovr;
    if (p._flyer) Object.assign(z, FP.pdf ? {flyer_url: null, flyer_web: null, flyer_web_sm: null} : {flyer_web: FP.url, flyer_web_sm: FP.url, flyer_url: null, flyer_is_pdf: false});
    return z; };
  /* A listed event's own date confirms the date read from the flyer, so it needn't be flagged "Check this". */
  const mDateOk = k => { const v = fpVal(k); if (!v || (k !== 'start_date' && k !== 'end_date')) return false; const L = FP.m.ids.map(id => BYID[id]).filter(Boolean);
    return k === 'start_date' ? L.some(y => y.start_date === v) : L.some(y => evEnd(y) === v && y.start_date === fpVal('start_date')) || (v === fpVal('start_date') && (fpSure('start_date') || mDateOk('start_date'))); };
  function fpMatch(){
    const box = g('fp_match'); if (!box) return; syncState();
    const L = FP.on && !g('fp_only').checked ? listedMatches(fpEv(), clubRec(val('s_club'), val('s_venue'))) : [];
    FP.m.ids = L.map(y => y.id);
    if (!L.length) { if (FP.m.html) { box.hidden = true; box.innerHTML = ''; FP.m.html = ''; } return; }
    if (!FP.m.ids.includes(FP.m.pick)) { FP.m.pick = L[0].id; FP.m.ch = {}; }
    const y = BYID[FP.m.pick], up = FP.m.mode === 'update', ap = subApproved();
    const evLine = z => `<b>${esc(z.name)}</b><span class="note">${esc(z.start_date ? range(z) : 'Date to be confirmed')}${z.location ? ' · ' + esc(z.location) : ''}</span>`;
    const rows = !up ? '' : MF.map(([k, lab]) => { const n = mNew(k), o = mOld(k, y); if (!n) return '';
      if (o && mSame(k, n, o)) return `<li class="fp-m-row same"><span class="fp-lab">${lab}</span><span class="note">Same as listed</span></li>`;
      if (!o) return `<li class="fp-m-row add"><span class="fp-lab">${lab}</span><span class="fp-m-add">Adds</span><div class="fp-cur">${esc(mShow(k, n))}</div></li>`;
      const c = FP.m.ch[k] || 'new';
      return `<li class="fp-m-row pick"><span class="fp-lab" id="fp_chl_${k}">${lab}</span><div class="fp-m-pick" role="radiogroup" aria-labelledby="fp_chl_${k}">
        <label><input type="radio" name="fp_ch_${k}" value="new" ${c === 'new' ? 'checked' : ''}><span><span class="fp-m-src">From your flyer</span>${esc(mShow(k, n))}</span></label>
        <label><input type="radio" name="fp_ch_${k}" value="old" ${c === 'old' ? 'checked' : ''}><span><span class="fp-m-src">Keep listed</span>${esc(mShow(k, o))}</span></label></div></li>`; }).join('');
    const h = `<h4 class="fp-m-h">${L.length > 1 ? 'Already on the calendar?' : 'This event is already on the calendar'}</h4>
      <p class="note">${L.length > 1 ? 'Your flyer looks like one of these listed events. Pick the one it is for.' : 'Your flyer looks like an event we already list.'} Updating it keeps the same link, so anyone who saved it or ticked entered or paid keeps that.</p>
      ${L.length > 1 ? `<fieldset class="fp-m-list"><legend class="sr">Which listed event is it?</legend>${L.map(z => `<label class="fp-m-ev"><input type="radio" name="fp_mpick" value="${esc(z.id)}" ${z.id === FP.m.pick ? 'checked' : ''}><span>${evLine(z)}</span></label>`).join('')}</fieldset>`
        : `<div class="fp-m-ev one"><span>${evLine(y)}</span><a href="#/shoot/${esc(encodeURIComponent(y.id))}" target="_blank" rel="noopener">Open the listed event ↗</a></div>`}
      <fieldset class="fp-m-choice"><legend class="sr">What should we do with your flyer?</legend>
        <label class="fp-m-opt main${up ? ' on' : ''}"><input type="radio" name="fp_mode" value="update" ${up ? 'checked' : ''}><span><b>Update the listed event with these details</b><span class="note">Same event, same link. Anything missing is filled in from your flyer.</span></span></label>
        <label class="fp-m-opt${FP.m.mode === 'new' ? ' on' : ''}"><input type="radio" name="fp_mode" value="new" ${FP.m.mode === 'new' ? 'checked' : ''}><span><b>Add as a separate event</b><span class="note">It is a different shoot.</span></span></label></fieldset>
      ${up ? `<div class="fp-m-cmp"><p class="fp-lbl">What changes on the listed event</p>${rows ? `<ul>${rows}</ul>` : '<p class="note">Nothing new: the listed event already has these details.</p>'}
        <p class="note">${ap ? 'You are an approved submitter, so the update goes live straight away.' : 'We check updates before they go live, usually within 48 hours.'}</p></div>` : ''}`;
    if (h === FP.m.html) return;
    const a = document.activeElement, ak = a && box.contains(a) && a.name ? [a.name, a.value] : null;
    box.innerHTML = FP.m.html = h; box.hidden = false;
    if (ak) { const el = [...box.querySelectorAll('input')].find(i => i.name === ak[0] && i.value === ak[1]); el && el.focus(); }
  }
  g('fp_match').addEventListener('change', e => { const t = e.target;
    if (t.name === 'fp_mode') FP.m.mode = t.value; else if (t.name === 'fp_mpick') { FP.m.pick = t.value; FP.m.ch = {}; } else if (/^fp_ch_/.test(t.name)) FP.m.ch[t.name.slice(6)] = t.value; });
  ['s_club', 's_venue'].forEach(id => g(id).addEventListener('change', syncState));
  function fpCard(){
    const c = g('fp_card'), ex = g('fp_extra'); if (!c) return; fpMatch(); const y = mTarget(), x = y ? mMerged(y) : fpEv();
    c.previousElementSibling.textContent = y ? 'How the listed event will look' : 'How it will look on the calendar';
    c.innerHTML = x.start_date ? evCard(x) : `<div class="pend-row fp-pend">${pendCard({club: fpVal('club') || fpVal('title') || 'New flyer', flyer_url: FP.pdf ? null : FP.url || null, flyer_link: val('s_flink')})}</div>
      <p class="note">With no start date yet, it shows in <b>New flyers, details coming</b> until the date is added.</p>`;
    ex.innerHTML = payBox(x) + regSection(x);
    FP.rendered = true;
  }
  function fpList(){
    const ul = g('fp_list'); if (!ul) return; fpMatch();
    ul.innerHTML = FP_ROWS.map(([k, lab, kind]) => { const v = fpVal(k), md = !FP.ok[k] && mDateOk(k), sure = k === 'end_date' && !v ? true : !!v && (fpSure(k) || md || (k === 'end_date' && v === fpVal('start_date') && fpSure('start_date')));
      const show = !v ? (k === 'end_date' ? 'Same day as the start' : '<span class="muted">Not filled in</span>') : kind === 'date' && fpIsDate(k) ? esc(fdate(v)) : esc(v);
      const inp = kind === 'date' ? `<input id="fp_in_${k}" type="date" value="${esc(v)}">`
        : kind === 'disc' ? `<select id="fp_in_${k}"><option value="">Choose…</option>${FP_DISC.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input id="fp_in_${k}" maxlength="${k === 'entry' ? 300 : 160}" value="${esc(v)}"${k === 'bank_bsb' || k === 'bank_account' ? ' inputmode="numeric"' : ''}>`;
      return `<li class="fp-row${sure ? '' : ' need'}" data-fpk="${k}"><div class="fp-head"><span class="fp-lab">${esc(lab)}</span>
        ${sure ? (v ? `<span class="fp-ok">✓ ${FP.ok[k] ? 'Checked' : md ? 'Same as the listed event' : 'From your flyer'}</span>` : '') : '<span class="fp-flag">⚠ Check this</span>'}
        <button type="button" class="fx-pen fp-pen" aria-expanded="false" aria-controls="fp_ed_${k}" aria-label="Edit ${esc(lab.toLowerCase())}">✏️ <span>Edit</span></button></div>
        <div class="fp-cur">${show}</div>
        <div class="fp-edit" id="fp_ed_${k}" hidden><label class="sr" for="fp_in_${k}">${esc(lab)}</label>${inp}<button type="button" class="btn sm fp-done">Done</button></div></li>`; }).join('');
  }
  g('fp_list').addEventListener('click', e => { const li = e.target.closest('.fp-row'); if (!li) return; const k = li.dataset.fpk;
    if (e.target.closest('.fp-pen')) { const ed = li.querySelector('.fp-edit'), b = li.querySelector('.fp-pen'); ed.hidden = !ed.hidden; b.setAttribute('aria-expanded', String(!ed.hidden)); if (!ed.hidden) g('fp_in_' + k).focus(); }
    else if (e.target.closest('.fp-done')) { FP.ok[k] = true; fpList(); fpCard(); upd(); const p = g('fp_list').querySelector(`[data-fpk="${k}"] .fp-pen`); p && p.focus(); } });
  g('fp_list').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); const d = e.target.closest('.fp-row').querySelector('.fp-done'); d && d.click(); } });
  g('fp_list').addEventListener('input', e => { const li = e.target.closest('.fp-row'); if (!li) return; fpSet(li.dataset.fpk, e.target.value); fpCard(); });
  fm.addEventListener('input', e => { if (FP.on && !g('fp_list').contains(e.target)) { fpList(); fpCard(); } });
  fm.addEventListener('change', e => { if (FP.on && !g('fp_list').contains(e.target) && e.target.id !== 's_file' && e.target.id !== 's_flink') { fpList(); fpCard(); } });
  async function fpStart(){
    const f = g('s_file').files[0], link = val('s_flink'), box = g('s_prev');
    if (!f && !(link && isUrl(link))) { FP.on = false; FP.src = ''; FP.busy = false; box.hidden = true; upd(); return; }
    const src = f ? `f:${f.name}:${f.size}:${f.lastModified}` : 'l:' + link; if (src === FP.src) return;
    FP.src = src; if (FP.url) URL.revokeObjectURL(FP.url);
    FP.pdf = !!f && (/pdf/.test(f.type) || /\.pdf$/i.test(f.name)); FP.url = f ? URL.createObjectURL(f) : ''; FP.conf = {}; FP.ok = {}; Object.assign(FP.m, {mode: '', ch: {}, pick: ''}); FP.on = true; FP.rendered = false;
    FP_ROWS.forEach(([k]) => { if (fpVal(k)) FP.ok[k] = true; });   // anything already typed counts as checked
    g('fp_fly').innerHTML = f && !FP.pdf ? `<img src="${esc(FP.url)}" alt="Your flyer">` : f ? `<span class="fp-ic" aria-hidden="true">📄</span><figcaption>${esc(f.name)}</figcaption>`
      : `<span class="fp-ic" aria-hidden="true">🔗</span><figcaption><a href="${esc(link)}" target="_blank" rel="noopener">Open your flyer link ↗</a></figcaption>`;
    box.hidden = false; fpList(); fpCard();
    if (!f) { fpStatus('We can’t read a flyer from a link automatically. Fill in each line marked Check this.'); upd(); return; }
    FP.busy = true; fpStatus('Reading your flyer…'); upd();
    const id = ++FP.reqId, res = await fpRead(f); if (id !== FP.reqId) return; FP.busy = false;
    if (res.fields) { const F = res.fields, C = res.confidence || {}, put = (k, v, c) => { if (!v || fpVal(k)) return; fpSet(k, v); FP.conf[k] = c || 0; };
      ['title', 'club', 'start_date', 'end_date', 'start_time', 'venue', 'shoot_type', 'bank_account_name', 'bank_bsb', 'bank_account', 'bank_reference'].forEach(k => put(k, F[k], C[k]));
      put('entry', [F.entry_method, F.entry_link].filter(Boolean).join(' '), Math.min(...['entry_method', 'entry_link'].filter(k => F[k]).map(k => C[k] || 0), 1));
      fpStatus('We read your flyer. Check anything marked “Check this”, fix it with ✏️ Edit, then tap the button below.'); }
    else fpStatus(res.err === 'sign_in' ? 'Sign in and we’ll fill these in from your flyer for you. For now, fill in each line marked Check this.'
      : res.err === 'cap' ? 'You’ve reached today’s limit for automatic flyer reading. Fill in each line marked Check this.'
      : 'We couldn’t read the flyer automatically, so please fill in each line marked Check this.');
    fpList(); fpCard(); upd();
  }
  const mNeed = () => FP.on && !g('fp_only').checked && FP.m.ids.length > 0 && !FP.m.mode;   // a listed match: choose update or separate first
  const mNothing = () => { const y = mTarget(); return !!y && !Object.keys(mFields(y)).length; };
  const fpReady = () => !FP.on || (FP.rendered && !FP.busy && !mNeed() && !mNothing() && ((!!fpVal('title') && fpIsDate('start_date')) || g('fp_only').checked));
  g('fp_only').addEventListener('change', upd);
  g('s_flink').addEventListener('change', () => { if (!g('s_file').files[0]) fpStart(); });
  function upd(){
    const ap = subApproved(), b = g('subBtn'), h = g('s_how'); if (!b || b.dataset.sending) return;
    g('s_email_w').hidden = ap; g('s_who').hidden = ap;
    if (ap && AUTH.user) g('s_email').value = AUTH.user.email || '';
    g('s_mode').textContent = ap ? '✓ You’re an approved submitter, so your events go live straight away.' : 'We check each flyer and put it on the calendar, usually within 48 hours. Approved clubs go live straight away.';
    if (FP.on) { const ok = fpReady(); b.disabled = !ok; b.setAttribute('aria-disabled', String(!ok));
      const up = !!mTarget();
      b.textContent = FP.busy ? 'Reading your flyer…' : up ? (ap ? 'Update the listed event' : 'Send the update') : ap ? 'Looks right, publish' : 'Looks right, send';
      g('fp_only_t').textContent = ap ? 'Publish flyer-only, details coming' : 'Send the flyer only, you add the details';
      h.textContent = FP.busy ? 'One moment, we’re reading your flyer.' : mNeed() ? 'This looks like an event already on the calendar. Choose above: update it, or add yours as a separate event.'
        : mNothing() ? 'Nothing to update: the listed event already has these details.' : up && ok ? (ap ? 'Updates the listed event straight away. It keeps the same link.' : 'We check it and update the listed event, usually within 48 hours. It keeps the same link.') : !ok ? 'Add the event name and start date in the preview (tap ✏️ Edit), or tick the flyer-only box, to carry on.'
        : !ap ? 'We check it and put it on the calendar, usually within 48 hours.' : complete() ? 'Goes live on the calendar as soon as you tap Looks right, publish.' : FLYQ.ok ? 'Goes live now, and we’ll add the missing details from your flyer shortly.' : 'We read your flyer and put it live for you.';
      return; }
    b.disabled = false; b.removeAttribute('aria-disabled');
    b.textContent = ap ? (complete() || FLYQ.ok ? 'Publish now' : 'Send flyer to publish') : 'Send flyer';
    h.textContent = !ap ? '' : complete() ? 'Goes live on the calendar as soon as you tap Publish now.' : FLYQ.ok ? 'Live now, we’ll add the dates from your flyer shortly.' : 'Just the flyer is fine: we read it and put it live for you. Add the club, event name and start date under details and it goes live the second you tap.';
  }
  if (AUTH.user && AUTH.client) { const em = String(AUTH.user.email || '').toLowerCase();
    if (!isAdmin() && !(em in SUBAPP)) AUTH.client.rpc('email_preapproved', {em}).then(({data}) => { SUBAPP[em] = data === true; upd(); }, () => {}); }
  fm.addEventListener('input', upd); fm.addEventListener('change', upd);
  fm.addEventListener('change', () => { if (fm.dataset.tried) check(); });
  fm.addEventListener('input', e => { if (fm.dataset.tried) { const w = e.target.closest('[data-f]'); if (w && w.classList.contains('bad')) check(); } });
  const where = () => ctry() === 'AU' ? val('s_state') : [val('s_state'), ctry() === 'US' ? 'USA' : val('s_ctryname')].filter(Boolean).join(', ');
  function mailBody(){
    const L = [['Country', ctry() === 'OTHER' ? val('s_ctryname') : K().name], [K().state, val('s_state')], ['Organisation type', val('s_orgtype')], ['Club', val('s_club')], ['Your name', val('s_name')], ['Role at the club', roleVal('s')], ['Contact email', val('s_email')], ['Phone', val('s_phone')],
      ['Event', val('s_ename')], ['Dates', [val('s_start'), val('s_end')].filter(Boolean).join(' to ')], ['Start time', fpVal('start_time')], ['Venue', val('s_venue')], ['Type', val('s_disc')], ['How to register', regText(fpReg())],
      ['Flyer link', val('s_flink')], ['Notes', val('s_notes')], ['Permission to publish', 'Yes – sent by the club / organiser']];
    return L.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n>>> Please attach the flyer (PDF or JPG) to this email before sending. <<<\n';
  }
  const subject = () => `New flyer: ${val('s_club') || 'flyer only, details on the flyer'}${where() ? ` (${where()})` : ''}`;
  roleBind('s'); kcLoad(); g('s_email').addEventListener('change', () => kcCheck(val('s_email')));
  const kcNow = id => KC.memo[kcNorm(val(id))];
  g('subMail').onclick = e => { e.currentTarget.href = `mailto:${SITE.contact}?subject=${encodeURIComponent(kcTag(kcNow('s_email')) + subject())}&body=${encodeURIComponent(mailBody())}`; };
  /* Update a listed event: one submitted_events row with updates_event_id + merge_fields. supabase/event_merge.sql applies it to
     event_overrides at once for admins and approved submitters (same id, so saves and entered/paid ticks stay), or holds it for review.
     Before that SQL is run: admins write the override directly; anyone else's update goes by email only. */
  async function mSubmit(y, k, ap){
    const p = mFields(y), file = p._flyer && !g('s_file').disabled ? g('s_file').files[0] : null; delete p._flyer;
    let st = 'email', dbId = '', flyUrl = '', flyPath = null;
    const hid = (n, v) => { let i = fm.querySelector(`[name="${n}"]`); if (!i) { i = document.createElement('input'); i.type = 'hidden'; i.name = n; fm.appendChild(i); } i.value = v; };
    if (AUTH.client && AUTH.user) try {
      if (file && file.size <= FLY_MAX && (/^image\//.test(file.type) || /pdf/.test(file.type) || /\.pdf$/i.test(file.name))) {
        const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i) || [, /pdf/.test(file.type) ? 'pdf' : 'jpg'])[1].toLowerCase(), pdf = ext === 'pdf' || /pdf/.test(file.type);
        flyPath = isAdmin() ? `overrides/${y.id.replace(/[^\w.-]/g, '_')}-${Date.now()}.${ext}` : `${AUTH.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await AUTH.client.storage.from(FLY_BUCKET).upload(flyPath, file, {contentType: file.type || (pdf ? 'application/pdf' : 'image/jpeg'), upsert: false});
        if (up.error) flyPath = null;
        else { flyUrl = AUTH.client.storage.from(FLY_BUCKET).getPublicUrl(flyPath).data.publicUrl;
          Object.assign(p, {flyer_url: pdf ? flyUrl : null, flyer_web: pdf ? null : flyUrl, flyer_web_sm: pdf ? 'icons/icon-512.png' : flyUrl, flyer_is_pdf: pdf, flyer_label: 'Flyer from the club',
            flyer_year: +(p.start_date || y.start_date || '').slice(0, 4) || null, flyer_is_current: true, flyer_source_name: 'club submission', org_status: 'flyer'}); } }
      p.last_checked = new Date().toISOString().slice(0, 10);
      const m = f => f in p ? p[f] : y[f];
      const row = {country: ctry() === 'OTHER' ? val('s_ctryname') : ctry(), state: val('s_state') || y.state_code || y.state || '', organisation_type: val('s_orgtype'), club: val('s_club') || y.club_name || y.host || y.org || 'Club',
        submitter_name: ap ? '' : val('s_name'), role: ap ? '' : roleVal('s'), contact_email: val('s_email') || AUTH.user.email || '', phone: ap ? '' : val('s_phone'),
        name: m('name') || 'Event', start_date: m('start_date') || null, end_date: m('end_date') || m('start_date') || null, venue: m('location') || 'See flyer', discipline: m('discipline') || '',
        registration_url: m('registration_url') || '', register: Array.isArray(m('register')) ? m('register') : regOf(y), flyer_link: val('s_flink'), notes: val('s_notes'),
        flyer_path: flyPath, flyer_url: flyUrl || null, updates_event_id: y.id, merge_fields: p};
      const {data, error} = await AUTH.client.from('submitted_events').insert(row).select('id,status').single();
      if (!error) { dbId = data.id; st = data.status === 'live' ? 'live' : 'pending'; }
      else if (isAdmin()) {   // event_merge.sql not run yet: admins update the listed event directly, as on #/fix
        console.warn('Archery Calendar: update row not saved, writing the override directly:', error.message);
        const r = await AUTH.client.from('event_overrides').upsert({event_id: y.id, fields: Object.assign({}, OVR[y.id] || {}, p), updated_by: AUTH.user.email}, {onConflict: 'event_id'});
        if (!r.error) st = 'live'; else console.warn('Archery Calendar: override not saved:', r.error.message); }
      else console.warn('Archery Calendar: update not saved to the database (email still sent):', error.message);
    } catch (e) { console.warn('Archery Calendar: update not saved:', e); }
    if (st === 'live') { OVR[y.id] = Object.assign({}, OVR[y.id] || {}, p); applyOvr(y, OVR[y.id]); }
    const link = location.origin + location.pathname + '#/shoot/' + encodeURIComponent(y.id);
    hid('updates_event', `${y.name} (${y.id}) ${link}`);
    hid('update_changes', Object.entries(p).filter(([f]) => !/^(flyer_|bank_|last_checked|registration_url|org_status)/.test(f)).map(([f, v]) => `${f}: ${Array.isArray(v) ? regText(v).replace(/\n/g, ' · ') : v}`).join(' | ') + (flyUrl ? ' | new flyer' : file ? ' | new flyer attached' : ''));
    fm.querySelector('[name=submission_id]').value = dbId;
    fm.querySelector('[name=submission_status]').value = st === 'live' ? 'LIVE UPDATE – the listed event is already updated (same id and link)' : st === 'pending' ? 'pending UPDATE to a listed event – approve at ' + location.origin + location.pathname + '#/admin'
      : 'UPDATE to a listed event, email only (not saved): apply it with Fix an event at ' + location.origin + location.pathname + '#/fix/' + encodeURIComponent(y.id);
    if (flyUrl) fm.querySelector('[name=flyer_stored]').value = flyUrl;
    if (!dbId && st !== 'live' && !ap && k !== true && AUTH.client) AUTH.client.rpc('request_approval', {p_email: val('s_email'), p_name: val('s_name') || null, p_club: val('s_club') || null, p_role: roleVal('s') || null, p_source: 'form', p_note: 'Update: ' + y.name}).then(() => {}, () => {});
    fm.querySelector('[name=_subject]').value = (st === 'live' ? '[LIVE UPDATE] ' : '[UPDATE] ') + kcTag(k) + `Update: ${y.name}${where() ? ` (${where()})` : ''}`;
    fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?sent=1&upd=' + encodeURIComponent(y.id) + '&us=' + st + '#/submit';
    HTMLFormElement.prototype.submit.call(fm);
  }
  fm.onsubmit = e => {
    if (FP.on && !fpReady()) { e.preventDefault(); upd(); return; }
    syncState();   // preview first: nothing goes until it's been checked
    fm.dataset.tried = 1;
    const errs = check();
    if (errs.some(id => g('s_mefields').contains(g(id)))) meShow(false);
    if (errs.some(id => g('s_more').contains(g(id)))) g('s_more').open = true;
    if (errs.length) { e.preventDefault(); $('#subErr').textContent = `Please fix ${errs.length === 1 ? 'the highlighted field' : `the ${errs.length} highlighted fields`}.`;
      const first = g(errs[0]).matches('input,select,textarea') ? g(errs[0]) : g(errs[0]).querySelector('input'); first && first.focus(); return; }
    $('#subErr').textContent = '';
    if (!SITE.formEndpoint || !navigator.onLine) { e.preventDefault(); g('subMail').click(); location.href = g('subMail').href;
      toast(navigator.onLine ? 'Opening your email app…' : 'You’re offline: opening your email app instead'); return; }
    g('s_role_val').value = roleVal('s'); g('s_regtxt').value = regText(fpReg()); g('s_time').value = fpVal('start_time');
    g('s_paytxt').value = [['Account name', fpVal('bank_account_name')], ['BSB', fpVal('bank_bsb')], ['Account', fpVal('bank_account')], ['Reference', fpVal('bank_reference')]].filter(r => r[1]).map(r => r.join(': ')).join(' · '); meSave();
    fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?sent=1#/submit';
    fm.querySelector('[name=_subject]').value = subject();
    if (!g('s_file').files.length) g('s_file').disabled = true;   // don't send an empty file part
    const b = g('subBtn'); b.disabled = true; b.dataset.sending = '1'; b.textContent = 'Sending…';
    e.preventDefault();
    const ap = subApproved();
    const rec = {country: ctry() === 'OTHER' ? val('s_ctryname') : ctry(), state: val('s_state'), organisation_type: val('s_orgtype'), club: val('s_club'), submitter_name: ap ? '' : val('s_name'), role: ap ? '' : roleVal('s'),
      contact_email: val('s_email'), phone: ap ? '' : val('s_phone'), name: val('s_ename'), start_date: val('s_start'), end_date: val('s_end') || val('s_start'), venue: val('s_venue') || 'See flyer', discipline: val('s_disc'),
      registration_url: regFirstUrl(fpReg()) || '', register: fpReg(), flyer_link: val('s_flink'), notes: [fpVal('start_time') && 'Start time: ' + fpVal('start_time'), val('s_notes')].filter(Boolean).join('\n')};
    Promise.race([kcCheck(val('s_email')), new Promise(r => setTimeout(() => r(false), 4000))]).then(async k => {
      fm.querySelector('[name=known_club]').value = k ? 'yes' : 'no';
      const yT = mTarget(); if (yT) return mSubmit(yT, k, ap);
      const db = complete() || (ap && FLYQ.ok) ? await dbSubmit(rec, g('s_file').disabled ? null : g('s_file').files[0]) : null;   // flyer only + approved: live as 'details coming'; otherwise emailed
      let tag = kcTag(k);
      if (!db && !ap && k !== true && AUTH.client) AUTH.client.rpc('request_approval', {p_email: val('s_email'), p_name: val('s_name') || null, p_club: val('s_club') || null, p_role: roleVal('s') || null, p_source: 'form', p_note: 'Shoot: ' + (val('s_ename') || 'flyer only')}).then(() => {}, () => {});
      if (!db) fm.querySelector('[name=submission_status]').value = ap ? 'APPROVED submitter (' + val('s_email') + ') – flyer only: read the flyer and publish it straight away' : 'flyer only – read the flyer and build the event';
      const pend = db && db.status === 'live' && (db.details_pending || !complete());
      if (db) { fm.querySelector('[name=submission_id]').value = db.id; fm.querySelector('[name=submission_status]').value = pend ? 'LIVE flyer only – DETAILS PENDING: read the flyer and fill in club, event name, dates and venue (bot_submission fill, id ' + db.id + ')' : db.status === 'live' ? 'LIVE – instant-approved submitter, already on the site' : 'pending – approve at ' + location.origin + location.pathname + '#/admin';
        if (db.flyer_url) fm.querySelector('[name=flyer_stored]').value = db.flyer_url;
        if (db.status === 'live') tag = (pend ? '[LIVE – DETAILS NEEDED] ' : '[LIVE] ') + tag;
        fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?sent=1&sid=' + encodeURIComponent(db.id) + '#/submit'; }
      fm.querySelector('[name=_subject]').value = tag + subject();
      HTMLFormElement.prototype.submit.call(fm);
    });
  };
  window.addEventListener('pageshow', () => { const b = $('#subBtn'); if (b) { delete b.dataset.sending; b.disabled = false; g('s_file').disabled = false; upd(); } }, {once: true});
  upd();
}

/* ---------- Corrections: #/fix and #/fix/<event id> (also reachable as #/submit/fix). Emails nfshold via FormSubmit only; nothing on the site changes automatically. ---------- */
const subTabs = on => `<nav class="sub-tabs" aria-label="What would you like to send?"><a href="#/submit" class="sub-tab" ${on === 'new' ? 'aria-current="page"' : ''}>➕ New event</a><a href="#/fix" class="sub-tab" ${on === 'fix' ? 'aria-current="page"' : ''}>✏️ Fix an existing event</a><a href="#/submit/bulk" class="sub-tab" ${on === 'bulk' ? 'aria-current="page"' : ''}>Send your calendar</a></nav>`;
const fixLabel = x => `${x.name} – ${x.start_date ? pd(x.start_date).toLocaleDateString(LOC(), {day: 'numeric', month: 'short', year: 'numeric'}) : 'date TBC'}${x.state_code || x.state ? ' – ' + (x.state_code || x.state) : ''}`;
const fixList = () => EV.filter(x => !x.start_date || daysTo(x.end_date || x.start_date) >= -90).sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
const fixDates = x => x ? [x.start_date, x.end_date && x.end_date !== x.start_date && x.end_date].filter(Boolean).join(' to ') : '';
const fdate = d => d ? pd(d).toLocaleDateString(LOC(), {day: 'numeric', month: 'short', year: 'numeric'}) : '';
const fixNow = x => { if (!x) return {}; const fe = x.flyer_extract || {};
  return {dates: x.start_date ? range(x) : '', start: x.start_date || '', end: x.end_date || x.start_date || '', time: x.start_times || fe.start_time || fe.times || '', venue: x.location || '',
    rounds: x.rounds || fe.rounds || '', divs: x.divisions || fe.divisions || fe.classes || '', close: x.entry_close_date || '', register: regText(regOf(x)), enotes: x.notes || '',
    flyer: x.flyer_local || x.flyer_url || x.flyer_web ? (x.flyer_label || 'Flyer on file') : '', status: x.cancelled ? 'Cancelled' : 'Going ahead (as listed)'}; };
// [key, label, kind]
const FIX_ROWS = [['dates', 'Date(s)', 'dates'], ['time', 'Start time', 'time'], ['venue', 'Venue / address', 'venue'], ['rounds', 'Round(s) / distances', 'rounds'],
  ['divs', 'Divisions / bow classes', 'divs'], ['close', 'Entry closing date', 'date'], ['register', 'How to register', 'register'], ['flyer', 'Flyer', 'file'], ['enotes', 'Event notes', 'area']];
function fixRows(x){
  if (!x) return `<p class="note" id="fx_none">Pick an event above to see what we have listed.</p>`;
  const n = fixNow(x);
  const show = k => k === 'close' ? fdate(n.close) : n[k];
  const inp = (k, kind) => kind === 'dates' ? `<div class="grid2 fx-dates"><label class="sub-lab" for="fx_start">Start date<input id="fx_start" type="date" value="${esc(n.start)}"></label>
        <label class="sub-lab" for="fx_end">End date<input id="fx_end" type="date" value="${esc(n.end)}"></label></div><p class="hint">For a one-day event, make the end date the same as the start.</p>`
    : kind === 'time' ? `<div class="grid2 fx-times"><label class="sub-lab" for="fx_tasm">Assembly / registration<input id="fx_tasm" type="time" step="300"></label>
        <label class="sub-lab" for="fx_tshoot">Shooting starts<input id="fx_tshoot" type="time" step="300"></label></div><p class="hint">Fill in one or both.</p>`
    : kind === 'venue' ? comboHtml('fx_venue', 'Start typing a club, range or address') + '<p class="hint">Pick a club or range from the list, or type the address.</p>'
    : kind === 'rounds' ? comboHtml('fx_rounds', 'Type a round, e.g. WA 720, Canb, Field…', true) + '<p class="hint">Pick one or more. Not listed? Type it and press Enter.</p>'
    : kind === 'divs' ? comboHtml('fx_divs', 'Type a bow type or age class…', true) + '<p class="hint">Pick all that apply. Not listed? Type it and press Enter.</p>'
    : kind === 'date' ? `<input id="fx_${k}" type="date" value="${esc(n[k])}">`
    : kind === 'file' ? `<input id="fx_file" name="attachment" type="file" disabled accept=".pdf,application/pdf,image/*,.heic,.heif"><p class="hint">PDF (up to ${MAX_MB} MB) or any photo – big photos are shrunk automatically. <span id="fx_file_n" class="note"></span></p>`
    : kind === 'register' ? regPicker('fxr', regRegion(x.country_code), regOf(x))
    : kind === 'url' ? `<input id="fx_${k}" type="url" inputmode="url" maxlength="500" placeholder="https://…" value="${esc(n[k])}">`
    : kind === 'area' ? `<textarea id="fx_${k}" rows="4" maxlength="2000">${esc(n[k])}</textarea>`
    : `<input id="fx_${k}" maxlength="300" value="${esc(n[k])}">`;
  return `<ul class="fx-list" id="fx_rows">${FIX_ROWS.map(([k, lab, kind]) => `<li class="fx-row" data-k="${k}" data-kind="${kind}">
      <div class="fx-head"><span class="fx-lab">${esc(lab)}</span><button type="button" class="fx-pen" data-pen="${k}" aria-expanded="false" aria-label="Edit ${esc(lab.toLowerCase())}">✏️ <span>Edit</span></button></div>
      <div class="fx-cur">${show(k) ? esc(show(k)) : '<span class="muted">Not listed</span>'}</div>
      <div class="fx-edit" hidden>${inp(k, kind)}</div></li>`).join('')}
    <li class="fx-row" data-k="status"><div class="fx-head"><span class="fx-lab">Status</span></div><div class="fx-cur">${esc(n.status)}</div>
      ${x.cancelled ? `<label class="chk tick"><input type="checkbox" id="fx_uncancel"><span>This event is <b>back on</b> (no longer cancelled)</span></label>` : `<label class="chk tick"><input type="checkbox" id="fx_cancel"><span>This event is <b>cancelled or postponed</b></span></label>`}</li></ul>`;
}
/* ---------- #/fix helpers: type-ahead combobox (single or multi with chips), venue suggestions, round/division lists ---------- */
let RNDS = null;
const loadRounds = () => RNDS ? Promise.resolve(RNDS) : fetch('data/rounds.json').then(r => r.json()).then(j => (RNDS = j));
const CB = {};   // id -> {items:[{label, sub, group, value}], multi, chips:[]}
function comboHtml(id, ph, multi){
  return `<div class="cb${multi ? ' multi' : ''}" data-cb="${id}">${multi ? `<div class="cb-chips" id="${id}_chips"></div>` : ''}
    <input id="${id}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}_lb" autocomplete="off" placeholder="${esc(ph)}">
    <ul class="cb-lb" id="${id}_lb" role="listbox" hidden></ul></div>`;
}
function bindCombo(id, items, multi){
  const inp = $('#' + id), lb = $('#' + id + '_lb'); if (!inp) return;
  const st = CB[id] = {items, multi, chips: []}; let act = -1, shown = [];
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9+/ ]+/g, ' ');
  const close = () => { lb.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; };
  const chipsEl = $('#' + id + '_chips');
  const drawChips = () => { if (!chipsEl) return; chipsEl.innerHTML = st.chips.map((c, i) => `<span class="cb-chip">${esc(c)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(c)}">✕</button></span>`).join('');
    chipsEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.chips.splice(+b.dataset.rm, 1); drawChips(); inp.dispatchEvent(new Event('change', {bubbles: true})); }); };
  st.reset = () => { st.chips = []; drawChips(); inp.value = ''; close(); };
  const pick = it => { if (multi) { if (!st.chips.includes(it.value)) st.chips.push(it.value); inp.value = ''; drawChips(); close(); inp.focus(); }
    else { inp.value = it.value; close(); } inp.dispatchEvent(new Event('change', {bubbles: true})); };
  st.addFree = () => { const v = inp.value.trim(); if (multi && v && !st.chips.includes(v)) { st.chips.push(v); inp.value = ''; drawChips(); } };
  function open(){
    const q = norm(inp.value).split(' ').filter(Boolean);
    shown = items.filter(it => !(multi && st.chips.includes(it.value)) && q.every(w => (' ' + norm(it.label + ' ' + (it.sub || '') + ' ' + (it.group || ''))).includes(' ' + w) || norm(it.label).replace(/ /g, '').includes(w))).slice(0, 60);
    if (!shown.length && (!q.length || !multi)) { close(); return; }
    let g = null;
    lb.innerHTML = shown.length ? shown.map((it, i) => (it.group && it.group !== g ? `<li class="cb-g" role="presentation">${esc(g = it.group)}</li>` : '') +
      `<li role="option" id="${id}_o${i}" data-i="${i}" class="cb-o"><b>${esc(it.label)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</li>`).join('')
      : `<li class="cb-g" role="presentation">No match – ${multi ? 'press Enter to add' : 'keep typing'} “${esc(inp.value)}”</li>`;
    lb.hidden = false; inp.setAttribute('aria-expanded', 'true'); act = -1;
    lb.querySelectorAll('.cb-o').forEach(li => li.onmousedown = e => { e.preventDefault(); pick(shown[+li.dataset.i]); });
  }
  const hi = n => { const os = lb.querySelectorAll('.cb-o'); if (!os.length) return; act = (n + os.length) % os.length; os.forEach((o, i) => o.classList.toggle('act', i === act));
    os[act].scrollIntoView({block: 'nearest'}); inp.setAttribute('aria-activedescendant', os[act].id); };
  const wrap = inp.closest('.cb');
  const outside = e => { if (!document.contains(inp)) { document.removeEventListener('pointerdown', outside, true); return; }
    if (!lb.hidden && !wrap.contains(e.target)) { st.addFree(); close(); } };
  document.addEventListener('pointerdown', outside, true);
  inp.addEventListener('input', open); inp.addEventListener('focus', open); inp.addEventListener('blur', () => setTimeout(() => { st.addFree(); close(); }, 150));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); lb.hidden ? open() : hi(act + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi(act - 1); }
    else if (e.key === 'Enter') { if (!lb.hidden && act >= 0) { e.preventDefault(); pick(shown[act]); } else if (multi && inp.value.trim()) { e.preventDefault(); st.addFree(); close(); } else if (!lb.hidden) { e.preventDefault(); close(); } }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Backspace' && multi && !inp.value && st.chips.length) { st.chips.pop(); drawChips(); } });
}
const comboVal = id => { const st = CB[id], inp = $('#' + id); if (!st || !inp) return ''; if (st.multi) { const t = inp.value.trim(); return st.chips.concat(t && !st.chips.includes(t) ? [t] : []).join(', '); } return inp.value.trim(); };
function venueItems(x){
  const seen = new Set(), out = [], st = x && (x.state_code || x.state);
  const add = (label, sub, state, value) => { const k = (value || '').toLowerCase(); if (!value || seen.has(k)) return; seen.add(k); out.push({label, sub, state, value}); };
  CLUBS.forEach(c => { const addr = c.address || [c.suburb, c.state].filter(Boolean).join(' '); add(c.name, addr || c.state, c.state, c.address ? `${c.name}, ${c.address}` : [c.name, c.suburb, c.state].filter(Boolean).join(', ')); });
  EV.forEach(e => { const l = e.location || ''; if (!/\d/.test(l) || !l.includes(',')) return; const [h, ...r] = l.split(','); add(h.trim(), r.join(',').trim(), e.state_code, l); });
  const rank = it => it.state === st ? 0 : 1;
  return out.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).map(it => ({...it, group: it.state === st ? `In ${st}` : 'Rest of Australia'}));
}
const listItems = (groups, prefer) => { const g = groups.slice(); if (prefer) g.sort((a, b) => (b[0].includes(prefer) ? 1 : 0) - (a[0].includes(prefer) ? 1 : 0));
  return g.flatMap(([grp, arr]) => arr.map(v => ({label: v, value: v, group: grp}))); };
const catDisc = x => { const d = ((x && x.discipline) || '') + ' ' + ((x && x.name) || ''); return /field/i.test(d) ? 'Field' : /indoor/i.test(d) ? 'Indoor' : /clout/i.test(d) ? 'Clout' : /3d/i.test(d) ? '3D' : 'Target'; };
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
function vFix(id){
  setTitle('Fix an event');
  const sent = /(?:^|[?&])fixed=1/.test(location.search);
  if (sent) history.replaceState(null, '', location.pathname + '#/fix');
  const head = pageHead('Fix an event', 'Spotted something wrong or out of date? Tap ✏️ next to anything that needs changing.', '3d');
  if (sent) return `${head}<div class="wrap narrow">${subTabs('fix')}<section class="panel thanks" id="subThanks" tabindex="-1">
    <span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Thanks, we'll review and update it shortly.</h2>
    <p>If we need anything else we'll reply to the email you gave us.</p>
    <div class="row"><a class="btn gold" href="#/fix">Fix another event</a><a class="btn alt" href="#/browse">Find events</a></div></section></div>`;
  const x = BYID[id], ADM = isAdmin();
  const f = (fid, lab, inp, hint = '', req = false) => `<div class="fld" data-f="${fid}"><label for="${fid}">${lab}${req ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>${inp}${hint ? `<p class="hint" id="${fid}_h">${hint}</p>` : ''}<p class="err" id="${fid}_e" role="alert"></p></div>`;
  return `${head}<div class="wrap narrow sub">${subTabs('fix')}
  <form id="fixForm" class="panel sub-form" method="POST" enctype="multipart/form-data" action="${esc(SITE.formEndpoint || '')}" novalidate>
    <input type="hidden" name="_subject" value="Correction:"><input type="hidden" name="known_club" value="">${acctHidden()}
    <input type="hidden" name="_template" value="table">
    <input type="hidden" name="_next" value="">
    <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="hidden" name="_captcha" value="false">
    <input type="hidden" name="form" value="Correction to an existing event (review before changing the site)">
    <input type="hidden" name="event_id" id="fx_id" value="${esc(x ? x.id : '')}">
    <input type="hidden" name="event_name" id="fx_name" value="${esc(x ? x.name : '')}">
    <input type="hidden" name="event_date" id="fx_date" value="${esc(fixDates(x))}">
    <input type="hidden" name="event_page" id="fx_page" value="${esc(x ? SITE_URL() + '#/shoot/' + encodeURIComponent(x.id) : '')}">
    <input type="hidden" name="changes" id="fx_changes" value="">
    <div id="fx_gen"></div>
    <fieldset><legend>1. Which event?</legend>
      ${f('fx_ev', 'Event', `<input id="fx_ev" type="search" list="fx_list" required autocomplete="off" placeholder="Type the event or club name" value="${esc(x ? fixLabel(x) : '')}"><datalist id="fx_list">${fixList().map(e => `<option value="${esc(fixLabel(e))}"></option>`).join('')}</datalist>`, 'Pick it from the list.', true)}
    </fieldset>
    <fieldset><legend>2. What we have listed</legend>
      <p class="hint">Tap ✏️ next to anything that's wrong. Only what you change is sent.</p>
      <div id="fx_body">${fixRows(x)}</div>
      <p class="err" id="fx_any_e" role="alert"></p>
      ${f('fx_notes', 'Other notes', `<textarea id="fx_notes" name="other_notes" rows="3" maxlength="2000" placeholder="Anything else we should know"></textarea>`)}
    </fieldset>
    ${ADM ? `<p class="note verify" id="fxAdmin">🛡 You're signed in as an admin: changes save <b>live</b> to the site straight away.</p>` : ''}<fieldset${ADM ? ' hidden id="fxAbout"' : ''}><legend>3. About you</legend>
      <div class="grid2">${f('fx_who', 'Your name', `<input id="fx_who" name="contact_name" required maxlength="80" autocomplete="name">`, 'A real person, not just the club name.', true)}
      ${roleFld('fx', (a, b, c, d = '') => f(a, b, c, d, true))}</div>
      ${f('fx_club', 'Club', `<input id="fx_club" name="club" required maxlength="120" autocomplete="organization" value="${esc(x && x.host ? x.host : '')}">`, '', true)}
      ${f('fx_email', 'Email', `<input id="fx_email" name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email">`, 'So we can check with you if anything is unclear.', true)}
      <p class="note verify">✅ ${esc(VERIFY_NOTE)}</p>
    </fieldset>
    <p class="note priv"${ADM ? ' hidden' : ''}>🔒 Nothing on the site changes straight away: your correction is emailed to us (${esc(SITE.contact)}, NFS Strategic Holdings) via FormSubmit, we check it, then update the listing.</p>
    <p class="err sum" id="fixErr" role="alert"></p>
    <p class="note ok" id="fxLive" role="status" hidden></p>
    <div class="sub-actions"><button class="btn gold" type="submit" id="fixBtn">${ADM ? 'Save live' : 'Send correction'}</button>
      <a class="btn alt" id="fixMail"${ADM ? ' hidden' : ''} href="mailto:${esc(SITE.contact)}">Email it instead</a></div>
  </form></div>`;
}
function bindFix(){
  const fm = $('#fixForm');
  if (!fm) { const t = $('#subThanks'); t && t.focus(); return; }
  const g = id => $('#' + id), val = id => ((g(id) || {}).value || '').trim(), list = fixList();
  let cur = BYID[val('fx_id')] || null;
  sendAsCard(fm, {name: 'fx_who', email: 'fx_email', club: 'fx_club'}, 'fx');
  const setErr = (id, msg) => { const e = g(id + '_e'), w = fm.querySelector(`[data-f="${id}"]`), inp = g(id);
    if (e) e.textContent = msg || ''; w && w.classList.toggle('bad', !!msg);
    if (inp && inp.matches('input,select,textarea')) inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  const bindRows = () => fm.querySelectorAll('[data-pen]').forEach(b => b.onclick = () => {
    const row = b.closest('.fx-row'), ed = row.querySelector('.fx-edit'), on = ed.hidden;
    ed.hidden = !on; row.classList.toggle('editing', on); b.setAttribute('aria-expanded', on);
    b.innerHTML = on ? '↩ <span>Keep as is</span>' : '✏️ <span>Edit</span>';
    const fi = g('fx_file'); if (fi && !fi.dataset.sh) { fi.dataset.sh = '1'; fi.addEventListener('change', () => shrinkImg(fi, g('fx_file_n'))); }
    if (row.dataset.k === 'flyer' && fi) { fi.disabled = !on; if (!on) fi.value = ''; }
    const k = row.dataset.k;
    if (!on) { const n = fixNow(cur); if (CB['fx_' + k]) CB['fx_' + k].reset();
      row.querySelectorAll('input:not([type=file]):not([role=combobox]),textarea').forEach(i => { i.value = i.id === 'fx_start' ? n.start : i.id === 'fx_end' ? n.end : i.type === 'time' ? '' : n[i.id.slice(3)] || ''; }); }
    else {
      if (k === 'register') regBind('fxr');
      if (k === 'venue' && !CB.fx_venue) bindCombo('fx_venue', venueItems(cur), false);
      if ((k === 'rounds' || k === 'divs') && !CB['fx_' + k]) loadRounds().then(R => bindCombo('fx_' + k, k === 'rounds' ? listItems(R.rounds, catDisc(cur)) : listItems(R.divisions, cur && cur.org_group === 'aba' ? 'ABA' : ''), true)).catch(() => {});
      const i = ed.querySelector('input,textarea'); i && setTimeout(() => i.focus(), 0); }
    if (fm.dataset.tried) check(); });
  const pick = () => { const x = list.find(e => fixLabel(e) === val('fx_ev')) || (cur && fixLabel(cur) === val('fx_ev') ? cur : null);
    if (x === cur) return x; cur = x;
    g('fx_id').value = x ? x.id : ''; g('fx_name').value = x ? x.name : ''; g('fx_date').value = fixDates(x);
    g('fx_page').value = x ? SITE_URL() + '#/shoot/' + encodeURIComponent(x.id) : '';
    Object.keys(CB).forEach(k => delete CB[k]); g('fx_body').innerHTML = fixRows(x); bindRows();
    if (x && x.host && !val('fx_club')) g('fx_club').value = x.host; return x; };
  Object.keys(CB).forEach(k => delete CB[k]);
  g('fx_ev').addEventListener('input', pick); g('fx_ev').addEventListener('change', pick); bindRows();
  // only rows that are open AND differ from what's listed
  const changes = () => { if (!cur) return []; const n = fixNow(cur), out = [];
    fm.querySelectorAll('.fx-row.editing').forEach(row => { const k = row.dataset.k, lab = FIX_ROWS.find(r => r[0] === k)[1];
      if (k === 'dates') { const s = val('fx_start'), e = val('fx_end') || s; if (s && (s !== n.start || e !== n.end)) out.push([lab, n.dates || 'Not listed', s === e ? fdate(s) : `${fdate(s)} to ${fdate(e)}`]); }
      else if (k === 'flyer') { const fl = g('fx_file').files[0]; if (fl) out.push([lab, n.flyer || 'Not listed', 'New flyer attached: ' + fl.name]); }
      else if (k === 'time') { const a = val('fx_tasm'), sh = val('fx_tshoot'); if (a || sh) out.push([lab, n.time || 'Not listed', [a && 'Assembly ' + fmtTime(a), sh && 'shooting starts ' + fmtTime(sh)].filter(Boolean).join(', ')]); }
      else if (k === 'register') { const nl = regRead('fxr').list, a = regText(regOf(cur)), b = regText(nl); if (a !== b) out.push([lab, a || 'Not listed', b || '(remove)']); }
      else if (k === 'venue' || k === 'rounds' || k === 'divs') { const v = comboVal('fx_' + k); if (v && v !== (n[k] || '').trim()) out.push([lab, n[k] || 'Not listed', v]); }
      else { const v = val('fx_' + k); if (v !== (n[k] || '').trim()) out.push([lab, (k === 'close' ? fdate(n.close) : n[k]) || 'Not listed', (k === 'close' ? fdate(v) : v) || '(remove)']); } });
    if (g('fx_cancel') && g('fx_cancel').checked) out.push(['Status', n.status, 'Cancelled or postponed']);
    if (g('fx_uncancel') && g('fx_uncancel').checked) out.push(['Status', n.status, 'Going ahead']);
    return out; };
  function check(){
    const errs = [], add = (id, m) => { setErr(id, m); if (m) errs.push(id); };
    add('fx_ev', cur ? '' : val('fx_ev') ? 'Pick the event from the list.' : 'Choose the event.');
    if (cur) {
      const s = val('fx_start'), e = val('fx_end'), de = fm.querySelector('[data-k=dates]');
      const dm = de && de.classList.contains('editing') ? (!s ? 'Choose the start date.' : e && e < s ? 'The end date is before the start date.' : '') : '';
      de && de.classList.toggle('bad', !!dm); if (dm) errs.push('fx_start');
      const file = g('fx_file') && g('fx_file').files[0];
      const isPdf = file && /\.pdf$/i.test(file.name);
      const fm_ = !file ? '' : g('fx_file').dataset.busy ? 'Still shrinking the photo – one moment.' : !isPdf && !/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) ? 'Flyers must be a PDF or a photo.'
        : file.size > MAX_MB * 1048576 ? (isPdf ? `That PDF is ${(file.size / 1048576).toFixed(1)} MB (limit ${MAX_MB} MB). Upload a JPG or screenshot of the flyer instead.` : 'That photo is still too big – try a screenshot.')
        : file.size > FS_TOTAL_MB * 1048576 ? 'That file is too big to send.' : '';
      const fr = fm.querySelector('[data-k=flyer]'); fr && fr.classList.toggle('bad', !!fm_); if (fm_) errs.push('fx_file');
      const any = changes().length; g('fx_any_e').textContent = dm || fm_ || (any ? '' : 'Tap ✏️ and change at least one thing (or tick cancelled).');
      if (!any) errs.push('fx_any');
      const rr = fm.querySelector('.fx-row.editing[data-k=register]') && regRead('fxr').err; if (rr) { errs.push('fx_any'); g('fx_any_e').textContent = rr; }
    }
    if (isAdmin()) return errs;
    add('fx_who', personErr(val('fx_who'), val('fx_club')));
    add('fx_club', val('fx_club') ? '' : 'Enter your club.');
    add('fx_role', roleErr('fx'));
    const em = val('fx_email'); add('fx_email', !em ? 'Enter your email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) ? '' : 'That email doesn’t look right.');
    return errs;
  }
  const subject = () => `Correction: ${val('fx_name') || 'shoot'} ${val('fx_date')}`.trim();
  const changeText = () => changes().map(([l, o, n]) => `${l}: ${o} → ${n}`).join('\n');
  fm.addEventListener('change', () => { if (fm.dataset.tried) check(); });
  fm.addEventListener('input', () => { if (fm.dataset.tried) check(); });
  roleBind('fx'); kcLoad(); g('fx_email').addEventListener('change', () => kcCheck(val('fx_email')));
  g('fixMail').onclick = e => { const body = [['Event', val('fx_name')], ['Date', val('fx_date')], ['Event ID', val('fx_id')], ['Listing', val('fx_page')]].map(([k, v]) => `${k}: ${v}`).join('\n')
      + '\n\nChanges (old → new):\n' + changeText() + (val('fx_notes') ? '\n\nOther notes: ' + val('fx_notes') : '')
      + '\n\n' + [['Name', val('fx_who')], ['Club', val('fx_club')], ['Role at the club', roleVal('fx')], ['Email', val('fx_email')]].map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n(Attach a new flyer if you have one.)\n';
    e.currentTarget.href = `mailto:${SITE.contact}?subject=${encodeURIComponent(kcTag(KC.memo[kcNorm(val('fx_email'))]) + subject())}&body=${encodeURIComponent(body)}`; };
  fm.onsubmit = e => {
    fm.dataset.tried = 1; pick();
    const errs = check();
    if (errs.length) { e.preventDefault(); $('#fixErr').textContent = `Please fix ${errs.length === 1 ? 'the highlighted part' : `the ${errs.length} highlighted parts`}.`;
      const first = errs[0] === 'fx_any' ? fm.querySelector('[data-pen]') : errs[0] === 'fx_start' ? g('fx_start') : errs[0] === 'fx_file' ? g('fx_file') : g(errs[0]); first && first.focus(); return; }
    $('#fixErr').textContent = '';
    if (isAdmin() && AUTH.client && AUTH.user) { e.preventDefault(); adminSave(); return; }
    if (!SITE.formEndpoint || !navigator.onLine) { e.preventDefault(); g('fixMail').click(); location.href = g('fixMail').href; toast('Opening your email app…'); return; }
    g('fx_changes').value = changeText(); g('fx_role_val').value = roleVal('fx'); rememberMe({s_name: val('fx_who'), s_email: val('fx_email'), s_club: val('fx_club'), s_role: g('fx_role').value, s_role_other: (g('fx_role_other') || {}).value});
    g('fx_gen').innerHTML = changes().map(([l, o, n]) => `<input type="hidden" name="${esc(l)}" value="${esc(o + ' → ' + n)}">`).join('');
    fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?fixed=1#/fix';
    fm.querySelector('[name=_subject]').value = subject();
    const fi = g('fx_file'); if (fi && !fi.files.length) fi.disabled = true;
    const b = g('fixBtn'); b.disabled = true; b.textContent = 'Sending…';
    kcSubmit(e, fm, val('fx_email'), tag => { fm.querySelector('[name=_subject]').value = tag + subject(); });
  };
  /* Admin: write the open, changed rows to public.event_overrides and apply them on this page at once. */
  async function adminSave(){
    const b = g('fixBtn'), live = g('fxLive'), x = cur, n = fixNow(x), p = {};
    b.disabled = true; b.textContent = 'Saving…'; live.hidden = true;
    try {
      fm.querySelectorAll('.fx-row.editing').forEach(row => { const k = row.dataset.k;
        if (k === 'dates') { const s = val('fx_start'), en = val('fx_end') || s; if (s) Object.assign(p, {start_date: s, end_date: en}); }
        else if (k === 'time') { const a = val('fx_tasm'), sh = val('fx_tshoot'); if (a || sh) p.start_times = [a && 'Assembly ' + fmtTime(a), sh && 'shooting starts ' + fmtTime(sh)].filter(Boolean).join(', '); }
        else if (k === 'venue') { const v = comboVal('fx_venue'); if (v) p.location = v; }
        else if (k === 'rounds') { const v = comboVal('fx_rounds'); if (v) p.rounds = v; }
        else if (k === 'divs') { const v = comboVal('fx_divs'); if (v) p.divisions = v; }
        else if (k === 'close') p.entry_close_date = val('fx_close') || null;
        else if (k === 'register') { const L = regRead('fxr'); if (L.err) throw new Error(L.err); const bk = L.list.find(o => o.m === 'bank') || {};
          Object.assign(p, {register: L.list, registration_url: regFirstUrl(L.list), registration_url_kind: regFirstUrl(L.list) ? 'entry_page' : null, bank_account_name: bk.acct_name || null, bank_bsb: bk.bsb || null, bank_account: bk.acct || null, bank_reference: bk.ref || null}); }
        else if (k === 'reg') { const v = val('fx_reg'); if (v && !/^https?:\/\//i.test(v)) throw new Error('The register link must start with https://'); p.registration_url = v || null; p.registration_url_kind = v ? 'entry_page' : null; }
        else if (k === 'enotes') p.notes = val('fx_enotes') || null; });
      if (g('fx_cancel') && g('fx_cancel').checked) p.cancelled = true;
      if (g('fx_uncancel') && g('fx_uncancel').checked) p.cancelled = false;
      const fl = g('fx_file') && !g('fx_file').disabled && g('fx_file').files[0];
      if (fl) { const ext = (/\.([a-z0-9]+)$/i.exec(fl.name) || [, 'jpg'])[1].toLowerCase(), isPdf = ext === 'pdf' || fl.type === 'application/pdf';
        const path = `overrides/${x.id.replace(/[^\w.-]/g, '_')}-${Date.now()}.${ext}`;
        const up = await AUTH.client.storage.from(FLY_BUCKET).upload(path, fl, {contentType: fl.type || (isPdf ? 'application/pdf' : 'image/jpeg'), upsert: true});
        if (up.error) throw new Error('Flyer upload failed: ' + up.error.message);
        const url = AUTH.client.storage.from(FLY_BUCKET).getPublicUrl(path).data.publicUrl;
        Object.assign(p, {flyer_url: isPdf ? url : null, flyer_web: isPdf ? null : url, flyer_web_sm: isPdf ? 'icons/icon-512.png' : url, flyer_is_pdf: isPdf, flyer_label: 'Flyer (updated)', flyer_year: +(p.start_date || x.start_date || '').slice(0, 4) || null, flyer_is_current: true, flyer_source_name: 'admin upload', org_status: 'flyer'}); }
      if (!Object.keys(p).length) throw new Error('Nothing changed: tap ✏️ and change something first.');
      p.last_checked = new Date().toISOString().slice(0, 10);
      const fields = Object.assign({}, OVR[x.id] || {}, p);
      const r = await AUTH.client.from('event_overrides').upsert({event_id: x.id, fields, updated_by: AUTH.user.email}, {onConflict: 'event_id'});
      if (r.error) throw new Error(/relation|does not exist|schema cache/i.test(r.error.message) ? 'The event_overrides table isn\'t set up yet (run supabase/event_overrides.sql).' : /row-level|permission/i.test(r.error.message) ? 'The database didn\'t accept you as an admin.' : r.error.message);
      OVR[x.id] = fields; applyOvr(x, fields); EV.sort((a, c) => (a.start_date || '9') < (c.start_date || '9') ? -1 : 1);
      live.innerHTML = `✅ <b>Saved live.</b> ${Object.keys(p).filter(k => !['last_checked', 'registration_url', 'registration_url_kind', 'bank_account_name', 'bank_bsb', 'bank_account', 'bank_reference'].includes(k)).length} field(s) updated for ${esc(x.name)}. <a href="#/shoot/${esc(encodeURIComponent(x.id))}">View the event</a>`;
      live.hidden = false; toast('Saved live'); g('fx_body').innerHTML = fixRows(x); Object.keys(CB).forEach(k => delete CB[k]); bindRows();
    } catch (err) { $('#fixErr').textContent = String(err.message || err); }
    b.disabled = false; b.textContent = 'Save live';
  }
  window.addEventListener('pageshow', () => { const b = $('#fixBtn'); if (b) { b.disabled = false; b.textContent = isAdmin() ? 'Save live' : 'Send correction'; } }, {once: true});
}

/* ---------- start ---------- */
boot().catch(e => { $('#view').innerHTML = `<div class="empty">Couldn't load event data (${esc(e.message)}). If you opened the file directly, run it from a web server.</div>`; });
/* Phone + Add event button: step aside while a form box or button is underneath it (same idea as the Help bubble). */
(function fabDodge(){ const b = document.getElementById('fabAdd'); if (!b) return; let t = 0;
  const chk = () => { t = 0; b.classList.remove('fab-dodge'); if (innerWidth > 760) return; const r = b.getBoundingClientRect(); if (!r.width) return;
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.top + 6]];
    b.style.visibility = 'hidden'; const hit = pts.some(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('select,input,textarea'); }); b.style.visibility = '';
    b.classList.toggle('fab-dodge', hit); };
  const q = () => { if (!t) t = requestAnimationFrame(chk); };
  addEventListener('scroll', q, {passive: true}); addEventListener('resize', q); addEventListener('hashchange', () => setTimeout(chk, 400)); setTimeout(chk, 800); })();
