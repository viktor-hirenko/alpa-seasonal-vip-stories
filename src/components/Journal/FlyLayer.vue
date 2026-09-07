<template>
  <div class="fly-layer">
    <!-- THE ROOM'S LIGHT ON THE METAL. V-05 / V-06, measured 2026-09-07.
         Why it lives here rather than in a stylesheet: `filter: url(#id)` is a
         reference into the DOCUMENT, and a filter reference that resolves to
         nothing does not degrade to `none` — the element is dropped. Keeping
         the defs inside the layer that uses them means the two cannot be
         mounted apart, in the player or in the lab.
         The matrix itself is explained in _fly.scss, next to the property. -->
    <svg class="fly-layer__defs" aria-hidden="true" focusable="false">
      <filter id="fly-room-light">
        <feColorMatrix
          type="matrix"
          color-interpolation-filters="sRGB"
          values="1      0      0      0 0
                  0      1      0      0 0
                  0.0595 0.2003 1.0202 0 0
                  0      0      0      1 0"
        />
      </filter>
    </svg>
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
