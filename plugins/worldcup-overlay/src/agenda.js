// Agenda grouping — bucket the match deck under day headers for the "all fixtures" list view.
// Classic self.WC content script (content scripts can't import the wc-state ES module), loaded
// before content.js. Pure aside from the namespace assignment — covered by test/agenda.test.mjs.

(() => {
  const WC = (self.WC = self.WC || {});

  const startOfDay = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  /**
   * Group matches by local day, in chronological order, each bucket keyed and labelled
   * ("Today" / "Tomorrow" / "Mon, Jun 29" via fmt.dayLabel).
   * @returns {{ dayKey: number, label: string, matches: WcEvent[] }[]}
   */
  function groupByDay(matches, now) {
    const dayLabel = WC.fmt && WC.fmt.dayLabel ? WC.fmt.dayLabel : (ms) => new Date(ms).toDateString();
    const sorted = (matches || [])
      .filter((m) => m && m.kickoffMs != null)
      .slice()
      .sort((a, b) => a.kickoffMs - b.kickoffMs);

    const groups = [];
    const byDay = new Map();
    for (const m of sorted) {
      const dk = startOfDay(m.kickoffMs);
      let g = byDay.get(dk);
      if (!g) {
        g = { dayKey: dk, label: dayLabel(m.kickoffMs, now), matches: [] };
        byDay.set(dk, g);
        groups.push(g); // first-seen order is chronological because `sorted` is
      }
      g.matches.push(m);
    }
    return groups;
  }

  WC.agenda = { groupByDay };
})();
