// Defensive sanitizing of raw TheSportsDB payloads. Pure ES module (no chrome / network), imported
// by api.js and unit-tested directly. The provider occasionally returns `events: null`, a string,
// duplicate rows, blank teams, or junk scores; nothing here is allowed to throw, so one bad row can
// never poison the deck. Runs BEFORE normalizeEvent — it cleans the raw provider shape.

const MAX_EVENTS = 500; // cap an absurd payload so a runaway response can't blow up memory
const MAX_SCORE = 99; // plausible upper bound for a football scoreline; above this = treat as unknown

const trimOrEmpty = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** Coerce a raw `events` value (array | null | string | object) into a bounded array of records. */
export function asEventArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.length > MAX_EVENTS ? raw.slice(0, MAX_EVENTS) : raw;
}

/** A plausible non-negative integer score, or null when missing / unparseable / absurd. */
export function cleanScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  const i = Math.round(n);
  return i > MAX_SCORE ? null : i;
}

/**
 * Clean a single raw record. Returns a shallow copy with trimmed strings and sane scores, or
 * `null` to DROP the record (no id, or both team names blank). Unknown fields pass through
 * untouched so normalizeEvent still sees everything it reads.
 */
export function cleanRecord(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = trimOrEmpty(raw.idEvent);
  if (!id) return null;

  const home = trimOrEmpty(raw.strHomeTeam);
  const away = trimOrEmpty(raw.strAwayTeam);
  if (!home && !away) return null; // a match with neither side named is useless

  return {
    ...raw,
    idEvent: id,
    strHomeTeam: home || raw.strHomeTeam, // keep undefined-ish through to normalizeEvent's default
    strAwayTeam: away || raw.strAwayTeam,
    strVenue: trimOrEmpty(raw.strVenue),
    strStatus: trimOrEmpty(raw.strStatus),
    strProgress: trimOrEmpty(raw.strProgress),
    intHomeScore: cleanScore(raw.intHomeScore),
    intAwayScore: cleanScore(raw.intAwayScore),
  };
}

/**
 * Sanitize a whole payload: bound the array, clean each record, drop the rejects.
 * @returns {object[]} cleaned raw records (still the provider shape, ready for normalizeEvent)
 */
export function sanitizeEvents(rawEventsValue) {
  const out = [];
  for (const raw of asEventArray(rawEventsValue)) {
    const clean = cleanRecord(raw);
    if (clean) out.push(clean);
  }
  return out;
}
