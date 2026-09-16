<template>
  <!-- Figma 21770:2962 ("Tabs"). Auto-width, centred on the page axis. -->
  <div class="j-slot" :style="{ top: slotTop }">
    <span class="j-chip" data-fit-role="chip">
      <JReveal v-if="slotText !== null" :text="slotText" />
      <slot v-else />
    </span>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'
import JReveal from './JReveal.vue'

const props = defineProps({
  /** Design-px offset from the page body's top edge. */
  top: { type: Number, required: true },
})

const slotTop = computed(() => `calc(${props.top} * var(--u))`)

/**
 * The rubric decodes first — it is the «рубрика» of «рубрика, підпис,
 * значення» (21770:2048) and every page writes it as a plain interpolation,
 * `<JChip :top="129">{{ copy.chip }}</JChip>`.
 *
 * ⚠️ IT READS THE SLOT'S TEXT RATHER THAN TAKING A PROP, so that the eighteen
 * pages did not all have to be edited to pass one. That only works while the
 * slot IS plain text: the moment a page puts markup in there this falls back to
 * rendering the slot untouched rather than mangling it, which is why the
 * template has both branches.
 */
const slots = useSlots()

const slotText = computed(() => {
  const nodes = slots.default?.()
  if (!nodes || nodes.length !== 1) return null
  const c = nodes[0].children
  return typeof c === 'string' ? c : null
})
</script>
