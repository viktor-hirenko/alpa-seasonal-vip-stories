<template>
  <!-- Figma 21770:2962 ("Tabs"). Auto-width, centred on the page axis. -->
  <div class="j-slot" :style="{ top: slotTop }">
    <span class="j-chip" data-fit-role="chip"><slot /></span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** Design-px offset from the page body's top edge. */
  top: { type: Number, required: true },
})

const slotTop = computed(() => `calc(${props.top} * var(--u))`)
</script>
