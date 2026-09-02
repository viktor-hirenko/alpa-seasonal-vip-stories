import { gsap } from 'gsap'
import { EASE } from '@/story/easing.js'

/**
 * A single flying 3D object.
 *
 * Motion model, measured off `clean bg.mp4` at 0.25 s sampling (windows
 * 11.5-15.25 and 33.0-36.75) — NOT the "burst out of the depths" the first
 * brief described:
 *   - enters from beyond a frame edge, exits beyond the opposite one;
 *   - path is near-straight, gently curved;
 *   - SLOW: one object crosses the frame in 4-8 s;
 *   - slow simultaneous rotation on several axes;
 *   - scale drifts smoothly — some objects approach (grow), some recede (shrink);
 *   - 1-3 objects on screen at once, themed to the current page.
 *
 * x/y are percentages of the stage, same unit as the journal's pose, so values
 * below 0 or above 100 legitimately mean "off frame". Depth is a real `z`, so
 * the browser depth-sorts the object against the journal for free (ADR-0006).
 *
 * @typedef {{
 *   id: string, asset: string, size?: number,
 *   t0: number, dur: number,
 *   from: {x:number,y:number,z:number}, to: {x:number,y:number,z:number},
 *   spin?: {x?:number,y?:number,z?:number},
 *   scale?: {from:number,to:number},
 *   ease?: string
 * }} FlyRecord
 */

/**
 * @param {HTMLElement} el the `.fly-obj` wrapper (GSAP owns its transform)
 * @param {FlyRecord} rec
 */
export function flyingObject(el, rec) {
  const spin = rec.spin || {}
  const scale = rec.scale || { from: 1, to: 1 }
  const s = gsap.timeline({ paused: true })

  s.set(el, {
    xPercent: rec.from.x,
    yPercent: rec.from.y,
    z: rec.from.z,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scale: scale.from,
  })
  s.set(el, { visibility: 'visible' }, 0)

  s.to(
    el,
    {
      xPercent: rec.to.x,
      yPercent: rec.to.y,
      z: rec.to.z,
      scale: scale.to,
      duration: rec.dur,
      ease: rec.ease || EASE.fly,
    },
    0,
  )

  // Rotation runs linear: a spinning object in vacuum does not ease.
  s.to(
    el,
    {
      rotationX: spin.x || 0,
      rotationY: spin.y || 0,
      rotationZ: spin.z || 0,
      duration: rec.dur,
      ease: 'none',
    },
    0,
  )

  s.set(el, { visibility: 'hidden' }, rec.dur)
  return s
}

flyingObject.PARAM_SCHEMA = {
  dur: { min: 1, max: 15, step: 0.1 },
}
