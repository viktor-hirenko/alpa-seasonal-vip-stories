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
  /**
   * THE ENTRANCE, measured off the clip frame by frame (2026-09-04).
   *
   * `start` is not a cut and not a guess: the journal is ABSENT from the clip
   * until frame 118. The difference mask `preview` minus `clean bg` — the two
   * clips differ nowhere else — is under 50 px2 of codec noise on every frame
   * from 60 to 117, and 195..650 design px wide on 118. Before `start` the
   * journal is hidden outright; there is nothing to fade.
   *
   * `edgeOnAt` is where rotationY passes exactly -90 and only the spine faces
   * the camera. Both branches of the silhouette-width curve extrapolate to the
   * same vertex, frame 122.5:
   *
   *   118 414   120 206   122  22   124 101   126 222   128 345   130 468
   *   119 305   121 118   123  20   125 164   127 286   129 408   131 521
   *
   * `settleAt` is frame 180, where the cover stops moving; 30-timecodes.md had
   * that one right all along.
   *
   * These three are the RECORD of the measurement. The swing itself is driven by
   * the key table in swingOpen, whose first column is these same seconds — the
   * keys have to carry their own times because there are seven of them and no
   * two are evenly spaced.
   *
   * WHAT THIS REPLACES. `start` was 2.50 — the interior cut, which a scene
   * detector had labelled as the journal's entrance — so the whole swing ran
   * 1.58 s ahead of the clip, and its keys put frame 7's settled pose on frame
   * 6's timecode while the clip still had the cover filling the frame.
   */
  entrance: {
    start: 3.9333, // frame 118, the journal appears
    edgeOnAt: 0.15, // + this = frame 122.5, exactly edge-on
    settleAt: 2.0667, // + this = frame 180, settled
    floorLift: 1.15, // flyInFromFloor only, which the story no longer uses
  },

  /**
   * Camera distance. NO DIP: the entrance is keystoned hard, and 1800 is what
   * produces that keystone. Measured twice and by two methods — the convergence
   * of the cover's vertical edges on frame 118 puts it at 1640..1900, and
   * solving the entrance poses against the clip's own left and right edges at
   * 1800 lands our quad on the cover to within ~20 px from frame 122 to 180.
   *
   * The old dip to 1100 belonged to an entrance that does not exist. It is also
   * unusable at this size: at 1100 a cover half a canvas wide swings its near
   * corner to within 170 px of the camera and the projection blows up — the
   * quad came out 15 800 px tall.
   */
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

  /**
   * WHEN THE SCENE'S TWO BUTTONS ARE ON SCREEN.
   *
   * `cta` — "Continue Journey" (21770:4456), which the storyboard draws on
   * frames 22-25 and nowhere else: it appears with the Gift page and is gone
   * before the hyperspace burst, so it ends exactly where `speed` begins.
   * `replay` — "Watch again" (21811:3980) on storyboard frame 27, i.e. once the
   * burst has finished (speed.at + speed.dur), and it stays for good.
   */
  cta: { from: 78.07, to: 92.83 },
  replay: { at: 93.93 },

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
