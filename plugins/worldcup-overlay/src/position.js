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

  // ---- drag-to-resize (zoom) ----

  /**
   * For a widget anchored at `corner`, which way does its free (opposite) corner lie from the anchor?
   * +1 means the free corner is to the right / below the anchor, -1 left / above. The resize grip
   * lives at that free corner; dragging it away from the anchor enlarges the widget.
   */
  function resizeVector(corner) {
    const isLeft = corner === "tl" || corner === "bl";
    const isTop = corner === "tl" || corner === "tr";
    return { signX: isLeft ? 1 : -1, signY: isTop ? 1 : -1 };
  }

  /**
   * Zoom factor implied by a resize drag: project the pointer's offset from the (fixed) anchor
   * corner onto the widget's diagonal and divide by the unscaled diagonal length, so the grip
   * tracks the pointer. Clamped to [min, max]; never returns NaN.
   * @param {{anchorX,anchorY,pointerX,pointerY,baseW,baseH,signX,signY,min?,max?}} o
   */
  function scaleFromDrag(o) {
    const hyp = Math.hypot(o.baseW, o.baseH) || 1;
    const dirX = (o.signX * o.baseW) / hyp;
    const dirY = (o.signY * o.baseH) / hyp;
    const proj = (o.pointerX - o.anchorX) * dirX + (o.pointerY - o.anchorY) * dirY;
    let s = proj / hyp;
    if (!Number.isFinite(s)) s = 1;
    const lo = o.min == null ? 0.1 : o.min;
    const hi = o.max == null ? 10 : o.max;
    return Math.min(hi, Math.max(lo, s));
  }

  WC.position = { nearestCorner, clampToViewport, resizeVector, scaleFromDrag };
})();
