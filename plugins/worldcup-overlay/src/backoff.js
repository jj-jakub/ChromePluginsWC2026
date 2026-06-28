// Fetch-failure backoff + health classification. Pure ES module (no chrome / network), imported by
// the service worker and unit-tested directly. Turns a silent, full-speed retry storm into honest,
// calm degradation: after each failure the next attempt is delayed by a capped exponential, and the
// content overlay is told whether data is ok / degraded / down so it can show precise copy.

/**
 * Capped exponential backoff. failures=1 -> base, 2 -> 2*base, 3 -> 4*base, ... saturating at max.
 * @param {number} failures consecutive failures (>=1)
 * @param {number} baseMs    delay after the first failure
 * @param {number} maxMs     ceiling
 * @returns {number} delay in ms before the next attempt (0 when failures<=0)
 */
export function nextDelay(failures, baseMs, maxMs) {
  if (!Number.isFinite(failures) || failures <= 0) return 0;
  const grown = baseMs * Math.pow(2, failures - 1);
  return Math.min(maxMs, grown);
}

/**
 * Coarse data-health from the failure counter and the age of the last success.
 * @param {{lastSuccessMs: number|null, failures: number, now: number}} s
 * @param {{DOWN_FAILURES: number, DOWN_AGE_MS: number}} opts thresholds (from config.HEALTH)
 * @returns {"ok"|"degraded"|"down"}
 */
export function classifyHealth(s, opts) {
  const failures = s && Number.isFinite(s.failures) ? s.failures : 0;
  if (failures <= 0) return "ok";

  const { DOWN_FAILURES, DOWN_AGE_MS } = opts;
  const staleAge =
    s.lastSuccessMs != null && Number.isFinite(s.now) && s.now - s.lastSuccessMs > DOWN_AGE_MS;
  // Never had a success, or many in a row, or no fresh data for too long => down.
  if (failures >= DOWN_FAILURES || staleAge || s.lastSuccessMs == null) {
    return failures >= DOWN_FAILURES || staleAge ? "down" : "degraded";
  }
  return "degraded";
}
