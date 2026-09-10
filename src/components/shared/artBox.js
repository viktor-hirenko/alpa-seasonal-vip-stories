/**
 * Helpers for the mock's art nesting: an outer box that positions and centres,
 * an inner image that carries the intrinsic size and the rotation.
 *
 * This shape is not decoration — it is why `get_metadata` cannot be used for
 * art placement. For a rotated child, metadata reports a coordinate that does
 * not correspond to the parent frame (on Money Talks it put the hero icon at
 * x=548 inside a 919-wide frame). Always take art geometry from
 * `get_design_context`.
 */
const d = n => `calc(${+Number(n).toFixed(3)} * var(--u))`

/** Outer positioning box, design px relative to the page body. */
export const artBox = (left, top, width, height) => ({
  left: d(left),
  top: d(top),
  width: d(width),
  height: d(height),
})

/**
 * Inner image: intrinsic box, rotation in degrees, and an optional mirror.
 *
 * ORDER IS THE WHOLE POINT, AND IT USED TO BE BACKWARDS. The mock writes these
 * as Tailwind utilities — `-scale-y-100 rotate-[110.37deg]` — and Tailwind
 * composes its transform in a FIXED order that is not the order the classes are
 * written in: translate, rotate, skew, then scale. So the mock's CSS is
 * `rotate(110.37deg) scaleY(-1)`, i.e. the mirror is the LAST operation in the
 * string and therefore the FIRST applied to the image's own pixels.
 *
 * This helper emitted `scaleY(-1) rotate(110.37deg)`, which is the opposite
 * composition and equals `rotate(-110.37deg) scaleY(-1)` — a mirror about a
 * different axis. On art that is only slightly turned the error is invisible
 * (Multiplier Moment turns -1.44 deg, so it was 2.88 deg out and nobody saw
 * it), but on Headline Win's rocket, at 110.37 deg, it pointed the rocket up
 * and to the right where the mock flies it left and down. That is the "rockets
 * fly the wrong way" the owner reported on 2026-09-10 — not a wrong number
 * anywhere: the art box, the angle and the image file all matched the mock
 * exactly, only the multiplication order did not.
 *
 * `pre` keeps its name because it is applied to the image FIRST; in a CSS
 * transform list that means it is written LAST.
 */
export const artImg = (width, height, rotate = 0, pre = '') => {
  const parts = []
  if (rotate) parts.push(`rotate(${rotate}deg)`)
  if (pre) parts.push(pre)
  return {
    width: d(width),
    height: d(height),
    ...(parts.length ? { transform: parts.join(' ') } : {}),
  }
}
