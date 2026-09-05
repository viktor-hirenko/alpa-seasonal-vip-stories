<template>
  <div v-show="visible" class="story-outro">
    <p class="j-heading">
      <span v-for="(line, i) in lines" :key="i" class="j-heading__line">{{ line }}</span>
    </p>
  </div>
</template>

<script setup>
/**
 * "See you in the next issue. To the stars!" — storyboard frame 25, node
 * 21770:4871.
 *
 * A SCENE layer, not a page. By the time this shows, `journalDissolve` has faded
 * the journal out, so there is no page left to put it on; it lives in
 * `.stage__ui` for the same reason the two buttons do (see StoryCta.vue), that
 * being the one layer with no perspective ancestor.
 *
 * `v-show`, never `v-if`: `resolveTargets` takes this element once at mount and
 * hands it to the `outroText` preset, so unmounting it would leave GSAP
 * animating a detached node.
 *
 * The type is `.j-heading` (21770:2960) with nothing overridden — Rubik 800 at
 * 96 / 1.08, white, uppercase, `$heading-shadow` — because that IS what the
 * mock's text node asks for. Restating it here would be a second copy of the
 * same four numbers.
 *
 * LINES ARE THE TRANSLATOR'S, not the layout's. English carries the mock's own
 * three-way break, which is authored into the Figma node rather than produced
 * by wrapping; the other three locales carry the two sentences the copy sheet
 * gives and wrap inside the 970-wide box on their own. Inventing a break for a
 * language none of us reads is how a heading ends up split mid-clause.
 */
defineProps({
  visible: { type: Boolean, default: false },
  /** Lines for the active locale — `ui.outro` in the i18n files. */
  lines: { type: Array, required: true },
})
</script>
