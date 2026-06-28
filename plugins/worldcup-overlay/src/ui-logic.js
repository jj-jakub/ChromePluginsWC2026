// Small UI decisions shared by the content script and popup. Classic self.WC content script.
// Pure aside from the namespace assignment; covered by test/ui-logic.test.mjs.

(() => {
  const WC = (self.WC = self.WC || {});

  /**
   * Resolve the effective theme from the user's preference and the OS scheme.
   * @param {"auto"|"light"|"dark"} pref
   * @param {boolean} systemDark  matchMedia('(prefers-color-scheme: dark)').matches
   * @returns {"light"|"dark"}
   */
  function resolveTheme(pref, systemDark) {
    if (pref === "light") return "light";
    if (pref === "dark") return "dark";
    return systemDark ? "dark" : "light"; // "auto"
  }

  WC.ui = { resolveTheme };
})();
