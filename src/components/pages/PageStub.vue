<template>
  <div class="page-stub">
    <div>
      <span class="page-stub__chip">{{ label }}</span>
      <div class="page-stub__title">{{ label }}</div>
      <div class="page-stub__meta">frame {{ frame }} · {{ start.toFixed(2) }}s</div>
    </div>
  </div>
</template>

<script setup>
/**
 * Temporary stand-in until phase 2 builds the real 17 pages on top of
 * PageChrome + the primitives. It intentionally uses the real page tokens
 * (chip, heading, page background) so the journal reads correctly in 3D and
 * the pose work can be verified before any page art exists.
 */
import { computed } from 'vue'

const props = defineProps({
  page: { type: String, required: true },
  frame: { type: Number, default: 0 },
  start: { type: Number, default: 0 },
})

const label = computed(() => props.page.replace(/_/g, ' '))
</script>
