// Options page controller. Reads/writes the single settings object in chrome.storage.sync, run
// through the pure self.WC.settings.normalize() gatekeeper so the stored value is always valid.
// Writes are debounced (sliders fire fast; chrome.storage.sync has per-minute write quotas).

(() => {
  const { KEY, normalize } = self.WC.settings;
  const $ = (id) => document.getElementById(id);

  let current = normalize(null);
  let writeTimer = null;
  let statusTimer = null;

  const refreshLabel = (v) => (v === 1 ? "every minute" : `every ${v} min`);

  function reflect(s) {
    document.querySelectorAll('input[name="corner"]').forEach((r) => {
      r.checked = r.value === s.corner;
    });
    $("startMinimized").checked = s.startMinimized;
    $("refreshMins").value = String(s.refreshMins);
    $("refreshOut").textContent = refreshLabel(s.refreshMins);
  }

  function collect() {
    const corner = (document.querySelector('input[name="corner"]:checked') || {}).value;
    return normalize({
      ...current,
      corner,
      startMinimized: $("startMinimized").checked,
      refreshMins: Number($("refreshMins").value),
    });
  }

  function flash(msg) {
    const el = $("status");
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.textContent = "";
    }, 1500);
  }

  function persist() {
    try {
      chrome.storage.sync.set({ [KEY]: current }, () => {
        flash(chrome.runtime.lastError ? "Couldn't save — try again" : "Saved");
      });
    } catch (_) {
      flash("Couldn't save — try again");
    }
  }

  function onChange() {
    current = collect();
    reflect(current); // echo back the clamped/whitelisted value
    clearTimeout(writeTimer);
    writeTimer = setTimeout(persist, 400);
  }

  function load() {
    try {
      chrome.storage.sync.get(KEY, (got) => {
        current = normalize(got && got[KEY]);
        reflect(current);
      });
    } catch (_) {
      reflect(current);
    }
  }

  document.addEventListener("input", (e) => {
    if (e.target.matches('input[name="corner"], #startMinimized, #refreshMins')) onChange();
  });
  // Adopt changes made elsewhere (e.g. the overlay's own controls) while this tab is open.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[KEY]) {
        current = normalize(changes[KEY].newValue);
        reflect(current);
      }
    });
  } catch (_) {}

  load();
})();
