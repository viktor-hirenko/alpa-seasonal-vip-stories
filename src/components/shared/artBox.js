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

/** Inner image: intrinsic box plus rotation in degrees. */
export const artImg = (width, height, rotate = 0) => ({
  width: d(width),
  height: d(height),
  ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}),
})
