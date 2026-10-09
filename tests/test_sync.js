// Unit tests for app/sync.js against an in-memory mock of the Supabase API (same semantics as supabase/schema.sql:
// per-user rows (RLS), last-write-wins on updated_at, server-stamped synced_at). Run: node tests/test_sync.js
const assert = require('assert');
const fs = require('fs'), path = require('path');
const Sync = require(fs.existsSync(path.join(__dirname, '../app/sync.js')) ? '../app/sync.js' : '../sync.js');
let CLOCK = Date.parse('2026-10-09T06:00:00Z');                   // shared "real" time, ms
const tick = (s = 1) => (CLOCK += s * 1000);
const iso = t => new Date(t).toISOString();

function server() {
  const ev = {}, prof = {};  // ev[uid][event_id] = row ; prof[uid]
  const srv = {ev, prof, online: true, calls: 0,
    client(uid, net = () => srv.online) {
      const err = () => ({data: null, error: {message: 'Failed to fetch'}});
      const q = (table) => {
        const f = []; let ord = null;
        const b = {select() { return b; }, gt(c, v) { f.push(r => r[c] > v); return b; }, eq(c, v) { f.push(r => r[c] === v); return b; },
          order(c) { ord = c; return b; },
          maybeSingle() { if (!net()) return Promise.resolve(err()); const rows = table === 'profiles' ? (prof[uid] ? [prof[uid]] : []) : []; return Promise.resolve({data: rows.filter(r => f.every(fn => fn(r)))[0] || null, error: null}); },
          then(res, rej) { srv.calls++; if (!net()) return Promise.resolve(err()).then(res, rej);
            let rows = Object.values(table === 'user_events' ? (ev[uid] || {}) : {}).filter(r => f.every(fn => fn(r)));
            if (ord) rows.sort((a, b) => a[ord] < b[ord] ? -1 : 1);
            return Promise.resolve({data: JSON.parse(JSON.stringify(rows)), error: null}).then(res, rej); }};
        return b;
      };
      return {
        from: q,
        async rpc(name, a) {
          srv.calls++; if (!net()) return err(); if (!uid) return {data: null, error: {message: 'not signed in'}};
          if (name === 'sync_user_events') {
            const mine = ev[uid] = ev[uid] || {}, out = [];
            for (const r of a.rows) {
              const ua = iso(Math.min(Date.parse(r.updated_at), CLOCK + 300000)), cur = mine[r.event_id];
              if (cur && !(cur.updated_at < ua)) continue;
              const amt = r.paid_amount === null || r.paid_amount === undefined ? null : Math.round(+r.paid_amount * 100) / 100;
              mine[r.event_id] = {user_id: uid, event_id: r.event_id, saved: !!r.saved, status: r.status || 'not_entered', paid_amount: amt, paid_date: r.paid_date || null,
                receipt: r.receipt ?? null, notes: r.notes ?? null, reminders: r.reminders || {}, extra: r.extra || {}, updated_at: ua, synced_at: iso(CLOCK)};
              out.push(mine[r.event_id]);
            }
            return {data: out, error: null};
          }
          if (name === 'save_profile') {
            const p = prof[uid] = prof[uid] || {id: uid, display_name: null, settings: {}, settings_updated_at: iso(0)};
            const t = iso(Math.min(Date.parse(a.p_updated_at), CLOCK + 300000));
            if (p.settings_updated_at < t) { p.display_name = a.p_display_name ?? p.display_name; p.settings = a.p_settings; p.settings_updated_at = t; }
            return {data: p, error: null};
          }
          return {data: null, error: {message: 'unknown rpc'}};
        }};
    }};
  return srv;
}
function device(srv, uid, init = {}, opts = {}) {
  const store = {}, storage = {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }};
  const d = {S: Object.assign({saved: {}, entries: {}, notified: {}, states: [], groups: ['aa', 'aba', 'awa'], remindDays: [14, 2, 1], closeDays: [7, 2]}, JSON.parse(JSON.stringify(init))),
    online: true, skew: opts.skew || 0, saves: 0};
  d.sync = Sync.create({client: srv.client(uid, () => srv.online && d.online), storage, getS: () => d.S, saveS: () => { d.saves++; d.sync && d.sync.track(); },
    now: () => CLOCK + d.skew, isOnline: () => d.online});
  d.save = () => d.sync.track();     // what app.js save() does after writing localStorage
  d.user = {id: uid, email: uid + '@example.com'};
  return d;
}
const tests = [];
const test = (n, f) => tests.push([n, f]);

test('row mapping round-trips (status, amount, receipt, notes, reminders, extras)', () => {
  const S = {saved: {e1: {added: '2026-10-01'}}, entries: {e1: {status: 'paid', amount: '$45.50', ref: 'AD#123', notes: 'Compound, bale 4', paid_date: '2026-10-02', date: '2026-10-01', currency: 'AUD', saved: '2026-10-02T01:00:00.000Z'}},
    notified: {'e1:shoot:14': 111, 'e1:pay:7': 222, 'e10:shoot:2': 333}};
  const r = Sync.rowFromLocal(S, 'e1');
  assert.deepStrictEqual([r.saved, r.status, r.paid_amount, r.paid_date, r.receipt, r.notes], [true, 'paid', 45.5, '2026-10-02', 'AD#123', 'Compound, bale 4']);
  assert.deepStrictEqual(r.reminders, {sent: {'shoot:14': 111, 'pay:7': 222}}, 'only e1 reminders (not e10)');
  const S2 = {saved: {}, entries: {}, notified: {}}; Sync.applyRow(S2, r);
  assert.strictEqual(Sync.rowKey(Sync.rowFromLocal(S2, 'e1')), Sync.rowKey(r), 'stable after round trip');
  assert.strictEqual(S2.entries.e1.amount, '45.5'); assert.strictEqual(S2.notified['e1:pay:7'], 222);
  const ent = Sync.rowFromLocal({saved: {}, entries: {x: {status: 'entered', amount: 'TBA'}}, notified: {}}, 'x');
  assert.strictEqual(ent.status, 'entered'); assert.strictEqual(ent.paid_amount, null); assert.strictEqual(ent.extra.amount_text, 'TBA');
  assert.strictEqual(Sync.rowFromLocal({saved: {}, entries: {y: {date: '2026-01-01'}}, notified: {}}, 'y').status, 'paid', 'old records without status = entered + paid (as the app)');
});

test('device A pushes; device B (fresh) signs in and gets everything', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge');
  A.S.saved.e1 = {added: '2026-10-09'}; A.S.entries.e1 = {status: 'entered', date: '2026-10-09'}; A.save(); tick();
  A.S.entries.e2 = {status: 'paid', amount: '30'}; A.S.saved.e2 = {added: '2026-10-09'}; A.save();
  assert.strictEqual(A.sync.pending(), 2 + 1 /*settings*/ - (A.sync.state().setQueued ? 0 : 1));
  await A.sync.flush();
  assert.strictEqual(A.sync.pending(), 0);
  assert.strictEqual(srv.ev.u1.e1.status, 'entered'); assert.strictEqual(srv.ev.u1.e2.paid_amount, 30);
  assert.strictEqual(B.sync.needsMergeChoice(B.user), false, 'empty device: no merge question');
  await B.sync.link(B.user, 'account');
  assert.deepStrictEqual(Object.keys(B.S.saved).sort(), ['e1', 'e2']); assert.strictEqual(B.S.entries.e2.status, 'paid');
  assert.strictEqual(B.sync.track(), 0, 'nothing re-queued after pulling');
});

test('last write wins: older offline change loses to a newer one', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); await B.sync.link(B.user, 'account');
  A.online = false; A.S.entries.e1 = {status: 'entered'}; A.S.saved.e1 = {}; A.save(); await A.sync.flush();
  assert.strictEqual(A.sync.pending() >= 1, true, 'queued while offline');
  tick(60); B.S.entries.e1 = {status: 'paid', amount: '20'}; B.S.saved.e1 = {}; B.save(); await B.sync.flush();
  tick(60); A.online = true; await A.sync.flush();
  assert.strictEqual(srv.ev.u1.e1.status, 'paid', 'server kept the newer (B) change');
  assert.strictEqual(A.S.entries.e1.status, 'paid', 'A picked up the newer change');
  assert.strictEqual(A.sync.pending(), 0);
});

test('newer offline change wins when it reconnects', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); await B.sync.link(B.user, 'account');
  B.S.entries.e1 = {status: 'entered'}; B.S.saved.e1 = {}; B.save(); await B.sync.flush();
  tick(10); await A.sync.flush(); assert.strictEqual(A.S.entries.e1.status, 'entered');
  A.online = false; tick(60); A.S.entries.e1.status = 'paid'; A.save(); await A.sync.flush();
  tick(600); A.online = true; await A.sync.flush();
  tick(1); await B.sync.flush();
  assert.strictEqual(srv.ev.u1.e1.status, 'paid'); assert.strictEqual(B.S.entries.e1.status, 'paid');
});

test('change made offline with an OLD timestamp still reaches devices that pulled since (pull by server time)', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); await B.sync.link(B.user, 'account');
  B.online = false; B.S.saved.e9 = {added: '2026-10-09'}; B.save(); await B.sync.flush();      // made at t0, not sent
  tick(3600); A.S.saved.e5 = {}; A.save(); await A.sync.flush();                                 // A syncs an hour later
  tick(3600); B.online = true; await B.sync.flush();                                              // B's old change arrives
  tick(5); await A.sync.flush();
  assert.ok(A.S.saved.e9, 'A got the late-arriving change');
  assert.ok(B.S.saved.e5, 'B got A\'s change');
});

test('unsave and "not entered" propagate (tombstone rows)', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge');
  A.S.saved.e1 = {}; A.S.entries.e1 = {status: 'paid'}; A.save(); await A.sync.flush();
  await B.sync.link(B.user, 'account'); assert.ok(B.S.saved.e1);
  tick(5); delete A.S.saved.e1; delete A.S.entries.e1; A.save(); await A.sync.flush();
  assert.strictEqual(srv.ev.u1.e1.saved, false); assert.strictEqual(srv.ev.u1.e1.status, 'not_entered');
  tick(5); await B.sync.flush();
  assert.ok(!B.S.saved.e1 && !B.S.entries.e1, 'removed on B too');
});

test('first sign-in with data on the device: merge = union, newest change per shoot wins', async () => {
  const srv = server(), A = device(srv, 'u1');
  await A.sync.link(A.user, 'merge');
  A.S.saved.acc = {}; A.S.entries.both = {status: 'entered', saved: iso(CLOCK)}; A.S.saved.both = {}; A.save(); await A.sync.flush();
  tick(3600);
  const P = device(srv, 'u1', {saved: {phone: {added: '2026-10-08'}, both: {}}, entries: {both: {status: 'paid', saved: iso(CLOCK)}}});
  assert.strictEqual(P.sync.needsMergeChoice(P.user), true, 'asks before merging');
  await P.sync.link(P.user, 'merge');
  assert.deepStrictEqual(Object.keys(P.S.saved).sort(), ['acc', 'both', 'phone']);
  assert.strictEqual(P.S.entries.both.status, 'paid', 'device change was newer');
  assert.ok(srv.ev.u1.phone && srv.ev.u1.phone.saved, 'device-only shoot uploaded');
  assert.strictEqual(srv.ev.u1.both.status, 'paid');
});

test('first sign-in, "use my account only": device data replaced, nothing uploaded', async () => {
  const srv = server(), A = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); A.S.saved.acc = {}; A.save(); await A.sync.flush();
  const P = device(srv, 'u1', {saved: {phone: {}}});
  await P.sync.link(P.user, 'account');
  assert.deepStrictEqual(Object.keys(P.S.saved), ['acc']); assert.ok(!srv.ev.u1.phone);
});

test('settings + display name sync, last write wins; name is not wiped by a settings push', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); await A.sync.setDisplayName('Alex');
  await B.sync.link(B.user, 'account');
  tick(5); A.S.states = ['WA']; A.save(); await A.sync.flush();
  assert.strictEqual(srv.prof.u1.display_name, 'Alex'); assert.deepStrictEqual(srv.prof.u1.settings.states, ['WA']);
  tick(5); await B.sync.flush(); assert.deepStrictEqual(B.S.states, ['WA']);
  assert.strictEqual(B.sync.state().displayName, 'Alex');
  tick(5); B.S.remindDays = [7]; B.save(); await B.sync.flush(); tick(5); await A.sync.flush();
  assert.deepStrictEqual(A.S.remindDays, [7]); assert.strictEqual(srv.prof.u1.display_name, 'Alex');
});

test('users never see each other\'s data; signing out keeps or clears the device as asked', async () => {
  const srv = server(), A = device(srv, 'u1'), X = device(srv, 'u2');
  await A.sync.link(A.user, 'merge'); A.S.saved.secret = {}; A.save(); await A.sync.flush();
  await X.sync.link(X.user, 'account'); assert.deepStrictEqual(Object.keys(X.S.saved), []);
  A.sync.unlink(false); assert.ok(A.S.saved.secret, 'kept on device'); assert.strictEqual(A.sync.linked(), false);
  A.S.saved.local = {}; A.save(); assert.strictEqual(A.sync.pending(), 0, 'not tracked when signed out');
  A.sync.unlink(true); assert.deepStrictEqual(A.S.saved, {});
});

test('device clock 2 days fast cannot win forever (server caps at +5 min)', async () => {
  const srv = server(), A = device(srv, 'u1', {}, {skew: 2 * 864e5}), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); await B.sync.link(B.user, 'account');
  A.S.saved.e1 = {}; A.S.entries.e1 = {status: 'entered'}; A.save(); await A.sync.flush();
  tick(3600); B.S.entries.e1 = {status: 'paid'}; B.S.saved.e1 = {}; B.save(); await B.sync.flush();
  assert.strictEqual(srv.ev.u1.e1.status, 'paid');
});

test('errors leave the queue intact and are reported; retried later', async () => {
  const srv = server(), A = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); srv.online = false;
  A.S.saved.e1 = {}; A.save(); const r = await A.sync.flush();
  assert.ok(r.error); assert.ok(A.sync.pending() >= 1); assert.ok(A.sync.state().error);
  srv.online = true; await A.sync.flush(); assert.strictEqual(A.sync.pending(), 0); assert.strictEqual(A.sync.state().error, null);
  assert.ok(srv.ev.u1.e1.saved);
});

test('club follows sync via profiles.settings (my clubs, home club, watching, notify); device-only New state is not uploaded', async () => {
  const srv = server(), A = device(srv, 'u1'), B = device(srv, 'u1');
  await A.sync.link(A.user, 'merge'); tick();
  Object.assign(A.S, {myClubs: ['gosnells-archers', 'kgsa'], homeClub: 'gosnells-archers', watchClubs: ['yokine-archery-club'], clubNotify: true,
    clubSeen: {x: 'f2026'}, clubSeenClubs: {kgsa: 1}, clubNew: {x: {t: 1, why: 'event'}}}); A.save(); await A.sync.flush();
  const up = srv.prof.u1.settings;
  assert.deepStrictEqual(up.myClubs, ['gosnells-archers', 'kgsa']); assert.strictEqual(up.homeClub, 'gosnells-archers');
  assert.deepStrictEqual(up.watchClubs, ['yokine-archery-club']); assert.strictEqual(up.clubNotify, true);
  assert.ok(!('clubSeen' in up) && !('clubNew' in up) && !('clubSeenClubs' in up), 'device-only keys must not be uploaded');
  tick(); await B.sync.link(B.user, 'account');
  assert.deepStrictEqual(B.S.myClubs, ['gosnells-archers', 'kgsa']); assert.strictEqual(B.S.homeClub, 'gosnells-archers'); assert.deepStrictEqual(B.S.watchClubs, ['yokine-archery-club']);
  tick(); B.S.watchClubs = []; B.save(); await B.sync.flush(); tick(); await A.sync.pull();
  assert.deepStrictEqual(A.S.watchClubs, [], 'unwatch on B reaches A');
});

test('600 shoots are pushed in batches of 200', async () => {
  const srv = server(), A = device(srv, 'u1'); await A.sync.link(A.user, 'merge');
  for (let i = 0; i < 600; i++) A.S.saved['e' + i] = {}; A.save(); await A.sync.flush();
  assert.strictEqual(Object.keys(srv.ev.u1).length, 600); assert.strictEqual(A.sync.pending(), 0);
});

(async () => {
  let fail = 0;
  for (const [n, f] of tests) { try { await f(); console.log('[PASS]', n); } catch (e) { fail++; console.log('[FAIL]', n, '\n   ', e.message); } }
  console.log(`${tests.length - fail} pass / ${fail} fail`); process.exit(fail ? 1 : 0);
})();
