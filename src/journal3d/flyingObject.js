import { gsap } from 'gsap'

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
 * WHY THE ROWS ARE READ THROUGH A SPLINE AND NOT TWEENED ONE TO THE NEXT.
 * Straight segments between rows give a path that is continuous but a SPEED
 * that is not: the velocity is constant along a segment and changes in a single
 * frame at each row. Where the clip decelerates hard — every object slides in
 * past a frame edge and settles — neighbouring rows differ by 3x in speed, and
 * the object visibly snaps. Measured on the first cut of this table: 19
 * direction changes above 100 degrees and a worst speed step of 63 -> 21 % of
 * the stage per second, none of them in the reference.
 *
 * A Hermite curve with finite-difference tangents fixes that at the source. It
 * passes exactly through every measured row, so the table stays the thing that
 * is checked, and its velocity is continuous, so nothing snaps. Tangents are
 * taken over unequal spacing (`(P[i+1] - P[i-1]) / (t[i+1] - t[i-1])`) because
 * the rows are not evenly spaced — decimation put them where the motion needed
 * them.
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

  // Finite-difference tangents, in units per second, one per row and channel.
  // The ends are one-sided, so a flight neither overshoots its entry nor
  // curls past its last row.
  const tan = ch => {
    const m = new Array(k.length)
    for (let i = 0; i < k.length; i++) {
      const a = k[Math.max(0, i - 1)]
      const b = k[Math.min(k.length - 1, i + 1)]
      const dt = b[0] - a[0]
      m[i] = dt > 0 ? (b[ch] - a[ch]) / dt : 0
    }
    return m
  }
  const M = [null, tan(1), tan(2), tan(3), tan(4)]

  let seg = 0
  const at = (time, ch) => {
    // The playhead only ever moves a little between renders, so walking from
    // the last segment is cheaper than a search — and a seek just walks further.
    while (seg > 0 && time < k[seg][0]) seg--
    while (seg < k.length - 2 && time >= k[seg + 1][0]) seg++
    const a = k[seg],
      b = k[seg + 1]
    const h = b[0] - a[0]
    if (h <= 0) return b[ch]
    const u = Math.min(1, Math.max(0, (time - a[0]) / h))
    const u2 = u * u,
      u3 = u2 * u
    return (
      (2 * u3 - 3 * u2 + 1) * a[ch] +
      (u3 - 2 * u2 + u) * h * M[ch][seg] +
      (-2 * u3 + 3 * u2) * b[ch] +
      (u3 - u2) * h * M[ch][seg + 1]
    )
  }

  const head = { t: t0 }
  const s = gsap.timeline({ paused: true })
  s.to(head, {
    t: k[k.length - 1][0],
    duration,
    ease: 'none',
    onUpdate() {
      const time = head.t
      gsap.set(els.pos, { '--fo-x': at(time, 1), '--fo-y': at(time, 2) })
      gsap.set(els.box, { rotationZ: at(time, 4), scale: at(time, 3) / base })
    },
  })

  return s
}
