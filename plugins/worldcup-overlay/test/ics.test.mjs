import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/ics.js", import.meta.url));
const { toICS, filenameFor } = globalThis.WC.ics;

const m = {
  id: "123",
  home: "Brazil",
  away: "Norway",
  venue: "MetLife Stadium",
  kickoffMs: Date.UTC(2026, 5, 27, 19, 0, 0),
};

test("toICS emits a valid VCALENDAR/VEVENT with CRLF lines and a VALARM", () => {
  const ics = toICS([m]);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /UID:wc-123@worldcup-overlay/);
  assert.match(ics, /DTSTART:20260627T190000Z/);
  assert.match(ics, /DTEND:20260627T204500Z/); // kickoff + 105 min
  assert.match(ics, /SUMMARY:Brazil vs Norway/);
  assert.match(ics, /LOCATION:MetLife Stadium/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.ok(ics.endsWith("\r\n"));
});

test("toICS escapes commas / semicolons / backslashes per RFC 5545", () => {
  const ics = toICS([{ id: "1", home: "A; B", away: "C, D", venue: "x\\y", kickoffMs: Date.UTC(2026, 5, 27, 19) }]);
  assert.match(ics, /SUMMARY:A\\; B vs C\\, D/);
  assert.match(ics, /LOCATION:x\\\\y/);
});

test("toICS drops matches without a kickoff and is deterministic (no Date.now)", () => {
  assert.doesNotMatch(toICS([{ id: "1", home: "A", away: "B", kickoffMs: null }]), /BEGIN:VEVENT/);
  assert.equal(toICS([m]), toICS([m])); // stable DTSTAMP from the earliest kickoff
});

test("toICS folds long content lines at 75 octets (RFC 5545 §3.1)", () => {
  const longName = "Federated Republic of Verylongnationlandia and its Territories Overseas";
  const ics = toICS([{ id: "1", home: longName, away: "Brazil", kickoffMs: Date.UTC(2026, 5, 27, 19) }]);
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long (${Buffer.byteLength(line, "utf8")}): ${line}`);
  }
});

test("filenameFor builds a safe filename", () => {
  assert.equal(filenameFor(m), "wc-brazil-vs-norway.ics");
  assert.equal(filenameFor(null), "world-cup-fixtures.ics");
});
