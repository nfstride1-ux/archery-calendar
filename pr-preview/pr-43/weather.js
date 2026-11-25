/* Hourly weather forecast for an event's venue (Open-Meteo, free, no key, up to 16 days ahead).
   Same venue point as the globe pin and Directions (evPt). Shown on the event page and in the My events day panel.
   Hours are venue local time (timezone=auto). km/h by default, mph in mph countries, °F in the USA.
   One request per venue point and unit set, cached for an hour; offline or on any error it stays quiet. */
(function(){
const WX_DAYS = 16, WX_TTL = 36e5, WX_STALE = 12 * 36e5, WX_KEEP = 30;
const MPH = new Set(['US','PR','GU','VI','AS','MP','UM','GB','IM','JE','GG','GI','FK','KY','VG','TC','AI','MS','BS','AG','DM','GD','KN','LC','VC','LR','MM']);
const DEGF = new Set(['US','PR','GU','VI','AS','MP','UM','LR','KY','BS','PW','FM','MH']);
const C3 = {USA:'US', GBR:'GB', AUS:'AU', NZL:'NZ', CAN:'CA', CHN:'CN', LBR:'LR', MMR:'MM', PRI:'PR', GUM:'GU'};
const cc = x => !x._intl ? 'AU' : String(x.iso2 || C3[x.country_code] || (/united states|usa/i.test(x.country || '') ? 'US' : /united kingdom|great britain|england|scotland|wales/i.test(x.country || '') ? 'GB' : '')).toUpperCase();
const units = x => { const c = cc(x); return {c, mph: MPH.has(c), f: DEGF.has(c)}; };
const ymd = s => /^\d{4}-\d\d-\d\d$/.test(s || '') ? s : '';
const addD = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const past = x => { const e = ymd(x.end_date) || ymd(x.start_date); return !e || daysTo(e) < 0; };
const dayLbl = (s, o) => pd(s).toLocaleDateString(LOC(), o || {weekday: 'short', day: 'numeric', month: 'short'});
const hLbl = h => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
const comp = d => d == null || !isFinite(d) ? '' : DIRS[Math.round(((d % 360) + 360) % 360 / 45) % 8];
const MEM = {}, INF = {};
const key = (c, u) => 'wx1:' + c.lat.toFixed(3) + ',' + c.lng.toFixed(3) + ':' + (u.mph ? 'mph' : 'kmh') + (u.f ? 'F' : 'C');
function readLS(k){ try { return MEM[k] || JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
function writeLS(k, v){ MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v));
  const ks = Object.keys(localStorage).filter(s => s.startsWith('wx1:')).map(s => [s, (readLS(s) || {}).t || 0]).sort((a, b) => b[1] - a[1]);
  ks.slice(WX_KEEP).forEach(([s]) => localStorage.removeItem(s)); } catch {} }
function wxUrl(c, u){
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + c.lat.toFixed(4) + '&longitude=' + c.lng.toFixed(4) +
    '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto&forecast_days=' + WX_DAYS +
    '&wind_speed_unit=' + (u.mph ? 'mph' : 'kmh') + (u.f ? '&temperature_unit=fahrenheit' : '');
}
// Cached for an hour per venue point; a failed request falls back to a saved forecast up to 12 hours old, else null (no box).
function getWx(c, u){
  const k = key(c, u), hit = readLS(k), now = Date.now();
  if (hit && hit.d && now - hit.t < WX_TTL) return Promise.resolve(hit);
  if (INF[k]) return INF[k];
  const stale = () => hit && hit.d && now - hit.t < WX_STALE ? Object.assign({stale: true}, hit) : null;
  if (navigator.onLine === false) return Promise.resolve(stale());
  return (INF[k] = fetch(wxUrl(c, u), {cache: 'no-store'}).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => {
    if (!j || !j.hourly || !Array.isArray(j.hourly.time)) throw 0;
    const H = j.hourly, d = {tz: j.timezone, abbr: j.timezone_abbreviation, off: j.utc_offset_seconds, lat: j.latitude, lng: j.longitude,
      time: H.time, t: H.temperature_2m, p: H.precipitation_probability, w: H.wind_speed_10m, wd: H.wind_direction_10m, g: H.wind_gusts_10m};
    const v = {t: Date.now(), d}; writeLS(k, v); return v;
  }).catch(() => stale()).finally(() => { delete INF[k]; }));
}
// Shoot hours for a day: the organiser's first time that day (else the event's general times) to 6 pm; about 7 am to 6 pm when unknown.
function hoursFor(x, day){
  let T = null; try { T = typeof evTimes === 'function' ? evTimes(x) : null; } catch {}
  let a = 7, b = 18;
  if (T && T.ok) { const ds = T.days.filter(g => g.items.some(i => i.t)), g = ds.find(g => g.date === day) || ds.find(g => !g.lab) || (ds.length === 1 ? ds[0] : null);
    const hs = g ? g.items.filter(i => i.t).map(i => i.t[0]) : [];
    if (hs.length) { const lo = Math.min(...hs), hi = Math.max(...hs); if (lo >= 5 && lo <= 14) a = lo; if (hi >= 17) b = Math.min(23, hi + 3); } }
  return [a, b];
}
const r0 = v => v == null || !isFinite(v) ? null : Math.round(v);
// Rows for one venue-local day from the cached hourly series.
function dayRows(d, day){
  const out = []; d.time.forEach((s, i) => { if (s.slice(0, 10) === day) out.push({h: +s.slice(11, 13), p: r0(d.p[i]), t: r0(d.t[i]), w: r0(d.w[i]), wd: d.wd[i], g: r0(d.g[i])}); });
  return out;
}
function dayHtml(x, d, day, u, open){
  const rows = dayRows(d, day); if (!rows.length) return '';
  const [a, b] = hoursFor(x, day), shoot = rows.filter(r => r.h >= a && r.h <= b), S = shoot.length ? shoot : rows;
  const max = k => Math.max(...S.map(r => r[k]).filter(v => v != null)), min = k => Math.min(...S.map(r => r[k]).filter(v => v != null));
  const wu = u.mph ? 'mph' : 'km/h', tu = u.f ? '°F' : '°C';
  const sum = [isFinite(min('t')) ? `${min('t')}–${max('t')}${tu}` : '', isFinite(max('p')) ? `rain up to ${max('p')}%` : '', isFinite(max('w')) ? `wind up to ${max('w')} ${wu}` : ''].filter(Boolean).join(' · ');
  const tr = r => { const sh = r.h >= a && r.h <= b;
    return `<tr class="${sh ? '' : 'wx-x'}"${sh ? '' : ' hidden'}><th scope="row">${hLbl(r.h)}</th><td class="wx-p" style="--p:${r.p || 0}%">${r.p == null ? '–' : r.p + '%'}</td><td>${r.w == null ? '–' : esc((comp(r.wd) + ' ' + r.w).trim())}</td><td>${r.g == null ? '–' : r.g}</td><td>${r.t == null ? '–' : r.t + '°'}</td></tr>`; };
  return `<details class="wx-day"${open ? ' open' : ''} data-day="${day}"><summary><b>${esc(dayLbl(day))}</b><span class="wx-sum">${esc(sum)}</span></summary>
    <table class="wx-tbl"><caption class="sr-only">Hourly forecast for ${esc(dayLbl(day, {weekday: 'long', day: 'numeric', month: 'long'}))}</caption>
    <thead><tr><th scope="col">Time</th><th scope="col">Rain</th><th scope="col">Wind <small>${wu}</small></th><th scope="col">Gusts</th><th scope="col">Temp <small>${tu}</small></th></tr></thead>
    <tbody>${rows.map(tr).join('')}</tbody></table></details>`;
}
const tzName = (x, d) => { const tz = (typeof evTz === 'function' && evTz(x)) || d.tz; return (typeof tzNm === 'function' && tzNm(tz) !== tz ? tzNm(tz) : '') || d.abbr || tz || ''; };
const ago = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const credit = (v) => `<p class="note wx-src">Forecast by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>${v ? ` · ${v.stale ? 'saved forecast from ' : 'updated '}${esc(ago(v.t))}` : ''}</p>`;
// Event-page box. Returns the static far-out text when the event is beyond the forecast range.
function boxHtml(x, v, u){
  const d = v.d, first = d.time[0].slice(0, 10), last = d.time[d.time.length - 1].slice(0, 10), s = ymd(x.start_date), e = ymd(x.end_date) || s;
  const days = []; for (let k = s < first ? first : s; k <= e && k <= last; k = addD(k, 1)) days.push(k);
  if (!days.length) return s > last ? farHtml(x) : '';
  const later = e > last ? `<p class="note">Later days: forecast available from ${esc(dayLbl(addD(addD(last, 1), -(WX_DAYS - 1))))}.</p>` : '';
  return `<h2 class="sec">🌦 Weather forecast</h2><p class="note wx-tz">Hour by hour at the venue, in ${esc(tzName(x, d))} (local to the venue). Shoot hours shown.</p>
    ${days.map((k, i) => dayHtml(x, d, k, u, i < 2)).join('')}
    <button type="button" class="linkbtn wx-all" aria-pressed="false">Show the full day</button>${later}${credit(v)}`;
}
function farHtml(x){
  const s = ymd(x.start_date); return `<h2 class="sec">🌦 Weather forecast</h2><p class="note wx-far">Forecast available from ${esc(dayLbl(addD(s, -(WX_DAYS - 1)), {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'}))}.</p>`;
}
const eligible = x => x && ymd(x.start_date) && !past(x) && !x.cancelled && x.status !== 'cancelled';
// What a box should show without fetching: 'far' (beyond 16 days), 'fetch', or '' (nothing).
function plan(x){
  if (!eligible(x) || typeof evPt !== 'function') return ''; const c = evPt(x); if (!c) return '';
  return daysTo(x.start_date) > WX_DAYS - 1 ? 'far' : 'fetch';
}
function fillBox(el){
  const x = BYID[el.dataset.wx], p = x ? plan(x) : '', no = () => { el.hidden = true; el.dataset.wxs = 'none'; };
  if (!p) return no();
  if (p === 'far') { el.innerHTML = farHtml(x); el.hidden = false; el.dataset.wxs = 'far'; return; }
  const c = evPt(x), u = units(x);
  getWx(c, u).then(v => { if (!v || !el.isConnected) return no(); const h = boxHtml(x, v, u); if (!h) return no();
    el.innerHTML = h; el.hidden = false; el.dataset.wxs = el.querySelector('.wx-far') ? 'far' : 'ok'; el.dataset.units = (u.mph ? 'mph' : 'kmh') + (u.f ? 'F' : 'C'); el.dataset.tz = v.d.tz || '';
    const b = el.querySelector('.wx-all'); if (b) b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
      b.textContent = on ? 'Show shoot hours only' : 'Show the full day'; el.querySelectorAll('tr.wx-x').forEach(r => r.hidden = !on); };
    if (/[?&]wx=1/.test(location.hash)) el.scrollIntoView({block: 'start'});
  }).catch(no);
}
// Day panel line (My events on the calendar): one compact summary for that day, linking to the hourly table.
function fillLine(el){
  const x = BYID[el.dataset.wxl], day = el.dataset.day, no = () => { el.hidden = true; el.dataset.wxs = 'none'; };
  if (!x || plan(x) !== 'fetch') return no();
  const u = units(x); getWx(evPt(x), u).then(v => { if (!v || !el.isConnected) return no();
    const rows = dayRows(v.d, day); if (!rows.length) return no();
    const [a, b] = hoursFor(x, day), S = rows.filter(r => r.h >= a && r.h <= b), L = S.length ? S : rows, n = k => L.map(r => r[k]).filter(q => q != null);
    const wu = u.mph ? 'mph' : 'km/h', tu = u.f ? '°F' : '°C';
    const t = [n('t').length ? `${Math.min(...n('t'))}–${Math.max(...n('t'))}${tu}` : '', n('p').length ? `rain ${Math.max(...n('p'))}%` : '', n('w').length ? `wind ${Math.max(...n('w'))} ${wu}` : ''].filter(Boolean).join(' · ');
    el.innerHTML = `🌦 ${esc(t)} <a href="#/shoot/${encodeURIComponent(x.id)}?wx=1">Hourly forecast ›</a>`; el.hidden = false; el.dataset.wxs = 'ok'; }).catch(no);
}
window.wxBox = x => eligible(x) ? `<section class="panel wx" id="wxBox" data-wx="${esc(x.id)}" aria-live="polite" hidden></section>` : '';
window.wxLine = (x, day) => eligible(x) && day >= iso(today()) && daysTo(day) <= WX_DAYS - 1 ? `<div class="meta wx-line" data-wxl="${esc(x.id)}" data-day="${esc(day)}" hidden></div>` : '';
window.wxFill = () => { const els = document.querySelectorAll('[data-wx]:not([data-wx-done]),[data-wxl]:not([data-wx-done])'); if (!els.length) return;
  (typeof loadCoords === 'function' ? loadCoords() : Promise.resolve(null)).then(() => els.forEach(el => { try { el.dataset.wx ? fillBox(el) : fillLine(el); } catch (e) { el.hidden = true; } })); };
window.WX = {units, cc, plan, wxUrl, hoursFor, key};   // for tests
})();
