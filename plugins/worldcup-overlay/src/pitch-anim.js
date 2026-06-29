// Thin DOM runner that animates the schematic pitch — the only non-pure piece of the pitch
// feature (it touches SVG nodes + requestAnimationFrame, so it isn't unit-tested; all the maths it
// relies on lives in pitch.js, which is). Shared on self.WC.pitchAnim and used by both the content
// overlay (content.js) and the toolbar popup (popup.js).
//
// run() recomputes the deterministic layout/path from the SAME match the renderer drew from, so the
// ball path and player positions stay in lockstep with the static markup. It returns a cancel()
// that MUST be called before the next render (the host innerHTML is replaced wholesale) or when
// leaving pitch mode, otherwise a stale rAF loop would write to detached nodes.

(() => {
  const WC = (self.WC = self.WC || {});

  const CYCLE_MS = 13000; // one full possession loop around the pass path
  const BOB_AMP = 0.7; // gentle idle drift for each player, in viewBox units

  function reducedMotion() {
    try {
      return !!(self.matchMedia && self.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_) {
      return false;
    }
  }

  /**
   * Animate the freshly-rendered pitch inside `host`.
   * @param {Element} host    element containing a `.wc-pitch` svg
   * @param {Object}  match   the WcEvent the pitch was drawn for (for deterministic geometry)
   * @param {number}  startMs animation epoch (so the loop is continuous across re-renders)
   * @returns {() => void} cancel
   */
  function run(host, match, startMs) {
    const noop = () => {};
    if (!host || !match || !WC.pitch || typeof host.querySelector !== "function") return noop;
    const svg = host.querySelector(".wc-pitch");
    if (!svg) return noop;
    const ball = svg.querySelector(".wc-pitch-ball");
    const players = Array.prototype.slice.call(svg.querySelectorAll(".wc-pl"));

    const hForm = match.homeFormation || WC.pitch.formationFor(match.home);
    const aForm = match.awayFormation || WC.pitch.formationFor(match.away);
    const path = WC.pitch.passPath(WC.pitch.layout(hForm, aForm));

    // Position the ball at the given phase and each player at its formation slot plus an optional
    // idle bob. With animate=false (the static/reduced-motion frame) players sit exactly on their
    // coordinates — the bob terms are non-zero at t=0, so they must be suppressed, not just evaluated.
    const place = (phase, t, animate) => {
      if (ball) {
        const b = WC.pitch.ballAt(path, phase);
        ball.setAttribute("transform", `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`);
      }
      for (let i = 0; i < players.length; i++) {
        const el = players[i];
        const bx = parseFloat(el.getAttribute("data-x"));
        const by = parseFloat(el.getAttribute("data-y"));
        if (!isFinite(bx) || !isFinite(by)) continue;
        const dx = animate ? Math.sin(t / 900 + i * 1.7) * BOB_AMP : 0;
        const dy = animate ? Math.cos(t / 1100 + i * 2.3) * BOB_AMP : 0;
        el.setAttribute("transform", `translate(${(bx + dx).toFixed(2)} ${(by + dy).toFixed(2)})`);
      }
    };

    if (reducedMotion() || typeof self.requestAnimationFrame !== "function") {
      place(0, 0, false); // static schematic: formation + ball at the start point, no motion
      return noop;
    }

    let raf = 0;
    let stopped = false;
    const epoch = typeof startMs === "number" ? startMs : Date.now();
    const frame = () => {
      if (stopped) return;
      const elapsed = Date.now() - epoch;
      place((elapsed % CYCLE_MS) / CYCLE_MS, elapsed, true);
      raf = self.requestAnimationFrame(frame);
    };
    raf = self.requestAnimationFrame(frame);
    return () => {
      stopped = true;
      if (raf && typeof self.cancelAnimationFrame === "function") self.cancelAnimationFrame(raf);
    };
  }

  WC.pitchAnim = { run, CYCLE_MS };
})();
