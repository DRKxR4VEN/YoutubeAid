/**
 * Youtube Aid — performance bridge (MAIN world, document_start)
 *
 * "Chế độ hiệu năng" has to quiet YouTube's own animations, and most of them
 * live inside shadow roots, which a content script's stylesheet cannot reach.
 * This runs in the page's world, so it can hand one shared stylesheet to every
 * shadow root the moment it is created.
 *
 * Durations collapse to 1ms instead of `none`: YouTube listens for
 * transitionend/animationend to finish menus and dialogs, and a real transition
 * still fires those events.
 */
(function () {
  'use strict';

  if (window.__ytAidPerfBridge) return;
  window.__ytAidPerfBridge = true;

  const RULES = [
    '*, *::before, *::after {',
    '  animation-duration: 1ms !important;',
    '  animation-delay: 0ms !important;',
    '  animation-iteration-count: 1 !important;',
    '  transition-duration: 1ms !important;',
    '  transition-delay: 0ms !important;',
    '  scroll-behavior: auto !important;',
    '}'
  ].join('');

  const REQUEST_EVENT = 'yt-aid-perf-mode';

  let sheet = null;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(RULES);
  } catch (e) {
    sheet = null;
  }

  let enabled = false;
  let patched = false;
  let nativeAttachShadow = null;

  function hasSheet(root) {
    const list = root.adoptedStyleSheets;
    if (!sheet || !list || typeof list.includes !== 'function') return false;
    return list.includes(sheet);
  }

  // adoptedStyleSheets is a frozen array: replacing it is the only write.
  function adopt(root) {
    if (!sheet || !root || hasSheet(root)) return;
    try {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } catch (e) { /* older engine or a locked root — nothing else to try */ }
  }

  function release(root) {
    if (!sheet || !root || !hasSheet(root)) return;
    try {
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((item) => item !== sheet);
    } catch (e) { /* ignore */ }
  }

  function patchAttachShadow() {
    if (patched || !Element.prototype.attachShadow) return;
    patched = true;
    nativeAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = nativeAttachShadow.call(this, init);
      if (enabled) adopt(root);
      return root;
    };
  }

  function restoreAttachShadow() {
    if (!patched) return;
    patched = false;
    // Put the browser's own method back: the wrapper only ever added the sheet.
    if (nativeAttachShadow) Element.prototype.attachShadow = nativeAttachShadow;
  }

  // Roots that already exist: walk the light DOM and touch every shadow root.
  function forEachShadowRoot(callback) {
    const nodes = document.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i++) {
      const root = nodes[i].shadowRoot;
      if (root) callback(root);
    }
  }

  function setEnabled(next) {
    const on = !!next && !!sheet;
    if (on === enabled) return;
    enabled = on;

    if (on) {
      patchAttachShadow();
      forEachShadowRoot(adopt);
    } else {
      restoreAttachShadow();
      forEachShadowRoot(release);
    }
  }

  document.addEventListener(REQUEST_EVENT, (event) => {
    setEnabled(event.detail && event.detail.enabled);
  });

  // The content script may already have decided before this listener existed.
  if (document.body && document.body.classList.contains('yt-aid-no-animations')) {
    setEnabled(true);
  }
})();
