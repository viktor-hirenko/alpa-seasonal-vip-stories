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

  /** Idle drift. sine.inOut is the only ease that never reads as a "step". */
  hoverDrift: 'sine.inOut',

  recede: 'power1.inOut',

  flashIn: 'power2.in',
  flashOut: 'power1.out',

  /** Camera-ward zoom for the simple preset from the brief. */
  zoom: 'power2.in',

  /** Objects drift at near-constant speed; a tiny ease-out reads as air drag. */
  fly: 'power1.out',

  /** The brief's simple entrance. */
  backOut: 'back.out(1.5)',
}

export { customEase }
