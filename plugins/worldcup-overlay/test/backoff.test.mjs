import test from "node:test";
import assert from "node:assert/strict";
import { nextDelay, classifyHealth } from "../src/backoff.js";

const BASE = 60_000;
const MAX = 30 * 60_000;

test("nextDelay grows exponentially and saturates at the cap", () => {
  assert.equal(nextDelay(0, BASE, MAX), 0);
  assert.equal(nextDelay(-3, BASE, MAX), 0);
  assert.equal(nextDelay(1, BASE, MAX), BASE);
  assert.equal(nextDelay(2, BASE, MAX), 2 * BASE);
  assert.equal(nextDelay(3, BASE, MAX), 4 * BASE);
  assert.equal(nextDelay(4, BASE, MAX), 8 * BASE);
  assert.equal(nextDelay(100, BASE, MAX), MAX); // capped, never overflows
});

const OPTS = { DOWN_FAILURES: 4, DOWN_AGE_MS: 20 * 60_000 };
const NOW = 1_000_000_000_000;

test("classifyHealth: ok when there are no failures", () => {
  assert.equal(classifyHealth({ failures: 0, lastSuccessMs: NOW, now: NOW }, OPTS), "ok");
});

test("classifyHealth: degraded on a few recent failures with fresh data", () => {
  assert.equal(classifyHealth({ failures: 1, lastSuccessMs: NOW - 60_000, now: NOW }, OPTS), "degraded");
  assert.equal(classifyHealth({ failures: 3, lastSuccessMs: NOW - 60_000, now: NOW }, OPTS), "degraded");
});

test("classifyHealth: down once the failure threshold is hit", () => {
  assert.equal(classifyHealth({ failures: 4, lastSuccessMs: NOW - 60_000, now: NOW }, OPTS), "down");
});

test("classifyHealth: down when the last success is too stale", () => {
  assert.equal(classifyHealth({ failures: 2, lastSuccessMs: NOW - 25 * 60_000, now: NOW }, OPTS), "down");
});

test("classifyHealth: never-succeeded is degraded with few failures, down with many", () => {
  assert.equal(classifyHealth({ failures: 1, lastSuccessMs: null, now: NOW }, OPTS), "degraded");
  assert.equal(classifyHealth({ failures: 5, lastSuccessMs: null, now: NOW }, OPTS), "down");
});
