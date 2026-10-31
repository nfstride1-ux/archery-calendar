/* Near me: find clubs and events close to you.
   Privacy by design: the browser's location (or the postcode / suburb you type) is used ONLY inside this page to measure distances.
   It is never sent anywhere, never saved (not in localStorage, not in your account), and is forgotten when you close or reload the tab.
   Club coordinates come from data/club_coords.json (geocoded from real addresses in our data; clubs with no reliable location have none and are not listed).
   Typed places come from small bundled lists (GeoNames, CC BY 4.0) in data/geo/, so what you type is looked up on this device, not by a web service. */
(function(){
  const NM = {pt: null, label: '', approx: false, radius: 50, unit: '', country: '', choices: null, msg: '', busy: false, showEv: 15, loaded: null};
  const COUNTRIES = [['AU', 'Australia'], ['US', 'United States'], ['GB', 'United Kingdom'], ['NZ', 'New Zealand'], ['CA', 'Canada'], ['DK', 'Denmark'], ['MY', 'Malaysia'], ['KR', 'South Korea'], ['DE', 'Germany'], ['IE', 'Ireland'],
    ['FR', 'France'], ['IT', 'Italy'], ['ES', 'Spain'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'], ['AT', 'Austria'], ['JP', 'Japan'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['TR', 'Türkiye'], ['SG', 'Singapore'], ['TH', 'Thailand'],
    ['AE', 'United Arab Emirates'], ['SI', 'Slovenia'], ['SK', 'Slovakia'], ['HU', 'Hungary'], ['LU', 'Luxembourg'], ['CN', 'China'], ['CO', 'Colombia']];
  const MILES = ['US', 'GB'];
  const STATE_CODES = ['WA', 'SA', 'VIC', 'NSW', 'ACT', 'QLD', 'TAS', 'NT'];
  const KM_PER_MI = 1.609344;
  let prevHash = '';
  window.addEventListener('hashchange', e => { try { prevHash = new URL(e.oldURL).hash || ''; } catch { prevHash = ''; } });
  const dat = {};
  const getJson = (k, url) => dat[k] || (dat[k] = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); }).catch(e => { delete dat[k]; throw e; }));
  const fold = s => norm(s).replace(/aa/g, 'a');
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function homeIso(){
    try { const c = typeof homeCode === 'function' ? homeCode() : 'AUS'; if (c === 'AUS') return 'AU'; const i = typeof iIso === 'function' && iIso(c); if (i) return i; } catch {}
    return 'AU';
  }
  function setup(){
    if (!NM.cTouched) NM.country = COUNTRIES.some(c => c[0] === homeIso()) ? homeIso() : 'AU';   // follows the site's country until the user picks one
    let u = ''; try { u = localStorage.getItem('archcal.nmunit') || ''; } catch {}
    if (u === 'km' || u === 'mi') NM.unit = u; else if (!NM.uTouched) NM.unit = MILES.includes(NM.country) ? 'mi' : 'km';
  }
  /* ---- maths ---- */
  const rad = d => d * Math.PI / 180;
  function haversineKm(a, b){   // great-circle distance, mean Earth radius 6371.0088 km
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const toUnit = km => NM.unit === 'mi' ? km / KM_PER_MI : km;
  const unitWord = () => NM.unit === 'mi' ? 'miles' : 'km';
  const unitShort = () => NM.unit === 'mi' ? 'mi' : 'km';
  function distTxt(km, approx){
    const d = toUnit(km);
    const n = d < 1 ? 'under 1' : d < 10 ? d.toFixed(1).replace(/\.0$/, '') : String(Math.round(d));
    return (approx && d >= 1 ? 'about ' : '') + n + ' ' + unitShort();
  }
  /* ---- data ---- */
  async function loadAll(){
    if (NM.loaded) return NM.loaded;
    NM.loaded = getJson('coords', 'data/club_coords.json').catch(() => ({clubs: {}, places: {}}));
    return NM.loaded;
  }
  const inAus = p => p.lat < -9 && p.lat > -45 && p.lng > 111 && p.lng < 155;
  function evCoord(x, K){
    const p = x.location && K.places[x.location];
    if (p) return p;
    const c = x.club_id && K.clubs[x.club_id];
    return c || null;
  }
  const dateOk = x => x.start_date && !x.info_only && !x.cancelled && x.status !== 'cancelled';
  const upcoming = x => dateOk(x) && daysTo(x.end_date || x.start_date) >= 0;
  const sortDate = (a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0);
  function discOf(id){
    const set = [];
    EV.filter(x => x.club_id === id && typeof isShoot === 'function' && isShoot(x)).forEach(x => { const t = theme(x); const n = THEMES[t] && t !== 'mixed' ? THEMES[t][1] : ''; if (n && !set.includes(n)) set.push(n); });
    return set;
  }
  const ORGN = {aa: 'Archery Australia', awa: 'Archery WA', aba: 'ABA', taa: 'TAA'};
  /* ---- compute ---- */
  async function compute(){
    const K = await loadAll(), pt = NM.pt, rKm = NM.radius * (NM.unit === 'mi' ? KM_PER_MI : 1);
    const all = [];
    for (const c of (CLUBS || [])) { const k = K.clubs[c.id]; if (k) all.push({c, k, km: haversineKm(pt, k)}); }
    all.sort((a, b) => a.km - b.km);
    const clubs = all.filter(r => r.km <= rKm);
    let evs = EV.filter(x => upcoming(x));
    if (!inAus(pt)) { try { const j = await loadIntl(); evs = evs.concat(j.events.filter(x => upcoming(x))); } catch {} }
    const seen = new Set(), near = [];
    for (const x of evs) { if (seen.has(x.id)) continue; seen.add(x.id); const k = evCoord(x, K); if (!k) continue; const km = haversineKm(pt, k); if (km <= rKm) near.push({x, k, km}); }
    near.sort((a, b) => sortDate(a.x, b.x) || a.km - b.km);
    return {clubs, nearestAll: all[0] || null, near, nClubs: all.length};
  }
  /* ---- view ---- */
  function nextOf(id){ return EV.filter(x => x.club_id === id && upcoming(x)).sort(sortDate); }
  function clubCard(r){
    const c = r.c, ups = nextOf(c.id), nx = ups.find(x => typeof catOf === 'function' ? catOf(x) !== 'come_try' : true) || ups[0], ct = ups.find(x => x.category === 'come_try');
    const disc = discOf(c.id), orgs = (c.orgs || []).map(o => ORGN[o]).filter(Boolean);
    const meta = [c.state, disc.join(', '), orgs.join(' / ')].filter(Boolean).join(' · ');
    const d = toUnit(r.km), dn = d < 1 ? '&lt;1' : d < 10 ? esc(d.toFixed(1).replace(/\.0$/, '')) : String(Math.round(d));
    return `<article class="nm-card">
      <div class="nm-dist" aria-label="${esc(distTxt(r.km, r.k.p === 't'))} away"><b>${dn}</b><span>${unitShort()}</span>${r.k.p === 't' ? '<small>approx.</small>' : ''}</div>
      <div class="nm-body"><h3><a href="#/club/${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3>
        <p class="nm-meta">${esc(meta || 'Archery club')}</p>
        ${nx ? `<p class="nm-next"><span class="nm-k">Next event</span> <a href="#/shoot/${encodeURIComponent(nx.id)}">${esc(range(nx))}: ${esc(nx.name)}</a></p>` : '<p class="nm-next nm-none">No upcoming event listed yet</p>'}
        ${ct ? `<p class="nm-next"><span class="nm-k nm-ct">Come &amp; try</span> <a href="#/shoot/${encodeURIComponent(ct.id)}">${esc(range(ct))}: ${esc(ct.name)}</a></p>` : ''}
      </div></article>`;
  }
  function evRow(r){
    const x = r.x, where = (x._intl ? (x.country_name || x.country) : x.state) || '';   // state or country only: never the venue's street address
    return `<li class="nm-ev"><div class="nm-evd"><b>${esc(distTxt(r.km, r.k.p === 't'))}</b></div><div class="nm-evb"><a href="#/shoot/${encodeURIComponent(x.id)}">${esc(x.name)}</a><span class="nm-meta">${esc(range(x))}${where ? ' · ' + esc(where) : ''}</span></div></li>`;
  }
  function radiusChips(){ return [25, 50, 100].map(r => `<button type="button" class="chip" data-nmr="${r}" aria-pressed="${NM.radius === r}">${r} ${unitShort()}</button>`).join(''); }
  function resultsHtml(R){
    if (!R) return '';
    const cName = (COUNTRIES.find(c => c[0] === NM.country) || [])[1] || 'this country';
    const radTxt = NM.radius + ' ' + unitWord();
    let h = `<h2 class="sec">${esc(NM.label)}</h2><p class="note">Straight-line distances from ${NM.approx ? 'the middle of the place you typed' : 'your location'}. “About” means we only know the town or suburb, not the exact gate.</p>`;
    h += `<h3 class="nm-h">Clubs within ${esc(radTxt)} <span class="nm-n">${R.clubs.length}</span></h3>`;
    if (R.clubs.length) h += `<div class="nm-list">${R.clubs.slice(0, 30).map(clubCard).join('')}</div>${R.clubs.length > 30 ? `<p class="note">Showing the nearest 30.</p>` : ''}`;
    else {
      const n = R.nearestAll, nKm = n && toUnit(n.km);
      if (n && nKm <= (NM.unit === 'mi' ? 400 : 600)) h += `<p class="nm-empty">No clubs we know of within ${esc(radTxt)}. The nearest is <a href="#/club/${encodeURIComponent(n.c.id)}">${esc(n.c.name)}</a>, ${esc(distTxt(n.km, n.k.p === 't'))} away. Try a bigger radius above.</p>`;
      else h += `<p class="nm-empty">We don’t have a club list for this area yet, so no clubs to show. Events close to you are below. Know a club near you? <a href="#/submit">Tell us</a> and we’ll add it.</p>`;
    }
    h += `<h3 class="nm-h">Upcoming events within ${esc(radTxt)} <span class="nm-n">${R.near.length}</span></h3>`;
    if (R.near.length) h += `<ul class="nm-evs">${R.near.slice(0, NM.showEv).map(evRow).join('')}</ul>${R.near.length > NM.showEv ? `<p><button type="button" class="btn alt" id="nmMore">Show more events (${R.near.length - NM.showEv} more)</button></p>` : ''}`;
    else h += `<p class="nm-empty">No dated events within ${esc(radTxt)} right now. Try a bigger radius, or see <a href="#/browse">all events</a>.</p>`;
    h += `<p class="note">${R.nClubs} clubs on the calendar have a known location. Clubs and events without a reliable location are left out rather than guessed.</p>`;
    return h;
  }
  function selfCard(){
    const cOpts = COUNTRIES.map(([k, n]) => `<option value="${k}"${k === NM.country ? ' selected' : ''}>${esc(n)}</option>`).join('');
    return `<section class="panel nm-panel" aria-labelledby="nmH">
      <h2 class="sec" id="nmH">Find clubs near me</h2>
      <button type="button" class="btn gold nm-go" id="nmGeo"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>Find clubs near me</button>
      <p class="nm-priv"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm0 11h7c-.5 4.1-3.2 7.8-7 9V12H5V6.3l7-3.1V12z"/></svg><span>Your location stays on your phone. We don’t store it.</span></p>
      <div class="nm-or"><span>or type a suburb or postcode</span></div>
      <form id="nmForm" data-clarity-mask="true" class="nm-form" role="search" novalidate>
        <div class="nm-f1"><label for="nmQ">Suburb, town or postcode</label><input id="nmQ" type="search" inputmode="text" autocomplete="off" placeholder="e.g. Mandurah, 6210, or Phoenix AZ" value=""></div>
        <div class="nm-f2"><label for="nmC">Country</label><select id="nmC">${cOpts}</select></div>
        <button type="submit" class="btn nm-find">Search</button>
      </form>
      <div class="nm-opts"><div class="nm-og" role="group" aria-label="Search radius"><span class="nm-ol">Within</span><span id="nmRad">${radiusChips()}</span></div>
        <div class="nm-og" role="group" aria-label="Distance units"><span class="nm-ol">Units</span><button type="button" class="chip" data-nmu="km" aria-pressed="${NM.unit === 'km'}">km</button><button type="button" class="chip" data-nmu="mi" aria-pressed="${NM.unit === 'mi'}">miles</button></div></div>
      <div id="nmMsg" class="nm-msg" role="status" aria-live="polite">${NM.msg ? NM.msg : ''}</div>
      <div id="nmChoices">${choicesHtml()}</div>
    </section>`;
  }
  function choicesHtml(){
    if (!NM.choices) return '';
    return `<div class="nm-choices"><p><b>Which one did you mean?</b></p>${NM.choices.map((c, i) => `<button type="button" class="chip" data-nmch="${i}">${esc(c.label)}</button>`).join(' ')}</div>`;
  }
  window.nmView = function(){
    setup(); setTitle('Clubs near me');
    return `${pageHead('Clubs near me', 'Find archery clubs and events close to you.', 'mixed')}<div class="wrap narrow nm-wrap">
      <p class="nm-back"><a class="btn alt" href="#/home" id="nmBack">← Back</a></p>
      ${selfCard()}
      <div id="nmOut" class="nm-out" aria-live="polite"></div>
      <p class="note nm-src">Club locations come from the addresses clubs and organisers publish, placed on OpenStreetMap (© OpenStreetMap contributors, ODbL). Suburb and postcode lists are from GeoNames (CC BY 4.0). <a href="#/privacy">Privacy</a></p>
    </div>`;
  };
  async function showResults(first){
    const out = $('#nmOut'); if (!out) return;
    out.innerHTML = '<p class="loading">Finding clubs…</p>';
    try { const R = await compute(); if ($('#nmOut') === out) { out.innerHTML = resultsHtml(R); if (first && out.scrollIntoView) out.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); } bindResults(); }
    catch (e) { out.innerHTML = '<p class="nm-empty">Something went wrong working out the distances. Please try again.</p>'; }
  }
  function bindResults(){ const m = $('#nmMore'); if (m) m.onclick = () => { NM.showEv += 30; showResults(); }; }
  function setMsg(t, kind){ NM.msg = t ? `<p class="nm-m ${kind || ''}">${t}</p>` : ''; const m = $('#nmMsg'); if (m) { m.innerHTML = NM.msg; if (kind === 'warn' && m.scrollIntoView) m.scrollIntoView({block: 'nearest'}); } }
  function usePoint(pt, label, approx){ NM.pt = {lat: pt.lat, lng: pt.lng}; NM.label = label; NM.approx = !!approx; NM.choices = null; NM.showEv = 15; const c = $('#nmChoices'); if (c) c.innerHTML = ''; showResults(true); }
  function geo(){
    if (!navigator.geolocation) { setMsg('Your browser can’t share its location. Type a suburb or postcode below instead.', 'warn'); return; }
    const b = $('#nmGeo'); if (b) b.disabled = true; setMsg('Asking your browser for your location… (it never leaves your phone)');
    navigator.geolocation.getCurrentPosition(p => {
      if (b) b.disabled = false; setMsg('');
      usePoint({lat: p.coords.latitude, lng: p.coords.longitude}, 'Near your location', false);
    }, err => {
      if (b) b.disabled = false;
      if (err && err.code === 1) setMsg('Location is turned off for this site, so we can’t see where you are. That’s fine: type a suburb or postcode below, or allow location for this site in your browser settings and tap the button again.', 'warn');
      else if (err && err.code === 3) setMsg('Finding your location took too long. Try again, or type a suburb or postcode below.', 'warn');
      else setMsg('Your phone couldn’t work out your location just now. Type a suburb or postcode below instead.', 'warn');
    }, {enableHighAccuracy: false, timeout: 15000, maximumAge: 300000});
  }
  /* ---- typed place lookup (bundled lists, nothing leaves the device) ---- */
  async function lookup(raw, cc){
    const q = String(raw || '').trim(); if (!q) return {err: 'Type a suburb, town or postcode first.'};
    if (cc === 'AU') {
      const A = await getJson('au', 'data/geo/AU.json');
      const m = q.match(/\b(\d{4})\b/);
      if (m) { const p = A.pc[m[1]]; if (!p) return {err: 'We don’t recognise the postcode ' + esc(m[1]) + '. Check it, or type the suburb instead.'}; const nm = A.pl.find(r => r[2] === m[1]);   // used only for the state in the heading
        return {pt: {lat: p[0], lng: p[1]}, label: 'Near postcode ' + m[1] + (nm ? ' (' + nm[1] + ')' : '')}; }
      let words = norm(q).split(' '), st = '';
      const last = words[words.length - 1]; if (words.length > 1 && STATE_CODES.map(s => s.toLowerCase()).includes(last)) { st = last.toUpperCase(); words.pop(); }
      const name = words.join(' ');
      const rows = A.pl.filter(r => (!st || r[1] === st));
      let hits = rows.filter(r => norm(r[0]) === name);
      if (!hits.length) hits = rows.filter(r => norm(r[0]).startsWith(name) && name.length >= 3);
      const groups = new Map(); hits.forEach(r => { const k = r[0] + '|' + r[1]; const g = groups.get(k) || {name: r[0], st: r[1], pcs: new Set(), la: 0, ln: 0, n: 0}; g.pcs.add(r[2]); g.la += r[3]; g.ln += r[4]; g.n++; groups.set(k, g); });
      const list = [...groups.values()].map(g => ({pt: {lat: g.la / g.n, lng: g.ln / g.n}, label: 'Near ' + g.name + ' ' + g.st, choice: g.name + ' ' + g.st + ' ' + [...g.pcs].sort()[0]})).sort((a, b) => a.choice.localeCompare(b.choice));
      if (!list.length) return {err: 'We couldn’t find “' + esc(q) + '”. Try the postcode, or a nearby bigger town.'};
      return list.length === 1 ? list[0] : {choices: list.slice(0, 8).map(l => ({label: l.choice, pt: l.pt, text: l.label}))};
    }
    const U = q.toUpperCase();
    if (cc === 'US') { const m = U.match(/\b(\d{5})(-\d{4})?\b/); if (m) { const Z = (await getJson('us', 'data/geo/US.json')).zip[m[1]]; return Z ? {pt: {lat: Z[0], lng: Z[1]}, label: 'Near ZIP code ' + m[1]} : {err: 'We don’t recognise the ZIP code ' + esc(m[1]) + '.'}; } }
    const W = await getJson('world', 'data/geo/world.json');
    let key = '';
    if (cc === 'GB') { const m = U.replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})?$/); if (m) key = m[1]; }
    else if (cc === 'CA') { const m = U.replace(/\s+/g, '').match(/^([A-Z]\d[A-Z])(\d[A-Z]\d)?$/); if (m) key = m[1]; }
    else if (cc === 'NZ' || cc === 'DK') { const m = U.match(/^\d{4}$/); if (m) key = m[0]; }
    if (key) { const Z = (W.zip[cc] || {})[key]; return Z ? {pt: {lat: Z[0], lng: Z[1]}, label: 'Near postcode ' + (cc === 'GB' || cc === 'CA' ? key + ' area' : key)} : {err: 'We don’t recognise that postcode. Try the town name instead.'}; }
    let words = fold(q).split(' '), st = '';
    if (cc === 'US' && words.length > 1) { const l = words[words.length - 1].toUpperCase(); const full = Object.keys(US_ST).find(k => norm(US_ST[k]) === words.slice(-2).join(' ') || norm(US_ST[k]) === words[words.length - 1]);
      if (US_ST[l] && l.length === 2) { st = l; words.pop(); } else if (full) { st = full; words = words.slice(0, words.length - (norm(US_ST[full]).split(' ').length)); } }
    const name = words.join(' ');
    let hits = W.cities.filter(c => c[2] === cc && (!st || c[3] === st) && (fold(c[0]) === name || fold(c[1]) === name));
    if (!hits.length && name.length >= 3) hits = W.cities.filter(c => c[2] === cc && (!st || c[3] === st) && (fold(c[0]).startsWith(name) || fold(c[1]).startsWith(name)));
    if (!hits.length) return {err: 'We couldn’t find “' + esc(q) + '” in ' + esc((COUNTRIES.find(c => c[0] === cc) || [])[1] || 'that country') + '. Try a nearby bigger town' + (cc === 'US' ? ', or a ZIP code' : cc === 'AU' ? '' : ' or a postcode') + '.'};
    hits.sort((a, b) => b[6] - a[6]);
    const list = hits.slice(0, 8).map(c => ({label: c[0] + (c[3] ? ' ' + c[3] : ''), pt: {lat: c[4], lng: c[5]}, text: 'Near ' + c[0] + (c[3] ? ' ' + c[3] : '')}));
    return list.length === 1 ? {pt: list[0].pt, label: list[0].text} : {choices: list};
  }
  async function typed(){
    const q = $('#nmQ').value, cc = $('#nmC').value; NM.country = cc; NM.cTouched = true;
    setMsg('Looking that up…'); const out = $('#nmOut'); if (out) out.innerHTML = '';
    let r; try { r = await lookup(q, cc); } catch (e) { setMsg('We couldn’t load the place list. Check your connection, or use the Find clubs near me button.', 'warn'); return; }
    if (r.err) { setMsg(r.err, 'warn'); NM.choices = null; const c = $('#nmChoices'); if (c) c.innerHTML = ''; return; }
    if (r.choices) { setMsg(''); NM.choices = r.choices; $('#nmChoices').innerHTML = choicesHtml(); bindChoices(); return; }
    setMsg(''); usePoint(r.pt, r.label, true);
  }
  function bindChoices(){ document.querySelectorAll('[data-nmch]').forEach(b => b.onclick = () => { const c = NM.choices[+b.dataset.nmch]; usePoint(c.pt, c.text || 'Near ' + c.label, true); }); }
  window.nmBind = function(){
    const geoB = $('#nmGeo'); if (geoB) geoB.onclick = geo;
    const f = $('#nmForm'); if (f) f.onsubmit = e => { e.preventDefault(); typed(); };
    const c = $('#nmC'); if (c) c.onchange = () => { NM.country = c.value; NM.cTouched = true; let u = ''; try { u = localStorage.getItem('archcal.nmunit') || ''; } catch {} if (!u && !NM.uTouched) { NM.unit = MILES.includes(NM.country) ? 'mi' : 'km'; refreshOpts(); } };
    document.querySelectorAll('[data-nmr]').forEach(b => b.onclick = () => { NM.radius = +b.dataset.nmr; refreshOpts(); if (NM.pt) showResults(); });
    document.querySelectorAll('[data-nmu]').forEach(b => b.onclick = () => { NM.unit = b.dataset.nmu; NM.uTouched = true; try { localStorage.setItem('archcal.nmunit', NM.unit); } catch {} refreshOpts(); if (NM.pt) showResults(); });
    const bk = $('#nmBack'); if (bk) bk.onclick = e => { e.preventDefault(); if (prevHash && !/^#\/near/.test(prevHash) && history.length > 1) history.back(); else location.hash = '#/home'; };
    bindChoices();
    if (NM.pt) showResults();
  };
  function refreshOpts(){
    const r = $('#nmRad'); if (r) { r.innerHTML = radiusChips(); r.querySelectorAll('[data-nmr]').forEach(b => b.onclick = () => { NM.radius = +b.dataset.nmr; refreshOpts(); if (NM.pt) showResults(); }); }
    document.querySelectorAll('[data-nmu]').forEach(b => b.setAttribute('aria-pressed', String(NM.unit === b.dataset.nmu)));
  }
  window.nmTest = {haversineKm, NM};   // read by the automated tests only
})();
