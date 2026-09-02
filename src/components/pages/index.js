import PageStub from './PageStub.vue'

/**
 * Page registry. Phase 2 replaces entries here one at a time as the real page
 * components land, so the player never has to change: anything not yet built
 * falls through to PageStub.
 *
 * Keys are the page ids from src/story/slides.js.
 */
export const PAGE_COMPONENTS = {
  // cover:            () => import('./PageCover.vue'),
  // editors_note:     () => import('./PageEditorsNote.vue'),
  // ...
}

export const resolvePage = () => PageStub

export { PageStub }
