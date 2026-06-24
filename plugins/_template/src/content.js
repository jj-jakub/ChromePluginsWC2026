// Content script — injected into matching pages. Keep injected DOM namespaced and isolated
// (unique id prefix, high z-index, `all: initial` reset) so it can't clash with the host page.

console.log("[template] content script loaded");
