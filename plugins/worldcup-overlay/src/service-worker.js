// World Cup Overlay — background service worker (MV3, module).
//
// Fetches World Cup data from TheSportsDB, computes the match deck, caches it, keeps it warm on
// a chrome.alarms timer, and answers MSG.GET_STATE from content scripts. Network runs here so
// host_permissions bypass page CORS.

import { fetchEvents, fetchSeason } from "./api.js";
import { buildDeck, applyFavorites } from "./wc-state.js";
import { tableFor } from "./standings.js";
import { teamForm } from "./form.js";
import { badgeFor } from "./badge.js";
import { notificationsFor } from "./notify.js";
import { nextDelay, classifyHealth } from "./backoff.js";
import { ALARM, CACHE, SEASON, MSG, SETTINGS, HEALTH, NOTIFIED } from "./config.js";

/**
 * @typedef {Object} WcState   What the overlay renders.
 * @property {WcEvent[]} matches   Chronological deck (each tagged with matchMode).
 * @property {number}    index     Index of the primary match to show first.
 * @property {number}    updatedAt Epoch ms the state was computed.
 */

const TAG = "[worldcup-overlay]";

let inFlight = null; // de-dupes concurrent refreshes
let inFlightForce = false; // whether the in-flight refresh is a force (bypasses backoff)

const hasLive = (state) =>
  !!state?.matches?.some((m) => m.matchMode === "live");

const ttlFor = (state) => (hasLive(state) ? CACHE.TTL_LIVE_MS : CACHE.TTL_IDLE_MS);

// Storage reads must never reject — a transient hiccup should degrade to a default, not drop the
// whole getState response (the message channel is held open with `return true`).
async function readCache() {
  try {
    const got = await chrome.storage.local.get(CACHE.KEY);
    return got[CACHE.KEY] || null;
  } catch (_) {
    return null;
  }
}

async function writeCache(entry) {
  await chrome.storage.local.set({ [CACHE.KEY]: entry });
}

// --- fetch health (persisted so it survives service-worker termination) ---
const DEFAULT_HEALTH = { failures: 0, lastSuccessMs: null, nextRetryAt: 0 };

async function readHealth() {
  try {
    const got = await chrome.storage.local.get(HEALTH.STATE_KEY);
    return got[HEALTH.STATE_KEY] || { ...DEFAULT_HEALTH };
  } catch (_) {
    return { ...DEFAULT_HEALTH };
  }
}

async function writeHealth(h) {
  await chrome.storage.local.set({ [HEALTH.STATE_KEY]: h });
}

/** The user's favorite nations (read fresh so a toggle re-ranks without a refetch). */
async function readFavorites() {
  try {
    const got = await chrome.storage.sync.get(SETTINGS.KEY);
    const f = got[SETTINGS.KEY]?.favorites;
    return Array.isArray(f) ? f.filter((x) => typeof x === "string") : [];
  } catch (_) {
    return [];
  }
}

/** Cached season events (no fetch — used to attach form without slowing getState). */
async function readSeasonCacheEvents() {
  const c = await readSeasonCache();
  return c && Array.isArray(c.events) ? c.events : null;
}

/**
 * Overlay derived data onto a base deck: tag isFavorite + favorite-aware index, and (when the
 * season cache is warm) attach each side's recent form. Reads only — never triggers a fetch.
 */
async function decorate(baseState, now) {
  const favorites = await readFavorites();
  const { matches, index } = applyFavorites(baseState.matches, now, favorites, baseState.index);
  const season = await readSeasonCacheEvents();
  if (!season || !season.length) return { matches, index, updatedAt: baseState.updatedAt };

  // Compute each distinct nation's form once (a team recurs across the deck's fixtures).
  const formCache = new Map();
  const formOf = (team) => {
    const k = String(team || "").trim().toLowerCase();
    if (!formCache.has(k)) formCache.set(k, teamForm(season, team));
    return formCache.get(k);
  };
  const withForm = matches.map((m) => ({ ...m, homeForm: formOf(m.home), awayForm: formOf(m.away) }));
  return { matches: withForm, index, updatedAt: baseState.updatedAt };
}

// --- toolbar badge (live score / countdown to the next/favorite fixture) ---
async function updateBadge(decorated) {
  try {
    const { text, color, title } = badgeFor(decorated, Date.now());
    await chrome.action.setBadgeText({ text });
    if (color) await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setTitle({ title });
  } catch (_) {}
}

async function refreshBadgeFromCache() {
  try {
    const cached = await readCache();
    if (cached) await updateBadge(await decorate(cached.state, Date.now()));
  } catch (_) {}
}

// --- desktop notifications (opt-in; fires each tag once via a bounded fired-set) ---
async function readNotifyPrefs() {
  try {
    const got = await chrome.storage.sync.get(SETTINGS.KEY);
    const n = got[SETTINGS.KEY]?.notify;
    if (n && typeof n === "object") return n;
  } catch (_) {}
  return { enabled: false };
}

async function fireNotifications(decorated) {
  const prefs = await readNotifyPrefs();
  if (!prefs.enabled) return;
  const favorites = await readFavorites();
  const candidates = notificationsFor(decorated.matches, Date.now(), favorites, prefs);
  if (!candidates.length) return;

  let firedArr = [];
  try {
    const got = await chrome.storage.local.get(NOTIFIED.KEY);
    firedArr = (got[NOTIFIED.KEY] && got[NOTIFIED.KEY].tags) || [];
  } catch (_) {}
  const fired = new Set(firedArr);

  const fresh = candidates.filter((c) => !fired.has(c.tag));
  if (!fresh.length) return;

  for (const c of fresh) {
    try {
      chrome.notifications.create(c.tag, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: c.title,
        message: c.message,
      });
    } catch (_) {}
    fired.add(c.tag);
  }
  try {
    await chrome.storage.local.set({ [NOTIFIED.KEY]: { tags: [...fired].slice(-NOTIFIED.MAX) } });
  } catch (_) {}
}

// --- season events + group standings (lazy: only fetched when the user opens the table) ---
async function readSeasonCache() {
  try {
    const got = await chrome.storage.local.get(SEASON.CACHE_KEY);
    return got[SEASON.CACHE_KEY] || null;
  } catch (_) {
    return null;
  }
}

let seasonInFlight = null; // de-dupes concurrent season fetches (mirrors `inFlight` for the deck)
let seasonInFlightForce = false;

async function getSeasonEvents(force) {
  const cached = await readSeasonCache();
  if (!force && cached && Date.now() - cached.fetchedAt < SEASON.TTL_MS) return cached.events;

  // Reuse an in-flight fetch unless this caller forces and the running one didn't.
  if (seasonInFlight && (seasonInFlightForce || !force)) return seasonInFlight;

  // Non-force fetches honor the same backoff window the deck path respects — the season endpoint
  // is the heaviest, so don't hammer a flaky provider that's already in backoff.
  if (!force) {
    const health = await readHealth();
    if (health.nextRetryAt && Date.now() < health.nextRetryAt) return cached ? cached.events : null;
  }

  const run = (async () => {
    try {
      const events = await fetchSeason();
      try {
        await chrome.storage.local.set({ [SEASON.CACHE_KEY]: { events, fetchedAt: Date.now() } });
      } catch (_) {}
      return events;
    } catch (_) {
      return cached ? cached.events : null; // null => couldn't load and no cache
    }
  })();

  seasonInFlight = run;
  seasonInFlightForce = !!force;
  try {
    return await run;
  } finally {
    if (seasonInFlight === run) {
      seasonInFlight = null;
      seasonInFlightForce = false;
    }
  }
}

/** Group standings for one group, computed from cached season results. */
async function getStandings(group, force) {
  const events = await getSeasonEvents(force);
  if (!events) return { ok: false, group, rows: [], error: "season unavailable" };
  const { rows, partial, complete } = tableFor(events, group);
  return { ok: true, group, rows, partial, complete };
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
 * Fetch + classify into a fresh state, persisting it. De-duped across concurrent callers — but the
 * de-dup is force-aware: a force refresh (manual ↻) is never satisfied by a backing-off non-force
 * call, so it always exercises the backoff bypass. Honors the backoff window (skips the network
 * while `now < nextRetryAt`) unless `force`d. Updates the persisted health counter on success/failure.
 */
async function refresh(force) {
  // Reuse the in-flight refresh only when it's itself a force, or when this caller isn't forcing.
  if (inFlight && (inFlightForce || !force)) return inFlight;

  const run = (async () => {
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
      try {
        const decorated = await decorate(entry.state, now);
        await updateBadge(decorated);
        await fireNotifications(decorated);
      } catch (_) {}
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

  inFlight = run;
  inFlightForce = !!force;
  try {
    return await run;
  } finally {
    if (inFlight === run) {
      inFlight = null;
      inFlightForce = false;
    }
  }
}

/**
 * Return fresh-enough cache, else refetch. `force` skips both the cache and the backoff window
 * (manual refresh button). On fetch failure, fall back to stale cache so the overlay degrades
 * gracefully. Every response carries a `health` summary for honest "provider down" copy.
 */
async function getState(force) {
  const now = Date.now();
  const cached = await readCache();
  const fresh = !force && cached && now - cached.fetchedAt < ttlFor(cached.state);
  if (fresh) {
    return { ok: true, state: await decorate(cached.state, now), fetchedAt: cached.fetchedAt, health: healthInfo(await readHealth(), now) };
  }

  try {
    const entry = await refresh(force);
    return { ok: true, state: await decorate(entry.state, now), fetchedAt: entry.fetchedAt, health: healthInfo(await readHealth(), now) };
  } catch (err) {
    const health = healthInfo(await readHealth(), now);
    if (cached) {
      return { ok: true, state: await decorate(cached.state, now), fetchedAt: cached.fetchedAt, stale: true, health };
    }
    return { ok: false, error: String(err?.message || err), health };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === MSG.GET_STATE) {
    // Always answer (the channel is held open below), even if something unexpected rejects —
    // otherwise the content/popup callback hangs and only sees a generic lastError.
    getState(msg.force)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e), health: null }));
    return true; // keep the channel open for the async response
  }
  if (msg?.type === MSG.GET_STANDINGS) {
    getStandings(msg.group, msg.force)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, group: msg.group, rows: [], error: String(e?.message || e) }));
    return true;
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

// Let content scripts read/write chrome.storage.session (default is trusted-contexts only). Used
// for the per-session minimized state so settings.startMinimized governs each fresh browser start.
function allowSessionFromContent() {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  } catch (_) {}
}

function warmUp() {
  allowSessionFromContent();
  ensureAlarm();
  refreshBadgeFromCache(); // show a badge from cache immediately, before the fetch lands
  refresh().catch((e) => console.warn(TAG, "refresh failed", e));
  // Warm the season cache so group standings + team form are ready without a first round-trip.
  getSeasonEvents(false).catch((e) => console.warn(TAG, "season warm failed", e));
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM.NAME) refresh().catch((e) => console.warn(TAG, "alarm refresh", e));
});

// Re-arm the alarm (refresh interval) and re-rank the badge (favorites) on a settings change.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[SETTINGS.KEY]) {
    ensureAlarm();
    refreshBadgeFromCache();
  }
});

// Dismiss a notification when the user clicks it (we can't programmatically open the popup).
try {
  chrome.notifications.onClicked.addListener((id) => {
    try {
      chrome.notifications.clear(id);
    } catch (_) {}
  });
} catch (_) {}

chrome.runtime.onInstalled.addListener(warmUp);
chrome.runtime.onStartup.addListener(warmUp);
