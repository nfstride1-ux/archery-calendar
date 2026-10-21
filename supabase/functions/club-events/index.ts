// Archery Calendar: club-events Edge Function (owner approved 21 Oct 2026). Trusted clubs push their own events from their own software.
// URL:  https://sllsqpfqwckwtljzjxli.supabase.co/functions/v1/club-events   Docs: https://archerycalendars.com/club-api.html
// Auth: header  X-Api-Key: <club key>.  The club is decided ONLY from the key (never from the request).
// Security design
//  * Keys: secret CLUB_API_KEYS = JSON [{slug, club, state, country, hash (sha256 hex of the key), active}]. Only hashes are stored.
//    Revoke instantly: set "active": false (or remove the entry) with  supabase secrets set CLUB_API_KEYS='[...]'.
//  * No database tables are touched at all. The function can write exactly two kinds of storage object, with fixed names:
//      private bucket club-api-private:  clubs/<slug>.json   (that club's events + call log + rate-limit counters)
//      public  bucket club-api-public:   events.json         (public fields of every club's events; the website reads this)
//    The storage service key lives only inside this function and is never returned or used for anything else.
//  * Strict validation: unknown fields rejected, length limits on every field, no < or > in text, http(s) URLs only,
//    64 KB body limit, max 50 events per request, rate limits per club (30/min, 600/day) and for bad keys per IP.
//  * The website escapes every field on display as well (esc() in app.js).
// Deploy: supabase functions deploy club-events --no-verify-jwt --project-ref sllsqpfqwckwtljzjxli

const SB = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SKEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PRIV = "club-api-private", PUB = "club-api-public";
const MAX_BODY = 65536, MAX_EVENTS = 50, PER_MIN = 30, PER_DAY = 600, MAX_EVENTS_PER_CLUB = 500;
const TYPES = ["Target", "Field", "3D", "Indoor", "Clout", "Other"];
const METHODS = ["archers_diary", "iscored", "assemble", "trybooking", "eventbrite", "online_form", "website", "email", "day", "other"];
const URL_METHODS = ["archers_diary", "iscored", "assemble", "trybooking", "eventbrite", "online_form", "website"];
const EVENT_FIELDS = new Set(["id", "title", "start_date", "end_date", "start_time", "venue", "shoot_type", "entry_link", "entry_method", "entry_email",
  "entry_close_date", "bank_account_name", "bank_bsb", "bank_account", "bank_reference", "rounds", "notes", "flyer_url", "cancelled"]);
const TOP_FIELDS = new Set(["events", "event"]);

type Club = {slug: string; club: string; state: string; country: string; hash: string; active: boolean};
type Ev = Record<string, unknown>;
type State = {events: Record<string, Ev>; calls: number[]; log: unknown[]};

const H = {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "x-api-key, content-type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"};
const out = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 1), {status, headers: H});
class Bad extends Error { constructor(public status: number, msg: string) { super(msg); } }

const clubs = (): Club[] => { try { const a = JSON.parse(Deno.env.get("CLUB_API_KEYS") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
const eq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// ---- bad-key throttle (per warm instance, per IP): 20 bad keys per 10 minutes ----
const badHits = new Map<string, number[]>();
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || "unknown";
const badLimited = (ip: string) => (badHits.get(ip) || []).filter(t => t > Date.now() - 600_000).length >= 20;
const badNote = (ip: string) => { const a = (badHits.get(ip) || []).filter(t => t > Date.now() - 600_000); a.push(Date.now()); badHits.set(ip, a); if (badHits.size > 5000) badHits.clear(); };

// ---- storage (fixed buckets + fixed object names only) ----
const sh = (extra: Record<string, string> = {}) => ({apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...extra});
let bucketsOk = false;
async function ensureBuckets() {
  if (bucketsOk) return;
  for (const [id, pub] of [[PRIV, false], [PUB, true]] as const) {
    const r = await fetch(`${SB}/storage/v1/bucket`, {method: "POST", headers: sh({"Content-Type": "application/json"}),
      body: JSON.stringify({id, name: id, public: pub, file_size_limit: 2097152, allowed_mime_types: ["application/json"]})});
    if (!r.ok && !/exist|duplicate/i.test(await r.text())) throw new Error("storage setup failed");
  }
  bucketsOk = true;
}
async function getJson(bucket: string, path: string) {
  const r = await fetch(`${SB}/storage/v1/object/authenticated/${bucket}/${path}`, {headers: sh()});
  if (r.status === 400 || r.status === 404) { await r.body?.cancel(); return null; }
  if (!r.ok) throw new Error("storage read failed " + r.status);
  return await r.json();
}
async function putJson(bucket: string, path: string, data: unknown, cache = "no-cache") {
  const r = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {method: "POST",
    headers: sh({"Content-Type": "application/json", "x-upsert": "true", "cache-control": cache}), body: JSON.stringify(data)});
  if (!r.ok) throw new Error("storage write failed " + r.status + " " + (await r.text()).slice(0, 200));
}
const statePath = (c: Club) => `clubs/${c.slug}.json`;
const loadState = async (c: Club): Promise<State> => {
  const s = await getJson(PRIV, statePath(c)) as State | null;
  return {events: s?.events || {}, calls: Array.isArray(s?.calls) ? s!.calls : [], log: Array.isArray(s?.log) ? s!.log : []};
};

// Public fields only (what the website shows). Built from every club's private file, so one club can never overwrite another's.
async function publish() {
  const all: Ev[] = [];
  for (const c of clubs().filter(c => c.active)) {
    const s = await loadState(c);
    for (const e of Object.values(s.events)) all.push({...e, club_slug: c.slug, club: c.club, state: c.state, country: c.country});
  }
  all.sort((a, b) => String(a.start_date) < String(b.start_date) ? -1 : 1);
  await putJson(PUB, "events.json", {updated_at: new Date().toISOString(), events: all}, "max-age=30");
}

// ---- validation ----
const clean = (v: unknown, name: string, max: number, opt = true, multi = false): string | null => {
  if (v === undefined || v === null || v === "") { if (opt) return null; throw new Bad(400, `${name} is required`); }
  if (typeof v !== "string") throw new Bad(400, `${name} must be text`);
  let s = v.normalize("NFC").replace(multi ? /[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g : /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, multi ? "" : " ");
  s = multi ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
  if (!s) { if (opt) return null; throw new Bad(400, `${name} is required`); }
  if (s.length > max) throw new Bad(400, `${name} is too long (max ${max} characters)`);
  if (/[<>]/.test(s)) throw new Bad(400, `${name} can't contain < or >`);
  return s;
};
const isoDate = (v: unknown, name: string, opt = true): string | null => {
  if (v === undefined || v === null || v === "") { if (opt) return null; throw new Bad(400, `${name} is required`); }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Bad(400, `${name} must be YYYY-MM-DD`);
  const d = new Date(v + "T00:00:00Z"); if (isNaN(+d) || d.toISOString().slice(0, 10) !== v) throw new Bad(400, `${name} is not a real date`);
  const now = Date.now(); if (+d < now - 400 * 864e5 || +d > now + 3 * 366 * 864e5) throw new Bad(400, `${name} must be within the last year or next 3 years`);
  return v;
};
const webUrl = (v: unknown, name: string): string | null => {
  const s = clean(v, name, 500); if (!s) return null;
  if (/[\s"'`\\]/.test(s)) throw new Bad(400, `${name} must be a plain web address`);
  let u: URL; try { u = new URL(s); } catch { throw new Bad(400, `${name} must be a full web address starting with https://`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Bad(400, `${name} must start with https:// or http://`);
  if (u.username || u.password || !/\./.test(u.hostname) || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname)) throw new Bad(400, `${name} must be a public web address`);
  return u.href;
};
function validate(raw: unknown): Ev {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Bad(400, "each event must be a JSON object");
  const r = raw as Record<string, unknown>;
  const extra = Object.keys(r).filter(k => !EVENT_FIELDS.has(k)); if (extra.length) throw new Bad(400, `unknown field(s): ${extra.slice(0, 5).join(", ").slice(0, 120)}`);
  if (typeof r.id !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(r.id)) throw new Bad(400, "id is required: your own event id, 1-64 letters, numbers, . _ : or -");
  const e: Ev = {id: r.id};
  e.title = clean(r.title, "title", 140, false); if ((e.title as string).length < 3) throw new Bad(400, "title is too short");
  e.start_date = isoDate(r.start_date, "start_date", false);
  e.end_date = isoDate(r.end_date, "end_date") || e.start_date;
  if ((e.end_date as string) < (e.start_date as string)) throw new Bad(400, "end_date is before start_date");
  if ((+new Date(e.end_date + "T00:00:00Z") - +new Date(e.start_date + "T00:00:00Z")) / 864e5 > 31) throw new Bad(400, "events can be at most 31 days long");
  e.start_time = clean(r.start_time, "start_time", 100);
  e.venue = clean(r.venue, "venue", 200, false);
  const t = typeof r.shoot_type === "string" ? TYPES.find(x => x.toLowerCase() === (r.shoot_type as string).trim().toLowerCase()) : undefined;
  if (!t) throw new Bad(400, `shoot_type is required, one of: ${TYPES.join(", ")}`); e.shoot_type = t;
  e.entry_link = webUrl(r.entry_link, "entry_link");
  if (r.entry_method !== undefined && r.entry_method !== null && r.entry_method !== "") {
    if (typeof r.entry_method !== "string" || !METHODS.includes(r.entry_method)) throw new Bad(400, `entry_method must be one of: ${METHODS.join(", ")}`);
    e.entry_method = r.entry_method;
    if (URL_METHODS.includes(r.entry_method) && !e.entry_link) throw new Bad(400, `entry_method ${r.entry_method} needs an entry_link`);
  } else e.entry_method = e.entry_link ? "website" : null;
  const em = clean(r.entry_email, "entry_email", 120);
  if (em && !/^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120}\.[A-Za-z]{2,24}$/.test(em)) throw new Bad(400, "entry_email is not a valid email address");
  e.entry_email = em ? em.toLowerCase() : null;
  if (e.entry_method === "email" && !e.entry_email) throw new Bad(400, "entry_method email needs an entry_email");
  e.entry_close_date = isoDate(r.entry_close_date, "entry_close_date");
  e.bank_account_name = clean(r.bank_account_name, "bank_account_name", 80);
  const bsb = clean(r.bank_bsb, "bank_bsb", 7); if (bsb && !/^\d{3}-?\d{3}$/.test(bsb)) throw new Bad(400, "bank_bsb must be 6 digits (e.g. 105-029)");
  e.bank_bsb = bsb ? bsb.replace(/^(\d{3})-?(\d{3})$/, "$1-$2") : null;
  const acct = clean(r.bank_account, "bank_account", 12); if (acct && !/^\d{4,10}$/.test(acct.replace(/[\s-]/g, ""))) throw new Bad(400, "bank_account must be 4-10 digits");
  e.bank_account = acct ? acct.replace(/[\s-]/g, "") : null;
  e.bank_reference = clean(r.bank_reference, "bank_reference", 40);
  e.rounds = clean(r.rounds, "rounds", 200);
  e.notes = clean(r.notes, "notes", 1000, true, true);
  e.flyer_url = webUrl(r.flyer_url, "flyer_url");
  if (r.cancelled !== undefined && typeof r.cancelled !== "boolean") throw new Bad(400, "cancelled must be true or false");
  e.cancelled = r.cancelled === true;
  for (const k of Object.keys(e)) if (e[k] === null) delete e[k];
  return e;
}

const memCalls = new Map<string, number[]>();   // per-instance limiter, so bursts that race the stored counter are still capped
const memLimited = (slug: string) => { const a = (memCalls.get(slug) || []).filter(t => t > Date.now() - 60_000); a.push(Date.now()); memCalls.set(slug, a); return a.length > PER_MIN; };
let chain: Promise<unknown> = Promise.resolve();   // one write at a time per instance
const serial = <T>(f: () => Promise<T>) => { const p = chain.then(f, f); chain = p.catch(() => {}); return p; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: H});
  const ip = ipOf(req);
  if (!["GET", "POST", "DELETE"].includes(req.method)) return out(405, {ok: false, error: "use GET, POST or DELETE"});
  if (badLimited(ip)) return out(429, {ok: false, error: "too many bad keys, try again later"});
  const key = (req.headers.get("x-api-key") || "").trim();
  const hash = /^[A-Za-z0-9_-]{20,100}$/.test(key) ? await sha256(key) : "";
  const club = hash ? clubs().find(c => c && typeof c.hash === "string" && eq(c.hash, hash)) : undefined;
  if (!club || !club.active || !/^[a-z0-9-]{2,40}$/.test(club.slug)) {
    badNote(ip); console.log(JSON.stringify({t: new Date().toISOString(), club: null, action: "auth", result: 401, ip}));
    return out(401, {ok: false, error: "missing, wrong or revoked X-Api-Key"});
  }
  if (!SB || !SKEY) return out(500, {ok: false, error: "server not configured"});
  if (memLimited(club.slug)) { console.log(JSON.stringify({t: new Date().toISOString(), club: club.slug, action: "rate", result: 429, ip})); return out(429, {ok: false, error: "rate limit: max 30 calls a minute and 600 a day"}); }
  return await serial(async () => {
    const t = new Date().toISOString(); let action = req.method === "GET" ? "list" : req.method === "DELETE" ? "delete" : "upsert", result = 200, ids: string[] = [], err = "";
    let st: State | null = null, snap: Record<string, Ev> | null = null;
    try {
      await ensureBuckets();
      st = await loadState(club);
      const now = Date.now(); st.calls = st.calls.filter(x => x > now - 864e5);
      if (st.calls.filter(x => x > now - 60_000).length >= PER_MIN || st.calls.length >= PER_DAY) throw new Bad(429, "rate limit: max 30 calls a minute and 600 a day");
      st.calls.push(now); snap = structuredClone(st.events);
      if (req.method === "GET") {
        const evs = Object.values(st.events).sort((a, b) => String(a.start_date) < String(b.start_date) ? -1 : 1);
        return out(200, {ok: true, club: club.club, count: evs.length, calls_last_minute: st.calls.filter(x => x > now - 60_000).length, calls_today: st.calls.length, events: evs});
      }
      if (req.method === "DELETE") {
        const id = new URL(req.url).searchParams.get("id") || "";
        if (!/^[A-Za-z0-9._:-]{1,64}$/.test(id)) throw new Bad(400, "add ?id=YOUR_EVENT_ID");
        ids = [id];
        if (!st.events[id]) throw new Bad(404, "no event with that id for your club");
        delete st.events[id]; await putJson(PRIV, statePath(club), st); await publish();
        return out(200, {ok: true, deleted: id});
      }
      // POST
      const len = Number(req.headers.get("content-length") || 0); if (len > MAX_BODY) throw new Bad(413, "body too large (max 64 KB)");
      if (!/application\/json/i.test(req.headers.get("content-type") || "")) throw new Bad(415, "send Content-Type: application/json");
      const text = await req.text(); if (text.length > MAX_BODY) throw new Bad(413, "body too large (max 64 KB)");
      let body: unknown; try { body = JSON.parse(text); } catch { throw new Bad(400, "body is not valid JSON"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Bad(400, 'send {"events": [ ... ]}');
      const extra = Object.keys(body as object).filter(k => !TOP_FIELDS.has(k)); if (extra.length) throw new Bad(400, `unknown field(s): ${extra.slice(0, 5).join(", ").slice(0, 120)}`);
      const b = body as {events?: unknown; event?: unknown};
      const list = Array.isArray(b.events) ? b.events : b.event !== undefined ? [b.event] : null;
      if (!list || !list.length) throw new Bad(400, 'send {"events": [ ... ]} with at least one event');
      if (list.length > MAX_EVENTS) throw new Bad(400, `max ${MAX_EVENTS} events per call`);
      const evs = list.map((x, i) => { try { return validate(x); } catch (e) { if (e instanceof Bad) throw new Bad(e.status, `event ${i + 1}: ${e.message}`); throw e; } });
      ids = evs.map(e => e.id as string);
      if (new Set(ids).size !== ids.length) throw new Bad(400, "the same id appears twice in this call");
      const res: {id: string; result: string}[] = [];
      for (const e of evs) {
        const old = st.events[e.id as string];
        if (!old && Object.keys(st.events).length >= MAX_EVENTS_PER_CLUB) throw new Bad(400, `max ${MAX_EVENTS_PER_CLUB} events per club`);
        st.events[e.id as string] = {...e, created_at: (old?.created_at as string) || t, updated_at: t};
        res.push({id: e.id as string, result: old ? "updated" : "created"});
      }
      await putJson(PRIV, statePath(club), st); await publish();
      return out(200, {ok: true, club: club.club, results: res, page: "https://archerycalendars.com/#/browse"});
    } catch (e) {
      if (st && snap) st.events = snap;   // nothing half-saved
      result = e instanceof Bad ? e.status : 500; err = e instanceof Bad ? e.message : "server error, please try again";
      if (!(e instanceof Bad)) console.error(String(e));
      return out(result, {ok: false, error: err});
    } finally {
      const entry = {t, club: club.slug, action, result, ids: ids.slice(0, 50), ip, ...(err ? {error: err.slice(0, 200)} : {})};
      console.log(JSON.stringify(entry));
      if (st) { st.log.push(entry); st.log = st.log.slice(-1000); try { await putJson(PRIV, statePath(club), st); } catch { /* logged to console above */ } }
    }
  });
});
