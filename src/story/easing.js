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

  /** The swing-open through edge-on. Slow at the extremes, fast through 90deg. */
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

  /** The brief's simple entrance. */
  backOut: 'back.out(1.5)',
}

export { customEase }
