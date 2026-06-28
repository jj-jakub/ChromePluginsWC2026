// Toolbar badge text/color/title from the current state. Pure ES module (no chrome / network),
// imported by the service worker and unit-tested directly. Live match -> score (red); else a
// compact countdown to the next fixture; else clear. Favorite-aware (state.index already points at
// the favorite's match when one is set).

const GREEN = "#0a6e36";
const RED = "#e11d2b";

/** Compact countdown to a future instant: "2h" / "15m" / "1d". */
function compactCountdown(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * @param {{matches: WcEvent[], index: number}} state  the decorated state (favorite-aware index)
 * @param {number} now
 * @returns {{ text: string, color: string, title: string }} clamped to the ~4-char badge limit
 */
export function badgeFor(state, now) {
  const matches = (state && state.matches) || [];
  if (!matches.length) return { text: "", color: GREEN, title: "FIFA World Cup" };

  const idx = state.index != null && state.index >= 0 && state.index < matches.length ? state.index : 0;
  const m = matches[idx];

  if (m.matchMode === "live") {
    const h = m.homeScore == null ? 0 : m.homeScore;
    const a = m.awayScore == null ? 0 : m.awayScore;
    let text = `${h}-${a}`;
    if (text.length > 4) text = "LIVE"; // e.g. "10-10" -> badge can't fit
    return { text, color: RED, title: `🔴 ${m.home} ${h}-${a} ${m.away}` };
  }

  if (m.matchMode === "upcoming" && m.kickoffMs && m.kickoffMs > now) {
    const cd = compactCountdown(m.kickoffMs - now);
    return { text: cd, color: GREEN, title: `${m.home} v ${m.away} — in ${cd}` };
  }

  return { text: "", color: GREEN, title: `${m.home} v ${m.away}` };
}
