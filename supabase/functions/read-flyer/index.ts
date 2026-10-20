// Archery Calendar: read-flyer Edge Function (owner approved 20 Oct 2026).
// The submit page sends a shrunk flyer (base64 JPEG/PNG/WebP, or a small PDF). This reads it with Google Gemini and returns the
// event card fields + a confidence (0-1) per field. The website never sees the AI key: it lives in the Supabase secret GEMINI_API_KEY.
// Abuse limits: signed-in users only (valid Supabase JWT), max ~3 MB of base64, and a per-user daily cap (READ_FLYER_DAILY_CAP,
// default 20) counted in public.flyer_reads (supabase/flyer_reader.sql). If that table is missing, a small per-instance cap applies.
// Deploy: supabase functions deploy read-flyer --project-ref sllsqpfqwckwtljzjxli
//         supabase secrets set GEMINI_API_KEY=... --project-ref sllsqpfqwckwtljzjxli
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.1-flash-lite";
const CAP = Number(Deno.env.get("READ_FLYER_DAILY_CAP") || 20);
const MAX_B64 = 3_000_000;   // ~2.2 MB file
const ORIGINS = ["https://archerycalendars.com", "https://www.archerycalendars.com", "https://nfstride1-ux.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];
const FIELDS = ["title", "club", "start_date", "end_date", "start_time", "venue", "shoot_type", "entry_link", "entry_method",
  "bank_account_name", "bank_bsb", "bank_account", "bank_reference"] as const;
const mem = new Map<string, number>();   // fallback cap when flyer_reads isn't set up: user|day -> count (per warm instance)

const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.includes(o) ? o : ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin"});
const out = (o: string | null, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {status, headers: {...cors(o), "Content-Type": "application/json"}});

const PROMPT = `You read archery event flyers for an events calendar. Return ONLY JSON matching the schema.
Rules: copy what the flyer says; never guess or invent. If a field isn't on the flyer, use "" and confidence 0.
- title: the event's name as printed (e.g. "2027 ABA 3D State Titles").
- club: the host club or organisation.
- start_date / end_date: YYYY-MM-DD. If the year isn't printed, use the next future occurrence and give confidence <= 0.5. One-day event: end_date = start_date.
- start_time: assembly / registration or shooting start, as printed (e.g. "8:00am assembly, 9:00am shooting").
- venue: the range / address as printed.
- shoot_type: one of Target, Field, 3D, Indoor, Clout, Other.
- entry_link: an https URL for entries if printed (no email addresses here). entry_method: short plain words on how to enter (e.g. "Archer's Diary", "Email the secretary", "Pay on the day").
- bank_*: account name, BSB (6 digits), account number and payment reference exactly as printed.
- confidence: 0 to 1 per field, how sure you are it is exactly right (low if blurry, cut off or inferred).`;

const props: Record<string, unknown> = {};
FIELDS.forEach(f => props[f] = {type: "string"});
const SCHEMA = {type: "object", properties: {...props, confidence: {type: "object", properties: Object.fromEntries(FIELDS.map(f => [f, {type: "number"}]))}},
  required: [...FIELDS, "confidence"]};

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", {headers: cors(origin)});
  if (req.method !== "POST") return out(origin, 405, {error: "POST only"});
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return out(origin, 503, {error: "not_configured"});

  // 1. Signed-in users only.
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc, {auth: {persistSession: false}});
  const {data: u, error: ue} = await admin.auth.getUser(jwt);
  if (ue || !u?.user) return out(origin, 401, {error: "sign_in"});
  const uid = u.user.id;

  // 2. Size + type.
  let body: {image?: string; mime?: string};
  try { body = await req.json(); } catch { return out(origin, 400, {error: "bad_json"}); }
  const b64 = String(body.image || "").replace(/^data:[^,]+,/, ""), mime = String(body.mime || "image/jpeg");
  if (!b64) return out(origin, 400, {error: "no_image"});
  if (b64.length > MAX_B64) return out(origin, 413, {error: "too_big"});
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) return out(origin, 415, {error: "type"});

  // 3. Daily cap per user.
  const day = new Date().toISOString().slice(0, 10);
  const {count, error: ce} = await admin.from("flyer_reads").select("id", {count: "exact", head: true}).eq("user_id", uid).gte("created_at", day + "T00:00:00Z");
  if (!ce) { if ((count || 0) >= CAP) return out(origin, 429, {error: "daily_cap", cap: CAP}); await admin.from("flyer_reads").insert({user_id: uid}); }
  else { const k = uid + "|" + day, n = (mem.get(k) || 0) + 1; mem.set(k, n); if (n > CAP) return out(origin, 429, {error: "daily_cap", cap: CAP}); }

  // 4. Ask Gemini.
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST", headers: {"Content-Type": "application/json", "x-goog-api-key": key},
    body: JSON.stringify({contents: [{role: "user", parts: [{text: PROMPT}, {inline_data: {mime_type: mime, data: b64}}]}],
      generationConfig: {temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 2048}})});
  if (!r.ok) { console.error("gemini", r.status, (await r.text()).slice(0, 500)); return out(origin, 502, {error: "ai_failed"}); }
  const j = await r.json();
  const txt = j?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || "").join("") || "{}";
  let f: Record<string, unknown> = {};
  try { f = JSON.parse(txt); } catch { return out(origin, 502, {error: "ai_bad_json"}); }
  const conf = (f.confidence || {}) as Record<string, number>, fields: Record<string, string> = {}, c: Record<string, number> = {};
  FIELDS.forEach(k => { fields[k] = String(f[k] ?? "").trim().slice(0, 300); c[k] = fields[k] ? Math.max(0, Math.min(1, Number(conf[k]) || 0)) : 0; });
  ["start_date", "end_date"].forEach(k => { if (fields[k] && !/^\d{4}-\d{2}-\d{2}$/.test(fields[k])) { fields[k] = ""; c[k] = 0; } });
  if (fields.entry_link && !/^https:\/\/\S+\.\S+/.test(fields.entry_link)) { fields.entry_link = ""; c.entry_link = 0; }
  return out(origin, 200, {fields, confidence: c, model: MODEL});
});
