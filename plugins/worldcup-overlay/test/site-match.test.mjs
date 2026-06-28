import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/site-match.js", import.meta.url));
const { siteAllowed, ruleMatches } = globalThis.WC.site;

test("ruleMatches: exact host, leading-dot suffix (incl. apex), and wildcard", () => {
  assert.equal(ruleMatches("bank.com", "bank.com"), true);
  assert.equal(ruleMatches("www.bank.com", "bank.com"), false); // exact, not suffix
  assert.equal(ruleMatches("bank.com", ".bank.com"), true); // apex
  assert.equal(ruleMatches("secure.bank.com", ".bank.com"), true); // subdomain
  assert.equal(ruleMatches("notbank.com", ".bank.com"), false);
  assert.equal(ruleMatches("anything.example", "*"), true);
  assert.equal(ruleMatches("HOST.com", "host.com"), true); // case-insensitive
});

test("siteAllowed: deny mode hides on matches, allow mode shows only on matches", () => {
  assert.equal(siteAllowed("mail.google.com", ["mail.google.com"], "deny"), false);
  assert.equal(siteAllowed("example.com", ["mail.google.com"], "deny"), true);
  assert.equal(siteAllowed("mail.google.com", [".google.com"], "allow"), true);
  assert.equal(siteAllowed("example.com", [".google.com"], "allow"), false);
});

test("siteAllowed: empty rules = no restriction in either mode", () => {
  assert.equal(siteAllowed("example.com", [], "deny"), true);
  assert.equal(siteAllowed("example.com", [], "allow"), true);
  assert.equal(siteAllowed("example.com", null, "allow"), true);
});
