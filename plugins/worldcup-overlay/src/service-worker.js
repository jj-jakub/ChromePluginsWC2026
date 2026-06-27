// World Cup Overlay — background service worker (MV3, module).
//
// Fetches World Cup data from TheSportsDB, computes the single "what to show" state, caches it,
// keeps it warm with a chrome.alarms timer, and answers WC_GET_STATE from content scripts.
// Network runs here so host_permissions bypass page CORS.

import { fetchEvents } from "./api.js";
import { buildDeck } from "./wc-state.js";

const MSG_GET_STATE = "WC_GET_STATE";
const CACHE_KEY = "wc_state_cache";
const ALARM = "wc-refresh";

// Serve cached state for this long before refetching. Short when a match is live so scores/
// status move; longer otherwise to be gentle on the API.
const TTL_LIVE_MS = 60 * 1000;
const TTL_IDLE_MS = 5 * 60 * 1000;

let inFlight = null; // de-dupe concurrent refreshes

function hasLive(state) {
  return !!(state && state.matches && state.matches.some((m) => m.matchMode === "live"));
}

function ttlFor(state) {
  return hasLive(state) ? TTL_LIVE_MS : TTL_IDLE_MS;
}

async function readCache() {
  const got = await chrome.storage.local.get(CACHE_KEY);
  return got[CACHE_KEY] || null;
}

async function writeCache(entry) {
  await chrome.storage.local.set({ [CACHE_KEY]: entry });
}

async function refresh() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const now = Date.now();
    const events = await fetchEvents(now);
    const deck = buildDeck(events, now);
    const state = { matches: deck.matches, index: deck.primaryIndex, updatedAt: now };
    const entry = { state, fetchedAt: now };
    await writeCache(entry);
    return entry;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// Return fresh-enough cache, else refetch. `force` skips the cache (manual refresh button).
// On fetch failure, fall back to stale cache so the overlay degrades gracefully.
async function getState(force) {
  const cached = await readCache();
  const fresh =
    !force && cached && Date.now() - cached.fetchedAt < ttlFor(cached.state) ? cached : null;
  if (fresh) return { ok: true, state: fresh.state, fetchedAt: fresh.fetchedAt };

  try {
    const entry = await refresh();
    return { ok: true, state: entry.state, fetchedAt: entry.fetchedAt };
  } catch (err) {
    if (cached) {
      return { ok: true, state: cached.state, fetchedAt: cached.fetchedAt, stale: true };
    }
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === MSG_GET_STATE) {
    getState(msg.force).then(sendResponse);
    return true; // async response
  }
  return false;
});

function ensureAlarm() {
  chrome.alarms.create(ALARM, { periodInMinutes: 2 });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refresh().catch((e) => console.warn("[worldcup-overlay] refresh", e));
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  refresh().catch((e) => console.warn("[worldcup-overlay] initial refresh", e));
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  refresh().catch(() => {});
});
