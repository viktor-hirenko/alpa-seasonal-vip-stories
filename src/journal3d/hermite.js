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
 * THE TANGENTS ARE THEN LIMITED SO THE CURVE CANNOT LEAVE ITS OWN ROWS
 * (2026-09-06). Passing through every row is not the same as staying between
 * them: a plain finite-difference tangent makes the cubic bulge outside the
 * pair of values that bracket it whenever a row's two neighbours are lopsided,
 * and a lopsided neighbour is the normal case here, because journal-path.mjs
 * ends every slide by REPEATING the slide's last measured pose at the instant
 * before the fold, and the row after that pair belongs to the next slide and is
 * tens of degrees away.
 *
 * Measured on the rendered story, frame by frame, before this was fixed: the
 * curve left the corridor of its own two rows on 40 of the 150 journal-path
 * intervals in roll alone, and the worst of them were the HOLDS — the intervals
 * whose two rows are identical, where the journal is supposed to stand still.
 * Between 66.57 and 67.05, two rows both reading 24.36 deg, the rendered roll
 * climbed to 26.76 and came back: 2.41 deg of lean out and back that no row
 * asks for, on a journal whose corner therefore travels some 40 design px and
 * returns. Held frames either side of it difference to a hairline outline; the
 * middle of the hold differences to plainly doubled type. The tail row exists
 * precisely because holding is right to about a degree there — so a spline that
 * invents two and a half degrees inside the hold defeats the row it is reading.
 *
 * THE LIMITER IS NARROWED TO THE FLAT SEGMENTS, and that is a measurement
 * rather than a preference. The full Fritsch-Carlson rule — which also zeroes a
 * tangent wherever a row is a local extremum — removes every overshoot in the
 * table, but it was tried and it costs accuracy where the path genuinely turns
 * around: `pose:check`, which compares our journal's motion against the clip's
 * own, went from a worst error of 3.0 design px to 7.3 against a tolerance of
 * 9, and all of the new error was in frame 23, where the outro's path wanders
 * out and comes back. Rounding a real turn is a guess, and there the clip says
 * the rounded guess is the better one.
 *
 * A FLAT segment is not a guess. Its two rows carry the same value, so there is
 * no turn to round: journal-path.mjs put the second one there to say the pose
 * HOLDS until the fold. Zeroing both of its tangents makes the hold exact and
 * leaves every genuine turn alone.
 *
 * IT IS NOT FREE EITHER, and the price is 3 design px: `pose:check` reads 6.0
 * where it read 3.0, still against a tolerance of 9, and the whole of that sits
 * in frame 23 at 84.53..85.28 — the first second AFTER a hold, which the curve
 * now leaves from rest instead of already travelling. That is the trade taken
 * deliberately: what goes away is a 2.4 deg / 20 px excursion that repeats at
 * every one of the sixteen slide ends, and `pose:check` cannot see it at all —
 * its samples are 0.25 s apart and the excursion lives between them, exactly as
 * the entrance's six stalls lived between them until session K went looking.
 *
 * @param {number[][]} keys rows of `[t, ...channels]`, ascending in t
 * @returns {(time: number, ch: number) => number} channel `ch` (1-based) at `time`
 */
export function splineReader(keys) {
  const width = keys[0].length
  const n = keys.length
  const M = [null]
  for (let ch = 1; ch < width; ch++) {
    const m = new Array(n)
    for (let i = 0; i < n; i++) {
      const a = keys[Math.max(0, i - 1)]
      const b = keys[Math.min(n - 1, i + 1)]
      const dt = b[0] - a[0]
      m[i] = dt > 0 ? (b[ch] - a[ch]) / dt : 0
    }
    // A HOLD IS A HOLD. Where two neighbouring rows carry the same value, both
    // of that segment's tangents go to zero — a cubic with equal ends and a
    // non-zero tangent has to leave and come back, through values no row asks
    // for. This is the first clause of Fritsch-Carlson and the only one that
    // costs nothing (see the note above for the one that did).
    for (let i = 0; i < n - 1; i++) {
      if (keys[i + 1][ch] === keys[i][ch]) {
        m[i] = 0
        m[i + 1] = 0
      }
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
