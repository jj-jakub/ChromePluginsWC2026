// World Cup Overlay — content script.
// Injects an isolated widget into the top-right corner of every page and renders the
// "what to show" state provided by the background service worker.
//
// Scaffold stage: builds the container + asks the worker for state + renders minimal text.
// Rich state rendering and the collapse/hide controls arrive in a later commit.

(() => {
  const ROOT_ID = "wc-overlay-root";
  if (document.getElementById(ROOT_ID)) return; // already injected (e.g. SPA re-run)

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "wc-overlay";
  root.innerHTML = `
    <div class="wc-card">
      <div class="wc-head">
        <span class="wc-title">FIFA World Cup</span>
      </div>
      <div class="wc-body" id="wc-body">Loading…</div>
    </div>
  `;
  (document.body || document.documentElement).appendChild(root);

  const body = root.querySelector("#wc-body");

  function render(state) {
    if (!state || !state.match) {
      body.textContent = "No data.";
      return;
    }
    const m = state.match;
    body.textContent = `${m.home} vs ${m.away}`;
  }

  chrome.runtime.sendMessage({ type: "WC_GET_STATE" }, (resp) => {
    if (chrome.runtime.lastError) {
      body.textContent = "Overlay error.";
      return;
    }
    if (resp && resp.ok) render(resp.state);
    else body.textContent = "No data.";
  });
})();
