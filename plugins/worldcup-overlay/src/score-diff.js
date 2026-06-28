// Score-change detection between two deck snapshots. Classic self.WC content script (content can't
// import ES modules), used by content.js to flash a goal pulse and announce the change to screen
// readers. Pure aside from the namespace assignment; covered by test/score-diff.test.mjs.

(() => {
  const WC = (self.WC = self.WC || {});

  /**
   * Which sides changed score between prevDeck and nextDeck (matched by id; only counts a change
   * when BOTH snapshots have a numeric score, so first-appearance of a score isn't a "goal").
   * @returns {{id, side: "home"|"away", from: number, to: number}[]}
   */
  function diff(prevDeck, nextDeck) {
    const prev = new Map((prevDeck || []).map((m) => [m.id, m]));
    const out = [];
    for (const m of nextDeck || []) {
      const p = prev.get(m.id);
      if (!p) continue;
      if (p.homeScore != null && m.homeScore != null && m.homeScore !== p.homeScore) {
        out.push({ id: m.id, side: "home", from: p.homeScore, to: m.homeScore });
      }
      if (p.awayScore != null && m.awayScore != null && m.awayScore !== p.awayScore) {
        out.push({ id: m.id, side: "away", from: p.awayScore, to: m.awayScore });
      }
    }
    return out;
  }

  /** A spoken sentence for the first changed match ("Goal — Brazil 2, Norway 1"), or null. */
  function announceFor(prevDeck, nextDeck) {
    const changes = diff(prevDeck, nextDeck);
    if (!changes.length) return null;
    const m = (nextDeck || []).find((x) => x.id === changes[0].id);
    if (!m) return null;
    return `Goal — ${m.home} ${m.homeScore}, ${m.away} ${m.awayScore}`;
  }

  WC.scoreDiff = { diff, announceFor };
})();
