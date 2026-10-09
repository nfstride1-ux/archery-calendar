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
  groups: ['aa','aba','awa'],                  // AUS scope: Archery Australia (incl. RGBs/clubs), ABA, Archery WA
  myClubs: [],                                 // club ids I belong to (clubs.json)
  homeClub: null,                              // one of myClubs
  watchClubs: [],                              // clubs I watch
  clubNotify: false,                           // browser notification for new shoots / flyers from my clubs (needs notifications on)
  clubSeen: {},                                // device only: event id -> flyer key, for "New" detection
  clubSeenClubs: {},                           // device only: club ids whose events have been baselined
  clubNew: {}                                  // device only: event id -> {t, why: 'event'|'flyer'}
};
let S = load(), EV = [], ORGS = [], CLUBS = [], CLUB = {}, BYID = {}, CMAP = {}, PH = {}, SCOPE = 'WORLD';
const STATES = [['WA','Western Australia'],['SA','South Australia'],['VIC','Victoria'],['NSW','New South Wales'],['ACT','Australian Capital Territory'],['QLD','Queensland'],['TAS','Tasmania'],['NT','Northern Territory']];
const GROUPS = [['aa','Archery Australia','State associations (RGBs) and clubs – target, field, indoor, clout, QREs'],['aba','Australian Bowhunters Association (ABA)','All 10 branches (A–J) – field, 3D, IFAA'],['awa','Archery WA','WA state events, QREs and club shoots']];
const AUS = () => SCOPE === 'AUS';
const SITE = Object.assign({flyers:'local', ads:true, contact:'nfshold@gmail.com'}, window.SITE || {});
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const pd = s => s ? new Date(s + 'T00:00:00') : null;
const daysTo = s => Math.round((pd(s) - today()) / 864e5);

function load(){ try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return {...DEFAULT}; } }
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); if (typeof AUTH !== 'undefined' && AUTH.sync) AUTH.sync.track(); }
/* ---------- my entry status: none | entered | paid ----------
   Works for ANY shoot (no need to save it first): marking entered/paid adds it to My shoots automatically.
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
  toast(st === 'none' ? '☐ Marked as not entered' : st === 'entered' ? `✓ Marked as entered${was === 'paid' ? ' – not paid' : ''}${added ? ' · added to My shoots' : ''}` : `$ Marked as entered + paid${added ? ' · added to My shoots' : ''}`);
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
  $('#todayLbl').textContent = today().toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'});
  const [e, o, ph, cl] = await Promise.all([fetch('data/events.json').then(r => r.json()), fetch('data/organisations.json').then(r => r.json()), fetch('img/credits.json').then(r => r.json()).catch(() => ({})), fetch('data/clubs.json').then(r => r.json()).catch(() => ({clubs: []})), fetch('data/club_logos.json').then(r => r.json()).then(j => { LOGO = j.logos || {}; }).catch(() => {})]);
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
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSW && !sessionStorage.getItem('swReloaded')) { sessionStorage.setItem('swReloaded', '1'); location.reload(); } });
    navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(r => r.update()).catch(() => {});
  }
  importHandoff(); clubUpdates(); route(); checkReminders(); setInterval(checkReminders, 60 * 60 * 1000);
  initAuth().catch(e => console.warn('auth', e));
}

/* ---------- settings migration: never let stale/odd saved settings hide everything ---------- */
function migrateSettings(){
  const codes = STATES.map(s => s[0]), gk = GROUPS.map(g => g[0]);
  const st = Array.isArray(S.states) ? S.states : typeof S.states === 'string' ? S.states.split(',') : [];
  S.states = [...new Set(st.map(v => String(v).trim().toUpperCase()).map(v => (STATES.find(s => s[1].toUpperCase() === v) || [v])[0]).filter(v => codes.includes(v)))];
  if (S.states.length === codes.length) S.states = [];
  const gr = Array.isArray(S.groups) ? S.groups.map(v => String(v).trim().toLowerCase()).filter(v => gk.includes(v)) : [];
  S.groups = gr.length ? [...new Set(gr)] : DEFAULT.groups.slice();
  for (const k of ['countries', 'orgs']) if (!Array.isArray(S[k])) S[k] = DEFAULT[k].slice();
  for (const k of ['saved', 'entries', 'notified']) if (!S[k] || typeof S[k] !== 'object' || Array.isArray(S[k])) S[k] = {};
  S.v = 2; try { save(); } catch {}
}
/* ---------- helpers ---------- */
function visible(x, anyState){
  if (S.saved[x.id]) return true;
  if (AUS()) return S.groups.includes(x.org_group) && (anyState || !S.states.length || !x.state_code || S.states.includes(x.state_code));
  if (S.world && x.world_level) return true;
  if (S.orgs.includes(x.org_id)) return true;
  if (x.country_code && S.countries.includes(x.country_code) && !x.world_level) {
    // ABA / Archery WA shoots only show if that body is ticked (they're not WA-sanctioned)
    if (['aba','archery-wa'].includes(x.org_id)) return S.orgs.includes(x.org_id);
    return true;
  }
  return false;
}
const THEMES = {field:['🌲','Field'], '3d':['🦌','3D'], target:['🎯','Target'], indoor:['🏠','Indoor'], mixed:['🏹','Archery']};
const photo = t => PH[t === 'mixed' ? 'hero' : t] || PH.hero || {};
// ABA pages never show Archery Australia / World Archery team imagery: ABA events use their own bush / 3D animal photo set.
// ABA logo (transparent; 32/64/128/256 px PNG + WebP). Only ever used on ABA content.
const abaLogo = (n = 32, cls = 'org-logo') => `<picture class="${cls}"><source type="image/webp" srcset="img/logos/aba-logo-${n}.webp 1x, img/logos/aba-logo-${Math.min(n * 2, 256)}.webp 2x"><img src="img/logos/aba-logo-${n}.png" srcset="img/logos/aba-logo-${Math.min(n * 2, 256)}.png 2x" alt="Australian Bowhunters Association" height="${n}" width="${Math.round(n * 263 / 342)}" loading="lazy" decoding="async"></picture>`;
const isAba = x => x && (x.org_group === 'aba' || x.org_id === 'aba');
const abaKey = t => t === '3d' ? 'aba_3d' : 'aba_field';
const evTheme = x => isAba(x) ? abaKey(theme(x)) : theme(x);
const evPhoto = x => photo(evTheme(x));
/* Host mark: each shoot shows its HOST CLUB's logo (img/clubs/, sources in img/clubs/logos.json), never a person's photo.
   No club logo found: ABA shoots show the ABA logo; everyone else gets a navy/gold initials badge. Logos are never invented. */
let LOGO = {};
const ORG_HOST = {aba: 'Australian Bowhunters Association', 'archery-wa': 'Archery WA', 'archery-australia': 'Archery Australia', 'wa-aus': 'Archery Australia', 'world-archery': 'World Archery'};
const hslug = n => (n || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function hostOf(x){
  const c = CLUB[x.club_id]; if (c) return {id: c.id, name: c.name};
  const h = (x.host || '').replace(/\s*\(.*\)/, '').trim(); if (h) return {id: hslug(h), name: h};
  return {id: x.org_id, name: ORG_HOST[x.org_id] || x.org || 'Archery'};
}
function initials(n){
  const w = (n || '').replace(/&/g, ' ').split(/[\s\-–]+/).filter(s => s && !/^(of|the|and|inc\.?|incorporated)$/i.test(s));
  if (w.length === 1 && /^[A-Z]{2,4}$/.test(w[0])) return w[0];
  let i = w.map(s => s[0]).join('').toUpperCase(); if (i.length < 2) i = (w[0] || 'AC').slice(0, 2).toUpperCase();
  return i.slice(0, 4);
}
function hostMark(x, big){
  const h = hostOf(x), L = LOGO[h.id];
  if (L) return `<span class="hm hm-logo${big ? ' big' : ''}"><img src="${esc(big ? L.file : (L.sm || L.file))}" alt="${esc(h.name)} logo" loading="lazy" decoding="async"></span>`;
  if (isAba(x)) return `<span class="hm hm-logo hm-aba${big ? ' big' : ''}">${abaLogo(big ? 128 : 64, 'aba-pic')}</span>`;
  const i = initials(h.name);
  return `<span class="hm hm-ini${big ? ' big' : ''}" data-n="${i.length}" role="img" aria-label="${esc(h.name)}"><b aria-hidden="true">${esc(i)}</b></span>`;
}
const credit = () => '';   // photo credits live on the Credits page only (linked from every footer), not on the photos
function theme(x){
  const d = (x.discipline || '') + ' ' + (x.name || '') + ' ' + (x.rounds || '');
  if (/indoor|vegas|18 ?m/i.test(d)) return 'indoor';
  if (/3d|bowfish|trail shoot|bowhunter|safari/i.test(d)) return '3d';
  if (/field|ifaa|hunter round|aba/i.test(d)) return 'field';
  if (/target|clout|para|matchplay|qre|1440|720|900|canberra|olympic|world cup|championships/i.test(d)) return 'target';
  return 'mixed';
}
const CATS = {competition:['🏹','Competition','Competitions'], club:['👥','Club shoot','Club shoots'], coaching:['🎓','Coaching course','Coaching courses'], youth:['🧒','Youth training','Youth training'], come_try:['👋','Come & try','Come & try / have-a-go']};
const catOf = x => CATS[x.category] ? x.category : 'competition';
const isShoot = x => ['competition', 'club'].includes(catOf(x));   // real shoots (have a discipline theme), vs courses / programs
const catTag = x => catOf(x) === 'competition' ? '' : `<span class="tag cat cat-${catOf(x)}">${CATS[catOf(x)][0]} ${CATS[catOf(x)][1]}</span>`;
const TSEL = [['competition','🏹 Competitions'], ['club','👥 Club shoots'], ['coaching','🎓 Coaching'], ['youth','🧒 Youth'], ['come_try','👋 Come & try'], ['','All']];
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
  return x.start_date === x.end_date || !x.end_date ? a.toLocaleDateString('en-AU', {weekday:'short', ...o}) : `${a.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${b.toLocaleDateString('en-AU', o)}`;
}
const OST = {flyer:['📄','2026 flyer out','Flyer out'], no_details:['⏳','No entry details yet','No entry details yet']};
function orgBadge(x){
  const k = x.org_status; if (!OST[k] || x.info_only && !x.book_anytime) return '';
  const lbl = k === 'flyer' ? (x.flyer_is_current ? `${x.flyer_year || (x.start_date || '').slice(0, 4)} flyer out` : 'Details & entry out') : OST[k][1];
  return `<span class="b ost ost-${k}">${OST[k][0]} ${lbl}</span>`;
}
function entryBadge(x){
  if (isPast(x) || x.info_only) return '';
  const c = x.entry_close_date, f = d => pd(d).toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  if (c && daysTo(c) < 0) return `<span class="b closed">🔒 Entries closed ${f(c)}</span>`;
  if (x.registration_opens && daysTo(x.registration_opens) > 0) return `<span class="b tbc">◷ Entries open ${f(x.registration_opens)}</span>`;
  if (x.org_status === 'flyer' && (x.registration_url || c)) return `<span class="b open">✍ Entries open${c ? ' · close ' + f(c) : ''}</span>`;
  return '';
}
function badges(x, onCard){
  const b = [clubBadge(x), clashBadge(x), orgBadge(x), entryBadge(x)].filter(Boolean), en = S.entries[x.id];
  if (x.book_anytime) b.push(`<span class="b tbc">📞 Book any time</span>`);
  else if (x.info_only) b.push(`<span class="b tbc">${isShoot(x) ? 'ℹ Info only' : '↻ Ongoing program'}</span>`);
  if (x.titles) b.push(`<span class="b titles">🏅 ${x.titles === 'state' ? 'State Titles' : 'Branch Titles'}</span>`);
  else if (/state champ/i.test(x.level || '')) b.push(`<span class="b titles">🏅 State Championship</span>`);
  if (x.members_only) b.push(`<span class="b members">👥 Club members only</span>`);
  if (x.series_part) b.push(`<span class="b series">${esc(x.series_part)}</span>`);
  if (isPast(x)) b.push(`<span class="b past">◷ Finished</span>`);
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
function evCard(x){
  const on = !!S.saved[x.id], t = theme(x);
  return `<article class="ev th-${t}" role="link" tabindex="0" data-open="${esc(x.id)}" aria-label="${esc(x.name)}">
    <div class="ev-img ev-host">${dateBox(x)}${hostMark(x)}</div>
    <div class="body"><div class="tags">${catTag(x)}${t !== 'mixed' && isShoot(x) ? tagHtml(t) : ''}${x.flyer_local ? `<span class="tag fl">📄 ${x.flyer_is_current ? x.flyer_year + ' flyer' : 'Last year’s flyer'}</span>` : ''}</div>
      <h3 class="name">${esc(x.name)}</h3>
      <div class="meta">${esc([x.location, x.country_code && x.country_code !== 'AUS' ? x.country : x.state].filter(Boolean).join(' · '))}</div>
      <div class="meta">${isAba(x) ? abaLogo(32, 'org-logo') : ''}${esc([x.discipline, x.org, x.aba_branch && x.aba_branch.split(' – ')[0]].filter(Boolean).join(' · '))}</div>${badges(x, true)}
      ${x.info_only ? '' : statusToggles(x)}</div>
    ${x.info_only ? '' : `<button class="star" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} my shoots" data-star="${esc(x.id)}">${on ? '★' : '☆'}</button>`}
  </article>`;
}
function adSlot(kind, t){
  if (!SITE.ads) return '';
  const what = {field:'field archery', '3d':'3D', target:'target archery', indoor:'indoor'}[t];
  if (kind === 'banner') return `<aside class="ad ad-banner" aria-label="Advertising space (placeholder)"><span class="ad-lbl">Sponsor space · placeholder</span>
    <div class="ad-copy"><b>Your shop here — advertise to archers</b><span>Bows, arrows, targets, coaching and ranges. Reach archers planning their next shoot.</span></div>
    <a class="btn gold" href="#/advertise">Advertise with us</a></aside>`;
  if (kind === 'feed') return `<aside class="ad ad-feed" aria-label="Featured retailer (placeholder)"><span class="ad-lbl">Featured retailer · placeholder</span>
    <div class="ad-copy"><b>Your shop here — advertise to archers</b><span>A featured card like this appears every 10 shoots in the list.</span></div>
    <a class="btn alt" href="#/advertise">Find out more</a></aside>`;
  return `<aside class="ad ad-side" aria-label="Sponsor (placeholder)"><span class="ad-lbl">Sponsor · placeholder</span>
    <b class="ad-head">${what ? 'Gear up for ' + what : 'Gear up for your next shoot'}</b>
    <span>Your archery shop here. Show ${what ? what + ' ' : ''}archers your gear on every ${what ? what + ' ' : ''}shoot page.</span>
    <a class="btn gold block" href="#/advertise">Advertise with us</a></aside>`;
}
function bindCards(root = document){
  bindToggles(root);
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = ev => { ev.stopPropagation(); toggleSave(b.dataset.star); });
  root.querySelectorAll('[data-open]').forEach(c => { c.onclick = () => location.hash = '#/shoot/' + encodeURIComponent(c.dataset.open);
    c.onkeydown = e => { if (e.key === 'Enter' && e.target === c) c.click(); }; });
}
function toggleSave(id){
  if (S.saved[id]) { delete S.saved[id]; toast('Removed from My shoots'); }
  else { S.saved[id] = {added: iso(new Date())}; toast('★ Added to My shoots'); }
  save(); const y = scrollY; render(); scrollTo(0, y);
}
function setTitle(t){ document.title = t === 'Archery Calendar' ? 'Archery Calendar – every archery shoot in one calendar' : t + ' · Archery Calendar'; }
/* Banners: wide photos fill the banner (with a per-photo focal point, credits.json "pos"); group photos ("layout":"split")
   sit beside the text at their full 16:9 frame so nobody's face is cut off. */
function heroOpen(cls, p){
  return p.layout === 'split' ? `<section class="${cls} split${p.keep ? ' keep' : ''}"><div class="wrap split-row"><div class="split-txt">`
    : `<section class="${cls}" style="--img:url('${esc(p.file)}');--pos:${esc(p.pos || 'center 35%')}"><div class="wrap">`;
}
const heroClose = p => p.layout === 'split' ? `</div><figure class="split-img${p.shape === 'portrait' ? ' tall' : ''}">${p.webp ? `<picture><source type="image/webp" srcset="${esc(p.webp)}">` : ''}<img src="${esc(p.file)}" alt="${esc(p.alt || p.title || '')}" style="object-position:${esc(p.shape === 'portrait' ? 'center' : (p.pos || 'center'))}" width="${p.shape === 'portrait' ? 960 : 1600}" height="${p.shape === 'portrait' ? 1200 : 900}">${p.webp ? '</picture>' : ''}</figure></div></section>` : `</div></section>`;
function pageHead(title, sub, t = 'mixed'){
  const p = t === 'youth' ? Object.assign({keep: true}, PH.youth || photo('mixed')) : photo(t);
  return `${heroOpen('phead', p)}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}${heroClose(p)}`;
}
function clubCta(compact){
  const m = `mailto:${SITE.contact}?subject=${encodeURIComponent('Our shoot / flyer for Archery Calendar')}`;
  return `<aside class="cta${compact ? ' compact' : ''}"><span class="kicker">Clubs &amp; organisers</span><b class="cta-h">Send us your flyer</b>
    <p>No online entries? We'll list your shoot, set up an entry form and send you the entry list.</p>
    <div class="cta-btns"><a class="btn gold" href="#/submit">Submit a shoot</a><a class="cta-mail" href="${m}">or email ${esc(SITE.contact)}</a></div></aside>`;
}
function flyerLinkCard(x){
  const ex = x.flyer_extract || {}, cur = x.flyer_is_current, ly = cur ? '' : '<span class="lastyr">Last year</span>';
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
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
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
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
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
  const rows = [['How to enter', ex.registration], [cur && !(ex.entry_close && daysTo(ex.entry_close) < 0) ? 'Entries close' : 'Entries closed', close], ['Fee', ex.fee], ['Rounds', ex.rounds], ['Times', ex.start_times], ['Contact', ex.contact], ['Notes', ex.notes]].filter(r => r[1]);
  return `<section class="panel flyer-panel"><div class="flyer"><a class="thumb" href="${esc(x.flyer_local)}" target="_blank" rel="noopener" aria-label="Open the full flyer"><img src="${esc(x.flyer_thumb)}" alt="Flyer page 1" loading="lazy"><span>View flyer ↗</span></a>
    <div><span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' flyer – current' : '⚠ ' + x.flyer_year + ' flyer – last year'}</span>
    <p class="fl-label">${esc(x.flyer_label)}</p><p class="note">Tap the flyer to open it full size.<br>${x.flyer_url ? `Original: <a href="${esc(x.flyer_url)}" target="_blank" rel="noopener">organiser's file</a>` : esc(x.flyer_found_on || '')}</p></div></div>
    ${rows.length ? `<h2 class="sec">${cur ? 'From the flyer' : 'From last year’s flyer – may change this year'}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${ly}${esc(v)}</dd>`).join('')}</dl>
    ${!cur && ex.registration_url ? `<p class="note">Last year's entry link: <a href="${esc(ex.registration_url)}" target="_blank" rel="noopener">${esc(ex.registration_url.slice(0,60))}…</a> (may not work this year)</p>` : ''}` : ''}</section>`;
}
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
      for (const d of days) if (dp <= d && dp >= 0) { out.push({key:`${id}:pay:${d}`, x, when:dp, kind:'pay', st, text: ref === x.start_date ? `you're entered but haven't marked it paid – shoot in ${pl(dp)}` : `you're entered but haven't marked it paid – entries close in ${pl(dp)}`}); break; }
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
    const body = `${range(r.x)} · ${r.x.location || ''}\n${r.kind === 'close' ? 'Tap to open the entry page.' : r.kind === 'pay' ? 'Tap to open the shoot and mark it paid.' : {paid:'✓ You are entered and paid.', entered:'✓ Entered · ☐ not marked paid.', none:'☐ You have NOT marked this as entered.'}[r.st]}`;
    const opts = {body, tag:r.key, icon:'icons/icon-192.png', data:{id:r.x.id}};
    navigator.serviceWorker?.ready.then(reg => reg.showNotification(`${r.x.name} ${r.text}`, opts)).catch(() => new Notification(`${r.x.name} ${r.text}`, opts));
    S.notified[r.key] = Date.now();
  }
  save();
}

/* ---------- views ---------- */
function vHome(){
  setTitle('Archery Calendar');
  const mine = Object.keys(S.saved).map(id => BYID[id]).filter(Boolean);
  const up = mine.filter(x => !isPast(x)).sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
  const nEnt = up.filter(x => ST(x.id) !== 'none').length, nPay = up.filter(x => ST(x.id) === 'entered').length, nTodo = up.filter(x => ST(x.id) === 'none' && !x.info_only).length;
  const rem = reminders();
  const next = up.find(x => x.start_date);
  const suggest = EV.filter(x => visible(x) && !isPast(x) && x.start_date && !S.saved[x.id] && !x.info_only).sort((a,b)=>a.start_date<b.start_date?-1:1).slice(0, 6);
  const h = photo('mixed');
  return `
  <section class="hero" style="--img:url('${esc(h.file)}')"><div class="wrap hero-grid">
    <div class="hero-copy"><p class="kicker">Field · 3D · Target · Indoor</p><h1>Every archery shoot.<br><span>One calendar.</span></h1>
      <p class="lead">${AUS() ? 'Find archery shoots across Australia – Archery Australia, ABA and Archery WA.' : 'Find shoots across WA, Australia and the world.'} Save them, get reminders before entries close, and keep track of what you've paid.</p>
      <form class="hero-search" id="heroSearch" role="search"><input type="search" id="hq" placeholder="Search a shoot, club or town…" aria-label="Search shoots"><button class="btn gold" type="submit">Find shoots</button></form></div>
    ${next ? `<a class="next-card" href="#/shoot/${esc(next.id)}"><span class="kicker">Your next shoot</span><b class="big">${daysTo(next.start_date) <= 0 ? 'On now' : daysTo(next.start_date) + ' days'}</b>
      <span class="nm">${esc(next.name)}</span><span>${esc(range(next))}</span><span class="st">${ST_TXT[ST(next.id)]}</span></a>` : ''}
  </div>${credit('mixed')}</section>
  <div class="wrap">
    <div class="stats four"><a class="stat" href="#/calendar"><b>${up.length}</b><span>★ My shoots</span></a><a class="stat" href="#/entries"><b>${nEnt}</b><span>✓ Entered</span></a><a class="stat" href="#/entries"><b>${nTodo}</b><span>☐ To enter</span></a><a class="stat" href="#/entries"><b>${nPay}</b><span>$ To pay</span></a></div>
    ${adSlot('banner')}
    <h2 class="sec-h">Pick your discipline</h2>
    <div class="types">${['field','3d','target','indoor'].map(t => `<a class="type th-${t}" href="#/browse" data-th="${t}" style="--img:url('${esc(photo(t === 'field' ? 'aba_field' : t).sm)}');--pos:${esc(photo(t === 'field' ? 'aba_field' : t).pos || 'center')}"><span class="type-name">${THEMES[t][0]} ${THEMES[t][1]}</span><span class="type-sub">${{field:'Bush courses, marked & unmarked', '3d':'Foam animals in the bush', target:'Outdoor ranges, 18–90 m', indoor:'18 m halls, 3-spot & Vegas'}[t]}</span></a>`).join('')}</div>
    <div class="cats-row" aria-label="Club shoots, coaching, youth and come & try">${['club', 'coaching', 'youth', 'come_try'].map(c => `<a class="cat-link cat-${c}" href="#/browse" data-cat="${c}">${c === 'youth' && PH.youth ? `<span class="cat-img" aria-hidden="true" style="background-image:url('${esc(PH.youth.sm)}');background-position:${esc(PH.youth.pos)}"></span>` : ''}<span class="ci" aria-hidden="true">${CATS[c][0]}</span><b>${CATS[c][2]}</b><span>${EV.filter(x => catOf(x) === c && visible(x) && !isPast(x)).length} coming up</span></a>`).join('')}</div>
    ${homeClubs()}
    <div class="two">
      <section><h2 class="sec-h">Reminders</h2>
      ${rem.length ? rem.map(r => `<div class="panel rem" data-open="${esc(r.x.id)}" role="link" tabindex="0"><b><span aria-hidden="true">${REM_ICON[r.kind]}</span> ${esc(r.x.name)}</b><div>${esc(r.text)}</div><div class="badges">${r.kind === 'close' ? '<span class="b close">⏳ Enter now</span>' : r.kind === 'pay' ? '<span class="b ent">$ Pay now</span>' : REM_BADGE[r.st]}</div></div>`).join('')
        : `<p class="note">Nothing due. You'll get reminders ${S.remindDays.join(', ')} days before each shoot, and ${S.closeDays.join(' / ')} days before entries close (only if you haven't entered), plus a pay reminder if you've entered but not paid.</p>`}</section>
      <section><h2 class="sec-h">Coming up in my shoots</h2>
      ${up.length ? `<div class="list">${up.slice(0, 4).map(evCard).join('')}</div>` : `<div class="empty">No shoots yet. Tap ☆ on any shoot in <a href="#/browse">Find shoots</a>.</div>`}</section>
    </div>
    ${clubCta()}
    ${suggest.length ? `<h2 class="sec-h">Next shoots in your areas</h2><div class="list grid2">${suggest.map(evCard).join('')}</div><p class="center"><a class="btn" href="#/browse">See all shoots →</a></p>` : ''}
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
  const grpTxt = {aa:'aa archery australia', aba:'aba bowhunters australian bowhunters association', awa:'awa archery wa archerywa'}[x.org_group] || '';
  const lvl = [x.level, x.rounds, x.titles === 'state' ? 'state titles' : x.titles === 'branch' ? 'branch titles' : '', /\bqre\b|world record/i.test((x.name || '') + ' ' + (x.level || '')) ? 'qre world record status' : '',
    /national/i.test((x.level || '') + ' ' + x.name) && !/registered/i.test(x.level || '') ? 'nationals national' : '', x.members_only ? 'club championship members' : ''];
  const cat = catOf(x), catTxt = {competition:'competition shoot tournament', club:'club shoot clubshoot social local', coaching:'coaching course coach', youth:'youth junior kids training', come_try:'come and try beginners'}[cat] + (x.book_anytime ? ' corporate team building book anytime' : '');
  const stat = [x.org_status === 'flyer' ? 'flyer out details' : 'no entry details yet', x.entry_close_date ? (daysTo(x.entry_close_date) < 0 ? 'entries closed' : 'entries open') : x.registration_url ? 'entries open' : ''];
  const cb = CLUB[x.club_id], words = snorm([x.name, x.host, cb && cb.name, ...(cb ? cb.aliases : []), x.location, x.org, sc, st && st[1], sc && CAPITAL[sc], x.discipline, catTxt, ...lvl, grpTxt, x.branch ? 'branch ' + x.branch : '', x.branch_name, ...months, ...stat, x.series_part, x.notes, ...Object.entries(x.flyer_extract || {}).filter(([k, v]) => typeof v === 'string' && !/url|source/.test(k)).map(([, v]) => v), roundTerms(x)].filter(Boolean).join(' '));
  return x._hay = {s: ' ' + words + ' ', w: [...new Set(words.split(' '))]};
}
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
const matchQ = (x, Q) => (!Q.states.length || Q.states.includes(x.state_code)) && Q.words.every(w => wordHit(w, hay(x)));
let BF = {q:'', disc:'', cat:'', ost:'', scope:'all', state:'', club:'', clubId:'', mc:false, past:false, hideClash:false, limit:60};
function vBrowse(){
  setTitle('Find shoots');
  const grp = AUS() && BF.scope.startsWith('g:') ? BF.scope.slice(2) : null;
  if (AUS() && grp && !GROUPS.some(g => g[0] === grp)) BF.scope = 'all';
  // A chip always wins over Settings: ABA chip = every ABA shoot (only the page's own state filter applies).
  // Picking a state on this page overrides 'My states' from Settings.
  const Q = BF.q ? parseQuery(BF.q) : null, qState = !!(Q && Q.states.length);
  // A state named in the search (e.g. 'target sa') also overrides 'My states' from Settings.
  const vis = grp ? EV.filter(x => x.org_group === grp) : EV.filter(x => visible(x, !!BF.state || qState));
  const scopes = AUS() ? [['all','All Australia'], ...GROUPS.map(g => ['g:' + g[0], {aa:'Archery Australia', aba:'ABA', awa:'Archery WA'}[g[0]]])] : [['all','All'], ['world','🌐 World'], ...S.countries.map(c => [c, CMAP[c] || c]), ...S.orgs.map(o => [o, (ORGS.find(x => x.id === o) || {}).name?.replace(/\s*\(.*\)/,'') || o])];
  const discs = [...new Set(vis.filter(x => BF.past || !isPast(x)).map(x => (x.discipline || '').split(/[ (/]/)[0]).filter(Boolean))].sort();   // only disciplines with shoots to show
  if (BF.disc && !discs.includes(BF.disc)) discs.push(BF.disc);   // never hide an active filter behind 'All disciplines'
  let list = vis.slice();
  if (BF.scope.startsWith('g:')) list = list.filter(x => x.org_group === BF.scope.slice(2));
  else if (BF.scope === 'world') list = list.filter(x => x.world_level);
  else if (BF.scope !== 'all') list = list.filter(x => x.country_code === BF.scope && !x.world_level && !['aba','archery-wa'].includes(x.org_id) || x.org_id === BF.scope);
  if (BF.clubId) list = EV.filter(x => x.club_id === BF.clubId);
  else if (BF.club) list = (BF.state ? EV.filter(x => x.state_code === BF.state) : EV).filter(clubFilter(BF.club));
  else if (BF.state) list = list.filter(x => x.state_code === BF.state);
  const active = [BF.q && `search “${esc(BF.q)}”`, BF.state && (STATES.find(s => s[0] === BF.state) || [, BF.state])[1], BF.disc && `discipline ${esc(BF.disc)}`, BF.cat && CATS[BF.cat] && CATS[BF.cat][2], BF.ost && OST[BF.ost] && OST[BF.ost][2], BF.club && CLUBF[BF.club], BF.clubId && CLUB[BF.clubId] && `club: ${esc(CLUB[BF.clubId].name)}`, BF.cat === 'club' && BF.mc && 'only my clubs', qState && `state from your search: ${Q.states.join(', ')}${!grp && !BF.state && S.states.length ? ' (overrides your Settings states)' : ''}`, !grp && !BF.state && !qState && S.states.length && AUS() && `your states in Settings (${S.states.join(', ')})`].filter(Boolean);
  if (BF.disc) list = list.filter(x => (x.discipline || '').startsWith(BF.disc));
  const tc = typeCounts(list.filter(x => BF.past || !isPast(x)));
  if (BF.cat) list = list.filter(x => catOf(x) === BF.cat);
  if (BF.cat === 'club' && BF.mc) list = list.filter(x => followed().includes(x.club_id));
  if (BF.ost) list = list.filter(x => x.org_status === BF.ost);
  if (Q) list = list.filter(x => matchQ(x, Q));
  const myD = myDated(), nClash = myD.length ? list.filter(x => !BF.past && !S.saved[x.id] && !S.entries[x.id] && clashes(x, myD).length).length : 0;
  if (BF.hideClash && myD.length) list = list.filter(x => S.saved[x.id] || S.entries[x.id] || !clashes(x, myD).length);
  let showPastNote = false;
  if (!BF.past) { const up = list.filter(x => !isPast(x)); if (!up.length && Q && list.length) showPastNote = true; else list = up; }
  const sk = x => x.book_anytime ? '9999-99' : x.start_date || '9999';
  list.sort((a, b) => sk(a) < sk(b) ? -1 : 1);
  const total = list.length; list = list.slice(0, BF.limit);
  let html = `${pageHead('Find a shoot', 'Field, 3D, Target and Indoor shoots from the calendars you follow.', BF.cat === 'youth' && BF.scope !== 'g:aba' && PH.youth ? 'youth' : BF.scope === 'g:aba' ? abaKey(BF.disc === '3D' ? '3d' : 'field') : BF.disc === 'Field' && !['g:aa', 'g:awa'].includes(BF.scope) ? 'aba_field' : {Field:'field','3D':'3d',Target:'target',Indoor:'indoor'}[BF.disc] || 'mixed')}<div class="wrap">${clubNotice()}${typeSel(BF.cat, tc)}${BF.cat === 'club' ? clubDrop(BF, x => !isPast(x) || BF.past) : ''}</div><div class="wrap browse"><div class="filters"><input type="search" id="q" placeholder="Search shoot, club, town…" value="${esc(BF.q)}" aria-label="Search shoots">
  <div class="chips" role="group" aria-label="Show">${scopes.map(([k, l]) => `<button class="chip" data-scope="${esc(k)}" aria-pressed="${BF.scope === k && !BF.club}">${k === 'g:aba' ? abaLogo(32, 'chip-logo') : ''}${esc(l)}</button>`).join('')}</div>
  ${AUS() ? `<label for="st" class="sr">State</label><select id="st" aria-label="State"><option value="">All states &amp; territories</option>${STATES.map(([c, n]) => `<option value="${c}" ${BF.state === c ? 'selected' : ''}>${n}</option>`).join('')}</select>` : ''}
  <label for="ost" class="sr">Organisation status</label><select id="ost" aria-label="Organisation status"><option value="">All – any status</option>${Object.entries(OST).map(([k, v]) => `<option value="${k}" ${BF.ost === k ? 'selected' : ''}>${v[0]} ${v[2]}</option>`).join('')}</select>
  <div class="row"><select id="disc" aria-label="Discipline"><option value="">All disciplines</option>${discs.map(d => `<option ${BF.disc === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
  <label style="display:flex;align-items:center;gap:8px;margin:0;flex:0 0 auto"><input type="checkbox" id="past" ${BF.past ? 'checked' : ''} style="width:22px;min-height:22px"> Show finished</label></div>
  ${myD.length ? `<label class="chk hide-clash" style="display:flex;align-items:center;gap:8px;margin:6px 0 0"><input type="checkbox" id="hideClash" ${BF.hideClash ? 'checked' : ''} style="width:22px;min-height:22px"> ⚠️ Hide clashes with my shoots${BF.hideClash ? '' : ` (${nClash})`}</label>` : ''}
  ${showPastNote ? `<p class="note" id="pastNote">◷ No upcoming shoots match – showing finished shoots.</p>` : ''}
  ${active.length && total ? `<p class="note" id="activeF">Filtered by: ${active.join(' · ')} <button class="linkbtn" id="clearF2">✕ Clear</button></p>` : ''}
  <p class="note" id="countNote">${total} shoot${total !== 1 ? 's' : ''}. Change ${AUS() ? 'states &amp; organisations' : 'countries &amp; bodies'} in <a href="#/settings">Settings</a>.</p></div><div class="results">`;
  let m = '', n = 0;
  for (const x of list) { const k = x.book_anytime ? 'ANY' : x.start_date ? x.start_date.slice(0, 7) : 'TBC'; if (k !== m) { m = k; html += `<div class="month">${k === 'ANY' ? '📞 Book any time' : k === 'TBC' ? 'Dates to be confirmed' : MONL[+k.slice(5) - 1] + ' ' + k.slice(0, 4)}</div>`; } html += evCard(x); if (++n % 10 === 0 && n < list.length) html += adSlot('feed'); }
  if (!total) html += `<div class="empty">No shoots match${active.length ? ': ' + active.join(' · ') : ''}. ${active.length ? '<button class="btn alt" id="clearF">✕ Clear filters</button>' : `Try another filter${AUS() ? '' : ' or add countries in Settings'}.`}</div>`;
  if (total > BF.limit) html += `<button class="btn alt more" id="more">Show more (${total - BF.limit} left)</button>`;
  return html + '</div></div>';
}
function bindBrowse(){
  const q = $('#q'); q.oninput = () => { BF.q = q.value; gcSearch(q.value); BF.limit = 60; clearTimeout(bindBrowse.t); bindBrowse.t = setTimeout(() => { render(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  document.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { BF.scope = b.dataset.scope; BF.club = ''; BF.clubId = ''; BF.disc = ''; BF.limit = 60; render(); });
  document.querySelectorAll('[data-clubf]').forEach(b => b.onclick = () => { BF.club = BF.club === b.dataset.clubf ? '' : b.dataset.clubf; BF.limit = 60; render(); });
  bindClubNotice();
  const clr = () => { Object.assign(BF, {q:'', disc:'', cat:'', ost:'', state:'', club:'', clubId:'', mc:false, limit:60}); if (S.states.length) { S.states = []; save(); } render(); };
  ['#clearF', '#clearF2'].forEach(s => { const b = $(s); if (b) b.onclick = clr; });
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
    ${s === 'none' ? `<p class="note">Entered somewhere else (Assemble, Archers Diary, email)? Tick it here. It's added to My shoots automatically.</p>` : `
    <form id="entryForm" class="ent-form"><p class="note">Optional details</p>
      <div class="row"><div><label for="f_amt">Amount paid ($)</label><input id="f_amt" inputmode="decimal" placeholder="e.g. 85" value="${esc(en.amount || '')}"></div>
      <div><label for="f_pd">Date paid</label><input type="date" id="f_pd" value="${esc(en.paid_date || '')}"></div></div>
      <label for="f_ref">Receipt / entry number</label><input id="f_ref" value="${esc(en.ref || '')}" placeholder="e.g. Assemble #12345">
      <label for="f_notes">Notes (division, target, camping…)</label><textarea id="f_notes" rows="2">${esc(en.notes || '')}</textarea>
      <button class="btn alt block" type="submit">Save details</button></form>`}</div>`;
}
function vShoot(id){
  const x = BYID[id]; if (!x) return `<div class="wrap"><div class="empty">Shoot not found.</div></div>`;
  setTitle(x.name);
  const on = !!S.saved[id], en = S.entries[id];
  const kind = {how_to_guide:'How to enter (guide)', event_page:'Event page & entry', entry_page:'Register / enter', entry_system:'Enter via Archers Diary (search the event)', email:'✉ Email your nomination', nominate_aba_j:'How to nominate (ABA Branch J contacts)'}[x.registration_url_kind] || 'Register / enter';
  const kindLbl = catOf(x) === 'come_try' && x.registration_url ? 'Book a place' : !isShoot(x) && x.registration_url ? 'Register / book' : null;
  const t = theme(x), isMail = x.registration_url_kind === 'email';
  const closedNow = !!x.entry_close_date && daysTo(x.entry_close_date) < 0;
  const regBtn = x.info_only && !x.book_anytime ? '' : x.registration_url ? `<a class="btn ${closedNow ? 'alt' : 'gold'} block big-btn" id="regBtn" href="${esc(x.registration_url)}" ${isMail ? '' : 'target="_blank" rel="noopener"'}>${isMail ? '' : '↗ '}${kindLbl && !closedNow ? kindLbl : closedNow ? kind.replace(/^Register \/ enter$/, 'Entry page') + ' (entries closed)' : kind}</a>
      ${x.registration_email ? `<p class="note">Opens your email app addressed to <b>${esc(x.registration_email.to)}</b>${x.registration_email.cc ? `, cc ${esc(x.registration_email.cc)}` : ''}, with ${esc(x.registration_email.fields.join(', '))} ready to fill in.</p>` : ''}
      ${x.registration_url_source ? `<p class="note">Entry details from ${esc(x.registration_url_source)}.</p>` : ''}`
    : `<div class="warn">⚠ No online entry link found yet. ${x.org_id === 'aba' ? 'ABA shoots are entered through the host club.' : 'Check the source page below.'}</div>`;
  const closed = !!x.entry_close_date && daysTo(x.entry_close_date) < 0 && !isPast(x) && !x.info_only;
  const closeTxt = x.entry_close_date ? pd(x.entry_close_date).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'long',year:'numeric'}) + (x.entry_close_time ? ', ' + x.entry_close_time : '') : '';
  return `<section class="dhero host-hero"><div class="wrap host-row"><div class="host-txt">
    <a class="crumb" href="#/browse">← All shoots</a>
    <div class="tags">${catTag(x)}${isShoot(x) ? tagHtml(t) : ''}${x.level ? `<span class="tag lvl">${esc(x.level)}</span>` : ''}</div>
    <h1>${esc(x.name)}</h1><p class="sub">${esc(range(x))}${x.location ? ' · ' + esc(x.location) : ''}</p>${badges(x)}
  </div><figure class="host-fig">${hostMark(x, true)}<figcaption>Hosted by<br><b>${esc(hostOf(x).name)}</b></figcaption></figure></div></section>
  <div class="wrap detail">
   <div class="main">
    ${x.date_note ? `<div class="warn date-note" id="dateNote">⚠ <b>Check the dates:</b> ${esc(x.date_note)}</div>` : ''}
    ${clashBox(x)}
    ${flyerCard(x)}
    <section class="panel"><h2 class="sec">Shoot details</h2><dl class="kv">
      <dt>When</dt><dd>${esc(range(x))}${x.date_note ? '<br><span class="note">⚠ Dates differ between sources – see the note above.</span>' : ''}</dd>
      <dt>Where</dt><dd>${esc(x.location || '—')}${x.host ? `<br><span class="note">Host club: ${esc(x.host)}${x.venue_is_host_only ? ' – check the organiser for the exact range' : ''}</span>` : ''}${x.state && !(x.location || '').includes(' ' + x.state) ? ' · ' + esc(x.state) : ''}${x.country ? '<br><span class="note">' + esc(x.country) + '</span>' : ''}</dd>
      ${CLUB[x.club_id] ? `<dt>Club</dt><dd><button type="button" class="linkbtn club-name" data-clubpop="${esc(x.club_id)}" aria-haspopup="dialog">${esc(CLUB[x.club_id].name)}</button>${clubBadge(x) ? ' ' + clubBadge(x) : ''}</dd>` : ''}
      <dt>Type</dt><dd>${CATS[catOf(x)][0]} ${CATS[catOf(x)][1]}${x.class_basis ? ` <span class="note">(${esc(x.class_basis)})</span>` : ''}</dd>
      <dt>Discipline</dt><dd>${esc(x.discipline || '—')}</dd>
      <dt>Level</dt><dd>${esc(x.level || '—')}</dd>
      <dt>Organiser</dt><dd>${isAba(x) ? abaLogo(32, 'org-logo') : ''}${esc(x.org || '—')}${x.aba_branch ? '<br><span class="note">ABA ' + esc(x.aba_branch) + '</span>' : ''}</dd>
      ${x.rounds && x.rounds !== x.name && !x.name.includes(x.rounds) ? `<dt>Rounds</dt><dd>${esc(x.rounds)}</dd>` : ''}
      ${x.registration_opens ? `<dt>Entries open</dt><dd>${esc(x.registration_opens)}</dd>` : ''}
      ${closeTxt ? `<dt>Entries close</dt><dd>${esc(closeTxt)}${x.field_sources?.entry_close_date ? ` <span class="src">from ${esc(x.field_sources.entry_close_date)}</span>` : ''}</dd>` : ''}
      ${x.fee ? `<dt>Fee</dt><dd>${esc(x.fee)}${x.field_sources?.fee ? ` <span class="src">from ${esc(x.field_sources.fee)}</span>` : ''}</dd>` : ''}
    </dl>${x.notes ? `<p class="note">${esc(x.notes)}</p>` : ''}</section>
    ${CALS[x.org_group] ? `<p class="note"><a href="#/calendars/${x.org_group}">📅 See it in the full ${esc(CALS[x.org_group].name)} calendar</a></p>` : ''}
    <p class="note">Source: <a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(x.source_url)}</a>${x.also_listed ? ` · also <a href="${esc(x.also_listed)}" target="_blank" rel="noopener">World Archery listing</a>` : ''}${x.branch_source ? `<br>Branch source: <a href="${esc(x.branch_source.url)}" target="_blank" rel="noopener" id="branchSrc">${esc(x.branch_source.name)}</a>` : ''}<br>Checked ${esc(x.last_checked)}. Always confirm details with the organiser.</p>
   </div>
   <aside class="side">
    <section class="panel act">${closeTxt && ST(id) === 'none' && daysTo(x.entry_close_date) >= 0 ? `<p class="closes">⏳ Entries close<br><b>${esc(closeTxt)}</b></p>` : ''}
      ${closed ? `<p class="closed-note" id="closedNote">🔒 <b>Entries closed</b><br>${esc(closeTxt)}${x.flyer_extract && /no late/i.test(x.flyer_extract.entry_close_note || '') ? ' · no late entries' : ''}</p>` : ''}
      ${regBtn}
      ${x.info_only ? '' : myEntry(x)}
      ${x.info_only ? '' : `<button class="btn ${on ? 'alt' : ''} block" id="saveBtn" aria-pressed="${on}">${on ? '★ In My shoots – remove' : '☆ Add to My shoots'}</button>`}
      ${x.start_date && !x.info_only ? `<button class="btn alt block" id="icsOne">▦ Add to my calendar (.ics)</button>` : ''}</section>
    ${adSlot('side', t)}
    ${clubCta(true)}
   </aside>
  </div>`;
}
function bindShoot(id){
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

let CM = null;
function vCalendar(){
  setTitle('My shoots');
  const mine = Object.keys(S.saved).map(id => BYID[id]).filter(Boolean).sort((a, b) => (a.start_date || '9999') < (b.start_date || '9999') ? -1 : 1);
  if (!CM) { const n = mine.find(x => x.start_date && !isPast(x)); const d = n ? pd(n.start_date) : today(); CM = [d.getFullYear(), d.getMonth()]; }
  const [y, m] = CM, first = new Date(y, m, 1), start = (first.getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  for (const x of mine) { if (!x.start_date) continue; for (let d = pd(x.start_date); d <= pd(x.end_date || x.start_date); d.setDate(d.getDate() + 1)) (byDay[iso(d)] = byDay[iso(d)] || []).push(x); }
  let g = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < start; i++) g += `<div class="c o"></div>`;
  for (let d = 1; d <= dim; d++) { const k = iso(new Date(y, m, d)), ev = byDay[k] || [], t = k === iso(today());
    const allPaid = ev.length && ev.every(x => ST(x.id) === 'paid'), allEnt = ev.length && ev.every(x => ST(x.id) !== 'none');
    const mk = allPaid ? '✓$' : allEnt ? '✓' : '';
    g += `<div class="c ${ev.length ? 'has' : ''} ${t ? 't' : ''}" ${ev.length ? `data-open="${esc(ev[0].id)}" role="link" tabindex="0" aria-label="${d} ${MONL[m]}: ${esc(ev.map(x => x.name + ' – ' + ST_TXT[ST(x.id)].replace(/[☐✓$·]/g, '').replace(/\s+/g, ' ').trim()).join(', '))}"` : ''}>${d}${mk ? `<span class="mk" aria-hidden="true">${mk}</span>` : ''}${ev.length ? `<span class="dot">${ev.length > 1 ? ev.length + ' shoots' : '●'}</span>` : ''}</div>`; }
  const inMonth = mine.filter(x => x.start_date && (x.start_date.slice(0, 7) === iso(first).slice(0, 7) || (x.end_date || '').slice(0, 7) === iso(first).slice(0, 7)));
  const up = mine.filter(x => !isPast(x)), past = mine.filter(isPast);
  return `${pageHead('My shoots', 'Your saved shoots, month by month.', 'target')}<div class="wrap narrow"><div class="calnav"><button id="pm" aria-label="Previous month">‹</button><b>${MONL[m]} ${y}</b><button id="nm" aria-label="Next month">›</button></div>
  <div class="grid">${g}</div>
  ${clashPairsHtml()}
  <div class="legend"><span class="b lg-day">■ shoot day</span><span class="b lg-day">✓ entered</span><span class="b lg-day">✓$ entered + paid</span><span class="b lg-today">□ today</span></div>
  ${inMonth.length ? `<h2>In ${MONL[m]}</h2>${inMonth.map(evCard).join('')}` : ''}
  <h2>All my upcoming shoots (${up.length})</h2>
  ${up.length ? up.map(evCard).join('') : `<div class="empty">Nothing saved yet. Tap ☆ on shoots in <a href="#/browse">Browse</a>.</div>`}
  ${up.length ? `<button class="btn block" id="icsAll">▦ Export all to phone calendar (.ics)</button>` : ''}
  ${past.length ? `<h2>Finished (${past.length})</h2>${past.map(evCard).join('')}` : ''}</div>`;
}
function bindCalendar(){
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
  <h2>✓$ Entered + paid (${paid.length})</h2>${paid.length ? paid.map(x => { const e = S.entries[x.id]; return evCard(x).replace('</h3>', `</h3><div class="badges"><span class="b paid">$ Paid${e.amount ? ' ' + esc(e.currency || 'AUD') + ' ' + esc(e.amount) : ''}${e.paid_date ? ' · ' + esc(pd(e.paid_date).toLocaleDateString('en-AU', {day:'numeric', month:'short'})) : ''}</span>${e.ref ? `<span class="b world"># ${esc(e.ref)}</span>` : ''}</div>`); }).join('') : '<p class="note">Tick “I’ve entered” and “I’ve paid” on any shoot to track it here.</p>'}</div>`;
}

function vSettings(){
  setTitle('Settings');
  const countries = Object.entries(CMAP).sort((a, b) => a[1].localeCompare(b[1]));
  const counts = {}; EV.forEach(x => { if (x.country_code && !x.world_level) counts[x.country_code] = (counts[x.country_code] || 0) + 1; });
  const bodies = ORGS.filter(o => !o.id.startsWith('wa-') && !['world-archery','archery-australia'].includes(o.id) || o.id === 'archery-australia');
  const perm = !('Notification' in window) ? 'not supported on this browser' : Notification.permission;
  const cnt = f => EV.filter(f).length;
  const ausHtml = `<h2>States &amp; territories</h2><p class="note">Pick the states you shoot in. Leave all unticked to see the whole of Australia. National events always show.</p>
  <div class="list-check">${STATES.map(([c, n]) => `<label><input type="checkbox" data-s="${c}" ${S.states.includes(c) ? 'checked' : ''}> <span style="flex:1">${n} (${c})</span><span class="note">${cnt(x => x.state_code === c)} shoots</span></label>`).join('')}</div>
  <h2>Organisations</h2><div class="list-check">${GROUPS.map(([g, n, d]) => `<label><input type="checkbox" data-g="${g}" ${S.groups.includes(g) ? 'checked' : ''}> <span style="flex:1"><b>${n}</b><br><span class="note">${d}</span></span><span class="note">${cnt(x => x.org_group === g)} shoots</span></label>`).join('')}</div>`;
  return `${pageHead('Settings', 'Choose your clubs, calendars and reminders.', 'indoor')}<div class="wrap narrow">${clubSettings()}${AUS() ? ausHtml : `<h2>Countries</h2><p class="note">Shows each country's national calendar. Pick as many as you like.</p>
  <input type="search" id="cq" placeholder="Find a country…" aria-label="Find a country">
  <div class="list-check" id="clist">${countries.map(([c, n]) => `<label data-n="${esc(n.toLowerCase())}"><input type="checkbox" data-c="${c}" ${S.countries.includes(c) ? 'checked' : ''}> <span style="flex:1">${esc(n)}</span><span class="note">${counts[c] ? counts[c] + (counts[c] === 1 ? ' shoot' : ' shoots') : 'no calendar yet'}</span></label>`).join('')}</div>
  <h2>Organisations &amp; series</h2>
  <div class="list-check">${bodies.map(o => `<label><input type="checkbox" data-o="${o.id}" ${S.orgs.includes(o.id) ? 'checked' : ''}> <span style="flex:1">${esc(o.name)}</span></label>`).join('')}
    <label><input type="checkbox" id="world" ${S.world ? 'checked' : ''}> <span style="flex:1"><b>🌐 World &amp; major events</b><br><span class="note">World Cup, Worlds, Indoor World Series, Vegas, Lancaster, TAC, ASA, Masters, Olympics</span></span></label></div>`}
  <h2>Reminders</h2>
  <label for="rd">Remind me this many days before a shoot</label><input id="rd" value="${esc(S.remindDays.join(', '))}">
  <label for="cd">…and before entries close (if not entered)</label><input id="cd" value="${esc(S.closeDays.join(', '))}">
  <p class="note">Phone notifications: <b>${esc(perm)}</b>. On iPhone, first tap Share → “Add to Home Screen”, then open from the icon (needs iOS 16.4+).</p>
  <button class="btn block" id="notif">🔔 ${S.notify && perm === 'granted' ? 'Notifications on – send a test' : 'Turn on notifications'}</button>
  ${S.notify ? `<button class="btn alt block" id="notifOff">🔕 Turn notifications off</button>` : ''}
  <h2>Backup</h2><p class="note">${AUTH.on && AUTH.user && AUTH.sync && AUTH.sync.linked() ? 'Your shoots and entries are saved on this device and synced to your <a href="#/account">account</a>.' : 'Your shoots and entries are stored only on this device.'}${AUTH.on && !AUTH.user ? ' <a href="#/account">Sign in</a> to keep them on all your devices.' : ''}</p>
  <div class="row"><button class="btn alt" id="exp">⇩ Export backup</button><label class="btn alt" style="margin:0">⇧ Import<input type="file" id="imp" accept="application/json" hidden></label></div>
  <p class="note">Data: ${EV.length} shoots from ${ORGS.length} organisations. Sources: ${AUS() ? 'World Archery calendar (Australian events),' : 'World Archery calendar,'} ABA 2026 National Calendar, Archery Australia, Archery WA, organiser sites. Checked 9 Oct 2026.</p></div>`;
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
    if (S.notify) { const reg = await navigator.serviceWorker?.getRegistration(); const o = {body:'Reminders are on. You’ll hear from us before your shoots.', icon:'icons/icon-192.png'};
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
  const n = photo('nathe');
  return `<section class="phead tall" style="--img:url('${esc(n.file)}')"><div class="wrap"><p class="kicker">For archery shops, ranges, coaches &amp; brands</p><h1>Advertise to archers</h1>
    <p>Put your shop in front of archers while they plan their next shoot and the gear they need for it.</p><a class="btn gold" href="${AD_MAIL}">Email us about advertising</a></div></section>
  <div class="wrap narrow adv">
    <section class="panel"><h2 class="sec">Who sees your ad</h2>
      <ul class="ticks"><li>Archers looking for Field, 3D, Target and Indoor shoots. Australia-wide: Archery Australia, ABA and Archery WA shoots in every state and territory.</li>
      <li>People about to travel, enter and buy. They're checking dates, entry closing times and what to bring.</li>
      <li>Ads can match the discipline: 3D gear on 3D shoots, indoor gear on indoor shoots.</li></ul>
      <p class="note">We'll share visitor numbers once the site is live. We won't quote figures before we have them.</p></section>
    <section class="panel"><h2 class="sec">Ad spaces</h2>
      <div class="table-wrap"><table class="slots"><thead><tr><th>Space</th><th>Where</th><th>Size</th></tr></thead><tbody>
      <tr><td><b>Home banner</b></td><td>Home page, under the stats</td><td>970×250 desktop<br>320×100 mobile</td></tr>
      <tr><td><b>Featured retailer</b></td><td>Find shoots list, every 10 shoots</td><td>Native card: logo, 2 lines, link</td></tr>
      <tr><td><b>Shoot page sponsor</b></td><td>Beside each shoot, by discipline ("Gear up for 3D")</td><td>300×250 or logo + text</td></tr>
      <tr><td><b>Discipline sponsor</b> <span class="note">(later)</span></td><td>Every Field, 3D, Target or Indoor page</td><td>All slots in one discipline</td></tr>
      </tbody></table></div></section>
    <section class="panel"><h2 class="sec">How it works</h2>
      <ul class="ticks"><li>Arranged directly with archery businesses. Email us to talk it through.</li>
      <li>Every ad is clearly labelled "Sponsored". Archery-related businesses only.</li>
      <li>No cookies or ad trackers (visits are counted anonymously). Ads link straight to your website.</li></ul></section>
    <section class="panel dark"><h2 class="sec">Get in touch</h2><p class="big-mail"><a href="${AD_MAIL}">${CONTACT}</a></p>
      <p class="note">NFS Strategic Holdings</p></section>
  </div>`;
}
function vPrivacy(){
  setTitle('Privacy & disclaimer');
  return `${pageHead('Privacy &amp; disclaimer', 'Short version: your data stays in your browser.', 'mixed')}<div class="wrap narrow"><section class="panel"><h2 class="sec">Privacy</h2>
    <ul class="ticks"><li>${AUTH.on ? 'No account needed. If you don’t sign in, the' : 'No account, no sign-up. The'} shoots you save, your entries and payments, and your reminder settings are stored only in <b>your browser on this device</b> (localStorage). They are never sent to us.</li>
    <li>Clearing your browser data deletes them. Use <a href="#/settings">Settings → Export backup</a> to keep a copy or move to another device.</li>
    <li id="privStats"><b>Visit counts:</b> we count visits anonymously with <a href="https://www.goatcounter.com/" target="_blank" rel="noopener">GoatCounter</a>: which pages are viewed and the words typed into Find shoots search. <b>No cookies</b>, no advertising trackers and nothing that identifies you. Searches that look like an email address or phone number are never counted. Reminders are made on your device.</li>
    <li>"Register / enter" and email links go straight to the organiser. Anything you send them is between you and the organiser.</li>
    <li><b>Submit a shoot form:</b> what a club sends us (contact name, email, phone, shoot details and flyer) is emailed to us at ${esc(SITE.contact)} via the form service FormSubmit (formsubmit.co). We use it only to check and list the shoot and, if you ask, to set up your entry form. Contact details aren't published unless they're on your flyer. Ask us any time to correct or delete them.</li>
    <li><b>Fans photos:</b> if you send us a photo, your name, email, the photo and its details are emailed to us via FormSubmit. We publish only approved photos with the caption and your name as credit – never your email. In a photo and want it removed? Email ${esc(SITE.contact)}.</li>
    <li>The site is hosted on GitHub Pages, which keeps standard server logs (e.g. IP address) – see GitHub's privacy statement.</li></ul>
    <p class="note">Questions: <a href="mailto:${SITE.contact}">${SITE.contact}</a> (NFS Strategic Holdings).</p></section>
    ${AUTH.on ? `<section class="panel" id="privAcct"><h2 class="sec">If you create an account (optional)</h2><ul class="ticks">
    <li><b>What we store:</b> your email address; a display name if you add one; the shoots you save; your entry status (entered / paid), amount paid, payment date, receipt or entry number and notes; which reminders have been sent; and your Settings (states, organisations, reminder days). Sign-in with Google also gives us your name from Google. We never see or store passwords.</li>
    <li><b>Where:</b> Supabase (supabase.com), our database and sign-in provider, in its <b>Sydney, Australia</b> region (AWS ap-southeast-2). Sign-in emails are sent through Supabase. Supabase keeps standard security logs (e.g. IP address, sign-in times).</li>
    <li><b>Who can see it:</b> only you. Every row is locked to your account by the database (row-level security). We don’t sell it, share it or use it for advertising.</li>
    <li><b>Deleting it:</b> <a href="#/account">Account → Delete account and data</a> removes your account and everything in it straight away. Signing out keeps a copy on your device unless you choose “remove from this device”. Or email us and we’ll delete it.</li></ul></section>` : ''}
    <section class="panel"><h2 class="sec">Disclaimer</h2><p><b>Dates come from organisers' public calendars; always check with the organiser.</b></p>
    <p class="note">Shoot details are collected from Archery Australia, Archery WA, the ABA, World Archery and club websites and flyers, and can change at any time. Archery Calendar is independent and is not run by or affiliated with any of these organisations. Flyers belong to their organisers – we link to them at the source.</p></section></div>`;
}
function vCredits(){
  setTitle('Credits');
  return `${pageHead('Photo &amp; font credits', 'Thanks to the photographers who share their work under open licences.', 'mixed')}<div class="wrap narrow"><section class="panel"><ul class="credits">${Object.entries(PH).filter(([k], i, all) => k !== 'aba_3d' && PH[k].file && all.findIndex(([, q]) => q.file === PH[k].file) === i).map(([k, p]) => `<li><img src="${esc(p.sm)}" alt="" loading="lazy"><div><b>${esc(p.title)}</b><br>${esc([p.by, p.source].filter(Boolean).join(' · '))}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">source</a>` : ''}${p.license ? `<br>${p.license_url ? `<a href="${esc(p.license_url)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license)}. Resized for this site.` : ''}</div></li>`).join('')}</ul>
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
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Archery Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:My archery shoots'];
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
  awa:{name:'Archery WA', full:'Archery WA (state events, QREs and club shoots)', src:'Archery WA events', url:'https://www.archerywa.com.au/', by:'State'}};
let CF = {org:'aba', where:'', disc:'', cat:'', club:'', mc:false, past:true};
const calWhere = x => x.org_group === 'aba' ? (x.branch ? `${x.branch} – ${x.branch_name || ''}` : (x.state_code || '')) : (x.state_code || '');
function vCals(arg){
  if (arg === 'aba-j') { CF.org = 'aba'; CF.where = 'J – WA'; CF.disc = ''; }
  else if (CALS[arg]) { if (CF.org !== arg) { CF.where = ''; CF.disc = ''; } CF.org = arg; }
  const c = CALS[CF.org]; setTitle(c.name + ' calendar');
  const all = EV.filter(x => x.org_group === CF.org && x.start_date && x.start_date >= '2026-01-01').sort((a, b) => a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.name < b.name ? -1 : 1);
  const years = [...new Set(all.map(x => x.start_date.slice(0, 4)))];
  const wheres = [...new Set(all.map(calWhere).filter(Boolean))].sort();
  const discs = [...new Set(all.map(x => (x.discipline || '').split(/[ (/]/)[0]).filter(Boolean))].sort();
  if (CF.where && !wheres.includes(CF.where)) CF.where = ''; if (CF.disc && !discs.includes(CF.disc)) CF.disc = '';
  let list = all.filter(x => (!CF.where || calWhere(x) === CF.where) && (!CF.disc || (x.discipline || '').startsWith(CF.disc)) && (CF.past || !isPast(x)));
  if (CF.club) list = list.filter(clubFilter(CF.club));
  const tc = typeCounts(list); if (CF.cat) list = list.filter(x => catOf(x) === CF.cat);
  if (CF.cat === 'club' && CF.mc) list = list.filter(x => followed().includes(x.club_id));
  const nPast = list.filter(isPast).length;
  let html = `${pageHead('Calendars', 'Each organisation’s full calendar, in one place. Tap a shoot for details, entry and reminders.', CF.org === 'aba' ? 'aba_field' : CF.cat === 'youth' && PH.youth ? 'youth' : 'mixed')}<div class="wrap cals">
  <div class="tabs" role="tablist" aria-label="Organisation">${Object.entries(CALS).map(([k, o]) => `<a role="tab" class="tab" href="#/calendars/${k}" aria-selected="${k === CF.org}">${k === 'aba' ? abaLogo(32, 'chip-logo') : ''}${esc(o.name)}</a>`).join('')}</div>
  <div class="panel cal-head"><h2 class="sec${CF.org === 'aba' ? ' with-logo' : ''}">${CF.org === 'aba' ? abaLogo(64, 'head-logo') : ''}<span>${esc(c.full)} – ${years.join(' & ') || '2026'}</span></h2>
  ${typeSel(CF.cat, tc)}${CF.cat === 'club' ? clubDrop(CF, x => x.org_group === CF.org && (CF.past || !isPast(x))) : ''}
  ${CF.org === 'aba' ? `<div class="chips" role="group" aria-label="Branch"><a class="chip" href="#/calendars/aba" id="brAll" aria-pressed="${!CF.where}">All branches</a><a class="chip" href="#/calendars/aba-j" id="brJ" aria-pressed="${CF.where === 'J – WA'}">Branch J (WA)</a></div>` : ''}
  ${CF.org === 'aba' && CF.where === 'J – WA' ? `<div class="branch-src" id="branchJ"><a class="bs-img" href="sources/aba-j-2026-branch-calendar.jpg" target="_blank" rel="noopener" aria-label="Open the Branch J calendar full size"><img src="sources/aba-j-2026-branch-calendar-sm.jpg" alt="ABA Branch J (WA) Shoot Calendar 2026" width="110" loading="lazy"></a>
    <div><b>ABA Branch J (WA) Shoot Calendar 2026</b><p class="note">The branch source for WA ABA shoots (supported by the WA Government and Lotterywest).<br><b>Interclub times:</b> Sat sign-in 10:00–11:00, muster 11:45, start 12:00 · Sun sign-in 8:00–9:00, muster 9:45, start 10:00.</p>
    <a href="sources/aba-j-2026-branch-calendar.jpg" target="_blank" rel="noopener">📄 View the Branch J calendar ↗</a></div></div>` : ''}
  <div class="cal-filters"><label>${c.by}<select id="cw"><option value="">All ${c.by === 'Branch' ? 'branches' : 'states'}</option>${wheres.map(w => `<option ${CF.where === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label>
  <label>Discipline<select id="cd"><option value="">All disciplines</option>${discs.map(d => `<option ${CF.disc === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
  <label class="chk"><input type="checkbox" id="cp" ${CF.past ? 'checked' : ''}> Show finished</label></div>
  <p class="note">${list.length} shoot${list.length !== 1 ? 's' : ''}${CF.past && nPast ? ` (${nPast} finished, shown greyed out)` : ''}. Official source: <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.src)} ↗</a></p></div>
  <div class="cal-list" role="table" aria-label="${esc(c.name)} calendar"><div class="cal-row cal-th" role="row"><span role="columnheader">Date</span><span role="columnheader">Shoot</span><span role="columnheader">Club / venue</span><span role="columnheader">${c.by}</span><span role="columnheader">Discipline</span></div>`;
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
  if (!list.length) html += `<div class="empty">No shoots match these filters.</div>`;
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
const clubFilter = k => k === 'mine' ? x => isMine(x.club_id) : k === 'watch' ? x => isWatch(x.club_id) : k === 'new' ? x => !!S.clubNew[x.id] : () => true;
/* ---------- date clashes: overlap (every day of multi-day shoots) with shoots I've saved / entered / paid ---------- */
const evEnd = x => x.end_date && x.end_date >= x.start_date ? x.end_date : x.start_date;
const datable = x => x && x.start_date && !x.book_anytime && !x.info_only;
const overlaps = (a, b) => a.start_date <= evEnd(b) && b.start_date <= evEnd(a);
const normName = n => (n || '').toLowerCase().replace(/20\d\d|[^a-z0-9]+/g, '');
// Same real-world shoot listed twice (e.g. AA + state calendar) is not a clash.
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
  const lead = isEnt(c[0]) ? 'Clashes with your entered shoot: ' : 'Clashes with ';
  return `<span class="b clash" title="${esc(c.map(y => y.name + ' (' + range(y) + ')').join('; '))}">⚠️ ${lead}${esc(shortName(c[0].name))}${c.length > 1 ? ` +${c.length - 1} more` : ''}</span>`;
}
function clashBox(x){
  const c = clashes(x); if (!c.length) return '';
  return `<section class="panel clash-box" id="clashBox"><h2 class="sec">⚠️ Date clash</h2><p class="note">This shoot overlaps ${c.length === 1 ? 'a shoot' : c.length + ' shoots'} in My shoots:</p><ul>${c.map(y => `<li><a href="#/shoot/${encodeURIComponent(y.id)}">${esc(y.name)}</a> · ${esc(range(y))}${isEnt(y) ? ` <span class="b ${ST(y.id) === 'paid' ? 'paid' : 'ent'}">${ST(y.id) === 'paid' ? '✓$ Entered + paid' : '✓ Entered'}</span>` : ' <span class="b todo">★ Saved</span>'}</li>`).join('')}</ul></section>`;
}
// Pairs of my own upcoming shoots that clash (for My shoots / Entries).
function myClashPairs(){
  const m = myDated().filter(x => !isPast(x)).sort((a, b) => a.start_date < b.start_date ? -1 : 1), out = [];
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) if (!sameShoot(m[i], m[j]) && overlaps(m[i], m[j])) out.push([m[i], m[j]]);
  return out;
}
function clashPairsHtml(){
  const p = myClashPairs(); if (!p.length) return '';
  const lnk = y => `<a href="#/shoot/${encodeURIComponent(y.id)}">${esc(shortName(y.name))}</a> <small>(${esc(range(y))}${isEnt(y) ? ', entered' : ''})</small>`;
  return `<section class="panel clash-box" id="myClashes"><h2 class="sec">⚠️ Date clashes in your shoots (${p.length})</h2><ul>${p.map(([a, b]) => `<li>${lnk(a)} <b>↔</b> ${lnk(b)}</li>`).join('')}</ul><p class="note">Overlapping dates – check you can get to both, or remove one.</p></section>`;
}
function clubBadge(x){
  const id = x.club_id; if (!id) return '';
  const nw = S.clubNew[x.id] ? `<span class="b new">✦ New${S.clubNew[x.id].why === 'flyer' ? ' flyer' : ''}</span>` : '';
  return isMine(id) ? `<span class="b myclub">🏠 My club</span>${nw}` : isWatch(id) ? `<span class="b watching">👁 Watching</span>${nw}` : '';
}
/* 'My clubs' dropdown on the Club shoots filter: the watchlist lives here (add / remove clubs; synced like other settings),
   and 'Only my clubs' filters Club shoots to those clubs. Separate club pages are de-emphasised. */
const MC = {open: false, q: ''};
function clubDrop(F, keep){
  const f = followed(), n = EV.filter(x => catOf(x) === 'club' && f.includes(x.club_id) && keep(x)).length;
  const res = MC.q.trim() ? clubSearch(MC.q) : [];
  return `<div class="mc" id="mc"><button type="button" class="mc-btn" id="mcBtn" aria-expanded="${MC.open}" aria-controls="mcPanel">🏠 My clubs${f.length ? ` (${f.length})` : ''}${F.mc ? ' · only these' : ''} <span aria-hidden="true">▾</span></button>
  <div class="mc-panel" id="mcPanel" ${MC.open ? '' : 'hidden'}>
    <fieldset class="mc-opts"><legend>Show club shoots from</legend>
      <label><input type="radio" name="mcf" value="all" ${F.mc ? '' : 'checked'}> All clubs</label>
      <label><input type="radio" name="mcf" value="mine" ${F.mc ? 'checked' : ''} ${f.length ? '' : 'disabled'}> Only my clubs <small>(${n} shoot${n === 1 ? '' : 's'})</small></label></fieldset>
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
  const up = EV.filter(x => x.club_id === id && !isPast(x)).length, q = encodeURIComponent([c.name, c.address || c.suburb, c.state].filter(Boolean).join(', '));
  const d = document.createElement('div'); d.className = 'club-pop-wrap'; d.id = 'clubPop';
  d.innerHTML = `<div class="club-pop" role="dialog" aria-modal="true" aria-labelledby="cpT"><button type="button" class="cp-x" id="cpX" aria-label="Close">✕</button>
    <h2 id="cpT">${esc(c.name)}</h2><p class="note">${esc(clubLine(c))}</p>
    ${c.address ? `<p>${esc(c.address)} · <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">📍 Map ↗</a></p>` : ''}
    ${c.website ? `<p><a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))} ↗</a></p>` : ''}
    <div class="club-acts"><button type="button" class="tbtn" data-join="${esc(id)}" aria-pressed="${isMine(id)}">${isMine(id) ? '✓ 🏠 My club' : '+ 🏠 My club'}</button><button type="button" class="tbtn" data-watch="${esc(id)}" aria-pressed="${isWatch(id)}">${isWatch(id) ? '✓ 👁 Watching' : '+ 👁 Watch'}</button></div>
    <button type="button" class="btn alt block" id="cpShoots">Show its shoots (${up} upcoming)</button></div>`;
  document.body.appendChild(d);
  const back = () => { closeClubPop(); from && from.focus && from.focus(); };
  d.onclick = e => { if (e.target === d) back(); };
  $('#cpX').onclick = back; $('#cpX').focus();
  d.querySelectorAll('[data-join],[data-watch]').forEach(b => b.onclick = () => { if (b.dataset.join) toggleClub('my', id); else toggleClub('watch', id); const y = scrollY; render(); scrollTo(0, y); clubPop(id, from); });
  $('#cpShoots').onclick = () => { closeClubPop(); Object.assign(BF, {clubId: id, club: '', q: '', cat: '', disc: '', ost: '', state: '', past: false, limit: 60}); if (location.hash === '#/browse') render(); else location.hash = '#/browse'; };
}
function closeClubPop(){ const d = $('#clubPop'); if (d) d.remove(); }
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-clubpop]'); if (b) { e.preventDefault(); e.stopPropagation(); clubPop(b.dataset.clubpop, b); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#clubPop')) closeClubPop(); else if (MC.open && $('#mc')) { MC.open = false; render(); const b = $('#mcBtn'); b && b.focus(); } } });
window.addEventListener('hashchange', () => { closeClubPop(); MC.open = false; });
function clubChips(cur, past, extra){
  const f = followed(); if (!f.length) return `<p class="note club-hint">🏠 <a href="#/settings/clubs">Pick your clubs</a> to see their shoots here.</p>`;
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
    for (const x of fresh.slice(0, 5)) { const why = S.clubNew[x.id].why === 'flyer' ? 'New flyer' : 'New shoot', o = {body: `${range(x)} · ${(CLUB[x.club_id] || {}).name || ''}`, tag: 'club-new-' + x.id, icon: 'icons/icon-192.png', data: {id: x.id}};
      navigator.serviceWorker?.ready.then(reg => reg.showNotification(`${why}: ${x.name}`, o)).catch(() => {}); }
  return fresh;
}
function clubNotice(){
  const ids = Object.keys(S.clubNew).filter(id => BYID[id]); if (!ids.length) return '';
  const nf = ids.filter(id => S.clubNew[id].why === 'flyer').length, ne = ids.length - nf;
  return `<div class="club-new" role="status"><span>✦ <b>New from your clubs:</b> ${[ne && `${ne} new shoot${ne === 1 ? '' : 's'}`, nf && `${nf} new flyer${nf === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
    <button type="button" class="linkbtn" id="cnView">Show</button><button type="button" class="linkbtn" id="cnClear" aria-label="Dismiss new from your clubs">✕ Dismiss</button></div>`;
}
function bindClubNotice(){
  const v = $('#cnView'), c = $('#cnClear');
  if (v) v.onclick = () => { Object.assign(BF, {club: 'new', q: '', cat: '', disc: '', state: '', limit: 60}); if (location.hash.startsWith('#/browse')) render(); else location.hash = '#/browse'; };
  if (c) c.onclick = () => { S.clubNew = {}; save(); render(); };
}
function homeClubs(){
  const f = followed();
  if (!f.length) return `<section class="panel your-clubs empty-clubs"><h2 class="sec-h">Your clubs</h2><p>Follow your club to see its next shoots here, and get a “New” badge when it adds a shoot or a flyer.</p><a class="btn alt" href="#/settings/clubs">🏠 Pick your clubs</a></section>`;
  const next = EV.filter(x => f.includes(x.club_id) && !isPast(x) && x.start_date).sort((a, b) => a.start_date < b.start_date ? -1 : 1).slice(0, 4);
  return `<section class="your-clubs"><h2 class="sec-h">Your clubs</h2>${clubNotice()}
    <p class="club-links">${f.map(id => `<button type="button" class="chip" data-clubpop="${esc(id)}" aria-haspopup="dialog">${isMine(id) ? '🏠 ' : '👁 '}${esc(CLUB[id].name)}${S.homeClub === id ? ' · home' : ''}</button>`).join('')}</p>
    ${next.length ? `<div class="list">${next.map(evCard).join('')}</div>` : '<p class="note">No upcoming shoots listed for your clubs yet.</p>'}
    <p><a href="#/browse" id="ycAll" class="linkbtn">All shoots from my clubs →</a></p></section>`;
}
// picker
const clubKey = c => snorm([c.name, ...(c.aliases || []), c.suburb, c.state, (STATES.find(s => s[0] === c.state) || [])[1]].filter(Boolean).join(' '));
function clubSearch(q){
  const w = snorm(q).split(' ').filter(Boolean); if (!w.length) return [];
  return CLUBS.filter(c => { const k = ' ' + clubKey(c) + ' '; return w.every(t => k.includes(' ' + t) ); })
    .sort((a, b) => (b.n_events > 0) - (a.n_events > 0) || a.name.localeCompare(b.name)).slice(0, 15);
}
const clubLine = c => [c.suburb, c.state, (c.orgs || []).map(o => ({aa: 'Archery Australia', awa: 'Archery WA', aba: 'ABA'}[o])).filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
function clubRow(c){
  const up = EV.filter(x => x.club_id === c.id && !isPast(x)).length;
  return `<li class="club-row" data-club="${esc(c.id)}"><button type="button" class="linkbtn club-name" data-clubpop="${esc(c.id)}" aria-haspopup="dialog"><b>${esc(c.name)}</b></button><span class="note">${esc(clubLine(c))}${up ? ` · ${up} upcoming shoot${up === 1 ? '' : 's'}` : ''}</span>
    <span class="club-acts"><button type="button" class="tbtn" data-join="${esc(c.id)}" aria-pressed="${isMine(c.id)}">${isMine(c.id) ? '✓ 🏠 My club' : '+ 🏠 My club'}</button><button type="button" class="tbtn" data-watch="${esc(c.id)}" aria-pressed="${isWatch(c.id)}">${isWatch(c.id) ? '✓ 👁 Watching' : '+ 👁 Watch'}</button>${isMine(c.id) ? `<button type="button" class="tbtn" data-home="${esc(c.id)}" aria-pressed="${S.homeClub === c.id}">${S.homeClub === c.id ? '★ Home club' : '☆ Make home club'}</button>` : ''}</span></li>`;
}
function clubPickerHtml(){
  const mine = S.myClubs.filter(id => CLUB[id]).map(id => CLUB[id]), watch = S.watchClubs.filter(id => CLUB[id] && !isMine(id)).map(id => CLUB[id]);
  return `<div class="club-picker" id="clubPicker">
    <h3>🏠 My clubs <span class="note">(clubs I belong to)</span></h3>${mine.length ? `<ul class="club-list" id="myClubList">${mine.map(clubRow).join('')}</ul>` : '<p class="note" id="myClubList">None yet – search below and tap “+ My club”.</p>'}
    <h3>👁 Clubs I watch</h3>${watch.length ? `<ul class="club-list" id="watchList">${watch.map(clubRow).join('')}</ul>` : '<p class="note" id="watchList">None yet – watch a club to see its shoots and new flyers.</p>'}
    <label for="clubQ">Find a club by name, suburb or state</label><input type="search" id="clubQ" placeholder="e.g. Gosnells, KGSA, Yokine, QLD…" autocomplete="off" value="${esc(clubPickerHtml.q || '')}">
    <ul class="club-list" id="clubRes" aria-live="polite">${clubPickerHtml.q ? clubSearch(clubPickerHtml.q).map(clubRow).join('') || '<li class="note">No club found. Try part of the name or the state.</li>' : ''}</ul>
    <p class="note">${CLUBS.length} clubs from the Archery WA, Archery SA, SQAS and Archery Victoria club lists and the shoots on our calendars. Missing yours? <a href="#/submit">Tell us</a>.</p></div>`;
}
function clubSettings(){
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<h2 id="clubs">Your clubs</h2><p class="note">Saved on this device${AUTH.on ? ' and in your account if you sign in' : ''}. Their shoots get a 🏠 My club or 👁 Watching badge, and a ✦ New badge when they add a shoot or a current flyer.</p>
  ${clubPickerHtml()}
  <label class="chk"><input type="checkbox" id="clubNotify" ${S.clubNotify ? 'checked' : ''}> 🔔 Also send a phone/browser notification for new shoots and flyers from my clubs${perm !== 'granted' || !S.notify ? ' <span class="note">(turns on notifications)</span>' : ''}</label>`;
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
    save(); toast(S.clubNotify ? '🔔 We’ll notify you about new shoots from your clubs' : 'Saved'); render();
  };
}
function vClubs(){
  setTitle('Clubs');
  return `${pageHead('Clubs', 'Find your club, follow it, and see all its shoots in one place.', 'mixed')}<div class="wrap narrow"><section class="panel">${clubPickerHtml()}</section>
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
        <dt>Calendars</dt><dd>${esc((c.orgs || []).map(o => ({aa: 'Archery Australia', awa: 'Archery WA', aba: 'ABA'}[o])).filter(Boolean).join(', ') || '—')}</dd></dl></section>
    <h2 class="sec-h">Upcoming shoots (${up.length})</h2>${up.length ? `<div class="list">${up.map(evCard).join('')}</div>` : '<p class="note">No upcoming shoots listed yet. Watch the club to get a “New” badge when one is added.</p>'}
    ${past.length ? `<details class="past-shoots"><summary><h2 class="sec-h">Past shoots (${past.length})</h2></summary><div class="list">${past.map(evCard).join('')}</div></details>` : ''}
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
function softRender(){ const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#view')) return; const y = scrollY; render(); scrollTo(0, y); }
// pages whose content depends on sign-in; other pages aren't re-drawn when sign-in finishes loading (no jumps mid-click)
function authRender(){ if (['account', 'privacy', 'settings'].includes(document.body.dataset.page)) softRender(); }
function updateNav(){
  const a = $('#navAcct'); if (!a) return; a.hidden = !(AUTH.on && AUTH.ready); if (a.hidden) return;
  const fs = $('#footStore'); if (fs) fs.textContent = 'Your saved shoots and entries are kept in your browser on this device, and in your account if you sign in';
  const n = AUTH.sync ? AUTH.sync.pending() : 0, linked = AUTH.sync && AUTH.sync.linked();
  a.textContent = AUTH.user ? `👤 ${linked && n ? '⏳ ' : ''}Account` : 'Sign in';
  a.classList.toggle('on', (location.hash || '').startsWith('#/account'));
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
  catch { AUTH.msg = 'Sign-in couldn’t load. Are you offline? Your shoots are still saved on this device.'; AUTH.ready = true; authRender(); return; }
  const qp = new URLSearchParams(location.search);
  if (qp.get('error_description') || qp.get('error')) AUTH.msg = 'Sign-in didn’t work: ' + (qp.get('error_description') || qp.get('error')) + '. Links expire after an hour and only work once – ask for a new one.';
  AUTH.client = window.supabase.createClient(SB_URL, SB_KEY, {auth: {flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'archcal.auth'}});
  AUTH.sync = ArchSync.create({client: AUTH.client, storage: localStorage, getS: () => S, saveS: () => { save(); softRender(); },
    isOnline: () => navigator.onLine, onChange: () => { updateNav(); if (document.body.dataset.page === 'account') authRender(); }});
  const cameBack = qp.has('code') || qp.has('error');
  AUTH.client.auth.onAuthStateChange((ev, sess) => { const u = sess ? sess.user : null; AUTH.chain = AUTH.chain.then(() => onUser(u, ev)).catch(e => { AUTH.msg = String(e.message || e); }); });
  await AUTH.client.auth.getSession().catch(() => {});
  await AUTH.chain;
  if (cameBack) { history.replaceState(null, '', location.pathname + (AUTH.user ? '#/account' : (location.hash || '#/account'))); }
  AUTH.ready = true; updateNav(); authRender();
  addEventListener('online', () => AUTH.sync.flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) AUTH.sync.flush(); });
  setInterval(() => AUTH.sync.flush(), 5 * 60 * 1000);
}
async function onUser(u){
  const prev = AUTH.user && AUTH.user.id; AUTH.user = u;
  if (!u) { AUTH.sync.setUser(null); updateNav(); authRender(); return; }
  AUTH.sent = '';
  if (prev === u.id && AUTH.sync.linked()) return;
  AUTH.sync.setUser(u);
  if (!AUTH.sync.linked()) {
    if (AUTH.sync.needsMergeChoice(u)) { AUTH.ask = true; if (!location.hash.startsWith('#/account')) location.hash = '#/account'; }
    else await AUTH.sync.link(u, 'account');
  }
  updateNav(); authRender();
}
const counts = () => ({saved: Object.keys(S.saved).length, ent: Object.keys(S.entries).length});
function vAccount(){
  setTitle(AUTH.user ? 'Account' : 'Sign in');
  const head = pageHead(AUTH.user ? 'Your account' : 'Sign in', 'Optional. Keep your shoots, entries and settings on all your devices.', 'mixed');   // short banner: the form stays above the fold on small phones
  const msg = AUTH.msg ? `<div class="warn" role="alert">⚠ ${esc(AUTH.msg)}</div>` : '';
  if (!AUTH.on) return `${head}<div class="wrap narrow"><section class="panel"><p>Accounts aren’t switched on yet. Everything you save is kept in this browser on this device – no sign-up needed.</p><p><a class="btn" href="#/browse">Find shoots</a></p></section></div>`;
  if (!AUTH.ready) return `${head}<div class="wrap narrow"><p class="loading">Loading…</p></div>`;
  if (!AUTH.client) return `${head}<div class="wrap narrow">${msg}</div>`;
  if (!AUTH.user) return `${head}<div class="wrap narrow">${msg}
    <section class="panel"><h2 class="sec">Sign in or create an account</h2>
    ${AUTH.sent ? `<div class="okbox" role="status">✉ <b>Check your email.</b> We sent a sign-in link to <b>${esc(AUTH.sent)}</b>. Open it <b>in this browser on this device</b>. It works once and expires in an hour. No email? Check junk, or <button type="button" class="linkbtn" id="again">send it again</button>.</div>`
      : `<form id="signin" novalidate><label for="em">Email</label><input id="em" type="email" autocomplete="email" required placeholder="you@example.com">
      <button class="btn gold block" type="submit">✉ Email me a sign-in link</button></form>
      <p class="note">No password. New here? The same link creates your account.</p>`}
    ${window.SUPABASE_GOOGLE ? `<div class="or"><span>or</span></div><button class="btn alt block" id="google" type="button"><b>G</b>&nbsp; Continue with Google</button>` : ''}
    </section>
    <section class="panel"><h2 class="sec">What an account does</h2><ul class="ticks">
      <li>Your saved shoots, “I’ve entered / I’ve paid”, amounts, receipt numbers, notes, reminders and Settings are kept in your account and synced across your devices.</li>
      <li>Not signed in? Everything still works and stays on this device, as now.</li>
      <li>Stored in Australia (Sydney). Delete your account and data any time. <a href="#/privacy">Privacy</a></li></ul></section></div>`;
  const u = AUTH.user, st = AUTH.sync.state(), c = counts();
  if (!AUTH.sync.linked()) return `${head}<div class="wrap narrow">${msg}<section class="panel"><h2 class="sec">Add this device’s shoots to your account?</h2>
    <p>Signed in as <b>${esc(u.email)}</b>. This device has <b>${c.saved}</b> saved shoot${c.saved === 1 ? '' : 's'} and <b>${c.ent}</b> entr${c.ent === 1 ? 'y' : 'ies'} recorded.</p>
    <button class="btn gold block" id="mergeYes">✓ Yes, add them to my account</button>
    <button class="btn alt block" id="mergeNo">✕ No, use my account’s data only</button>
    <p class="note">“Yes” combines both; where the same shoot differs, the most recent change wins. “No” replaces what’s on this device with your account’s shoots – <button type="button" class="linkbtn" id="bk">download a backup first</button>.</p>
    <button class="linkbtn" id="so0">Sign out instead</button></section></div>`;
  const n = AUTH.sync.pending(), when = st.lastSync ? new Date(st.lastSync).toLocaleString('en-AU', {weekday: 'short', hour: 'numeric', minute: '2-digit'}) : '';
  const syncTxt = !navigator.onLine ? `⏳ Offline – ${n} change${n === 1 ? '' : 's'} saved on this device, will sync when you’re back online`
    : st.error && n ? `⚠ ${n} change${n === 1 ? '' : 's'} not synced yet (${esc(st.error)}). We’ll keep trying.` : n ? `⏳ Syncing ${n} change${n === 1 ? '' : 's'}…` : `✓ Synced${when ? ' · ' + esc(when) : ''}`;
  const stTxt = S.states.length ? S.states.join(', ') : 'All of Australia', grTxt = GROUPS.filter(g => S.groups.includes(g[0])).map(g => g[0] === 'aba' ? 'ABA' : g[1]).join(', ');
  return `${head}<div class="wrap narrow">${msg}
   <section class="panel"><h2 class="sec">Your details</h2><dl class="kv"><dt>Email</dt><dd>${esc(u.email || '—')}</dd></dl>
    <form id="dn"><label for="dname">Display name</label><input id="dname" maxlength="80" autocomplete="nickname" value="${esc(st.displayName || '')}">
    <button class="btn alt" type="submit">Save name</button></form></section>
   <section class="panel"><h2 class="sec">My states &amp; organisations</h2><dl class="kv"><dt>States</dt><dd>${esc(stTxt)}</dd><dt>Organisations</dt><dd>${esc(grTxt || '—')}</dd>
    <dt>Reminders</dt><dd>${esc(S.remindDays.join(', '))} days before · entries close ${esc(S.closeDays.join(' / '))}</dd></dl>
    <dl class="kv"><dt>My clubs</dt><dd>${esc(S.myClubs.map(i => (CLUB[i] || {}).name).filter(Boolean).map(n => n + (CLUB[S.homeClub] && CLUB[S.homeClub].name === n ? ' (home)' : '')).join(', ') || '—')}</dd><dt>Watching</dt><dd>${esc(S.watchClubs.map(i => (CLUB[i] || {}).name).filter(Boolean).join(', ') || '—')}</dd></dl>
    <a class="btn alt" href="#/settings">Change in Settings</a><p class="note">Settings and clubs sync to your other devices.</p></section>
   <section class="panel"><h2 class="sec">Sync</h2><p class="sync-st" id="syncSt">${syncTxt}</p>
    <p class="note">${c.saved} saved shoot${c.saved === 1 ? '' : 's'} · ${c.ent} entr${c.ent === 1 ? 'y' : 'ies'}. Changes save on this device straight away and sync in the background, also after being offline.</p>
    <button class="btn alt" id="syncNow">↻ Sync now</button></section>
   <section class="panel"><h2 class="sec">Sign out</h2>
    <button class="btn alt block" id="so">Sign out (keep my shoots on this device)</button>
    <button class="btn alt block" id="soClear">Sign out and remove my shoots from this device</button>
    <p class="note">Use the second one on a shared or borrowed device.</p></section>
   <section class="panel danger"><h2 class="sec">Delete account and data</h2>
    <p>Permanently deletes your account and everything stored in it (saved shoots, entries, payments, notes, reminders, settings). This can’t be undone.</p>
    <form id="del"><label for="delc">Type <b>DELETE</b> to confirm</label><input id="delc" autocomplete="off" autocapitalize="characters">
    <label class="chk"><input type="checkbox" id="delLocal" checked> Also remove my shoots from this device</label>
    <button class="btn danger block" type="submit">🗑 Delete my account and data</button></form></section></div>`;
}
function bindAccount(){
  const busy = (b, t) => { if (b) { b.disabled = true; b.dataset.t = b.textContent; b.textContent = t; } };
  const f = $('#signin');
  if (f) f.onsubmit = async e => { e.preventDefault(); const em = $('#em').value.trim(), b = f.querySelector('button');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { AUTH.msg = 'Please enter a valid email address.'; return softRenderForce(); }
    busy(b, 'Sending…'); AUTH.msg = '';
    const {error} = await AUTH.client.auth.signInWithOtp({email: em, options: {emailRedirectTo: redirectUrl(), shouldCreateUser: true}});
    if (error) AUTH.msg = /rate|seconds/i.test(error.message) ? 'Too many sign-in emails – please wait a minute and try again.' : error.message; else AUTH.sent = em;
    softRenderForce(); if (AUTH.sent) { toast('✉ Sign-in link sent – check your email'); const ok = $('.okbox'); if (ok) ok.scrollIntoView({block: 'center'}); } };
  const ag = $('#again'); if (ag) ag.onclick = () => { AUTH.sent = ''; softRenderForce(); };
  const g = $('#google'); if (g) g.onclick = async () => { const {error} = await AUTH.client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: redirectUrl()}}); if (error) { AUTH.msg = error.message; softRenderForce(); } };
  const my = $('#mergeYes'), mn = $('#mergeNo');
  if (my) my.onclick = async () => { busy(my, 'Adding…'); await AUTH.sync.link(AUTH.user, 'merge'); AUTH.ask = false; toast('✓ Added to your account'); softRenderForce(); };
  if (mn) mn.onclick = async () => { busy(mn, 'Loading your account…'); await AUTH.sync.link(AUTH.user, 'account'); AUTH.ask = false; toast('Using your account’s shoots'); softRenderForce(); };
  const bk = $('#bk'); if (bk) bk.onclick = () => dl(new Blob([JSON.stringify(S, null, 1)], {type: 'application/json'}), 'archery-calendar-backup.json');
  const out = async clear => { await AUTH.client.auth.signOut({scope: 'local'}).catch(() => {}); AUTH.sync.unlink(clear); AUTH.user = null; AUTH.msg = ''; toast(clear ? 'Signed out · removed from this device' : 'Signed out'); location.hash = '#/account'; softRenderForce(); };
  for (const [id, c] of [['so', false], ['so0', false], ['soClear', true]]) { const b = $('#' + id); if (b) b.onclick = () => out(c); }
  const dn = $('#dn'); if (dn) dn.onsubmit = async e => { e.preventDefault(); await AUTH.sync.setDisplayName($('#dname').value); toast('Name saved'); softRenderForce(); };
  const sn = $('#syncNow'); if (sn) sn.onclick = async () => { busy(sn, 'Syncing…'); const r = await AUTH.sync.flush(); toast(r && r.ok ? '✓ Synced' : r && r.skipped === 'offline' ? 'You’re offline – will sync later' : '⚠ Couldn’t sync yet'); softRenderForce(); };
  const del = $('#del'); if (del) del.onsubmit = async e => { e.preventDefault();
    if ($('#delc').value.trim().toUpperCase() !== 'DELETE') { toast('Type DELETE to confirm'); return; }
    const b = del.querySelector('button'), clearLocal = $('#delLocal').checked; busy(b, 'Deleting…');
    const {error} = await AUTH.client.rpc('delete_my_account');
    if (error) { AUTH.msg = 'Couldn’t delete: ' + error.message + '. Nothing was deleted – try again, or email ' + SITE.contact + '.'; return softRenderForce(); }
    await AUTH.client.auth.signOut({scope: 'local'}).catch(() => {}); AUTH.sync.unlink(clearLocal); AUTH.user = null;
    AUTH.msg = ''; toast('Your account and its data were deleted'); softRenderForce(); };
}
function softRenderForce(){ const y = scrollY; render(); scrollTo(0, y); }
/* ---------- Fans: community photo wall ----------
   Photos come from data/fans.json (added by hand after review). "Send us your photo" posts to FormSubmit like the shoot form;
   big or non-JPEG photos are shrunk in the browser first (max 2400 px JPEG) so they fit the email. */
let FANS = null;
const FAN_MAX_MB = 8;
function loadFans(){ return FANS ? Promise.resolve(FANS) : fetch('data/fans.json').then(r => r.json()).then(j => (FANS = j.photos || [])).catch(() => (FANS = [])); }
function vFans(){
  setTitle('Fans');
  const head = pageHead('Fans', 'Photos from the archery community: podiums, club days and shoots. Send us yours.', 'field');
  if (!FANS) { loadFans().then(() => { if (document.body.dataset.page === 'fans') softRenderForce(); }); return `${head}<div class="wrap"><p class="loading">Loading photos…</p></div>`; }
  const sent = /(?:^|[?&])fsent=1/.test(location.search);
  if (sent) history.replaceState(null, '', location.pathname + '#/fans');
  const fdate = d => !d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(d) ? pd(d).toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}) : d;
  const wall = FANS.map((f, i) => `<figure class="fan"><button type="button" class="fan-img" data-zoom="${i}" aria-label="Enlarge: ${esc(f.caption)}"><img src="${esc(f.sm)}" alt="${esc(f.alt || f.caption)}" loading="lazy" width="${f.w ? 480 : ''}" height="${f.w ? Math.round(480 * f.h / f.w) : ''}"><span class="zoom" aria-hidden="true">⤢ Enlarge</span></button>
    <figcaption><b>${esc(f.caption)}</b>${[f.credit && '📷 ' + f.credit, f.event, fdate(f.date)].filter(Boolean).length ? `<span class="fan-meta">${esc([f.credit && '📷 ' + f.credit, f.event, fdate(f.date)].filter(Boolean).join(' · '))}</span>` : ''}</figcaption></figure>`).join('');
  const fld = (id, lab, inp, hint = '', req = true) => `<div class="fld" data-f="${id}"><label for="${id}">${lab}${req ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>${inp}${hint ? `<p class="hint">${hint}</p>` : ''}<p class="err" id="${id}_e" role="alert"></p></div>`;
  return `${head}<div class="wrap fans">
  ${sent ? `<section class="panel thanks" id="fanThanks" tabindex="-1"><span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Thanks, we’ve got your photo</h2><p>We check every photo before it goes up, usually within a few days. We’ll email you if we have a question.</p></section>` : ''}
  <div class="fan-wall">${wall || '<p class="note">No photos yet – be the first!</p>'}</div>
  <p class="note fan-rm">In a photo and want it removed? Email <a href="mailto:${esc(SITE.contact)}?subject=${encodeURIComponent('Photo removal – Archery Calendar Fans page')}">${esc(SITE.contact)}</a> and we’ll take it down.</p>
  <section class="panel sub fan-send" id="send"><h2 class="sec">📷 Send us your photo</h2>
   <ul class="ticks"><li>Podiums, club days, a great shot on the course – archery photos from Australia.</li><li>Every photo is <b>reviewed before it’s posted</b>. We may crop or resize it.</li><li>Fields marked <span class="req">*</span> are required.</li></ul>
   <form id="fanForm" class="sub-form" method="POST" enctype="multipart/form-data" action="${esc(SITE.formEndpoint || '')}" novalidate>
    <input type="hidden" name="_subject" value="Fan photo – Archery Calendar"><input type="hidden" name="_template" value="table"><input type="hidden" name="_next" value="">
    <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="grid2">${fld('f_name', 'Your name', `<input id="f_name" name="name" required maxlength="80" autocomplete="name">`, 'Shown as the photo credit.')}
    ${fld('f_email', 'Your email', `<input id="f_email" name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email">`, 'Not published.')}</div>
    ${fld('f_file', 'Photo', `<input id="f_file" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic" required>`, `JPG, PNG or phone photo, up to ${FAN_MAX_MB} MB.`)}
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
function bindFans(){
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { const f = FANS[+b.dataset.zoom], d = $('#lb');
    $('#lbImg').src = f.file; $('#lbImg').alt = f.alt || f.caption; $('#lbCap').textContent = f.caption + (f.credit ? ' · 📷 ' + f.credit : ''); d.showModal ? d.showModal() : d.setAttribute('open', ''); });
  const lb = $('#lb'); if (lb) lb.onclick = e => { if (e.target === lb) lb.close(); };
  const t = $('#fanThanks'); if (t) t.focus();
  const fm = $('#fanForm'); if (!fm) return;
  const g = id => $('#' + id), val = id => (g(id).value || '').trim();
  const setErr = (id, m) => { g(id + '_e').textContent = m || ''; const w = fm.querySelector(`[data-f="${id}"]`); w && w.classList.toggle('bad', !!m); const i = g(id); i && i.setAttribute('aria-invalid', m ? 'true' : 'false'); };
  function check(){
    const errs = [], add = (id, m) => { setErr(id, m); if (m) errs.push(id); };
    add('f_name', val('f_name') ? '' : 'Enter your name.');
    const em = val('f_email'); add('f_email', !em ? 'Enter your email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) ? '' : 'That email doesn’t look right.');
    const f = g('f_file').files[0];
    add('f_file', !f ? 'Choose a photo.' : !/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name) ? 'That isn’t a photo file.' : f.size > FAN_MAX_MB * 1048576 ? `That photo is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${FAN_MAX_MB} MB.` : '');
    add('f_cap', val('f_cap') ? '' : 'Add a caption.');
    add('f_date', val('f_date') && val('f_date') > iso(today()) ? 'The date is in the future.' : '');
    add('f_ok', g('f_ok').checked ? '' : 'Please tick to confirm.');
    return errs;
  }
  fm.addEventListener('change', () => { if (fm.dataset.tried) check(); });
  fm.onsubmit = async e => {
    e.preventDefault(); fm.dataset.tried = 1;
    const errs = check();
    if (errs.length) { $('#fanErr').textContent = `Please fix ${errs.length === 1 ? 'the highlighted field' : `the ${errs.length} highlighted fields`}.`; const i = g(errs[0]); i && i.focus(); return; }
    $('#fanErr').textContent = '';
    if (!SITE.formEndpoint || !navigator.onLine) { location.href = `mailto:${SITE.contact}?subject=${encodeURIComponent('Fan photo: ' + val('f_cap'))}&body=${encodeURIComponent(`Name: ${val('f_name')}\nCaption: ${val('f_cap')}\nEvent/club: ${val('f_event')}\nDate: ${val('f_date')}\nConsent: Yes\n\n>>> Please attach your photo to this email. <<<\n`)}`; return; }
    const b = g('fanBtn'); b.disabled = true; b.textContent = 'Preparing photo…';
    const f = g('f_file').files[0];
    if (f.size > 4 * 1048576 || !/^image\/(jpeg|png)$/.test(f.type)) {
      const s = await shrinkPhoto(f);
      if (s !== f && typeof DataTransfer === 'function') { try { const dt = new DataTransfer(); dt.items.add(s); g('f_file').files = dt.files; } catch {} }
    }
    fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?fsent=1#/fans';
    fm.querySelector('[name=_subject]').value = `Fan photo: ${val('f_cap').slice(0, 80)} – ${val('f_name')}`;
    b.textContent = 'Sending…'; HTMLFormElement.prototype.submit.call(fm);
  };
}
/* Moving from the old address (nfstride1-ux.github.io/archery-calendar): its migration page sends this device's saved data here as
   #/import/<base64url JSON>. We merge it (shoots and entries added; where both have an entry the newer change wins) and never delete. */
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
    migrateSettings(); save(); setTimeout(() => toast(`✓ Moved to archerycalendars.com${n ? ` · ${n} saved shoot${n === 1 ? '' : 's'}/entries brought across` : ''}`), 600);
  } catch { setTimeout(() => toast('Couldn’t bring your saved shoots across – use Settings → Export/Import backup'), 600); }
  return true;
}
/* ---------- anonymous visit stats: GoatCounter (no cookies, no personal data; fails silently) ---------- */
const GCQ = [];
function gc(o){ try { const g = window.goatcounter; if (g && typeof g.count === 'function') g.count(o); else if (GCQ.length < 30) GCQ.push(o); } catch {} }
window.gcFlush = () => { const g = window.goatcounter; if (g && typeof g.count === 'function') GCQ.splice(0).forEach(gc); };
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
function route(){ render(); window.scrollTo(0, 0); gcPage(); }
function render(){
  const h = location.hash || '#/home', [, p, arg] = h.split('/'), v = $('#view');
  document.querySelectorAll('.nav a').forEach(a => { const on = a.dataset.tab === (p || 'home') || (p === 'shoot' && a.dataset.tab === 'browse'); a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  document.body.dataset.page = p || 'home';
  if (p === 'browse') { v.innerHTML = vBrowse(); bindBrowse(); }
  else if (p === 'shoot') { const id = decodeURIComponent(arg || ''); if (S.clubNew[id]) { delete S.clubNew[id]; save(); } v.innerHTML = vShoot(id); bindShoot(id); }
  else if (p === 'calendar') { v.innerHTML = vCalendar(); bindCalendar(); }
  else if (p === 'entries') v.innerHTML = vEntries();
  else if (p === 'settings') { v.innerHTML = vSettings(); bindSettings(); if (arg === 'clubs') setTimeout(() => { const c = $('#clubs'); c && c.scrollIntoView(); }, 30); }
  else if (p === 'advertise') v.innerHTML = vAdvertise();
  else if (p === 'credits') v.innerHTML = vCredits();
  else if (p === 'privacy') v.innerHTML = vPrivacy();
  else if (p === 'fans') { v.innerHTML = vFans(); bindFans(); }
  else if (p === 'account') { v.innerHTML = vAccount(); bindAccount(); }
  else if (p === 'submit') { v.innerHTML = vSubmit(); bindSubmit(); }
  else if (p === 'calendars') { v.innerHTML = vCals(arg); bindCals(); }
  else if (p === 'club') { const id = decodeURIComponent(arg || ''); v.innerHTML = vClub(id); bindClub(id); }
  else if (p === 'clubs') { v.innerHTML = vClubs(); bindClubPicker(); }
  else { v.innerHTML = vHome();
    v.querySelectorAll('[data-cat]').forEach(a => a.onclick = () => { BF.cat = a.dataset.cat; BF.disc = ''; BF.scope = 'all'; });
    v.querySelectorAll('[data-th]').forEach(a => a.onclick = () => { BF.cat = ''; BF.disc = {field:'Field','3d':'3D',target:'Target',indoor:'Indoor'}[a.dataset.th]; BF.scope = 'all'; });
    bindClubNotice(); const ya = $('#ycAll'); if (ya) ya.onclick = () => { Object.assign(BF, {club: S.myClubs.length ? 'mine' : 'watch', q: '', cat: '', disc: '', state: '', limit: 60}); };
    $('#heroSearch').onsubmit = e => { e.preventDefault(); BF.q = $('#hq').value; BF.scope = 'all'; location.hash = '#/browse'; }; }
  bindCards(v); updateNav();
}
/* ---------- submit a shoot (clubs) ----------
   Static site, no backend: the form POSTs (multipart, with the flyer file) to SITE.formEndpoint (FormSubmit), which emails
   SITE.contact. If no endpoint is configured, or the browser is offline, "Email it instead" builds a pre-filled email. */
const ORG_TYPES = ['Archery Australia club', 'Archery WA', 'Other state association', 'ABA club or branch', 'Other'];
const SUB_DISC = [['Target','Target'],['Field','Field'],['3D','3D'],['Indoor','Indoor'],['Clout','Clout'],['Come and try','Come-and-try'],['Clinic','Clinic'],['League','League']];
const ENTRY_METHODS = ['Assemble', 'Archers Diary', 'Email', 'Phone', 'None yet'];
const MAX_MB = 5;
function vSubmit(){
  setTitle('Submit a shoot');
  const sent = /(?:^|[?&])sent=1/.test(location.search);
  if (sent) history.replaceState(null, '', location.pathname + '#/submit');
  const head = pageHead('Submit a shoot', "Clubs and organisers: tell us about your shoot and we'll put it on the calendar.", '3d');
  if (sent) return `${head}<div class="wrap narrow"><section class="panel thanks" id="subThanks" tabindex="-1">
    <span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Thanks, your shoot is in</h2>
    <p>We'll check the details against your flyer and usually have it live <b>within 48 hours</b>. If anything's unclear we'll reply to the email you gave us.</p>
    <p class="note">Asked for an entry form? We'll email you a link to check before it goes live.</p>
    <div class="row"><a class="btn gold" href="#/submit">Submit another shoot</a><a class="btn alt" href="#/browse">Find shoots</a></div></section></div>`;
  const opt = (a, ph) => `<option value="">${ph}</option>` + a.map(x => `<option>${esc(x)}</option>`).join('');
  const f = (id, lab, inp, hint = '', req = true) => `<div class="fld" data-f="${id}"><label for="${id}">${lab}${req ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>${inp}${hint ? `<p class="hint" id="${id}_h">${hint}</p>` : ''}<p class="err" id="${id}_e" role="alert"></p></div>`;
  return `${head}<div class="wrap narrow sub">
  <section class="panel sub-intro"><ul class="ticks">
    <li>Every shoot is <b>reviewed before it goes live, usually within 48 hours</b>.</li>
    <li>No online entries? We'll list your shoot, set up an entry form and send you the entry list. Tick "yes" below.</li>
    <li>Fields marked <span class="req">*</span> are required.</li></ul></section>
  <form id="subForm" class="panel sub-form" method="POST" enctype="multipart/form-data" action="${esc(SITE.formEndpoint || '')}" novalidate>
    <input type="hidden" name="_subject" value="New shoot submission – Archery Calendar">
    <input type="hidden" name="_template" value="table">
    <input type="hidden" name="_next" value="">
    <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <input type="hidden" name="discipline" id="s_disc_val">
    <fieldset><legend>Your club</legend>
      ${f('s_orgtype', 'Organisation type', `<select id="s_orgtype" name="organisation_type" required>${opt(ORG_TYPES, 'Choose…')}</select>`)}
      ${f('s_club', 'Club or organisation name', `<input id="s_club" name="club_name" required maxlength="120" autocomplete="organization">`)}
      <div class="grid2">${f('s_name', 'Contact name', `<input id="s_name" name="contact_name" required maxlength="80" autocomplete="name">`)}
      ${f('s_email', 'Contact email', `<input id="s_email" name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email">`)}</div>
      ${f('s_phone', 'Phone', `<input id="s_phone" name="phone" type="tel" maxlength="20" autocomplete="tel" inputmode="tel">`, '', false)}
    </fieldset>
    <fieldset><legend>The shoot</legend>
      ${f('s_shoot', 'Shoot name', `<input id="s_shoot" name="shoot_name" required maxlength="140" placeholder="e.g. Autumn 3D Classic">`)}
      <div class="fld" data-f="s_disc"><span class="lab" id="s_disc_l">Discipline <span class="req" aria-hidden="true">*</span> <span class="opt">(tick all that apply)</span></span>
        <div class="chips-check" role="group" aria-labelledby="s_disc_l" id="s_disc">${SUB_DISC.map(([v, l]) => `<label class="chk"><input type="checkbox" value="${esc(v)}"><span>${esc(l)}</span></label>`).join('')}</div><p class="err" id="s_disc_e" role="alert"></p></div>
      <div class="grid2">${f('s_start', 'Start date', `<input id="s_start" name="start_date" type="date" required>`)}
      ${f('s_end', 'End date', `<input id="s_end" name="end_date" type="date">`, 'Leave blank for a one-day shoot.', false)}</div>
      ${f('s_venue', 'Venue', `<input id="s_venue" name="venue" required maxlength="140" placeholder="e.g. club range name or address">`)}
      <div class="grid2">${f('s_suburb', 'Suburb or town', `<input id="s_suburb" name="suburb" required maxlength="80">`)}
      ${f('s_state', 'State', `<select id="s_state" name="state" required><option value="">Choose…</option>${STATES.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select>`)}</div>
    </fieldset>
    <fieldset><legend>Entries</legend>
      <div class="grid2">${f('s_close', 'Entries close', `<input id="s_close" name="entry_close_date" type="date">`, '', false)}
      ${f('s_method', 'How do archers enter now?', `<select id="s_method" name="entry_method" required>${opt(ENTRY_METHODS, 'Choose…')}</select>`)}</div>
      ${f('s_link', 'Entry link', `<input id="s_link" name="entry_link" type="text" maxlength="300" placeholder="https://" inputmode="url">`, 'Your Assemble or Archers Diary page, or the email or phone number archers should use.', false)}
      <div class="fld" data-f="s_want"><span class="lab" id="s_want_l">Want us to set up an entry form? <span class="req" aria-hidden="true">*</span></span>
        <div class="seg" role="radiogroup" aria-labelledby="s_want_l" id="s_want"><label class="chk"><input type="radio" name="want_entry_form" value="Yes" required><span>Yes please</span></label><label class="chk"><input type="radio" name="want_entry_form" value="No"><span>No thanks</span></label></div><p class="err" id="s_want_e" role="alert"></p></div>
    </fieldset>
    <fieldset><legend>Flyer</legend>
      ${f('s_file', 'Upload the flyer', `<input id="s_file" name="attachment" type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg">`, `PDF or JPG, up to ${MAX_MB} MB.`, false)}
      ${f('s_flink', '…or link to the flyer', `<input id="s_flink" name="flyer_link" type="url" maxlength="300" placeholder="https://" inputmode="url">`, 'e.g. your website or Facebook post.', false)}
      ${f('s_notes', 'Notes', `<textarea id="s_notes" name="notes" rows="4" maxlength="2000" placeholder="Rounds, fees, start times, camping, anything else"></textarea>`, '', false)}
    </fieldset>
    <div class="fld consent" data-f="s_ok"><label class="chk tick"><input type="checkbox" id="s_ok" name="consent" value="Yes – permission to publish the shoot details and flyer" required><span>I'm authorised by the club and give Archery Calendar permission to publish these shoot details and the flyer. <span class="req" aria-hidden="true">*</span></span></label><p class="err" id="s_ok_e" role="alert"></p></div>
    <p class="note priv">🔒 Privacy: your details are emailed to us (${esc(SITE.contact)}, NFS Strategic Holdings) via FormSubmit. We use them only to check and list your shoot and to set up an entry form if you ask. We don't publish your contact details unless they're on your flyer, and we never sell them. <a href="#/privacy">Privacy</a></p>
    <p class="err sum" id="subErr" role="alert"></p>
    <div class="sub-actions"><button class="btn gold" type="submit" id="subBtn">Submit shoot for review</button>
      <a class="btn alt" id="subMail" href="mailto:${esc(SITE.contact)}">Email it instead</a></div>
    <p class="note">"Email it instead" opens your email app with the details filled in. Attach the flyer before you send.</p>
  </form></div>`;
}
function bindSubmit(){
  const fm = $('#subForm');
  if (!fm) { const t = $('#subThanks'); t && t.focus(); return; }
  const g = id => $('#' + id), val = id => (g(id).value || '').trim();
  const discs = () => [...fm.querySelectorAll('#s_disc input:checked')].map(i => i.value);
  const setErr = (id, msg) => { const e = g(id + '_e'), w = fm.querySelector(`[data-f="${id}"]`), inp = g(id);
    if (e) e.textContent = msg || ''; w && w.classList.toggle('bad', !!msg);
    if (inp && inp.matches('input,select,textarea')) { inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); msg ? inp.setAttribute('aria-describedby', id + '_e') : inp.removeAttribute('aria-describedby'); } };
  const isUrl = s => { try { const u = new URL(s); return /^https?:$/.test(u.protocol); } catch { return false; } };
  function check(){
    const errs = [], add = (id, m) => { setErr(id, m); if (m) errs.push(id); };
    add('s_orgtype', val('s_orgtype') ? '' : 'Choose an organisation type.');
    add('s_club', val('s_club') ? '' : 'Enter the club or organisation name.');
    add('s_name', val('s_name') ? '' : 'Enter a contact name.');
    const em = val('s_email'); add('s_email', !em ? 'Enter a contact email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) ? '' : 'That email doesn’t look right.');
    const ph = val('s_phone'); add('s_phone', !ph || /^[+()\d\s-]{8,20}$/.test(ph) ? '' : 'Use digits only, e.g. 0412 345 678.');
    add('s_shoot', val('s_shoot') ? '' : 'Enter the shoot name.');
    add('s_disc', discs().length ? '' : 'Tick at least one discipline.');
    const st = val('s_start'), en = val('s_end'), cl = val('s_close'), t0 = iso(today());
    add('s_start', !st ? 'Choose the start date.' : st < t0 ? 'The start date is in the past.' : '');
    add('s_end', en && st && en < st ? 'The end date is before the start date.' : '');
    add('s_close', cl && st && cl > (en || st) ? 'Entries should close on or before the shoot.' : '');
    add('s_venue', val('s_venue') ? '' : 'Enter the venue.');
    add('s_suburb', val('s_suburb') ? '' : 'Enter the suburb or town.');
    add('s_state', val('s_state') ? '' : 'Choose the state.');
    const me = val('s_method'), ln = val('s_link');
    add('s_method', me ? '' : 'Choose how archers enter now.');
    add('s_link', (me === 'Assemble' || me === 'Archers Diary') && !ln ? `Add your ${me} link.` : ln && /^(https?:|www\.)/i.test(ln) && !isUrl(ln.replace(/^www\./i, 'https://www.')) ? 'That link doesn’t look right.' : '');
    add('s_want', fm.querySelector('[name=want_entry_form]:checked') ? '' : 'Choose yes or no.');
    const file = g('s_file').files[0];
    add('s_file', !file ? '' : !/\.(pdf|jpe?g)$/i.test(file.name) ? 'Flyers must be a PDF or JPG.' : file.size > MAX_MB * 1048576 ? `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB; try a link instead.` : '');
    const fl = val('s_flink'); add('s_flink', fl && !isUrl(fl) ? 'Use a full link starting with https://' : '');
    add('s_ok', g('s_ok').checked ? '' : 'Please tick to give permission to publish.');
    return errs;
  }
  fm.addEventListener('change', e => { if (fm.dataset.tried) check(); });
  fm.addEventListener('input', e => { if (fm.dataset.tried) { const w = e.target.closest('[data-f]'); if (w && w.classList.contains('bad')) check(); } });
  function mailBody(){
    const L = [['Organisation type', val('s_orgtype')], ['Club', val('s_club')], ['Contact name', val('s_name')], ['Contact email', val('s_email')], ['Phone', val('s_phone')],
      ['Shoot', val('s_shoot')], ['Discipline', discs().join(', ')], ['Start', val('s_start')], ['End', val('s_end')], ['Venue', val('s_venue')], ['Suburb', val('s_suburb')], ['State', val('s_state')],
      ['Entries close', val('s_close')], ['Entry method', val('s_method')], ['Entry link', val('s_link')],
      ['Entry form wanted', (fm.querySelector('[name=want_entry_form]:checked') || {}).value || ''], ['Flyer link', val('s_flink')], ['Notes', val('s_notes')],
      ['Permission to publish', g('s_ok').checked ? 'Yes' : 'Not ticked']];
    return L.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n>>> Please attach the flyer (PDF or JPG) to this email before sending. <<<\n';
  }
  g('subMail').onclick = e => { const sub = `Shoot submission: ${val('s_shoot') || 'new shoot'}${val('s_club') ? ' – ' + val('s_club') : ''}`;
    e.currentTarget.href = `mailto:${SITE.contact}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(mailBody())}`; };
  fm.onsubmit = e => {
    fm.dataset.tried = 1;
    const errs = check();
    if (errs.length) { e.preventDefault(); $('#subErr').textContent = `Please fix ${errs.length === 1 ? 'the highlighted field' : `the ${errs.length} highlighted fields`}.`;
      const first = g(errs[0]).matches('input,select,textarea') ? g(errs[0]) : g(errs[0]).querySelector('input'); first && first.focus(); return; }
    $('#subErr').textContent = '';
    if (!SITE.formEndpoint || !navigator.onLine) { e.preventDefault(); g('subMail').click(); location.href = g('subMail').href;
      toast(navigator.onLine ? 'Opening your email app…' : 'You’re offline: opening your email app instead'); return; }
    g('s_disc_val').value = discs().join(', ');
    fm.querySelector('[name=_next]').value = location.href.split('#')[0].split('?')[0] + '?sent=1#/submit';
    fm.querySelector('[name=_subject]').value = `New shoot: ${val('s_shoot')} – ${val('s_club')} (${val('s_state')})`;
    if (!g('s_file').files.length) g('s_file').disabled = true;   // don't send an empty file part
    const b = g('subBtn'); b.disabled = true; b.textContent = 'Sending…';
  };
  window.addEventListener('pageshow', () => { const b = $('#subBtn'); if (b) { b.disabled = false; b.textContent = 'Submit shoot for review'; g('s_file').disabled = false; } }, {once: true});
}

/* ---------- start ---------- */
boot().catch(e => { $('#view').innerHTML = `<div class="empty">Couldn't load shoot data (${esc(e.message)}). If you opened the file directly, run it from a web server.</div>`; });
