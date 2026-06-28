// World Cup Overlay — background service worker (MV3, module).
//
// Fetches World Cup data from TheSportsDB, computes the match deck, caches it, keeps it warm on
// a chrome.alarms timer, and answers MSG.GET_STATE from content scripts. Network runs here so
// host_permissions bypass page CORS.

import { fetchEvents } from "./api.js";
import { buildDeck } from "./wc-state.js";
import { nextDelay, classifyHealth } from "./backoff.js";
import { ALARM, CACHE, MSG, SETTINGS, HEALTH } from "./config.js";

/**
 * @typedef {Object} WcState   What the overlay renders.
 * @property {WcEvent[]} matches   Chronological deck (each tagged with matchMode).
 * @property {number}    index     Index of the primary match to show first.
 * @property {number}    updatedAt Epoch ms the state was computed.
 */

const TAG = "[worldcup-overlay]";

let inFlight = null; // de-dupes concurrent refreshes

const hasLive = (state) =>
  !!state?.matches?.some((m) => m.matchMode === "live");

const ttlFor = (state) => (hasLive(state) ? CACHE.TTL_LIVE_MS : CACHE.TTL_IDLE_MS);

async function readCache() {
  const got = await chrome.storage.local.get(CACHE.KEY);
  return got[CACHE.KEY] || null;
}

async function writeCache(entry) {
  await chrome.storage.local.set({ [CACHE.KEY]: entry });
}

// --- fetch health (persisted so it survives service-worker termination) ---
const DEFAULT_HEALTH = { failures: 0, lastSuccessMs: null, nextRetryAt: 0 };

async function readHealth() {
  const got = await chrome.storage.local.get(HEALTH.STATE_KEY);
  return got[HEALTH.STATE_KEY] || { ...DEFAULT_HEALTH };
}

async function writeHealth(h) {
  await chrome.storage.local.set({ [HEALTH.STATE_KEY]: h });
}

/** The compact health summary the overlay renders (status + retry/last-success timing). */
function healthInfo(h, now) {
  return {
    status: classifyHealth({ lastSuccessMs: h.lastSuccessMs, failures: h.failures, now }, HEALTH),
    failures: h.failures,
    lastSuccessMs: h.lastSuccessMs,
    nextRetryAt: h.nextRetryAt,
  };
}

/**
 * Fetch + classify into a fresh state, persisting it. De-duped across concurrent callers.
 * Honors the backoff window (skips the network while `now < nextRetryAt`) unless `force`d.
 * Updates the persisted health counter on success/failure.
 */
async function refresh(force) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const now = Date.now();
    const health = await readHealth();
    if (!force && health.nextRetryAt && now < health.nextRetryAt) {
      const err = new Error("backoff: waiting until next retry window");
      err.backoff = true;
      throw err;
    }
    try {
      const { matches, primaryIndex } = buildDeck(await fetchEvents(now), now);
      const entry = { state: { matches, index: primaryIndex, updatedAt: now }, fetchedAt: now };
      await writeCache(entry);
      await writeHealth({ failures: 0, lastSuccessMs: now, nextRetryAt: 0 });
      return entry;
    } catch (err) {
      if (!err?.backoff) {
        const failures = health.failures + 1;
        const delay = nextDelay(failures, HEALTH.BASE_BACKOFF_MS, HEALTH.MAX_BACKOFF_MS);
        await writeHealth({ failures, lastSuccessMs: health.lastSuccessMs, nextRetryAt: now + delay });
      }
      throw err;
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Return fresh-enough cache, else refetch. `force` skips both the cache and the backoff window
 * (manual refresh button). On fetch failure, fall back to stale cache so the overlay degrades
 * gracefully. Every response carries a `health` summary for honest "provider down" copy.
 */
async function getState(force) {
  const cached = await readCache();
  const fresh = !force && cached && Date.now() - cached.fetchedAt < ttlFor(cached.state);
  if (fresh) return { ok: true, state: cached.state, fetchedAt: cached.fetchedAt, health: healthInfo(await readHealth(), Date.now()) };

  try {
    const entry = await refresh(force);
    return { ok: true, state: entry.state, fetchedAt: entry.fetchedAt, health: healthInfo(await readHealth(), Date.now()) };
  } catch (err) {
    const health = healthInfo(await readHealth(), Date.now());
    if (cached) {
      return { ok: true, state: cached.state, fetchedAt: cached.fetchedAt, stale: true, health };
    }
    return { ok: false, error: String(err?.message || err), health };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === MSG.GET_STATE) {
    getState(msg.force).then(sendResponse);
    return true; // keep the channel open for the async response
  }
  return false;
});

/** The user's refresh interval (minutes), clamped, defaulting to ALARM.PERIOD_MIN. */
async function refreshMinutes() {
  try {
    const got = await chrome.storage.sync.get(SETTINGS.KEY);
    const n = Math.round(Number(got[SETTINGS.KEY]?.refreshMins));
    if (Number.isFinite(n)) {
      return Math.min(SETTINGS.REFRESH_MAX_MINUTES, Math.max(SETTINGS.REFRESH_MIN_MINUTES, n));
    }
  } catch (_) {}
  return ALARM.PERIOD_MIN;
}

async function ensureAlarm() {
  chrome.alarms.create(ALARM.NAME, { periodInMinutes: await refreshMinutes() });
}

function warmUp() {
  ensureAlarm();
  refresh().catch((e) => console.warn(TAG, "refresh failed", e));
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM.NAME) refresh().catch((e) => console.warn(TAG, "alarm refresh", e));
});

// Re-arm the alarm when the user changes their refresh interval.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[SETTINGS.KEY]) ensureAlarm();
});

chrome.runtime.onInstalled.addListener(warmUp);
chrome.runtime.onStartup.addListener(warmUp);
