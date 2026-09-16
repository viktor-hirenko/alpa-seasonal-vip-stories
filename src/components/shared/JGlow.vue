<template>
  <div class="j-glow" :class="`j-glow--${blend}`" :style="boxStyle" />
  <div v-if="plus" class="j-glow j-glow--plus" :style="boxStyle" />
</template>

<script setup>
/**
 * The shared light bloom: the `lighting_1296x576` bitmap under the mock's own
 * ellipse mask, stacked with `hard-light` and `plus-lighter`.
 *
 * Extracted from JHero because not every glow lives inside a hero frame —
 * Player's Pick (21770:3579) puts it straight on the page body, sized as a
 * percentage of the body rather than of a 919 frame.
 *
 * Never use a Figma frame export for this: it composites the page background
 * into an opaque rectangle.
 */
import { computed } from 'vue'
import { usePageGlow } from './decode.js'

const props = defineProps({
  left: { type: Number, required: true },
  top: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  /** Most glows stack two copies; a few pages use only the first one. */
  plus: { type: Boolean, default: true },
  /**
   * Blend of the first copy. Nearly every hero stacks hard-light + plus-lighter
   * (Money Talks, 21770:3197/3200); Seasonal Power (21770:3037) is a single
   * color-dodge copy instead. Take this from the mask group's own blend, never
   * by analogy with a neighbouring page.
   */
  blend: { type: String, default: 'hard' },
  /**
   * The ELLIPSE MASK's own box, design px, relative to this element's top-left.
   *
   * ⚠️ THE MASK IS NOT THE PICTURE, AND COLLAPSING THE TWO IS WHY THE GLOW CAME
   * OUT PALE (V-91). The mock nests them separately — the bitmap fills the
   * element, the mask is a smaller rectangle at its own offset inside it
   * (`mask-size: 1439.453px 862.734px; mask-position: 201.617px -21.566px` on
   * Seasonal Power). This component used to stretch the mask over the whole
   * element with `100% 100%` and call it "visually equivalent". It is not: the
   * ellipse's bright core lands somewhere else and over a wider area, so the
   * peak drops and the falloff flattens. Measured on the page export, the
   * magenta peak was 70 against the mock's 113 on Space Milk and 12 against 35
   * on Sponsor, and the top third of Seasonal Power was black where the mock is
   * pink. The owner saw it on his phone and said so three times.
   *
   * Leave these at 0 only where the mock really does size the mask to the
   * element; every page that does not is wrong until it carries its own numbers.
   */
  maskX: { type: Number, default: 0 },
  maskY: { type: Number, default: 0 },
  maskWidth: { type: Number, default: 0 },
  maskHeight: { type: Number, default: 0 },
})

const d = n => `calc(${+n.toFixed(3)} * var(--u))`

/**
 * «Підсвітка ключового елемента — цифри або центральної ілюстрації розвороту»
 * (21770:2048): the bloom the mock already draws GROWS IN once the text has
 * resolved, rather than being there from the first frame of the page.
 *
 * ⚠️ IT ONLY RAMPS INSIDE THE STORY. With no player above it — the lab, a page
 * mounted on its own — `usePageGlow` answers 1, so every still comparison
 * (36-visual-diff.md) and every fit sweep sees the finished glow it always saw.
 */
const glow = usePageGlow()

const boxStyle = computed(() => {
  const box = {
    left: d(props.left),
    top: d(props.top),
    width: d(props.width),
    height: d(props.height),
    ...(glow.value >= 1 ? {} : { opacity: glow.value }),
  }
  if (!props.maskWidth || !props.maskHeight) return box
  const size = `${d(props.maskWidth)} ${d(props.maskHeight)}`
  const position = `${d(props.maskX)} ${d(props.maskY)}`
  return {
    ...box,
    maskSize: size,
    maskPosition: position,
    WebkitMaskSize: size,
    WebkitMaskPosition: position,
  }
})
</script>
