/**
 * journal3d — a small, reusable GSAP library for animating a flat DOM "book"
 * in real CSS 3D (ticket items 3 and 4).
 *
 * Contract:
 *   const t = resolveTargets(rootEl)        // resolve the scene DOM once
 *   preset(t, params)                       // => paused gsap.timeline()
 *
 * Presets are pure factories. They never query the DOM, never reference a
 * master timeline, and never contain a literal duration or ease string.
 * Compose them onto your own timeline at absolute timecodes.
 */
export { resolveTargets } from './resolveTargets.js'
export { posVars, boxVars, setPose, setFace } from './poseTween.js'
export { flyingObject } from './flyingObject.js'
export * from './presets.js'
export { EASE } from '@/story/easing.js'
export { TIMING, HOVER_AMP, FPS, snap, SYNC_EPSILON } from '@/story/timing.js'
