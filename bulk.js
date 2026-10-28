/* "Send us your calendar" (#/submit/bulk): a club sends its fixture list in whatever form it already has (PDF, photo or screenshot, Excel, Word,
   CSV, a link, or pasted text). Files are kept private in the calendar_submissions / calendar_submission_files tables (supabase/bulk_calendar_inbox.sql),
   we read them (scripts/process_calendar_inbox.py), and a preview comes next: Nathe checks every new club's preview, approved clubs confirm their own.
   The same preview component is used on #/admin/calendars. Uploaded text and files are only ever shown as plain escaped text. */
(function(){
'use strict';
const E = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]));
const sn = t => (typeof snorm === 'function' ? snorm(t) : String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
const MAX_FILES = 5, MAX_FILE = 6 * 1048576, MAX_TOTAL = 14 * 1048576, MAX_TEXT = 60000, FUTURE_DAYS = 800;
const OK_EXT = /\.(pdf|jpe?g|png|webp|gif|heic|heif|csv|tsv|txt|xlsx?|xlsm|ods|numbers|docx?|odt|rtf|ics|html?)$/i;
const THANKS = 'Thanks, we\'ve got it. Your events will be approved within 24 hours, and we\'ll let you know when they are live.';
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const todayIso = () => isoOf(new Date());
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };
const validIso = s => { const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!a) return false; const t = new Date(+a[1], +a[2] - 1, +a[3]); return t.getFullYear() === +a[1] && t.getMonth() === +a[2] - 1 && t.getDate() === +a[3]; };
const nice = iso => { if (!validIso(iso)) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'}); };
const when = iso => { try { return new Date(iso).toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}); } catch (e) { return ''; } };
const mb = n => (n / 1048576 >= 0.1 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const TYPES = ['3D', 'Field', 'Target', 'Indoor', 'Clout', 'Run', 'Hunter', 'Other'];
const ready = () => !!(typeof AUTH !== 'undefined' && AUTH.client && AUTH.user);
const rerender = () => { if (typeof softRenderForce === 'function') softRenderForce(); };

/* ---- existing events, for the live duplicate check in a preview ---- */
function clubKey(name){
  const n = sn(name); if (!n) return '';
  const cl = (typeof CLUBS !== 'undefined' ? CLUBS : []).find(c => sn(c.name) === n || (c.aliases || []).some(a => sn(a) === n));
  return cl ? 'c:' + cl.id : 'n:' + n;
}
let EXIST = null;
function existing(){
  if (EXIST) return EXIST;
  const seen = new Set(); EXIST = [];
  [...(typeof EV !== 'undefined' ? EV : []), ...(typeof INTL !== 'undefined' && INTL ? INTL.events || [] : [])].forEach(x => {
    if (!x) return; const d = x.start_date || x.date, nm = x.name || x.title; if (!d || !nm) return;
    const cn = x.club_name || (typeof CLUB !== 'undefined' && CLUB[x.club_id] ? CLUB[x.club_id].name : '') || x.host || x.club || x.organiser || '';
    const k = [clubKey(cn), d, sn(nm)].join('|'); if (seen.has(k)) return; seen.add(k);
    EXIST.push({ck: clubKey(cn), d, n: sn(nm), name: nm});
  });
  return EXIST;
}
const dupOf = r => { if (!validIso(r.start_date) || !r.name || !r.club) return null; const ck = clubKey(r.club), n = sn(r.name); return existing().find(e => e.ck === ck && e.d === r.start_date && (e.n === n || e.n.includes(n) || n.includes(e.n))) || null; };

/* ---- one preview row: what the reader proposed, plus live checks ---- */
function rowFlags(r){
  const f = [], today = todayIso();
  (Array.isArray(r.flags) ? r.flags : []).forEach(x => { if (x) f.push(['w', String(x).slice(0, 200)]); });
  if (!validIso(r.start_date)) f.push(['e', 'No date. Add one (with the year) or leave this one out.']);
  else if (r.start_date < today) f.push(['e', 'This date is in the past.']);
  else if (r.start_date > addDays(today, FUTURE_DAYS)) f.push(['e', 'This date is more than two years away. Check the year.']);
  if (r.end_date && validIso(r.end_date) && validIso(r.start_date) && r.end_date < r.start_date) f.push(['e', 'The end date is before the start date.']);
  if (!String(r.name || '').trim()) f.push(['e', 'No event name.']);
  if (!String(r.club || '').trim()) f.push(['e', 'No club.']);
  if (!String(r.venue || '').trim()) f.push(['e', 'No venue or place.']);
  const d = dupOf(r); if (d) f.push(['d', 'Already on the calendar: "' + d.name + '".']);
  if (/(\+?\d[\d\s().-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)/.test([r.name, r.notes, r.venue].join(' '))) f.push(['w', 'Has a phone number or email in the text. Check it should be public.']);
  if (r.registration_url && !/^https?:\/\/\S+$/i.test(r.registration_url)) f.push(['e', 'The entry link is not a web address.']);
  return f;
}
const blocked = r => rowFlags(r).some(([k]) => k === 'e');
const PV = {};   // submission id -> {rows, busy, done, msg}
function pvFor(s){
  if (PV[s.id]) return PV[s.id];
  const rows = (Array.isArray(s.proposed) ? s.proposed : []).map(o => {
    const r = Object.assign({country: 'AU', state: '', club: s.club || '', name: '', start_date: '', end_date: '', venue: '', discipline: '', registration_url: '', notes: '', source: '', confidence: '', flags: []}, o || {});
    ['club', 'name', 'venue', 'state', 'notes', 'source', 'registration_url', 'discipline', 'country'].forEach(k => { r[k] = r[k] == null ? '' : String(r[k]); });
    r.start_date = r.start_date ? String(r.start_date) : ''; r.end_date = r.end_date ? String(r.end_date) : '';
    r._inc = o && o.include === false ? false : true; r._edit = false;
    if (blocked(r) || dupOf(r)) r._inc = false;
    return r;
  });
  return (PV[s.id] = {rows, busy: false, done: null, msg: ''});
}

/* ---- the preview table (shared by the submitter page and #/admin/calendars) ---- */
const CONF = {high: ['bk-t-ok', 'Clear'], medium: ['bk-t-warn', 'Check'], low: ['bk-t-error', 'Unsure']};
function rowCard(id, r, i, canEdit){
  const fl = rowFlags(r), bad = fl.some(([k]) => k === 'e'), cf = CONF[String(r.confidence || '').toLowerCase()];
  const date = validIso(r.start_date) ? E(nice(r.start_date)) + (r.end_date && r.end_date !== r.start_date && validIso(r.end_date) ? ' to ' + E(nice(r.end_date)) : '') : '<span class="bk-e">No date</span>';
  const place = [r.venue, r.state].filter(Boolean).join(', ');
  const edit = r._edit ? `<div class="pv-edit">
      <label>Event name<input data-f="name" value="${E(r.name)}" maxlength="140"></label><label>Club<input data-f="club" value="${E(r.club)}" maxlength="120"></label>
      <label>Start date<input data-f="start_date" type="date" value="${E(validIso(r.start_date) ? r.start_date : '')}"></label><label>End date<input data-f="end_date" type="date" value="${E(validIso(r.end_date) ? r.end_date : '')}"></label>
      <label>Venue / address<input data-f="venue" value="${E(r.venue)}" maxlength="200"></label><label>State<input data-f="state" value="${E(r.state)}" maxlength="40"></label>
      <label>Type<select data-f="discipline"><option value="">(none)</option>${TYPES.map(t => `<option${t === r.discipline ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Entry link<input data-f="registration_url" value="${E(r.registration_url)}" maxlength="500"></label>
      <label class="pv-wide">Notes<textarea data-f="notes" rows="2" maxlength="1500">${E(r.notes)}</textarea></label>
      <div class="pv-wide row"><button type="button" class="btn alt sm" data-pv="done" data-i="${i}">Done</button></div></div>` : '';
  return `<article class="pv-row${bad ? ' pv-bad' : ''}${r._inc ? '' : ' pv-off'}" data-i="${i}">
    <label class="pv-inc"><input type="checkbox" data-pv="inc" data-i="${i}" ${r._inc ? 'checked' : ''} ${bad ? 'disabled' : ''} aria-label="Include ${E(r.name || 'this event')}"><span>${r._inc ? 'Included' : 'Left out'}</span></label>
    <div class="pv-main"><b class="pv-name">${E(r.name || '(no name)')}</b>${cf ? ` <span class="bk-tag ${cf[0]}">${cf[1]}</span>` : ''}<br>
      <span class="pv-date">${date}</span> &middot; ${E(r.club || '(no club)')}${place ? '<br><span class="note">' + E(place) + (r.discipline ? ' &middot; ' + E(r.discipline) : '') + '</span>' : ''}
      ${r.notes ? `<br><span class="note">${E(r.notes.slice(0, 240))}</span>` : ''}
      ${fl.length ? '<ul class="bk-list">' + fl.map(([k, m]) => `<li class="bk-${k}">${E(m)}</li>`).join('') + '</ul>' : ''}
      ${r.source ? `<blockquote class="pv-src"><span class="note">Taken from:</span> ${E(String(r.source).slice(0, 400))}</blockquote>` : ''}</div>
    ${canEdit ? `<div class="pv-act"><button type="button" class="btn alt sm" data-pv="edit" data-i="${i}">${r._edit ? 'Close' : 'Edit'}</button></div>` : ''}${edit}</article>`;
}
function previewHtml(s, mode){   // mode: 'self' (approved submitter confirms) or 'admin'
  const pv = pvFor(s), rows = pv.rows, inc = rows.filter(r => r._inc && !blocked(r)).length;
  if (pv.done) return `<p class="sub-lead"><b>${pv.done.published} event${pv.done.published === 1 ? ' is' : 's are'} on the calendar.</b>${pv.done.skipped ? ' ' + pv.done.skipped + ' left out because they were already there or incomplete.' : ''}</p>`;
  if (!rows.length) return '<p class="note">We could not find any events in this upload.</p>' + (mode === 'admin' ? '' : '');
  return `${s.bot_notes && mode === 'admin' ? `<p class="note pv-notes"><b>Reader notes:</b> ${E(s.bot_notes)}</p>` : ''}
    <div class="pv-list" data-sid="${E(s.id)}">${rows.map((r, i) => rowCard(s.id, r, i, true)).join('')}</div>
    <p class="err" role="alert" data-pverr="${E(s.id)}">${E(pv.msg || '')}</p>
    <div class="row bk-actions"><button type="button" class="btn gold" data-pubid="${E(s.id)}" ${pv.busy || !inc ? 'disabled' : ''}>${pv.busy ? 'Publishing…' : (mode === 'admin' ? 'Publish ' : 'Confirm and publish ') + inc + ' event' + (inc === 1 ? '' : 's')}</button>
    ${mode === 'admin' ? `<button type="button" class="btn alt" data-rejid="${E(s.id)}">Turn this upload down</button>` : ''}</div>
    ${mode === 'admin' && !s.trusted ? `<label class="pv-appr"><input type="checkbox" data-apprid="${E(s.id)}"> Also approve ${E(s.submitter_email || 'this person')} for next time, so their next uploads can be confirmed by them</label>` : ''}`;
}
function bindPreview(root, subs, mode, after){
  const byId = id => subs.find(s => s.id === id);
  root.querySelectorAll('[data-pv]').forEach(el => {
    const list = el.closest('.pv-list'), s = list ? byId(list.dataset.sid) : null; if (!s) return;
    const r = pvFor(s).rows[+el.dataset.i], k = el.dataset.pv;
    if (k === 'inc') el.addEventListener('change', () => { r._inc = el.checked; after(); });
    else if (k === 'edit') el.addEventListener('click', () => { r._edit = !r._edit; after(); });
    else if (k === 'done') el.addEventListener('click', () => { r._edit = false; if (!blocked(r) && !dupOf(r)) r._inc = true; after(); });
  });
  root.querySelectorAll('.pv-edit [data-f]').forEach(el => {
    const list = el.closest('.pv-list'), s = byId(list.dataset.sid), r = pvFor(s).rows[+el.closest('.pv-row').dataset.i];
    el.addEventListener('change', () => { r[el.dataset.f] = el.value.trim(); if (el.dataset.f === 'start_date' && !validIso(r.end_date)) r.end_date = ''; after(); });
  });
  root.querySelectorAll('[data-pubid]').forEach(b => b.addEventListener('click', () => publish(byId(b.dataset.pubid), mode, after)));
  root.querySelectorAll('[data-rejid]').forEach(b => b.addEventListener('click', () => reject(byId(b.dataset.rejid), after)));
}
async function publish(s, mode, after){
  const pv = pvFor(s); if (pv.busy || !ready()) return;
  const rows = pv.rows.filter(r => r._inc && !blocked(r)); if (!rows.length) return;
  const cb0 = document.querySelector('[data-apprid="' + s.id + '"]'), alsoApprove = !!(cb0 && cb0.checked);
  pv.busy = true; pv.msg = ''; after();
  const events = rows.map(r => {
    const url = (r.registration_url || '').trim();
    return {country: r.country || 'AU', state: r.state || '', organisation_type: '', club: r.club.trim(), name: r.name.trim(), start_date: r.start_date, end_date: validIso(r.end_date) ? r.end_date : r.start_date,
      venue: r.venue.trim(), discipline: r.discipline || '', registration_url: url, register: url ? [{m: typeof regMethodOfUrl === 'function' ? regMethodOfUrl(url) : 'website', url}] : null, notes: r.notes || ''};
  });
  let res = null, err = '';
  try { const {data, error} = await AUTH.client.rpc('calendar_publish', {p_id: s.id, p_events: events}); if (error) err = error.message || 'Could not publish.'; else res = data; } catch (e) { err = 'Could not publish. Check your connection and try again.'; }
  pv.busy = false;
  if (res) {
    pv.done = res; s.status = 'published'; s.published_count = res.published; EXIST = null;
    if (mode === 'admin' && alsoApprove && s.submitter_email) { try { await AUTH.client.from('approved_submitters').upsert({email: String(s.submitter_email).toLowerCase(), name: s.submitter_name || null, club: s.club || null, instant: true}, {onConflict: 'email'}); } catch (e) {} }
    if (typeof toast === 'function') toast(res.published + ' event' + (res.published === 1 ? '' : 's') + ' published');
  } else pv.msg = /not allowed/i.test(err) ? 'You can\'t publish this one.' : err;
  after();
}
async function reject(s, after){
  const why = window.prompt('Why are you turning this upload down? (optional, kept for your records)', ''); if (why === null) return;
  try { const {error} = await AUTH.client.rpc('calendar_reject', {p_id: s.id, p_reason: why}); if (!error) { s.status = 'rejected'; s.reject_reason = why; } } catch (e) {}
  after();
}

/* ---- the upload page ---- */
const BK = {files: [], busy: false, done: false, err: '', subs: null, loadingSubs: false, note: '', text: '', link: '', club: '', name: '', role: '', keepFocus: ''};
const roleOptions = () => (typeof ROLE_OPTS !== 'undefined' ? ROLE_OPTS : ['President', 'Secretary', 'Treasurer', 'Committee member', 'Other']);
const approved = () => typeof subApproved === 'function' && subApproved();
const STATUS = {received: ['Received', 'bk-t-dup'], preview_ready: ['Being checked', 'bk-t-warn'], published: ['Live', 'bk-t-ok'], rejected: ['Not used', 'bk-t-error'], failed: ['We will be in touch', 'bk-t-error']};
function fileRows(){
  if (!BK.files.length) return '';
  return '<ul class="bk-files">' + BK.files.map((f, i) => `<li><span class="bk-fn">${E(f.name)}</span> <span class="note">${mb(f.size)}</span> <button type="button" class="btn alt sm" data-rm="${i}" aria-label="Remove ${E(f.name)}">Remove</button></li>`).join('') + '</ul>';
}
function mySubs(){
  if (!BK.subs) return '';
  const subs = BK.subs.filter(s => s.status !== 'rejected' || true);
  if (!subs.length) return '';
  return `<section class="panel bulk-mine"><h2 class="sec">Your earlier uploads</h2>` + subs.map(s => {
    const st = STATUS[s.status] || STATUS.received, mine = s.trusted && s.status === 'preview_ready';
    const what = [s.file_count ? s.file_count + ' file' + (s.file_count === 1 ? '' : 's') : '', s.link_url ? 'a link' : '', s.pasted_text ? 'pasted text' : ''].filter(Boolean).join(', ');
    return `<div class="bk-sub" data-sid="${E(s.id)}"><div class="bk-sub-h"><b>${E(when(s.created_at))}</b> <span class="note">${E(what)}</span> <span class="bk-tag ${st[1]}">${mine ? 'Ready for you to check' : st[0]}</span></div>
      ${s.status === 'published' ? `<p class="note">${s.published_count} event${s.published_count === 1 ? ' is' : 's are'} on the calendar.</p>` : ''}
      ${mine ? `<p class="note">We have read this one. Check the events below and publish them.</p>${previewHtml(s, 'self')}` : ''}
      ${s.status === 'received' || (s.status === 'preview_ready' && !s.trusted) ? '<p class="note">We are reading it and will approve it within 24 hours. We will let you know when the events are live.</p>' : ''}
      ${s.status === 'failed' ? '<p class="note">We could not read this one. We will email you, or you can send it again in another form.</p>' : ''}</div>`;
  }).join('') + '</section>';
}
function bulkView(){
  const ap = approved();
  if (typeof setTitle === 'function') setTitle('Send us your calendar');
  const head = typeof pageHead === 'function' ? pageHead('Send us your calendar', 'However you keep it. We do the typing.', '3d') : '';
  const who = ap ? '' : `<div class="bulk-who" id="bkWho"><div class="fld"><label for="bk_name">Your name <span class="req" aria-hidden="true">*</span></label><input id="bk_name" autocomplete="name" maxlength="80" value="${E(BK.name)}"></div>
    <div class="fld"><label for="bk_role">Your role at the club <span class="req" aria-hidden="true">*</span></label><select id="bk_role"><option value="">Choose…</option>${roleOptions().map(o => `<option${o === BK.role ? ' selected' : ''}>${E(o)}</option>`).join('')}</select></div>
    <p class="hint">We check your name and role with the club before anything goes live.</p><p class="err" id="bk_who_err" role="alert"></p></div>`;
  const body = BK.done ? `<section class="panel bk-thanks" role="status" aria-live="polite"><span class="thanks-mark" aria-hidden="true">✓</span><h2 class="sec">Sent</h2><p class="sub-lead" id="bkThanks">${E(THANKS)}</p>
      <div class="row"><button type="button" class="btn gold" id="bkAgain">Send another calendar</button><a class="btn alt" href="#/">Back to the calendar</a></div></section>`
    : `<section class="panel bulk-steps"><div class="fld"><label for="bkFile"><b>1. Choose your file or files</b></label>
      <input type="file" id="bkFile" multiple accept=".pdf,image/*,.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.numbers,.doc,.docx,.odt,.rtf,.ics">
      <p class="hint">A PDF, a photo or screenshot of the calendar, an Excel, Word or CSV file. Up to ${MAX_FILES} files, ${Math.round(MAX_FILE / 1048576)} MB each. Photos are made smaller on your device first.</p>${fileRows()}</div>
      <div class="fld"><label for="bkLink"><b>2. Or paste a link to your calendar page</b></label><input id="bkLink" type="url" inputmode="url" placeholder="https://" maxlength="500" value="${E(BK.link)}"></div>
      <div class="fld"><label for="bkText"><b>3. Or paste the dates here</b></label><textarea id="bkText" rows="5" maxlength="${MAX_TEXT}" placeholder="Copy and paste from an email, a Facebook post or your website">${E(BK.text)}</textarea></div>
      <div class="fld"><label for="bkClub">Club name</label><input id="bkClub" autocomplete="organization" maxlength="120" value="${E(BK.club)}"><p class="hint">Helps us when the file does not say.</p></div>
      <div class="fld"><label for="bkNote">Anything we should know? (optional)</label><textarea id="bkNote" rows="2" maxlength="1000" placeholder="For example: the 2027 season only, or dates marked TBC are not fixed yet.">${E(BK.note)}</textarea></div>
      ${who}
      <p class="err" id="bkErr" role="alert">${E(BK.err)}</p>
      <div class="row bk-actions"><button type="button" class="btn gold" id="bkSend" ${BK.busy ? 'disabled' : ''}>${BK.busy ? 'Sending…' : 'Send calendar'}</button></div>
      <p class="note">We keep your files private, only use them to put your events on the calendar, and delete them when that is done. <a href="#/privacy">Privacy</a></p></section>`;
  return `${head}<div class="wrap narrow sub bulk">${typeof subTabs === 'function' ? subTabs('bulk') : ''}
  <section class="panel sub-intro"><p class="sub-lead"><b>Send us your calendar, however you keep it.</b> Send a PDF, a photo, a spreadsheet, a link, or just paste the dates. You do not need a template. We read it, line the events up, and put them on the calendar.</p>
    <p class="note sub-mode">${ap ? 'You are an approved submitter. We read your calendar and send you a preview, and you confirm it to publish.' : 'We check every new club\'s events ourselves before they go on the calendar.'}</p></section>
  ${body}<div id="bkMine">${mySubs()}</div>
  <section class="panel bulk-help"><h2 class="sec">Just one event?</h2><p>Use <a href="#/submit">New event</a>. Clubs that keep their events in their own system can also send them straight to us with the <a href="club-api.html">event push API</a>: email <a href="mailto:nfshold@gmail.com">nfshold@gmail.com</a> to ask for a key.</p></section></div>`;
}

/* ---- reading the files in the browser ---- */
const readB64 = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '').split(',')[1] || ''); fr.onerror = () => rej(new Error('read')); fr.readAsDataURL(f); });
async function addFiles(list){
  const er = document.getElementById('bkErr'); BK.err = '';
  for (const f of Array.from(list)) {
    if (BK.files.length >= MAX_FILES) { BK.err = 'Up to ' + MAX_FILES + ' files at a time. Send the rest as another upload.'; break; }
    if (!OK_EXT.test(f.name) && !/^image\//.test(f.type) && f.type !== 'application/pdf') { BK.err = '"' + f.name + '" is not a file type we can read. Send a PDF, photo, Excel, Word or CSV file, or paste the dates.'; continue; }
    let g = f;
    if (/^image\//.test(f.type) && typeof shrinkPhoto === 'function' && !/gif$/.test(f.type)) { try { g = await shrinkPhoto(f); } catch (e) { g = f; } }
    if (g.size > MAX_FILE) { BK.err = '"' + f.name + '" is bigger than ' + Math.round(MAX_FILE / 1048576) + ' MB. For a photo, send a screenshot instead; for a big PDF, send the pages you need.'; continue; }
    if (BK.files.reduce((n, x) => n + x.size, 0) + g.size > MAX_TOTAL) { BK.err = 'Those files are too big together. Send them as separate uploads.'; continue; }
    BK.files.push(g);
  }
  rerender();
}
function whoOk(){
  if (approved()) return {name: '', role: ''};
  const n = BK.name.trim(), r = BK.role, e = document.getElementById('bk_who_err');
  const pe = typeof personErr === 'function' ? personErr(n, BK.club) : (n.length < 2 ? 'Enter your name.' : '');
  const msg = pe || (!r ? 'Choose your role at the club.' : ''); if (e) e.textContent = msg;
  if (msg) { const el = document.getElementById(pe ? 'bk_name' : 'bk_role'); el && el.focus && el.focus(); return null; }
  return {name: n, role: r};
}
async function sendUpload(){
  if (BK.busy) return;
  const setErr = m => { BK.err = m; const e = document.getElementById('bkErr'); if (e) e.textContent = m; };
  grab();
  if (!ready()) return setErr('You need to be signed in to send your calendar.');
  const link = BK.link.trim(), text = BK.text.trim();
  if (!BK.files.length && !link && !text) return setErr('Choose a file, paste a link, or paste the dates first.');
  if (link && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link)) return setErr('The link needs to start with https:// (a web address).');
  const who = whoOk(); if (!who) return;
  setErr(''); BK.busy = true; rerender();
  const btn = () => document.getElementById('bkSend');
  let sid = null;
  try {
    const row = {submitter_name: who.name || null, role: who.role || null, club: BK.club.trim() || null, note: BK.note.trim() || null, pasted_text: text || null, link_url: link || null, file_count: BK.files.length};
    const {data, error} = await AUTH.client.from('calendar_submissions').insert(row).select('id,trusted').single();
    if (error || !data) throw new Error(error && error.message || 'save');
    sid = data.id; const trusted = !!data.trusted;
    for (let i = 0; i < BK.files.length; i++) {
      const f = BK.files[i]; if (btn()) btn().textContent = 'Sending file ' + (i + 1) + ' of ' + BK.files.length + '…';
      const b64 = await readB64(f);
      const r2 = await AUTH.client.from('calendar_submission_files').insert({submission_id: sid, name: f.name.slice(0, 200), mime: (f.type || '').slice(0, 120) || null, data: b64});
      if (r2.error) throw new Error('file:' + f.name);
    }
    notify(BK.files.length, !!text, !!link, trusted);
    if (typeof rememberMe === 'function' && who.name) { try { rememberMe({s_name: who.name, s_role: who.role, s_club: BK.club.trim()}); } catch (e) {} }
    BK.done = true; BK.files = []; BK.link = ''; BK.text = ''; BK.note = ''; BK.subs = null; loadSubs(true);
  } catch (e) {
    const m = String(e && e.message || '');
    BK.err = /^file:/.test(m) ? 'We could not save "' + m.slice(5) + '". Please try again, or send it as a photo or by pasting the dates.' : /too many uploads/i.test(m) ? 'You have sent a lot of uploads today. Please try again tomorrow.' : /relation .* does not exist|schema cache|calendar_submissions/i.test(m) ? 'Uploading is not switched on yet. Please try again soon.' : 'We could not send that. Check your connection and try again.';
    BK.subs = null;
  }
  BK.busy = false; rerender(); if (BK.done) { const t = document.getElementById('bkThanks'); t && t.scrollIntoView && t.scrollIntoView({block: 'center'}); }
}
/* One short email to the site owner: a link and counts only. No names, no file contents. */
function notify(nFiles, hasText, hasLink, trusted){
  try {
    const ep = (typeof SITE !== 'undefined' && SITE.formEndpoint || '').replace('formsubmit.co/', 'formsubmit.co/ajax/'); if (!ep) return;
    const parts = [nFiles ? nFiles + ' file' + (nFiles === 1 ? '' : 's') : '', hasLink ? 'a link' : '', hasText ? 'pasted text' : ''].filter(Boolean).join(', ');
    fetch(ep, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({_subject: 'Calendar upload: ' + parts + (trusted ? ' (approved submitter)' : ' (new submitter)'), _captcha: 'false', _template: 'table',
      files: nFiles, link: hasLink ? 'yes' : 'no', pasted_text: hasText ? 'yes' : 'no', approved_submitter: trusted ? 'yes' : 'no',
      open_it: 'https://archerycalendars.com/#/admin/calendars'})}).catch(() => {});
  } catch (e) {}
}
function grab(){ const v = id => (document.getElementById(id) || {}).value; if (document.getElementById('bkText')) { BK.text = v('bkText') || ''; BK.link = v('bkLink') || ''; BK.club = v('bkClub') || ''; BK.note = v('bkNote') || ''; if (document.getElementById('bk_name')) { BK.name = v('bk_name') || ''; BK.role = v('bk_role') || ''; } } }
async function loadSubs(force){
  if (!ready() || BK.loadingSubs || (BK.subs && !force)) return; BK.loadingSubs = true;
  try { const {data, error} = await AUTH.client.from('calendar_submissions').select('id,status,trusted,file_count,link_url,club,submitter_name,submitter_email,pasted_text,proposed,bot_notes,published_count,created_at').order('created_at', {ascending: false}).limit(15); BK.subs = error ? [] : (data || []); } catch (e) { BK.subs = []; }
  BK.loadingSubs = false; const box = document.getElementById('bkMine'); if (box) { box.innerHTML = mySubs(); bindMine(); }
}
function bindMine(){ const box = document.getElementById('bkMine'); if (box && BK.subs) bindPreview(box, BK.subs, 'self', () => { box.innerHTML = mySubs(); bindMine(); }); }
function bulkBind(){
  const $$ = id => document.getElementById(id);
  $$('bkFile') && $$('bkFile').addEventListener('change', async e => { grab(); const picked = Array.from(e.target.files || []); try { e.target.value = ''; } catch (x) {} await addFiles(picked); });
  $$('bkSend') && $$('bkSend').addEventListener('click', sendUpload);
  $$('bkAgain') && $$('bkAgain').addEventListener('click', () => { BK.done = false; BK.err = ''; rerender(); });
  document.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { grab(); BK.files.splice(+b.dataset.rm, 1); rerender(); }));
  ['bkText', 'bkLink', 'bkClub', 'bkNote', 'bk_name', 'bk_role'].forEach(id => $$(id) && $$(id).addEventListener('change', grab));
  if (AUTH && AUTH.user && AUTH.client && typeof isAdmin === 'function' && !isAdmin()) { const em = String(AUTH.user.email || '').toLowerCase(); if (!(em in SUBAPP)) AUTH.client.rpc('email_preapproved', {em}).then(({data}) => { SUBAPP[em] = data === true; if (data === true) rerender(); }, () => {}); }
  if (BK.subs) bindMine(); else loadSubs();
}

/* ---- #/admin/calendars ---- */
const AD = {subs: null, loading: false, tab: 'preview_ready', err: ''};
const ADTABS = [['preview_ready', 'Preview ready'], ['received', 'Waiting to be read'], ['published', 'Published'], ['other', 'Turned down / failed']];
async function adLoad(){
  if (AD.loading || !ready()) return; AD.loading = true;
  try { const {data, error} = await AUTH.client.from('calendar_submissions').select('*').order('created_at', {ascending: false}).limit(80); AD.err = error ? 'Could not load uploads: ' + error.message : ''; AD.subs = data || []; if (!error) { const f = await AUTH.client.from('calendar_submission_files').select('id,submission_id,name,mime,size_bytes'); AD.files = f.data || []; } } catch (e) { AD.err = 'Could not load uploads.'; AD.subs = []; }
  AD.loading = false; rerender();
}
const adIn = (s, t) => (PV[s.id] && PV[s.id].done) ? t === 'preview_ready' : adIn0(s, t);   // a card you just published stays put until you refresh
const adIn0 = (s, t) => t === 'other' ? s.status === 'rejected' || s.status === 'failed' : s.status === t;
function adCard(s){
  const files = (AD.files || []).filter(f => f.submission_id === s.id), st = STATUS[s.status] || STATUS.received;
  const incomplete = s.status === 'received' && files.length < s.file_count;
  return `<article class="panel adm-cal" data-sid="${E(s.id)}"><div class="bk-sub-h"><b>${E(s.submitter_name || s.submitter_email || 'Unknown')}</b> <span class="note">${E(s.submitter_email || '')}${s.role ? ' &middot; ' + E(s.role) : ''}${s.club ? ' &middot; ' + E(s.club) : ''}</span>
      <span class="bk-tag ${s.trusted ? 'bk-t-ok' : 'bk-t-dup'}">${s.trusted ? 'Approved submitter' : 'New submitter'}</span> <span class="bk-tag ${st[1]}">${E(st[0])}</span> <span class="note">${E(when(s.created_at))}</span></div>
    ${s.note ? `<p class="note"><b>Note:</b> ${E(s.note)}</p>` : ''}${s.link_url ? `<p class="note"><b>Link:</b> <a href="${E(s.link_url)}" target="_blank" rel="noopener noreferrer">${E(s.link_url.slice(0, 80))}</a> (open with care)</p>` : ''}
    ${s.pasted_text ? `<details><summary class="note">Pasted text (${s.pasted_text.length} characters)</summary><pre class="bk-pre">${E(s.pasted_text.slice(0, 3000))}</pre></details>` : ''}
    ${files.length ? '<ul class="bk-files">' + files.map(f => `<li><span class="bk-fn">${E(f.name)}</span> <span class="note">${mb(f.size_bytes || 0)}</span> <button type="button" class="btn alt sm" data-dl="${E(f.id)}">Download</button></li>`).join('') + '</ul>' : (s.file_count ? '<p class="note">Files already deleted.</p>' : '')}
    ${incomplete ? '<p class="err">Not all files arrived (' + files.length + ' of ' + s.file_count + '). The reader skips it until they do.</p>' : ''}
    ${s.status === 'preview_ready' ? previewHtml(s, 'admin') : ''}
    ${s.status === 'received' && !incomplete ? '<p class="note">Waiting for the reader (ask Grok Bot to process the calendar inbox).</p>' : ''}
    ${s.status === 'published' ? `<p class="note">${s.published_count} event${s.published_count === 1 ? '' : 's'} published.${s.reviewed_by ? ' By ' + E(s.reviewed_by) + '.' : ''}</p>` : ''}
    ${s.status === 'failed' && s.bot_notes ? `<p class="note"><b>Reader notes:</b> ${E(s.bot_notes)}</p>` : ''}${s.status === 'rejected' && s.reject_reason ? `<p class="note"><b>Reason:</b> ${E(s.reject_reason)}</p>` : ''}</article>`;
}
function bulkAdminView(head){
  if (typeof setTitle === 'function') setTitle('Calendar uploads');
  head = typeof pageHead === 'function' ? pageHead('Admin', 'Calendar uploads', 'mixed') : '';
  if (!AUTH.ready) return `${head}<div class="wrap"><p class="loading">Checking sign-in…</p></div>`;
  if (typeof isAdmin === 'function' && !isAdmin()) return `${head}<div class="wrap narrow"><section class="panel"><p>This page is only for Archery Calendar admins. <a href="#/account">Sign in</a></p></section></div>`;
  if (!AD.subs) { adLoad(); return `${head}<div class="wrap"><p class="loading">Loading uploads…</p></div>`; }
  const tabs = ADTABS.map(([k, l]) => `<button type="button" class="btn sm ${AD.tab === k ? 'gold' : 'alt'}" data-adtab="${k}">${l} (${AD.subs.filter(s => adIn(s, k)).length})</button>`).join(' ');
  const list = AD.subs.filter(s => adIn(s, AD.tab));
  return `${head}<div class="wrap adm-cals"><p><a href="#/admin">&larr; Admin</a></p>${AD.err ? `<p class="err">${E(AD.err)}</p>` : ''}
    <section class="panel"><h2 class="sec">Calendar uploads</h2><p class="note">New submitters: you check the preview and publish. Approved submitters get the preview themselves.</p><div class="row adm-tabs">${tabs} <button type="button" class="btn alt sm" data-adreload="1">Refresh</button></div></section>
    ${list.length ? list.map(adCard).join('') : '<section class="panel"><p class="note">Nothing here.</p></section>'}</div>`;
}
function bulkAdminBind(){
  const root = document.querySelector('.adm-cals'); if (!root || !AD.subs) return;
  root.querySelectorAll('[data-adreload]').forEach(b => b.addEventListener('click', () => { AD.subs = null; rerender(); }));
  root.querySelectorAll('[data-adtab]').forEach(b => b.addEventListener('click', () => { AD.tab = b.dataset.adtab; rerender(); }));
  root.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true; const t = b.textContent; b.textContent = 'Fetching…';
    try { const {data, error} = await AUTH.client.rpc('calendar_file_data', {p_file: b.dataset.dl}); if (error || !data) throw new Error(error && error.message);
      const bin = atob(data.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], {type: data.mime || 'application/octet-stream'})), a = document.createElement('a'); a.href = url; a.download = data.name || 'calendar'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { if (typeof toast === 'function') toast('Could not download that file'); }
    b.disabled = false; b.textContent = t; }));
  bindPreview(root, AD.subs, 'admin', () => { rerender(); });
}
const adminCount = () => AD.subs ? AD.subs.filter(s => s.status === 'preview_ready' || s.status === 'received').length : 0;
window.bulkView = bulkView; window.bulkBind = bulkBind; window.bulkAdminView = bulkAdminView; window.bulkAdminBind = bulkAdminBind;
window.BulkUpload = {THANKS, rowFlags, validIso, PV, BK, AD};
})();
