// Countdown instants use the event's zone (state / country), not the viewer's clock and not UTC.
// An 8:00am Western Australia start is 00:00Z the same day. Read from 6:00pm Perth the evening
// before, that is 14 hours away, not 5 hours (11pm the same evening).
// Run with TZ=UTC so a missed zone lookup cannot pass by accident.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Node 24's `new Date()` does not read a patched Date.now, so today()/iPast would
// use the real clock and treat the November 17 fixtures as already finished.
const RealDate = Date;
function TestDate(...args){
  if (new.target) return args.length ? new RealDate(...args) : new RealDate(TestDate.now());
  return args.length ? RealDate(...args) : RealDate(TestDate.now());
}
TestDate.now = RealDate.now.bind(RealDate);
TestDate.parse = RealDate.parse.bind(RealDate);
TestDate.UTC = RealDate.UTC.bind(RealDate);
TestDate.prototype = RealDate.prototype;
Object.setPrototypeOf(TestDate, RealDate);
Date = TestDate;

function el(){
  return {textContent: '', innerHTML: '', hidden: false, value: '', style: {}, dataset: {}, className: '',
    classList: {add(){}, remove(){}, toggle(){}, contains(){ return false; }},
    setAttribute(){}, getAttribute(){ return ''; }, appendChild(){}, remove(){}, addEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; }, focus(){}, closest(){ return null; },
    getBoundingClientRect(){ return {top: 0, bottom: 0, width: 0, height: 0}; }};
}
const sandbox = {
  console, Intl, Date, Math, JSON, Object, Array, String, Number, RegExp, Promise, Set, Map, Error,
  setTimeout, setInterval, clearTimeout, clearInterval, encodeURIComponent, decodeURIComponent,
  URL, URLSearchParams, NaN, Infinity, undefined, isNaN, parseInt, parseFloat,
  addEventListener(){}, removeEventListener(){},
  requestAnimationFrame(fn){ return setTimeout(fn, 0); },
  navigator: {}, location: {hash: '', protocol: 'http:', href: 'http://localhost/', replace(){}, reload(){}},
  matchMedia(){ return {matches: false, addEventListener(){}}; },
  localStorage: {getItem(){ return null; }, setItem(){}, removeItem(){}},
  CSS: {escape: s => String(s)},
  fetch: () => Promise.reject(new Error('offline')),
  history: {replaceState(){}, pushState(){}, state: null},
  getComputedStyle(){ return {color: '', backgroundColor: '', borderLeftColor: ''}; },
  innerWidth: 1200, innerHeight: 800, scrollY: 0, scrollTo(){}
};
sandbox.sessionStorage = sandbox.localStorage;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.document = {
  getElementById: el, querySelector: el, querySelectorAll: () => [], addEventListener(){},
  body: el(), documentElement: el(), createElement: el, hidden: false
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), sandbox, {filename: 'app.js'});

const cdTargets = sandbox.cdTargets, evTz = sandbox.evTz, cdText = sandbox.cdText, cdBadge = sandbox.cdBadge;
const cdSE = vm.runInContext('cdSE', sandbox);
if (typeof cdTargets !== 'function') { console.error('cdTargets was not loaded'); process.exit(1); }
if (typeof cdSE !== 'function') { console.error('cdSE was not loaded'); process.exit(1); }

const bad = [];
function chk(name, cond, detail){ if (cond) console.log('PASS ' + name); else { bad.push(name); console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); } }
const iso = ms => new Date(ms).toISOString();

const wa = {id: 'tz-wa', name: 'Test Championships', start_date: '2026-11-17', end_date: '2026-11-17', country_code: 'AUS', state: null, state_code: 'WA', start_times: '8:00 am start'};
chk('WA state_code resolves to Perth even when state is empty', evTz(wa) === 'Australia/Perth', evTz(wa));
const waT = cdTargets(wa);
chk('8:00am WA is 00:00Z, not 08:00Z', waT && waT[0][0] === Date.parse('2026-11-17T00:00:00Z'), waT && iso(waT[0][0]));
chk('that target is labelled Starts', waT && waT[0][1] === 'Starts');

const named = {id: 'tz-name', name: 'Test Championships', start_date: '2026-11-17', end_date: '2026-11-17', country_code: 'AUS', state: 'Western Australia', state_code: 'WA', start_times: '8:00 am start'};
chk('full state name Western Australia is Perth', evTz(named) === 'Australia/Perth' && cdTargets(named)[0][0] === Date.parse('2026-11-17T00:00:00Z'));

const region = {id: 'tz-qld', name: 'Test Championships', start_date: '2026-11-17', end_date: '2026-11-17', country_code: 'AUS', state: 'QLD (South)', state_code: 'QLD', start_times: '8:00 am start'};
chk('QLD (South) uses Brisbane', evTz(region) === 'Australia/Brisbane', evTz(region));
chk('8:00am Brisbane is 22:00Z the day before', cdTargets(region)[0][0] === Date.parse('2026-11-16T22:00:00Z'), iso(cdTargets(region)[0][0]));

const sa = {id: 'tz-sa', name: 'Test Championships', start_date: '2026-11-17', end_date: '2026-11-17', state: 'SA', state_code: 'SA', start_times: '8:00 am start'};
chk('SA is Adelaide', evTz(sa) === 'Australia/Adelaide');
chk('8:00am Adelaide in November is 21:30Z the day before', cdTargets(sa)[0][0] === Date.parse('2026-11-16T21:30:00Z'), iso(cdTargets(sa)[0][0]));

const saPm = {name: 'Test Championships', start_times: '4:00 pm start', start_date: '2026-11-07', state: 'SA'};
chk('4:00pm SA on 7 Nov 2026 stays 05:30Z', cdTargets(saPm)[0][0] === Date.UTC(2026, 10, 7, 5, 30) && cdTargets(saPm)[0][1] === 'Starts', iso(cdTargets(saPm)[0][0]));

const peel = {name: 'Peel', start_date: '2026-10-24', end_date: '2026-10-25', state: 'WA', state_code: 'WA', start_times: 'Sat: sign-in 10:00–11:00 am, practice range 10:30–11:30 am, muster 11:45 am, start 12 noon. Sun: sign-in 7:00–8:00 am, practice range 7:30–8:30 am, muster 8:45 am, start 9:00 am, shooters to finish by 3:00 pm.'};
const peelT = cdTargets(peel);
chk('Peel sign-in is 10:00am Perth (02:00Z)', peelT && peelT[0][0] === Date.UTC(2026, 9, 24, 2, 0) && peelT[0][1] === 'Sign-in', peelT && iso(peelT[0][0]) + ' ' + peelT[0][1]);

const was = Date.now;
Date.now = () => Date.parse('2026-11-16T10:00:00Z'); // 6:00pm Perth, the evening before
try {
  const L = cdTargets(wa);
  const text = cdText(L[0][0], L[0][0] + 2 * 864e5, L);
  chk('from 6pm Perth the night before, 8am WA is 14h not 5h', text === '⏱ Starts in 14h 0m 0s', text);
  const badge = cdBadge(wa, true);
  chk('event page countdown carries the Perth instant', badge.includes('data-cdt="' + Date.parse('2026-11-17T00:00:00Z') + '~Starts"'), badge.slice(0, 240));
} finally { Date.now = was; }

const usWa = {_intl: true, country_code: 'USA', us_state: 'WA', state: 'WA', start_date: '2026-11-17', start_times: '8:00 am start', name: 'Washington Indoor'};
chk('US state WA is Pacific time, not Perth', evTz(usWa) === 'America/Los_Angeles', evTz(usWa));
chk('8:00am Pacific in November is 16:00Z', cdTargets(usWa)[0][0] === Date.parse('2026-11-17T16:00:00Z'), iso(cdTargets(usWa)[0][0]));

const nz = {_intl: true, country_code: 'NZL', start_date: '2026-11-17', start_times: '8:00 am start', name: 'Test Championships'};
chk('New Zealand with no tz uses Auckland', evTz(nz) === 'Pacific/Auckland', evTz(nz));
chk('8:00am Auckland in November is 19:00Z the day before', cdTargets(nz)[0][0] === Date.parse('2026-11-16T19:00:00Z'), iso(cdTargets(nz)[0][0]));

const kept = {_intl: true, country_code: 'USA', tz: 'America/New_York', us_state: 'CA', start_date: '2026-11-17', start_times: '8:00 am start', name: 'Test'};
chk('an event tz already on the record is kept', evTz(kept) === 'America/New_York');

const evs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/events.json'), 'utf8')).events;
const awa = evs.find(e => e.id === 'awa-2026-11-29-awa-matchplay-agm');
chk('AWA matchplay data has the flyer shooting time, not 8:00 practice', !!(awa && awa.start_times === 'Shooting commences at 8:30 AM' && !/8:00/.test(awa.start_times)));
const awaT = cdTargets(awa);
chk('AWA matchplay counts down to 8:30am Perth (00:30Z 29 Nov), not midnight', awaT && awaT[0][0] === Date.parse('2026-11-29T00:30:00Z') && awaT[0][1] === 'Starts', awaT && iso(awaT[0][0]) + ' ' + (awaT && awaT[0][1]));

const both = {id: 'tz-both', name: 'Test Championships', start_date: '2026-11-29', end_date: '2026-11-29', state: 'WA', state_code: 'WA', start_times: 'Practice starts at 8:00 AM. Shooting commences at 8:30 AM'};
chk('when practice and shooting are both listed, countdown uses shooting', cdTargets(both)[0][0] === Date.parse('2026-11-29T00:30:00Z'), iso(cdTargets(both)[0][0]));

const pract = {id: 'tz-pract', name: 'Test Championships', start_date: '2026-11-29', end_date: '2026-11-29', state: 'WA', state_code: 'WA', start_times: 'Practice starts at 8:00 AM'};
chk('practice-only time is used, not midnight', cdTargets(pract)[0][0] === Date.parse('2026-11-29T00:00:00Z') && cdTargets(pract)[0][1] === 'Starts', iso(cdTargets(pract)[0][0]));

const bare = {id: 'tz-bare', name: 'Test Championships', start_date: '2026-11-29', state: 'SA', start_times: '1:30 pm'};
chk('a bare clock time with no start/practice word still counts down', cdTargets(bare)[0][0] === Date.parse('2026-11-29T03:00:00Z'), iso(cdTargets(bare)[0][0]));

const noTime = {id: 'tz-none', name: 'Test Championships', start_date: '2026-11-29', end_date: '2026-11-29', state: 'WA', state_code: 'WA'};
chk('no published time: cdTargets is null (no fake midnight instant)', cdTargets(noTime) === null);

const nswShoot = {id: 'tz-nsw-830', name: 'Test Championships', start_date: '2026-11-29', end_date: '2026-11-29', country_code: 'AUS', state: 'NSW', state_code: 'NSW', start_times: 'Shooting commences at 8:30 AM'};
chk('NSW 8:30am in November is 21:30Z the day before', evTz(nswShoot) === 'Australia/Sydney' && cdTargets(nswShoot)[0][0] === Date.parse('2026-11-28T21:30:00Z'), evTz(nswShoot) + ' ' + iso(cdTargets(nswShoot)[0][0]));

const flyerOnly = {id: 'tz-flyer', name: 'Test Championships', start_date: '2026-11-29', end_date: '2026-11-29', state: 'WA', state_code: 'WA', flyer_extract: {start_times: 'Shooting commences 8:30am'}};
chk('empty start_times falls back to flyer_extract shooting time', cdTargets(flyerOnly) && cdTargets(flyerOnly)[0][0] === Date.parse('2026-11-29T00:30:00Z'), cdTargets(flyerOnly) && iso(cdTargets(flyerOnly)[0][0]));

const was2 = Date.now;
Date.now = () => Date.parse('2026-11-28T11:30:00Z'); // 7:30pm Perth, the evening before
try {
  const textAwa = cdText(...cdSE(awa), cdTargets(awa));
  chk('from 7:30pm Perth the night before, 8:30am WA is 13h, not 4h 30m to midnight', textAwa === '⏱ Starts in 13h 0m 0s', textAwa);
  const [sNone, eNone] = cdSE(noTime);
  const textNone = cdText(sNone, eNone, cdTargets(noTime));
  chk('no time from 7:30pm Perth says Starts tomorrow, not hours to midnight', textNone === '⏱ Starts tomorrow' && !/\d+h /.test(textNone), textNone);
  const textNsw = cdText(...cdSE(nswShoot), cdTargets(nswShoot));
  chk('eastern 8:30am viewed at 7:30pm Perth is 10h (Sydney time), not Perth midnight', textNsw === '⏱ Starts in 10h 0m 0s', textNsw);
  const nswNone = {id: 'tz-nsw-none', name: 'Test Championships', start_date: '2026-11-29', end_date: '2026-11-29', state: 'NSW', state_code: 'NSW'};
  const textNswNone = cdText(...cdSE(nswNone), cdTargets(nswNone));
  chk('eastern no-time event at 7:30pm Perth says Starts tomorrow, not 1h 30m to Sydney midnight', textNswNone === '⏱ Starts tomorrow' && !/\d+h /.test(textNswNone), textNswNone);
  const later = Date.parse('2026-11-28T14:00:00Z'); // 10:00pm Perth, already 1:00am 29 Nov in Sydney
  Date.now = () => later;
  const textNswLate = cdText(...cdSE(nswNone), cdTargets(nswNone));
  chk('eastern no-time event already on its venue date says On today, not Live now at midnight', textNswLate === '● On today', textNswLate);
} finally { Date.now = was2; }

console.log(bad.length ? bad.length + ' failed' : 'all passed');
process.exit(bad.length ? 1 : 0);
