/**
 * THE FLIGHT TABLE. One record per flight of one object, 27 flights over 94 s.
 *
 * A record is a POLYLINE in SCREEN space, not a preset with anchors:
 *   keys: [ [t, x%, y%, size, rot], ... ]
 *     t     absolute video seconds, the same clock as slides.js
 *     x/y   the object's CENTRE, percent of the stage
 *     size  its extent on screen, design px (the sprite is cropped square
 *           around its own alpha, so this is what you can measure with a ruler)
 *     rot   its in-plane angle, degrees
 *
 * HOW IT WAS MEASURED (`_refs/DP-15152 - clean bg.mp4`, the clip WITHOUT the
 * journal, so nothing occludes an object), by scripts/fly-measure.mjs:
 *   1. Background plate = per-pixel temporal MEDIAN over a wide window. The
 *      ship interior is quasi-static and the objects move, so they fall out of
 *      the median and a colour distance against it isolates them.
 *   2. Threshold, close, connected components, nearest-neighbour tracks per
 *      slide window, then union across the windows.
 *   3. Each track's SPRITE is then correlated against the clip frame by frame
 *      over angle and scale — silhouette overlap plus luminance — which is what
 *      produces `size` and `rot`. Angles fold onto one branch of the artwork's
 *      own symmetry.
 *   4. The rows kept are the ones a straight line between neighbours cannot
 *      reproduce (0.35 % of frame, 4.5 % of size, 2.5 deg).
 * Depth order came from the SECOND clip: `preview.mp4` and `clean bg.mp4`
 * differ only where the journal is drawn, so an object pixel that changes
 * between them is a pixel the journal painted over.
 *
 * WHAT THE MEASUREMENT SAYS, and where it corrects every earlier reading:
 *   - THE THREE COINS ARE THREE POSES OF ONE EXPORT, and which pose goes to
 *     which flight is settled by LOOKING at the clip, not by measuring how
 *     round the blob is. `cash-a` carries five coins at five viewing angles.
 *     Frame 12 at t = 31.3: the top-left coin is almost edge on — a milled rim
 *     band with a navy sliver of face and a `$` too foreshortened to read
 *     (`coin-edge`); the top-right one is turned about its vertical axis with
 *     the band down its right side (`coin-d`); the low one is a three-quarter
 *     view with the band along its lower left and the `$` fully legible
 *     (`coin-b`). No flight of frame 12 shows the coin face on, so `coin-face`
 *     is used by nothing.
 *
 *     An earlier pass assigned these by silhouette ELONGATION — the clip's
 *     1.46/1.69/1.21 against the sprites' 1.48/1.63/1.02 — and that moved all
 *     three one place along: coin-1 to `coin-b`, coin-2 to `coin-d`, coin-3 to
 *     `coin-face`. The measurement was answering the wrong question. Elongation
 *     is read off a mask that reaches into the magenta halo, and a halo is round
 *     whatever the coin is doing inside it: the top-left coin measures 1.69
 *     where the picture of it is nearer 2.6. On the contact sheet the swap is
 *     plain — at t = 30.83, 32.07 and 33.30 ours is a fat three-quarter coin
 *     with a legible `$` where the clip has a thin milled sliver (V-04).
 *
 *     `scripts/fly-measure.mjs` had the right assignment all along, in its
 *     ASSIGN table, and the runtime and the gate had drifted apart because only
 *     this file was edited: `fly-reference.json` went on judging coin-1's angle
 *     as a `coin-d` while the page drew a `coin-b`. One assignment, in the
 *     measurement, used by both.
 *   - SWAPPING A SPRITE MOVES ITS OWN FRAME, so `size` and `rot` move with it —
 *     which is why the swap is not a one-line edit here but a re-run of
 *     `npm run fly:measure`. The fit correlates THE SPRITE against the clip, so
 *     both columns come back in the new sprite's own frame. Hand-fitting them by
 *     a constant, as the elongation pass did, only holds while the sprite is
 *     right.
 *   - THE OBJECTS ARE FLAT AND BARELY ROTATE. The pen holds 46-48 deg for the
 *     whole of its 6 s, and its silhouette keeps an elongation of 8.5-8.9
 *     against the sprite's 8.3 — i.e. no foreshortening at all. The `spin`
 *     column of the previous table (rotationY up to 60 deg) squashed flat art
 *     by cos of an angle the reference never turns through.
 *   - THEY ARE BIGGER THAN THE PREVIOUS TABLE THOUGHT, by about two. The pen
 *     measures 400-440 design px across; the old record said 211. Most of that
 *     gap was the art floating inside its 700 px export frame at 48-88 %
 *     depending on the asset — see scripts/fly-sprites.mjs.
 *   - EVERY FLIGHT ENDS BEHIND THE JOURNAL. On the reference's own frames the
 *     journal covers 89-100 % of the object by the end of all but one flight,
 *     and 0 % at the start of every one: the objects enter past a frame edge,
 *     hover, then sink onto the page and are hidden by it. They do not fade,
 *     and they do not leave through the opposite edge.
 *   - FRAMES 4-7 CARRY NO FLIGHTS. Figma's "Ithems fly" group is in the clip,
 *     but from 4.6 s the cover fills the frame and the group is behind it:
 *     measured 100 % covered on every sampled frame, nothing visible. Before
 *     that it is scenery inside the camera's own fly-through, at frame-filling
 *     scale. Neither is a flying object; the three records are gone.
 *
 * DEPTH. Two depths and a crossing time, not one depth: an object flies IN
 * FRONT of the journal and passes behind it partway through, and `zFlip` says
 * when — the first frame the page touches it, measured at 10 Hz off the clip.
 * Both depths are sort keys rather than sizes — _fly.scss divides the
 * perspective back out of the anchor and the box, so `size` and `x`/`y` are
 * literally what lands on screen. That split is what lets the table match the
 * reference's sizes AND its occlusion at the same time.
 *
 * @typedef {[number, number, number, number, number]} FlyKey
 * @typedef {{ id: string, asset: string, frame: number, zFlip: number,
 *             keys: FlyKey[], base: number, t0: number, t1: number }} FlyRecord
 */

/**
 * The two depths an object can be at, design px towards the camera, and the
 * moment it crosses between them.
 *
 * DEPTH IS NOT CONSTANT OVER A FLIGHT, and treating it as constant is what made
 * the objects read as wrong. An object enters IN FRONT of the journal, drifts
 * down across the page, and only then passes behind it. With a single negative
 * z it is behind from the first frame, so it is clipped by the page the whole
 * way in — which on screen looks like the object being eaten rather than
 * flying over.
 *
 * `zFlip` on each record is when it crosses, and it is a MEASUREMENT, not a
 * choice: `preview.mp4` minus `clean bg.mp4` is the journal and nothing else,
 * so the fraction of an object those two clips disagree about is the fraction
 * the page covers. `scripts/fly-measure.mjs` reads that fraction at 10 Hz for
 * every frame of every flight and `zFlip` is where it FIRST leaves zero and
 * stays off it for 0.3 s.
 *
 * IT USED TO BE THE MIDDLE OF THE HANDOVER, and that is the whole of the "the
 * objects fly in front of the journal" complaint. The fraction was only read at
 * the reference's five sparse samples, about a second apart, and `zFlip` was
 * placed halfway between the last clear one and the first covered one — so a
 * handover the clip completes in 0.7 s could be placed anywhere in a 1.1 s
 * bracket, and it came out late on all 27 flights: by 0.3 s at best, by 4.5 s
 * on milkpack-1, 4.3 on planet-1, 3.7 on basketball-1, 3.3 on planet-cow-1.
 * Those seconds are exactly the frames where the page has the object in the
 * reference and we still have it painted on top.
 *
 * FIRST TOUCH IS ALSO WHY ONE STEP IS ENOUGH. What the curve does after the
 * first touch is not depth — it is the page EDGE sweeping across an object
 * already behind it, which is why the fraction climbs, falls and climbs again
 * (cross-3 wanders between 0.2 and 0.8 for four seconds). Put the step at the
 * first touch and that sweep is drawn by our own geometry, gradually, the way
 * the reference does it, because at the moment of the step the page covers
 * nothing yet and there is nothing to see change. Put the step in the middle,
 * as before, and the object goes from wholly drawn to half eaten in one frame.
 *
 * Re-derive it with `npm run fly:measure`; `fly-reference.json` carries the
 * whole curve per flight under `cover`, plus `zIn`/`zOut`, so the gate judges
 * the same measurement rather than our own table.
 *
 * The magnitudes are arbitrary by construction: _fly.scss divides the
 * perspective back out of both the anchor and the box, so z changes nothing on
 * screen except which side of the page the object is on. They are large enough
 * to clear the journal's own `--jd` and the pose's z, and small enough to stay
 * well inside the camera.
 */
/**
 * Sprites whose silhouette has no long axis, so `rot` in the table below is
 * MEANINGLESS FOR THEM and must not be animated.
 *
 * `rot` comes from correlating the sprite against the clip over angle. For a
 * round shape there is no angle to find, and the fit returns whatever the noise
 * favours frame to frame — coin-3 swung 39 deg between two neighbouring rows,
 * basketball spanned 48 deg over its flight, milkpack-3 jumped 87 deg in one
 * step. Played back through the spline that reads as the object spinning, which
 * is nothing the clip does: measured on the clip, these silhouettes hold still.
 *
 * The threshold is the sprite's own moment elongation < 1.55, measured off its
 * alpha — and 1.55 rather than the 1.2 that looks natural, because the CLIP's
 * own angles say so. Read the reference's angle column for a flight and see how
 * steady it is:
 *
 *   report   elong 1.46   75.0  82.5  82.5  49.5  49.5   jumps 33 deg
 *   planet-cow    1.27    -2.4 -38.4 -36.9 -33.9 -33.9   jumps 36 deg
 *   calendar      1.23   -15.2 -15.2 -52.7 -54.2 -52.7   jumps 39 deg
 *   pen           8.33          steady to 9 deg over six seconds
 *
 * At 1.46 the clip cannot measure its own object's angle to better than 33 deg,
 * so neither can we, and animating that column is animating the disagreement.
 * `calendar` is the clearest case and worth naming: it is not a calendar but a
 * clock face — a disc with a POINTER ARM that sweeps inside it. The disc never
 * turns; the fit locks onto the arm at a different place each frame. A static
 * sprite cannot reproduce a moving arm at all, and pretending otherwise by
 * spinning the whole disc is worse than holding it still.
 *
 * ONE list, used twice: `fly:check` skips its angle comparison for exactly
 * these assets rather than deriving its own threshold. That the two rules were
 * separate — 1.25 here and 1.2 there — is how `calendar` ended up frozen by one
 * and judged by the other.
 *
 * These flights keep a CONSTANT angle — the median of their own rows, so a
 * deliberate tilt survives — rather than zero, which would stand every cross
 * and every clock face upright. Where that median has itself been checked
 * against the clip and found to be noise, ROUND_HOLD below overrides it.
 */
export const ROUND_ASSETS = new Set([
  'basketball', 'calendar', 'coin-b', 'coin-face', 'cross', 'gift', 'heart',
  'planet-cow', 'points-b', 'report', 'spark', 'tennis',
])

/**
 * THE ANGLE A ROUND FLIGHT IS ACTUALLY HELD AT, where the median of its own
 * rows has been measured against the clip and lost.
 *
 * The median is a sensible default and a bad one for `calendar`. Its column
 * reads 21, 21, 24, 27 and then 39 seventeen times over — and those seventeen
 * are not seventeen measurements. `fly-measure.mjs` replaces any key more than
 * ANGLE_OUTLIER (30 deg) from its flight's own median WITH that median, a rule
 * written for cartons and pens that have an axis to be wrong about. On a disc
 * the fit returns noise, the noise sets the median, and the rule then pulls the
 * rest of the column onto it. The number holds itself up.
 *
 * Checked against the clip by session L (2026-09-07) and recorded in V-08:
 * correlating our sprite against the clip answers -2 deg on the only two frames
 * where it is confident at all (22.1 and 22.5, correlation 0.40 and 0.53) and
 * 0.07-0.16 — no answer — on the other eight. Laid over the clip at 20.42, our
 * disc at 0 deg puts the pointer arm and every bead where the clip puts them,
 * and at 39 deg the arm sits at three-to-four o'clock where the clip reads two.
 * Zero, not -2: the correlation's own confidence does not reach a degree, and
 * a clock face the clip draws upright is drawn upright.
 *
 * This is deliberately NOT a third threshold. It is a per-asset measurement,
 * and an asset stays out of it until someone has laid it over the clip and
 * looked. The `rot` column in the table is left exactly as measured — the
 * table is a measurement and is not hand-edited, and flattening a column there
 * would move the keys `dp()` picks off it and reshape flights that are right.
 */
export const ROUND_HOLD = new Map([['calendar', 0]])

export const FLY_Z = -600
export const FLY_Z_FRONT = 600

/** @type {Omit<FlyRecord,'base'|'t0'|'t1'>[]} */
// The rows are a measurement, not hand-authored numbers: regenerate with
// `node scripts/fly-measure.mjs` rather than nudging one and hoping.
// prettier-ignore
const RAW = [
  // pen-1 — frame 8, 10.80..18.17 s
  { id: 'pen-1', asset: 'pen', frame: 8, zFlip: 12.04, keys: [
    [10.80,   57.4,  -11.3,  399,  -91.5],
    [11.00,   59.8,   -3.7,  399,  -85.5],
    [11.24,   62.7,    5.3,  402,  -85.5],
    [11.50,   55.9,    7.3,  407,  -79.5],
    [11.77,   53.5,    8.2,  416,  -78.0],
    [12.30,   53.5,   10.8,  419,  -78.0],
    [13.10,   51.9,   12.1,  408,  -78.0],
    [13.37,   52.2,   12.7,  407,  -78.0],
    [13.64,   52.7,   12.9,  407,  -78.0],
    [14.17,   54.9,   13.3,  408,  -78.0],
    [14.97,   55.8,   12.8,  415,  -76.5],
    [15.50,   54.8,   12.1,  417,  -76.5],
    [15.77,   54.1,   11.9,  414,  -76.5],
    [16.20,   52.9,   12.3,  398,  -76.5],
    [16.60,   53.4,   14.4,  378,  -76.5],
    [16.80,   53.1,   15.4,  363,  -76.5],
    [17.00,   52.9,   17.1,  341,  -76.5],
    [17.20,   52.4,   19.1,  312,  -78.0],
    [17.40,   52.0,   21.7,  283,  -78.0],
    [17.60,   51.5,   25.2,  256,  -78.0],
    [17.80,   50.6,   29.5,  240,  -78.0],
    [18.00,   50.3,   32.5,  227,  -78.0],
    [18.17,   50.1,   35.0,  216,  -78.0],
  ] },
  // calendar-1 — frame 9, 17.13..23.67 s
  { id: 'calendar-1', asset: 'calendar', frame: 9, zFlip: 19.37, keys: [
    [17.13,   64.3,  110.7,  395,   40.5],
    [17.63,   56.4,   96.3,  395,   40.5],
    [17.83,   55.6,   93.4,  394,   39.0],
    [18.03,   54.8,   91.8,  387,   39.0],
    [18.23,   55.1,   90.3,  374,   24.0],
    [18.47,   55.6,   88.8,  354,   39.0],
    [18.73,   55.4,   88.0,  340,   21.0],
    [19.00,   54.9,   87.9,  332,   21.0],
    [19.27,   54.3,   88.0,  331,   27.0],
    [19.53,   53.7,   87.9,  331,   39.0],
    [20.33,   54.8,   88.8,  325,   39.0],
    [20.87,   55.5,   87.4,  307,   39.0],
    [21.07,   55.5,   86.4,  301,   39.0],
    [21.27,   55.1,   85.3,  300,   39.0],
    [21.67,   53.4,   83.0,  301,   39.0],
    [21.87,   52.1,   81.7,  300,   39.0],
    [22.07,   50.9,   80.0,  293,   39.0],
    [22.47,   49.4,   75.7,  258,   39.0],
    [22.87,   48.9,   69.7,  211,   39.0],
    [23.07,   49.0,   68.1,  196,   39.0],
    [23.54,   49.9,   67.3,  186,   39.0],
    [23.67,   50.1,   67.0,  183,   39.0],
  ] },
  // spark-1 — frame 10, 21.87..26.94 s
  { id: 'spark-1', asset: 'spark', frame: 10, zFlip: 22.57, keys: [
    [21.87,   56.1,   -2.6,  109,  -97.5],
    [21.97,   56.4,    1.1,  109,  -97.5],
    [22.17,   57.0,    8.6,  107,  -97.5],
    [22.37,   57.3,   13.2,  103,  -97.5],
    [22.57,   57.6,   15.7,  100,  -96.0],
    [22.77,   57.8,   17.2,   96,  -96.0],
    [22.97,   57.8,   18.1,   94,  -96.0],
    [23.17,   57.6,   18.6,   93,  -96.0],
    [23.40,   57.3,   18.7,   91,  -96.0],
    [23.94,   55.8,   18.6,   88,  -97.5],
    [24.20,   55.0,   19.1,   87,  -97.5],
    [24.47,   54.4,   19.7,   86,  -97.5],
    [25.27,   55.0,   22.8,   81,  -97.5],
    [25.80,   55.4,   24.6,   74,  -96.0],
    [26.07,   55.0,   25.8,   71,  -96.0],
    [26.34,   54.1,   27.9,   68,  -96.0],
    [26.60,   52.6,   31.6,   66,  -97.5],
    [26.94,   50.8,   36.2,   63,  -97.5],
  ] },
  // spark-2 — frame 10, 21.97..26.94 s
  { id: 'spark-2', asset: 'spark', frame: 10, zFlip: 23.17, keys: [
    [21.97,   69.2,   -0.4,  199,  -16.5],
    [22.07,   68.2,    1.1,  199,  -16.5],
    [22.27,   66.3,    4.2,  197,  -16.5],
    [22.47,   65.9,    7.8,  194,  -16.5],
    [22.67,   65.6,   10.0,  190,  -16.5],
    [22.87,   65.3,   11.3,  185,  -12.0],
    [23.27,   64.6,   12.5,  179,  -12.0],
    [23.80,   62.9,   12.4,  177,  -13.5],
    [24.34,   61.0,   13.3,  176,  -13.5],
    [24.60,   60.6,   14.1,  175,  -13.5],
    [25.14,   61.0,   16.4,  171,  -13.5],
    [25.67,   61.4,   18.6,  161,  -16.5],
    [25.94,   60.9,   19.9,  154,  -16.5],
    [26.20,   59.8,   22.0,  144,  -16.5],
    [26.47,   57.9,   25.5,  137,  -16.5],
    [26.74,   55.5,   30.1,  130,  -16.5],
    [26.94,   53.7,   33.6,  125,  -16.5],
  ] },
  // spark-3 — frame 10, 21.87..26.94 s
  { id: 'spark-3', asset: 'spark', frame: 10, zFlip: 23.44, keys: [
    [21.87,   39.2,   -6.6,  246,  -48.0],
    [22.03,   41.8,   -2.5,  246,  -48.0],
    [22.07,   41.5,   -1.7,  246,  -48.0],
    [22.27,   44.7,    3.2,  247,  -24.0],
    [22.47,   46.2,    5.5,  249,  -21.0],
    [22.67,   46.2,    7.6,  252,  -21.0],
    [22.87,   46.3,    9.2,  252,  -21.0],
    [23.07,   46.3,   10.2,  250,  -22.5],
    [23.27,   46.0,   10.6,  248,  -22.5],
    [23.54,   45.4,   10.6,  246,  -22.5],
    [23.80,   44.6,   10.6,  245,  -22.5],
    [24.07,   43.5,   11.0,  243,  -21.0],
    [24.34,   42.9,   11.7,  243,  -19.5],
    [24.60,   42.7,   12.7,  243,  -19.5],
    [25.14,   44.4,   15.0,  243,  -19.5],
    [25.67,   46.1,   17.3,  230,  -21.0],
    [25.94,   46.5,   18.7,  218,  -21.0],
    [26.20,   46.8,   20.9,  202,  -21.0],
    [26.47,   46.6,   24.6,  191,  -21.0],
    [26.74,   46.6,   29.4,  181,  -21.0],
    [26.94,   46.6,   33.1,  173,  -21.0],
  ] },
  // spark-4 — frame 10, 22.10..26.90 s
  { id: 'spark-4', asset: 'spark', frame: 10, zFlip: 22.57, keys: [
    [22.10,    4.2,  106.7,  250,   49.5],
    [22.23,   10.0,  101.9,  250,   49.5],
    [22.27,   10.6,  100.9,  250,   49.5],
    [22.43,   17.9,   94.8,  251,   42.0],
    [22.63,   24.1,   88.3,  253,   42.0],
    [22.83,   26.9,   84.8,  254,   42.0],
    [23.03,   28.5,   83.1,  252,   42.0],
    [23.47,   30.4,   81.1,  241,   42.0],
    [24.54,   35.6,   80.0,  226,   40.5],
    [24.80,   36.3,   79.5,  224,   42.0],
    [25.07,   36.9,   78.8,  220,   42.0],
    [25.60,   38.0,   76.8,  203,   42.0],
    [25.87,   38.8,   75.5,  191,   43.5],
    [26.14,   40.3,   73.8,  178,   43.5],
    [26.40,   42.6,   71.3,  170,   43.5],
    [26.67,   46.5,   67.7,  162,   43.5],
    [26.90,   49.9,   64.7,  155,   43.5],
  ] },
  // spark-5 — frame 10, 22.37..26.87 s
  { id: 'spark-5', asset: 'spark', frame: 10, zFlip: 25.44, keys: [
    [22.37,   25.4,  105.2,  180,  -42.0],
    [22.73,   32.0,   95.7,  180,  -42.0],
    [22.93,   33.4,   93.0,  179,  -40.5],
    [23.13,   34.3,   91.0,  176,  -40.5],
    [23.60,   36.0,   89.0,  163,  -40.5],
    [24.40,   40.0,   88.0,  158,  -40.5],
    [24.94,   41.3,   86.9,  154,  -40.5],
    [25.74,   42.4,   83.3,  130,  -39.0],
    [26.00,   43.1,   81.2,  121,  -37.5],
    [26.27,   44.5,   78.4,  113,  -37.5],
    [26.80,   49.9,   70.3,  101,  -37.5],
    [26.87,   50.6,   69.3,   99,  -37.5],
  ] },
  // chip-1 — frame 11, 25.74..31.63 s
  { id: 'chip-1', asset: 'points-b', frame: 11, zFlip: 30.03, keys: [
    [25.74,   69.0,   -8.2,  312,   46.5],
    [26.14,   65.3,    4.0,  312,   46.5],
    [26.40,   65.6,    6.8,  312,   31.5],
    [26.67,   64.0,    8.9,  311,   31.5],
    [26.94,   62.6,   10.2,  309,   28.5],
    [27.20,   61.8,   10.8,  307,   28.5],
    [27.74,   62.0,   10.4,  305,   28.5],
    [28.54,   64.2,    8.2,  296,   28.5],
    [28.80,   64.6,    8.5,  290,   31.5],
    [29.03,   64.7,    9.4,  284,   31.5],
    [29.23,   64.5,   10.5,  281,   30.0],
    [29.43,   63.9,   11.8,  279,   31.5],
    [29.63,   63.1,   13.4,  277,   30.0],
    [29.83,   62.2,   14.7,  271,   30.0],
    [30.23,   60.0,   17.2,  247,   37.5],
    [30.43,   58.8,   18.6,  235,   37.5],
    [30.63,   57.4,   20.4,  223,   37.5],
    [31.03,   54.2,   25.1,  199,   34.5],
    [31.47,   50.5,   32.0,  184,   34.5],
    [31.63,   49.1,   34.6,  178,   34.5],
  ] },
  // chip-2 — frame 11, 26.30..32.03 s
  { id: 'chip-2', asset: 'points-b', frame: 11, zFlip: 28.34, keys: [
    [26.30,   39.1,  106.0,  204,  -52.5],
    [26.74,   45.6,   96.2,  204,  -52.5],
    [27.00,   48.2,   94.7,  204,  -52.5],
    [27.27,   50.1,   92.0,  202,  -52.5],
    [27.54,   51.2,   89.7,  199,  -51.0],
    [27.80,   51.6,   88.1,  196,  -51.0],
    [28.07,   51.7,   87.3,  194,  -51.0],
    [28.60,   51.4,   86.9,  193,  -51.0],
    [29.07,   50.4,   87.1,  192,  -54.0],
    [29.47,   48.8,   87.0,  188,  -51.0],
    [29.87,   47.4,   86.4,  182,  -51.0],
    [30.27,   46.8,   85.1,  175,  -46.5],
    [30.67,   47.0,   82.8,  164,  -45.0],
    [30.87,   47.3,   81.3,  156,  -45.0],
    [31.07,   47.8,   79.3,  148,  -46.5],
    [31.27,   48.1,   77.2,  138,  -52.5],
    [31.80,   48.8,   69.5,  127,  -57.0],
    [32.03,   49.2,   66.2,  122,  -57.0],
  ] },
  // coin-1 — frame 12, 30.13..34.94 s
  { id: 'coin-1', asset: 'coin-d', frame: 12, zFlip: 30.73, keys: [
    [30.13,   94.5,   -4.0,  128,  -60.0],
    [30.43,   88.9,    5.8,  127,  -60.0],
    [30.63,   86.9,    9.9,  125,  -60.0],
    [30.83,   85.9,   12.3,  122,  -60.0],
    [31.03,   85.3,   14.0,  118,  -60.0],
    [31.47,   84.6,   16.6,  111,  -58.5],
    [31.73,   84.1,   17.8,  109,  -58.5],
    [32.00,   84.2,   18.5,  108,  -57.0],
    [32.27,   84.9,   18.7,  107,  -57.0],
    [32.80,   86.5,   18.0,  106,  -57.0],
    [33.03,   86.6,   17.6,  105,  -57.0],
    [33.23,   86.1,   17.5,  104,  -57.0],
    [33.43,   85.0,   17.7,  102,  -58.5],
    [33.63,   83.1,   18.3,  100,  -58.5],
    [33.83,   80.6,   19.3,   96,  -58.5],
    [34.03,   77.7,   20.6,   91,  -57.0],
    [34.23,   74.2,   22.1,   86,  -58.5],
    [34.43,   70.0,   24.1,   82,  -58.5],
    [34.63,   64.7,   26.3,   79,  -58.5],
    [34.83,   58.1,   29.5,   75,  -64.5],
    [34.94,   54.6,   31.2,   73,  -64.5],
  ] },
  // coin-2 — frame 12, 30.17..35.37 s
  { id: 'coin-2', asset: 'coin-edge', frame: 12, zFlip: 34.07, keys: [
    [30.17,    7.9,   -9.3,  335,   34.5],
    [30.43,    9.6,   -2.2,  335,   34.5],
    [30.47,   12.0,   -1.4,  335,   34.5],
    [30.67,   13.2,    4.0,  335,   36.0],
    [30.87,   16.3,    6.9,  334,   36.0],
    [31.07,   17.7,    8.9,  330,   36.0],
    [31.53,   19.5,   11.3,  320,   36.0],
    [32.87,   22.7,   13.8,  311,   40.5],
    [33.07,   23.6,   14.4,  306,   40.5],
    [33.27,   24.9,   15.1,  299,   40.5],
    [33.67,   28.0,   16.8,  287,   42.0],
    [34.07,   31.8,   18.9,  263,   43.5],
    [34.47,   36.6,   22.5,  220,   43.5],
    [34.67,   39.7,   25.0,  194,   43.5],
    [34.87,   43.8,   28.5,  172,   45.0],
    [35.07,   48.9,   32.6,  159,   45.0],
    [35.27,   50.5,   34.1,  150,   45.0],
    [35.37,   51.3,   34.9,  145,   45.0],
  ] },
  // coin-3 — frame 12, 30.60..35.57 s
  { id: 'coin-3', asset: 'coin-b', frame: 12, zFlip: 33.37, keys: [
    [30.60,   37.2,  104.6,  161,    9.0],
    [30.93,   44.3,   97.6,  164,    9.0],
    [31.13,   46.3,   96.2,  170,   19.5],
    [31.33,   48.0,   95.5,  180,   19.5],
    [31.87,   50.3,   93.5,  192,   21.0],
    [32.40,   51.1,   92.5,  194,   16.5],
    [32.93,   50.9,   91.9,  192,   16.5],
    [33.13,   50.8,   91.3,  189,   16.5],
    [33.33,   50.5,   90.3,  183,   16.5],
    [33.93,   49.3,   86.8,  160,   12.0],
    [34.13,   48.6,   85.4,  153,   10.5],
    [34.53,   47.3,   81.9,  135,    9.0],
    [34.73,   47.0,   79.5,  124,    6.0],
    [34.93,   46.8,   76.3,  113,    6.0],
    [35.13,   47.0,   72.2,  106,    6.0],
    [35.34,   47.3,   69.0,  101,    6.0],
    [35.57,   47.6,   65.4,   95,    6.0],
  ] },
  // planet-1 — frame 13, 34.20..40.64 s
  { id: 'planet-1', asset: 'planet', frame: 13, zFlip: 34.77, keys: [
    [34.20,   -3.0,  -12.5,  475,   51.0],
    [34.33,    2.6,   -3.5,  475,   57.0],
    [34.50,    9.6,    7.7,  475,   54.0],
    [34.90,   25.3,   13.1,  474,   55.5],
    [35.10,   30.7,   14.6,  471,   55.5],
    [35.30,   33.9,   15.4,  465,   55.5],
    [35.57,   36.3,   15.9,  459,   55.5],
    [36.10,   39.5,   16.1,  449,   57.0],
    [36.64,   40.8,   15.5,  444,   57.0],
    [36.90,   40.6,   15.5,  440,   57.0],
    [37.17,   40.4,   15.5,  434,   55.5],
    [37.44,   40.0,   15.7,  428,   55.5],
    [37.97,   38.7,   16.5,  420,   54.0],
    [38.24,   37.9,   17.6,  417,   51.0],
    [38.50,   37.4,   19.2,  414,   51.0],
    [38.77,   37.5,   21.2,  407,   51.0],
    [39.04,   38.1,   23.9,  394,   51.0],
    [39.30,   39.7,   27.0,  373,   51.0],
    [39.57,   41.5,   30.8,  348,   51.0],
    [39.84,   44.0,   35.7,  318,   51.0],
    [40.10,   47.3,   42.4,  297,   51.0],
    [40.37,   49.8,   47.7,  277,   51.0],
    [40.64,   52.3,   53.2,  257,   51.0],
  ] },
  // cross-1 — frame 14, 39.04..46.13 s
  { id: 'cross-1', asset: 'cross', frame: 14, zFlip: 40.24, keys: [
    [39.04,   55.6,   -6.1,  223,   16.5],
    [39.40,   51.6,    4.6,  223,   16.5],
    [39.67,   51.9,    9.1,  221,   16.5],
    [40.20,   52.4,   14.4,  215,   16.5],
    [40.47,   52.3,   16.1,  211,   16.5],
    [40.74,   52.4,   16.7,  208,   16.5],
    [41.27,   53.9,   17.6,  204,   18.0],
    [41.80,   54.8,   17.5,  201,   18.0],
    [42.84,   53.1,   17.2,  197,   15.0],
    [43.00,   52.9,   17.3,  194,   15.0],
    [43.64,   52.5,   18.6,  186,   15.0],
    [43.80,   52.7,   19.3,  184,   15.0],
    [44.13,   52.4,   20.9,  175,   15.0],
    [44.27,   52.1,   21.8,  169,   15.0],
    [44.44,   51.7,   22.6,  163,   16.5],
    [45.07,   50.3,   27.5,  134,   16.5],
    [45.24,   50.0,   29.2,  124,   18.0],
    [45.50,   49.6,   31.8,  115,   18.0],
    [45.76,   49.6,   33.5,  109,   18.0],
    [46.03,   49.6,   34.1,  105,   18.0],
    [46.13,   49.6,   34.3,  104,   18.0],
  ] },
  // cross-2 — frame 14, 39.34..46.53 s
  { id: 'cross-2', asset: 'cross', frame: 14, zFlip: 39.74, keys: [
    [39.34,  -12.1,  104.2,  252,  -79.5],
    [39.47,   -1.0,  101.3,  252,  -72.0],
    [39.74,   21.3,   95.4,  252,  -72.0],
    [40.00,   26.5,   93.6,  251,  -72.0],
    [40.27,   30.5,   91.2,  248,  -72.0],
    [40.54,   32.9,   89.3,  244,  -72.0],
    [40.80,   34.7,   87.6,  240,  -72.0],
    [41.07,   35.5,   86.2,  238,  -73.5],
    [41.34,   35.9,   85.1,  237,  -73.5],
    [41.87,   35.6,   83.9,  235,  -73.5],
    [42.40,   35.4,   83.9,  234,  -70.5],
    [42.87,   35.9,   83.8,  232,  -70.5],
    [43.04,   35.8,   83.6,  229,  -67.5],
    [43.20,   35.5,   83.3,  226,  -67.5],
    [43.67,   34.8,   82.1,  216,  -67.5],
    [43.84,   34.8,   81.5,  212,  -69.0],
    [44.16,   35.2,   80.2,  206,  -69.0],
    [44.33,   35.8,   79.3,  203,  -69.0],
    [44.64,   37.3,   77.9,  191,  -69.0],
    [45.30,   42.0,   74.9,  163,  -69.0],
    [45.83,   46.0,   71.3,  139,  -69.0],
    [46.10,   47.5,   69.8,  131,  -69.0],
    [46.36,   48.1,   69.3,  125,  -70.5],
    [46.53,   48.4,   68.9,  121,  -70.5],
  ] },
  // heart-1 — frame 15, 44.60..50.50 s
  { id: 'heart-1', asset: 'heart', frame: 15, zFlip: 48.5, keys: [
    [44.60,   62.6,   -5.2,  188,  -60.0],
    [44.70,   62.2,   -1.9,  188,  -37.5],
    [44.83,   61.6,    2.6,  188,  -37.5],
    [44.97,   61.5,    3.7,  188,  -37.5],
    [45.14,   62.1,    4.8,  187,  -36.0],
    [45.33,   62.5,    6.4,  184,  -36.0],
    [45.60,   62.7,    8.3,  179,  -36.0],
    [46.13,   63.1,   11.0,  171,  -37.5],
    [46.40,   63.3,   11.9,  169,  -37.5],
    [46.93,   63.3,   12.0,  169,  -37.5],
    [47.97,   59.0,    9.5,  166,  -37.5],
    [48.37,   57.9,    9.0,  156,  -33.0],
    [48.57,   57.9,    9.3,  153,  -33.0],
    [48.97,   58.3,   11.2,  152,  -33.0],
    [49.17,   58.3,   13.0,  152,  -37.5],
    [49.37,   58.0,   14.9,  152,  -37.5],
    [49.57,   57.2,   17.1,  148,  -37.5],
    [49.77,   55.7,   20.5,  140,  -40.5],
    [49.97,   53.6,   24.3,  128,  -40.5],
    [50.17,   51.0,   29.3,  119,  -39.0],
    [50.40,   49.0,   32.9,  112,  -40.5],
    [50.50,   48.1,   34.4,  109,  -40.5],
  ] },
  // report-1 — frame 16, 49.43..54.57 s
  { id: 'report-1', asset: 'report', frame: 16, zFlip: 53.27, keys: [
    [49.43,   91.2,  108.2,  272,  -67.5],
    [49.56,   87.6,  102.9,  272,  -49.5],
    [49.73,   83.0,   96.3,  272,  -49.5],
    [49.93,   81.2,   94.7,  273,  -49.5],
    [50.33,   82.5,   93.3,  273,  -49.5],
    [50.60,   83.8,   93.4,  271,  -49.5],
    [51.13,   83.6,   93.9,  267,  -49.5],
    [51.40,   82.6,   94.0,  266,  -49.5],
    [51.67,   81.7,   94.0,  266,  -49.5],
    [51.93,   81.1,   93.5,  265,  -49.5],
    [52.17,   81.2,   93.1,  265,  -49.5],
    [52.57,   79.8,   90.7,  266,  -43.5],
    [52.77,   80.7,   89.9,  266,  -43.5],
    [52.97,   80.1,   87.5,  264,  -48.0],
    [53.17,   77.4,   84.7,  262,  -48.0],
    [53.37,   73.6,   81.8,  254,  -48.0],
    [53.57,   67.9,   78.1,  237,  -48.0],
    [53.77,   59.3,   72.4,  213,  -48.0],
    [53.97,   53.1,   68.4,  193,  -48.0],
    [54.17,   51.6,   67.4,  182,  -48.0],
    [54.37,   51.4,   67.2,  179,  -49.5],
    [54.57,   51.1,   67.1,  176,  -49.5],
  ] },
  // report-2 — frame 16, 49.26..54.27 s
  { id: 'report-2', asset: 'report', frame: 16, zFlip: 52.67, keys: [
    [49.26,   26.8,   -5.1,  182,   33.0],
    [49.76,   20.0,    1.9,  188,   33.0],
    [50.37,   22.3,    3.4,  232,   33.0],
    [50.63,   23.0,    3.6,  242,   33.0],
    [51.43,   24.3,    3.8,  259,   33.0],
    [51.70,   25.3,    4.2,  267,   33.0],
    [51.97,   26.9,    4.8,  277,   33.0],
    [52.40,   29.7,    6.7,  283,   31.5],
    [52.60,   31.0,    8.2,  277,   31.5],
    [52.80,   32.4,   10.4,  269,   31.5],
    [53.20,   36.3,   15.9,  254,   31.5],
    [53.40,   39.1,   19.6,  237,   31.5],
    [53.60,   42.7,   23.8,  214,   33.0],
    [53.80,   47.2,   29.5,  190,   33.0],
    [54.00,   50.2,   33.2,  176,   33.0],
    [54.20,   51.2,   34.6,  166,   33.0],
    [54.27,   51.6,   35.0,  163,   33.0],
  ] },
  // basketball-1 — frame 17, 52.93..58.24 s
  { id: 'basketball-1', asset: 'basketball', frame: 17, zFlip: 53.27, keys: [
    [52.93,   93.3,   -9.7,  328,   -1.5],
    [53.23,   77.2,    3.4,  328,   -1.5],
    [53.43,   75.1,    5.9,  328,    0.0],
    [53.63,   73.6,    9.4,  328,    3.0],
    [53.83,   72.6,   12.5,  329,    4.5],
    [54.03,   71.9,   14.6,  329,    4.5],
    [54.23,   71.7,   15.6,  330,    4.5],
    [54.43,   71.7,   16.6,  331,    3.0],
    [55.47,   71.6,   16.6,  323,    0.0],
    [55.74,   71.2,   16.7,  319,   -1.5],
    [56.00,   70.6,   17.2,  313,   -1.5],
    [56.27,   69.9,   17.8,  304,   -3.0],
    [56.54,   69.0,   18.7,  294,   -4.5],
    [56.80,   68.2,   19.8,  281,   -4.5],
    [57.07,   66.8,   21.2,  264,   -4.5],
    [57.34,   64.4,   23.0,  243,   -4.5],
    [57.60,   60.7,   26.3,  220,   -4.5],
    [57.87,   55.5,   31.0,  204,   -3.0],
    [58.14,   53.4,   33.8,  189,   -4.5],
    [58.24,   52.6,   34.9,  183,   -4.5],
  ] },
  // tennis-1 — frame 17, 53.63..58.64 s
  { id: 'tennis-1', asset: 'tennis', frame: 17, zFlip: 56.54, keys: [
    [53.63,    1.3,  105.2,  198,    1.5],
    [54.00,   12.9,   98.1,  198,    1.5],
    [54.20,   14.2,   95.2,  198,    1.5],
    [54.40,   16.8,   94.8,  198,    1.5],
    [54.64,   18.0,   93.4,  198,    1.5],
    [54.90,   18.9,   92.4,  196,    1.5],
    [55.97,   21.9,   90.2,  187,    0.0],
    [56.24,   22.9,   89.2,  186,    0.0],
    [56.50,   24.0,   87.9,  184,    0.0],
    [56.77,   26.3,   86.2,  176,   -1.5],
    [57.04,   29.3,   84.2,  163,   -4.5],
    [57.30,   32.2,   81.2,  141,   -6.0],
    [57.57,   37.5,   77.1,  120,   -6.0],
    [57.84,   45.5,   71.0,  102,   -7.5],
    [58.10,   49.4,   68.0,   93,   -6.0],
    [58.37,   49.6,   67.6,   86,   -7.5],
    [58.64,   49.9,   67.2,   79,   -7.5],
  ] },
  // soccer-1 — frame 18, 57.07..62.17 s
  { id: 'soccer-1', asset: 'soccer', frame: 18, zFlip: 61.03, keys: [
    [57.07,   18.8,   -0.4,  245,   93.0],
    [57.17,   20.1,    1.0,  245,   93.0],
    [57.44,   23.5,    4.7,  260,   97.5],
    [57.70,   24.1,    6.3,  262,   96.0],
    [57.97,   25.2,    8.7,  265,   97.5],
    [58.24,   27.0,   11.8,  261,   97.5],
    [58.50,   27.9,   13.5,  259,   96.0],
    [58.77,   28.3,   14.3,  255,   96.0],
    [59.04,   28.4,   14.2,  248,   96.0],
    [59.84,   28.5,   12.7,  239,   97.5],
    [60.24,   30.1,   13.5,  239,   97.5],
    [60.44,   31.4,   14.6,  239,   97.5],
    [60.64,   33.0,   15.8,  237,   94.5],
    [60.84,   34.7,   17.5,  234,   93.0],
    [61.04,   36.5,   19.2,  226,   91.5],
    [61.24,   39.1,   21.4,  213,   91.5],
    [61.44,   42.3,   24.2,  195,   91.5],
    [61.84,   49.6,   32.2,  165,   91.5],
    [62.04,   51.0,   34.3,  156,   91.5],
    [62.17,   52.0,   35.8,  150,   91.5],
  ] },
  // cross-3 — frame 18, 57.47..62.60 s
  { id: 'cross-3', asset: 'cross', frame: 18, zFlip: 57.94, keys: [
    [57.47,   81.8,  105.9,  227,  -73.5],
    [57.84,   81.7,   96.2,  227,  -73.5],
    [58.10,   80.6,   94.3,  230,  -75.0],
    [58.64,   81.3,   90.2,  240,  -75.0],
    [58.90,   81.9,   89.5,  243,  -73.5],
    [59.17,   82.6,   89.5,  245,  -75.0],
    [59.70,   84.3,   91.3,  246,  -75.0],
    [59.94,   84.8,   91.8,  244,  -76.5],
    [60.14,   84.7,   92.0,  242,  -76.5],
    [60.34,   84.1,   91.8,  236,  -76.5],
    [60.74,   80.7,   89.6,  212,  -75.0],
    [60.94,   77.8,   87.7,  201,  -75.0],
    [61.14,   74.0,   84.6,  191,  -75.0],
    [61.34,   69.8,   81.5,  177,  -75.0],
    [61.54,   64.2,   77.6,  159,  -75.0],
    [61.74,   57.0,   72.3,  139,  -75.0],
    [61.94,   52.1,   68.7,  125,  -75.0],
    [62.14,   50.9,   67.9,  117,  -75.0],
    [62.37,   50.8,   67.8,  115,  -75.0],
    [62.60,   50.6,   67.8,  113,  -75.0],
  ] },
  // planet-cow-1 — frame 19, 61.20..68.54 s
  { id: 'planet-cow-1', asset: 'planet-cow', frame: 19, zFlip: 64.67, keys: [
    [61.20,   50.2,  -11.2,  425,  -13.5],
    [61.67,   61.9,    2.9,  425,  -13.5],
    [62.00,   61.7,    4.2,  425,  -10.5],
    [62.20,   62.8,    4.7,  422,  -10.5],
    [62.43,   63.8,    5.1,  414,  -10.5],
    [62.70,   64.3,    5.4,  402,  -15.0],
    [62.97,   64.2,    5.9,  390,  -15.0],
    [63.23,   63.4,    6.5,  379,  -18.0],
    [63.50,   62.3,    7.3,  372,  -18.0],
    [63.77,   61.2,    7.8,  367,  -18.0],
    [64.03,   59.8,    7.8,  365,  -18.0],
    [64.30,   59.2,    7.9,  365,  -18.0],
    [64.57,   59.0,    7.9,  365,  -18.0],
    [65.10,   59.9,    8.7,  368,  -18.0],
    [65.63,   60.7,   10.1,  382,  -16.5],
    [66.30,   60.4,   11.9,  384,  -13.5],
    [66.70,   60.9,   13.1,  372,  -13.5],
    [66.90,   60.8,   13.9,  365,  -13.5],
    [67.10,   60.5,   14.8,  356,  -13.5],
    [67.30,   60.0,   16.1,  341,  -13.5],
    [67.50,   58.9,   17.8,  321,  -13.5],
    [67.70,   57.6,   20.2,  300,  -13.5],
    [67.90,   55.7,   23.6,  279,  -13.5],
    [68.30,   51.0,   32.2,  252,  -13.5],
    [68.54,   48.2,   37.3,  236,  -13.5],
  ] },
  // milkpack-1 — frame 20, 67.07..74.20 s
  { id: 'milkpack-1', asset: 'milkpack', frame: 20, zFlip: 67.87, keys: [
    [67.07,   16.4,  -11.1,  413,  -42.0],
    [67.40,   21.6,    4.1,  413,  -42.0],
    [67.60,   22.0,    5.4,  418,  -42.0],
    [68.00,   24.4,    6.8,  443,  -52.5],
    [68.20,   24.8,    7.3,  452,  -49.5],
    [68.70,   25.9,    9.0,  452,  -46.5],
    [69.24,   26.6,   10.3,  450,  -46.5],
    [70.04,   25.4,    9.4,  463,  -45.0],
    [70.30,   25.5,    9.5,  469,  -45.0],
    [71.10,   25.5,   10.2,  468,  -42.0],
    [71.37,   25.4,   10.2,  456,  -40.5],
    [71.90,   26.3,   10.4,  420,  -37.5],
    [72.44,   28.3,   11.6,  401,  -37.5],
    [72.70,   30.3,   13.9,  391,  -42.0],
    [73.24,   34.4,   19.4,  344,  -43.5],
    [73.50,   37.9,   23.4,  310,  -43.5],
    [74.04,   48.4,   32.9,  264,  -45.0],
    [74.20,   51.6,   35.8,  250,  -45.0],
  ] },
  // milkpack-2 — frame 20, 67.37..74.57 s
  { id: 'milkpack-2', asset: 'milkpack', frame: 20, zFlip: 69.94, keys: [
    [67.37,  103.3,  109.3,  346,   33.0],
    [67.73,   86.7,   95.7,  350,   33.0],
    [67.93,   84.8,   94.0,  363,   33.0],
    [68.13,   84.3,   92.9,  386,   33.0],
    [68.34,   83.9,   91.9,  411,   25.5],
    [68.60,   83.4,   91.0,  429,   24.0],
    [68.87,   83.0,   90.6,  436,   24.0],
    [69.14,   82.6,   90.4,  435,   24.0],
    [69.40,   82.2,   90.4,  430,   24.0],
    [69.67,   81.7,   90.6,  424,   27.0],
    [69.94,   81.7,   91.0,  418,   28.5],
    [70.20,   81.8,   91.1,  412,   28.5],
    [71.00,   83.5,   90.2,  398,   28.5],
    [71.27,   83.7,   89.7,  394,   27.0],
    [71.80,   83.6,   90.0,  388,   27.0],
    [72.07,   82.9,   90.1,  383,   27.0],
    [72.60,   80.3,   89.2,  373,   27.0],
    [72.87,   77.8,   87.8,  363,   27.0],
    [73.14,   75.4,   85.5,  347,   30.0],
    [73.40,   71.2,   83.0,  323,   33.0],
    [73.67,   67.4,   80.6,  297,   34.5],
    [73.94,   62.7,   77.0,  269,   36.0],
    [74.20,   55.7,   71.7,  251,   36.0],
    [74.47,   50.8,   68.2,  232,   36.0],
    [74.57,   49.0,   66.9,  225,   36.0],
  ] },
  // milkpack-3 — frame 21, 73.04..79.57 s
  { id: 'milkpack-3', asset: 'milkpack', frame: 21, zFlip: 75.64, keys: [
    [73.04,   38.4,  112.2,  432,  -48.0],
    [73.57,   45.2,   95.8,  432,  -48.0],
    [73.84,   49.6,   94.0,  433,  -48.0],
    [74.10,   50.4,   92.4,  433,  -48.0],
    [74.37,   49.5,   91.3,  433,  -48.0],
    [74.64,   49.1,   90.6,  432,  -48.0],
    [74.90,   49.5,   90.3,  432,  -48.0],
    [75.17,   49.7,   89.1,  431,  -48.0],
    [75.44,   51.4,   89.4,  430,  -48.0],
    [75.70,   52.6,   89.0,  429,  -48.0],
    [75.97,   53.4,   88.5,  427,  -45.0],
    [76.24,   53.9,   88.5,  424,  -45.0],
    [76.50,   53.6,   88.2,  420,  -45.0],
    [76.77,   52.9,   87.9,  414,  -39.0],
    [77.04,   52.3,   88.0,  410,  -43.5],
    [77.30,   51.7,   87.9,  407,  -43.5],
    [77.57,   51.6,   87.5,  407,  -45.0],
    [77.84,   52.3,   87.3,  407,  -45.0],
    [78.37,   53.3,   84.9,  387,  -46.5],
    [78.64,   54.8,   82.8,  367,  -48.0],
    [78.90,   54.5,   79.2,  340,  -48.0],
    [79.17,   52.7,   73.3,  320,  -46.5],
    [79.44,   51.4,   69.5,  298,  -48.0],
    [79.57,   50.7,   67.5,  287,  -48.0],
  ] },
  // gift-1 — frame 22, 78.40..84.24 s
  { id: 'gift-1', asset: 'gift', frame: 22, zFlip: 79.14, keys: [
    [78.40,   59.0,   -9.5,  342,  -54.0],
    [78.54,   59.7,   -4.8,  342,  -36.0],
    [78.80,   61.1,    4.7,  342,  -46.5],
    [79.07,   62.9,    6.3,  342,  -46.5],
    [79.34,   65.0,    7.2,  341,  -46.5],
    [79.60,   66.7,    8.1,  340,  -52.5],
    [79.87,   67.7,    8.8,  339,  -52.5],
    [80.14,   67.6,    9.3,  337,  -52.5],
    [80.67,   65.7,   10.1,  334,  -54.0],
    [81.47,   61.3,    9.7,  335,  -58.5],
    [82.00,   59.2,    8.6,  329,  -58.5],
    [82.27,   58.8,    8.3,  321,  -58.5],
    [82.54,   58.6,    9.1,  314,  -57.0],
    [82.80,   58.7,   10.9,  306,  -54.0],
    [83.07,   58.9,   12.9,  296,  -54.0],
    [83.60,   59.3,   19.0,  263,  -54.0],
    [83.87,   57.8,   23.0,  250,  -54.0],
    [84.14,   54.9,   28.1,  236,  -55.5],
    [84.24,   53.8,   30.1,  231,  -55.5],
  ] },
]

/**
 * `base` is the flight's largest size: _fly.scss lays the box out once at that
 * many design px and flyingObject.js scales down from it, so a size change
 * costs a transform and never a layout. `t0`/`t1` are the flight's window, used
 * by buildFlyLayer for the visibility switch.
 */
export const FLY_OBJECTS = RAW.map(r => ({
  ...r,
  base: Math.max(...r.keys.map(k => k[3])),
  t0: r.keys[0][0],
  t1: r.keys[r.keys.length - 1][0],
}))

/**
 * Objects per storyboard frame, as the flights actually measured. Kept as the
 * cross-check on the Figma layer list, which disagrees in five places — where
 * they differ the CLIP wins, because it is what ships:
 *   - frames 4-5 ("Ithems fly") carry nothing visible at all (see above);
 *   - frame 10 has FIVE sparkles, not the two the layer list names;
 *   - frame 12's three coins are three different poses of one cluster export;
 *   - the milk cartons of frame 20 keep flying through frame 21, which the
 *     layer list gives to `Gift icon`;
 *   - frame 22 is one gift box, not two tickets.
 */
export const OBJECTS_BY_FRAME = FLY_OBJECTS.reduce((acc, r) => {
  ;(acc[r.frame] ||= []).push(r.asset)
  return acc
}, {})
