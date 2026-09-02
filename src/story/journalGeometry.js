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
 * Spine thickness in design px. Calibrated against the frame at t=3.93 where
 * the journal passes exactly edge-on and only the glowing spine is visible.
 * Tune it in the lab (`__lab.setDepth`) against that frame — it is the single
 * number that decides whether the volume reads as a book or as a sheet of paper.
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
