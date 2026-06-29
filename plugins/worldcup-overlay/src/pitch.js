// Pure pitch geometry for the schematic "play area" view — no DOM, no chrome APIs, no network.
// Exposed on the shared content-script namespace (self.WC.pitch) and unit-tested via the `self`
// shim (test/pitch.test.mjs). render.js draws from layout()/passPath(); pitch-anim.js animates the
// ball along ballAt() and bobs the players around their layout positions.
//
// IMPORTANT: this is illustrative, not real tracking data. TheSportsDB's free tier exposes no
// player coordinates (and no provider sells live WC2026 positional data to a hobby extension), so
// positions are derived deterministically from each side's formation. The UI labels it as such.
//
// Coordinate space = SVG user units of a 100 (length) x 64 (width) viewBox:
//   x: 0 = home goal line, 100 = away goal line, 50 = halfway.
//   y: 0 = top touchline, 64 = bottom touchline, 32 = centre.
// Home defends x≈0 and is laid out across x∈[~6..46]; away mirrors it across x∈[~54..94].

(() => {
  const WC = (self.WC = self.WC || {});

  const W = 100; // pitch length in user units
  const H = 64; // pitch width in user units
  const GK_X = 6; // home keeper depth from its own goal line (away mirrors to W-GK_X)
  const DEF_X = 20; // home back line depth
  const ATT_X = 46; // home front line depth (just short of halfway so the two sides don't overlap)

  // A handful of plausible shapes; a side with no provider formation gets one picked from its name.
  const FORMATIONS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2", "4-5-1"];

  // Tiny stable string hash -> non-negative int (deterministic; no Math.random).
  function hash(s) {
    let h = 0;
    const str = String(s == null ? "" : s);
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h < 0 ? -h : h;
  }

  /** Pick a plausible formation string for a team, deterministically from its name. */
  function formationFor(name) {
    return FORMATIONS[hash(name) % FORMATIONS.length];
  }

  /**
   * Parse a formation like "4-3-3" into outfield row counts (defence -> attack). The ten outfield
   * players must add up to exactly 10; anything malformed or out of range falls back to 4-3-3.
   * @returns {number[]}
   */
  function parseFormation(str) {
    const parts = String(str == null ? "" : str)
      .trim()
      .split("-")
      .map((n) => parseInt(n, 10));
    const ok =
      parts.length >= 2 &&
      parts.length <= 5 &&
      parts.every((n) => Number.isFinite(n) && n >= 1 && n <= 6);
    const total = ok ? parts.reduce((a, b) => a + b, 0) : 0;
    return ok && total === 10 ? parts : [4, 3, 3];
  }

  // Lay out one side's 11 players. Home reads left->right; away is the mirror image.
  function sidePlayers(formationStr, isHome) {
    const rows = parseFormation(formationStr);
    const R = rows.length;
    const out = [];
    // Keeper.
    out.push({ x: isHome ? GK_X : W - GK_X, y: H / 2, n: 1, gk: true });
    // Outfield rows, evenly stepped from the back line to the front line.
    let n = 2;
    rows.forEach((count, r) => {
      const base = R === 1 ? (DEF_X + ATT_X) / 2 : DEF_X + ((ATT_X - DEF_X) * r) / (R - 1);
      const x = isHome ? base : W - base;
      for (let j = 0; j < count; j++) {
        const y = (H * (j + 1)) / (count + 1); // spread across the width, inset from both touchlines
        out.push({ x, y, n: n++ });
      }
    });
    return out;
  }

  /**
   * Full two-team layout. Each entry is { x, y, n, gk? } in viewBox units.
   * @returns {{ home: Object[], away: Object[] }}
   */
  function layout(homeFormation, awayFormation) {
    return { home: sidePlayers(homeFormation, true), away: sidePlayers(awayFormation, false) };
  }

  /**
   * A believable, deterministic build-up the ball traces as a closed loop: home keeper -> through
   * the home lines -> toward the away goal -> away keeper restarts -> back the other way. Player
   * indices are clamped so it stays valid for any formation.
   * @returns {{x:number,y:number}[]}
   */
  function passPath(lay) {
    const h = (lay && lay.home) || [];
    const a = (lay && lay.away) || [];
    const at = (arr, i) => arr[Math.min(Math.max(i, 0), arr.length - 1)] || { x: W / 2, y: H / 2 };
    const pts = [
      at(h, 0), // home keeper
      at(h, 2), // a defender
      at(h, h.length - 4), // into midfield
      at(h, h.length - 2), // wide forward
      { x: W - 12, y: 24 }, // ball driven at the away goal (cross/shot)
      at(a, 0), // away keeper collects
      at(a, 2), // away defender
      at(a, a.length - 4), // away midfield
      at(a, a.length - 2), // away forward
      { x: 12, y: 40 }, // back at the home goal
    ];
    return pts.map((p) => ({ x: p.x, y: p.y }));
  }

  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * Position of the ball along a closed pass path at phase f. f wraps into [0,1) so callers can
   * pass elapsed/cycle directly; the path loops smoothly (last point connects back to the first).
   * @returns {{x:number,y:number}}
   */
  function ballAt(path, f) {
    const N = path ? path.length : 0;
    if (!N) return { x: W / 2, y: H / 2 };
    if (N === 1) return { x: path[0].x, y: path[0].y };
    const raw = Number(f);
    const u = Number.isFinite(raw) ? ((raw % 1) + 1) % 1 : 0; // normalize into [0,1)
    const scaled = u * N;
    const seg = Math.floor(scaled) % N;
    const local = scaled - Math.floor(scaled);
    const p = path[seg];
    const q = path[(seg + 1) % N];
    return { x: lerp(p.x, q.x, local), y: lerp(p.y, q.y, local) };
  }

  WC.pitch = { W, H, FORMATIONS, formationFor, parseFormation, layout, passPath, ballAt };
})();
