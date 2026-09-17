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
   * THE PAGE TURN. The journal yaws out to edge-on and CARRIES ON THROUGH IT —
   * the page arrives leaning the other way. These three numbers are about its
   * CLOCK and are unaffected by that; the trajectory itself lives in
   * `yawTurn` in journal3d/presets.js, and the keystone measurement that
   * settled the direction is in its comment. Measured with a difference mask
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
   * ⚠️ THE PARAGRAPH THAT STOOD HERE WAS WRONG, and it cost three sessions.
   * It argued there was no 180 because "the glowing magenta spine sits on the
   * LEFT of the page on every settled frame of six consecutive pages". So it
   * does — and it sits on the left AFTER every turn too, because both faces of
   * the designer's journal are dressed alike. The spine cannot separate the two
   * models, and neither can the width table above: `w0 -> 0 -> w0` is what both
   * produce. The owner said so on 2026-09-03 and was overruled by this comment.
   * What actually separates them is the perspective keystone — see `yawTurn`.
   */
  // ⚠️ `back` IS MEASURED AGAINST THE CLIP, NOT TUNED BY EYE (V-99, 12.09).
  //
  // The owner kept saying the turn "was not quite it" and could not say why.
  // The model was right all along — hinge on the left spine, out to edge-on,
  // back the same way, never a real 180 — and the edge-on instant was already
  // exact. What was wrong was the TAIL: the journal took far too long to settle.
  //
  // HOW THE CLIP WAS MEASURED, since nothing in the project could do it before.
  // `preview` minus `clean` leaves the journal AND the flying objects, so the
  // bounding box of that difference is useless — the stars push it to the frame
  // edge. Take the LARGEST CONNECTED COMPONENT instead and, of those, the
  // TALLEST: the journal is ~1800 px tall and a star ~250. Its width divided by
  // its width lying flat is |cos(angle)|. Frame by frame at 1/30 s over the cut
  // at 22.07 that gives the clip's own curve: it starts turning at ~22.02, is
  // edge-on at 22.20, and is flat again by 22.53.
  //
  // Fitted on when each curve has fallen to a fraction of its peak, counted
  // from the edge-on instant:
  //
  //                  75 %      50 %      25 %      10 %
  //     clip        0.070 s   0.129 s   0.223 s   0.295 s
  //     back 0.79   0.084     0.172     0.297     0.418    <- 33-42 % too slow
  //     back 0.60   0.067     0.136     0.233     0.332    <- within one frame
  //
  // `out` stays at 0.14: the clip's out-leg is ~0.18 and begins ~0.05 s before
  // the cut, but the turn is anchored AT the cut and that anchor also fixes the
  // page swap (slides.js uses `at + flip.out`). Moving it is a bigger change
  // for one frame of difference, and the edge-on instant already lands on the
  // clip's, so it was left alone deliberately.
  flip: { peak: 90, out: 0.14, back: 0.6 },

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

  /** The retired draw-back, kept for the lab's `recede` button. The story does
   *  not play it, and there is no flash for it to precede: the journal
   *  dissolves (TIMING.exit) and the clip has no white-out at all. */
  recede: { at: 83.03, dur: 5 },

  /**
   * THE JOURNAL'S EXIT: IT DISSOLVES. THERE IS NO WHITE FLASH (2026-09-05).
   *
   * What stood here was `flash: { at: 88.1, in: 0.08, hold: 0.12, out: 0.6 }`,
   * driving a full-screen white div to opacity 1 and hiding the journal inside
   * it with a single `set`. The reference does no such thing, and this is not a
   * matter of degree — measured on EVERY frame from 86.00 to 89.00, the clip's
   * mean luma never exceeds 119.8, on the frame with the most white in it
   * (88.233, 37.7 % of pixels over 235 in all three channels). Ours reached
   * 235.4 with 62.5 % white at 88.30: the screen went white and everything in
   * the room went with it.
   *
   * The clip's brightness is the OUTRO TITLE and nothing else. Its white share
   * and its mean luma move together frame by frame, exactly as one white
   * population growing and shrinking over an unchanged dark room does:
   * predicting luma as `share x 250 + (1 - share) x 20` tracks the measurement
   * to within 2 grey levels everywhere except the very peak, where it is 13
   * short — the amount the giant letters' own glow and their antialiased edges
   * add. A veil of even 0.06 opacity would add 14 more. Opened and looked at:
   * on 88.233 the room's top-right corner, its floor and the journal's own page
   * are all still BLACK, and the yellow type on the page is crisp.
   *
   * And the journal does not vanish, it FADES. Isolated by the difference mask
   * `preview` minus `clean bg` inside the page — the giant title's own pixels
   * excluded, so what is left is the journal against the room — it holds full
   * strength to 88.40 and reaches the floor of the mask at 88.90:
   *
   *   88.40 1.00   88.53 0.71   88.63 0.57   88.73 0.23   88.83 0.11
   *   88.47 0.82   88.57 0.69   88.67 0.45   88.77 0.16   88.90 0.01
   *
   * Fitted over the nineteen standard eases at four starts and five durations,
   * the best is `sine.inOut` from 88.35 over 0.55 s, rms 0.049 against a
   * measurement whose own noise is about 0.05; a plain linear from 88.40 over
   * 0.45 is next at 0.052. The picture agrees with the numbers: at 88.50 the
   * room's wall panels and its magenta glow are plainly visible THROUGH the
   * page, and the yellow type on it has gone dim but is still legible.
   */
  /**
   * THE JOURNAL SHRINKS AWAY WITH THE TITLE — it does not simply fade on the
   * spot. Re-measured 2026-09-10 after the owner said so, and he is right.
   *
   * WHY THE EARLIER READING SAID "FADE". The numbers above were taken from the
   * strength of a difference mask (`preview` minus `clean bg`) inside the page.
   * That mask weakens when the journal goes transparent — and equally when the
   * journal simply gets SMALLER, because fewer pixels differ. The two are
   * indistinguishable to it, and shrinking is what is actually happening.
   *
   * THE LANDMARK THAT SEPARATES THEM is the page's own yellow copy, which no
   * white title and no glow can be confused with. Its width in the clip:
   *
   *   87.60  744      88.25  440 (0.59)     88.55  122 (0.16)
   *   87.90  744      88.40  254 (0.34)     88.70  gone
   *   88.10  714
   *
   * and its CENTRE holds at 524..574 / 898..946 throughout — the journal is not
   * travelling, it is scaling about its own middle. In the log domain the steps
   * are -0.53, -0.55, -0.75, i.e. very close to constant, which is why the ease
   * is `power1.in` rather than a linear ramp.
   *
   * `scale` is the fraction of the path's last scale that is left at the end of
   * `dur`. The fade is kept, but as a short tail at the very end: at 88.55 the
   * yellow copy is still legible at 122 px wide, so the journal is small by
   * then, not transparent.
   */
  exit: { at: 88.1, dur: 0.6, scale: 0.15, fadeAt: 88.55, fadeDur: 0.25 },

  /** Hyperspace burst: 1080 -> 2338 px = scale 2.165. */
  speed: { at: 92.83, dur: 1.1, scale: 2.165 },

  /**
   * THE OUTRO TEXT, measured off the clip frame by frame (2026-09-05).
   *
   * "See you in the next issue. To the stars!" (21770:4871) does not simply
   * appear: it arrives eleven times oversized, shrinks onto the room, holds for
   * four seconds, and then accelerates past the camera. All six numbers are
   * read off the clip's LINE PITCH — the block overflows the frame while it is
   * big, so its bounding box is useless, but the gap between its three lines
   * scales with it and stays measurable throughout. At rest that pitch is
   * 104.0..104.5 px against the mock's 96 x 1.08 = 103.68, which is how we know
   * the mock's type size is the clip's type size.
   *
   * `at` IS THE TEXT'S OWN FIRST FRAME. It was pinned to 88.10 because the
   * clip's white area jumps there, 0.67 % -> 2.98 %, and fitting the zoom with
   * its start held at that second costs almost nothing: rms 0.107 against 0.089
   * for a freely-chosen start of 88.03. What was read as a white flash covering
   * the arrival is the arrival — the title is white, and those are its pixels.
   * There is no flash: session E measured the clip's mean luma on every frame
   * from 86.00 to 89.00 and it never exceeds 119.8.
   *
   * `exitAt` is NOT `speed.at`. The text starts growing at 92.4333 — the first
   * frame whose pitch leaves the 104.0..104.5 plateau — and the burst only
   * fires at 92.83, so the text leads it by four tenths.
   *
   * The exit is fitted from that measured frame and NOT from the 92.60 the
   * free fit prefers. On rms alone 92.60 wins (0.159 against 0.335), because
   * dropping the slow first eighth of a second lets the curve sit better over
   * the violent end. But an `expo.in` starting at 92.60 is still at scale 1.03
   * on 92.70, where the clip is already at 1.16, and the contact sheet shows
   * that as plain doubling in the BLEND panel — 33 px of it. Started at 92.4333
   * the same ease is within 0.06 of scale through that whole stretch and the
   * doubling goes. The sheet outranks the rms: it is what the defect looks like.
   *
   * The two legs come out the same length, 0.75 s. That is arithmetic, not
   * symmetry imposed for its own sake.
   *
   * Scale is about the CANVAS centre, not the block's own centre; the fixed
   * point of the measured zoom sits at 954..959 while the block's own centre is
   * 951. See `.story-outro` in _ui.scss.
   *
   * WHAT THIS REPLACES. `{ at: 88.7, dur: 0.9 }` — a slot reserved by an
   * earlier session and never wired to anything. 88.7 is 0.6 s late: by then
   * the clip's text has all but finished shrinking (scale 1.95 and falling).
   */
  outro: {
    at: 88.1,
    dur: 0.75,
    scale: 11.57,
    exitAt: 92.4333,
    exitDur: 0.75,
    exitScale: 8.63,
  },

  /**
   * WHEN THE SCENE'S TWO BUTTONS ARE ON SCREEN.
   *
   * `cta` — "Continue Journey" (21770:4456), which the storyboard draws on
   * frames 22-25 and nowhere else: it appears with the Gift page and is gone
   * before the hyperspace burst, so it ends exactly where `speed` begins.
   * `replay` — "Watch again" (21811:3980) on storyboard frame 27, i.e. once the
   * burst has finished (speed.at + speed.dur), and it stays for good.
   */
  /**
   * `delay` and `rise` — the mock's own instruction for the Gift page
   * (21770:2043): «Кнопка виїжджає знизу», restored on 2026-09-18 at the
   * owner's word after the 16.09 "keep everything static" decision had taken it
   * out. It is the ONE entrance the button gets: the two frames after it say
   * «кнопка лишається на місці», so both numbers are measured from `from` and
   * nothing replays them on a later page.
   *
   * ⚠️ `delay` IS NOT DECORATION — THE PAGE TURN HAS TO BE OVER FIRST. `from` is
   * the Gift page's own cut, and the turn that reveals it runs for
   * flip.out + flip.back = 0.74 s after it. A button rising through a page
   * that is still swinging competes with the only motion the eye is following.
   * 0.9 leaves a beat of stillness after the turn lands, which is what the
   * owner asked for in so many words: «переключили слайд, и она через какое-то
   * время, с небольшой задержкой, снизу выплывает».
   *
   * `rise` is 0.7 and not the 0.45 of the first attempt: over 1.4 button
   * heights, 0.45 is a snap and 0.7 is a float. It still lands 13 s before the
   * window closes.
   */
  cta: { from: 78.07, to: 92.83, delay: 0.9, rise: 0.7 },
  replay: { at: 93.93 },

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
