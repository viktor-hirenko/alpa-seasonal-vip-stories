<template>
  <PageChrome class="pf" :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <img class="page__art pf__warp" :src="warp" alt="" />
    </template>

    <JHeading text="Keep your course." :top="737.5" :size="90" />
    <p class="pf__subhead">
      <span>More stellar</span>
      <span>stops await.</span>
    </p>
  </PageChrome>
</template>

<script setup>
/**
 * Final. Figma set 21770:4464, EN body 21770:4465.
 * Slide frames 23-24 (the recede), cut at 83.03 s. Static — no dynamic fields.
 *
 * The right-edge asset is reused here mirrored and stretched into a full
 * border frame around all four sides (inset 32.09% sides / 1.13% top-bottom)
 * instead of PageChrome's usual right-only sliver — overridden via the `.pf`
 * class PageChrome falls through onto its root, rather than adding a prop
 * for a shape only this one page uses.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JHeading from '@/components/shared/JHeading.vue'
import warp from '@/assets/pages/final-warp.webp'
</script>
