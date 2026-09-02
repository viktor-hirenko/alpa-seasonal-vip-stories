import { gsap } from 'gsap'

/**
 * The pose -> transform contract, in one place.
 *
 * A pose record splits across two elements because they are owned by different
 * animations (ADR-0002):
 *   .journal-pos -> xPercent / yPercent   (position, % of the stage)
 *   .journal-box -> rotationZ / scale     (orientation and size)
 *
 * xPercent/yPercent rather than x:'52%' so GSAP does no unit parsing. Since
 * `.journal-pos` is 100%x100% of the stage and its transform-origin is 0 0,
 * a percentage translate moves its origin — and the journal box is centred on
 * that origin by negative margins — so cx/cy land the journal CENTRE exactly.
 */

/** @param {{rot:number, scale:number, cx:number, cy:number}} pose */
export const posVars = pose => ({ xPercent: pose.cx, yPercent: pose.cy })

/** @param {{rot:number, scale:number, cx:number, cy:number}} pose */
export const boxVars = pose => ({ rotationZ: pose.rot, scale: pose.scale })

/** Snap the journal to a pose with no animation. */
export function setPose(t, pose) {
  gsap.set(t.pos, posVars(pose))
  gsap.set(t.box, boxVars(pose))
}

/** Face geometry: which base size the box is laid out at. */
export function setFace(t, face, FACE) {
  const { w, h } = FACE[face]
  t.stage.style.setProperty('--jw', String(w))
  t.stage.style.setProperty('--jh', String(h))
}
