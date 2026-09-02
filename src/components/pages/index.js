import PageStub from './PageStub.vue'
import PageDaysInSpotlight from './PageDaysInSpotlight.vue'
import PageSeasonalPower from './PageSeasonalPower.vue'
import PageMoneyTalks from './PageMoneyTalks.vue'
import PageBonusReport from './PageBonusReport.vue'
import PageSportsDesk from './PageSportsDesk.vue'

/**
 * Page registry. The player and the lab both resolve through this, so a page
 * lands by adding one line here — nothing else changes. Anything not yet
 * registered falls through to PageStub.
 *
 * Keys are the page ids from src/story/slides.js.
 */
export const PAGE_COMPONENTS = {
  days_in_spotlight: PageDaysInSpotlight,
  seasonal_power: PageSeasonalPower,
  money_talks: PageMoneyTalks,
  bonus_report: PageBonusReport,
  sports_desk: PageSportsDesk,
}

/** @param {string} page page id from slides.js */
export const resolvePage = page => PAGE_COMPONENTS[page] || PageStub

export { PageStub }
