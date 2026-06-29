// Tiny i18n wrapper. Classic self.WC content script. self.WC.t(key, fallback) returns the
// chrome.i18n localized string when available (the overlay, popup and options all run with the
// extension's i18n), and the literal English fallback otherwise — so it also works under node
// (chrome.i18n absent) and the unit tests stay deterministic. Covered by test/i18n.test.mjs.
//
// Missing keys in a non-default locale fall back to _locales/en automatically (Chrome behavior),
// so only en/messages.json must be complete; other locales can translate a subset.

(() => {
  const WC = (self.WC = self.WC || {});

  function t(key, fallback) {
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        const m = chrome.i18n.getMessage(key);
        if (m) return m;
      }
    } catch (_) {}
    return fallback != null ? fallback : key;
  }

  /**
   * The direction the overlay should use. For an injected widget the PAGE's direction is what
   * matters (so it mirrors on an Arabic/Hebrew site), so prefer that; fall back to the extension
   * UI locale's @@bidi_dir. Returns "rtl" | "ltr".
   */
  function dir() {
    try {
      const d =
        (document.documentElement && document.documentElement.getAttribute("dir")) ||
        document.dir ||
        (document.body && document.body.getAttribute("dir"));
      if (d === "rtl") return "rtl";
      if (d === "ltr") return "ltr";
    } catch (_) {}
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        const b = chrome.i18n.getMessage("@@bidi_dir");
        if (b === "rtl" || b === "ltr") return b;
      }
    } catch (_) {}
    return "ltr";
  }

  WC.t = t;
  WC.dir = dir;
})();
