// World Cup Overlay — background service worker (MV3, module).
//
// Responsibilities (filled in over the next commits):
//   - fetch World Cup data from TheSportsDB (host_permissions bypass page CORS)
//   - compute a single "what to show" state (live / upcoming / result)
//   - cache it and answer WC_GET_STATE messages from content scripts
//
// Scaffold stage: returns a static placeholder so the overlay shell renders end-to-end.

const WC = {
  // Message types shared with the content script.
  GET_STATE: "WC_GET_STATE",
};

function placeholderState() {
  return {
    mode: "upcoming",
    updatedAt: Date.now(),
    match: {
      league: "FIFA World Cup",
      home: "Team A",
      away: "Team B",
      kickoff: null,
      note: "Scaffold placeholder — live data wired up in a later commit.",
    },
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === WC.GET_STATE) {
    sendResponse({ ok: true, state: placeholderState() });
    return true; // keep the channel open for the (sync, but future-async) response
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[worldcup-overlay] installed");
});
