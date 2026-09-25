/**
 * Every duration, offset and epsilon in the project. No preset may contain a
 * bare numeric duration (ADR-0009) — when the motion designer re-times the
 * video, this file plus slides.js are the only edits.
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

/**
 * HOW LONG THE CLIP TAKES TO BRING EACH PAGE BACK FROM EDGE-ON, one number per
 * cut, measured 2026-09-20 by `scripts/flip-scan.mjs`.
 *
 * ⚠️ THIS IS NOT A CORRECTION OF `TIMING.flip.back`. Compared like for like our
 * single curve is the clip's AVERAGE curve almost exactly — time from edge-on to
 * 25 / 50 / 75 / 90 % of the flat width is 0.051 / 0.111 / 0.194 / 0.279 s for
 * ours against 0.047 / 0.112 / 0.193 / 0.279 s for the clip, a mean miss of
 * 0.0002 s across all sixteen cuts. Both the length AND the shape were right.
 * (The trap worth naming: our tween's nominal 0.6 s is not its visible length —
 * it asymptotes, and the last degrees fall below the idle drift. Comparing that
 * 0.6 against the clip's 0.279 says "twice too slow" and is simply the wrong
 * comparison.)
 *
 * WHAT IS WRONG IS THAT THERE IS ONE NUMBER AT ALL. The designer turns every
 * page at its own speed and the spread is threefold: 0.145 s on frame 19,
 * 0.439 s on frame 18. Playing the mean on all sixteen is right on average and
 * wrong on every individual page — we drag by up to 0.133 s where the clip
 * snaps, and arrive up to 0.160 s early where the clip lingers. That is what the
 * owner saw on 2026-09-20 and called "разная скорость" and "резко"; one cause,
 * both symptoms.
 *
 * HOW MEASURED. `preview.mp4` minus `clean bg.mp4` isolates the journal (the two
 * clips differ nowhere else); of that difference's connected components take the
 * tallest, and of ITS columns keep only the dense ones — a column is page only if
 * it carries at least 70 % of the component's height. That density rule is what
 * makes the reading honest, and it is CALIBRATED rather than chosen: at 0.7 the
 * flat width on the cut at 17.10 reads 871 px, the exact number the hand
 * measurement in `flip` records, and the whole curve follows the hand table
 * within about a frame. Width over flat width is |cos(yaw)|.
 *
 * ⚠️ TWO FLAT WIDTHS, NOT ONE. The page that comes back is not the page that
 * left — it settles at its own yaw and size — so the out-leg is judged against
 * the width going in and the back-leg against the width coming out. Judged
 * against a single width, frames 14 and 15 report no back-leg at all.
 *
 * THE VALUES ARE A LEAST-SQUARES FIT of our own ease against the clip's curve at
 * all four checkpoints, not a read of one of them. And the spread is signal, not
 * tail noise: the middle of the curve and its tail agree at r = 0.83, and on 13
 * of the 16 cuts all three checkpoints fall on the same side of the median.
 *
 * ⚠️ EVERY SLIDE NOW PLAYS ITS MEASURED VALUE IN FULL (2026-09-25, DP-15822).
 * Four of them used to be clipped — 10, 11, 18 and 22, though the note here
 * only ever named 11 and 18 — because a turn that ran past the first row of
 * SLIDE_LEAN_PATH would have had the lean writing rotationY underneath it. That
 * table is gone with the clip it came off, nothing else writes rotationY between
 * the turns, and the cap went with it.
 */
export const SLIDE_FLIP_BACK = {
  8: 0.532,
  9: 0.56,
  10: 0.638,
  11: 0.892,
  12: 0.67,
  13: 0.658,
  14: 0.403,
  15: 0.413,
  16: 0.643,
  17: 0.562,
  18: 0.892,
  19: 0.33,
  20: 0.396,
  21: 0.754,
  22: 0.829,
  23: 0.434,
}

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

/**
 * THE LEVITATION — the journal hanging in weightlessness, as a function of the
 * clock (DP-15822).
 *
 * WHAT IT REPLACES. `HOVER_AMP` + `TIMING.hover` drove `hover()`, a repeating
 * yoyo timeline, and the story never built one: `buildStoryTimeline` has
 * returned `hoverTl: null` since the measured path arrived, because a repeating
 * child re-renders at its OWN time zero when its parent is seeked, and this
 * story is seeked constantly. The amplitudes below start from those numbers —
 * they were invented rather than measured, and said so — and the shape is new.
 *
 * WHY TWO SINES PER CHANNEL AND WHY THESE PERIODS. One sine is a metronome: it
 * returns to the same place every period and the eye finds it within two cycles.
 * Two sines whose periods are NOT in an integer ratio never repeat inside the
 * story's 94 seconds — 9.1 against 21.0 comes back together after 63 s, 8.9
 * against 20.4 after 121 s, and the six channels together after longer than
 * anyone will watch. That is the whole trick behind "organic" drift, and it is
 * the same thing the storyboard asks for in words: «власна траєкторія, швидкість
 * і фаза, без синхрону» (21770:4964).
 *
 * ⚠️ THE AMPLITUDES CAME DOWN ON 2026-09-25, and the shape changed with them.
 * The first edition drifted the centre 17 px up and down and 6 px across on top
 * of a pose that was itself travelling; the owner read the whole thing as
 * «слишком искусственно». Both of the ticket's references say the same thing and
 * so does the physics: in weightlessness the centre of mass cannot move without
 * an outside force, so a free object ROTATES and stays put. The centre is now
 * the quiet part and the three angles are the loud one.
 *
 * The depth angles are still the biggest of the six — the owner asked for the
 * perspective to change through a slide on 2026-09-18 («на видео видно, как
 * перспектива тоже меняется на слайде») — but they are 6 and 3.5 degrees now,
 * not 8 and 4.5.
 *
 * WHERE IT IS WRITTEN: `.journal-hover`, which exists for this and nothing else
 * (ADR-0002). Its `transform-origin` is 0 0 and `.journal-box` is centred on
 * that origin by negative margins, so a rotation here turns the journal about
 * its own centre and an `xPercent` here is a percent of the stage — the same
 * unit the pose uses. The pose keeps `.journal-box`; neither writes the other's
 * element, so there is no cache to fight over.
 *
 *   amp     [first harmonic, second] — degrees, or percent of stage, or scale
 *   period  [first, second] in seconds; pairwise non-integer ratios
 *   phase   radians, spread so no two channels cross zero together
 */
/**
 * ⚠️ WHERE THE LEVITATION'S CYCLE STARTS, and it is not zero because of what
 * that cost. The entrance lands at 6.0 s and stops; from there the drift is the
 * only motion, and at `epoch: 0` the drift is at its SLOWEST exactly then —
 * 2.21 deg/s of combined rotation against 3.85 one second later. The owner read
 * that as «остановка, а потом левитация» (25.09). Shifting the whole cycle
 * forward hands the journal over to a drift already moving: 3.96 deg/s at the
 * worst second of 6.0..7.0 instead of 2.21, the same curve, same amplitudes,
 * same periods — only a different place in it. Chosen by maximising the WORST
 * second of that window over 0..20 s in 0.1 steps.
 */
export const DRIFT_EPOCH = 14.1

export const HOVER_DRIFT = {
  // ⚠️ THIS IS NOW THE ONLY THING THAT MOVES between 6 s and 84.8 s, so it is a
  // touch wider than the edition before it. Rotation still carries the motion:
  // in weightlessness a free object turns and its centre stays, which is what
  // both of the ticket's references show.
  rotZ: { amp: [1.0, 0.5], period: [9.1, 21.0], phase: 0.0 },
  rotY: { amp: [4.8, 2.2], period: [8.9, 20.4], phase: 1.31 },
  rotX: { amp: [2.7, 1.3], period: [6.7, 15.4], phase: 2.62 },
  // 16 design px of bob, 6 of sway. Sideways stays the tightest channel: the
  // journal is 1065 design px wide against 886 visible on a phone, so every
  // pixel it drifts across is a pixel of type leaving the screen.
  y: { amp: [0.55, 0.28], period: [7.3, 16.9], phase: 3.93 },
  x: { amp: [0.36, 0.19], period: [11.7, 27.1], phase: 5.24 },
  // The depth breath, +-2.5 %: the journal drifting back and returning. Written
  // as scale rather than a real `z` — the same picture, and `z` would have to be
  // in CSS px while everything else here is design px.
  scale: { amp: [0.016, 0.009], period: [13.1, 30.2], phase: 0.65 },
}
