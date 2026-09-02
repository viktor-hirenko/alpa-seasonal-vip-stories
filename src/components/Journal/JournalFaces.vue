<template>
  <!--
    Six faces of the W x H x T box. All transforms are static CSS (_journal.scss);
    GSAP may only touch `opacity` here. See ADR-0005.

    Order in the DOM is irrelevant: `preserve-3d` depth-sorts, and there are
    deliberately no z-index values (a z-index inside a preserve-3d context
    creates a stacking context that overrides the depth sort — that is the
    classic "spine in front of the page" bug).
  -->
  <div class="jedge jedge--top" aria-hidden="true" />
  <div class="jedge jedge--bottom" aria-hidden="true" />
  <div class="jedge jedge--spine" aria-hidden="true" />
  <div class="jedge jedge--fore" aria-hidden="true" />

  <div class="jface jface--back" aria-hidden="true">
    <slot name="back" />
  </div>

  <div class="jface jface--front">
    <div class="journal-pages">
      <slot />
    </div>
  </div>
</template>
