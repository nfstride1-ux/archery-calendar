/* Search everywhere (#/search?q=…): one free-text search over every country and every source at once.
   Searches data/events.json (Australia), data/intl.json (all other countries), live club submissions and club-API events (they are merged into
   those lists by app.js), the club directory (data/clubs.json) and the organisations (Archery Australia, ABA, Archery WA, TAA, USA Archery, NFAA, ASA, IBO, TAC…).
   It matches event names, clubs, organisations, venues, towns, states (names and codes) and countries (names and 2-letter codes), and is never narrowed
   by the country you have selected or by your Settings. Results are grouped by country; a term that fits more than one place (e.g. WA = Western Australia
   and Washington) shows both groups. One clear match (an exact organisation, club or event name, or a single hit overall) opens its page directly. */
(function(){
  const GS = {q: '', limit: 30, more: {}, past: false};
  const STOP = new Set(['the', 'a', 'an', 'in', 'of', 'at', 'and', 'near']);
  const AU_ORG_ALIAS = {'archery-australia': ['aa', 'archery australia', 'archery aus', 'australian archery'], 'archery-wa': ['awa', 'archery wa', 'archery western australia', 'archerywa'], aba: ['aba', 'australian bowhunters association', 'bowhunters australia'], taa: ['taa', 'traditional archery australia']};
  const AU_ORG_GRP = {'archery-australia': 'aa', 'archery-wa': 'awa', aba: 'aba', taa: 'taa'};
  const CTRY_ALIAS = {AUS: 'australia aus au oz aussie', USA: 'united states usa us america', DEN: 'denmark danmark dk', NZL: 'new zealand nz kiwi aotearoa', GBR: 'great britain united kingdom uk gb britain england scotland wales', CAN: 'canada ca', MAS: 'malaysia my', KOR: 'south korea korea kr', DEU: 'germany deutschland de', GER: 'germany deutschland de', FRA: 'france fr', NED: 'netherlands holland nl', NLD: 'netherlands holland nl', TUR: 'turkey turkiye tr', JPN: 'japan jp', CHN: 'china cn', SUI: 'switzerland ch', CHE: 'switzerland ch', ITA: 'italy it', ESP: 'spain es', BEL: 'belgium be', BRA: 'brazil br', MEX: 'mexico mx', THA: 'thailand th', SIN: 'singapore sg', SGP: 'singapore sg', UAE: 'united arab emirates uae ae', ARE: 'united arab emirates uae ae', SLO: 'slovenia si', SVN: 'slovenia si', HUN: 'hungary hu', LUX: 'luxembourg lu', COL: 'colombia co', IRQ: 'iraq iq', SEN: 'senegal sn'};
  const hasUS = () => typeof US_ST !== 'undefined';
  const words = t => snorm(t).split(' ').filter(Boolean);
  const mkHay = parts => { const s = snorm(parts.filter(Boolean).join(' ')); return {s: ' ' + s + ' ', w: [...new Set(s.split(' '))]}; };
  const strictHit = (w, H) => H.s.includes(' ' + w + ' ') || (w.length >= 3 && H.w.some(h => h.startsWith(w)));
  const hit = (w, H, fuzzy) => fuzzy ? wordHit1(w, H) : strictHit(w, H);
  function evHay(x){
    if (x._gs) return x._gs;
    const cc = x.country_code || (x._intl ? '' : 'AUS'), us = cc === 'USA', au = cc === 'AUS';
    const sc = us ? (x.us_state || x.state_code || x.state) : (x.state_code || x.state);
    const stName = us ? (hasUS() && US_ST[sc]) : au ? (STATES.find(z => z[0] === sc) || [])[1] : '';
    const cb = (typeof CLUB !== 'undefined' && CLUB[x.club_id]) || null;
    return x._gs = mkHay([x.name, x.club_name, x.host, x.org, x.source_name, cb && cb.name, ...(cb ? cb.aliases || [] : []), x.location, x.discipline, sc, stName, au && sc && CAPITAL[sc],
      x.country_name, x.country, x.iso2, cc, CTRY_ALIAS[cc], x.us_org, us && typeof US_ORG_WORDS !== 'undefined' ? US_ORG_WORDS[x.us_org] : '', typeof acroTxt === 'function' ? acroTxt(x) : '']);
  }
  function clubHay(c){
    if (c._gs) return c._gs;
    const cc = c.country || 'AUS', stName = cc === 'AUS' ? (STATES.find(z => z[0] === c.state) || [])[1] : '';
    return c._gs = mkHay([c.name, ...(c.aliases || []), c.suburb, c.address, c.state, stName, c.country_name || (cc === 'AUS' ? 'Australia' : ''), CTRY_ALIAS[cc]]);
  }
  function orgList(){
    const out = [];
    (typeof ORGS !== 'undefined' ? ORGS : []).forEach(o => { const g = AU_ORG_GRP[o.id]; if (!g) return;   // branches are reached through ABA
      out.push({id: o.id, name: o.name.replace(/\s*\(.*\)/, ''), names: [o.id, o.name, ...AU_ORG_ALIAS[o.id]], hay: mkHay([o.name, ...AU_ORG_ALIAS[o.id]]), where: 'Australia', go: () => { Object.assign(BF, {scope: 'g:' + g, q: '', disc: '', cat: '', ost: '', state: '', club: '', clubId: '', day: '', past: false, limit: 60}); return '#/browse'; }}); });
    (typeof US_ORGS !== 'undefined' ? US_ORGS : []).forEach(([k, label]) => { if (k === 'world') return; const w = (typeof US_ORG_WORDS !== 'undefined' && US_ORG_WORDS[k]) || '';
      out.push({id: 'us-' + k, name: label, names: [k, label], hay: mkHay([label, w]), where: 'United States', go: () => { Object.assign(IF, {code: 'USA', q: '', disc: '', org: k, st: '', ctry: '', major: false, cat: '', past: false, limit: 60}); return '#/intl/USA'; }}); });
    return out;
  }
  const allEvents = () => { const seen = new Set(), out = []; [...(typeof EV !== 'undefined' ? EV : []), ...(typeof INTL !== 'undefined' && INTL ? INTL.events : [])].forEach(x => { if (x && x.id && !seen.has(x.id)) { seen.add(x.id); out.push(x); } }); return out; };
  const isFin = x => x._intl ? iPast(x) : isPast(x);
  const cName = x => (x.country_code === 'AUS' || (!x.country_code && !x._intl)) ? 'Australia' : (x.country_name || x.country || x.country_code || 'Other');
  function run(q){
    let ws = words(q); const real = ws.filter(w => !STOP.has(w)); if (real.length) ws = real;
    const qn = ws.join(' '); if (!qn) return null;
    const find = fuzzy => { const m = H => ws.every(w => hit(w, H, fuzzy));
      return {ev: allEvents().filter(x => m(evHay(x))), clubs: (typeof CLUBS !== 'undefined' ? CLUBS : []).filter(c => m(clubHay(c))), orgs: orgList().filter(o => m(o.hay))}; };
    let r = find(false), fuzzy = false;
    if (!r.ev.length && !r.clubs.length && !r.orgs.length) { r = find(true); fuzzy = true; }
    const up = r.ev.filter(x => !isFin(x)), fin = r.ev.filter(isFin), showPast = !up.length && fin.length;
    const evs = (showPast ? fin : up).sort((a, b) => (a.start_date || '9') < (b.start_date || '9') ? -1 : 1);
    // clear single match: one exact organisation / club / event name, or one hit overall
    const exact = [...r.orgs.filter(o => o.names.some(n => snorm(n) === qn)).map(o => ({t: 'org', o})), ...r.clubs.filter(c => [c.name, ...(c.aliases || [])].some(n => snorm(n) === qn)).map(c => ({t: 'club', c})), ...evs.filter(x => snorm(x.name) === qn).map(x => ({t: 'ev', x}))];
    let one = exact.length === 1 ? exact[0] : null;
    if (!one && evs.length + r.clubs.length + r.orgs.length === 1) one = r.orgs[0] ? {t: 'org', o: r.orgs[0]} : r.clubs[0] ? {t: 'club', c: r.clubs[0]} : {t: 'ev', x: evs[0]};
    return {q, qn, evs, finList: fin.sort((a, b) => (a.start_date || '') < (b.start_date || '') ? 1 : -1), clubs: r.clubs, orgs: r.orgs, one, showPast, fin: fin.length, fuzzy};
  }
  function target(one){
    if (one.t === 'org') return one.o.go();
    if (one.t === 'club') return '#/club/' + encodeURIComponent(one.c.id);
    return '#/shoot/' + encodeURIComponent(one.x.id);
  }
  const where = x => [hasUS() && x.country_code === 'USA' && (x.us_state || x.state_code) && US_ST[x.us_state || x.state_code], x.country_code === 'AUS' || !x._intl && !x.country_code ? x.state_code : '', cName(x)].filter(Boolean).join(', ');
  function resultsHtml(R){
    if (!R) return '<p class="note">Type a club, event, venue, town, state, country or organisation.</p>';
    const n = R.evs.length + R.clubs.length + R.orgs.length;
    if (!n) return `<div class="empty">Nothing matches “${esc(R.q.trim())}”. Check the spelling, or try a town, state or country. Can’t find your club or shoot? <a href="#/submit">Tell us</a>.</div>`;
    const grp = {}; R.evs.forEach(x => (grp[cName(x)] = grp[cName(x)] || []).push(x));
    const home = typeof homeCode === 'function' && homeCode() !== 'AUS' ? ((ICTRY.countries.find(c => c.code === homeCode()) || {}).name || '') : 'Australia';
    const names = Object.keys(grp).sort((a, b) => (b === home) - (a === home) || grp[b].length - grp[a].length || (a < b ? -1 : 1));
    let h = `<p class="qcount" id="gsCount" aria-live="polite">${R.evs.length} event${R.evs.length === 1 ? '' : 's'}${R.clubs.length ? `, ${R.clubs.length} club${R.clubs.length === 1 ? '' : 's'}` : ''}${R.orgs.length ? `, ${R.orgs.length} organisation${R.orgs.length === 1 ? '' : 's'}` : ''} match “${esc(R.q.trim())}” in ${names.length > 1 ? 'every country' : 'all countries'}${names.length > 1 ? ` (${names.length} countries)` : ''}.</p>`;
    if (R.orgs.length) h += `<h2 class="sec-h">Organisations</h2><ul class="gs-list">${R.orgs.map((o, i) => `<li><a href="#/browse" data-gso="${i}"><b>${esc(o.name)}</b> <span class="note">${esc(o.where)}</span></a></li>`).join('')}</ul>`;
    if (R.clubs.length) h += `<h2 class="sec-h">Clubs</h2><ul class="gs-list">${R.clubs.slice(0, 40).map(c => `<li><a href="#/club/${esc(encodeURIComponent(c.id))}"><b>${esc(c.name)}</b> <span class="note">${esc([c.suburb, c.state, c.country_name || (c.country ? '' : 'Australia')].filter(Boolean).join(', '))}${c.n_events ? ` · ${c.n_events} event${c.n_events === 1 ? '' : 's'}` : ''}</span></a></li>`).join('')}</ul>${R.clubs.length > 40 ? `<p class="note">${R.clubs.length - 40} more clubs: add a word to narrow it down.</p>` : ''}`;
    const og = {}; R.evs.forEach(x => { const k = x.club_name || x.host || x.source_name || x.org; if (k && !R.orgs.some(o => snorm(o.name) === snorm(k)) && !R.clubs.some(c => snorm(c.name) === snorm(k))) { const o = og[k] = og[k] || {n: 0, c: cName(x)}; o.n++; } });
    const ok = Object.keys(og).sort((a, b) => og[b].n - og[a].n).slice(0, 14);
    if (ok.length > 1 || (ok.length === 1 && R.evs.length > 1)) h += `<h2 class="sec-h">Clubs and organisers in these results</h2><div class="chips">${ok.map(k => `<a class="chip" href="#/search?q=${esc(encodeURIComponent(k))}">${esc(k)} <small>${og[k].n}</small></a>`).join('')}</div>`;
    if (R.showPast) h += `<p class="note" id="pastNote">◷ Nothing upcoming matches. Showing ${R.fin} finished event${R.fin === 1 ? '' : 's'}.</p>`;
    names.forEach(c => { const l = grp[c], lim = GS.more[c] || GS.limit;
      h += `<h2 class="sec-h gs-ctry">${esc(c)} <small>${l.length} event${l.length === 1 ? '' : 's'}</small></h2><div class="results">${l.slice(0, lim).map(evCard).join('')}</div>${l.length > lim ? `<button class="btn alt more" data-gsmore="${esc(c)}">Show more (${l.length - lim} left)</button>` : ''}`; });
    if (!R.showPast && R.fin) { if (GS.past) { const fg = {}; R.finList.forEach(x => (fg[cName(x)] = fg[cName(x)] || []).push(x));
        h += `<h2 class="sec-h">Finished events <small class="note">${R.fin}</small></h2>` + Object.keys(fg).sort((a, b) => fg[b].length - fg[a].length).map(c => { const l = fg[c], lim = GS.more['p' + c] || 12; return `<h3 class="gs-ctry">${esc(c)} <small>${l.length}</small></h3><div class="results">${l.slice(0, lim).map(evCard).join('')}</div>${l.length > lim ? `<button class="btn alt more" data-gsmore="p${esc(c)}">Show more (${l.length - lim} left)</button>` : ''}`; }).join('') + '<button class="btn alt more" data-gspast="0">Hide finished events</button>'; }
      else h += `<button class="btn alt more" data-gspast="1">Show ${R.fin} finished event${R.fin === 1 ? '' : 's'}</button>`; }
    if (R.fuzzy) h += '<p class="note">Showing close spellings, as nothing matched exactly.</p>';
    return h;
  }
  const ready = () => { const t = new Promise(r => setTimeout(r, 4000)); return Promise.race([Promise.all([typeof loadIntl === 'function' ? loadIntl().catch(() => {}) : 0, window.LIVEP || 0]), t]); };
  window.gsGo = function(q){
    const h = '#/search?q=' + encodeURIComponent(String(q || '').trim());
    if (!String(q || '').trim()) { location.hash = '#/search'; return; }
    if (location.hash === h) { if (typeof render === 'function') render(); } else location.hash = h;
  };
  window.gsView = function(q){
    GS.q = q || ''; setTitle(q ? `Search: ${q}` : 'Search');
    return `${pageHead('Search everywhere', 'Every country, club, venue and event in one search. It is not limited to the country you have selected.')}<div class="wrap">
      <form class="hero-search gs-form" id="gsForm" role="search"><input type="search" id="gsq" value="${esc(GS.q)}" placeholder="Club, event, venue, town, state, country…" aria-label="Search every country" autocomplete="off" enterkeyhint="search"><button class="btn gold" type="submit">Search</button></form>
      <div id="gsRes"><p class="loading">Searching…</p></div></div>`;
  };
  window.gsBind = function(q){
    const form = document.getElementById('gsForm'), box = document.getElementById('gsq'), res = document.getElementById('gsRes'); if (!form || !res) return;
    const stillHere = () => (location.hash || '').startsWith('#/search');
    const paint = R => { if (!document.getElementById('gsRes')) return; res.innerHTML = resultsHtml(R); bindCards(res);
      res.querySelectorAll('[data-gso]').forEach(a => a.onclick = e => { e.preventDefault(); location.hash = R.orgs[+a.dataset.gso].go(); });
      res.querySelectorAll('[data-gspast]').forEach(b => b.onclick = () => { GS.past = b.dataset.gspast === '1'; paint(R); });
      res.querySelectorAll('[data-gsmore]').forEach(b => b.onclick = () => { const c = b.dataset.gsmore; GS.more[c] = (GS.more[c] || GS.limit) + 60; paint(R); }); };
    form.onsubmit = e => { e.preventDefault(); GS.more = {}; window.gsGo(box.value); };
    let t; box.oninput = () => { clearTimeout(t); t = setTimeout(() => { if (!stillHere()) return; GS.more = {}; const v = box.value; try { history.replaceState(null, '', '#/search' + (v.trim() ? '?q=' + encodeURIComponent(v.trim()) : '')); } catch {} paint(run(v)); if (typeof gcSearch === 'function') gcSearch(v); }, 250); };
    if (!String(q || '').trim()) { paint(null); box.focus(); return; }
    ready().then(() => { if (!stillHere()) return; const R = run(q);
      if (R && R.one) { if (typeof gcSearch === 'function') gcSearch(q); location.replace(target(R.one)); return; }
      paint(R); if (typeof gcSearch === 'function') gcSearch(q); });
  };
  window.gsRun = run;
})();
