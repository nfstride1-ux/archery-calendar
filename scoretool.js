/* Archery Calendar <- ScoreTool (22 Oct 2026). Finished ScoreTool rounds appear in the archer's own My events (list + month grid).
   Data: public.score_entries, written only by the scoretool_save_score() function for a linked account (supabase/scoretool_scores.sql).
   Linking: #/scoretool, signed in -> create_scoretool_link() -> the secret goes back to ScoreTool on a FIXED address (no open redirect),
   and is shown to copy for installed-app users. Until the SQL is run, everything here quietly does nothing. */
const STL = {uid: null, rows: null, missing: false, busy: false, links: null};
const STL_TARGETS = {demo: 'https://nfstride1-ux.github.io/scoretool-demo/', lab: 'https://nfstride1-ux.github.io/scoretool-lab/'};
const stlMissing = e => !!e && (/PGRST20[25]|42P01|42883/.test(String(e.code || '')) || /does not exist|Could not find/i.test(String(e.message || '')));
async function stlLoad(){
  if (!AUTH.on || !AUTH.client || !AUTH.user || STL.busy) return; STL.busy = true;
  try {
    const uid = AUTH.user.id, {data, error} = await AUTH.client.from('score_entries').select('id,source_id,shot_date,round_name,score,max_score,location,updated_at').order('shot_date', {ascending: true});
    if (error) { STL.missing = stlMissing(error); STL.rows = []; } else { STL.missing = false; STL.rows = data || []; }
    const L = await AUTH.client.from('scoretool_links').select('label,created_at,last_used_at').order('created_at', {ascending: false});
    STL.links = L.error ? null : (L.data || []); STL.uid = uid;
  } catch { STL.rows = []; } finally { STL.busy = false; }
  if (['calendar', 'account'].includes(document.body.dataset.page)) { const y = scrollY; render(); scrollTo(0, y); }
}
const stlByDay = () => { const o = {}; for (const r of STL.rows || []) (o[r.shot_date] = o[r.shot_date] || []).push(r); return o; };
function stlEventFor(d){   // one of the archer's own events on that day -> link to it; several or none -> no link
  const ids = [...new Set([...Object.keys(S.saved || {}), ...Object.keys(S.entries || {})])];
  const on = ids.map(id => BYID[id]).filter(x => x && x.start_date && x.start_date <= d && (x.end_date || x.start_date) >= d);
  return on.length === 1 ? on[0] : null;
}
const stlScore = r => `${r.score}${r.max_score ? ' / ' + r.max_score : ''}`;
const stlDate = d => pd(d).toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
function stlRow(r){ const ev = stlEventFor(r.shot_date);
  return `<li class="dp-row stl-row"><div class="dp-main"><b>🎯 ${esc(r.round_name)}</b> <span class="b stl-sc">${esc(stlScore(r))}</span>
    <div class="meta">${esc([stlDate(r.shot_date), r.location].filter(Boolean).join(' · '))}${ev ? ` · at <a href="#/shoot/${encodeURIComponent(ev.id)}?r=1">${esc(ev.name)}</a>` : ''}</div></div></li>`; }
function stlDecorateCalendar(){
  if (!AUTH.user || !STL.rows || STL.missing) return;
  const by = stlByDay(), [y, m] = CM || [new Date().getFullYear(), new Date().getMonth()], ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  document.querySelectorAll('.grid [data-day]').forEach(c => { const L = by[c.dataset.day]; if (!L || c.querySelector('.stl-dot')) return;
    c.classList.add('stl'); c.insertAdjacentHTML('beforeend', '<span class="stl-dot" aria-hidden="true">🎯</span>');
    c.setAttribute('aria-label', (c.getAttribute('aria-label') || '') + ' – score shot: ' + L.map(r => r.round_name + ' ' + stlScore(r)).join(', ')); });
  const lg = document.querySelector('#view .legend'); if (lg && !lg.querySelector('.lg-stl')) lg.insertAdjacentHTML('beforeend', '<span class="b lg-day lg-stl">🎯 score shot</span>');
  const month = (STL.rows || []).filter(r => r.shot_date.slice(0, 7) === ym);
  if (!STL.rows.length || document.getElementById('stlBox')) return;
  let at = lg; if (at && at.nextElementSibling && at.nextElementSibling.tagName === 'P') at = at.nextElementSibling;
  const html = `<section class="panel stl-box" id="stlBox" aria-labelledby="stlH"><h2 class="sec" id="stlH">🎯 Scores I shot in ${MONL[m]} ${y}</h2>
    ${month.length ? `<ul class="dp-list">${month.slice().reverse().map(stlRow).join('')}</ul>` : `<p class="note">No ScoreTool scores this month. ${STL.rows.length} in total.</p>`}
    <p class="note">From ScoreTool, when you finish a round. Only you can see these.</p></section>`;
  at ? at.insertAdjacentHTML('afterend', html) : document.querySelector('#view .wrap.narrow')?.insertAdjacentHTML('beforeend', html);
}
function stlAccountPanel(){
  if (!AUTH.user || STL.missing || !STL.links) return;
  const w = document.querySelector('#view .wrap.narrow'); if (!w || document.getElementById('stlAcct')) return;
  const n = STL.links.length;
  w.insertAdjacentHTML('beforeend', `<section class="panel" id="stlAcct"><h2 class="sec">🎯 ScoreTool</h2>
    <p>${n ? `Linked on ${n} phone${n === 1 ? '' : 's'}. Finished rounds show in <a href="#/calendar">My events</a>.` : 'Not linked. Link it and finished ScoreTool rounds show in <a href="#/calendar">My events</a>.'}</p>
    <div class="row">${n ? '<button class="btn" id="stlUnlink">Unlink ScoreTool</button>' : ''}<a class="btn alt" href="#/scoretool">Link ScoreTool</a></div></section>`);
  const u = $('#stlUnlink'); if (u) u.onclick = async () => { if (!confirm('Unlink ScoreTool? Scores already added stay in My events.')) return;
    const {error} = await AUTH.client.from('scoretool_links').delete().eq('user_id', AUTH.user.id); toast(error ? 'Could not unlink: ' + error.message : 'ScoreTool unlinked'); STL.uid = null; stlLoad(); };
}
function vScoreToolLink(HQ){
  setTitle('Link ScoreTool');
  const to = STL_TARGETS[HQ.get('to')] ? HQ.get('to') : 'demo', head = pageHead('Link ScoreTool', 'Your finished rounds, in My events on the day you shot them.', 'target');
  if (!AUTH.on) return `${head}<div class="wrap narrow"><section class="panel"><p>Accounts aren’t switched on here yet.</p></section></div>`;
  if (!AUTH.ready) return `${head}<div class="wrap narrow"><p class="loading">Checking sign-in…</p></div>`;
  if (!AUTH.user) return `${head}<div class="wrap narrow"><section class="panel"><h2 class="sec">🔒 Sign in first</h2><p>Sign in (or create a free account) with the email you want your scores saved to. You’ll come straight back here.</p>
    <div class="row"><a class="btn gold" href="#/account" id="stlIn">Sign in</a></div></section></div>`;
  return `${head}<div class="wrap narrow"><section class="panel"><h2 class="sec">Link ScoreTool to ${esc(AUTH.user.email || 'your account')}</h2>
    <ul class="ticks"><li>When you finish a round in ScoreTool it’s added to <b>My events</b> on the day you shot it: round, score and place if known.</li>
    <li>Only you can see them. No names are stored.</li><li>ScoreTool can only add its own scores. It can’t see or change anything else in your account.</li></ul>
    <div class="row"><button class="btn gold" id="stlGo">Link ScoreTool</button></div><div id="stlOut" role="status"></div></section></div>`;
}
function bindScoreToolLink(HQ){
  const to = STL_TARGETS[HQ.get('to')] ? HQ.get('to') : 'demo';
  const i = $('#stlIn'); if (i) i.onclick = () => setAfter('#/scoretool?to=' + to);
  const g = $('#stlGo'); if (!g) return;
  g.onclick = async () => { g.disabled = true; const out = $('#stlOut');
    const {data, error} = await AUTH.client.rpc('create_scoretool_link', {p_label: 'ScoreTool'});
    if (error || !/^[0-9a-f]{48}$/.test(data || '')) { g.disabled = false; out.innerHTML = `<p class="err">${stlMissing(error) ? 'Linking ScoreTool isn’t switched on yet. Please try again soon.' : 'Couldn’t link: ' + esc(error ? error.message : 'unexpected reply')}</p>`; return; }
    const url = STL_TARGETS[to] + '#stcal=' + data;
    out.innerHTML = `<p><b>✓ Linked.</b> <a class="btn gold" href="${esc(url)}">Back to ScoreTool</a></p><p class="note">Using ScoreTool as an installed app? Copy this code and paste it in ScoreTool › Me › Settings › Archery Calendar:</p><p><code class="stl-code">${data}</code></p>`;
    STL.uid = null; };
}
/* hook into the page renderer (route() calls render() by name) */
(function(){ const _r = render; render = function(){ _r.apply(this, arguments); try {
  const p = document.body.dataset.page, h0 = location.hash || '', [, pg] = h0.split('?')[0].split('/');
  if (pg === 'scoretool') { document.body.dataset.page = 'scoretool'; const HQ = new URLSearchParams(h0.split('?')[1] || ''), v = $('#view'); v.innerHTML = vScoreToolLink(HQ); bindScoreToolLink(HQ); return; }
  if (AUTH.user && STL.uid !== AUTH.user.id && !STL.busy) stlLoad();
  if (p === 'calendar') stlDecorateCalendar(); else if (p === 'account') stlAccountPanel(); } catch (e) {} };
  setInterval(() => { const u = AUTH.user ? AUTH.user.id : null, p = document.body.dataset.page;
    if (p === 'scoretool' && (STL.seenAuth !== String(AUTH.ready) + u)) { STL.seenAuth = String(AUTH.ready) + u; render(); }
    if (u && STL.uid !== u && !STL.busy && ['calendar', 'account'].includes(p)) stlLoad(); }, 1500);
})();
