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

  /** The UI direction for the current page ("rtl" on RTL locales/pages, else "ltr"). */
  function dir() {
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        const d = chrome.i18n.getMessage("@@bidi_dir");
        if (d === "rtl" || d === "ltr") return d;
      }
    } catch (_) {}
    try {
      return document.documentElement.dir === "rtl" || document.dir === "rtl" ? "rtl" : "ltr";
    } catch (_) {}
    return "ltr";
  }

  WC.t = t;
  WC.dir = dir;
})();
