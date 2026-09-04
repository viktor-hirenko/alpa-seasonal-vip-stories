/**
 * Journal geometry, in scene design pixels (1080x1920 system).
 *
 * The cover and a data page are DIFFERENT base sizes, which is why `face` is a
 * field on every slide record rather than a constant. 1564 - 109 (the drawn
 * spine strip) = 1455 ~= 1465: the cover is the closed book, the data page the
 * open spread. Don't try to unify them.
 *
 * Sources: Figma 21770:2744 (cover), 21770:2946 (data page).
 */

/** @typedef {{ w: number, h: number }} FaceSize */

/** @type {Record<'cover'|'page', FaceSize>} */
export const FACE = {
  cover: { w: 1465, h: 1868 },
  page: { w: 1564, h: 1911 },
}

/**
 * Spine thickness in design px. Calibrated against the clip's edge-on frame —
 * frame 122, t = 4.067, where the journal passes exactly through rotationY -90
 * and the spine is all there is to see.
 *
 * 34 SURVIVED A CHALLENGE ON 2026-09-04 and the challenge is worth recording,
 * because the argument against it is genuinely tempting and genuinely wrong.
 *
 * The tempting argument: fit the two branches of the clip's silhouette-width
 * curve either side of the crossing and extrapolate them to their vertex. Both
 * branches meet at zero, so the clip's journal appears to have no thickness at
 * all, so ADR-0005's six faces are describing an object the reference does not
 * contain. The fit is real: the vertex lands at frame 122.47 with a width of
 * -23 +/- 25 px.
 *
 * Why it does not decide anything: +/-25 px is the whole quantity in dispute. A
 * spine of 34 design px projects to about 54 px at that instant, but the two
 * frames either side of the vertex are already 22 and 20 px wide from the COVER
 * alone, and the run-length cleanup the width measurement needs eats a hairline.
 * The curve cannot see a spine; it is not evidence that there is none.
 *
 * What does decide it is measuring the same thing in both pictures. The magenta
 * excess, (R+B)/2 - G, across the edge-on frame, ours minus `clean bg` against
 * the clip minus `clean bg`:
 *
 *   clip frame 122   peak 69   width 17 / 19 / 21 px at half, quarter, tenth
 *   ours, DEPTH 34   peak 73   width 11 / 14 / 16
 *   ours, DEPTH 10   peak 75   width 13 / 18 / 19
 *
 * 34 already draws a hairline of the clip's width and very nearly its
 * brightness, and 10 is not distinguishable from it in the reference. So the
 * number stays, ADR-0005 stands, and the six faces stay.
 *
 * A WARNING TO WHOEVER RE-RUNS THIS. The first pass of that measurement said our
 * glow was thirty times too wide and half again too bright. It was not: the
 * measuring harness left the backdrop video playing while it waited for the
 * seek, so our frame carried a room from 0.9 s later — and 0.9 s later the room
 * is washed magenta by a journal that is by then wide open. Check
 * `video.currentTime` against `tl.time()` before believing anything about glow.
 */
export const DEPTH = 34

/** Inset (design px) that keeps the edge quads from being coplanar with a face. */
export const SEAM = 1

/**
 * Every data page renders at this scale, verified to 0.1 px across all of them:
 * 1564 x 1911 x 0.681 = 1065.1 x 1301.4 scene design px. Only rotation and
 * centre position vary per slide.
 */
export const PAGE_SCALE = 0.681
