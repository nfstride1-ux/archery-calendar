/* Archery Calendar – account sync (Supabase). Loaded always; does nothing unless app/config.js has SUPABASE_URL + SUPABASE_ANON_KEY.
   Model: the device keeps working from localStorage exactly as before. Every save() calls ArchSync.track(), which diffs the
   device data against what the server last had and queues changed shoots with a device timestamp (updated_at).
   flush() pushes the queue (rpc sync_user_events: last write wins on updated_at), then pulls rows changed on the server since the
   last pull (by server time synced_at). Offline: the queue is kept in localStorage and pushed when the browser is back online.
   Pure logic (row mapping, diff, merge) is exported for the unit tests in tools/test_sync.js. */
(function (root) {
  'use strict';
  const SKEY = 'archreg.sync.v1';
  const SETTING_KEYS = ['states', 'groups', 'remindDays', 'closeDays', 'countries', 'orgs', 'world', 'myClubs', 'homeClub', 'watchClubs', 'clubNotify'];
  const ST_OUT = {none: 'not_entered', entered: 'entered', paid: 'paid'};
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v ?? null);
  const clean = o => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') r[k] = v; return r; };

  /* ---------- device data <-> server row ---------- */
  function localIds(S) { const ids = new Set([...Object.keys(S.saved || {}), ...Object.keys(S.entries || {})]);
    for (const k of Object.keys(S.notified || {})) ids.add(k.split(':').slice(0, -2).join(':')); ids.delete(''); return [...ids]; }
  function rowFromLocal(S, id) {
    const e = (S.entries || {})[id], sv = (S.saved || {})[id], sent = {};
    for (const [k, t] of Object.entries(S.notified || {})) if (k.startsWith(id + ':') && k.split(':').slice(0, -2).join(':') === id) sent[k.slice(id.length + 1)] = t;
    const status = !e ? 'not_entered' : e.status === 'entered' ? 'entered' : 'paid';
    const amt = e && e.amount !== undefined && e.amount !== '' && isFinite(+String(e.amount).replace(/[$,\s]/g, '')) ? Math.round(+String(e.amount).replace(/[$,\s]/g, '') * 100) / 100 : null;
    return {
      event_id: id, saved: !!sv, status,
      paid_amount: amt !== null && amt >= 0 && amt < 100000 ? amt : null,
      paid_date: e && isDate(e.paid_date) ? e.paid_date : null,
      receipt: e && e.ref ? String(e.ref).slice(0, 200) : null,
      notes: e && e.notes ? String(e.notes).slice(0, 2000) : null,
      reminders: Object.keys(sent).length ? {sent} : {},
      extra: clean({added: sv && sv.added, date: e && e.date, currency: e && e.currency, link: e && e.link,
        amount_text: e && e.amount !== undefined && e.amount !== '' && amt === null ? String(e.amount).slice(0, 40) : undefined,
        changed: e && e.saved}),
    };
  }
  const rowKey = r => stable({s: !!r.saved, st: r.status || 'not_entered', a: r.paid_amount === null || r.paid_amount === undefined ? null : +r.paid_amount,
    d: r.paid_date || null, rc: r.receipt || null, n: r.notes || null, rm: r.reminders || {}, x: r.extra || {}});
  const isEmptyRow = r => !r.saved && r.status === 'not_entered' && !Object.keys((r.reminders || {}).sent || {}).length;
  function applyRow(S, r) {   // server row -> device data
    const id = r.event_id, x = r.extra || {};
    S.saved = S.saved || {}; S.entries = S.entries || {}; S.notified = S.notified || {};
    if (r.saved) S.saved[id] = clean({added: x.added}); else delete S.saved[id];
    if (r.status === 'entered' || r.status === 'paid') {
      S.entries[id] = clean({status: r.status, date: x.date, currency: x.currency, link: x.link, saved: x.changed,
        amount: r.paid_amount !== null && r.paid_amount !== undefined ? String(+r.paid_amount) : x.amount_text,
        paid_date: r.paid_date, ref: r.receipt, notes: r.notes});
    } else delete S.entries[id];
    for (const k of Object.keys(S.notified)) if (k.startsWith(id + ':') && k.split(':').slice(0, -2).join(':') === id) delete S.notified[k];
    for (const [k, t] of Object.entries((r.reminders || {}).sent || {})) S.notified[id + ':' + k] = t;
  }
  const settingsOf = S => { const o = {}; for (const k of SETTING_KEYS) if (S[k] !== undefined) o[k] = S[k]; return o; };
  const localTime = (S, id) => { const e = (S.entries || {})[id], s = (S.saved || {})[id];
    const t = e && e.saved ? Date.parse(e.saved) : s && s.added ? Date.parse(s.added + 'T12:00:00') : NaN; return isNaN(t) ? 0 : t; };
  /* first sign-in on this device: merge device data with the account (per shoot, newest change wins; device-only shoots are added) */
  function planMerge(S, remoteRows, now) {
    const remote = new Map(remoteRows.map(r => [r.event_id, r])), apply = [], push = [];
    for (const id of localIds(S)) {
      const l = rowFromLocal(S, id), r = remote.get(id);
      if (!r) { if (!isEmptyRow(l)) push.push({...l, updated_at: new Date(localTime(S, id) || now).toISOString()}); continue; }
      if (rowKey(l) === rowKey(r)) continue;
      const lt = localTime(S, id), rt = Date.parse(r.updated_at) || 0;
      if (lt > rt) push.push({...l, updated_at: new Date(lt).toISOString()}); else apply.push(r);
    }
    for (const r of remoteRows) if (!localIds(S).includes(r.event_id)) apply.push(r);
    return {apply, push};
  }

  /* ---------- engine ---------- */
  function create(opts) {
    const {client, storage, getS, saveS, onChange = () => {}, now = () => Date.now(), isOnline = () => true} = opts;
    let st = load(), busy = null, timer = null, user = null;
    function load() { try { return Object.assign(fresh(), JSON.parse(storage.getItem(SKEY) || '{}')); } catch { return fresh(); } }
    function fresh() { return {uid: null, base: {}, queue: {}, lastPull: null, setBase: null, setQueued: null, lastSync: null, error: null}; }
    const persist = () => storage.setItem(SKEY, JSON.stringify(st));
    let lastT = 0; const nowIso = () => { lastT = Math.max(now(), lastT + 1); return new Date(lastT).toISOString(); };   // strictly increasing
    const linked = () => !!(user && st.uid === user.id);

    function track() {             // called after every local save()
      if (!linked()) return;
      const S = getS(), ids = new Set([...localIds(S), ...Object.keys(st.base)]);
      let changed = 0;
      for (const id of ids) {
        const row = rowFromLocal(S, id), k = rowKey(row);
        if (st.base[id] === k) continue;
        if (st.base[id] === undefined && isEmptyRow(row)) continue;
        st.queue[id] = {...row, updated_at: nowIso()}; st.base[id] = k; changed++;
      }
      const sk = stable(settingsOf(S));
      if (st.setBase !== sk) { st.setBase = sk; st.setQueued = {settings: settingsOf(S), updated_at: nowIso()}; changed++; }
      if (changed) { persist(); schedule(); }
      return changed;
    }
    function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), ms); }
    const pending = () => Object.keys(st.queue).length + (st.setQueued ? 1 : 0);

    async function flush() {
      if (busy) return busy;
      busy = (async () => {
        if (!linked()) return {skipped: 'not signed in'};
        if (!isOnline()) { st.error = 'offline'; persist(); onChange(); return {skipped: 'offline'}; }
        try {
          const q = Object.values(st.queue);
          for (let i = 0; i < q.length; i += 200) {
            const chunk = q.slice(i, i + 200), {error} = await client.rpc('sync_user_events', {rows: chunk});
            if (error) throw error;
            for (const r of chunk) if (st.queue[r.event_id] && st.queue[r.event_id].updated_at === r.updated_at) delete st.queue[r.event_id];
            persist();
          }
          if (st.setQueued) {
            const sq = st.setQueued, {error} = await client.rpc('save_profile', {p_display_name: st.displayName ?? null, p_settings: sq.settings, p_updated_at: sq.updated_at});
            if (error) throw error;
            if (st.setQueued === sq) st.setQueued = null; persist();
          }
          await pull();
          st.lastSync = nowIso(); st.error = null; persist(); onChange();
          return {ok: true};
        } catch (e) { st.error = String(e && e.message || e); persist(); onChange(); return {error: st.error}; }
      })();
      try { return await busy; } finally { busy = null; }
    }
    async function pull() {
      const S = getS(); let n = 0, maxT = st.lastPull;
      // 2-minute overlap: a write committed just before our last pull is never missed (re-applying a row is harmless)
      let qb = client.from('user_events').select('*');
      if (st.lastPull) qb = qb.gt('synced_at', new Date(Date.parse(st.lastPull) - 120000).toISOString());
      const {data, error} = await qb.order('synced_at', {ascending: true});
      if (error) throw error;
      for (const r of data || []) {
        if (!maxT || r.synced_at > maxT) maxT = r.synced_at;
        const q = st.queue[r.event_id];
        if (q && Date.parse(q.updated_at) > Date.parse(r.updated_at)) continue;      // our newer change wins; it'll be pushed
        if (q) delete st.queue[r.event_id];
        const k = rowKey(r); if (st.base[r.event_id] === k && rowKey(rowFromLocal(S, r.event_id)) === k) continue;
        applyRow(S, r); st.base[r.event_id] = k; n++;
      }
      const {data: prof, error: pe} = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (pe) throw pe;
      if (prof) {
        st.displayName = prof.display_name; st.email = user.email;
        const remoteT = Date.parse(prof.settings_updated_at) || 0, localT = st.setQueued ? Date.parse(st.setQueued.updated_at) : (st.setTime || 0);
        if (prof.settings && Object.keys(prof.settings).length && remoteT > localT && stable(prof.settings) !== st.setBase) {
          Object.assign(S, prof.settings); st.setBase = stable(settingsOf(S)); st.setQueued = null; n++;
        }
        st.setTime = Math.max(remoteT, localT);
      }
      st.lastPull = maxT; persist();
      if (n) { saveS(); }
      return n;
    }
    async function fetchAll() {
      const {data, error} = await client.from('user_events').select('*').order('synced_at', {ascending: true});
      if (error) throw error; return data || [];
    }
    /* sign-in on this device. mode: 'merge' (add device data to the account) | 'account' (replace device data with the account's) */
    async function link(u, mode) {
      user = u;
      if (st.uid === u.id) { schedule(10); return {already: true}; }
      const S = getS(), remote = await fetchAll();
      st = fresh(); st.uid = u.id; st.email = u.email;
      if (mode === 'account') { for (const id of localIds(S)) applyRow(S, {event_id: id, saved: false, status: 'not_entered'}); remote.forEach(r => applyRow(S, r)); }
      else { const plan = planMerge(S, remote, now()); plan.apply.forEach(r => applyRow(S, r)); for (const r of plan.push) st.queue[r.event_id] = r; }
      for (const id of localIds(S)) st.base[id] = rowKey(rowFromLocal(S, id));
      for (const r of remote) if (!st.queue[r.event_id]) st.base[r.event_id] = rowKey(r);
      st.lastPull = remote.reduce((m, r) => !m || r.synced_at > m ? r.synced_at : m, null);
      // settings: the account's settings win, unless the account has none yet (then this device's are uploaded)
      const {data: prof} = await client.from('profiles').select('*').eq('id', u.id).maybeSingle();
      st.displayName = prof && prof.display_name;
      if (prof && prof.settings && Object.keys(prof.settings).length && mode !== 'merge-device-settings') { Object.assign(S, prof.settings); st.setTime = Date.parse(prof.settings_updated_at) || 0; }
      else st.setQueued = {settings: settingsOf(S), updated_at: nowIso()};
      st.setBase = stable(settingsOf(S));
      persist(); saveS();
      return flush();
    }
    const needsMergeChoice = u => st.uid !== u.id && localIds(getS()).some(id => !isEmptyRow(rowFromLocal(getS(), id)));
    function setUser(u) { user = u; if (u && st.uid === u.id) schedule(10); }
    async function setDisplayName(name) { st.displayName = String(name || '').trim().slice(0, 80) || null; st.setQueued = st.setQueued || {settings: settingsOf(getS()), updated_at: nowIso()}; st.setQueued.updated_at = nowIso(); persist(); return flush(); }
    function unlink(clearDevice) { st = fresh(); persist(); user = null; if (clearDevice) { const S = getS(); S.saved = {}; S.entries = {}; S.notified = {}; saveS(); } }
    return {track, flush, pull, link, unlink, setUser, setDisplayName, needsMergeChoice, pending, state: () => st, linked, user: () => user};
  }
  const api = {create, rowFromLocal, applyRow, rowKey, localIds, planMerge, settingsOf, stable, SKEY, SETTING_KEYS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ArchSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
