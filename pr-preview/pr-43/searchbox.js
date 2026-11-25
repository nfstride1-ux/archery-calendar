/* Shared event-search rules for every in-app search box (home, Find events, Search everywhere, country pages).
   Word match is order-independent. A simple trailing s matches both ways (championship/championships, national/nationals).
   Archery Australia national championships and Australian Opens also match national, nationals and australian.
   No DOM. Loaded before app.js. */
(function (root) {
  function pluralStem(w) {
    if (w.length >= 5 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }
  /* True when two search tokens are the same word or the same word with a simple plural s. */
  function tokenEq(w, h) {
    if (!w || !h || w.length < 4 || h.length < 4) return false;
    return pluralStem(w) === pluralStem(h);
  }
  /* Every query word hits some hay word: exact, word-start (nat → national), or a simple plural. */
  function wordsMatch(ws, hayWords) {
    return ws.every(w => hayWords.some(h => h === w || (w.length >= 3 && h.startsWith(w)) || tokenEq(w, h)));
  }
  /* Archery Australia national championship, or an Australian Open. Not ABA safaris, not other countries, not owner-only rows. */
  function aaChamp(x) {
    if (!x || x._ownerOnly) return false;
    const id = x.org_id || '';
    const org = String(x.org || '').trim();
    if (id !== 'archery-australia' && !/^archery australia$/i.test(org)) return false;
    if (/australian open/i.test(x.name || '')) return true;
    return /\bnational\b/i.test(x.level || '') && /champion/i.test((x.name || '') + ' ' + (x.level || ''));
  }
  function aaChampWords(x) {
    return aaChamp(x) ? 'national nationals australian' : '';
  }
  const CHAMP_INTENT = new Set(['national', 'australian', 'championship', 'open']);
  /* Queries about nationals / Australian Opens / championships, after snorm. Plain club or town searches are not. */
  function champQuery(words) {
    return (words || []).some(w => CHAMP_INTENT.has(w) || CHAMP_INTENT.has(pluralStem(w)));
  }
  /* Matching Archery Australia championships first, then by date. dateKey optional (book-anytime shoots sort last). */
  function byChampThenDate(intent, a, b, dateKey) {
    if (intent) {
      const d = (aaChamp(b) ? 1 : 0) - (aaChamp(a) ? 1 : 0);
      if (d) return d;
    }
    const as = dateKey ? dateKey(a) : (a.start_date || '9'), bs = dateKey ? dateKey(b) : (b.start_date || '9');
    return as < bs ? -1 : as > bs ? 1 : 0;
  }
  const api = {pluralStem, tokenEq, wordsMatch, aaChamp, aaChampWords, champQuery, byChampThenDate};
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
