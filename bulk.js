/* Bulk upload: send many events at once from a CSV file (#/submit/bulk).
   Everything is checked in the browser first. Rows that pass go through the same dbSubmit() the single
   "New event" form uses, so the usual approval rules apply (approved clubs go live, everyone else waits for review). */
(function(){
'use strict';
const COLS = [['club', 'Club'], ['event', 'Event name'], ['date', 'Date'], ['end_date', 'End date'], ['start_time', 'Start time'], ['venue', 'Venue / address'], ['town', 'Town'], ['state', 'State'], ['country', 'Country'], ['type', 'Shoot type'], ['fee', 'Entry fee'], ['link', 'Entry link'], ['email', 'Contact email'], ['notes', 'Notes']];
const ALIAS = {club: ['club', 'club name', 'host club', 'organisation', 'organization'], event: ['event name', 'event', 'name', 'title', 'event title', 'shoot name'],
  date: ['date', 'start date', 'event date', 'start'], end_date: ['end date', 'finish date', 'end', 'end date optional'], start_time: ['start time', 'time', 'starts'],
  venue: ['venue address', 'venue', 'address', 'location', 'venue and address'], town: ['town', 'suburb', 'city', 'town suburb'], state: ['state', 'state territory', 'province', 'region'],
  country: ['country'], type: ['shoot type', 'type', 'type of shoot', 'discipline', 'format'], fee: ['entry fee', 'fee', 'cost', 'price'],
  link: ['entry link', 'link', 'entry url', 'registration link', 'registration url', 'url'], email: ['contact email', 'email', 'contact'], notes: ['notes', 'note', 'comments', 'details']};
const MAX_ROWS = 100, MAX_BYTES = 1048576, FUTURE_DAYS = 800;
const hnorm = h => String(h || '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const HMAP = {}; Object.keys(ALIAS).forEach(k => ALIAS[k].forEach(a => { HMAP[hnorm(a)] = k; }));
const MON = {jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12};
const TYPES = ['3D', 'Field', 'Target', 'Indoor', 'Clout', 'Run', 'Hunter', 'Other'];
const TYPE_MAP = [[/^3\s*-?\s*d\b|animal|foam/i, '3D'], [/field|woods|hunter\s*field/i, 'Field'], [/indoor|ibo indoor|vegas|worcester/i, 'Indoor'], [/clout/i, 'Clout'], [/run\b|runs\b|round robin|roving|rover/i, 'Run'], [/hunt/i, 'Hunter'], [/target|taa|wa\b|fita|outdoor|barebow|recurve|compound|olympic/i, 'Target']];
const AU_ST = {nsw: 'NSW', 'new south wales': 'NSW', vic: 'VIC', victoria: 'VIC', qld: 'QLD', queensland: 'QLD', sa: 'SA', 'south australia': 'SA', wa: 'WA', 'western australia': 'WA', 'west australia': 'WA', tas: 'TAS', tasmania: 'TAS', nt: 'NT', 'northern territory': 'NT', act: 'ACT', 'australian capital territory': 'ACT'};
const US_NAMES = {alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'};
const CTRY = [[/^(au|aus|australia)$/i, 'AU'], [/^(us|usa|united states( of america)?)$/i, 'US'], [/^(nz|nzl|new zealand)$/i, 'New Zealand'], [/^(ca|can|canada)$/i, 'Canada'], [/^(uk|gb|gbr|united kingdom|great britain|england|scotland|wales)$/i, 'United Kingdom']];
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const todayIso = () => isoOf(new Date());
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number), t = new Date(y, m - 1, d + n); return isoOf(t); };
const daysBetween = (a, b) => { const f = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 864e5); };
const nice = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'}); };
const sn = t => (typeof snorm === 'function' ? snorm(t) : String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
const E = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]));

/* ---- CSV ---- */
function parseCsv(text){
  text = String(text || '').replace(/^\uFEFF/, '');
  const first = text.split(/\r\n|\n|\r/)[0] || '';
  const count = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
  const delim = [[',', count(',')], [';', count(';')], ['\t', count('\t')]].sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false, i = 0, line = 1, start = 1;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); if (row.some(c => c.trim() !== '')) rows.push({line: start, cells: row}); row = []; start = line; };
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else { if (c === '\n') line++; cell += c; } }
    else if (c === '"' && cell === '') q = true;
    else if (c === delim) endCell();
    else if (c === '\r') { if (text[i + 1] === '\n') i++; line++; endRow(); }
    else if (c === '\n') { line++; endRow(); }
    else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}
const csvCell = v => { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
function templateCsv(){
  const d = addDays(todayIso(), 45);
  const ex = ['EXAMPLE Archery Club (delete this row)', 'EXAMPLE Club Field Championships', d, '', '9:00 am', '1 Example Road', 'Sometown', 'SA', 'Australia', 'Field', '$25', 'https://example.com/enter', 'secretary@example.com', 'Lunch available. Delete this whole row before you upload.'];
  return '\uFEFF' + toCsv([COLS.map(c => c[1]), ex]);
}

/* ---- field parsers ---- */
function parseDate(s){
  s = String(s || '').trim().replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
  let y, m, d, a;
  if ((a = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) { y = +a[1]; m = +a[2]; d = +a[3]; }
  else if ((a = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))) { d = +a[1]; m = +a[2]; y = +a[3]; if (y < 100) y += 2000; }
  else if ((a = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{4})$/i)) && MON[a[2].toLowerCase()]) { d = +a[1]; m = MON[a[2].toLowerCase()]; y = +a[3]; }
  else if ((a = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i)) && MON[a[1].toLowerCase()]) { m = MON[a[1].toLowerCase()]; d = +a[2]; y = +a[3]; }
  else return null;
  const t = new Date(y, m - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== m - 1 || t.getDate() !== d) return null;
  return y + '-' + p2(m) + '-' + p2(d);
}
function parseTime(s){
  s = String(s || '').trim(); if (!s) return {v: ''};
  const a = s.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (a) { let h = +a[1], mi = a[2] ? +a[2] : 0; const ap = a[3] ? a[3][0].toLowerCase() : '';
    if (mi < 60 && ((ap && h >= 1 && h <= 12) || (!ap && h <= 23))) { let sfx = ap; if (!ap) { sfx = h >= 12 ? 'p' : 'a'; if (h > 12) h -= 12; if (h === 0) h = 12; } return {v: h + ':' + p2(mi) + ' ' + sfx + 'm'}; } }
  return /\d/.test(s) ? {v: s.slice(0, 80)} : {v: '', warn: 'Start time left out (it needs a time such as 9:00 am).'};
}
function parseType(s){
  s = String(s || '').trim(); if (!s) return '';
  const hit = TYPES.find(t => t.toLowerCase() === s.toLowerCase()); if (hit) return hit;
  const m = TYPE_MAP.find(([re]) => re.test(s)); return m ? m[1] : '';
}
function parseCountry(s){ s = String(s || '').trim(); if (!s) return {code: 'AU', defaulted: true}; const m = CTRY.find(([re]) => re.test(s)); return {code: m ? m[1] : s.slice(0, 60)}; }
function parseState(s, ctry){
  s = String(s || '').trim(); const k = s.toLowerCase().replace(/\./g, '');
  if (ctry === 'AU') return AU_ST[k] || null;
  if (ctry === 'US') { const u = s.toUpperCase(); return (typeof US_ST !== 'undefined' && US_ST && Object.keys(US_ST).includes(u)) || /^[A-Z]{2}$/.test(u) ? u : (US_NAMES[k] || null); }
  return s;
}
function parseUrl(s){
  s = String(s || '').trim(); if (!s) return {v: ''};
  if (/^mailto:/i.test(s)) return {err: 'Entry link must be a web address (starting with https://).'};
  if (!/^https?:\/\//i.test(s)) { if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s)) s = 'https://' + s; else return {err: 'Entry link is not a web address.'}; }
  try { const u = new URL(s); if (!/\./.test(u.hostname)) return {err: 'Entry link is not a web address.'}; return {v: u.href.length <= 500 ? u.href : s.slice(0, 500)}; } catch (e) { return {err: 'Entry link is not a web address.'}; }
}
function parseFee(s){ s = String(s || '').trim(); if (!s) return ''; return /^\d+(\.\d{1,2})?$/.test(s) ? '$' + s : s.slice(0, 80); }

/* ---- existing events, for duplicate detection ---- */
function clubKey(name){
  const n = sn(name); if (!n) return '';
  const cl = (typeof CLUBS !== 'undefined' ? CLUBS : []).find(c => sn(c.name) === n || (c.aliases || []).some(a => sn(a) === n));
  return cl ? 'c:' + cl.id : 'n:' + n;
}
const clubMatch = name => { const n = sn(name); return n ? (typeof CLUBS !== 'undefined' ? CLUBS : []).find(c => sn(c.name) === n || (c.aliases || []).some(a => sn(a) === n)) || null : null; };
function existingEvents(extra){
  const seen = new Set(), out = [];
  const src = [...(typeof EV !== 'undefined' ? EV : []), ...(typeof INTL !== 'undefined' && INTL ? INTL.events || [] : []), ...(extra || [])];
  src.forEach(x => {
    if (!x) return; const d = x.start_date || x.date; const nm = x.name || x.title; if (!d || !nm) return;
    const cn = x.club_name || (typeof CLUB !== 'undefined' && CLUB[x.club_id] ? CLUB[x.club_id].name : '') || x.host || x.club || x.organiser || '';
    const k = [clubKey(cn), d, sn(nm)].join('|'); if (seen.has(k)) return; seen.add(k);
    out.push({ck: clubKey(cn), d, n: sn(nm), name: nm});
  });
  return out;
}

/* ---- validation: returns one object per data row ---- */
function validate(text, opt){
  opt = opt || {};
  const today = opt.today || todayIso(), email0 = opt.email || '';
  const raw = parseCsv(text);
  if (!raw.length) return {fatal: 'That file is empty.'};
  const head = raw[0].cells.map(hnorm), idx = {}; const unknown = [];
  head.forEach((h, i) => { const k = HMAP[h]; if (k && !(k in idx)) idx[k] = i; else if (h && !k) unknown.push(raw[0].cells[i].trim()); });
  const need = ['club', 'event', 'date'].filter(k => !(k in idx));
  if (need.length) return {fatal: 'The first row must be the column names from the template. Missing: ' + need.map(k => COLS.find(c => c[0] === k)[1]).join(', ') + '.'};
  const data = raw.slice(1);
  if (!data.length) return {fatal: 'The file has the column names but no events under them.'};
  if (data.length > MAX_ROWS) return {fatal: 'That file has ' + data.length + ' events. Please send up to ' + MAX_ROWS + ' at a time (or use the event push API for more).'};
  const exist = existingEvents(opt.extra), seenKey = new Map(), rows = [];
  data.forEach(r => {
    const g = k => (k in idx ? String(r.cells[idx[k]] == null ? '' : r.cells[idx[k]]).replace(/\s+/g, ' ').trim() : '');
    const o = {line: r.line, in: {}, errors: [], warns: [], rec: null, status: 'error'};
    COLS.forEach(([k]) => { o.in[k] = g(k); });
    const err = m => o.errors.push(m), warn = m => o.warns.push(m), I = o.in;
    if (/^EXAMPLE\b/i.test(I.club) || /^EXAMPLE\b/i.test(I.event)) err('This is the example row from the template. Delete it, or replace it with a real event.');
    if (/[<>]/.test(Object.values(I).join(' '))) err('Remove the < and > characters.');
    /* club */
    let club = I.club, cm = null;
    if (!club) err('Club is missing.'); else if (club.length > 120) err('Club name is too long.');
    else { cm = clubMatch(club); if (cm) club = cm.name; else warn('New club to us. We will check it before it goes on the calendar.'); }
    /* event */
    if (!I.event) err('Event name is missing.'); else if (I.event.length > 140) err('Event name is too long (140 letters at most).');
    /* dates */
    let sd = null, ed = null;
    if (!I.date) err('Date is missing.'); else { sd = parseDate(I.date); if (!sd) err('Date “' + I.date + '” is not a date we can read. Use YYYY-MM-DD, like 2027-03-14.'); }
    if (sd && sd < today) err('Date ' + nice(sd) + ' is in the past.');
    if (sd && sd > addDays(today, FUTURE_DAYS)) err('Date ' + nice(sd) + ' is more than two years away. Check the year.');
    if (I.end_date) { ed = parseDate(I.end_date); if (!ed) err('End date “' + I.end_date + '” is not a date we can read.'); else if (sd && ed < sd) err('End date is before the start date.'); else if (sd && daysBetween(sd, ed) > 14) warn('This event runs for ' + (daysBetween(sd, ed) + 1) + ' days. Check the end date.'); }
    if (sd && !ed) ed = sd;
    /* time */
    const tm = parseTime(I.start_time); if (tm.warn) warn(tm.warn);
    /* place */
    const ctry = parseCountry(I.country);
    let st = '';
    if (I.state) { const ps = parseState(I.state, ctry.code); if (ps === null) err('State “' + I.state + '” is not a state we know for ' + (ctry.code === 'AU' ? 'Australia' : 'the United States') + '.'); else st = ps; }
    else if (cm && cm.state && (ctry.defaulted || ctry.code === 'AU')) st = cm.state;
    if (!st && !o.errors.some(e => /^State/.test(e))) { if (ctry.code === 'AU' || ctry.code === 'US') err('State is missing.'); }
    let venue = I.venue, town = I.town;
    if (!venue && !town) err('Venue / address or Town is needed.');
    else { if (venue && town && !sn(venue).includes(sn(town))) venue = venue + ', ' + town; else if (!venue) venue = town; if (!I.venue) warn('No venue address, so the town is shown as the place.'); }
    if (venue.length > 200) err('Venue / address is too long.');
    /* type, fee, link, email, notes */
    const ty = parseType(I.type);
    if (!I.type) warn('No shoot type given, so it will show as Target.'); else if (!ty) warn('Shoot type “' + I.type + '” was not recognised (use 3D, Field, Target, Indoor, Clout, Run or Hunter).');
    const lk = parseUrl(I.link); if (lk.err) err(lk.err);
    let em = I.email; if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) err('Contact email is not a valid email address.'); if (!em) em = email0;
    if (em && /nfshold@|nfstride/i.test(em)) err('Use your own contact email.');
    const fee = parseFee(I.fee);
    const notes = [tm.v && 'Start time: ' + tm.v, fee && 'Entry fee: ' + fee, I.notes].filter(Boolean).join('\n');
    if (notes.length > 1500) err('Notes are too long.');
    /* duplicates */
    let dup = '';
    if (sd && I.event && club) {
      const ck = clubKey(club), n = sn(I.event), key = [ck, sd, n].join('|');
      if (seenKey.has(key)) { dup = 'Same club, date and name as row ' + seenKey.get(key) + ' in this file.'; }
      else { seenKey.set(key, o.line); const hit = exist.find(e => e.ck === ck && e.d === sd && e.n === n);
        if (hit) dup = 'Already on the calendar: “' + hit.name + '” on ' + nice(sd) + '.';
        else { const near = exist.find(e => e.ck === ck && e.d === sd && (e.n.includes(n) || n.includes(e.n)));
          if (near) warn('Looks close to “' + near.name + '”, already on the calendar that day. Check it is not the same event.'); } }
    }
    if (o.errors.length) o.status = 'error';
    else if (dup) { o.status = 'dup'; o.dup = dup; }
    else {
      o.status = o.warns.length ? 'warn' : 'ok';
      const url = lk.v || '', rg = url ? [{m: typeof regMethodOfUrl === 'function' ? regMethodOfUrl(url) : 'website', url}] : [];
      o.rec = {country: ctry.code, state: st, organisation_type: '', club, contact_email: em, name: I.event, start_date: sd, end_date: ed, venue: venue, discipline: ty,
        registration_url: url, register: rg, flyer_link: '', notes};
      o.show = {date: sd, end: ed && ed !== sd ? ed : '', club, name: I.event};
    }
    o.show = o.show || {date: sd || '', end: '', club: club || '', name: I.event || ''};
    rows.push(o);
  });
  return {rows, unknown, today};
}

/* ---- page ---- */
const BULK = {res: null, fileName: '', busy: false, done: false, sent: 0};
const lbl = {ok: 'Ready', warn: 'Ready, check', error: 'Fix this row', dup: 'Already there', sent_live: 'Live now', sent_pend: 'Sent for review', fail: 'Not saved'};
function roleOptions(){ return (typeof ROLE_OPTS !== 'undefined' ? ROLE_OPTS : ['President', 'Secretary', 'Treasurer', 'Committee member', 'Other']); }
function bulkView(){
  const ap = typeof subApproved === 'function' && subApproved();
  const who = ap ? '' : `<div class="bulk-who" id="bkWho"><div class="fld"><label for="bk_name">Your name <span class="req" aria-hidden="true">*</span></label><input id="bk_name" autocomplete="name" maxlength="80"></div>
    <div class="fld"><label for="bk_role">Your role at the club <span class="req" aria-hidden="true">*</span></label><select id="bk_role"><option value="">Choose…</option>${roleOptions().map(o => `<option>${E(o)}</option>`).join('')}</select></div>
    <p class="hint">We check your name and role with the club before anything goes live.</p><p class="err" id="bk_who_err" role="alert"></p></div>`;
  if (typeof setTitle === 'function') setTitle('Bulk upload');
  const head = typeof pageHead === 'function' ? pageHead('Bulk upload', 'Send many events at once from a spreadsheet.', '3d') : '';
  return `${head}<div class="wrap narrow sub bulk">${typeof subTabs === 'function' ? subTabs('bulk') : ''}
  <section class="panel sub-intro"><p class="sub-lead"><b>Send many events at once.</b> Fill in a spreadsheet, save it as a CSV file and upload it. We check every row and show you a preview before anything is sent.</p>
    <p class="note sub-mode">${ap ? 'You’re an approved submitter, so rows that pass go live straight away.' : 'Rows that pass are sent to us to check, usually within 48 hours. Approved clubs go live straight away.'}</p></section>
  <section class="panel bulk-steps"><ol class="bulk-ol">
    <li><b>Get the template.</b> <button type="button" class="btn alt" id="bkTpl">Download CSV template</button><p class="hint">Opens in Excel, Numbers or Google Sheets. Keep the first row (the column names). Delete the example row.</p></li>
    <li><b>Fill in one row per event.</b> Club, Event name and Date are needed on every row, plus a Venue / address or Town, and a State for Australia and the US. Write dates like <b>2027-03-14</b>. Shoot type is one of 3D, Field, Target, Indoor, Clout, Run or Hunter. Start time and Entry fee are added to the event notes.</li>
    <li><b>Choose your file.</b><div class="fld"><label for="bkFile" class="sr-only">CSV file</label><input type="file" id="bkFile" accept=".csv,.txt,text/csv,text/plain"></div><p class="hint">Up to ${MAX_ROWS} events and 1 MB per file. In Excel use <b>Save As → CSV</b>.</p></li></ol>
    ${who}
    <p class="err" id="bkErr" role="alert"></p></section>
  <div id="bkOut" aria-live="polite"></div>
  <section class="panel bulk-help"><h2 class="sec">Prefer to send events from your own software?</h2>
    <p>Clubs that keep their events in their own system can send them straight to us with the <a href="club-api.html">event push API</a> instead. Each club gets its own key, you send up to 50 events per call, and they show on the calendar within a minute. Email <a href="mailto:nfshold@gmail.com">nfshold@gmail.com</a> to ask for a key.</p></section></div>`;
}
function summary(rows){
  const c = {ok: 0, warn: 0, error: 0, dup: 0}; rows.forEach(r => { if (r.out) return; c[r.status]++; });
  return c;
}
function rowHtml(r){
  const st = r.out || r.status, items = [...r.errors.map(e => ['e', e]), ...(r.dup ? [['d', r.dup]] : []), ...r.warns.map(w => ['w', w]), ...(r.outMsg ? [['e', r.outMsg]] : [])];
  const cls = r.out === 'sent_live' || r.out === 'sent_pend' ? 'ok' : r.out === 'fail' ? 'error' : st;
  return `<tr class="bk-${cls}"><td data-l="Row">${r.line}</td><td data-l="Status"><span class="bk-tag bk-t-${cls}">${E(lbl[st])}</span></td>
    <td data-l="Event"><b>${E(r.show.name || '(no name)')}</b><br><span class="note">${E(r.show.club || '(no club)')}</span></td>
    <td data-l="Date">${r.show.date ? E(nice(r.show.date)) + (r.show.end ? '<br><span class="note">to ' + E(nice(r.show.end)) + '</span>' : '') : '<span class="note">–</span>'}</td>
    <td data-l="Notes">${items.length ? '<ul class="bk-list">' + items.map(([k, m]) => `<li class="bk-${k}">${E(m)}</li>`).join('') + '</ul>' : '<span class="note">All good.</span>'}</td></tr>`;
}
function renderOut(){
  const box = document.getElementById('bkOut'); if (!box) return;
  const R = BULK.res; if (!R) { box.innerHTML = ''; return; }
  if (R.fatal) { box.innerHTML = `<section class="panel"><p class="err sum">${E(R.fatal)}</p></section>`; return; }
  const rows = R.rows, c = summary(rows), sendable = rows.filter(r => r.rec && !r.out).length;
  const live = rows.filter(r => r.out === 'sent_live').length, pend = rows.filter(r => r.out === 'sent_pend').length, fail = rows.filter(r => r.out === 'fail').length;
  const ap = typeof subApproved === 'function' && subApproved();
  let top;
  if (BULK.sent) top = `<p class="sub-lead"><b>${live + pend} of ${rows.length} events sent.</b> ${live ? live + ' live on the calendar now. ' : ''}${pend ? pend + ' waiting for our check, usually within 48 hours. ' : ''}${fail ? fail + ' could not be saved, see below. ' : ''}</p>`;
  else top = `<p class="sub-lead"><b>${rows.length} rows read from ${E(BULK.fileName)}.</b> <span class="bk-tag bk-t-ok">${c.ok} ready</span> <span class="bk-tag bk-t-warn">${c.warn} ready, check</span> <span class="bk-tag bk-t-error">${c.error} to fix</span> <span class="bk-tag bk-t-dup">${c.dup} already there</span></p>
    <p class="note">Only the ready rows are sent. Rows to fix and rows already on the calendar are left out. Fix them in your spreadsheet and upload the file again, and the rows already sent will show as “already there”.</p>`;
  const probs = rows.filter(r => r.errors.length || r.dup);
  box.innerHTML = `<section class="panel bulk-prev"><h2 class="sec">Preview</h2>${top}${R.unknown && R.unknown.length ? `<p class="note">Columns we ignored: ${E(R.unknown.join(', '))}.</p>` : ''}
    <div class="bk-scroll"><table class="bk-table"><thead><tr><th>Row</th><th>Status</th><th>Event</th><th>Date</th><th>Notes</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>
    <p class="err" id="bkSendErr" role="alert"></p>
    <div class="row bk-actions">${sendable ? `<button type="button" class="btn gold" id="bkSend" ${BULK.busy ? 'disabled' : ''}>${BULK.busy ? 'Sending…' : (ap ? 'Publish ' : 'Send ') + sendable + ' event' + (sendable === 1 ? '' : 's')}</button>` : ''}
      ${probs.length && !BULK.sent ? '<button type="button" class="btn alt" id="bkProb">Download rows to fix</button>' : ''}${fail ? '<button type="button" class="btn alt" id="bkRetry">Try the unsaved rows again</button>' : ''}
      <button type="button" class="btn alt" id="bkReset">Start again</button></div>
    ${sendable === 0 && !BULK.sent ? '<p class="note">Nothing here can be sent yet. Fix the rows marked in red and upload again.</p>' : ''}</section>`;
  const q = id => document.getElementById(id);
  q('bkSend') && q('bkSend').addEventListener('click', send);
  q('bkRetry') && q('bkRetry').addEventListener('click', () => { rows.forEach(r => { if (r.out === 'fail') { r.out = ''; r.outMsg = ''; } }); renderOut(); send(); });
  q('bkReset') && q('bkReset').addEventListener('click', () => { BULK.res = null; BULK.sent = 0; BULK.fileName = ''; const f = q('bkFile'); if (f) f.value = ''; renderOut(); });
  q('bkProb') && q('bkProb').addEventListener('click', () => {
    const head = ['Problem'].concat(COLS.map(c => c[1]));
    download('rows-to-fix.csv', '\uFEFF' + toCsv([head].concat(probs.map(r => [r.errors.concat(r.dup ? [r.dup] : []).join(' | ')].concat(COLS.map(([k]) => r.in[k]))))));
  });
}
function download(name, text){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv;charset=utf-8'})); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function whoOk(){
  const ap = typeof subApproved === 'function' && subApproved(); if (ap) return {};
  const n = (document.getElementById('bk_name') || {}).value || '', r = (document.getElementById('bk_role') || {}).value || '', e = document.getElementById('bk_who_err');
  const first = (BULK.res && BULK.res.rows && BULK.res.rows.find(x => x.rec)) || null;
  const pe = typeof personErr === 'function' ? personErr(n, first ? first.rec.club : '') : (n.trim().length < 2 ? 'Enter your name.' : '');
  const msg = pe || (!r ? 'Choose your role at the club.' : '');
  if (e) e.textContent = msg; if (msg) { (document.getElementById(pe ? 'bk_name' : 'bk_role') || {}).focus && document.getElementById(pe ? 'bk_name' : 'bk_role').focus(); return null; }
  return {name: n.trim(), role: r};
}
async function send(){
  if (BULK.busy || !BULK.res || !BULK.res.rows) return;
  const er = document.getElementById('bkSendErr'); if (er) er.textContent = '';
  if (!(AUTH && AUTH.client && AUTH.user)) { if (er) er.textContent = 'You need to be signed in to send events.'; return; }
  const who = whoOk(); if (!who) return;
  const ap = subApproved(), todo = BULK.res.rows.filter(r => r.rec && !r.out);
  if (!todo.length) return;
  BULK.busy = true; renderOut();
  const sentNow = [];
  for (const r of todo) {
    const rec = Object.assign({}, r.rec, {submitter_name: ap ? '' : who.name, role: ap ? '' : who.role, phone: ''});
    const btn = document.getElementById('bkSend'); if (btn) btn.textContent = 'Sending ' + (sentNow.length + 1) + ' of ' + todo.length + '…';
    let db = null; try { db = await dbSubmit(rec, null); } catch (e) { db = null; }
    if (db) { r.out = db.status === 'live' ? 'sent_live' : 'sent_pend'; r.id = db.id; sentNow.push(r); }
    else { r.out = 'fail'; r.outMsg = 'We could not save this row. Check your connection and try again.'; }
  }
  BULK.busy = false; BULK.sent = BULK.res.rows.filter(r => r.out === 'sent_live' || r.out === 'sent_pend').length;
  renderOut();
  const bad = BULK.res.rows.filter(r => r.out === 'fail').length;
  if (typeof toast === 'function') toast(sentNow.length + ' event' + (sentNow.length === 1 ? '' : 's') + ' sent' + (bad ? ', ' + bad + ' not saved' : ''));
  if (sentNow.length) notify(sentNow, ap, who);
}
/* One email to the site owner per batch, like the single form sends one per event. */
function notify(sent, ap, who){
  try {
    const ep = (typeof SITE !== 'undefined' && SITE.formEndpoint || '').replace('formsubmit.co/', 'formsubmit.co/ajax/'); if (!ep) return;
    const live = sent.filter(r => r.out === 'sent_live').length, em = AUTH.user.email;
    const lines = sent.map(r => `${r.out === 'sent_live' ? 'LIVE' : 'pending'} | ${r.rec.start_date} | ${r.rec.club} | ${r.rec.name} | id ${r.id}`).join('\n');
    fetch(ep, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({_subject: `${live ? '[LIVE] ' : ''}Bulk upload: ${sent.length} event${sent.length === 1 ? '' : 's'} from ${em}`, _captcha: 'false', _template: 'table',
      uploaded_by: em, name: ap ? '(approved submitter)' : who.name, role: ap ? '' : who.role, events: sent.length, live_now: live, pending_review: sent.length - live,
      message: (live === sent.length ? 'All of these are already live on the site.' : 'Pending ones need approving in the admin page.') + '\n\n' + lines})}).catch(() => {});
  } catch (e) {}
}
async function loadMine(){
  /* the signed-in user's own earlier submissions (pending ones are not on the calendar yet) count for duplicate checks */
  try { if (AUTH && AUTH.client && AUTH.user) { const {data} = await AUTH.client.from('submitted_events').select('name,club,start_date,status').neq('status', 'rejected').limit(500); return (data || []).map(x => ({name: x.name, club_name: x.club, start_date: x.start_date})); } } catch (e) {}
  return [];
}
function bulkBind(){
  const $$ = id => document.getElementById(id);
  $$('bkTpl') && $$('bkTpl').addEventListener('click', () => download('archery-calendar-bulk-template.csv', templateCsv()));
  $$('bkFile') && $$('bkFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const mine = await loadMine(); BULK.mine = mine;
    const fr = new FileReader(), er = $$('bkErr'); if (er) er.textContent = ''; BULK.sent = 0;
    if (f.size > MAX_BYTES) { BULK.res = {fatal: 'That file is bigger than 1 MB. Please send fewer events at a time.'}; renderOut(); return; }
    if (/\.(xlsx?|ods|numbers)$/i.test(f.name)) { BULK.res = {fatal: 'That is a spreadsheet file. Please save it as CSV first (in Excel: File → Save As → CSV), then choose the CSV file.'}; renderOut(); return; }
    fr.onload = () => { BULK.fileName = f.name; BULK.res = validate(String(fr.result || ''), {email: AUTH && AUTH.user ? AUTH.user.email : '', extra: mine}); renderOut(); const o = $$('bkOut'); o && o.scrollIntoView && o.scrollIntoView({block: 'start'}); };
    fr.onerror = () => { BULK.res = {fatal: 'We could not read that file. Try saving it as CSV again.'}; renderOut(); };
    fr.readAsText(f);
  });
  if (AUTH && AUTH.user && AUTH.client && typeof isAdmin === 'function' && !isAdmin()) { const em = String(AUTH.user.email || '').toLowerCase(); if (!(em in SUBAPP)) AUTH.client.rpc('email_preapproved', {em}).then(({data}) => { SUBAPP[em] = data === true; if (data === true) softRenderForce(); }, () => {}); }
  renderOut();
}
window.bulkView = bulkView; window.bulkBind = bulkBind;
window.BulkUpload = {parseCsv, validate, templateCsv, parseDate, parseTime, COLS};
})();
