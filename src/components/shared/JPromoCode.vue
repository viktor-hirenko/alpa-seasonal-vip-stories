<template>
  <div class="j-promo">
    <span class="j-promo__label">{{ label }}</span>
    <span class="j-promo__code">{{ code }}</span>
  </div>
</template>

<script setup>
/**
 * Promo code display. NO Figma reference exists for this: the Gift page's
 * "Icon_Promocode" node (21945:3038) is an empty 1216x1216 placeholder with
 * no fill in every variant checked, and 31-pages.md's open question 6
 * concludes the real promo code + button most likely live in `.stage__ui`
 * over the journal, not on the page. This is a provisional design built
 * from the project's existing chip/tile tokens ($chip-bg, $accent,
 * $font-stack) so the `promocode` query param has somewhere to render
 * meanwhile — replace styling here once the designer delivers the real
 * artwork, do not treat these numbers as measured.
 */
defineProps({
  code: { type: String, default: 'ANDROMEDA25' },
  label: { type: String, default: 'Your gift code' },
})
</script>
