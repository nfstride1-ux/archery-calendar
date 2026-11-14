/* Search matching for national championships.
   node scripts/search_test.js
   Word order does not matter, simple plurals match both ways, and Archery Australia
   national / Australian Open championships answer national, nationals and australian.
   Owner-only rows are not championships and are not added to the public hay. */
'use strict';
const fs = require('fs');
const path = require('path');
const sb = require('../searchbox.js');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const t = (name, cond, info) => { if (cond) return; fail++; console.log('FAIL', name, info || ''); };

t('championship plural', sb.tokenEq('championship', 'championships') && sb.tokenEq('championships', 'championship'));
t('national plural', sb.tokenEq('national', 'nationals') && sb.tokenEq('nationals', 'national'));
t('field plural', sb.tokenEq('field', 'fields') && sb.tokenEq('fields', 'field'));
t('australian is not a plural of australia', !sb.tokenEq('australian', 'australia') && !sb.tokenEq('australia', 'australian'));
t('short tokens are not plurals', !sb.tokenEq('as', 'a') && !sb.tokenEq('id', 'ids'));

t('plain field search is not a championship query', !sb.champQuery(['field']));
t('gosnells is not a championship query', !sb.champQuery(['gosnells']));
t('national field is a championship query', sb.champQuery(['national', 'field']));
t('championships stems to a championship query', sb.champQuery(['championships']));
t('nationals stems to a championship query', sb.champQuery(['nationals']));

const ev = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8')).events;
const byId = id => ev.find(x => x.id === id);
const field = byId('aa-2027-open-field');
const youth = byId('aa-2027-youth');
const indoor = byId('aa-2027-indoor');
const target = byId('aa-2027-target-para');
const safari = byId('aba-2027-national-safari');
t('catalogue has the 2027 field championships', !!field && !!youth && !!indoor && !!target && !!safari);

for (const x of [field, youth, indoor, target]) t('aa championship ' + x.id, sb.aaChamp(x));
t('safari is not an archery australia championship', !sb.aaChamp(safari));
t('owner-only row is never a championship', !sb.aaChamp({_ownerOnly: true, org_id: 'archery-australia', org: 'Archery Australia', name: 'Australian Open Field Championships', level: 'National'}));
t('club field championship is not one', !sb.aaChamp({org: 'Gosnells Archers', name: 'Gosnells Archers Club Championships 2026 – Field', level: 'Club', discipline: 'Field'}));

t('synonym words on the field championships', sb.aaChampWords(field) === 'national nationals australian');
t('no synonym words on the safari', sb.aaChampWords(safari) === '');

function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}
/* Same fields the in-app search boxes read: name, organiser, discipline, level, place, plus the championship synonyms. */
function hayOf(x) {
  return [...new Set(norm([x.name, x.org, x.discipline, x.level, x.location, x.state, x.state_code, sb.aaChampWords(x)].join(' ')))];
}
const queries = ['national', 'nationals', 'national field', 'australian field', 'field championship', 'field championships', 'field nationals'];
for (const q of queries) {
  const ws = norm(q);
  t('field championships match “' + q + '”', sb.wordsMatch(ws, hayOf(field)));
  t('“' + q + '” is order-independent', sb.wordsMatch(ws, hayOf(field)) === sb.wordsMatch(ws.slice().reverse(), hayOf(field)));
}
t('indoor does not match the field championships', !sb.wordsMatch(norm('national indoor'), hayOf(field)));
t('field does not match the indoor championships', !sb.wordsMatch(norm('national field'), hayOf(indoor)));
t('australian indoor matches the indoor championships', sb.wordsMatch(norm('australian indoor'), hayOf(indoor)));
t('australian target matches the target championships', sb.wordsMatch(norm('australian target'), hayOf(target)));
t('australian youth matches the youth championships', sb.wordsMatch(norm('australian youth'), hayOf(youth)));
t('gosnells does not match the field championships', !sb.wordsMatch(norm('gosnells'), hayOf(field)));

const sample = [safari, {id: 'club', name: 'Gosnells Archers Club Championships 2026 – Field', org: 'Gosnells Archers', discipline: 'Field', level: 'Club', location: 'Gosnells', start_date: '2026-11-14'}, field, indoor];
const ranked = sample.slice().sort((a, b) => sb.byChampThenDate(true, a, b));
t('championship sorts ahead of the earlier safari and club shoot', ranked[0].id === 'aa-2027-open-field' && ranked[1].id === 'aa-2027-indoor', ranked.map(x => x.id).join(','));
const plain = sample.slice().sort((a, b) => sb.byChampThenDate(false, a, b));
t('a normal query stays in date order', plain[0].id === 'club' && plain[1].id === 'aba-2027-national-safari', plain.map(x => x.id).join(','));

const gs = fs.readFileSync(path.join(ROOT, 'gsearch.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
t('global search still hides owner-only events', gs.includes('!x._ownerOnly'));
t('global search hay includes level and championship words', gs.includes('x.level') && gs.includes('aaChampWords(x)') && gs.includes('champStrip'));
t('find events and country search use the same strip', app.includes('champStrip') && app.includes('aaChampWords(x)') && app.includes('tokenEq'));
t('searchbox is loaded before the app', idx.indexOf('searchbox.js?v=search1114') !== -1 && idx.indexOf('searchbox.js') < idx.indexOf('app.js?v=search1114'));
t('changed scripts and the service worker cache were bumped', idx.includes('app.js?v=search1114') && idx.includes('gsearch.js?v=search1114') && idx.includes('whatsnew.js?v=search1114') && sw.includes("const C='archcal-search1114'") && sw.includes('./searchbox.js'));
t('search code does not mention the owner address', !/robinson ave|lingkana/i.test(fs.readFileSync(path.join(ROOT, 'searchbox.js'), 'utf8')));

console.log(fail ? fail + ' failed' : 'search_test: all passed');
process.exit(fail ? 1 : 0);
