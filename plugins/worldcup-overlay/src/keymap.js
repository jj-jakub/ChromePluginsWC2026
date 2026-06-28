// Keyboard mapping for the overlay. Classic self.WC content script. Pure aside from the namespace
// assignment; covered by test/keymap.test.mjs. content.js attaches a keydown handler scoped to
// focus inside #wc-overlay-root and dispatches the returned action.

(() => {
  const WC = (self.WC = self.WC || {});

  /**
   * Map a KeyboardEvent.key to an overlay action (or null to ignore / let the browser handle it).
   * Enter/Space on a focused control is left to the browser (native button activation).
   * @param {string} key   KeyboardEvent.key
   * @param {{minimized?: boolean, isRtl?: boolean}} ctx
   * @returns {"earlier"|"later"|"minimize"|"refresh"|"expand"|null}
   */
  function keyToAction(key, ctx) {
    const c = ctx || {};
    const k = String(key || "");
    if (c.minimized) {
      // Collapsed: Enter/Space expands (native button activation also works); Esc does nothing.
      return k === "Enter" || k === " " || k === "Spacebar" ? "expand" : null;
    }
    switch (k) {
      case "ArrowLeft":
        return c.isRtl ? "later" : "earlier";
      case "ArrowRight":
        return c.isRtl ? "earlier" : "later";
      case "Escape":
        return "minimize";
      case "r":
      case "R":
        return "refresh";
      default:
        return null;
    }
  }

  WC.keymap = { keyToAction };
})();
