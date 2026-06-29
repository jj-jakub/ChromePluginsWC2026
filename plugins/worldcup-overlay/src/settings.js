// User settings: the schema, defaults, and a pure validator. Exposed on the shared content-script
// namespace (self.WC.settings) so content.js and the options page load it as a classic script, and
// test/settings.test.mjs drives it under the `self` shim. No chrome / DOM / network here.
//
// `normalize(raw)` is the single gatekeeper for everything read from chrome.storage.sync: it
// deep-merges a partial or stale object onto DEFAULTS, clamps/whitelists every field, and DROPS
// unknown keys — so a future or corrupted schema can never crash the content world or the worker.
//
// NOTE: the worker is an ES module and can't import this classic file, so the few values it needs
// (the storage KEY, the refresh clamp range) are mirrored in config.js — keep them in sync, the
// same discipline the MSG.GET_STATE string already follows.

(() => {
  const WC = (self.WC = self.WC || {});

  const KEY = "wc_settings"; // config: SETTINGS.KEY
  const CORNERS = ["tl", "tr", "bl", "br"];
  const THEMES = ["auto", "light", "dark"];
  const SITE_MODES = ["deny", "allow"];
  const DENSITIES = ["comfortable", "compact"];
  const REFRESH_MIN = 1; // minutes; config: SETTINGS.REFRESH_MIN_MINUTES
  const REFRESH_MAX = 30; // minutes; config: SETTINGS.REFRESH_MAX_MINUTES
  const LEAD_MIN = 1;
  const LEAD_MAX = 120;
  const SCALE_MIN = 0.8; // widget zoom factor — drag a corner to resize (content-only; not in config)
  const SCALE_MAX = 2.0;

  const DEFAULTS = {
    corner: "tr", // matches the historical top-right default
    theme: "auto",
    density: "comfortable",
    scale: 1, // 1.0 = native size; clamped to [SCALE_MIN, SCALE_MAX]
    startMinimized: false,
    refreshMins: 2, // matches config ALARM.PERIOD_MIN
    favorites: [], // nation names, e.g. ["Brazil", "England"]
    siteMode: "deny", // "deny" = hide on listed sites; "allow" = show ONLY on listed sites
    siteRules: [],
    notify: {
      enabled: false,
      kickoff: true,
      goals: true,
      fullTime: true,
      leadMins: 15,
      favoritesOnly: true,
    },
  };

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const bool = (v, dflt) => (typeof v === "boolean" ? v : dflt);
  const oneOf = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  };

  // Float clamp for the zoom factor; rounds to 2 dp so a drag can't persist 1.2999999.
  const clampScale = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return DEFAULTS.scale;
    return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) * 100) / 100;
  };

  // Clean a string list: keep strings, trim, drop blanks, de-dupe (case-insensitive), preserve order.
  const cleanList = (v) => {
    if (!Array.isArray(v)) return [];
    const seen = new Set();
    const out = [];
    for (const item of v) {
      if (typeof item !== "string") continue;
      const t = item.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  };

  /** Coerce any stored/partial object into a complete, valid settings object. Never throws. */
  function normalize(raw) {
    const r = isObj(raw) ? raw : {};
    const n = isObj(r.notify) ? r.notify : {};
    const d = DEFAULTS;
    return {
      corner: oneOf(r.corner, CORNERS, d.corner),
      theme: oneOf(r.theme, THEMES, d.theme),
      density: oneOf(r.density, DENSITIES, d.density),
      scale: clampScale(r.scale),
      startMinimized: bool(r.startMinimized, d.startMinimized),
      refreshMins: clampInt(r.refreshMins, REFRESH_MIN, REFRESH_MAX, d.refreshMins),
      favorites: cleanList(r.favorites),
      siteMode: oneOf(r.siteMode, SITE_MODES, d.siteMode),
      siteRules: cleanList(r.siteRules),
      notify: {
        enabled: bool(n.enabled, d.notify.enabled),
        kickoff: bool(n.kickoff, d.notify.kickoff),
        goals: bool(n.goals, d.notify.goals),
        fullTime: bool(n.fullTime, d.notify.fullTime),
        leadMins: clampInt(n.leadMins, LEAD_MIN, LEAD_MAX, d.notify.leadMins),
        favoritesOnly: bool(n.favoritesOnly, d.notify.favoritesOnly),
      },
    };
  }

  WC.settings = {
    KEY,
    DEFAULTS,
    normalize,
    CORNERS,
    THEMES,
    SITE_MODES,
    DENSITIES,
    REFRESH_MIN,
    REFRESH_MAX,
    SCALE_MIN,
    SCALE_MAX,
  };
})();
