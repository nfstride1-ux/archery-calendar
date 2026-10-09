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
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); }
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

async function boot(){
  $('#todayLbl').textContent = today().toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'});
  const [e, o, ph] = await Promise.all([fetch('data/events.json').then(r => r.json()), fetch('data/organisations.json').then(r => r.json()), fetch('img/credits.json').then(r => r.json()).catch(() => ({}))]);
  PH = ph; SCOPE = e.scope || 'WORLD';
  if (!Array.isArray(S.states)) S.states = []; if (!Array.isArray(S.groups)) S.groups = DEFAULT.groups.slice();
  EV = e.events.filter(x => !x.info_only || true); ORGS = o.organisations;
  EV.forEach(x => BYID[x.id] = x);
  ORGS.filter(x => x.country_code).forEach(x => { CMAP[x.country_code] = CMAP[x.country_code] || x.country; });
  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  route(); checkReminders(); setInterval(checkReminders, 60 * 60 * 1000);
}

/* ---------- helpers ---------- */
function visible(x){
  if (S.saved[x.id]) return true;
  if (AUS()) return S.groups.includes(x.org_group) && (!S.states.length || !x.state_code || S.states.includes(x.state_code));
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
const credit = (t, cls = '') => { const p = photo(t); return p.by ? `<span class="credit ${cls}">Photo: ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.by)}</a>` : esc(p.by)} · ${esc(p.license)}</span>` : ''; };
function theme(x){
  const d = (x.discipline || '') + ' ' + (x.name || '') + ' ' + (x.rounds || '');
  if (/indoor|vegas|18 ?m/i.test(d)) return 'indoor';
  if (/3d|bowfish|trail shoot|bowhunter|safari/i.test(d)) return '3d';
  if (/field|ifaa|hunter round|aba/i.test(d)) return 'field';
  if (/target|clout|para|matchplay|qre|1440|720|900|canberra|olympic|world cup|championships/i.test(d)) return 'target';
  return 'mixed';
}
const tagHtml = t => `<span class="tag">${THEMES[t][0]} ${THEMES[t][1]}</span>`;
const isPast = x => x.end_date && daysTo(x.end_date) < 0;
function dateBox(x){
  if (!x.start_date) return `<div class="date tbc" aria-label="Dates to be confirmed">Dates<br>TBC</div>`;
  const d = pd(x.start_date);
  return `<div class="date" aria-label="${d.toDateString()}"><div class="d">${d.getDate()}</div><div class="m">${MON[d.getMonth()]}</div></div>`;
}
function range(x){
  if (!x.start_date) return 'Dates to be confirmed';
  const a = pd(x.start_date), b = pd(x.end_date || x.start_date), o = {day:'numeric', month:'short', year:'numeric'};
  return x.start_date === x.end_date || !x.end_date ? a.toLocaleDateString('en-AU', {weekday:'short', ...o}) : `${a.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${b.toLocaleDateString('en-AU', o)}`;
}
function badges(x){
  const b = [], en = S.entries[x.id];
  if (x.info_only) b.push(`<span class="b tbc">ℹ Info only</span>`);
  if (isPast(x)) b.push(`<span class="b past">◷ Finished</span>`);
  if (S.saved[x.id] && en) b.push(`<span class="b paid">✓ Entered${en.amount ? ' · $' + esc(en.amount) : ''}</span>`);
  else if (S.saved[x.id] && !isPast(x) && !x.info_only) b.push(`<span class="b todo">☐ Not entered yet</span>`);
  if (x.entry_close_date && !en && daysTo(x.entry_close_date) >= 0) b.push(`<span class="b close">⏳ Entries close ${pd(x.entry_close_date).toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span>`);
  if (!x.dates_confirmed) b.push(`<span class="b tbc">? Dates TBC</span>`);
  if (x.world_level) b.push(AUS() ? `<span class="b world">🏆 International event</span>` : `<span class="b world">🌐 World / major</span>`);
  return b.length ? `<div class="badges">${b.join('')}</div>` : '';
}
function evCard(x){
  const on = !!S.saved[x.id], t = theme(x), p = photo(t);
  return `<article class="ev th-${t}" role="link" tabindex="0" data-open="${esc(x.id)}" aria-label="${esc(x.name)}">
    <div class="ev-img" style="background-image:url('${esc(p.sm)}')">${dateBox(x)}</div>
    <div class="body"><div class="tags">${t !== 'mixed' ? tagHtml(t) : ''}${x.flyer_local ? `<span class="tag fl">📄 ${x.flyer_is_current ? x.flyer_year + ' flyer' : 'Last year’s flyer'}</span>` : ''}</div>
      <h3 class="name">${esc(x.name)}</h3>
      <div class="meta">${esc([x.location, x.country_code && x.country_code !== 'AUS' ? x.country : x.state].filter(Boolean).join(' · '))}</div>
      <div class="meta">${esc([x.discipline, x.org, x.aba_branch && x.aba_branch.split(' – ')[0]].filter(Boolean).join(' · '))}</div>${badges(x)}</div>
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
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = ev => { ev.stopPropagation(); toggleSave(b.dataset.star); });
  root.querySelectorAll('[data-open]').forEach(c => { c.onclick = () => location.hash = '#/shoot/' + encodeURIComponent(c.dataset.open);
    c.onkeydown = e => { if (e.key === 'Enter') c.click(); }; });
}
function toggleSave(id){
  if (S.saved[id]) { delete S.saved[id]; toast('Removed from My shoots'); }
  else { S.saved[id] = {added: iso(new Date())}; toast('★ Added to My shoots'); }
  save(); route();
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
    <a class="btn gold" href="${m}">Email ${esc(SITE.contact)}</a></aside>`;
}
function flyerLinkCard(x){
  const ex = x.flyer_extract || {}, cur = x.flyer_is_current, ly = cur ? '' : '<span class="lastyr">Last year</span>';
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
  const rows = [['How to enter', ex.registration], [cur ? 'Entries close' : 'Entries closed', close], ['Fee', ex.fee], ['Rounds', ex.rounds], ['Times', ex.start_times], ['Contact', ex.contact], ['Notes', ex.notes]].filter(r => r[1]);
  const src = x.flyer_source_url;
  return `<section class="panel flyer-panel"><div class="flyer-link">
    <span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' flyer' : '⚠ ' + x.flyer_year + ' flyer – last year'}</span>
    <p class="fl-label">${esc(x.flyer_label)}</p>
    ${src ? `<a class="btn alt" href="${esc(src)}" target="_blank" rel="noopener">📄 View flyer at source ↗</a><p class="note">Opens the organiser's own page or file${x.flyer_source_name ? ' (' + esc(x.flyer_source_name) + ')' : ''}.</p>`
          : `<p class="soon">📄 Flyer coming soon${x.flyer_source_name ? ` – details below are from the ${esc(x.flyer_source_name)}` : ''}.</p>`}</div>
    ${rows.length ? `<h2 class="sec">${cur ? 'From the flyer' : 'From last year’s flyer – may change this year'}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${ly}${esc(v)}</dd>`).join('')}</dl>` : ''}</section>`;
}
function flyerCard(x){
  if (!x.flyer_year) return '';
  if (SITE.flyers !== 'local' || !x.flyer_local) return flyerLinkCard(x);
  const ex = x.flyer_extract || {}, cur = x.flyer_is_current, ly = cur ? '' : '<span class="lastyr">Last year</span>';
  const close = ex.entry_close ? pd(ex.entry_close).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) + (ex.entry_close_note ? ', ' + ex.entry_close_note : '') : null;
  const rows = [['How to enter', ex.registration], [cur ? 'Entries close' : 'Entries closed', close], ['Fee', ex.fee], ['Rounds', ex.rounds], ['Times', ex.start_times], ['Contact', ex.contact], ['Notes', ex.notes]].filter(r => r[1]);
  return `<section class="panel flyer-panel"><div class="flyer"><a class="thumb" href="${esc(x.flyer_local)}" target="_blank" rel="noopener" aria-label="Open the full flyer"><img src="${esc(x.flyer_thumb)}" alt="Flyer page 1" loading="lazy"><span>View flyer ↗</span></a>
    <div><span class="fl-badge ${cur ? 'cur' : 'old'}">${cur ? '📄 ' + x.flyer_year + ' flyer – current' : '⚠ ' + x.flyer_year + ' flyer – last year'}</span>
    <p class="fl-label">${esc(x.flyer_label)}</p><p class="note">Tap the flyer to open it full size.<br>${x.flyer_url ? `Original: <a href="${esc(x.flyer_url)}" target="_blank" rel="noopener">organiser's file</a>` : esc(x.flyer_found_on || '')}</p></div></div>
    ${rows.length ? `<h2 class="sec">${cur ? 'From the flyer' : 'From last year’s flyer – may change this year'}</h2><dl class="kv fx">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${ly}${esc(v)}</dd>`).join('')}</dl>
    ${!cur && ex.registration_url ? `<p class="note">Last year's entry link: <a href="${esc(ex.registration_url)}" target="_blank" rel="noopener">${esc(ex.registration_url.slice(0,60))}…</a> (may not work this year)</p>` : ''}` : ''}</section>`;
}
/* ---------- reminders ---------- */
function reminders(){
  const out = [];
  for (const id of Object.keys(S.saved)) {
    const x = BYID[id]; if (!x || !x.start_date || isPast(x)) continue;
    const dt = daysTo(x.start_date), en = S.entries[id];
    for (const d of S.remindDays) if (dt <= d && dt >= 0) { out.push({key:`${id}:shoot:${d}`, x, when:dt, text: dt === 0 ? 'is TODAY' : `starts in ${dt} day${dt>1?'s':''}`, paid: !!en}); break; }
    if (!en && x.entry_close_date) {
      const dc = daysTo(x.entry_close_date);
      for (const d of S.closeDays) if (dc <= d && dc >= 0) { out.push({key:`${id}:close:${d}`, x, when:dc, text:`entries close in ${dc} day${dc!==1?'s':''} – you haven't entered`, close:true}); break; }
    }
  }
  return out.sort((a, b) => a.when - b.when);
}
function checkReminders(){
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const r of reminders()) {
    if (S.notified[r.key]) continue;
    const body = `${range(r.x)} · ${r.x.location || ''}\n${r.paid ? '✓ You are entered and paid.' : r.close ? 'Tap to open the entry page.' : '☐ You have NOT marked this as entered.'}`;
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
  const paid = up.filter(x => S.entries[x.id]).length;
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
      <span class="nm">${esc(next.name)}</span><span>${esc(range(next))}</span><span class="st">${S.entries[next.id] ? '✓ Entered &amp; paid' : '☐ Not entered yet'}</span></a>` : ''}
  </div>${credit('mixed')}</section>
  <div class="wrap">
    <div class="stats"><a class="stat" href="#/calendar"><b>${up.length}</b><span>My shoots</span></a><a class="stat" href="#/entries"><b>${paid}</b><span>✓ Entered</span></a><a class="stat" href="#/entries"><b>${up.length - paid}</b><span>☐ To enter</span></a></div>
    ${adSlot('banner')}
    <h2 class="sec-h">Pick your discipline</h2>
    <div class="types">${['field','3d','target','indoor'].map(t => `<a class="type th-${t}" href="#/browse" data-th="${t}" style="--img:url('${esc(photo(t).sm)}')"><span class="type-name">${THEMES[t][0]} ${THEMES[t][1]}</span><span class="type-sub">${{field:'Bush courses, marked & unmarked', '3d':'Foam animals in the bush', target:'Outdoor ranges, 18–90 m', indoor:'18 m halls, 3-spot & Vegas'}[t]}</span></a>`).join('')}</div>
    <div class="two">
      <section><h2 class="sec-h">Reminders</h2>
      ${rem.length ? rem.map(r => `<div class="panel rem" data-open="${esc(r.x.id)}" role="link" tabindex="0"><b>${r.close ? '⏳' : '⏰'} ${esc(r.x.name)}</b><div>${esc(r.text)}</div><div class="badges">${r.paid ? '<span class="b paid">✓ Entered &amp; paid</span>' : r.close ? '<span class="b close">⏳ Enter now</span>' : '<span class="b todo">☐ Not entered</span>'}</div></div>`).join('')
        : `<p class="note">Nothing due. You'll get reminders ${S.remindDays.join(', ')} days before each shoot, and ${S.closeDays.join(' / ')} days before entries close.</p>`}</section>
      <section><h2 class="sec-h">Coming up in my shoots</h2>
      ${up.length ? `<div class="list">${up.slice(0, 4).map(evCard).join('')}</div>` : `<div class="empty">No shoots yet. Tap ☆ on any shoot in <a href="#/browse">Find shoots</a>.</div>`}</section>
    </div>
    ${clubCta()}
    ${suggest.length ? `<h2 class="sec-h">Next shoots in your areas</h2><div class="list grid2">${suggest.map(evCard).join('')}</div><p class="center"><a class="btn" href="#/browse">See all shoots →</a></p>` : ''}
  </div>`;
}
let BF = {q:'', disc:'', scope:'all', state:'', past:false, limit:60};
function vBrowse(){
  setTitle('Find shoots');
  const vis = EV.filter(visible);
  const scopes = AUS() ? [['all','All Australia'], ...GROUPS.filter(g => S.groups.includes(g[0])).map(g => ['g:' + g[0], {aa:'Archery Australia', aba:'ABA', awa:'Archery WA'}[g[0]]])] : [['all','All'], ['world','🌐 World'], ...S.countries.map(c => [c, CMAP[c] || c]), ...S.orgs.map(o => [o, (ORGS.find(x => x.id === o) || {}).name?.replace(/\s*\(.*\)/,'') || o])];
  const discs = [...new Set(vis.map(x => (x.discipline || '').split(/[ (/]/)[0]).filter(Boolean))].sort();
  let list = vis.filter(x => BF.past || !isPast(x));
  if (BF.scope.startsWith('g:')) list = list.filter(x => x.org_group === BF.scope.slice(2));
  else if (BF.scope === 'world') list = list.filter(x => x.world_level);
  else if (BF.scope !== 'all') list = list.filter(x => x.country_code === BF.scope && !x.world_level && !['aba','archery-wa'].includes(x.org_id) || x.org_id === BF.scope);
  if (BF.state) list = list.filter(x => x.state_code === BF.state);
  if (BF.disc) list = list.filter(x => (x.discipline || '').startsWith(BF.disc));
  if (BF.q) { const q = BF.q.toLowerCase(); list = list.filter(x => [x.name, x.location, x.org, x.country, x.state].join(' ').toLowerCase().includes(q)); }
  list.sort((a, b) => (a.start_date || '9999') < (b.start_date || '9999') ? -1 : 1);
  const total = list.length; list = list.slice(0, BF.limit);
  let html = `${pageHead('Find a shoot', 'Field, 3D, Target and Indoor shoots from the calendars you follow.', {Field:'field','3D':'3d',Target:'target',Indoor:'indoor'}[BF.disc] || 'mixed')}<div class="wrap browse"><div class="filters"><input type="search" id="q" placeholder="Search shoot, club, town…" value="${esc(BF.q)}" aria-label="Search shoots">
  <div class="chips" role="group" aria-label="Show">${scopes.map(([k, l]) => `<button class="chip" data-scope="${esc(k)}" aria-pressed="${BF.scope === k}">${esc(l)}</button>`).join('')}</div>
  ${AUS() ? `<label for="st" class="sr">State</label><select id="st" aria-label="State"><option value="">All states &amp; territories</option>${STATES.filter(([c]) => !S.states.length || S.states.includes(c)).map(([c, n]) => `<option value="${c}" ${BF.state === c ? 'selected' : ''}>${n}</option>`).join('')}</select>` : ''}
  <div class="row"><select id="disc" aria-label="Discipline"><option value="">All disciplines</option>${discs.map(d => `<option ${BF.disc === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
  <label style="display:flex;align-items:center;gap:8px;margin:0;flex:0 0 auto"><input type="checkbox" id="past" ${BF.past ? 'checked' : ''} style="width:22px;min-height:22px"> Show finished</label></div>
  <p class="note">${total} shoot${total !== 1 ? 's' : ''}. Change ${AUS() ? 'states &amp; organisations' : 'countries &amp; bodies'} in <a href="#/settings">Settings</a>.</p></div><div class="results">`;
  let m = '', n = 0;
  for (const x of list) { const k = x.start_date ? x.start_date.slice(0, 7) : 'TBC'; if (k !== m) { m = k; html += `<div class="month">${k === 'TBC' ? 'Dates to be confirmed' : MONL[+k.slice(5) - 1] + ' ' + k.slice(0, 4)}</div>`; } html += evCard(x); if (++n % 10 === 0 && n < list.length) html += adSlot('feed'); }
  if (!total) html += `<div class="empty">No shoots match. Try another filter${AUS() ? '' : ' or add countries in Settings'}.</div>`;
  if (total > BF.limit) html += `<button class="btn alt more" id="more">Show more (${total - BF.limit} left)</button>`;
  return html + '</div></div>';
}
function bindBrowse(){
  const q = $('#q'); q.oninput = () => { BF.q = q.value; BF.limit = 60; clearTimeout(bindBrowse.t); bindBrowse.t = setTimeout(() => { render(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  document.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { BF.scope = b.dataset.scope; BF.limit = 60; render(); });
  $('#disc').onchange = e => { BF.disc = e.target.value; render(); };
  const st = $('#st'); if (st) st.onchange = e => { BF.state = e.target.value; BF.limit = 60; render(); };
  $('#past').onchange = e => { BF.past = e.target.checked; render(); };
  const mo = $('#more'); if (mo) mo.onclick = () => { BF.limit += 60; render(); };
}

function vShoot(id){
  const x = BYID[id]; if (!x) return `<div class="wrap"><div class="empty">Shoot not found.</div></div>`;
  setTitle(x.name);
  const on = !!S.saved[id], en = S.entries[id];
  const kind = {how_to_guide:'How to enter (guide)', event_page:'Event page & entry', entry_page:'Register / enter', entry_system:'Enter via Archers Diary (search the event)', email:'✉ Email your nomination'}[x.registration_url_kind] || 'Register / enter';
  const t = theme(x), p = photo(t), isMail = x.registration_url_kind === 'email';
  const regBtn = x.info_only ? '' : x.registration_url ? `<a class="btn gold block big-btn" id="regBtn" href="${esc(x.registration_url)}" ${isMail ? '' : 'target="_blank" rel="noopener"'}>${isMail ? '' : '↗ '}${kind}</a>
      ${x.registration_email ? `<p class="note">Opens your email app addressed to <b>${esc(x.registration_email.to)}</b>${x.registration_email.cc ? `, cc ${esc(x.registration_email.cc)}` : ''}, with ${esc(x.registration_email.fields.join(', '))} ready to fill in.</p>` : ''}
      ${x.registration_url_source ? `<p class="note">Entry details from ${esc(x.registration_url_source)}.</p>` : ''}`
    : `<div class="warn">⚠ No online entry link found yet. ${x.org_id === 'aba' ? 'ABA shoots are entered through the host club.' : 'Check the source page below.'}</div>`;
  const closeTxt = x.entry_close_date ? pd(x.entry_close_date).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'long',year:'numeric'}) + (x.entry_close_time ? ', ' + x.entry_close_time : '') : '';
  return `<section class="dhero" style="--img:url('${esc(p.file)}')"><div class="wrap">
    <a class="crumb" href="#/browse">← All shoots</a>
    <div class="tags">${tagHtml(t)}${x.level ? `<span class="tag lvl">${esc(x.level)}</span>` : ''}</div>
    <h1>${esc(x.name)}</h1><p class="sub">${esc(range(x))}${x.location ? ' · ' + esc(x.location) : ''}</p>${badges(x)}
  </div>${credit(t)}</section>
  <div class="wrap detail">
   <div class="main">
    ${flyerCard(x)}
    <section class="panel"><h2 class="sec">Shoot details</h2><dl class="kv">
      <dt>When</dt><dd>${esc(range(x))}</dd>
      <dt>Where</dt><dd>${esc(x.location || '—')}${x.state && !(x.location || '').includes(' ' + x.state) ? ' · ' + esc(x.state) : ''}${x.country ? '<br><span class="note">' + esc(x.country) + '</span>' : ''}</dd>
      <dt>Discipline</dt><dd>${esc(x.discipline || '—')}</dd>
      <dt>Level</dt><dd>${esc(x.level || '—')}</dd>
      <dt>Organiser</dt><dd>${esc(x.org || '—')}${x.aba_branch ? '<br><span class="note">ABA ' + esc(x.aba_branch) + '</span>' : ''}</dd>
      ${x.rounds && x.rounds !== x.name && !x.name.includes(x.rounds) ? `<dt>Rounds</dt><dd>${esc(x.rounds)}</dd>` : ''}
      ${x.registration_opens ? `<dt>Entries open</dt><dd>${esc(x.registration_opens)}</dd>` : ''}
      ${closeTxt ? `<dt>Entries close</dt><dd>${esc(closeTxt)}${x.field_sources?.entry_close_date ? ` <span class="src">from ${esc(x.field_sources.entry_close_date)}</span>` : ''}</dd>` : ''}
      ${x.fee ? `<dt>Fee</dt><dd>${esc(x.fee)}${x.field_sources?.fee ? ` <span class="src">from ${esc(x.field_sources.fee)}</span>` : ''}</dd>` : ''}
    </dl>${x.notes ? `<p class="note">${esc(x.notes)}</p>` : ''}</section>
    ${on && !x.info_only ? `<section class="panel"><h2 class="sec">${en ? '✓ You are entered' : '☐ Mark as entered / paid'}</h2>
      <form id="entryForm">
        <div class="row"><div><label for="f_date">Date entered</label><input type="date" id="f_date" value="${esc(en?.date || iso(new Date()))}"></div>
        <div><label for="f_amt">Amount paid</label><input id="f_amt" inputmode="decimal" placeholder="e.g. 85" value="${esc(en?.amount || '')}"></div>
        <div style="flex:0 0 100px"><label for="f_cur">Currency</label><select id="f_cur">${['AUD','USD','NZD','GBP','EUR','CAD','JPY'].map(c => `<option ${((en?.currency) || (x.country_code === 'USA' ? 'USD' : 'AUD')) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
        <label for="f_ref">Receipt / entry number</label><input id="f_ref" value="${esc(en?.ref || '')}" placeholder="e.g. Assemble #12345">
        <label for="f_link">Link to receipt or confirmation email</label><input id="f_link" type="url" value="${esc(en?.link || '')}" placeholder="https://…">
        <label for="f_notes">Notes (division, target, camping…)</label><textarea id="f_notes" rows="2">${esc(en?.notes || '')}</textarea>
        <button class="btn block" type="submit">${en ? 'Update entry' : '✓ Save – I’ve entered and paid'}</button>
        ${en ? `<button class="btn alt block" type="button" id="unEnter">Undo – not entered</button>` : ''}
      </form></section>` : ''}
    <p class="note">Source: <a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(x.source_url)}</a>${x.also_listed ? ` · also <a href="${esc(x.also_listed)}" target="_blank" rel="noopener">World Archery listing</a>` : ''}<br>Checked ${esc(x.last_checked)}. Always confirm details with the organiser.</p>
   </div>
   <aside class="side">
    <section class="panel act">${closeTxt && !en && daysTo(x.entry_close_date) >= 0 ? `<p class="closes">⏳ Entries close<br><b>${esc(closeTxt)}</b></p>` : ''}
      ${regBtn}
      ${x.info_only ? '' : `<button class="btn ${on ? 'alt' : ''} block" id="saveBtn" aria-pressed="${on}">${on ? '★ In My shoots – remove' : '☆ Add to My shoots'}</button>`}
      ${x.start_date && !x.info_only ? `<button class="btn alt block" id="icsOne">▦ Add to my calendar (.ics)</button>` : ''}</section>
    ${adSlot('side', t)}
    ${clubCta(true)}
   </aside>
  </div>`;
}
function bindShoot(id){
  const sb = $('#saveBtn'); if (sb) sb.onclick = () => toggleSave(id);
  const f = $('#entryForm'); if (f) f.onsubmit = e => { e.preventDefault();
    S.entries[id] = {date: $('#f_date').value, amount: $('#f_amt').value.trim(), currency: $('#f_cur').value, ref: $('#f_ref').value.trim(), link: $('#f_link').value.trim(), notes: $('#f_notes').value.trim(), saved: new Date().toISOString()};
    save(); toast('✓ Saved – marked as entered'); render(); };
  const u = $('#unEnter'); if (u) u.onclick = () => { delete S.entries[id]; save(); toast('Marked as not entered'); render(); };
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
    const allPaid = ev.length && ev.every(x => S.entries[x.id]);
    g += `<div class="c ${ev.length ? 'has' : ''} ${allPaid ? 'paid' : ''} ${t ? 't' : ''}" ${ev.length ? `data-open="${esc(ev[0].id)}" role="link" tabindex="0" aria-label="${d} ${MONL[m]}: ${esc(ev.map(x => x.name).join(', '))}${allPaid ? ', entered' : ''}"` : ''}>${d}${ev.length ? `<span class="dot">${ev.length > 1 ? ev.length + ' shoots' : '●'}</span>` : ''}</div>`; }
  const inMonth = mine.filter(x => x.start_date && (x.start_date.slice(0, 7) === iso(first).slice(0, 7) || (x.end_date || '').slice(0, 7) === iso(first).slice(0, 7)));
  const up = mine.filter(x => !isPast(x)), past = mine.filter(isPast);
  return `${pageHead('My shoots', 'Your saved shoots, month by month.', 'target')}<div class="wrap narrow"><div class="calnav"><button id="pm" aria-label="Previous month">‹</button><b>${MONL[m]} ${y}</b><button id="nm" aria-label="Next month">›</button></div>
  <div class="grid">${g}</div>
  <div class="legend"><span class="b" style="background:var(--navy);color:#fff">■ shoot day</span><span class="b" style="background:var(--navy);color:var(--gold)">✓ entered</span><span class="b" style="outline:2px solid var(--navy)">□ today</span></div>
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
  const paid = ids.filter(id => S.entries[id]).map(id => BYID[id]), todo = ids.filter(id => !S.entries[id] && !isPast(BYID[id])).map(id => BYID[id]);
  const tot = {}; paid.forEach(x => { const e = S.entries[x.id]; const v = parseFloat(e.amount); if (!isNaN(v)) tot[e.currency] = (tot[e.currency] || 0) + v; });
  const row = x => { const e = S.entries[x.id]; return `<div class="card" data-open="${esc(x.id)}" role="link" tabindex="0" style="cursor:pointer"><b>${esc(x.name)}</b><div class="note">${esc(range(x))}</div>
    <div class="badges"><span class="b paid">✓ Entered ${esc(e.date || '')}</span>${e.amount ? `<span class="b paid">${esc(e.currency)} ${esc(e.amount)}</span>` : ''}${e.ref ? `<span class="b world"># ${esc(e.ref)}</span>` : ''}</div></div>`; };
  return `${pageHead('Entries &amp; payments', 'What you have entered, paid and still need to enter.', 'field')}<div class="wrap narrow"><div class="panel dark"><div class="kicker">Total entry fees recorded</div><div class="big">${Object.keys(tot).length ? Object.entries(tot).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(' + ') : '—'}</div></div>
  <h2>☐ Still to enter (${todo.length})</h2>${todo.length ? todo.sort((a,b)=>(a.entry_close_date||a.start_date||'9')<(b.entry_close_date||b.start_date||'9')?-1:1).map(evCard).join('') : '<p class="note">All your upcoming shoots are entered. 👍</p>'}
  <h2>✓ Entered &amp; paid (${paid.length})</h2>${paid.length ? paid.map(row).join('') : '<p class="note">Open a saved shoot and tap “I’ve entered and paid” to record it here.</p>'}</div>`;
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
  <h2>Backup</h2><p class="note">Your shoots and entries are stored only on this device.</p>
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
  $('#exp').onclick = () => dl(new Blob([JSON.stringify(S, null, 1)], {type:'application/json'}), 'archery-calendar-backup.json');
  $('#imp').onchange = async e => { try { S = Object.assign({}, DEFAULT, JSON.parse(await e.target.files[0].text())); save(); toast('Backup restored'); render(); } catch { toast('That file isn’t a valid backup'); } };
}

/* ---------- advertise & credits ---------- */
const CONTACT = 'nfshold@gmail.com';
const AD_MAIL = 'mailto:' + CONTACT + '?subject=Advertising%20on%20Archery%20Register';
function vAdvertise(){
  setTitle('Advertise with us');
  const n = photo('nathe');
  return `<section class="phead tall" style="--img:url('${esc(n.file)}')"><div class="wrap"><p class="kicker">For archery shops, ranges, coaches &amp; brands</p><h1>Advertise to archers</h1>
    <p>Put your shop in front of archers while they plan their next shoot and the gear they need for it.</p><a class="btn gold" href="${AD_MAIL}">Email us about advertising</a></div><span class="credit">Photo: ${esc(n.by)} (own photo)</span></section>
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
    <ul class="ticks"><li>No account, no sign-up. The shoots you save, your entries and payments, and your reminder settings are stored only in <b>your browser on this device</b> (localStorage). They are never sent to us.</li>
    <li>Clearing your browser data deletes them. Use <a href="#/settings">Settings → Export backup</a> to keep a copy or move to another device.</li>
    <li>No analytics, advertising or tracking cookies. Reminders are made on your device.</li>
    <li>"Register / enter" and email links go straight to the organiser. Anything you send them is between you and the organiser.</li>
    <li>The site is hosted on GitHub Pages, which keeps standard server logs (e.g. IP address) – see GitHub's privacy statement.</li></ul>
    <p class="note">Questions: <a href="mailto:${SITE.contact}">${SITE.contact}</a> (NFS Strategic Holdings).</p></section>
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
function fold(l){ let o = ''; while (l.length > 73) { o += l.slice(0, 73) + '\r\n '; l = l.slice(73); } return o + l; }
function downloadIcs(list, name){
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Archery Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:My archery shoots'];
  for (const x of list) {
    const e = S.entries[x.id], end = pd(x.end_date || x.start_date); end.setDate(end.getDate() + 1);
    const desc = [e ? `ENTERED & PAID${e.amount ? ' ' + e.currency + ' ' + e.amount : ''}${e.ref ? ' (#' + e.ref + ')' : ''}` : 'NOT ENTERED YET', x.discipline, x.registration_url ? 'Entry: ' + x.registration_url : '', 'Source: ' + x.source_url].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:${x.id}@archery-calendar`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${x.start_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${iso(end).replace(/-/g, '')}`,
      fold(`SUMMARY:${icsEsc((e ? '✓ ' : '') + x.name)}`), fold(`LOCATION:${icsEsc([x.location, x.country].filter(Boolean).join(', '))}`), fold(`DESCRIPTION:${icsEsc(desc)}`));
    if (x.registration_url || x.source_url) L.push(fold(`URL:${x.registration_url || x.source_url}`));
    for (const d of S.remindDays) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc(x.name)}`), `TRIGGER:-P${d}D`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  dl(new Blob([L.join('\r\n')], {type:'text/calendar'}), name + '.ics'); toast('Calendar file downloaded – open it to add');
}
function dl(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------- router ---------- */
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
  else { v.innerHTML = vHome();
    v.querySelectorAll('[data-th]').forEach(a => a.onclick = () => { BF.disc = {field:'Field','3d':'3D',target:'Target',indoor:'Indoor'}[a.dataset.th]; BF.scope = 'all'; });
    $('#heroSearch').onsubmit = e => { e.preventDefault(); BF.q = $('#hq').value; BF.scope = 'all'; location.hash = '#/browse'; }; }
  bindCards(v);
}
/* ---------- start ---------- */
boot().catch(e => { $('#view').innerHTML = `<div class="empty">Couldn't load shoot data (${esc(e.message)}). If you opened the file directly, run it from a web server.</div>`; });
