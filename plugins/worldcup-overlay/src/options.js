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

  function reflect(s, includeText = true) {
    document.querySelectorAll('input[name="corner"]').forEach((r) => {
      r.checked = r.value === s.corner;
    });
    $("theme").value = s.theme;
    $("startMinimized").checked = s.startMinimized;
    $("refreshMins").value = String(s.refreshMins);
    $("refreshOut").textContent = refreshLabel(s.refreshMins);

    document.querySelectorAll('input[name="siteMode"]').forEach((r) => {
      r.checked = r.value === s.siteMode;
    });
    if (includeText) $("siteRules").value = s.siteRules.join("\n"); // don't clobber mid-typing

    $("notifyEnabled").checked = s.notify.enabled;
    $("notifyFavoritesOnly").checked = s.notify.favoritesOnly;
    $("notifyKickoff").checked = s.notify.kickoff;
    $("notifyGoals").checked = s.notify.goals;
    $("notifyFullTime").checked = s.notify.fullTime;
    $("notifyLead").value = String(s.notify.leadMins);
    $("notifyLeadOut").textContent = `${s.notify.leadMins} min`;
  }

  function collect() {
    const corner = (document.querySelector('input[name="corner"]:checked') || {}).value;
    return normalize({
      ...current,
      corner,
      theme: $("theme").value,
      startMinimized: $("startMinimized").checked,
      refreshMins: Number($("refreshMins").value),
      siteMode: (document.querySelector('input[name="siteMode"]:checked') || {}).value,
      siteRules: $("siteRules").value.split("\n"),
      notify: {
        ...current.notify,
        enabled: $("notifyEnabled").checked,
        favoritesOnly: $("notifyFavoritesOnly").checked,
        kickoff: $("notifyKickoff").checked,
        goals: $("notifyGoals").checked,
        fullTime: $("notifyFullTime").checked,
        leadMins: Number($("notifyLead").value),
      },
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
    reflect(current, false); // echo clamped controls, but leave the textarea as typed
    clearTimeout(writeTimer);
    writeTimer = setTimeout(persist, 400);
  }

  // Commit any pending debounced write before the page goes away, so a quick edit-then-close
  // isn't silently dropped.
  function flushPending() {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
      persist();
    }
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

  const FIELDS =
    'input[name="corner"], #theme, #startMinimized, #refreshMins, input[name="siteMode"], #siteRules, ' +
    "#notifyEnabled, #notifyFavoritesOnly, #notifyKickoff, #notifyGoals, #notifyFullTime, #notifyLead";
  document.addEventListener("input", (e) => {
    if (e.target.matches(FIELDS)) onChange();
  });
  // visibilitychange→hidden is the reliable teardown signal for extension pages; pagehide covers close.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPending();
  });
  window.addEventListener("pagehide", flushPending);
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
