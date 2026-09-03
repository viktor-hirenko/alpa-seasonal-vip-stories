import PageStub from './PageStub.vue'
import PageDaysInSpotlight from './PageDaysInSpotlight.vue'
import PageSeasonalPower from './PageSeasonalPower.vue'
import PageMoneyTalks from './PageMoneyTalks.vue'
import PageBonusReport from './PageBonusReport.vue'
import PageSportsDesk from './PageSportsDesk.vue'
import PageVipStatus from './PageVipStatus.vue'
import PageTopSportSignal from './PageTopSportSignal.vue'
import PagePlayersPick from './PagePlayersPick.vue'
import PageHeadlineWin from './PageHeadlineWin.vue'
import PageMultiplierMoment from './PageMultiplierMoment.vue'
import PageCover from './PageCover.vue'
import PageEditorsNote from './PageEditorsNote.vue'
import PageFinal from './PageFinal.vue'
import PageSponsor from './PageSponsor.vue'
import PageSpaceMilk from './PageSpaceMilk.vue'
import PageJoke from './PageJoke.vue'
import PageGift from './PageGift.vue'

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
  vip_status: PageVipStatus,
  top_sport_signal: PageTopSportSignal,
  players_pick: PagePlayersPick,
  headline_win: PageHeadlineWin,
  multiplier_moment: PageMultiplierMoment,
  cover: PageCover,
  editors_note: PageEditorsNote,
  final: PageFinal,
  sponsor: PageSponsor,
  space_milk: PageSpaceMilk,
  joke: PageJoke,
  gift: PageGift,
}

/** @param {string} page page id from slides.js */
export const resolvePage = page => PAGE_COMPONENTS[page] || PageStub

export { PageStub }
