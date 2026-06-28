// Central configuration for the background modules (service-worker, api, wc-state).
//
// NOTE: content scripts run in a separate world and cannot `import` this module, so the few
// constants they also need (the message string, storage keys) are defined in content.js and
// kept in sync with the values here — each such value is flagged with a "content: ..." note.

/** TheSportsDB credentials & target competition. Free public key — no signup. */
export const THESPORTSDB = {
  KEY: "3",
  LEAGUE_ID: "4429", // FIFA World Cup
  SEASON: "2026",
};

/** Base URL for the TheSportsDB v1 JSON API. */
export const API_BASE = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB.KEY}`;

/**
 * A match counts as "live" from kickoff until this long after — long enough for two halves
 * plus stoppage and the interval. Used to infer live status on the free tier, which has no
 * minute-by-minute feed.
 */
export const LIVE_WINDOW_MS = 150 * 60 * 1000;

/** Response cache: short TTL while a match is live (scores move), longer when idle. */
export const CACHE = {
  KEY: "wc_state_cache",
  TTL_LIVE_MS: 60 * 1000,
  TTL_IDLE_MS: 5 * 60 * 1000,
};

/** Background refresh alarm (chrome.alarms). PERIOD_MIN is the default when no user override. */
export const ALARM = {
  NAME: "wc-refresh",
  PERIOD_MIN: 2,
};

/**
 * Mirror of the few user-settings the worker reads (the rest live content-side in settings.js,
 * which the module worker can't import — same duplication discipline as MSG.GET_STATE).
 * The canonical schema + validator is src/settings.js (self.WC.settings).
 */
export const SETTINGS = {
  KEY: "wc_settings", // settings.js: WC.settings.KEY
  REFRESH_MIN_MINUTES: 1, // settings.js: REFRESH_MIN
  REFRESH_MAX_MINUTES: 30, // settings.js: REFRESH_MAX
};

/** Message protocol between content scripts and the service worker. content: "WC_GET_STATE". */
export const MSG = {
  GET_STATE: "WC_GET_STATE",
};
