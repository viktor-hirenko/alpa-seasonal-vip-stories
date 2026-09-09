import { gsap } from 'gsap'
import { ROUND_ASSETS, ROUND_HOLD } from '@/story/flyObjects.js'
import { splineReader } from './hermite.js'

/**
 * ONE FLYING OBJECT.
 *
 * The record is a POLYLINE measured off `clean bg.mp4`, not a shape described
 * in prose: `keys` is `[t, x%, y%, size, rot]` per row, where x/y are the
 * object's centre on screen, `size` its extent in design px and `rot` its
 * in-plane angle. Position, size and angle were fitted frame by frame by
 * correlating the sprite against the clip (scripts/fly-measure.mjs), then
 * decimated to the rows that a smooth curve between them cannot reproduce.
 *
 * WHY A POLYLINE AND NOT A THREE-PHASE PRESET. The first version described the
 * motion as `from -> hold -> to` with shared phase lengths, shared eases, a
 * synthetic hover drift and a per-flight `spin`. Every one of those four was an
 * invention, and against the clip every one was wrong: the objects barely
 * rotate, they do not tumble in 3D, and their drift is a specific path rather
 * than a sine. Anything the reference actually does is now IN the table, which
 * is also why TIMING.fly and the fly eases are gone.
 *
 * WHY THE ROWS ARE READ THROUGH A SPLINE AND NOT TWEENED ONE TO THE NEXT, and
 * why that reader lives in hermite.js: see the note there. The journal's own
 * path in slides.js is the same kind of table and is read the same way.
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
  const k = rec.keys
  const t0 = k[0][0]
  const duration = k[k.length - 1][0] - t0
  const base = rec.base

  // The rows are read through the shared Hermite reader — see hermite.js for
  // why a spline and not a tween per segment, and how the tangents are taken.
  const at = splineReader(k)

  // A round silhouette has no measurable angle, so its `rot` column is fit noise
  // and animating it reads as a spin the clip never does. Those flights hold the
  // MEDIAN of their own rows — constant, but not zero, so a deliberate tilt
  // survives — unless that median has itself been laid over the clip and lost,
  // which is what ROUND_HOLD carries. See both in flyObjects.js.
  const spin = !ROUND_ASSETS.has(rec.asset)
  const rots = k.map(r => r[4]).sort((a, b) => a - b)
  const fixedRot = ROUND_HOLD.has(rec.asset) ? ROUND_HOLD.get(rec.asset) : rots[rots.length >> 1]

  const head = { t: t0 }
  const s = gsap.timeline({ paused: true })
  s.to(head, {
    t: k[k.length - 1][0],
    duration,
    ease: 'none',
    onUpdate() {
      const time = head.t
      gsap.set(els.pos, { '--fo-x': at(time, 1), '--fo-y': at(time, 2) })
      gsap.set(els.box, { rotationZ: spin ? at(time, 4) : fixedRot, scale: at(time, 3) / base })
    },
  })

  return s
}
