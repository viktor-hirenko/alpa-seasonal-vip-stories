/**
 * ONE WAY TO READ A MEASURED POLYLINE, shared by everything that has one.
 *
 * Two tables in this project are measurements rather than choreography — the
 * flight table in `flyObjects.js` and the journal's own path in `slides.js` —
 * and both are read through here so that "the same shape, read the same way" is
 * a fact about the code rather than a promise in a comment.
 *
 * WHY A SPLINE AND NOT A TWEEN PER SEGMENT. Straight segments between rows give
 * a path that is continuous but a SPEED that is not: velocity is constant along
 * a segment and changes in a single frame at each row. Where the reference
 * decelerates hard, neighbouring rows differ by 3x in speed and the object
 * visibly snaps — measured on the first cut of the flight table: 19 direction
 * changes above 100 degrees and a worst speed step of 63 -> 21 % of the stage
 * per second, none of them in the reference.
 *
 * A Hermite curve with finite-difference tangents fixes that at the source. It
 * passes exactly through every measured row, so the table stays the thing that
 * is checked, and its velocity is continuous, so nothing snaps. Tangents are
 * taken over unequal spacing — `(P[i+1] - P[i-1]) / (t[i+1] - t[i-1])` — because
 * decimation puts the rows where the motion needs them, not on a grid. The ends
 * are one-sided, so a path neither overshoots its first row nor curls past its
 * last.
 *
 * @param {number[][]} keys rows of `[t, ...channels]`, ascending in t
 * @returns {(time: number, ch: number) => number} channel `ch` (1-based) at `time`
 */
export function splineReader(keys) {
  const width = keys[0].length
  const M = [null]
  for (let ch = 1; ch < width; ch++) {
    const m = new Array(keys.length)
    for (let i = 0; i < keys.length; i++) {
      const a = keys[Math.max(0, i - 1)]
      const b = keys[Math.min(keys.length - 1, i + 1)]
      const dt = b[0] - a[0]
      m[i] = dt > 0 ? (b[ch] - a[ch]) / dt : 0
    }
    M.push(m)
  }

  // The playhead only ever moves a little between renders, so walking from the
  // last segment is cheaper than a search — and a seek just walks further.
  let seg = 0
  return (time, ch) => {
    while (seg > 0 && time < keys[seg][0]) seg--
    while (seg < keys.length - 2 && time >= keys[seg + 1][0]) seg++
    const a = keys[seg],
      b = keys[seg + 1]
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
}
