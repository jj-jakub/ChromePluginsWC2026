// Formatting helpers for the overlay, exposed on the shared content-script namespace
// (self.WC.fmt). Content scripts can't use ES modules from the manifest, so the overlay's
// helper files attach to a single `self.WC` object and are loaded before content.js.
//
// Pure and side-effect-free (aside from the namespace assignment) — covered by test/format.test.mjs.

(() => {
  const WC = (self.WC = self.WC || {});

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  /** Escape a value for safe interpolation into innerHTML. */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /** Local "HH:MM" for an epoch ms. */
  const clock = (ms) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  /** "Today" / "Tomorrow" / "Yesterday" / "Mon, Jun 27" relative to `now`. */
  const dayLabel = (ms, now) => {
    const startOf = (t) => {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const diff = Math.round((startOf(ms) - startOf(now)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  /** Countdown to a future kickoff: "in 2h 5m" / "in 7m" / "kicking off". */
  const until = (ms, now) => {
    const s = Math.max(0, Math.round((ms - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h >= 1) return `in ${h}h ${m}m`;
    if (m >= 1) return `in ${m}m`;
    return "kicking off";
  };

  /** Elapsed since a past instant: "just now" / "12m ago" / "3h ago" / "2d ago". */
  const ago = (ms, now) => {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  // Knockout stage strings TheSportsDB emits (lowercased), mapped to clean labels.
  const KO_STAGES = {
    final: "Final",
    "grand final": "Final",
    "third place": "Third-place play-off",
    "3rd place": "Third-place play-off",
    "third place final": "Third-place play-off",
    "play-off for third place": "Third-place play-off",
    "semi-final": "Semi-final",
    "semi-finals": "Semi-final",
    semifinal: "Semi-final",
    semifinals: "Semi-final",
    "quarter-final": "Quarter-final",
    "quarter-finals": "Quarter-final",
    quarterfinal: "Quarter-final",
    quarterfinals: "Quarter-final",
    "round of 16": "Round of 16",
    "last 16": "Round of 16",
    "1/8 finals": "Round of 16",
    "round of 32": "Round of 32",
    "1/16 finals": "Round of 32",
  };

  /**
   * Human round/stage label from TheSportsDB's inconsistent intRound/strStage/strGroup.
   * "Group A · Matchday 2" / "Round of 16" / "Quarter-final" / "Final". Defensive: unknown stage
   * strings pass through trimmed; nothing usable -> "".
   */
  const roundLabel = (round, stage, group) => {
    const s = String(stage || "").trim().toLowerCase();
    if (KO_STAGES[s]) return KO_STAGES[s];

    const g = String(group || "").trim();
    const grp = g ? (/^group\b/i.test(g) ? g : `Group ${g}`) : "";
    const n = Number(round);
    const md = Number.isFinite(n) && n > 0 ? `Matchday ${n}` : "";

    if (grp && md) return `${grp} · ${md}`;
    if (grp) return grp;
    if (md) return md;
    return String(stage || "").trim(); // unknown stage passthrough, or ""
  };

  /**
   * Estimated game clock for a live match from elapsed time since kickoff: 0–45 in the first half,
   * a ~15-min half-time gap, then 45–90 capped (90 = "90+"). Returns null before kickoff / no
   * kickoff. The caller prefixes "~" and yields to a real provider progress string when present.
   */
  const liveMinute = (kickoffMs, now) => {
    if (!kickoffMs) return null;
    const elapsed = Math.floor((now - kickoffMs) / 60000);
    if (elapsed < 0) return null;
    if (elapsed <= 45) return Math.max(1, elapsed); // first half
    if (elapsed < 60) return 45; // ~ half-time
    return Math.min(90, elapsed - 15); // second half, capped
  };

  WC.fmt = { esc, clock, dayLabel, until, ago, roundLabel, liveMinute };
})();
