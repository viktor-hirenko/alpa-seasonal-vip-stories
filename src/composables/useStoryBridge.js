/**
 * Parent-frame bridge. Ported from Thor verbatim in behaviour: the story runs
 * in an iframe on the product domain, reports lifecycle events up, and hands
 * navigation to the parent rather than trying to navigate itself.
 */
export function useStoryBridge({ endLink }) {
  const notify = message => {
    try {
      window.parent?.postMessage({ source: 'alpa-vip-stories', message }, '*')
    } catch {
      /* cross-origin parent: nothing we can do, and nothing that should break playback */
    }
  }

  const goToLink = () => {
    const url = endLink?.value
    if (!url) return
    try {
      window.parent.location.href = url
    } catch {
      window.location.href = url
    }
  }

  const getGift = () => {
    notify('bonuses_btn')
    goToLink()
  }

  const closeStory = () => {
    notify('close')
    if (endLink?.value) goToLink()
  }

  return { notify, getGift, closeStory }
}
