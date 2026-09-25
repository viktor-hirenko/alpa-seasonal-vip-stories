<template>
  <div class="page__art art-box" :style="{ ...artBox(left, top, width, height), ...fadeStyle }">
    <JArt :src="TONES[tone]" alt="" :style="artImg(width, height)" />
  </div>
  <div
    v-if="planets"
    class="page__art art-box"
    :style="artBox(planetsLeft, planetsTop, planetsWidth, planetsHeight)"
  >
    <JArt
      :src="planetsSrc"
      alt=""
      :style="artImg(planetsImgWidth, planetsImgHeight, planetsRotate, 'scaleY(-1)')"
    />
  </div>
</template>

<script setup>
/**
 * The canonical backdrop shared by most data pages.
 *
 * ⚠️ 2026-09-25: THE GALAXY IS GONE AND THIS IS THE DESIGNER'S OWN CHANGE.
 * Every redrawn page hides `galaxy 3` (Seasonal Power still carries the node,
 * marked `hidden`; Sports Desk and Money Talks dropped it entirely) and puts a
 * new raster in its place — `383322508_1a7a3d50-…`, a near-BLACK starfield with
 * a central flare and streaking rays. It reads magenta on the page only because
 * the colour wash above it (`rgba(255,0,181,0.62)`, `mix-blend-mode: color`)
 * tints it; the file itself is monochrome. That is why the pages went from our
 * broad pink wash to a dark field with fine magenta grain, which is the single
 * largest disagreement the 25.09 overlay found — 26.9 % on Gift, where the
 * background is the ONLY thing that differs.
 *
 * ⚠️ THE FADE IS NOT DECORATION, IT IS HALF THE PICTURE. The mock wraps the
 * raster in a Mask group whose mask looked like a no-op — an SVG rect exactly
 * the image's size — and is in fact a VERTICAL GRADIENT, transparent at
 * y = 282.189 and opaque at 1459.8 of its own 1946.53 (`5e636.svg`), i.e.
 * 14.497 % to 74.997 %. Drawn without it the starfield is at full strength
 * behind the heading and the page reads far brighter than the mock. Seasonal
 * Power carries the same file as a PLAIN node with no mask and passes
 * `:fade-end="0"`.
 *
 * ⚠️ AND IT IS THE SAME PICTURE AT THREE DIFFERENT EXPOSURES. The node's own
 * export is GREYSCALE where the uploaded source is blue, and its tone differs
 * per page: the design-context render means 6.2 on Gift, 14.9 on Sports Desk
 * and 5.3 on Top Sport Signal, with the alpha identical on all three. So the
 * designer desaturated the fill and set a different level on each page, and
 * feeding the raw upload to every page makes the background two to three times
 * too bright — which is exactly what the first pass did, and Gift stayed at
 * 14.7 % with nothing else left to blame. Each file here is the raw source's
 * LUMINANCE pushed through the tone curve measured against that page's own
 * export (a lookup table fitted on the 1024x574 render, residual under one
 * grey level), so the full 4096 of detail survives. Rebuilt the same way if
 * the designer moves a level again.
 *
 * ⚠️ THE FILE IS FLATTENED ONTO THE PAGE COLOUR, on purpose. The Figma source
 * is RGBA with a meaningful alpha (mean 126), and keeping it costs 1.4 MB
 * against 204 KB — on a page budget that already killed Safari tabs once (see
 * JArt). Compositing it onto `#000a12` and masking THAT is algebraically the
 * same picture wherever the page colour is what lies underneath:
 * `m·(rgb·a + bg(1−a)) + bg(1−m) = rgb·a·m + bg(1−a·m)`. The one thing it
 * costs is that `planets 4`, which the mock puts UNDER the raster, has to be
 * drawn over it instead; the mock clips all but its top corner anyway.
 *
 * The defaults are Sports Desk's and Money Talks' box (23126:3279 / 23126:3448,
 * identical on both): 3474.063 x 1946.527, centred on the body's middle, top
 * 278.82. Every value here is from `get_design_context`, never metadata — for a
 * rotated child metadata reports a coordinate in no frame at all.
 *
 * `planets 4` did not leave, it MOVED: from the bottom-left corner to the top
 * right, where the body clips all but its lower-left quarter. Pages that no
 * longer show it at all pass `:planets="false"`.
 */
import { computed } from 'vue'
import { artBox, artImg } from './artBox.js'
import toneA from '@/assets/pages/bg-starburst-a.webp'
import toneB from '@/assets/pages/bg-starburst-b.webp'
import toneC from '@/assets/pages/bg-starburst-c.webp'
import toneD from '@/assets/pages/bg-starburst-d.webp'
import planetsSrc from '@/assets/pages/planets-4.webp'

/** The three exposures the designer set, keyed as Figma names the export. */
const TONES = { a: toneA, b: toneB, c: toneC, d: toneD }

const props = defineProps({
  planets: { type: Boolean, default: true },
  /**
   * Which exposure of the starfield this page draws — see the note above.
   * 'a' = ae97a (Gift, Seasonal Power), 'b' = b654d (Sports Desk, Money Talks),
   * 'c' = 419b5 (Top Sport Signal, Space Milk), 'd' = 96949 (VIP Status).
   */
  tone: { type: String, default: 'b' },
  /** Starburst box, design px relative to the page body (23126:3279). */
  left: { type: Number, default: -1017.15 },
  top: { type: Number, default: 278.82 },
  width: { type: Number, default: 3474.063 },
  height: { type: Number, default: 1946.527 },
  /** The Mask group's gradient, in per cent of the raster's own height. */
  fadeStart: { type: Number, default: 14.497 },
  fadeEnd: { type: Number, default: 74.997 },
  /** `planets 4` box and its inner image (23126:3276). */
  planetsLeft: { type: Number, default: 768.69 },
  planetsTop: { type: Number, default: -548 },
  planetsWidth: { type: Number, default: 1246.411 },
  planetsHeight: { type: Number, default: 1044.739 },
  planetsImgWidth: { type: Number, default: 1068.061 },
  planetsImgHeight: { type: Number, default: 662.593 },
  planetsRotate: { type: Number, default: 155.59 },
})

const fadeStyle = computed(() => {
  if (!props.fadeEnd) return {}
  const grad = `linear-gradient(to bottom, transparent ${props.fadeStart}%, #000 ${props.fadeEnd}%)`
  return {
    maskImage: grad,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskImage: grad,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
  }
})
</script>
