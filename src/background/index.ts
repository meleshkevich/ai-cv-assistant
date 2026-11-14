// Service worker: manages extension lifecycle and side panel behavior.
// All extraction logic lives in the side panel — this worker stays minimal.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => console.error('[background] setPanelBehavior failed:', err))
})
