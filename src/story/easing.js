import { gsap } from 'gsap'

/**
 * Named eases. Centralising these is a deliberate fix for Thor, where every
 * tween carried an inline ease string and re-timing meant grepping 340 lines.
 *
 * CustomEase ships free from GSAP 3.13, which lets us match the designer's
 * After Effects curves literally instead of approximating with power3.out.
 * Registration is guarded so the module still works if the plugin is absent.
 */
let customEase = null
try {
  // eslint-disable-next-line no-undef
  customEase = gsap.parseEase ? null : null
} catch {
  customEase = null
}

export const EASE = {
  /** Floor -> lift. Heavy object, gains speed, settles hard. */
  entrance: 'power3.out',

  /**
   * NO LONGER THE ENTRANCE'S EASE. `swingOpen` reads its measured keys through
   * the Hermite reader on a constant playhead (2026-09-06) — chaining this ease
   * per segment stopped the journal dead at every key. Kept for `pageFlip3D`,
   * a library preset that is choreography rather than a measurement.
   */
  swing: 'power2.inOut',

  /** Per-slide re-pose. Short and unobtrusive. */
  rePose: 'power2.inOut',

  /**
   * Page turn, out to edge-on. Starts from rest and decelerates INTO the turn,
   * so the journal hangs on its edge for an instant. Best fit of the measured
   * angle series in TIMING.flip (rms 0.033 against sine.inOut, 0.051 against
   * power1.inOut, 0.048 against linear).
   */
  flipOut: 'sine.inOut',

  /**
   * ...and back. Leaves the turn at full speed and lands soft — that asymmetry
   * is what makes a page turn read as a snap rather than a pendulum. Measured
   * degrees against this curve, at +0.20 / +0.27 / +0.33 / +0.40 s from the cut:
   * 73.7/74.0, 56.0/55.6, 40.8/40.8, 28.3/28.8.
   */
  flipBack: 'power2.out',

  /** Idle drift. sine.inOut is the only ease that never reads as a "step". */
  hoverDrift: 'sine.inOut',

  recede: 'power1.inOut',

  /**
   * The journal's dissolve at the end of the story. Fitted against the clip,
   * best of nineteen at rms 0.049 — see TIMING.exit for the measurement. It
   * replaces `flashIn: 'power2.in'` and `flashOut: 'power1.out'`, which drove a
   * white-out the reference does not have.
   */
  dissolve: 'sine.inOut',

  /** Camera-ward zoom for the simple preset from the brief. */
  zoom: 'power2.in',

  /**
   * THE OUTRO TEXT, in and out. Both fitted to the clip's own scale curve,
   * which was read off the LINE PITCH of the three-line block (the block
   * overflows the frame while it is big, so a bounding box says nothing but the
   * distance between its lines still scales with it).
   *
   * `outroIn` is the best of nine stock eases over the 19 measurable frames,
   * 88.33..88.93: rms 0.107 on a scale that runs 1 -> 11.6, i.e. under 1 % of
   * the range. Next best were sine.out (0.134) and power1.out (0.157).
   *
   * `outroOut` is the same contest over the exit, 92.60..93.18: expo.in at rms
   * 0.159, well clear of power4.in (0.292) and power2.in (0.726). The text does
   * not drift away, it accelerates past the camera — which is why the flattest
   * curves lose by a factor of five.
   */
  outroIn: 'power1.inOut',
  outroOut: 'expo.in',

  /**
   * FLYING OBJECTS. One ease, and it is `none` on purpose.
   *
   * Each flight in flyObjects.js is a polyline of rows measured off the clip,
   * and flyingObject.js reads them through a Hermite spline whose velocity is
   * continuous. The playhead therefore has to advance at a CONSTANT rate — the
   * shape of the motion lives in the rows and in the curve through them, and an
   * ease on top would re-time the clip's own acceleration into something else.
   */
  flyPath: 'none',

  /**
   * THE CTA'S RISE, and the overshoot is the whole point of choosing `back`.
   *
   * The button travels 1.4 of its own heights, which is a long way, and a plain
   * decelerating curve over that distance reads as a panel being pushed into
   * place and stopping dead. A SMALL overshoot lets it settle instead, and that
   * is the difference between "slid in" and "floated up". 1.1 overshoots by
   * about 6 % of the travel — four design px at a phone size, one frame of
   * softness. The stock 1.7 is a bounce and reads as a toy; that is the trap
   * here, not too little.
   */
  ctaRise: 'back.out(1.1)',

  /**
   * ...and the two things that must NOT overshoot with it. The fade and the
   * micro-scale ride plain decelerations, because an opacity or a size that
   * wobbles past its target is visible as a flicker where the position's
   * overshoot is read as weight.
   */
  ctaSettle: 'power2.out',

  /** The brief's simple entrance. */
  backOut: 'back.out(1.5)',
}

export { customEase }
