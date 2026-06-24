// Background service worker (MV3). Runs network fetches, caching, and chrome.alarms here —
// host_permissions let fetches bypass page CORS. Replace with your plugin's logic.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[template] installed");
});
