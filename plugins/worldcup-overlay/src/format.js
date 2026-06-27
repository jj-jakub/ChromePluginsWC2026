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

  WC.fmt = { esc, clock, dayLabel, until, ago };
})();
