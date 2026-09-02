/**
 * Every duration, offset and epsilon in the project. No preset may contain a
 * bare numeric duration (ADR-0009) — when the motion designer re-times the
 * video, this file plus slides.js and flyObjects.js are the only edits.
 */

export const FPS = 30

/**
 * Snap a timecode onto the frame grid. A cut at 11.07 s is frame 332.1 — off
 * grid, so on some devices it lands a frame early. Seconds stay un-snapped in
 * the source data because the designer speaks in seconds; snapping happens on
 * read.
 */
export const snap = t => Math.round(t * FPS) / FPS

/** Only correct timeline drift beyond one frame. */
export const SYNC_EPSILON = 1 / FPS

/** Music, not lip-sync: a looser epsilon avoids audible re-pin clicks. */
export const AUDIO_EPSILON = 0.08

export const TIMING = {
  /** Journal lies flat on the floor and swings up. */
  entrance: { start: 2.5, floorLift: 1.15, edgeOnAt: 1.43, settleAt: 3.5 },

  /** Dolly zoom: the entrance shows extreme keystoning, the settled slides don't. */
  persp: { base: 1800, entranceDip: 1100, recover: 1.6 },

  /** Per-slide re-pose. */
  rePose: 0.5,

  /** Idle drift. Per-property periods are deliberately co-prime-ish so the
   *  loop never reads as periodic. */
  hover: {
    rotZ: 6.5,
    rotY: 8.5,
    rotX: 7.25,
    y: 5.5,
    scale: 9.5,
    stagger: 0.8,
  },

  /** Journal recedes before the flash. */
  recede: { at: 83.03, dur: 5 },

  /** Exit: the journal is hidden INSIDE the flash, never faded. */
  flash: { at: 88.1, in: 0.08, hold: 0.12, out: 0.6 },

  /** Hyperspace burst: 1080 -> 2338 px = scale 2.165. */
  speed: { at: 92.83, dur: 1.1, scale: 2.165 },

  outro: { at: 88.7, dur: 0.9 },

  /** Story length, from the reference video. */
  duration: 94.3667,
}

/** Idle-drift amplitudes, degrees / percent / ratio. */
export const HOVER_AMP = {
  rotZ: 0.9,
  rotY: 2.5,
  rotX: 1.5,
  y: 0.6,
  scale: 0.012,
}
