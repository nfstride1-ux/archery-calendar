/* Help bubble: free, client-side FAQ chat. Answers follow the senior guides (guides/*.pdf). No AI, nothing sent anywhere. */
(function(){
  const MAIL = 'nfshold@gmail.com', PP = 'https://paypal.me/ArcheryCalendar';
  const phone = () => matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const T = () => phone() ? 'Tap' : 'Click', t = () => T().toLowerCase(), dev = () => phone() ? 'phone' : 'pc';
  const img = (g, n) => `<img class="hb-img" loading="lazy" src="guides/${g}-${dev()}-${n}.webp" alt="">`;
  const steps = a => '<ol class="hb-steps">' + a.map(([txt, im]) => `<li>${txt}${im || ''}</li>`).join('') + '</ol>';
  const pdf = g => `<p><a class="hb-pdf" href="guides/${g}-${dev()}-A4.pdf" target="_blank" rel="noopener">📄 Full printable guide (PDF)</a> · <a href="guides/${g}-${dev() === 'phone' ? 'pc' : 'phone'}-A4.pdf" target="_blank" rel="noopener">${dev() === 'phone' ? 'Computer' : 'Phone'} version</a></p>`;
  const QA = [
    {q: 'What is Archery Calendar?', k: 'what is site about archery calendar free who', a: () => `<p>Archery Calendar puts archery events from around Australia (and overseas) in one place – Archery Australia, ABA, Archery WA, TAA and club events. It's free.</p><p>Tap any event for dates, venue, entry details and the flyer.</p>`},
    {q: 'How do I sign up?', k: 'sign up signup sign in login log in account register code email password', a: () => `<p>You can look at events <b>without</b> an account. You need a free account to send us an event or a fix. It also keeps your saved events on all your devices. No password – we email you a code.</p>` + steps([
      [`Go to <b>archerycalendars.com</b>. ${T()} <b>Sign in</b> ${phone() ? 'at the top right' : 'at the top, next to Cards'}.`, img('signup', '02-home')],
      [`Type your email address. ${T()} <b>Email me a sign-in code</b>. First time? This also makes your account.`, img('signup', '03-email')],
      [`Open your email. Find <b>Your Archery Calendar sign-in code</b>. Not there? Look in your <b>junk</b> folder.`, img('signup', '04-inbox')],
      [`Type the code in the box under <b>Enter the code from the email</b>. ${T()} <b>Sign in with code</b>. Or ${t()} <b>Sign in</b> in the email, on this same ${phone() ? 'phone' : 'computer'}.`, img('signup', '05-code')],
      [`You're signed in! The Sign in button now says <b>Account</b>. Asked to add this device's events? ${T()} <b>Yes</b>.`, img('signup', '06-done')]]) + pdf('signup')},
    {q: 'I didn\'t get the sign-in email', k: 'no email not arrived junk spam code missing didnt get', a: () => `<p>Look in your <b>junk / spam</b> folder for “Your Archery Calendar sign-in code”. It can take a minute or two.</p><p>Still nothing? Check the email address was typed right and ask for a new code.</p>`},
    {q: 'How do I add an event?', k: 'submit send add shoot event events add event add an event flyer club list new', a: () => `<p>Just send us your club's flyer. We read it and put your event on the calendar. <b>Sign in first</b> – it's free. New? ${T()} <b>Create a free account</b>, type your email, then the code we send you.</p>` + steps([
      [`Go to <b>archerycalendars.com</b>. Scroll down. ${T()} <b>Submit an event</b>. <a href="#/submit">Open it now</a>`, img('send-shoot', '02-open')],
      [`<b>Sign in first.</b> Type your email. ${T()} <b>Email me a sign-in code</b>, then type the code. No account yet? This makes your free account. You come straight back to the form.`, img('send-shoot', '03-signin')],
      [`Pick your country, state and club type. Type your club name, then pick your club from the list.`, img('send-shoot', '04-club')],
      [`Type your name. Pick your job at the club. Type your email.`, img('send-shoot', '05-you')],
      [`Type the event name, date and venue. ${T()} <b>Choose File</b>. ${phone() ? 'Choose the flyer photo' : 'Choose the flyer file from your computer'}. Or paste the flyer's web address in box 2.`, img('send-shoot', '06-flyer')],
      [`${T()} the box to give permission. Then ${t()} <b>Submit event for review</b>.`, img('send-shoot', '07-send')],
      [`All done! We check your event, usually within <b>48 hours</b>. Approved clubs go live straight away.`, img('send-shoot', '08-thanks')],
      [`Next time just add the flyer. It shows <b>Sending as …</b> – your details are remembered on all our forms. ${T()} <b>✏️ Change</b>, or <b>Not you? Clear</b>.`, img('send-shoot', '09-remember')]]) + pdf('send-shoot')},
    {q: 'My flyer photo is too big', k: 'photo big large size heic upload file pdf', a: () => `<p>Any photo works – big photos are shrunk automatically before sending. PDFs must be under 4 MB; if yours is bigger, send a photo or screenshot of the flyer, or paste a link to it instead.</p>`},
    {q: 'How do I fix an event that\'s wrong?', k: 'fix wrong change shoot event update correct mistake edit cancel cancelled', a: () => `<p>Open the event and ${t()} <b>✏️ Something wrong? Suggest a fix</b> at the bottom. Or go to <a href="#/fix">Submit an event → ✏️ Fix an existing event</a>.</p><p>${T()} ✏️ next to what's changed, or tick cancelled. You need to be signed in (free). We check it before anything changes on the site.</p>` + pdf('fix-shoot')},
    {q: 'How do I find an event?', k: 'find search look browse filter state organisation discipline 3d field target taa aba clear', a: () => `<p>${T()} <a href="#/browse">Find events</a> at the top. Type a club, town or event name in the search box, or pick a state, an organisation (Archery Australia, ABA, Archery WA, TAA), <b>Events</b> or <b>Club events</b>, and a discipline. ${T()} <b>✕ Clear</b> to start again.</p>` + pdf('find-shoots')},
    {q: 'How do I read an event page and enter?', k: 'open event page details fee bank bsb copy enter entry register link calendar ics', a: () => `<p>${T()} the event's name. The page shows the date, place, fee and flyer. Paying by bank? ${T()} <b>Copy</b> next to the BSB or account number. ${T()} the gold button to go to the entry page, or <b>Add to my calendar (.ics)</b>.</p>` + pdf('shoot-page')},
    {q: 'How do I sign out?', k: 'sign out log out logout account sync delete shared device', a: () => `<p>${T()} <b>Account</b> at the top right. <b>✓ Synced</b> means your events are safe. To sign out, ${t()} <b>Sign out (keep my events on this device)</b>. On a shared device use the second button – it also clears your events from it.</p>` + pdf('account')},
    {q: 'Can I put it on my home screen?', k: 'install app home screen icon add phone iphone android shortcut', a: () => `<p>Yes. On Android, ${t()} <b>Install</b> on the bar at the bottom (or browser menu ⋮ → Add to Home screen). On iPhone, open the site in Safari, tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>. On a computer, use the install icon in the address bar or the browser menu → Install.</p>` + pdf('install')},
    {q: 'How do I save an event?', k: 'save saved my shoots shoot event events favourite star remember add', a: () => `<p>Open an event and ${t()} <b>☆ Add to My events</b>. It then shows in <a href="#/calendar">My events</a>, where you can tick when you've entered and paid.</p><p>Saved events stay on this device. <b>Sign in</b> to keep them on all your devices.</p>` + pdf('save-shoots')},
    {q: 'How do I pick my state or organisations?', k: 'state filter organisation organization aba taa archery wa settings show hide only traditional', a: () => `<p>Go to <a href="#/settings">Settings</a>. Under <b>States &amp; territories</b> tick the states you want (none ticked = all of Australia). Under <b>Organisations</b> tick Archery Australia, ABA, Archery WA and/or <b>TAA</b> (Traditional Archery Australia).</p><p>On <a href="#/browse">Find events</a> you can also filter by organisation, state and type.</p>` + pdf('settings')},
    {q: 'How do I pick my club?', k: 'my club clubs watch follow home club', a: () => `<p>Go to <a href="#/settings/clubs">Settings → Clubs</a> and pick the clubs you belong to or want to watch. Their events are highlighted and show on My events.</p>` + pdf('settings')},
    {q: 'How can I support the site?', k: 'support donate donation paypal pay money help keep running', a: () => `<p>Archery Calendar is free. If you'd like to chip in to keep it running, you can donate through PayPal:</p><p><a class="hb-btn" href="${PP}" target="_blank" rel="noopener">💛 Support the site (PayPal)</a></p>` + pdf('support')},
    {q: 'What happens to my details?', k: 'privacy data details personal information email safe cookies', a: () => `<p>Your saved events and settings stay in your browser on this device (and in your account if you sign in). Details you send with an event are emailed to us only to check and list it – we never sell them or publish your contact details unless they're on your flyer.</p><p><a href="#/privacy">Read the privacy page</a></p>` + pdf('privacy')}
  ];
  const fallback = `<p>Still stuck? Email <a href="mailto:${MAIL}?subject=${encodeURIComponent('Archery Calendar help')}">${MAIL}</a> and we'll help.</p>`;
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  const find = s => { const w = norm(s).split(' ').filter(x => x.length > 2); if (!w.length) return null;
    let best = null, bs = 0; QA.forEach(o => { const hay = ' ' + norm(o.q + ' ' + o.k) + ' '; const sc = w.reduce((n, x) => n + (hay.includes(' ' + x) ? 1 : 0), 0); if (sc > bs) { bs = sc; best = o; } }); return best; };
  let box, log, opened = false;
  function build(){
    const b = document.createElement('button'); b.id = 'hbBtn'; b.type = 'button'; b.setAttribute('aria-label', 'Help'); b.setAttribute('aria-expanded', 'false'); b.innerHTML = '<span aria-hidden="true">?</span> Help';
    box = document.createElement('section'); box.id = 'hbBox'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Help');
    box.innerHTML = `<header><b>Help</b><button type="button" class="hb-x" aria-label="Close help">✕</button></header><div class="hb-log" aria-live="polite"></div>
      <form class="hb-f"><label class="sr" for="hbQ">Type your question</label><input id="hbQ" type="text" placeholder="Type a question…" autocomplete="off"><button type="submit" class="hb-go">Ask</button></form>`;
    document.body.append(b, box); log = box.querySelector('.hb-log');
    b.onclick = () => toggle(!opened); box.querySelector('.hb-x').onclick = () => toggle(false);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && opened) { toggle(false); const nb = document.getElementById('hbBtn'); nb && nb.focus({preventScroll: true}); } });   // Escape closes Help wherever focus is
    box.querySelector('.hb-f').onsubmit = e => { e.preventDefault(); const i = box.querySelector('#hbQ'), v = i.value.trim(); if (!v) return; i.value = ''; ask(v); };
    log.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q) ask(QA[+q.dataset.q].q, QA[+q.dataset.q]); if (e.target.closest('a[href^="#"]') && phone()) toggle(false); });
  }
  const say = (who, html) => { if (html.includes('hb-qs')) log.querySelectorAll('.hb-qs, .hb-more').forEach(e => e.remove());   // only one question list, always the latest
    const d = document.createElement('div'); d.className = 'hb-m ' + who; d.innerHTML = html; log.append(d); d.scrollIntoView({block: 'start', behavior: 'smooth'}); };
  const menu = () => '<div class="hb-qs">' + QA.map((o, i) => `<button type="button" data-q="${i}">${o.q}</button>`).join('') + '</div>';
  function ask(text, o){ say('me', text.replace(/</g, '&lt;')); o = o || find(text);
    say('bot', o ? o.a() + `<p class="hb-more">Anything else?</p>` + menu() : `<p>Sorry, I don't have an answer for that.</p>${fallback}${menu()}`); }
  function toggle(on){ opened = on; box.hidden = !on; document.getElementById('hbBtn').setAttribute('aria-expanded', on); const nh = document.getElementById('navHelp'); nh && nh.setAttribute('aria-expanded', on);
    document.body.classList.toggle('hb-open', on);
    if (on && !log.children.length) say('bot', `<p>Hi! 👋 How can I help? Tap a question or type your own.</p>${menu()}${fallback}`);
    if (on && !phone()) box.querySelector('#hbQ').focus(); else if (on) { box.tabIndex = -1; box.focus({preventScroll: true}); } }
  window.openHelp = () => toggle(true);
  function navSlot(){ const n = document.getElementById('navHelp'), b = document.getElementById('hbBtn'); if (!n) return;
    n.addEventListener('click', e => { e.preventDefault(); toggle(!opened); });
    /* Floating bubble only when the header Help button isn't fully on screen (e.g. phone nav scrolled) */
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(x => b.classList.toggle('hb-hide', x.intersectionRatio > .95)), {threshold: [0, .95, 1]}).observe(n); }
  /* Phone: never sit on top of a form box or button (e.g. 'All disciplines' on Find events) – step aside while one is underneath */
  function dodge(){ const b = document.getElementById('hbBtn'); if (!b || innerWidth >= 760) return; let t = 0;
    const chk = () => { t = 0; if (opened) return; b.classList.remove('hb-dodge'); const r = b.getBoundingClientRect(); if (!r.width) return;
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.top + 4]];
      b.style.visibility = 'hidden'; const hit = pts.some(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('select,input,textarea'); }); b.style.visibility = '';
      b.classList.toggle('hb-dodge', hit); };
    const q = () => { if (!t) t = requestAnimationFrame(chk); };
    addEventListener('scroll', q, {passive: true}); addEventListener('resize', q); addEventListener('hashchange', () => setTimeout(chk, 400)); setTimeout(chk, 800); }
  const init = () => { build(); navSlot(); dodge(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
