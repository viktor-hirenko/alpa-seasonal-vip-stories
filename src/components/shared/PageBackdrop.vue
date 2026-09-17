<template>
  <div class="page__art art-box" :style="artBox(-804, -208, 3049.644, 2284.992)">
    <JArt :src="galaxy" alt="" :style="artImg(2759, 1793, 10.96)" />
  </div>
  <div v-if="planets" class="page__art art-box" :style="artBox(-542.59, 1026, 1501.563, 1258.608)">
    <JArt :src="planetsSrc" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
  </div>
</template>

<script setup>
/**
 * The canonical galaxy + planets backdrop shared by most data pages.
 *
 * Values are the TRUE ones from get_design_context on Money Talks
 * (21770:3188 / 21770:3189). They are reused on any page whose metadata for
 * those two nodes is byte-identical to Money Talks' — Seasonal Power and
 * Sports Desk both are — because metadata is a consistent (if wrongly-framed)
 * projection of the same placement.
 *
 * Pages with different metadata for these nodes (Bonus Report) must get their
 * own get_design_context pass; do NOT infer them from metadata.
 */
import { artBox, artImg } from './artBox.js'
import galaxy from '@/assets/pages/galaxy-3.webp'
import planetsSrc from '@/assets/pages/planets-4.webp'

defineProps({ planets: { type: Boolean, default: true } })
</script>
