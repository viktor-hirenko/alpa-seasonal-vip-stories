import { ref } from 'vue'

/**
 * WHEN THE PAGES MAY FETCH THEIR ART.
 *
 * One boolean, shared by every `JArt`. It is closed while the things the player
 * actually needs are still in flight — the stylesheet, the font, and above all
 * the first seconds of the tape — and opens once the story is running.
 *
 * ⚠️ IT IS NOT A LOADING STRATEGY, IT IS A QUEUE ORDER. Nothing is dropped;
 * everything still arrives. What changes is that 3.9 MB of page art no longer
 * races the video for the connection during the one window where the video is
 * the only thing on screen. Measured on the deployed build over 4G, the video
 * could not reach readyState 1 for more than ten seconds because of that race.
 *
 * ⚠️ AND IT MUST OPEN EVEN IF THE STORY NEVER STARTS. A dead video, a refused
 * autoplay, a buffer that never fills — in every one of those the player is
 * looking at a page and it must have its art. `openArt` is therefore called
 * from the same places that give up on the video, and unconditionally by a
 * timer, so a page can never be left blank waiting on a gate.
 */
export const artIsOpen = ref(false)

/** Milliseconds after which the gate opens whatever else has happened. */
// ⚠️ EIGHT, NOT FOUR. With the art held back the story reaches its first frame
// in about 2.3 s over 4G, and `openArt` is called there — so this timer should
// only ever fire on a path where that never happens. At four seconds it was
// firing during a merely slow start and dumping 3.9 MB into the middle of it.
const FAILSAFE_MS = 8000

let failsafe = null

export const openArt = () => {
  if (failsafe) {
    clearTimeout(failsafe)
    failsafe = null
  }
  artIsOpen.value = true
}

/** Arm the guarantee. Idempotent; the first call is the one that counts. */
export const armArtGate = () => {
  if (artIsOpen.value || failsafe) return
  failsafe = setTimeout(openArt, FAILSAFE_MS)
}
