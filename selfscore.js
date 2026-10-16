/* Archery Calendar – "Add my score" (self-reported, unofficial). Table public.self_scores (supabase/self_scores.sql).
   Open from the shoot's start date until the end of the day after its last day, in the venue's time zone (else Perth).
   The database enforces the window, ownership and ranges; this file only mirrors them for the UI.
   Once official full results are imported (data/results.json), the unofficial entries are hidden here but kept in the database. */
const SS_STATE_TZ = {WA: 'Australia/Perth', NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', VIC: 'Australia/Melbourne', TAS: 'Australia/Hobart', QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide', NT: 'Australia/Darwin'};
const SS_BOWS = ['Recurve', 'Compound', 'Barebow', 'Longbow', 'Traditional', 'Crossbow', 'Other'];
const SS = {uid: null, tries: 0, ev: null, rows: null, mine: new Set(), err: '', edit: null, busy: false, adm: null};
const ssTz = x => { const z = x.tz || SS_STATE_TZ[x.state_code || x.state || ''] || 'Australia/Perth'; try { new Intl.DateTimeFormat('en', {timeZone: z}); return z; } catch { return 'Australia/Perth'; } };
function ssMidnight(d, tz, addDays){   // epoch ms of 00:00 local (tz) on date d + addDays
  const [y, m, dd] = d.split('-').map(Number), g = Date.UTC(y, m - 1, dd + addDays);
  const off = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(t).map(q => [q.type, q.value]));
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; };
  let t = g - off(g); t = g - off(t); return t;
}
function ssWindow(x){
  if (!x || !x.start_date) return null; const tz = ssTz(x);
  return {open: ssMidnight(x.start_date, tz, 0), close: ssMidnight(x.end_date || x.start_date, tz, 2), tz};
}
const ssIsOpen = x => { const w = ssWindow(x), n = Date.now(); return !!w && n >= w.open && n < w.close; };
const ssOfficial = x => { const r = RES[x.id]; return !!(r && r.kind === 'full'); };
const ssWhen = (t, tz) => new Date(t - 1).toLocaleDateString('en-AU', {timeZone: tz, weekday: 'short', day: 'numeric', month: 'short'});

function selfBox(x){
  if (!x || !AUTH.on) return '';
  const w = ssWindow(x); if (!w) return '';
  const uid = AUTH.user ? AUTH.user.id : null; if (SS.ev === x.id && SS.rows && SS.uid !== uid) SS.ev = null;
  const open = ssIsOpen(x), official = ssOfficial(x), loaded = SS.ev === x.id && SS.rows, rows = loaded ? SS.rows : [];
  if (!open && !(loaded && rows.length)) { if (SS.ev !== x.id) ssLoad(x.id); return ''; }
  if (SS.ev !== x.id) ssLoad(x.id);
  const head = `<section class="panel results-box self-box" id="selfScores"><h2 class="sec">📝 Scores from archers <span class="tag unoff">Unofficial (self-reported)</span></h2>`;
  if (official) return `${head}<p class="note">Official results are in above, so they replace the ${rows.length} self-reported score${rows.length === 1 ? '' : 's'}.</p></section>`;
  const tzNote = w.tz === 'Australia/Perth' ? 'Perth time' : (typeof TZ_NAME !== 'undefined' && TZ_NAME[w.tz]) || w.tz.replace(/^.*\//, '').replace(/_/g, ' ') + ' time';
  const groups = {}; rows.forEach(r => (groups[r.division] = groups[r.division] || []).push(r));
  const tbl = Object.keys(groups).sort().map(d => { const L = groups[d].sort((a, b) => (a.place || 999) - (b.place || 999) || b.score - a.score);
    return `<details class="res-grp" open><summary>${esc(d)} <span class="res-n">(${L.length})</span></summary><table class="res-tbl"><thead><tr><th scope="col">Archer</th><th scope="col" class="num">Score</th></tr></thead><tbody>${L.map(r =>
      `<tr${SS.mine.has(r.id) ? ' class="mine"' : ''}><td><b>${esc(r.display_name)}</b><br><small>${[r.bow, r.place ? 'Place ' + r.place : '', r.tens != null ? r.tens + ' 10s' : '', r.xs != null ? r.xs + ' Xs' : ''].filter(Boolean).map(esc).join(' · ')}</small>${SS.mine.has(r.id) && open ? ` <button type="button" class="linkbtn" data-ssedit="${esc(r.id)}">Edit</button>` : ''}</td><td class="num">${esc(r.score)}</td></tr>`).join('')}</tbody></table></details>`; }).join('');
  let form = '';
  if (open && !AUTH.user) form = `<p><a class="btn gold block" href="#/account">Sign in to add my score</a></p>`;
  else if (open) { const e = SS.edit ? rows.find(r => r.id === SS.edit) || {} : {}, nm = (typeof myName === 'function' && myName()) || '';
    form = !SS.edit && SS.edit !== '' ? `<p><button type="button" class="btn gold block" id="ssAdd">＋ Add my score</button></p>` :
    `<form id="ssForm" class="ss-form"><h3 class="dp-sub">${e.id ? 'Edit my score' : 'Add my score'}</h3>
      ${nm ? `<p class="note">Shown as <b>${esc(nm)}</b> (your display name). <a href="#/account">Change</a></p>` : `<label for="ss_nm">Your name (shown publicly)</label><input id="ss_nm" name="display_name" maxlength="60" required autocomplete="nickname">`}
      <label for="ss_div">Round or division</label><input id="ss_div" name="division" maxlength="80" required value="${esc(e.division || '')}" placeholder="e.g. WA 70/720, Open Recurve">
      <label for="ss_bow">Bow</label><select id="ss_bow" name="bow">${SS_BOWS.map(b => `<option${b === (e.bow || 'Recurve') ? ' selected' : ''}>${b}</option>`).join('')}</select>
      <div class="grid2"><div><label for="ss_sc">Score</label><input id="ss_sc" name="score" type="number" inputmode="numeric" min="0" max="3000" required value="${e.score ?? ''}"></div>
      <div><label for="ss_pl">Place (if known)</label><input id="ss_pl" name="place" type="number" inputmode="numeric" min="1" max="999" value="${e.place ?? ''}"></div>
      <div><label for="ss_10">10s (optional)</label><input id="ss_10" name="tens" type="number" inputmode="numeric" min="0" max="300" value="${e.tens ?? ''}"></div>
      <div><label for="ss_x">Xs (optional)</label><input id="ss_x" name="xs" type="number" inputmode="numeric" min="0" max="300" value="${e.xs ?? ''}"></div></div>
      <div class="row"><button class="btn gold" ${SS.busy ? 'disabled' : ''}>${e.id ? 'Save' : 'Add score'}</button><button type="button" class="btn alt" id="ssCancel">Cancel</button>${e.id ? `<button type="button" class="btn alt" id="ssDel">Delete</button>` : ''}</div></form>`; }
  return `${head}<p class="note">${open ? `Open until the end of ${esc(ssWhen(w.close, w.tz))} (${esc(tzNote)}). ` : ''}Scores here are entered by archers themselves and are replaced by the official results once they're published.</p>
    ${SS.err ? `<p class="err" role="alert">${esc(SS.err)}</p>` : ''}${loaded ? tbl || '<p class="note">No scores added yet.</p>' : '<p class="loading">Loading scores…</p>'}${form}</section>`;
}
async function ssLoad(id){
  SS.ev = id; SS.rows = null; SS.mine = new Set(); SS.err = ''; SS.edit = null; SS.uid = AUTH.user ? AUTH.user.id : null;
  try { await (AUTH.chain || Promise.resolve());
    if (!AUTH.client || !AUTH.ready) { if (SS.tries++ < 40) setTimeout(() => { if (SS.ev === id && !SS.rows) ssLoad(id); }, 300); return; }
    SS.tries = 0;
    const {data, error} = await AUTH.client.from('self_scores').select('id,event_id,display_name,division,bow,score,tens,xs,place,updated_at').eq('event_id', id).limit(500);
    if (error) throw error; SS.rows = data || [];
    if (AUTH.user) { const m = await AUTH.client.rpc('my_self_scores', {p_event: id}); if (!m.error) SS.mine = new Set(m.data || []); }
  } catch (e) { SS.rows = []; SS.err = /self_scores|schema cache|does not exist/i.test(String(e.message || e)) ? 'Adding scores isn’t switched on yet – check back soon.' : 'Couldn’t load scores.'; }
  if (SS.ev === id && document.body.dataset.page === 'shoot') ssRefresh(id);
}
function ssRefresh(id){ const el = document.getElementById('selfScores'), x = BYID[id]; const h = selfBox(x);
  if (el) { if (h) el.outerHTML = h; else el.remove(); } else if (h) { const r = document.getElementById('results'), m = document.querySelector('.detail .main'); if (r) r.insertAdjacentHTML('afterend', h); else if (m) m.insertAdjacentHTML('afterbegin', h); }
  selfBind(id); }
function selfBind(id){
  const x = BYID[id], v = document.getElementById('selfScores'); if (!v) return;
  const add = v.querySelector('#ssAdd'); if (add) add.onclick = () => { SS.edit = ''; ssRefresh(id); const f = document.getElementById('ss_div'); f && f.focus(); };
  v.querySelectorAll('[data-ssedit]').forEach(b => b.onclick = () => { SS.edit = b.dataset.ssedit; ssRefresh(id); });
  const c = v.querySelector('#ssCancel'); if (c) c.onclick = () => { SS.edit = null; ssRefresh(id); };
  const d = v.querySelector('#ssDel'); if (d) d.onclick = async () => { if (!confirm('Delete your score?')) return;
    const {error} = await AUTH.client.from('self_scores').delete().eq('id', SS.edit); if (error) { toast('Not deleted: ' + error.message); return; }
    SS.rows = SS.rows.filter(r => r.id !== SS.edit); SS.edit = null; toast('Deleted'); ssRefresh(id); };
  const f = v.querySelector('#ssForm'); if (f) f.onsubmit = async e => { e.preventDefault(); if (!ssIsOpen(x)) { toast('Scores for this shoot are closed'); return; }
    const q = Object.fromEntries(new FormData(f)), num = k => q[k] === '' || q[k] == null ? null : Math.round(+q[k]);
    const row = {division: q.division.trim(), bow: q.bow, score: num('score'), tens: num('tens'), xs: num('xs'), place: num('place'), display_name: (q.display_name || myName() || '').trim()};
    if (/@|\d{6,}|https?:/.test(row.display_name + ' ' + row.division)) { toast('No emails, phone numbers or links please'); return; }
    if (row.xs != null && row.tens != null && row.xs > row.tens) { toast('Xs can’t be more than 10s'); return; }
    SS.busy = true; const cols = 'id,event_id,display_name,division,bow,score,tens,xs,place,updated_at';
    const res = SS.edit ? await AUTH.client.from('self_scores').update(row).eq('id', SS.edit).select(cols).single() : await AUTH.client.from('self_scores').insert({...row, event_id: id}).select(cols).single();
    SS.busy = false;
    if (res.error) { toast(/duplicate|unique/i.test(res.error.message) ? 'You already have a score for that round – tap Edit on it' : 'Not saved: ' + res.error.message); return; }
    SS.rows = SS.rows.filter(r => r.id !== res.data.id).concat(res.data); SS.mine.add(res.data.id); SS.edit = null; toast('Score saved (unofficial)'); ssRefresh(id); };
}

/* #/admin/scores – remove any self-reported score */
function vAdmScores(head){
  if (!SS.adm) { ssAdmLoad(); return `${head}<div class="wrap"><p class="loading">Loading scores…</p></div>`; }
  const L = SS.adm.rows || [];
  return `${head}<div class="wrap adm"><p><a href="#/admin">← Back to requests</a></p>${SS.adm.err ? `<p class="err" role="alert">${esc(SS.adm.err)}</p>` : ''}
    <section class="panel"><h2 class="sec">Self-reported scores (${L.length})</h2><p class="note">Newest first. Removing deletes the entry for good.</p>
    ${L.map(r => { const x = BYID[r.event_id]; return `<div class="adm-req" data-ssid="${esc(r.id)}"><div><b>${esc(r.display_name)}</b> – ${esc(r.score)} <span class="note">${esc(r.division)} · ${esc(r.bow)}${r.place ? ' · place ' + esc(r.place) : ''}</span><br><a href="#/shoot/${encodeURIComponent(r.event_id)}">${esc(x ? x.name : r.event_id)}</a><br><span class="note">${esc(new Date(r.updated_at).toLocaleString('en-AU', {timeZone: 'Australia/Perth', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'}))} Perth</span></div><div class="adm-btns row"><button class="btn alt" data-ssrm>Remove</button></div></div>`; }).join('') || '<p class="note">None yet.</p>'}</section></div>`;
}
async function ssAdmLoad(){
  SS.adm = {rows: [], err: ''};
  const {data, error} = await AUTH.client.from('self_scores').select('id,event_id,display_name,division,bow,score,place,updated_at').order('updated_at', {ascending: false}).limit(300);
  if (error) SS.adm.err = 'Needs supabase/self_scores.sql to be run once. (' + error.message + ')'; else SS.adm.rows = data;
  if (document.body.dataset.page === 'admin') softRenderForce();
}
function bindAdmScores(){
  document.querySelectorAll('[data-ssrm]').forEach(b => b.onclick = async () => { const el = b.closest('[data-ssid]'), id = el.dataset.ssid; if (!confirm('Remove this score?')) return; b.disabled = true;
    const {error, count} = await AUTH.client.from('self_scores').delete({count: 'exact'}).eq('id', id);
    if (error || !count) { toast('Not removed' + (error ? ': ' + error.message : ' (admins only)')); b.disabled = false; return; }
    SS.adm.rows = SS.adm.rows.filter(r => r.id !== id); toast('Removed'); softRenderForce(); });
}
