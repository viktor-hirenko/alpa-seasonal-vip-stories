/**
 * Resolve the 3D scene's DOM once. Presets receive this object and nothing
 * else — no preset may query the DOM itself. That single constraint is what
 * makes the library reusable across projects and trivial to drive from the lab.
 *
 * @typedef {{
 *   stage: HTMLElement, stage3d: HTMLElement,
 *   pos: HTMLElement, hover: HTMLElement, box: HTMLElement,
 *   front: HTMLElement, back: HTMLElement, spine: HTMLElement, fore: HTMLElement,
 *   faces: HTMLElement[],
 *   flyLayer: HTMLElement|null, flash: HTMLElement|null, speed: HTMLElement|null,
 *   outro: HTMLElement|null
 * }} Targets
 */

/** @returns {Targets} */
export function resolveTargets(root) {
  const q = sel => root.querySelector(sel)
  const qa = sel => Array.from(root.querySelectorAll(sel))

  const stage = root.classList?.contains('stage') ? root : q('.stage')
  const targets = {
    stage,
    stage3d: q('.stage-3d'),
    pos: q('.journal-pos'),
    hover: q('.journal-hover'),
    box: q('.journal-box'),
    front: q('.jface--front'),
    back: q('.jface--back'),
    spine: q('.jedge--spine'),
    fore: q('.jedge--fore'),
    faces: qa('.jface, .jedge'),
    flyLayer: q('.fly-layer'),
    flash: q('.stage__flash'),
    speed: q('.stage__speed'),
    // Scene chrome, not 3D: the outro text is the one piece of `.stage__ui`
    // that moves, so it is the one piece the library needs a handle on.
    outro: q('.story-outro'),
  }

  const missing = ['stage', 'stage3d', 'pos', 'hover', 'box'].filter(k => !targets[k])
  if (missing.length) {
    throw new Error(`[journal3d] resolveTargets: missing ${missing.join(', ')}`)
  }
  return targets
}
