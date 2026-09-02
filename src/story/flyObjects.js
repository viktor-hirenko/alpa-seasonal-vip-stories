/**
 * Flying object flight table.
 *
 * STATUS: seeded with hand-measured entries only. The full ~40-flight table is
 * produced by running `_context/source/gemini-prompt-flyobjects.md` against
 * `_refs/DP-15152 - clean bg.mp4` (step 0.4) and then tuned in the lab against
 * the `clean bg` underlay. See _context/33-fly-objects.md.
 *
 * x/y are percentages of the stage; values outside 0..100 mean off-frame.
 * z is scene design px; positive is towards the camera.
 * spin values are TOTAL degrees over the flight.
 */

/** @type {import('@/journal3d/flyingObject.js').FlyRecord[]} */
export const FLY_OBJECTS = [
  // Measured: pen drifts in from top-right and crosses down-left over ~7.5 s
  // while growing slightly. Window 11.5-15.25 of clean bg.mp4.
  {
    id: 'pen-1',
    asset: 'pen',
    size: 431,
    t0: 11.2,
    dur: 7.5,
    from: { x: 58, y: -12, z: -420 },
    to: { x: 34, y: 16, z: 120 },
    spin: { z: -26 },
    scale: { from: 0.85, to: 1.18 },
  },
  // Measured: Saturn enters top-centre-right large at ~34.0, drifts up-left and
  // leaves past the top edge by ~36.8, growing slightly.
  {
    id: 'planet-1',
    asset: 'planet',
    size: 520,
    t0: 33.9,
    dur: 5.4,
    from: { x: 74, y: -6, z: -120 },
    to: { x: 40, y: -26, z: 220 },
    spin: { y: 34, z: 14 },
    scale: { from: 0.95, to: 1.25 },
  },
  // Measured: gold coin at top-left recedes while drifting right.
  {
    id: 'coin-1',
    asset: 'cash-a',
    size: 300,
    t0: 32.6,
    dur: 6.2,
    from: { x: 6, y: 3, z: 260 },
    to: { x: 34, y: -8, z: -520 },
    spin: { y: 220, z: 40 },
    scale: { from: 1.15, to: 0.55 },
  },
]

/** Objects grouped by the page they belong to, from the storyboard layers.
 *  Used to sanity-check coverage once the Gemini table lands. */
export const OBJECTS_BY_FRAME = {
  4: ['cup', 'helm', 'ticket'],
  5: ['cup', 'helm', 'ticket'],
  8: ['pen'],
  9: ['calendar'],
  10: ['points-a', 'points-b'],
  11: ['points-a', 'points-b'],
  12: ['cash-a', 'cash-b', 'cash-c'],
  13: ['planet'],
  14: ['cross', 'cross'],
  15: ['heart'],
  16: ['report', 'report'],
  17: ['basketball', 'soccer'],
  18: ['soccer', 'cross'],
  19: ['planet-cow'],
  20: ['milkpack', 'milkpack'],
  21: ['gift'],
  22: ['ticket', 'ticket'],
}
