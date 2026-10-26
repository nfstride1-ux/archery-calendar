/* What's new: plain-English release notes for Archery Calendar, newest first. Every item comes from a real commit (hashes listed). */
window.CAL_WHATSNEW = [
  {d: '2026-10-26', label: 'Mon 26 Oct 2026', items: [
    ['Search finds everything, in every country', 'The search boxes on the home page, the country pages and Find events now look at every country, club, venue, town, state and organisation at once, whichever country you have selected and whatever you chose in Settings. Type a club or event name (Skookum, Centenary, Looking Glass), a town (Puyallup), a state (Texas, Washington, Queensland or WA) or a country (Denmark). If it fits more than one place, such as WA for Western Australia and Washington, you see both, grouped by country. If there is one clear match, such as TAC, the club or the event, it opens straight away. Otherwise you get a list with the organisations, clubs and events, and you can open any of them.', ['this release']],
    ['Skookum Archers’ Halloween shoot now shows as a United States event', 'The Skookum Archers tournament in Puyallup, Washington (Sat 31 Oct) had been saved as an Australian event with no state. It now shows on the United States page under Washington and is no longer in the Australian Find events list. We did it with a small correction list on the site, so nothing else about the event or any other submission changed.', ['97503eb']],
    ['Centenary Archers Club: times and six more events', 'Centenary Archers Club (Sumner, QLD) sent us their newsletter, so their events now have start times: Graeme Jeffrey Memorial Tournament on Sun 1 Nov (8:30 am to 1:00 pm, register by Wed 28 Oct) and the Pan Pacific Masters Games target archery on Sat 7 and Sun 8 Nov (7:15 am to 1:00 pm). We also added their Pumpkin Shoot (Sat 31 Oct), the October OzBow and End of Month Competition (Sat 31 Oct, with entry on Archer’s Diary), the OzBow and Mid-month Competition (Sat 14 Nov), the Morning OzBow and 720 shoot (Sat 21 Nov), the OzBow and End of Month Competition (Sat 28 Nov, morning and afternoon times as the club published them) and the Bhutanese Khuru Game (Sat 28 Nov). The club asks you to think of the Graeme Jeffrey as at least a $20 donation, which goes to their Youth and Talent Funds. It is a donation, not an entry fee. These events have no flyers yet.', ['7e0b519']],
    ['Overseas shoots sent in by clubs now show on that country’s page', 'A shoot submitted by a club in another country, such as the United States, now shows on that country’s page and not in the Australian Find events list. The Skookum Archers Halloween tournament in Puyallup, Washington (Sat 31 Oct) was the first one caught out. Display only.', ['7e0b519']]]},
  {d: '2026-10-25', label: 'Sun 25 Oct 2026', items: [
    ['Find clubs near me', 'New Near me page (home page button, menu and footer). Tap Find clubs near me and your phone asks if the site may use your location. You then see the closest clubs with the distance, their disciplines and their next event, plus upcoming events close to you. You can also type a suburb or postcode instead, pick 25, 50 or 100, and switch between km and miles. Your location stays on your phone. We don’t store it: the distances are worked out in your browser and nothing is sent anywhere. Right now 45 of the 161 clubs on the calendar have a location we can place from the addresses we hold, so the list will grow as clubs send us theirs. Clubs we can’t place are left out, not guessed.', ['this release']],
    ['Video: put Archery Calendar on your phone like an app', 'The home page now has a short how-to video showing how to add Archery Calendar to your phone like an app, on iPhone and Samsung in Chrome. Tap to play (no sound until you press play). Written steps are under it. The same video is in Help, under Can I put it on my home screen?. On a phone, the Sign in page shows the video once the first time you open it, with a Close button and Don’t show again. It is hidden if you already use the app from your home screen.', ['this release']],
    ['New banner for ABA 3D events', 'The ABA 3D events page now shows the Peel Archery Club group photo from the ABA State Titles at Peel, in place of the stock 3D photo. The whole group is shown, including on phones. Photo supplied to Archery Calendar.', ['this release']],
    ['My score card is readable again', 'On an event that is still on (like day two of a state titles), the My score card on the event page showed only your numbers, because the words were white on the white card. It now shows the round name, Score, the date and where you shot, in dark text. A round that was not fully scored says so. The target emoji is now a plain line icon. Display only, no scores were changed.', ['this release']]]},
  {d: '2026-10-24', label: 'Sat 24 Oct 2026', items: [
    ['Replay link for the National Championships finals', 'The finals live stream box on the home page stays up after the stream ends, now as a Watch the replay link with no timer. The same link is on the event page.', ['this release']]]},
  {d: '2026-10-23', label: 'Fri 23 Oct 2026', items: [
    ['Event times at the top', 'Event pages now show the organiser’s times near the top, day by day, with sign-in or registration first in bold. Event cards and the day panel show the first one, like “Sign-in 10:00–11:00 am”. Times are the venue’s local time, and we say which zone when yours is different.', ['1677be2']],
    ['Countdown to sign-in', 'Major event countdowns now count down to the first sign-in or registration time when the organiser has published one, or to the start time. Before, they counted to midnight. They use the venue’s time zone, so they’re right wherever you are.', ['1677be2']],
    ['What’s new page', 'This page. Every update now gets a short note here, and Help has new answers to match.', ['f2fe7fb']],
    ['Your round photo (switching on soon)', 'Photos you add to a finished round in ScoreTool will show as a small picture on your calendar day and under My score on the event page. Only you see it. It switches on once we finish the server set-up.', ['8d2cab9']],
    ['My score on event pages', 'Signed in and linked to ScoreTool? Your own score shows under Results on the event you shot. Only you see it.', ['afdd835']],
    ['Benchmark Classic schedule', 'The full weekend schedule for Benchmark Classic 2026 is on its event page.', ['4e088c8']],
    ['Melville 3D results', 'The Melville 3D (18 Oct) Results card links to the results Bowmen of Melville posted.', ['ff33d84']]]},
  {d: '2026-10-22', label: 'Thu 22 Oct 2026', items: [
    ['ScoreTool scores in My events', 'Finished rounds from ScoreTool show on the day you shot them, with a list of your scores for the month. Link ScoreTool from #/scoretool.', ['1de4ca6']],
    ['One-tap Register / Enter button', 'A gold Register / Enter button on every event card that has an entry link. It hides when entries are closed or the event is over.', ['2bdcfaa']],
    ['Countdowns tick live', 'Event badges count down live again, in days, hours, minutes and seconds.', ['8947b0b']],
    ['Country home pages', 'Visitors from other countries see their own country’s events, photos and majors first. You can switch country at any time.', ['c7c2962', 'c243371', 'b23ab8c']],
    ['More entry links', 'Verified entry links for many US events and the Indoor World Series (Enter via World Archery).', ['223bce1', '9ae404a']]]},
  {d: '2026-10-21', label: 'Wed 21 Oct 2026', items: [
    ['Printable help guides', 'All 22 printable guides rebuilt on white for the new menus and the + Add event flow.', ['e7536e5']],
    ['Fan photo preview', 'When you add a fan photo you see a small preview before you send it.', ['da723e5']],
    ['Clubs can send events directly', 'Trusted clubs can send their events straight to the calendar from their own system.', ['156b9de']]]},
  {d: '2026-10-20', label: 'Tue 20 Oct 2026', items: [
    ['+ Add event', 'A gold + Add event button in the header (and a round + on phones). Send just your flyer and we read it for you.', ['447eb4c']],
    ['Flyer is all you need', 'When sending an event, the flyer is the only thing you must add. Approved clubs can publish straight away.', ['ff36d2d', 'da2c6bb']],
    ['Live stream countdown', 'A countdown on the home page for the AA National Target & Para Championships finals live stream.', ['e3c1741']]]},
  {d: '2026-10-18', label: 'Sun 18 Oct 2026', items: [
    ['Search shows the match count', 'Find events shows how many events match right under the search box, and Enter jumps to the results.', ['2bd90c7']]]},
  {d: '2026-10-17', label: 'Sat 17 Oct 2026', items: [
    ['My events button', 'The gold My events button sits in the header on every screen size.', ['105c44d']],
    ['Fixes from a full check', 'Phone header fits on one row, a clear page for events that can’t be found, and Escape closes Help anywhere.', ['7870dc9']]]}
];
function vWhatsNew(){
  setTitle('What’s new');
  const e = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const days = window.CAL_WHATSNEW.map(d => `<section class="panel wn-day"><h2>${e(d.label)}</h2><ul class="wn-list">` +
    d.items.map(([t, x, c]) => `<li><b>${e(t)}</b><span>${e(x)}</span>${c[0] === 'this release' ? '' : `<small class="wn-c">${c.map(e).join(' · ')}</small>`}</li>`).join('') + '</ul></section>').join('');
  return pageHead('What’s new', 'Every update to Archery Calendar, in plain English.') +
    `<div class="wrap narrow wn-wrap"><p class="wn-back"><a href="#/home">← Back to home</a> · <a href="#/whatsnew" data-help-open>Open Help</a></p>${days}</div>`;
}
function bindWhatsNew(v){ v.querySelectorAll('[data-help-open]').forEach(a => a.onclick = ev => { ev.preventDefault(); if (window.openHelp) window.openHelp(); }); }
