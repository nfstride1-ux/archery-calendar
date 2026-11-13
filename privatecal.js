/* Owner-only nights on My events (Lingkana League, invite only).
   These are not public events: they are never added to EV, data/events.json, search, Near me,
   Find events, international pages, sitemaps or static event pages.
   They render only when the signed-in account is a site-owner admin email, the same list as
   ADMIN_EMAILS / public.admins (app.js isAdmin). Anyone else, including signed-out visitors, gets nothing.
   ScoreTool (a different site) already publishes the night results. Nights 1–6:
   https://nfstride1-ux.github.io/scoretool-demo/#lk-results&n=N
   Night 7 is the shoot-up. ScoreTool has no night-7 results hash (lkResNightFromHash only accepts 1–6);
   that night links to the league home, which is where the shoot-up is described. */
(function (root) {
  'use strict';
  const PC_OWNER_EMAILS = ['nfshold@gmail.com', 'nfstride1@gmail.com'];
  const PC_BASE = 'https://nfstride1-ux.github.io/scoretool-demo/';
  const PC_LEAGUE_URL = PC_BASE + '#lk-home';
  const PC_INVITE = 'lk-onion26';
  const PC_HOURS = 'Induction 6:00 pm, shooting 6:30 pm to about 9:00 pm';
  const PC_WHERE = 'Lingkana Archery range, 107 Robinson Ave, Belmont';
  const PC_FEE = '$25 range fee + $10 into the pot. Pot split 60/30/10. The range fee is not in the pot.';
  const PC_ROUND = 'Lancaster 660. 20 ends of 3 at 18 m, triangular 40 cm 3-spot, X scores 11, max 660. Best 4 of 6 nights count.';
  const PC_SHOOTUP = '150 warm-up (not scored), then the ladder shoot-up for the top 12.';

  const pcEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pcResultsUrl = night => (night >= 1 && night <= 6) ? PC_BASE + '#lk-results&n=' + night : PC_LEAGUE_URL;
  const pcLabel = d => new Date(d + 'T12:00:00+08:00').toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Perth'});

  const PC_DATES = [
    ['2026-11-18', 1, false],
    ['2026-12-02', 2, false],
    ['2026-12-16', 3, false],
    ['2026-12-30', 4, false],
    ['2027-01-13', 5, false],
    ['2027-01-27', 6, false],
    ['2027-02-10', 7, true]
  ];

  const PC_NIGHTS = PC_DATES.map(([date, night, shootup]) => {
    const results_url = pcResultsUrl(night);
    return {
      id: 'lk-night-' + night + '-' + date,
      night, shootup, start_date: date, end_date: date,
      name: shootup ? 'Lingkana League · Night 7 · Shoot-up' : 'Lingkana League · Night ' + night,
      label: pcLabel(date),
      location: PC_WHERE, state: 'WA', state_code: 'WA', country: 'Australia', country_code: 'AUS',
      discipline: 'Indoor', rounds: shootup ? 'Shoot-up' : 'Lancaster 660',
      round: shootup ? PC_SHOOTUP : PC_ROUND,
      start_times: PC_HOURS, fee: PC_FEE, org: 'Lingkana Archery',
      level: 'Invite only', category: 'competition', info_only: true, _ownerOnly: true,
      tz: 'Australia/Perth', invite: PC_INVITE,
      results_url, source_url: results_url,
      results_note: shootup ? 'ScoreTool has no separate results page for the shoot-up. This opens the league home.' : 'Opens this night’s scores and the best-4 standings.'
    };
  });
  const PC_IDS = new Set(PC_NIGHTS.map(x => x.id));

  const pcIsOwner = user => {
    const em = String(user && user.email || '').trim().toLowerCase();
    return !!em && PC_OWNER_EMAILS.includes(em);
  };
  const pcEventsFor = user => pcIsOwner(user) ? PC_NIGHTS.slice() : [];
  const pcByIdFor = (user, id) => pcEventsFor(user).find(x => x.id === id) || null;
  const pcIsPrivateId = id => PC_IDS.has(id);
  const pcEvents = () => pcEventsFor(typeof AUTH !== 'undefined' ? AUTH.user : null);
  const pcById = id => pcByIdFor(typeof AUTH !== 'undefined' ? AUTH.user : null, id);

  function pcSeasonHtml(){
    const L = pcEvents(); if (!L.length) return '';
    const e = typeof esc === 'function' ? esc : pcEsc;
    return `<section class="panel" id="pcLeague" aria-labelledby="pcLeagueH"><h2 class="sec" id="pcLeagueH">Lingkana League</h2>
      <p class="note">Invite only. These nights are on your My events calendar and are hidden from everyone else.</p>
      <ul class="dp-list">${L.map(x => `<li class="dp-row" data-pc-night="${x.night}"><div class="dp-main"><a class="pc-open" href="#/shoot/${encodeURIComponent(x.id)}"><b>${e(x.name)}</b></a> <a class="b res-lnk pc-res" data-pc-res="${x.night}" href="${e(x.results_url)}" target="_blank" rel="noopener">ScoreTool results</a><div class="meta">${e(x.label)} · ${e(x.start_times)}</div></div></li>`).join('')}</ul></section>`;
  }
  function pcShootHtml(x){
    if (!x) return '';
    const e = typeof esc === 'function' ? esc : pcEsc;
    const nightSpecific = x.night >= 1 && x.night <= 6;
    return `<div class="wrap detail"><div class="main"><p class="note"><a href="#/calendar">← My events</a></p>
      <section class="panel" id="pcNight"><h2 class="sec">${e(x.name)}</h2>
      <p class="note">Invite only. Only you can see this night.</p>
      <dl class="kv">
        <dt>When</dt><dd>${e(x.label)}<br><span class="note">${e(x.start_times)}. Perth time (Australia/Perth).</span></dd>
        <dt>Where</dt><dd>${e(x.location)}${x.state ? ', ' + e(x.state) : ''}</dd>
        <dt>Round</dt><dd>${e(x.round)}</dd>
        <dt>Cost</dt><dd>${e(x.fee)}</dd>
        <dt>Invite code</dt><dd><code id="pcInvite">${e(x.invite)}</code></dd>
      </dl>
      <p class="row"><a class="btn gold" id="pcResults" href="${e(x.results_url)}" target="_blank" rel="noopener">${nightSpecific ? 'ScoreTool results · Night ' + x.night : 'ScoreTool league page'}</a>
        ${nightSpecific ? `<a class="btn alt" id="pcLeagueHome" href="${e(PC_LEAGUE_URL)}" target="_blank" rel="noopener">League home</a>` : ''}</p>
      <p class="note">${e(x.results_note)}</p>
      </section></div></div>`;
  }

  const api = {PC_OWNER_EMAILS, PC_BASE, PC_LEAGUE_URL, PC_NIGHTS, pcIsOwner, pcEventsFor, pcByIdFor, pcIsPrivateId, pcResultsUrl, pcEvents, pcById, pcSeasonHtml, pcShootHtml};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
