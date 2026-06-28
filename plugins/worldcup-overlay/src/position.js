// Drag-to-reposition geometry. Classic self.WC content script. Pure aside from the namespace
// assignment; covered by test/position.test.mjs. The widget snaps to the nearest of the 4 corners
// on release (so placement stays resize-safe via the .wc-pos-* classes); these helpers do the math.

(() => {
  const WC = (self.WC = self.WC || {});

  /** Which corner is the box closest to (by its center)? -> "tl" | "tr" | "bl" | "br". */
  function nearestCorner(box) {
    const { x, y, w, h, vw, vh } = box;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const vertical = cy < vh / 2 ? "t" : "b";
    const horizontal = cx < vw / 2 ? "l" : "r";
    return vertical + horizontal;
  }

  /** Clamp the box's top-left so it stays fully on screen with `margin` px breathing room. */
  function clampToViewport(box, margin) {
    const m = margin || 0;
    const { x, y, w, h, vw, vh } = box;
    return {
      x: Math.max(m, Math.min(x, vw - w - m)),
      y: Math.max(m, Math.min(y, vh - h - m)),
    };
  }

  WC.position = { nearestCorner, clampToViewport };
})();
