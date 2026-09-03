import { gsap } from 'gsap'
import { EASE } from '@/story/easing.js'

/**
 * ONE FLYING OBJECT.
 *
 * The record is a POLYLINE measured off `clean bg.mp4`, not a shape described
 * in prose: `keys` is `[t, x%, y%, size, rot]` per row, where x/y are the
 * object's centre on screen, `size` its extent in design px and `rot` its
 * in-plane angle. Position, size and angle were fitted frame by frame by
 * correlating the sprite against the clip (scripts/fly-fit.mjs), then decimated
 * to the rows that a straight line between them cannot reproduce.
 *
 * WHY A POLYLINE AND NOT A THREE-PHASE PRESET. The previous version described
 * the motion as `from -> hold -> to` with shared phase lengths, shared eases,
 * a synthetic hover drift and a per-flight `spin`. Every one of those four was
 * an invention, and against the clip every one of them was wrong: the objects
 * barely rotate, they do not tumble in 3D, and their drift is a specific path
 * rather than a sine. Anything the reference actually does is now IN the table,
 * which is also why TIMING.fly and the fly eases are gone.
 *
 * TWO PROPERTIES, TWO ELEMENTS (see the contract in _stage.scss):
 *   .fly-obj       >> GSAP owns --fo-x / --fo-y <<        (screen percent)
 *   .fly-obj__box  >> GSAP owns rotationZ and scale <<
 *
 * ROTATION IS IN-PLANE ONLY. There is no rotationX/rotationY anywhere, and that
 * is a measurement, not a simplification: fitted against the clip, the objects'
 * silhouettes keep the aspect ratio of their own artwork (the pen measures an
 * elongation of 8.5-8.9 against the sprite's 8.3 for the whole of its flight).
 * A rotationY of 30 deg foreshortens a flat sprite by cos 30 — which is exactly
 * the "squashed" the owner rejected, and the reference never does it.
 *
 * SIZE IS `scale`, NOT `width`. The box is laid out once at `base` design px —
 * the flight's largest — so a size change is a transform rather than a layout.
 *
 * VISIBILITY IS NOT ON THIS TIMELINE. A nested child renders at its own start
 * state when the master playhead rewinds past it, so a `set` inside it cannot
 * express "hidden before, visible during, hidden after". It is switched from
 * the tick instead, by buildFlyLayer — the same reasoning as the page cut in
 * ADR-0008, and correct under any seek including backwards.
 *
 * @typedef {import('@/story/flyObjects.js').FlyRecord} FlyRecord
 *
 * @param {{ pos: HTMLElement, box: HTMLElement }} els
 * @param {FlyRecord} rec
 * @returns {gsap.core.Timeline} paused, local time 0 = the flight's first key
 */
export function flyingObject(els, rec) {
  const s = gsap.timeline({ paused: true })
  const k = rec.keys
  const t0 = k[0][0]
  const base = rec.base

  s.set(els.pos, { '--fo-x': k[0][1], '--fo-y': k[0][2] }, 0)
  s.set(els.box, { rotationZ: k[0][4], scale: k[0][3] / base }, 0)

  // Linear between measured rows, deliberately. The rows already carry the
  // reference's own acceleration — they were kept precisely where a straight
  // line stops reproducing it — so easing each segment would add a ripple the
  // clip does not have and put a velocity of zero at every row.
  for (let i = 1; i < k.length; i++) {
    const at = k[i - 1][0] - t0
    const duration = k[i][0] - k[i - 1][0]
    if (duration <= 0) continue
    s.to(els.pos, { '--fo-x': k[i][1], '--fo-y': k[i][2], duration, ease: EASE.flyPath }, at)
    s.to(els.box, { rotationZ: k[i][4], scale: k[i][3] / base, duration, ease: EASE.flyPath }, at)
  }

  return s
}
