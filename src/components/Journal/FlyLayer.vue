<template>
  <div class="fly-layer">
    <FlyObject v-for="rec in flights" :key="rec.id" :rec="rec" />
  </div>
</template>

<script setup>
/**
 * The flying objects, as a SIBLING of `.journal-pos` inside the same
 * `preserve-3d` scene (ADR-0006). They carry a real `z`, so the browser
 * depth-sorts them against the journal for free: no z-index, no per-flight
 * bookkeeping, and correct under any seek — including a scrub backwards
 * through the middle of a flight.
 *
 * Every flight is mounted for the whole 94 s and merely `visibility: hidden`
 * outside its window, exactly like the 17 pages. Mounting on demand would put
 * a decode on the critical path of a page turn.
 *
 * The layer is inert markup; buildFlyLayer resolves it by `data-fly` and owns
 * the animation, so the lab and the player share one implementation.
 */
import FlyObject from './FlyObject.vue'
import { FLIGHTS } from '@/story/flyAssets.js'

defineProps({
  /** Override for the lab; defaults to the whole measured table. */
  flights: { type: Array, default: () => FLIGHTS },
})
</script>
