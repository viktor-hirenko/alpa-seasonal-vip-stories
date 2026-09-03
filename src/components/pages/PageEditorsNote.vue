<template>
  <PageChrome>
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-907, 1032, 2759, 1793)">
        <img :src="galaxy" alt="" :style="{ width: du(2759), height: du(1793) }" />
      </div>
      <div class="page__art art-box" :style="artBox(436, -412, 1270.054, 1116.755)">
        <img :src="planets" alt="" :style="artImg(1080, 670, -150.33)" />
      </div>
    </template>

    <template #art>
      <div class="page__fade" />
    </template>

    <div class="en__chip">
      <img class="en__chip-dot" :src="dot" alt="" />
      <span>Editor&rsquo;s Note</span>
    </div>

    <p class="en__headline">The Andromeda issue is ready.<br />And your VIP story made the cover.</p>

    <JHeading :text="['Ready', 'to take', 'a look?']" :top="1223" :size="96" align="left" :left="65.39" :line-height="1.0417" />

    <!-- Mini cover card (21770:2827): the same Cover face at ~0.38 scale, with
         its own layout (no "Your season story is ready" line — cut for space)
         rather than a strict scale of PageCover.vue. See artBox.js for why an
         outer box + rotated inner is the right shape. The slots_id-1 backdrop
         texture is skipped here: at this size, inside an already-scaled-down
         page pose, it is imperceptible — not worth a second oversized asset. -->
    <div class="page__art art-box en__mini" :style="artBox(734.13, 1010, 628.699, 763.377)">
      <div class="en__mini-card">
        <div class="en__mini-edge" />
        <div class="en__mini-body">
          <div class="en__mini-fade1" />
          <p class="en__mini-vip-club">VIP Club</p>
          <div class="en__mini-glow-blob" />
          <div class="en__mini-astronaut" />
          <div class="page__art art-box" :style="artBox(135.97, 107.99, 294.695, 409.049)">
            <img class="en__mini-screen" :src="ellipse" alt="" :style="artImg(251.733, 382.24, 6.71)" />
          </div>
          <div class="en__mini-fade2" />
          <div class="en__mini-journal"><span>Journal</span></div>
          <p class="en__mini-issue">
            <span>Andromeda</span>
            <span>Issue</span>
          </p>
          <p class="en__mini-featuring">Featuring:</p>
          <p class="en__mini-name">{{ playerName }}</p>
        </div>
      </div>
    </div>
  </PageChrome>
</template>

<script setup>
/**
 * Editor's Note. Figma set 21770:2820, EN body 21770:2821.
 * Slide frame 8, cut at 11.07 s. Dynamic: `name` (via the mini cover).
 *
 * A normal data page (canonical PageChrome skeleton) except the galaxy/planets
 * backdrop sits at its OWN offsets — not byte-identical to Money Talks — so it
 * is placed directly here rather than through PageBackdrop.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JHeading from '@/components/shared/JHeading.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import galaxy from '@/assets/pages/galaxy-3.webp'
import planets from '@/assets/pages/planets-4.webp'
import dot from '@/assets/pages/editors-note-dot.svg'
import ellipse from '@/assets/pages/cover-ellipse.svg'

defineProps({
  playerName: { type: String, default: 'Mariannaa!' },
})

const du = n => `calc(${+n.toFixed(3)} * var(--u))`
</script>
