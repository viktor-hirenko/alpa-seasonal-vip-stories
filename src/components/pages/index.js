import PageStub from './PageStub.vue'
import PageDaysInSpotlight from './PageDaysInSpotlight.vue'

/**
 * Page registry. The player never changes as pages land: anything not yet
 * registered falls through to PageStub.
 *
 * Keys are the page ids from src/story/slides.js.
 */
export const PAGE_COMPONENTS = {
  days_in_spotlight: PageDaysInSpotlight,
}

/** @param {string} page page id from slides.js */
export const resolvePage = page => PAGE_COMPONENTS[page] || PageStub

export { PageStub }
