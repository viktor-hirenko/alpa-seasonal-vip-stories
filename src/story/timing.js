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

  /**
   * THE PAGE TURN. The journal yaws out to edge-on and comes BACK; it does not
   * complete a 180. Measured against the reference with a difference mask
   * (preview.mp4 minus clean bg.mp4 isolates the journal exactly, because the
   * two clips differ nowhere else), one frame at a time across five cuts. The
   * journal's on-screen silhouette width, cut at 17.10 s:
   *
   *   +0.000  871   settled        +0.167   74   EDGE-ON, only the spine
   *   +0.033  842                  +0.233  378
   *   +0.067  685                  +0.333  657
   *   +0.100  414                  +0.500  808
   *   +0.133  151                  +0.667  863   settled again
   *
   * `out` is the MEAN edge-on offset over the cuts at 11.07 / 17.10 / 22.07 /
   * 26.07 / 44.03 (0.100 / 0.167 / 0.133 / 0.133 / 0.167). Fitting the 17.10
   * leg alone prefers 0.16, but the timecodes themselves carry a frame of
   * error, so the mean across five cuts is the better estimate — and 0.15
   * happens to land on a half-frame boundary, where `snap` could go either way.
   *
   * `back` and both eases come from a least-squares fit of
   * `angle = acos(w / w0)` over the 17.10 series, the cleanest of the five
   * (nothing clipped by the frame edge on either side of it): rms 0.033 out,
   * 0.041 back, in normalised progress. The last few degrees of `back` trail
   * off below the amplitude of the idle drift, so the turn READS as finished
   * around +0.65 even though the tween runs to +0.93.
   *
   * `out` is ALSO when the page content cuts: at edge-on the front face is a
   * hairline, so the swap cannot be seen. ADR-0008 still owns the cut — it just
   * happens at `start + out` rather than at `start`.
   *
   * Why not the 180 that _context/34-page-flip.md specified: the glowing
   * magenta spine sits on the LEFT of the page on every settled frame of six
   * consecutive pages (20.0 / 24.5 / 28.5 / 32.5 / 37.0 / 42.0 s). A real 180
   * would land it on the right for every other page. See that doc's correction.
   */
  flip: { peak: 90, out: 0.14, back: 0.79 },

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
