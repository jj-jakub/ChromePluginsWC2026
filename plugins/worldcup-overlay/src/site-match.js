// Per-site allow/deny matching. Classic self.WC content script (content.js sees its own
// location.hostname — no new permission). Decides whether the overlay should show on a host.
// Pure aside from the namespace assignment; covered by test/site-match.test.mjs.
//
// Rule forms: exact host ("bank.com"), leading-dot suffix (".example.com" matches example.com and
// any subdomain), or a single "*" wildcard (every site). Modes: "deny" (hide on listed sites,
// the default) or "allow" (show ONLY on listed sites). Empty rule list = no restriction (show).

(() => {
  const WC = (self.WC = self.WC || {});

  const norm = (h) => String(h || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");

  /** Does `hostname` match a single rule? */
  function ruleMatches(hostname, rule) {
    const host = norm(hostname);
    const r = String(rule || "").trim().toLowerCase();
    if (!r || !host) return false;
    if (r === "*") return true;
    if (r.startsWith(".")) {
      const suffix = norm(r);
      return host === suffix || host.endsWith("." + suffix);
    }
    return host === norm(r);
  }

  /**
   * Should the overlay be shown on `hostname`, given the user's rules + mode?
   * @param {string} hostname
   * @param {string[]} rules
   * @param {"deny"|"allow"} mode
   * @returns {boolean}
   */
  function siteAllowed(hostname, rules, mode) {
    const list = Array.isArray(rules) ? rules : [];
    if (list.length === 0) return true; // no rules = no restriction, in either mode
    const hit = list.some((r) => ruleMatches(hostname, r));
    return mode === "allow" ? hit : !hit;
  }

  WC.site = { siteAllowed, ruleMatches };
})();
