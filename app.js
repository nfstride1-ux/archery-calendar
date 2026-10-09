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
  groups: ['aa','aba','awa']                   // AUS scope: Archery Australia (incl. RGBs/clubs), ABA, Archery WA
};
let S = load(), EV = [], ORGS = [], BYID = {}, CMAP = {}, PH = {}, SCOPE = 'WORLD';
const STATES = [['WA','Western Australia'],['SA','South Australia'],['VIC','Victoria'],['NSW','New South Wales'],['ACT','Australian Capital Territory'],['QLD','Queensland'],['TAS','Tasmania'],['NT','Northern Territory']];
const GROUPS = [['aa','Archery Australia','State associations (RGBs) and clubs – target, field, indoor, clout, QREs'],['aba','Australian Bowhunters Association (ABA)','All 10 branches (A–J) – field, 3D, IFAA'],['awa','Archery WA','WA state events, QREs and club shoots']];
const AUS = () => SCOPE === 'AUS';
const SITE = Object.assign({flyers:'local', ads:true, contact:'nfshold@gmail.com', freeUntil:'31 Dec 2026'}, window.SITE || {});
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
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

async function boot(){
  $('#todayLbl').textContent = today().toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'});
  const [e, o, ph] = await Promise.all([fetch('data/events.json').then(r => r.json()), fetch('data/organisations.json').then(r => r.json()), fetch('img/credits.json').then(r => r.json()).catch(() => ({}))]);
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
  route(); checkReminders(); setInterval(checkReminders, 60 * 60 * 1000);
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
const credit = () => '';   // photo credits live on the Credits page only (linked from every footer), not on the photos
function theme(x){
  const d = (x.discipline || '') + ' ' + (x.name || '') + ' ' + (x.rounds || '');
  if (/indoor|vegas|18 ?m/i.test(d)) return 'indoor';
  if (/3d|bowfish|trail shoot|bowhunter|safari/i.test(d)) return '3d';
  if (/field|ifaa|hunter round|aba/i.test(d)) return 'field';
  if (/target|clout|para|matchplay|qre|1440|720|900|canberra|olympic|world cup|championships/i.test(d)) return 'target';
  return 'mixed';
}
const CATS = {competition:['🏹','Competition','Competitions'], coaching:['🎓','Coaching course','Coaching courses'], youth:['🧒','Youth training','Youth training'], come_try:['👋','Come & try','Come & try / have-a-go']};
const catOf = x => CATS[x.category] ? x.category : 'competition';
const catTag = x => catOf(x) === 'competition' ? '' : `<span class="tag cat cat-${catOf(x)}">${CATS[catOf(x)][0]} ${CATS[catOf(x)][1]}</span>`;
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
  const b = [orgBadge(x), entryBadge(x)].filter(Boolean), en = S.entries[x.id];
  if (x.book_anytime) b.push(`<span class="b tbc">📞 Book any time</span>`);
  else if (x.info_only) b.push(`<span class="b tbc">${catOf(x) === 'competition' ? 'ℹ Info only' : '↻ Ongoing program'}</span>`);
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
  const on = !!S.saved[x.id], t = theme(x), p = photo(t);
  return `<article class="ev th-${t}" role="link" tabindex="0" data-open="${esc(x.id)}" aria-label="${esc(x.name)}">
    <div class="ev-img" style="background-image:url('${esc(p.sm)}')">${dateBox(x)}</div>
    <div class="body"><div class="tags">${catTag(x)}${t !== 'mixed' && catOf(x) === 'competition' ? tagHtml(t) : ''}${x.flyer_local ? `<span class="tag fl">📄 ${x.flyer_is_current ? x.flyer_year + ' flyer' : 'Last year’s flyer'}</span>` : ''}</div>
      <h3 class="name">${esc(x.name)}</h3>
      <div class="meta">${esc([x.location, x.country_code && x.country_code !== 'AUS' ? x.country : x.state].filter(Boolean).join(' · '))}</div>
      <div class="meta">${esc([x.discipline, x.org, x.aba_branch && x.aba_branch.split(' – ')[0]].filter(Boolean).join(' · '))}</div>${badges(x, true)}
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
function pageHead(title, sub, t = 'mixed'){
  const p = photo(t);
  return `<section class="phead" style="--img:url('${esc(p.file)}')"><div class="wrap"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${credit(t)}</section>`;
}
function clubCta(compact){
  const m = `mailto:${SITE.contact}?subject=${encodeURIComponent('Our shoot / flyer for Archery Calendar')}`;
  return `<aside class="cta${compact ? ' compact' : ''}"><span class="kicker">Clubs &amp; organisers</span><b class="cta-h">Send us your flyer</b>
    <p>No online entries? We'll list your shoot, set up a <b>free entry form</b> and send you the entry list. Free until ${esc(SITE.freeUntil)}.</p>
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
  return `<section class="panel flyer-panel" id="flyer"><h2 class="sec">${cur ? '📄 Flyer' : '⚠ Last year’s flyer'}</h2>
    <span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' flyer' : `⚠ Last year’s flyer (${x.flyer_year}) – the ${x.start_date ? x.start_date.slice(0, 4) : 'new'} flyer isn’t out yet; details may change`}</span>
    <a class="flyer-big${cur ? '' : ' old'}" href="${esc(x.flyer_web)}" target="_blank" rel="noopener" aria-label="Open the flyer full size">
      <img src="${esc(x.flyer_web_sm)}" alt="${esc((cur ? '' : 'Last year’s ') + 'flyer for ' + x.name + (x.flyer_is_pdf ? ' (page 1)' : ''))}" loading="lazy" width="640">
      <span class="zoom">🔍 Tap to enlarge${x.flyer_is_pdf ? ' (page 1)' : ''}</span></a>
    <p class="fl-cap">Flyer: ${esc(org)}. Organisers: want it removed or updated? Email <a href="${mail}">${esc(SITE.contact)}</a>.</p>
    ${src ? `<p class="note"><a href="${esc(src)}" target="_blank" rel="noopener">📄 View the original at source ↗</a>${x.flyer_source_name ? ' (' + esc(x.flyer_source_name) + ')' : ''}${x.flyer_is_pdf ? ' – all pages' : ''}</p>` : ''}
    ${rows.length ? `<h2 class="sec">${cur ? 'From the flyer' : 'From last year’s flyer – may change this year'}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${ly}${esc(v)}</dd>`).join('')}</dl>` : ''}</section>`;
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
    <div class="types">${['field','3d','target','indoor'].map(t => `<a class="type th-${t}" href="#/browse" data-th="${t}" style="--img:url('${esc(photo(t).sm)}')"><span class="type-name">${THEMES[t][0]} ${THEMES[t][1]}</span><span class="type-sub">${{field:'Bush courses, marked & unmarked', '3d':'Foam animals in the bush', target:'Outdoor ranges, 18–90 m', indoor:'18 m halls, 3-spot & Vegas'}[t]}</span></a>`).join('')}</div>
    <div class="cats-row" aria-label="More than competitions">${['coaching', 'youth', 'come_try'].map(c => `<a class="cat-link cat-${c}" href="#/browse" data-cat="${c}"><span class="ci" aria-hidden="true">${CATS[c][0]}</span><b>${CATS[c][2]}</b><span>${EV.filter(x => catOf(x) === c && visible(x) && !isPast(x)).length} coming up</span></a>`).join('')}</div>
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
const PHRASES = [[/\b(come (and|n|&) try|come ?n ?try|have ?a ?go|cnt|try archery|come and trial)\b/g, ' cometry '], [/\bworld record status\b/g, ' qre '],
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
  const cat = catOf(x), catTxt = {competition:'competition shoot tournament', coaching:'coaching course coach', youth:'youth junior kids training', come_try:'come and try beginners'}[cat] + (x.book_anytime ? ' corporate team building book anytime' : '');
  const stat = [x.org_status === 'flyer' ? 'flyer out details' : 'no entry details yet', x.entry_close_date ? (daysTo(x.entry_close_date) < 0 ? 'entries closed' : 'entries open') : x.registration_url ? 'entries open' : ''];
  const words = snorm([x.name, x.host, x.location, x.org, sc, st && st[1], sc && CAPITAL[sc], x.discipline, catTxt, ...lvl, grpTxt, x.branch ? 'branch ' + x.branch : '', x.branch_name, ...months, ...stat, x.series_part, x.notes, ...Object.entries(x.flyer_extract || {}).filter(([k, v]) => typeof v === 'string' && !/url|source/.test(k)).map(([, v]) => v), roundTerms(x)].filter(Boolean).join(' '));
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
let BF = {q:'', disc:'', cat:'', ost:'', scope:'all', state:'', past:false, limit:60};
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
  if (BF.state) list = list.filter(x => x.state_code === BF.state);
  const active = [BF.q && `search “${esc(BF.q)}”`, BF.state && (STATES.find(s => s[0] === BF.state) || [, BF.state])[1], BF.disc && `discipline ${esc(BF.disc)}`, BF.cat && CATS[BF.cat] && CATS[BF.cat][2], BF.ost && OST[BF.ost] && OST[BF.ost][2], qState && `state from your search: ${Q.states.join(', ')}${!grp && !BF.state && S.states.length ? ' (overrides your Settings states)' : ''}`, !grp && !BF.state && !qState && S.states.length && AUS() && `your states in Settings (${S.states.join(', ')})`].filter(Boolean);
  if (BF.disc) list = list.filter(x => (x.discipline || '').startsWith(BF.disc));
  if (BF.cat) list = list.filter(x => catOf(x) === BF.cat);
  if (BF.ost) list = list.filter(x => x.org_status === BF.ost);
  if (Q) list = list.filter(x => matchQ(x, Q));
  let showPastNote = false;
  if (!BF.past) { const up = list.filter(x => !isPast(x)); if (!up.length && Q && list.length) showPastNote = true; else list = up; }
  const sk = x => x.book_anytime ? '9999-99' : x.start_date || '9999';
  list.sort((a, b) => sk(a) < sk(b) ? -1 : 1);
  const total = list.length; list = list.slice(0, BF.limit);
  let html = `${pageHead('Find a shoot', 'Field, 3D, Target and Indoor shoots from the calendars you follow.', {Field:'field','3D':'3d',Target:'target',Indoor:'indoor'}[BF.disc] || 'mixed')}<div class="wrap browse"><div class="filters"><input type="search" id="q" placeholder="Search shoot, club, town…" value="${esc(BF.q)}" aria-label="Search shoots">
  <div class="chips" role="group" aria-label="Show">${scopes.map(([k, l]) => `<button class="chip" data-scope="${esc(k)}" aria-pressed="${BF.scope === k}">${esc(l)}</button>`).join('')}</div>
  ${AUS() ? `<label for="st" class="sr">State</label><select id="st" aria-label="State"><option value="">All states &amp; territories</option>${STATES.map(([c, n]) => `<option value="${c}" ${BF.state === c ? 'selected' : ''}>${n}</option>`).join('')}</select>` : ''}
  <label for="ost" class="sr">Organisation status</label><select id="ost" aria-label="Organisation status"><option value="">All – any status</option>${Object.entries(OST).map(([k, v]) => `<option value="${k}" ${BF.ost === k ? 'selected' : ''}>${v[0]} ${v[2]}</option>`).join('')}</select>
  <label for="cat" class="sr">Event type</label><select id="cat" aria-label="Event type"><option value="">All event types</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${BF.cat === k ? 'selected' : ''}>${v[0]} ${v[2]}</option>`).join('')}</select>
  <div class="row"><select id="disc" aria-label="Discipline"><option value="">All disciplines</option>${discs.map(d => `<option ${BF.disc === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
  <label style="display:flex;align-items:center;gap:8px;margin:0;flex:0 0 auto"><input type="checkbox" id="past" ${BF.past ? 'checked' : ''} style="width:22px;min-height:22px"> Show finished</label></div>
  ${showPastNote ? `<p class="note" id="pastNote">◷ No upcoming shoots match – showing finished shoots.</p>` : ''}
  ${active.length && total ? `<p class="note" id="activeF">Filtered by: ${active.join(' · ')} <button class="linkbtn" id="clearF2">✕ Clear</button></p>` : ''}
  <p class="note">${total} shoot${total !== 1 ? 's' : ''}. Change ${AUS() ? 'states &amp; organisations' : 'countries &amp; bodies'} in <a href="#/settings">Settings</a>.</p></div><div class="results">`;
  let m = '', n = 0;
  for (const x of list) { const k = x.book_anytime ? 'ANY' : x.start_date ? x.start_date.slice(0, 7) : 'TBC'; if (k !== m) { m = k; html += `<div class="month">${k === 'ANY' ? '📞 Book any time' : k === 'TBC' ? 'Dates to be confirmed' : MONL[+k.slice(5) - 1] + ' ' + k.slice(0, 4)}</div>`; } html += evCard(x); if (++n % 10 === 0 && n < list.length) html += adSlot('feed'); }
  if (!total) html += `<div class="empty">No shoots match${active.length ? ': ' + active.join(' · ') : ''}. ${active.length ? '<button class="btn alt" id="clearF">✕ Clear filters</button>' : `Try another filter${AUS() ? '' : ' or add countries in Settings'}.`}</div>`;
  if (total > BF.limit) html += `<button class="btn alt more" id="more">Show more (${total - BF.limit} left)</button>`;
  return html + '</div></div>';
}
function bindBrowse(){
  const q = $('#q'); q.oninput = () => { BF.q = q.value; BF.limit = 60; clearTimeout(bindBrowse.t); bindBrowse.t = setTimeout(() => { render(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  document.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { BF.scope = b.dataset.scope; BF.disc = ''; BF.limit = 60; render(); });
  const clr = () => { Object.assign(BF, {q:'', disc:'', cat:'', ost:'', state:'', limit:60}); if (S.states.length) { S.states = []; save(); } render(); };
  ['#clearF', '#clearF2'].forEach(s => { const b = $(s); if (b) b.onclick = clr; });
  $('#disc').onchange = e => { BF.disc = e.target.value; render(); };
  $('#cat').onchange = e => { BF.cat = e.target.value; BF.limit = 60; render(); };
  $('#ost').onchange = e => { BF.ost = e.target.value; BF.limit = 60; render(); };
  const st = $('#st'); if (st) st.onchange = e => { BF.state = e.target.value; BF.limit = 60; render(); };
  $('#past').onchange = e => { BF.past = e.target.checked; render(); };
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
  const kindLbl = catOf(x) === 'come_try' && x.registration_url ? 'Book a place' : catOf(x) !== 'competition' && x.registration_url ? 'Register / book' : null;
  const t = theme(x), p = photo(t), isMail = x.registration_url_kind === 'email';
  const closedNow = !!x.entry_close_date && daysTo(x.entry_close_date) < 0;
  const regBtn = x.info_only && !x.book_anytime ? '' : x.registration_url ? `<a class="btn ${closedNow ? 'alt' : 'gold'} block big-btn" id="regBtn" href="${esc(x.registration_url)}" ${isMail ? '' : 'target="_blank" rel="noopener"'}>${isMail ? '' : '↗ '}${kindLbl && !closedNow ? kindLbl : closedNow ? kind.replace(/^Register \/ enter$/, 'Entry page') + ' (entries closed)' : kind}</a>
      ${x.registration_email ? `<p class="note">Opens your email app addressed to <b>${esc(x.registration_email.to)}</b>${x.registration_email.cc ? `, cc ${esc(x.registration_email.cc)}` : ''}, with ${esc(x.registration_email.fields.join(', '))} ready to fill in.</p>` : ''}
      ${x.registration_url_source ? `<p class="note">Entry details from ${esc(x.registration_url_source)}.</p>` : ''}`
    : `<div class="warn">⚠ No online entry link found yet. ${x.org_id === 'aba' ? 'ABA shoots are entered through the host club.' : 'Check the source page below.'}</div>`;
  const closed = !!x.entry_close_date && daysTo(x.entry_close_date) < 0 && !isPast(x) && !x.info_only;
  const closeTxt = x.entry_close_date ? pd(x.entry_close_date).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'long',year:'numeric'}) + (x.entry_close_time ? ', ' + x.entry_close_time : '') : '';
  return `<section class="dhero" style="--img:url('${esc(p.file)}')"><div class="wrap">
    <a class="crumb" href="#/browse">← All shoots</a>
    <div class="tags">${catTag(x)}${catOf(x) === 'competition' ? tagHtml(t) : ''}${x.level ? `<span class="tag lvl">${esc(x.level)}</span>` : ''}</div>
    <h1>${esc(x.name)}</h1><p class="sub">${esc(range(x))}${x.location ? ' · ' + esc(x.location) : ''}</p>${badges(x)}
  </div>${credit(t)}</section>
  <div class="wrap detail">
   <div class="main">
    ${flyerCard(x)}
    <section class="panel"><h2 class="sec">Shoot details</h2><dl class="kv">
      <dt>When</dt><dd>${esc(range(x))}</dd>
      <dt>Where</dt><dd>${esc(x.location || '—')}${x.host ? `<br><span class="note">Host club: ${esc(x.host)}${x.venue_is_host_only ? ' – check the organiser for the exact range' : ''}</span>` : ''}${x.state && !(x.location || '').includes(' ' + x.state) ? ' · ' + esc(x.state) : ''}${x.country ? '<br><span class="note">' + esc(x.country) + '</span>' : ''}</dd>
      <dt>Type</dt><dd>${CATS[catOf(x)][0]} ${CATS[catOf(x)][1]}</dd>
      <dt>Discipline</dt><dd>${esc(x.discipline || '—')}</dd>
      <dt>Level</dt><dd>${esc(x.level || '—')}</dd>
      <dt>Organiser</dt><dd>${esc(x.org || '—')}${x.aba_branch ? '<br><span class="note">ABA ' + esc(x.aba_branch) + '</span>' : ''}</dd>
      ${x.rounds && x.rounds !== x.name && !x.name.includes(x.rounds) ? `<dt>Rounds</dt><dd>${esc(x.rounds)}</dd>` : ''}
      ${x.registration_opens ? `<dt>Entries open</dt><dd>${esc(x.registration_opens)}</dd>` : ''}
      ${closeTxt ? `<dt>Entries close</dt><dd>${esc(closeTxt)}${x.field_sources?.entry_close_date ? ` <span class="src">from ${esc(x.field_sources.entry_close_date)}</span>` : ''}</dd>` : ''}
      ${x.fee ? `<dt>Fee</dt><dd>${esc(x.fee)}${x.field_sources?.fee ? ` <span class="src">from ${esc(x.field_sources.fee)}</span>` : ''}</dd>` : ''}
    </dl>${x.notes ? `<p class="note">${esc(x.notes)}</p>` : ''}</section>
    ${CALS[x.org_group] ? `<p class="note"><a href="#/calendars/${x.org_group}">📅 See it in the full ${esc(CALS[x.org_group].name)} calendar</a></p>` : ''}
    <p class="note">Source: <a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(x.source_url)}</a>${x.also_listed ? ` · also <a href="${esc(x.also_listed)}" target="_blank" rel="noopener">World Archery listing</a>` : ''}<br>Checked ${esc(x.last_checked)}. Always confirm details with the organiser.</p>
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
  return `${pageHead('Settings', 'Choose your calendars and reminders.', 'indoor')}<div class="wrap narrow">${AUS() ? ausHtml : `<h2>Countries</h2><p class="note">Shows each country's national calendar. Pick as many as you like.</p>
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
      <ul class="ticks"><li>Sold directly to archery businesses, monthly or per season. Pricing on request during launch.</li>
      <li>Every ad is clearly labelled "Sponsored". Archery-related businesses only.</li>
      <li>No tracking cookies at launch. Ads link straight to your website.</li></ul></section>
    <section class="panel dark"><h2 class="sec">Get in touch</h2><p class="big-mail"><a href="${AD_MAIL}">${CONTACT}</a></p>
      <p class="note">NFS Strategic Holdings</p></section>
  </div>`;
}
function vPrivacy(){
  setTitle('Privacy & disclaimer');
  return `${pageHead('Privacy &amp; disclaimer', 'Short version: your data stays in your browser.', 'mixed')}<div class="wrap narrow"><section class="panel"><h2 class="sec">Privacy</h2>
    <ul class="ticks"><li>${AUTH.on ? 'No account needed. If you don’t sign in, the' : 'No account, no sign-up. The'} shoots you save, your entries and payments, and your reminder settings are stored only in <b>your browser on this device</b> (localStorage). They are never sent to us.</li>
    <li>Clearing your browser data deletes them. Use <a href="#/settings">Settings → Export backup</a> to keep a copy or move to another device.</li>
    <li>No analytics, advertising or tracking cookies. Reminders are made on your device.</li>
    <li>"Register / enter" and email links go straight to the organiser. Anything you send them is between you and the organiser.</li>
    <li><b>Submit a shoot form:</b> what a club sends us (contact name, email, phone, shoot details and flyer) is emailed to us at ${esc(SITE.contact)} via the form service FormSubmit (formsubmit.co). We use it only to check and list the shoot and, if you ask, to set up your entry form. Contact details aren't published unless they're on your flyer. Ask us any time to correct or delete them.</li>
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
  return `${pageHead('Photo &amp; font credits', 'Thanks to the photographers who share their work under open licences.', 'mixed')}<div class="wrap narrow"><section class="panel"><ul class="credits">${Object.entries(PH).map(([k, p]) => `<li><img src="${esc(p.sm)}" alt="" loading="lazy"><div><b>${esc(p.title)}</b><br>${esc(p.by)} · ${esc(p.source)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">source</a>` : ''}<br>${p.license_url ? `<a href="${esc(p.license_url)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license)}. Resized for this site.</div></li>`).join('')}</ul>
  <p class="note">Fonts: Inter and Barlow Condensed, SIL Open Font License 1.1, self-hosted. Event flyers belong to their organisers${SITE.flyers === 'local' ? ' and are shown for private testing only' : ' – we link to them at the source and do not host copies'}.</p></section></div>`;
}

/* ---------- .ics export ---------- */
function icsEsc(s){ return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
// RFC 5545: lines max 75 OCTETS (UTF-8), continuation lines start with a space; never split a character.
function fold(l){ const enc = new TextEncoder(), out = []; let cur = '', n = 0, lim = 75;
  for (const ch of l) { const b = enc.encode(ch).length; if (n + b > lim) { out.push(cur); cur = ''; n = 0; lim = 74; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n '); }
function downloadIcs(list, name){
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Archery Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:My archery shoots'];
  for (const x of list) {
    const e = S.entries[x.id], end = pd(x.end_date || x.start_date); end.setDate(end.getDate() + 1);
    const st = ST(x.id), desc = [st === 'paid' ? `ENTERED + PAID${e.amount ? ' ' + (e.currency || 'AUD') + ' ' + e.amount : ''}${e.ref ? ' (#' + e.ref + ')' : ''}` : st === 'entered' ? 'ENTERED – NOT PAID YET' : 'NOT ENTERED YET', x.discipline, x.registration_url ? 'Entry: ' + x.registration_url : '', 'Source: ' + x.source_url].filter(Boolean).join('\n');
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
let CF = {org:'aba', where:'', disc:'', past:true};
const calWhere = x => x.org_group === 'aba' ? (x.branch ? `${x.branch} – ${x.branch_name || ''}` : (x.state_code || '')) : (x.state_code || '');
function vCals(arg){
  if (CALS[arg]) { if (CF.org !== arg) { CF.where = ''; CF.disc = ''; } CF.org = arg; }
  const c = CALS[CF.org]; setTitle(c.name + ' calendar');
  const all = EV.filter(x => x.org_group === CF.org && x.start_date && x.start_date >= '2026-01-01').sort((a, b) => a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.name < b.name ? -1 : 1);
  const years = [...new Set(all.map(x => x.start_date.slice(0, 4)))];
  const wheres = [...new Set(all.map(calWhere).filter(Boolean))].sort();
  const discs = [...new Set(all.map(x => (x.discipline || '').split(/[ (/]/)[0]).filter(Boolean))].sort();
  if (CF.where && !wheres.includes(CF.where)) CF.where = ''; if (CF.disc && !discs.includes(CF.disc)) CF.disc = '';
  let list = all.filter(x => (!CF.where || calWhere(x) === CF.where) && (!CF.disc || (x.discipline || '').startsWith(CF.disc)) && (CF.past || !isPast(x)));
  const nPast = list.filter(isPast).length;
  let html = `${pageHead('Calendars', 'Each organisation’s full calendar, in one place. Tap a shoot for details, entry and reminders.', 'mixed')}<div class="wrap cals">
  <div class="tabs" role="tablist" aria-label="Organisation">${Object.entries(CALS).map(([k, o]) => `<a role="tab" class="tab" href="#/calendars/${k}" aria-selected="${k === CF.org}">${esc(o.name)}</a>`).join('')}</div>
  <div class="panel cal-head"><h2 class="sec">${esc(c.full)} – ${years.join(' & ') || '2026'}</h2>
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
      <span class="c-name" role="cell"><b>${esc(x.name.replace(/ – [^–]+$/, '') || x.name)}</b>${tb}${stb}${catTag(x)}</span>
      <span class="c-club" role="cell">${esc(x.host || x.location || '')}</span>
      <span class="c-where" role="cell">${esc(calWhere(x))}</span>
      <span class="c-disc" role="cell">${esc(x.discipline || '')}</span></a>`;
  }
  if (!list.length) html += `<div class="empty">No shoots match these filters.</div>`;
  return html + `</div><p class="note">Rebuilt from the organisers’ published calendars and checked ${esc(EV[0] ? EV[0].last_checked || '' : '')}. Always confirm with the host club.</p></div>`;
}
function bindCals(){
  $('#cw').onchange = e => { CF.where = e.target.value; render(); };
  $('#cd').onchange = e => { CF.disc = e.target.value; render(); };
  $('#cp').onchange = e => { CF.past = e.target.checked; render(); };
}
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
AUTH.configured = AUTH.on;
if (SB_URL && !AUTH.on) console.warn('Archery Calendar: Supabase config ignored – needs SUPABASE_URL (https://…supabase.co) and the PUBLIC anon/publishable key (never the service_role/secret key).');
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load ' + src)); document.head.appendChild(s); });
const redirectUrl = () => location.origin + location.pathname;
function softRender(){ const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#view')) return; const y = scrollY; render(); scrollTo(0, y); }
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
  if (AUTH.on && !(await sbReady())) { AUTH.on = false; AUTH.pending = true; console.info('Archery Calendar: accounts configured but the database tables are not set up yet (run supabase/schema.sql) – sign-in hidden.'); }
  updateNav(); if (!AUTH.on) { if (document.body.dataset.page === 'account' || document.body.dataset.page === 'privacy') softRender(); return; }
  try { if (!window.supabase) await loadScript('vendor/supabase-js-2.117.3.js'); }
  catch { AUTH.msg = 'Sign-in couldn’t load. Are you offline? Your shoots are still saved on this device.'; AUTH.ready = true; softRender(); return; }
  const qp = new URLSearchParams(location.search);
  if (qp.get('error_description') || qp.get('error')) AUTH.msg = 'Sign-in didn’t work: ' + (qp.get('error_description') || qp.get('error')) + '. Links expire after an hour and only work once – ask for a new one.';
  AUTH.client = window.supabase.createClient(SB_URL, SB_KEY, {auth: {flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'archcal.auth'}});
  AUTH.sync = ArchSync.create({client: AUTH.client, storage: localStorage, getS: () => S, saveS: () => { save(); softRender(); },
    isOnline: () => navigator.onLine, onChange: () => { updateNav(); if (document.body.dataset.page === 'account') softRender(); }});
  const cameBack = qp.has('code') || qp.has('error');
  AUTH.client.auth.onAuthStateChange((ev, sess) => { const u = sess ? sess.user : null; AUTH.chain = AUTH.chain.then(() => onUser(u, ev)).catch(e => { AUTH.msg = String(e.message || e); }); });
  await AUTH.client.auth.getSession().catch(() => {});
  await AUTH.chain;
  if (cameBack) { history.replaceState(null, '', location.pathname + (AUTH.user ? '#/account' : (location.hash || '#/account'))); }
  AUTH.ready = true; updateNav(); softRender();
  addEventListener('online', () => AUTH.sync.flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) AUTH.sync.flush(); });
  setInterval(() => AUTH.sync.flush(), 5 * 60 * 1000);
}
async function onUser(u){
  const prev = AUTH.user && AUTH.user.id; AUTH.user = u;
  if (!u) { AUTH.sync.setUser(null); updateNav(); softRender(); return; }
  AUTH.sent = '';
  if (prev === u.id && AUTH.sync.linked()) return;
  AUTH.sync.setUser(u);
  if (!AUTH.sync.linked()) {
    if (AUTH.sync.needsMergeChoice(u)) { AUTH.ask = true; if (!location.hash.startsWith('#/account')) location.hash = '#/account'; }
    else await AUTH.sync.link(u, 'account');
  }
  updateNav(); softRender();
}
const counts = () => ({saved: Object.keys(S.saved).length, ent: Object.keys(S.entries).length});
function vAccount(){
  setTitle(AUTH.user ? 'Account' : 'Sign in');
  const head = pageHead(AUTH.user ? 'Your account' : 'Sign in', 'Optional. Keep your shoots, entries and settings on all your devices.', 'target');
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
    <a class="btn alt" href="#/settings">Change in Settings</a><p class="note">Settings sync to your other devices.</p></section>
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
    softRenderForce(); };
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
function route(){ render(); window.scrollTo(0, 0); }
function render(){
  const h = location.hash || '#/home', [, p, arg] = h.split('/'), v = $('#view');
  document.querySelectorAll('.nav a').forEach(a => { const on = a.dataset.tab === (p || 'home') || (p === 'shoot' && a.dataset.tab === 'browse'); a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  document.body.dataset.page = p || 'home';
  if (p === 'browse') { v.innerHTML = vBrowse(); bindBrowse(); }
  else if (p === 'shoot') { const id = decodeURIComponent(arg || ''); v.innerHTML = vShoot(id); bindShoot(id); }
  else if (p === 'calendar') { v.innerHTML = vCalendar(); bindCalendar(); }
  else if (p === 'entries') v.innerHTML = vEntries();
  else if (p === 'settings') { v.innerHTML = vSettings(); bindSettings(); }
  else if (p === 'advertise') v.innerHTML = vAdvertise();
  else if (p === 'credits') v.innerHTML = vCredits();
  else if (p === 'privacy') v.innerHTML = vPrivacy();
  else if (p === 'account') { v.innerHTML = vAccount(); bindAccount(); }
  else if (p === 'submit') { v.innerHTML = vSubmit(); bindSubmit(); }
  else if (p === 'calendars') { v.innerHTML = vCals(arg); bindCals(); }
  else { v.innerHTML = vHome();
    v.querySelectorAll('[data-cat]').forEach(a => a.onclick = () => { BF.cat = a.dataset.cat; BF.disc = ''; BF.scope = 'all'; });
    v.querySelectorAll('[data-th]').forEach(a => a.onclick = () => { BF.cat = ''; BF.disc = {field:'Field','3d':'3D',target:'Target',indoor:'Indoor'}[a.dataset.th]; BF.scope = 'all'; });
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
    <p class="note">Asked for a free entry form? We'll email you a link to check before it goes live. Free until ${esc(SITE.freeUntil)}.</p>
    <div class="row"><a class="btn gold" href="#/submit">Submit another shoot</a><a class="btn alt" href="#/browse">Find shoots</a></div></section></div>`;
  const opt = (a, ph) => `<option value="">${ph}</option>` + a.map(x => `<option>${esc(x)}</option>`).join('');
  const f = (id, lab, inp, hint = '', req = true) => `<div class="fld" data-f="${id}"><label for="${id}">${lab}${req ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>${inp}${hint ? `<p class="hint" id="${id}_h">${hint}</p>` : ''}<p class="err" id="${id}_e" role="alert"></p></div>`;
  return `${head}<div class="wrap narrow sub">
  <section class="panel sub-intro"><ul class="ticks">
    <li>Free to list. Every shoot is <b>reviewed before it goes live, usually within 48 hours</b>.</li>
    <li>No online entries? Tick "yes" below and we'll set up a <b>free entry form</b> and email you the entry list. Free until ${esc(SITE.freeUntil)}.</li>
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
      <div class="fld" data-f="s_want"><span class="lab" id="s_want_l">Want us to set up a free entry form? <span class="req" aria-hidden="true">*</span></span>
        <div class="seg" role="radiogroup" aria-labelledby="s_want_l" id="s_want"><label class="chk"><input type="radio" name="want_free_entry_form" value="Yes" required><span>Yes please</span></label><label class="chk"><input type="radio" name="want_free_entry_form" value="No"><span>No thanks</span></label></div><p class="err" id="s_want_e" role="alert"></p></div>
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
    add('s_want', fm.querySelector('[name=want_free_entry_form]:checked') ? '' : 'Choose yes or no.');
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
      ['Free entry form wanted', (fm.querySelector('[name=want_free_entry_form]:checked') || {}).value || ''], ['Flyer link', val('s_flink')], ['Notes', val('s_notes')],
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
