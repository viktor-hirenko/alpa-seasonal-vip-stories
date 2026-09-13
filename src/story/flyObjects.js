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
  'basketball',
  'calendar',
  'coin-b',
  'coin-face',
  'cross',
  'gift',
  'heart',
  'planet-cow',
  'points-b',
  'report',
  'spark',
  'tennis',
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

/**
 * THE MAGENTA HALO, PER OBJECT, IN DESIGN PIXELS (V-98).
 *
 * Every icon in 21770:4582 carries its own shadow and they are NOT all the
 * same, which is what this file used to assume: one value, taken from the cash
 * icon 21770:4779, was applied to all seventeen sprites.
 *
 * ⚠️ THE NUMBERS ARE ABSOLUTE, NOT FRACTIONS OF THE SPRITE, AND THE FIRST
 * ATTEMPT GOT THAT WRONG. The storyboard's frame is 1080 x 1920 — the same
 * design space our stage is laid out in — so the mock's 22.3 px of blur is
 * 22.3 design px here too. Writing it as a fraction of the sprite's own box
 * shrank it: a star at `base` 250 got 9 px where the mock draws 22.3, which on
 * screen is a hairline rim instead of a halo, and the owner hid the backdrop
 * video to show that the objects had no glow at all. The old argument for
 * fractions — "a fixed halo puts a planet's glow on a coin" — is simply not
 * what the designer did: the same 22.3 px sits on a 291 px tennis ball and on a
 * 653 px planet.
 *
 *   node                        box     shadow (offset-y / blur / alpha)
 *   Pen              4737       490     0   8px  22.3px  .27
 *   Days calendar    4747       481     0   0     22.3px .27
 *   Points (10)      4758       589     0   3px  22.3px  .27
 *   Points (11)      4767       531     0  15px  22.3px  .27
 *   cash             4779       389     0  15px  22.3px  .27
 *   Planet           4790       653     0   3px  22.2px  .27
 *   X icon           4802       423     0  15px  22.3px  .27
 *   Heart            4812       360     0  15px  22.3px  .27
 *   Report           4822       561     0  15px  22.3px  .27
 *   Basketball       4833       447     0   6px  22.3px  .27
 *   Tennis           4834       291     0  15px  22.3px  .27
 *   Soccer           4844       368     0  15px  22.3px  .27
 *   Milkpack   4922/4924  614/600      0  21px  81.2px  .56
 *   Gift        21945:2949      497     0  21px  81.2px  .56
 *   Planet cow       4934       523     no outer shadow at all
 *
 * ⚠️ THE MILK PACKS AND THE GIFT ARE A CLASS OF THEIR OWN: 81.2 px at alpha
 * .56 against 22.3 px at .27 everywhere else — nearly four times the spread and
 * twice the strength.
 *
 * ⚠️ AND THE PLANET COW HAS NONE. The node carries only the inner shadow, so
 * giving it the default would be inventing.
 *
 * The INNER shadow every icon also carries —
 * `inset 15px 15px 17.2px rgba(255,0,212,0.13)`, and `15px 4px 17.1px` on the
 * tennis ball — is not here: `drop-shadow` has no inset and an inner glow that
 * follows a sprite's alpha needs the masked construction in _pages.scss
 * (`inner-glow`). Measured and written down so it can be added without going
 * back to Figma.
 *
 * @type {Record<string, [offsetY: number, blur: number, alpha: number]>} design px
 */
export const FLY_GLOW = {
  pen: [8, 22.3, 0.27],
  calendar: [0, 22.3, 0.27],
  spark: [3, 22.3, 0.27],
  'points-b': [15, 22.3, 0.27],
  'coin-d': [15, 22.3, 0.27],
  'coin-edge': [15, 22.3, 0.27],
  'coin-b': [15, 22.3, 0.27],
  planet: [3, 22.2, 0.27],
  cross: [15, 22.3, 0.27],
  heart: [15, 22.3, 0.27],
  report: [15, 22.3, 0.27],
  basketball: [6, 22.3, 0.27],
  tennis: [15, 22.3, 0.27],
  soccer: [15, 22.3, 0.27],
  milkpack: [21, 81.2, 0.56],
  gift: [21, 81.2, 0.56],
  'planet-cow': [0, 0, 0],
}

export const FLY_Z = -600
export const FLY_Z_FRONT = 600

/**
 * WHICH SIDE OF THE JOURNAL EACH OBJECT IS ON — FROM THE STORYBOARD, ONE VALUE
 * FOR THE WHOLE FLIGHT (V-96).
 *
 * ⚠️ THIS REPLACES THE `zFlip` STEP AS A DEPTH SOURCE, AND `fly:measure` MUST
 * NOT OVERWRITE IT. `zFlip` stays in the table because the gate still reports
 * against it and because it is an honest reading of the clip; it is simply no
 * longer what decides depth.
 *
 * WHY. The clip lets an object drift down and the page swallow it mid-slide, so
 * the model was "in front, then behind at the measured crossing". On screen
 * that crossing is a POP: walk `planet-1` frame by frame and at 34.60 the
 * object is painted over the page, at 34.80 the page is painted over it, while
 * the page does not turn until 39.07 — the object is already overlapping the
 * journal when it changes sides, so a chunk of it vanishes between two frames.
 * The owner called it out twice: "it shows the object above the journal, then
 * it suddenly ends up under the journal, and the page has not even turned".
 *
 * THE STORYBOARD (21770:4582) ANSWERS IT DIRECTLY. Its layer called
 * `Component 17` is the journal, so whatever is printed after it is drawn above
 * it and whatever is printed before it is drawn below. That is one decision per
 * object for the whole slide, which is exactly what removes the pop.
 *
 * Three slides carry one of each, and those were matched by position: the
 * storyboard's icon centres against our own path at the middle of the slide.
 * Slide 10's above-icon sits at 42 % / 18 % and its below-icon at 72 % / 83 %,
 * which put `spark-1..3` above and `spark-4..5` below — the latter pair was
 * then lifted to `front` on the owner's call, see the table; slide 14 puts `cross-2`
 * above and `cross-1` below; slide 20 puts `milkpack-2` above and `milkpack-1`
 * below. The nearest-match distances are 4-38 % of the frame, never ambiguous.
 *
 * Everything still goes behind the journal the moment its page is turned — see
 * flyLayer.js. Being `front` here means "in front for as long as its own slide
 * is up", not "in front for ever".
 */
export const FLY_LAYER = {
  'pen-1': 'front', // slide 8
  'calendar-1': 'front', // slide 9
  // ⚠️ THE TWO LOWER STARS OVERRIDE THE STORYBOARD, ON THE OWNER'S CALL
  // (12.09: "make the stars at the bottom of this slide behave like the ones at
  // the top — floating over the journal and hidden the same way"). The
  // storyboard draws slide 10's lower `Points icon` below the journal; he wants
  // all five stars on one side. Do not "correct" this back to the mock.
  'spark-1': 'front',
  'spark-2': 'front',
  'spark-3': 'front', // slide 10
  'spark-4': 'front',
  'spark-5': 'front',
  'chip-1': 'behind',
  'chip-2': 'behind', // slide 11
  'coin-1': 'front',
  'coin-2': 'front',
  'coin-3': 'front', // slide 12
  'planet-1': 'behind', // slide 13
  'cross-1': 'behind',
  'cross-2': 'front', // slide 14
  'heart-1': 'front', // slide 15
  'report-1': 'behind',
  'report-2': 'behind', // slide 16
  'basketball-1': 'front',
  'tennis-1': 'front', // slide 17
  'soccer-1': 'front',
  'cross-3': 'front', // slide 18
  'planet-cow-1': 'front', // slide 19
  'milkpack-1': 'behind',
  'milkpack-2': 'front', // slide 20
  'milkpack-3': 'front', // slide 21
  'gift-1': 'front', // slide 22
}

/** @type {Omit<FlyRecord,'base'|'t0'|'t1'>[]} */
// The rows are a measurement, not hand-authored numbers.
// ⚠️ AND THEY CANNOT BE RE-MEASURED. They were taken by correlating the sprite
// against `preview minus clean bg`, which isolated the objects while the clean
// clip still had them baked in. The final background delivered on 2026-09-12
// carries none, so that difference is no longer the objects and the method has
// no oracle left — permanently, because the shipping clip will never carry them
// again (owner, 09-13). `scripts/fly-measure.mjs` and `fly-fit.mjs` were
// retired the same day; they are in git history if the provenance is ever
// needed. `npm run fly:check` still works: it compares us with the frozen
// `scripts/fly-reference.json`, not with the clip. Nudge a row only against a
// picture, and say so in the registry.
// prettier-ignore
const RAW = [
  // pen-1 — frame 8, 10.80..18.17 s
  // THE PEN NEVER GOES BEHIND THE JOURNAL — an OWNER DECISION (2026-09-10:
  // "на втором слайде ручка должна левитировать над журналом"), not a
  // measurement, and the one row in this table that is not one.
  //
  // The clip crosses it at 12.04, which is what `zFlip` held and what
  // fly-measure prints. The MOCK draws it the other way: on Editor's Note
  // (21770:2821) the pen is painted OVER the page, nib and all, hovering above
  // the spread. Playing the clip's version reads as the pen standing on the top
  // edge of the page and then being swallowed by it, which is what the owner
  // objected to. 18.17 is the flight's own last key, so the step never fires.
  //
  // CONSEQUENCE, ON PURPOSE: `fly:check` compares the covered fraction against
  // the clip and will now disagree on pen-1. That is the trade the decision
  // buys; do not "fix" it by putting 12.04 back. Re-running `fly:measure`
  // WILL overwrite this — restore it by hand afterwards.
  { id: 'pen-1', asset: 'pen', frame: 8, zFlip: 18.17, keys: [
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
    [ 17.13,   64.8,  114.1,  520,   46.5],
    [ 17.63,   57.1,   99.4,  513,   46.7],
    [ 17.83,   56.9,   95.5,  489,   45.7],
    [ 18.03,   56.7,   92.8,  456,   46.4],
    [ 18.23,   57.2,   90.9,  430,   32.2],
    [ 18.47,   57.2,   89.8,  408,   48.4],
    [ 18.73,   56.7,   89.3,  399,   31.3],
    [ 19.00,   56.2,   89.3,  392,   31.8],
    [ 19.27,   55.5,   89.3,  390,   38.1],
    [ 19.53,   55.0,   89.2,  391,   49.9],
    [ 20.33,   56.3,   89.7,  394,   46.7],
    [ 20.87,   57.1,   88.2,  373,   46.3],
    [ 21.07,   57.1,   87.2,  366,   46.3],
    [ 21.27,   56.7,   86.1,  364,   46.3],
    [ 21.67,   55.0,   83.8,  366,   46.3],
    [ 21.87,   53.7,   82.5,  364,   46.3],
    [ 22.07,   52.5,   80.8,  356,   46.3],
    [ 22.47,   51.0,   76.5,  313,   46.3],
    [ 22.87,   50.5,   70.5,  257,   46.3],
    [ 23.07,   50.6,   68.9,  238,   46.3],
    [ 23.54,   51.5,   68.1,  226,   46.3],
    [ 23.67,   51.7,   67.8,  223,   46.3],
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
    [ 25.74,   71.5,  -12.3,  389,   38.5],
    [ 26.14,   66.5,    1.7,  364,   39.2],
    [ 26.40,   65.3,    6.3,  337,   20.7],
    [ 26.67,   63.4,    9.0,  321,   16.1],
    [ 26.94,   62.1,   10.2,  311,   15.6],
    [ 27.20,   61.1,   10.9,  307,   26.5],
    [ 27.74,   61.4,   10.5,  304,   27.5],
    [ 28.54,   63.5,    8.4,  303,   33.2],
    [ 28.80,   64.0,    8.7,  298,   36.8],
    [ 29.03,   64.0,    9.4,  291,   37.1],
    [ 29.23,   63.9,   10.5,  285,   36.0],
    [ 29.43,   63.5,   11.7,  278,   37.3],
    [ 29.63,   62.9,   13.1,  272,   35.2],
    [ 29.83,   62.2,   14.3,  265,   34.7],
    [ 30.23,   60.2,   16.8,  244,   41.5],
    [ 30.43,   59.0,   18.2,  234,   41.3],
    [ 30.63,   57.6,   20.0,  222,   41.3],
    [ 31.03,   54.4,   24.7,  198,   38.3],
    [ 31.47,   50.7,   31.6,  183,   38.3],
    [ 31.63,   49.3,   34.2,  177,   38.3],
  ] },
  // chip-2 — frame 11, 26.30..32.03 s
  { id: 'chip-2', asset: 'points-b', frame: 11, zFlip: 28.34, keys: [
    [ 26.30,   40.4,  106.3,  237,  -48.8],
    [ 26.74,   46.8,   96.2,  234,  -49.6],
    [ 27.00,   49.3,   94.2,  228,  -50.8],
    [ 27.27,   50.8,   91.3,  218,  -52.1],
    [ 27.54,   51.6,   89.2,  208,  -51.4],
    [ 27.80,   51.8,   87.8,  201,  -52.5],
    [ 28.07,   51.8,   87.0,  197,  -53.6],
    [ 28.60,   51.6,   86.6,  193,  -52.6],
    [ 29.07,   50.7,   86.9,  192,  -54.5],
    [ 29.47,   49.1,   86.8,  188,  -51.5],
    [ 29.87,   47.7,   86.2,  182,  -51.5],
    [ 30.27,   47.1,   84.9,  175,  -47.0],
    [ 30.67,   47.3,   82.6,  164,  -45.5],
    [ 30.87,   47.6,   81.1,  156,  -45.5],
    [ 31.07,   48.1,   79.1,  148,  -47.0],
    [ 31.27,   48.4,   77.0,  138,  -53.0],
    [ 31.80,   49.1,   69.3,  127,  -57.5],
    [ 32.03,   49.5,   66.0,  122,  -57.5],
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
    [ 30.60,   39.8,  107.1,  206,   11.6],
    [ 30.93,   46.1,   99.6,  193,   10.0],
    [ 31.13,   47.5,   97.2,  183,   19.0],
    [ 31.33,   48.8,   95.5,  178,   18.3],
    [ 31.87,   50.8,   92.9,  172,   17.5],
    [ 32.40,   51.6,   91.9,  172,   10.3],
    [ 32.93,   51.3,   91.4,  170,    8.2],
    [ 33.13,   51.2,   90.7,  169,    7.5],
    [ 33.33,   50.8,   89.8,  165,    7.3],
    [ 33.93,   49.6,   86.7,  150,    2.2],
    [ 34.13,   48.9,   85.4,  144,    0.5],
    [ 34.53,   47.6,   81.9,  127,   -0.9],
    [ 34.73,   47.3,   79.5,  117,   -4.0],
    [ 34.93,   47.1,   76.3,  106,   -4.0],
    [ 35.13,   47.3,   72.2,  100,   -4.0],
    [ 35.34,   47.6,   69.0,   96,   -4.0],
    [ 35.57,   47.9,   65.4,   90,   -4.0],
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
    [ 44.60,   64.5,   -5.2,  207,  -67.8],
    [ 44.70,   64.1,   -1.9,  207,  -45.3],
    [ 44.83,   63.5,    2.6,  207,  -45.3],
    [ 44.97,   63.4,    3.7,  207,  -45.3],
    [ 45.14,   64.0,    4.7,  206,  -43.8],
    [ 45.33,   64.5,    6.6,  199,  -42.6],
    [ 45.60,   64.8,    8.8,  190,  -40.9],
    [ 46.13,   65.2,   11.1,  182,  -43.0],
    [ 46.40,   65.4,   12.0,  179,  -44.6],
    [ 46.93,   65.3,   12.1,  177,  -44.3],
    [ 47.97,   60.5,    9.8,  182,  -41.8],
    [ 48.37,   59.6,    9.4,  180,  -32.9],
    [ 48.57,   59.6,    9.6,  176,  -32.7],
    [ 48.97,   59.7,   11.4,  173,  -32.1],
    [ 49.17,   59.5,   13.1,  172,  -36.5],
    [ 49.37,   59.1,   14.9,  171,  -36.5],
    [ 49.57,   58.3,   17.1,  166,  -36.5],
    [ 49.77,   56.8,   20.5,  157,  -39.5],
    [ 49.97,   54.7,   24.3,  144,  -39.5],
    [ 50.17,   52.1,   29.3,  134,  -38.0],
    [ 50.40,   50.1,   32.9,  125,  -39.5],
    [ 50.50,   49.2,   34.4,  122,  -39.5],
  ] },
  // report-1 — frame 16, 49.43..54.57 s
  { id: 'report-1', asset: 'report', frame: 16, zFlip: 53.27, keys: [
    [ 49.43,   97.9,  113.2,  456,  -76.3],
    [ 49.56,   94.3,  107.9,  456,  -58.3],
    [ 49.73,   89.7,  101.3,  456,  -58.3],
    [ 49.93,   87.9,   99.7,  459,  -58.3],
    [ 50.33,   89.7,   95.7,  418,  -57.8],
    [ 50.60,   91.0,   95.8,  415,  -57.8],
    [ 51.13,   89.8,   96.6,  392,  -55.0],
    [ 51.40,   88.8,   96.7,  391,  -55.0],
    [ 51.67,   87.7,   96.7,  387,  -53.4],
    [ 51.93,   87.1,   96.2,  386,  -53.3],
    [ 52.17,   86.9,   95.3,  379,  -51.2],
    [ 52.57,   84.2,   92.0,  362,  -43.9],
    [ 52.77,   83.6,   90.6,  349,  -43.1],
    [ 52.97,   81.7,   88.0,  332,  -47.3],
    [ 53.17,   78.5,   85.2,  319,  -47.1],
    [ 53.37,   74.5,   82.4,  304,  -47.1],
    [ 53.57,   68.7,   78.7,  281,  -47.0],
    [ 53.77,   60.1,   73.0,  253,  -47.0],
    [ 53.97,   53.9,   69.0,  228,  -47.0],
    [ 54.17,   52.4,   68.0,  215,  -47.0],
    [ 54.37,   52.2,   67.8,  212,  -48.5],
    [ 54.57,   51.9,   67.7,  208,  -48.5],
  ] },
  // report-2 — frame 16, 49.26..54.27 s
  { id: 'report-2', asset: 'report', frame: 16, zFlip: 52.67, keys: [
    [ 49.26,   26.8,  -12.4,  383,   46.5],
    [ 49.76,   22.2,   -3.0,  278,   48.1],
    [ 50.37,   25.2,   -0.3,  347,   45.0],
    [ 50.63,   25.1,    0.5,  320,   43.0],
    [ 51.43,   26.4,    0.7,  327,   35.7],
    [ 51.70,   26.9,    1.7,  325,   33.9],
    [ 51.97,   27.7,    3.4,  322,   32.0],
    [ 52.40,   29.6,    7.0,  310,   29.0],
    [ 52.60,   30.9,    9.0,  299,   29.4],
    [ 52.80,   32.1,   10.8,  288,   29.3],
    [ 53.20,   36.4,   15.5,  255,   30.1],
    [ 53.40,   39.2,   19.1,  237,   30.1],
    [ 53.60,   42.8,   23.3,  214,   31.6],
    [ 53.80,   47.3,   29.0,  190,   31.6],
    [ 54.00,   50.3,   32.7,  176,   31.6],
    [ 54.20,   51.3,   34.1,  167,   31.6],
    [ 54.27,   51.7,   34.5,  164,   31.6],
  ] },
  // basketball-1 — frame 17, 52.93..58.24 s
  { id: 'basketball-1', asset: 'basketball', frame: 17, zFlip: 53.27, keys: [
    [ 52.93,   94.2,   -9.8,  328,   12.6],
    [ 53.23,   78.1,    3.3,  328,   12.6],
    [ 53.43,   76.0,    5.8,  328,   14.1],
    [ 53.63,   74.5,    9.2,  327,   17.3],
    [ 53.83,   73.5,   12.2,  327,   18.9],
    [ 54.03,   72.8,   14.2,  326,   19.3],
    [ 54.23,   72.5,   15.1,  326,   19.6],
    [ 54.43,   72.1,   16.0,  318,   16.6],
    [ 55.47,   72.6,   16.1,  314,    6.8],
    [ 55.74,   72.1,   16.2,  312,    3.6],
    [ 56.00,   71.4,   16.7,  309,    2.1],
    [ 56.27,   70.7,   17.3,  305,   -1.3],
    [ 56.54,   69.6,   18.3,  297,   -4.5],
    [ 56.80,   68.5,   19.5,  283,   -5.4],
    [ 57.07,   66.8,   21.3,  266,   -7.2],
    [ 57.34,   64.3,   23.1,  245,   -7.5],
    [ 57.60,   60.6,   26.4,  222,   -7.5],
    [ 57.87,   55.4,   31.1,  207,   -6.0],
    [ 58.14,   53.3,   33.9,  191,   -7.5],
    [ 58.24,   52.5,   35.0,  185,   -7.5],
  ] },
  // tennis-1 — frame 17, 53.63..58.64 s
  { id: 'tennis-1', asset: 'tennis', frame: 17, zFlip: 56.54, keys: [
    [ 53.63,   -0.2,  106.7,  231,    5.3],
    [ 54.00,   12.2,   99.3,  221,    5.1],
    [ 54.20,   14.1,   95.9,  212,    5.0],
    [ 54.40,   16.7,   94.9,  205,    4.8],
    [ 54.64,   17.6,   93.1,  200,    4.2],
    [ 54.90,   18.6,   92.2,  194,    3.5],
    [ 55.97,   21.7,   90.0,  186,    0.5],
    [ 56.24,   22.8,   89.1,  186,    0.2],
    [ 56.50,   23.9,   87.8,  184,    0.0],
    [ 56.77,   26.2,   86.1,  176,   -1.5],
    [ 57.04,   29.2,   84.1,  163,   -4.5],
    [ 57.30,   32.1,   81.1,  141,   -6.0],
    [ 57.57,   37.4,   77.0,  120,   -6.0],
    [ 57.84,   45.4,   70.9,  102,   -7.5],
    [ 58.10,   49.3,   67.9,   93,   -6.0],
    [ 58.37,   49.5,   67.5,   86,   -7.5],
    [ 58.64,   49.8,   67.1,   79,   -7.5],
  ] },
  // soccer-1 — frame 18, 57.07..62.17 s
  { id: 'soccer-1', asset: 'soccer', frame: 18, zFlip: 61.03, keys: [
    [ 57.07,   12.9,   -7.1,  368,   90.0],
    [ 57.17,   14.5,   -5.2,  359,   89.4],
    [ 57.44,   19.4,    1.1,  346,   92.4],
    [ 57.70,   22.0,    5.5,  316,   91.1],
    [ 57.97,   24.1,    9.0,  302,   92.6],
    [ 58.24,   25.8,   11.7,  288,   93.2],
    [ 58.50,   26.7,   13.1,  281,   92.8],
    [ 58.77,   27.2,   13.9,  276,   93.3],
    [ 59.04,   27.4,   13.7,  271,   93.2],
    [ 59.84,   27.4,   12.4,  263,   93.0],
    [ 60.24,   29.2,   13.2,  256,   92.9],
    [ 60.44,   30.6,   14.2,  252,   93.5],
    [ 60.64,   32.5,   15.4,  243,   93.0],
    [ 60.84,   34.4,   17.0,  238,   92.0],
    [ 61.04,   36.3,   18.7,  228,   90.8],
    [ 61.24,   38.9,   20.9,  214,   90.8],
    [ 61.44,   42.1,   23.7,  197,   90.8],
    [ 61.84,   49.4,   31.7,  166,   90.8],
    [ 62.04,   50.8,   33.8,  157,   90.8],
    [ 62.17,   51.8,   35.3,  152,   90.8],
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
    [ 61.20,   50.9,  -10.2,  445,   -8.8],
    [ 61.67,   62.6,    3.9,  445,   -8.8],
    [ 62.00,   62.5,    5.2,  448,   -6.2],
    [ 62.20,   63.6,    5.8,  447,   -7.1],
    [ 62.43,   64.4,    6.6,  438,   -8.8],
    [ 62.70,   64.6,    7.4,  422,  -15.2],
    [ 62.97,   64.4,    7.9,  410,  -17.0],
    [ 63.23,   63.9,    8.4,  401,  -21.5],
    [ 63.50,   62.8,    8.8,  394,  -23.0],
    [ 63.77,   61.7,    9.3,  388,  -24.1],
    [ 64.03,   60.6,    9.3,  387,  -24.1],
    [ 64.30,   60.2,    9.5,  388,  -24.3],
    [ 64.57,   60.0,    9.5,  388,  -24.1],
    [ 65.10,   60.9,   10.3,  386,  -23.6],
    [ 65.63,   61.8,   11.9,  395,  -21.8],
    [ 66.30,   60.8,   13.0,  393,  -16.8],
    [ 66.70,   61.3,   14.0,  382,  -16.6],
    [ 66.90,   61.2,   14.8,  375,  -16.4],
    [ 67.10,   60.8,   15.7,  365,  -16.1],
    [ 67.30,   60.3,   17.0,  350,  -16.1],
    [ 67.50,   59.2,   18.7,  329,  -16.1],
    [ 67.70,   57.9,   21.1,  307,  -16.1],
    [ 67.90,   56.0,   24.5,  286,  -16.1],
    [ 68.30,   51.3,   33.1,  258,  -16.1],
    [ 68.54,   48.5,   38.2,  242,  -16.1],
  ] },
  // milkpack-1 — frame 20, 67.07..74.20 s
  { id: 'milkpack-1', asset: 'milkpack', frame: 20, zFlip: 67.87, keys: [
    [ 67.07,   17.9,  -11.5,  351,  -46.3],
    [ 67.40,   23.1,    3.7,  351,  -46.3],
    [ 67.60,   23.5,    5.0,  355,  -46.3],
    [ 68.00,   25.9,    6.4,  377,  -56.8],
    [ 68.20,   26.3,    6.9,  384,  -53.8],
    [ 68.70,   27.4,    8.6,  384,  -50.8],
    [ 69.24,   28.1,    9.9,  383,  -50.8],
    [ 70.04,   26.8,    9.0,  391,  -49.2],
    [ 70.30,   26.9,    9.1,  395,  -49.1],
    [ 71.10,   26.7,    9.7,  407,  -45.8],
    [ 71.37,   26.5,    9.5,  407,  -44.7],
    [ 71.90,   27.5,    9.9,  389,  -42.2],
    [ 72.44,   29.5,   11.2,  373,  -42.3],
    [ 72.70,   31.5,   13.5,  364,  -46.8],
    [ 73.24,   35.6,   19.0,  320,  -48.3],
    [ 73.50,   39.1,   23.0,  288,  -48.3],
    [ 74.04,   49.6,   32.5,  245,  -49.8],
    [ 74.20,   52.8,   35.4,  232,  -49.8],
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
    [ 73.04,   42.1,  116.8,  587,  -42.3],
    [ 73.57,   48.9,  100.4,  587,  -42.3],
    [ 73.84,   52.8,   98.2,  573,  -41.7],
    [ 74.10,   52.5,   95.7,  538,  -41.2],
    [ 74.37,   51.2,   94.1,  504,  -40.6],
    [ 74.64,   50.7,   93.0,  484,  -40.3],
    [ 74.90,   51.0,   92.7,  476,  -39.8],
    [ 75.17,   51.3,   91.6,  471,  -39.2],
    [ 75.44,   52.5,   91.1,  457,  -39.7],
    [ 75.70,   53.6,   90.6,  453,  -40.3],
    [ 75.97,   54.7,   90.1,  456,  -39.2],
    [ 76.24,   55.3,   89.9,  456,  -40.1],
    [ 76.50,   55.1,   89.6,  458,  -41.8],
    [ 76.77,   54.5,   89.3,  462,  -39.7],
    [ 77.04,   53.9,   89.3,  467,  -45.8],
    [ 77.30,   53.2,   89.1,  466,  -46.3],
    [ 77.57,   53.1,   88.6,  468,  -48.0],
    [ 77.84,   53.8,   88.4,  468,  -48.0],
    [ 78.37,   54.8,   86.0,  445,  -49.5],
    [ 78.64,   56.3,   83.9,  422,  -51.0],
    [ 78.90,   56.0,   80.3,  390,  -51.0],
    [ 79.17,   54.2,   74.4,  367,  -49.5],
    [ 79.44,   52.9,   70.6,  342,  -51.0],
    [ 79.57,   52.2,   68.6,  330,  -51.0],
  ] },
  // gift-1 — frame 22, 78.40..84.24 s
  { id: 'gift-1', asset: 'gift', frame: 22, zFlip: 79.14, keys: [
    [ 78.40,   60.3,  -11.9,  331,  -53.8],
    [ 78.54,   61.0,   -7.2,  331,  -35.8],
    [ 78.80,   62.4,    2.3,  331,  -46.3],
    [ 79.07,   64.1,    4.2,  326,  -46.3],
    [ 79.34,   66.1,    5.6,  318,  -46.4],
    [ 79.60,   67.7,    7.1,  310,  -52.5],
    [ 79.87,   68.6,    8.0,  306,  -52.5],
    [ 80.14,   68.4,    8.6,  302,  -52.5],
    [ 80.67,   66.5,    9.4,  299,  -54.0],
    [ 81.47,   62.1,    9.0,  300,  -58.5],
    [ 82.00,   60.0,    7.6,  292,  -61.5],
    [ 82.27,   59.6,    7.3,  285,  -61.5],
    [ 82.54,   59.4,    8.1,  279,  -60.0],
    [ 82.80,   59.5,    9.9,  272,  -57.0],
    [ 83.07,   59.7,   11.9,  263,  -57.0],
    [ 83.60,   60.1,   18.0,  234,  -57.0],
    [ 83.87,   58.6,   22.0,  222,  -57.0],
    [ 84.14,   55.7,   27.1,  210,  -58.5],
    [ 84.24,   54.6,   29.1,  205,  -58.5],
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
