/**
 * Youtube Aid - Content Script
 * Manifest V3 Extension for YouTube
 * Minimalist native YouTube interface integration
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__YOUTUBE_AID_LOADED__) return;
  window.__YOUTUBE_AID_LOADED__ = true;

  // --- Shortcut Configuration ---
  const SHORTCUT_API = window.YtAidShortcuts || null;
  const SHORTCUT_ACTIONS = SHORTCUT_API
    ? SHORTCUT_API.ACTIONS
    : [
      { id: 'shorts', taps: 2 },
      { id: 'home', taps: 2 },
      { id: 'history', taps: 3 },
      { id: 'playlists', taps: 2 },
      { id: 'music', taps: 2 }
    ];
  const DEFAULT_SHORTCUT_KEYS = SHORTCUT_API
    ? { ...SHORTCUT_API.DEFAULT_KEYS }
    : { shorts: 's', home: 'h', history: 'h', playlists: 'p', music: 'm' };
  const DEFAULT_SHORTCUT_TAPS = SHORTCUT_API
    ? { ...SHORTCUT_API.DEFAULT_TAPS }
    : { shorts: 2, home: 2, history: 3, playlists: 2, music: 2 };

  // music.youtube.com only reuses the shortcut engine. Everything else in this
  // script targets the www DOM / player stack and must stay off Music.
  const IS_MUSIC_SITE = window.location.hostname === 'music.youtube.com';

  // --- Localisation ---
  const I18N = window.YtAidI18n || null;
  // t() returns the string for the language picked in the dashboard, so the
  // whole UI can never mix Vietnamese and English.
  function T(text, params) {
    return I18N ? I18N.t(text, params) : text;
  }

  // Build-time pass for injected markup: translates text nodes and the
  // title / aria-label / placeholder attributes that exactly match a dictionary
  // entry. Keeps per-string call sites out of the HTML templates.
  function localizeTree(root) {
    if (!I18N || !root || !root.nodeType) return root;
    const scope = root;
    if (scope.nodeType === 1) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('script, style, textarea')) return NodeFilter.FILTER_REJECT;
          return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        const raw = node.nodeValue;
        const trimmed = raw.trim();
        const next = I18N.t(trimmed);
        if (next !== trimmed) node.nodeValue = raw.replace(trimmed, next);
      }
    }
    const elements = scope.querySelectorAll('[title], [aria-label], [placeholder]');
    const all = scope.nodeType === 1 ? [scope, ...elements] : elements;
    for (const el of all) {
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const next = I18N.t(value);
        if (next !== value) el.setAttribute(attr, next);
      }
    }
    return root;
  }

  // --- Configuration & Default Settings ---
  const DEFAULT_SETTINGS = {
    language: 'vi',
    enableLoop: true,
    enableShortcuts: true,
    enableCopyButtons: true,
    enableCleanLink: true,
    enableToasts: true,
    enableSelectionCopy: true,
    enableAutoPasteSearch: true,
    enableAutoPasteReplace: true,
    enableThumbnailDownload: true,
    enableMediaDownload: true,
    enableAdSkip: true,
    enableHideAds: true,
    enableShortsAutoScroll: false,
    enableAnimations: true,
    enableCloseGuard: false,
    hideButtonNames: false,
    audioPanelCollapsed: false,
    enableAutoQuality: true,
    autoQualityLevel: 'hd1080',
    extensionTheme: 'auto',
    audioBoost: 100,
    audioBass: 0,
    audioRate: 1,
    audioReverb: 0,
    uiScale: 100,
    randomVideo: { video: true, shorts: true, music: true, feed: true },
    shortcutKeys: { ...DEFAULT_SHORTCUT_KEYS },
    shortcutTaps: { ...DEFAULT_SHORTCUT_TAPS }
  };

  let settings = { ...DEFAULT_SETTINGS };

  // Build marker: lets a newer copy of the extension take over UI injected by
  // an older copy loaded from another folder.
  const EXT_VERSION = (() => {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return '';
    }
  })();

  // Photo frame + save arrow: reads as "save the thumbnail", so it never gets
  // confused with the plain download arrow used for MP4/MP3.
  const THUMBNAIL_ICON_SVG = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '<rect x="2.9" y="4.2" width="14.2" height="11.6" rx="2"/>',
    '<circle cx="7.4" cy="8.6" r="1.15" fill="currentColor" stroke="none"/>',
    '<path d="m4.4 13.9 3.2-3.2 2.9 2.9 2.3-2.3 3.6 3.6"/>',
    '<path d="M18.6 13.9v6.7m0 0-2.4-2.4M18.6 20.6l2.4-2.4"/>',
    '</svg>'
  ].join('');

  // Last text copied by the extension — feeds the auto-paste search box.
  // Mirrored to chrome.storage.local so it survives page reloads and is
  // shared between tabs; entries older than the TTL are ignored.
  const LAST_COPIED_KEY = 'lastCopied';
  const LAST_COPIED_TTL_MS = 15 * 60 * 1000;
  let lastCopiedText = '';
  let lastCopiedAt = 0;

  // The exact value this extension last wrote into the search box, so a later
  // copy can replace it (or append after it) instead of being ignored.
  let lastAutoPaste = { value: '', text: '' };

  // --- Shortcut Buffer State ---
  const CHORD_TIMEOUT_MS = 320;
  let shortcutKeymap = {};
  let shortcutKeySet = new Set();
  let keyBuffer = '';
  let keyBufferTimer = null;

  // Cache for the latest suggested Shorts video ID
  let cachedSuggestedShortsId = null;

  loadInitialState();

  function loadInitialState() {
    try {
      chrome.storage.local.get({ ...DEFAULT_SETTINGS, [LAST_COPIED_KEY]: null }, (items) => {
        void chrome.runtime?.lastError;
        const { [LAST_COPIED_KEY]: record, ...stored } = items || {};
        settings = { ...DEFAULT_SETTINGS, ...stored };
        // Always-on features: ignore any stale disabled value from storage.
        settings.enableCleanLink = true;
        settings.enableThumbnailDownload = true;
        settings.audioBoost = sanitizeAudioBoost(settings.audioBoost);
        settings.audioBass = sanitizeAudioBass(settings.audioBass);
        settings.uiScale = sanitizeUiScale(settings.uiScale);
        settings.autoQualityLevel = sanitizeQualityLevel(settings.autoQualityLevel);
        settings.extensionTheme = sanitizeThemeMode(settings.extensionTheme);
        // Slowed/sped and reverb are per-video edits: never restore a stale
        // value, every video starts at natural speed x1 and without reverb.
        settings.audioRate = 1;
        settings.audioReverb = AUDIO_REVERB_MIN;
        settings.randomVideo = sanitizeRandomVideoOptions(settings.randomVideo);
        if (I18N) I18N.setLanguage(settings.language);
        if (record && !restoreLastCopied(record)) safeRemoveStorage(LAST_COPIED_KEY);
        initExtension();
      });
    } catch (e) {
      // Extension was reloaded while this page stayed open — the chrome APIs
      // are gone, but the UI should still initialise with defaults.
      initExtension();
    }
  }

  // Listen for setting changes in real-time
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      const changedSettings = new Set();
      for (const [key, change] of Object.entries(changes)) {
        if (key === LAST_COPIED_KEY) {
          restoreLastCopied(change.newValue);
          continue;
        }
        if (key === 'shortcutKeys') {
          settings.shortcutKeys = sanitizeShortcutKeys(change.newValue);
          changedSettings.add(key);
          continue;
        }
        if (key === 'shortcutTaps') {
          settings.shortcutTaps = sanitizeShortcutTaps(change.newValue);
          changedSettings.add(key);
          continue;
        }
        if (key === 'audioBoost') {
          settings.audioBoost = sanitizeAudioBoost(change.newValue);
          syncAudioEngine();
          syncAudioUi();
          continue;
        }
        if (key === 'audioBass') {
          settings.audioBass = sanitizeAudioBass(change.newValue);
          syncAudioEngine();
          syncAudioUi();
          continue;
        }
        // Per-video edits live in this tab only; a stored value from another
        // tab (or an older build) must not overwrite the current video's edit.
        if (key === 'audioRate' || key === 'audioReverb') continue;
        if (key === 'randomVideo') {
          const next = sanitizeRandomVideoOptions(change.newValue);
          if (JSON.stringify(next) !== JSON.stringify(settings.randomVideo)) cancelRandomVideo();
          settings.randomVideo = next;
          syncRandomVideoUi();
          continue;
        }
        if (!(key in DEFAULT_SETTINGS)) continue;
        settings[key] = change.newValue === undefined ? DEFAULT_SETTINGS[key] : change.newValue;
        changedSettings.add(key);
      }

      if (changedSettings.size) applySettingUpdates(changedSettings);
    });
  } catch (e) { }

  function safeSetStorage(payload) {
    try {
      chrome.storage.local.set(payload, () => {
        void chrome.runtime?.lastError;
      });
    } catch (e) { }
  }

  function safeRemoveStorage(key) {
    try {
      chrome.storage.local.remove(key, () => {
        void chrome.runtime?.lastError;
      });
    } catch (e) { }
  }

  function sanitizeShortcutKeys(raw) {
    if (SHORTCUT_API) return SHORTCUT_API.sanitizeKeys(raw, settings.shortcutTaps);
    return { ...DEFAULT_SHORTCUT_KEYS, ...(raw && typeof raw === 'object' ? raw : {}) };
  }

  function sanitizeShortcutTaps(raw) {
    if (SHORTCUT_API) return SHORTCUT_API.sanitizeTaps(raw);
    return { ...DEFAULT_SHORTCUT_TAPS };
  }

  function rebuildShortcutKeymap() {
    if (!settings.enableShortcuts) {
      shortcutKeymap = {};
      shortcutKeySet = new Set();
      resetKeyBuffer();
      return;
    }

    const keys = sanitizeShortcutKeys(settings.shortcutKeys);
    settings.shortcutKeys = keys;
    const taps = sanitizeShortcutTaps(settings.shortcutTaps);
    settings.shortcutTaps = taps;

    const map = {};
    for (const action of SHORTCUT_ACTIONS) {
      const key = keys[action.id];
      if (!key) continue;
      const entry = map[key] || (map[key] = {});
      if (taps[action.id] === 3) entry.triple = action.id;
      else entry.double = action.id;
    }

    shortcutKeymap = map;
    shortcutKeySet = new Set(Object.keys(map));
  }

  // "HH" / "HHH" — used in shortcut toasts so they match the user's binding
  function shortcutSequence(actionId) {
    if (SHORTCUT_API) return SHORTCUT_API.sequenceLabel(settings.shortcutKeys, actionId, settings.shortcutTaps);
    const action = SHORTCUT_ACTIONS.find((item) => item.id === actionId);
    const key = settings.shortcutKeys && settings.shortcutKeys[actionId];
    const taps = settings.shortcutTaps && settings.shortcutTaps[actionId];
    const count = taps === 3 ? 3 : 2;
    return action && key ? String(key).repeat(count).toUpperCase() : '';
  }

  function applySettingUpdates(changedKeys = null) {
    const changed = (key) => !changedKeys || changedKeys.has(key);
    if (changed('shortcutKeys') || changed('shortcutTaps') || changed('enableShortcuts')) {
      rebuildShortcutKeymap();
    }

    if (changed('language')) {
      if (I18N) I18N.setLanguage(settings.language);
      refreshLocalizedUi();
    }

    settings.enableCleanLink = true;
    settings.enableThumbnailDownload = true;
    if (changed('uiScale')) applyUiScale();
    if (changed('extensionTheme')) applyExtensionTheme();
    if (changed('enableCloseGuard')) syncCloseGuard();
    if (IS_MUSIC_SITE) return;

    if (!settings.enableShortcuts) resetKeyBuffer();
    if (changed('enableAdSkip') || changed('enableHideAds')) syncAdSkipSettings();
    if (changed('enableHideAds')) {
      feedReflowSig = '';
      scheduleFeedReflow(0);
    }
    if (changed('hideButtonNames')) syncButtonNamesUi();
    if (changed('audioPanelCollapsed')) syncAudioUi();
    if (changed('enableLoop')) ensureVideoLoop();
    if ((changed('enableAutoQuality') || changed('autoQualityLevel')) && changedKeys) {
      // Initial load is handled by initAutoQuality; this path only reacts to a
      // real change made on the dashboard or in the tools menu.
      if (!settings.enableAutoQuality) void releaseAutoQuality();
      else void applyAutoQualityNow();
      syncToolbarState();
    }
    if (changed('enableCopyButtons')) {
      document.body.classList.toggle('yt-aid-hide-copy-buttons', !settings.enableCopyButtons);
      closeHomeFlyout();
    }
    if (!changedKeys) {
      document.body.classList.remove('yt-aid-hide-clean-link', 'yt-aid-hide-thumb-btn');
      syncAudioEngine();
      syncAudioUi();
    }
    if (changed('enableAnimations')) {
      document.body.classList.toggle('yt-aid-no-animations', !settings.enableAnimations);
      notifyPerfMode();
      syncToolbarState();
    }
    if (changed('enableLoop') || changed('enableSelectionCopy') ||
        changed('enableAutoPasteSearch') || changed('enableAutoPasteReplace')) {
      syncToolbarState();
    }
  }

  // Rebuilds every injected surface so the new language applies to all labels
  // at once — no element keeps a string from the previous language.
  function refreshLocalizedUi() {
    if (!I18N || IS_MUSIC_SITE) return;
    try { closeDropdown(); } catch (e) { }
    try { closeHomeFlyout(); } catch (e) { }
    try { closeFavoritePicker(); } catch (e) { }
    try { closeBookmarkPage(); } catch (e) { }
    try { closeBookmarkConfirm(false); } catch (e) { }
    try { closeThumbnailCropper(); } catch (e) { }
    try { closeMediaDownloadModal(); } catch (e) { }

    document.querySelectorAll([
      '.yt-aid-watch-toolbar', '.yt-aid-card-bar', '#yt-aid-channel-actions',
      '#yt-aid-guide-entry', '#yt-aid-mini-entry',
      '#yt-aid-random-home', '.yt-aid-home-trigger', '.yt-aid-home-flyout',
      '#yt-aid-bookmark-page', '.yt-aid-crop-overlay', '.yt-aid-bm-confirm-overlay',
      '.yt-aid-bm-favorite-picker', '#yt-aid-tools-menu', '#yt-aid-random-menu',
      '.yt-aid-dl-overlay'
    ].join(', ')).forEach((el) => el.remove());

    injectAllAreas();
    syncButtonNamesUi();
  }

  // ==========================================
  // 0B. GLOBAL UI SCALE + CLOSE GUARD
  // ==========================================
  // Five fixed steps, +10% each. A stepped list rather than a free number:
  // every surface is only ever rendered at a ratio that was actually checked.
  const UI_SCALE_STEPS = [90, 100, 110, 120, 130];
  const UI_SCALE_DEFAULT = 100;

  function sanitizeUiScale(value) {
    const wanted = Math.round(Number(value));
    if (!Number.isFinite(wanted)) return UI_SCALE_DEFAULT;
    return UI_SCALE_STEPS.reduce((best, step) => (
      Math.abs(step - wanted) < Math.abs(best - wanted) ? step : best
    ), UI_SCALE_DEFAULT);
  }

  function uiScalePercent() {
    return sanitizeUiScale(settings.uiScale);
  }

  // Every injected surface is zoomed by this factor (see the .yt-aid-ui-scaled
  // block in styles.css). zoom also multiplies the element's own left/top, so
  // anything positioned from viewport measurements has to be divided back
  // before it is written into the style.
  function unscalePx(visualPx) {
    return visualPx / (uiScalePercent() / 100);
  }

  function applyUiScale() {
    const percent = uiScalePercent();
    const root = document.documentElement;
    root.style.setProperty('--yta-ui-scale', String(percent / 100));
    root.classList.toggle('yt-aid-ui-scaled', percent !== UI_SCALE_DEFAULT);

    // Panels already on screen were placed for the old factor: re-place the
    // ones with an anchor we still hold and drop the rest.
    try { if (homeFlyout.open) positionHomeFlyout(); } catch (e) { }
    try { if (bookmarkPageOpen) positionBookmarkPage(); } catch (e) { }
    try { closeDropdown(); } catch (e) { }
    try { closeFavoritePicker(); } catch (e) { }
  }

  let closeGuardHandler = null;
  let leaveIntentHandler = null;
  let lastLeaveIntentAt = 0;
  let lastReloadIntentAt = 0;
  let lastOmniboxIntentAt = 0;

  // The prompt is meant for a click on the browser's X, so deliberate page
  // activity that unloads the document must not trigger it: same-tab link
  // clicks, reloads (F5 / Ctrl+R) and address-bar navigation (Ctrl+L).
  function watchLeaveIntent() {
    if (leaveIntentHandler) return;
    leaveIntentHandler = (event) => {
      const link = event.target?.closest?.('a[href]');
      if (!link) return;
      const sameTab = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
        !link.target && !link.hasAttribute('download');
      if (sameTab) lastLeaveIntentAt = Date.now();
    };
    document.addEventListener('click', leaveIntentHandler, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F5') {
        lastReloadIntentAt = Date.now();
        return;
      }
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        if (event.key === 'r' || event.key === 'R') lastReloadIntentAt = Date.now();
        else if (event.key === 'l' || event.key === 'L') lastOmniboxIntentAt = Date.now();
      }
    }, true);
  }

  function syncCloseGuard() {
    const on = !!settings.enableCloseGuard;
    if (on && !closeGuardHandler) {
      watchLeaveIntent();
      closeGuardHandler = (event) => {
        const now = Date.now();
        if (now - lastLeaveIntentAt < 3000) return;
        if (now - lastReloadIntentAt < 3000) return;
        if (now - lastOmniboxIntentAt < 3000) return;
        event.preventDefault();
        // Chrome only shows the chooser when the event is marked cancellable.
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', closeGuardHandler);
    } else if (!on && closeGuardHandler) {
      window.removeEventListener('beforeunload', closeGuardHandler);
      closeGuardHandler = null;
    }
  }

  // --- Main Initializer ---
  function initExtension() {
    createToastContainer();

    if (IS_MUSIC_SITE) {
      rebuildShortcutKeymap();
      initShortcutSystem();
      applySettingUpdates();
      return;
    }

    // Mỗi bước chạy riêng: một bước lỗi không làm mất các tính năng phía sau (nút random, v.v.).
    [
      initVideoLoopMonitor,
      initAudioEngine,
      initAutoQuality,
      initHighlightJump,
      initMiniplayer,
      initClipboardCopyTracking,
      rebuildShortcutKeymap,
      initShortcutSystem,
      initSelectionCopy,
      initSearchAutoPaste,
      initDropdownDismiss,
      initDOMObserver,
      initBookmarks,
      initAdSkipper,
      initFeedReflow,
      initShortsAutoScroll
    ].forEach((fn) => {
      try { fn(); } catch (e) { console.error('[YoutubeAid] init lỗi:', fn.name, e); }
    });
    try { applySettingUpdates(); } catch (e) { console.error('[YoutubeAid] applySettingUpdates lỗi:', e); }
  }

  // ==========================================
  // 0b. EXTENSION THEME
  // ==========================================
  // YouTube's own palette is never touched: we only mirror it into our own
  // class, so the injected UI can go light while the page stays dark (or the
  // other way round) without fighting YouTube's stylesheet.
  let youtubeThemeObserver = null;
  let systemSchemeListener = null;

  function sanitizeThemeMode(value) {
    return value === 'light' || value === 'dark' ? value : 'auto';
  }

  // YouTube marks <html> with `dark` / `light`; when the user picked "system
  // default" neither is present, so the OS scheme decides.
  function youtubePrefersDark() {
    const root = document.documentElement;
    if (root.hasAttribute('dark')) return true;
    if (root.hasAttribute('light')) return false;
    return !window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  function applyExtensionTheme() {
    const root = document.documentElement;
    const mode = sanitizeThemeMode(settings.extensionTheme);
    const dark = mode === 'auto' ? youtubePrefersDark() : mode === 'dark';
    root.classList.toggle('yta-dark', dark);
    root.classList.toggle('yta-light', !dark);
    watchYoutubeTheme(mode === 'auto');
  }

  // Only auto mode needs to keep watching; a forced theme is final.
  function watchYoutubeTheme(active) {
    if (!active) {
      if (youtubeThemeObserver) {
        youtubeThemeObserver.disconnect();
        youtubeThemeObserver = null;
      }
      if (systemSchemeListener) {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', systemSchemeListener);
        systemSchemeListener = null;
      }
      return;
    }
    if (!youtubeThemeObserver) {
      youtubeThemeObserver = new MutationObserver(() => {
        if (sanitizeThemeMode(settings.extensionTheme) === 'auto') applyExtensionTheme();
      });
      youtubeThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['dark', 'light', 'list-dark', 'list-light']
      });
    }
    if (!systemSchemeListener) {
      systemSchemeListener = () => {
        if (sanitizeThemeMode(settings.extensionTheme) === 'auto') applyExtensionTheme();
      };
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', systemSchemeListener);
    }
  }

  // ==========================================
  // 0c. PERFORMANCE MODE BRIDGE
  // ==========================================
  // styles.css can only quiet the light DOM. perf-bridge.js runs in the page
  // world and pushes the same rules into every shadow root, where most of
  // YouTube's hover and menu animations actually live.
  function notifyPerfMode(enabled = !settings.enableAnimations) {
    try {
      document.dispatchEvent(new CustomEvent('yt-aid-perf-mode', {
        detail: { enabled: !!enabled }
      }));
    } catch (e) { }
  }

  // ==========================================
  // 1. TOAST NOTIFICATION SYSTEM
  // ==========================================
  let toastContainer = null;

  function createToastContainer() {
    // A container left by an earlier content-script instance in this same
    // document must be adopted, otherwise showToast() keeps a null reference.
    const existing = document.getElementById('yt-aid-toast-container');
    if (existing) {
      toastContainer = existing;
      return;
    }
    toastContainer = document.createElement('div');
    toastContainer.id = 'yt-aid-toast-container';
    toastContainer.className = 'yt-aid-toast-container';
    document.body.appendChild(toastContainer);
  }

  function showToast(message, type = 'info', duration = 2400, action = null, onIconClick = null) {
    // An action toast (Undo) must appear even when regular toasts are off.
    if (!settings.enableToasts && !action) return;
    message = T(message);
    if (!toastContainer) createToastContainer();

    const toast = document.createElement('div');
    toast.className = `yt-aid-toast yt-aid-toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
    }

    toast.innerHTML = `
      <div class="yt-aid-toast-icon${onIconClick ? ' yt-aid-toast-clickable-icon' : ''}" title="${onIconClick ? T('Xem hàng đợi') : ''}">${iconSvg}</div>
      <div class="yt-aid-toast-message">${escapeHtml(message)}</div>
    `;

    if (onIconClick) {
      const iconEl = toast.querySelector('.yt-aid-toast-clickable-icon');
      if (iconEl) {
        iconEl.addEventListener('click', (e) => {
          e.stopPropagation();
          try { onIconClick(); } catch (err) { }
        });
      }
    }

    let hideTimer = 0;
    let removeTimer = 0;
    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
      if (!toast.isConnected) return;
      toast.classList.remove('yt-aid-toast-show');
      toast.classList.add('yt-aid-toast-hide');
      removeTimer = setTimeout(() => toast.remove(), settings.enableAnimations ? 250 : 0);
    }

    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'yt-aid-toast-action';
      actionBtn.textContent = T(action.label);
      actionBtn.addEventListener('click', () => {
        dismiss();
        try { action.onClick(); } catch (e) { console.error('[YoutubeAid] undo lỗi:', e); }
      });
      toast.appendChild(actionBtn);
    }

    // Keep the stack readable when actions fire in quick succession
    while (toastContainer.children.length >= 4) {
      toastContainer.removeChild(toastContainer.firstElementChild);
    }

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      if (!dismissed) toast.classList.add('yt-aid-toast-show');
    });

    hideTimer = setTimeout(dismiss, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==========================================
  // 2. AUTO VIDEO.LOOP = TRUE (never loops ads)
  // ==========================================
  // YouTube marks the player with these classes for the whole ad break, and
  // some ad formats only expose their UI without the classes. Both signals
  // keep loop off until the break finishes — otherwise the ad replays itself
  // instead of handing over to the requested video.
  const AD_PLAYER_CLASSES = ['ad-showing', 'ad-interrupting'];
  const AD_UI_SELECTORS = [
    '.ytp-ad-player-overlay',
    '.ytp-ad-preview-container',
    '.ytp-ad-skip-button-container',
    '.ytp-ad-duration-remaining',
    '.ytp-ad-simple-ad-badge'
  ].join(', ');
  // Ad pods briefly clear the ad markers between two ads; waiting a moment
  // before re-enabling loop avoids looping that next ad.
  const AD_RELEASE_DELAY = 500;

  let lastAdSeenAt = 0;
  // Declared here because the audio engine (section 3B) reads it: initExtension
  // can run before the ad module below is evaluated, and a `let` further down
  // would still be in its temporal dead zone at that point.
  let adSkipState = null; // { muted, rate } của video trước khi vào quảng cáo
  let loopPlayerObserver = null;
  let loopVideoObserver = null;
  let observedLoopPlayer = null;
  let loopWatchdogTimer = null;
  let lastLoopTickAt = 0;
  let loopGuardTimer = null;
  let loopEndTimer = null;
  let loopSyncFrame = 0;
  let loopBtnState = null;

  function getPlayerElement() {
    return document.getElementById('movie_player') ||
      document.querySelector('.html5-video-player');
  }

  function isAdPlaying() {
    const player = getPlayerElement();
    if (!player) return false;

    if (AD_PLAYER_CLASSES.some((cls) => player.classList.contains(cls))) {
      lastAdSeenAt = Date.now();
      return true;
    }

    try {
      const state = typeof player.getAdState === 'function'
        ? Number(player.getAdState())
        : 0;
      if (state > 0) {
        lastAdSeenAt = Date.now();
        return true;
      }
    } catch (e) { }

    for (const el of player.querySelectorAll(AD_UI_SELECTORS)) {
      if (el.hidden || !el.getClientRects().length) continue;
      const style = getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        lastAdSeenAt = Date.now();
        return true;
      }
    }
    return false;
  }

  function isLoopBlocked() {
    if (isAdPlaying()) return true;
    // A running clip recording owns the element until the end mark; letting
    // Auto Loop re-engage mid-recording would rewind the captured video.
    if (trimSession) return true;
    return Date.now() - lastAdSeenAt < AD_RELEASE_DELAY;
  }

  function observePlayerAdState() {
    const player = getPlayerElement();
    if (!player || player === observedLoopPlayer) return;

    if (!loopPlayerObserver) {
      loopPlayerObserver = new MutationObserver(scheduleLoopSync);
    } else {
      // Only one player matters at a time; dropping the old target lets the
      // detached player subtree be garbage collected after SPA navigation.
      loopPlayerObserver.disconnect();
    }
    observedLoopPlayer = player;
    loopPlayerObserver.observe(player, {
      attributes: true,
      attributeFilter: ['class']
    });

    // YouTube's own player writes media.loop (setLoop in its bundle) whenever
    // its loop/playlist state changes. Restoring on the attribute change is
    // synchronous with that write instead of waiting for the next watchdog
    // tick: a write landing in the last 250ms of a video would otherwise let
    // the playlist advance even with Auto Loop on.
    if (!loopVideoObserver) {
      loopVideoObserver = new MutationObserver(restoreLoopAfterYouTubeWrite);
    } else {
      loopVideoObserver.disconnect();
    }
    loopVideoObserver.observe(player, {
      attributes: true,
      attributeFilter: ['loop'],
      subtree: true
    });
  }

  function restoreLoopAfterYouTubeWrite() {
    if (!settings.enableLoop || !window.location.pathname.startsWith('/watch')) return;
    // Only the loop attribute triggers this, so a full check is cheap here.
    ensureVideoLoop();
  }

  // The player rewrites its class list in bursts; coalesce those into one
  // check per frame instead of running the ad probe on every mutation.
  function scheduleLoopSync() {
    if (loopSyncFrame) return;
    loopSyncFrame = requestAnimationFrame(() => {
      loopSyncFrame = 0;
      ensureVideoLoop();
    });
  }

  function collectPlayerVideos(includePageVideos) {
    if (includePageVideos) return new Set(document.querySelectorAll('video'));
    const videos = new Set();
    const player = getPlayerElement();
    if (player) player.querySelectorAll('video').forEach((video) => videos.add(video));
    document.querySelectorAll('video.video-stream').forEach((video) => videos.add(video));
    if (!videos.size) {
      const fallback = document.querySelector('video');
      if (fallback) videos.add(fallback);
    }
    return videos;
  }

  function applyLoopState(enabled) {
    collectPlayerVideos(!enabled).forEach((video) => {
      if (video.loop !== enabled) video.loop = enabled;
      if (!enabled) video.removeAttribute('loop');
      if (!video.__ytAidLoopBound) {
        video.__ytAidLoopBound = true;
        const enforceLoop = () => ensureVideoLoop();
        video.addEventListener('loadedmetadata', enforceLoop);
        video.addEventListener('play', enforceLoop);
        video.addEventListener('ended', enforceLoop);
      }
    });
  }

  // Always reflects the user's own choice. The ad-time forced pause is
  // deliberately invisible: the user only tracks whether Auto Loop is on/off.
  function syncLoopButton() {
    const loopBtn = document.getElementById('yt-aid-btn-toggle-loop');
    if (!loopBtn) {
      loopBtnState = null;
      return;
    }
    const wanted = !!settings.enableLoop;
    // The watchdog calls this four times a second; skip redundant DOM writes.
    if (loopBtnState && loopBtnState.btn === loopBtn && loopBtnState.wanted === wanted) return;
    loopBtnState = { btn: loopBtn, wanted };

    loopBtn.classList.toggle('active', wanted);
    loopBtn.setAttribute('aria-pressed', wanted ? 'true' : 'false');
    loopBtn.title = T(wanted ? 'Auto Loop đang bật' : 'Auto Loop đang tắt');
    const label = loopBtn.querySelector('span');
    if (label) label.textContent = T(wanted ? 'Autoloop: ON' : 'Autoloop: OFF');
  }

  function stopLoopWatchdog() {
    if (!loopWatchdogTimer) return;
    clearInterval(loopWatchdogTimer);
    loopWatchdogTimer = null;
  }

  // Restart the video just before it ends. The element's own loop flag is
  // normally enough, but YouTube clears it from its own player state and a
  // playlist advances on `ended`, so the natural end is the one moment Auto
  // Loop can still lose. Idle cost is two checks per second; the fast loop
  // only runs during the final two seconds of the video.
  const LOOP_END_MARGIN = 0.1;

  function getActiveLoopVideo() {
    const player = getPlayerElement();
    if (!player) return null;
    // A mid-roll ad pauses the main video; never seek while an ad plays.
    // Only the cheap signals here: this runs on a timer.
    if (AD_PLAYER_CLASSES.some((cls) => player.classList.contains(cls))) return null;
    try {
      if (typeof player.getAdState === 'function' && Number(player.getAdState()) > 0) return null;
    } catch (e) { }
    // The player can hold a second element for autoplay preloading; only the
    // one actually playing is the video that is about to end.
    const videos = player.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (!video.paused && video.readyState >= 2 && video.duration > 1) return video;
    }
    return null;
  }

  function startLoopGuard() {
    if (loopGuardTimer) return;
    loopGuardTimer = setInterval(() => {
      const video = getActiveLoopVideo();
      if (!video) {
        stopLoopEndGuard();
        return;
      }
      if (video.duration - video.currentTime <= 2) startLoopEndGuard();
      else stopLoopEndGuard();
    }, 500);
  }

  function startLoopEndGuard() {
    if (loopEndTimer) return;
    loopEndTimer = setInterval(() => {
      const video = getActiveLoopVideo();
      if (!video) {
        stopLoopEndGuard();
        return;
      }
      if (video.duration - video.currentTime <= LOOP_END_MARGIN) {
        video.currentTime = 0;
        stopLoopEndGuard();
      }
    }, 40);
  }

  function stopLoopEndGuard() {
    if (!loopEndTimer) return;
    clearInterval(loopEndTimer);
    loopEndTimer = null;
  }

  function stopLoopGuard() {
    stopLoopEndGuard();
    if (!loopGuardTimer) return;
    clearInterval(loopGuardTimer);
    loopGuardTimer = null;
  }

  // Ad markers can appear slightly after the ad element starts, so keep
  // re-checking while the user wants looping. This closes the short window
  // where loop=true could otherwise make a newly started ad replay itself.
  function startLoopWatchdog() {
    if (loopWatchdogTimer) return;
    loopWatchdogTimer = setInterval(() => {
      // The ad probe reads layout/style, so in a background tab run it once a
      // second instead of pausing: an ad break that ends while hidden must
      // still release loop before the video reaches its end.
      const now = Date.now();
      if (document.visibilityState === 'hidden' && now - lastLoopTickAt < 1000) return;
      lastLoopTickAt = now;
      if (!settings.enableLoop || !window.location.pathname.startsWith('/watch')) {
        stopLoopWatchdog();
        return;
      }
      ensureVideoLoop();
    }, 250);
  }

  function ensureVideoLoop() {
    observePlayerAdState();

    const onWatch = window.location.pathname.startsWith('/watch');
    const blocked = onWatch && isLoopBlocked();
    const enabled = onWatch && !!settings.enableLoop && !blocked;
    applyLoopState(enabled);
    syncLoopButton();

    if (settings.enableLoop && onWatch) {
      startLoopWatchdog();
    } else {
      stopLoopWatchdog();
    }

    if (enabled) {
      startLoopGuard();
    } else {
      stopLoopGuard();
    }
  }

  function initVideoLoopMonitor() {
    ensureVideoLoop();
    window.addEventListener('yt-navigate-finish', ensureVideoLoop);
    document.addEventListener('yt-page-data-updated', ensureVideoLoop);
    window.addEventListener('spfdone', ensureVideoLoop);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') ensureVideoLoop();
    });
  }

  // ==========================================
  // 3B. AUDIO ENGINE (boost, slowed/sped rate, reverb)
  // ==========================================
  const AUDIO_BOOST_MIN = 100;
  const AUDIO_BOOST_MAX = 150;
  const AUDIO_BOOST_STEP = 5;
  const AUDIO_RATE_MIN = 0.6;
  const AUDIO_RATE_MAX = 1.5;
  const AUDIO_RATE_STEP = 0.05;
  const AUDIO_REVERB_MIN = 0;
  const AUDIO_REVERB_MAX = 100;
  const AUDIO_REVERB_STEP = 5;
  const AUDIO_BASS_MIN = 0;
  const AUDIO_BASS_MAX = 100;
  const AUDIO_BASS_STEP = 5;
  // Low-shelf corner: below this the curve lifts. 120 Hz sits under the vocal
  // range, so the boost thickens the kick/bass without muddying the mix.
  const AUDIO_BASS_HZ = 120;
  const AUDIO_BASS_MAX_DB = 14;
  // Volume and bass are plain linear gains, so their product tops out at
  // 1.5 x 10^(14/20) = ~7.2. The soft-clipper has to represent peaks that high
  // inside the WaveShaper's fixed [-1, 1] input domain, hence the 1/SPAN scale
  // in front of it. Points must be odd so the table is exactly antisymmetric
  // around zero and cannot bias the signal.
  const AUDIO_CEILING_KNEE = 0.9;
  const AUDIO_CEILING_SPAN = 8;
  const AUDIO_CEILING_POINTS = 4097;

  let audioBoostState = null;
  let audioBoostGestureArmed = false;
  let audioBoostFailedVideo = null;
  let audioRateTrackedVideo = null;
  let audioRateApplied = 1;
  let audioVideoKey = '';
  let audioWatchdogTimer = 0;
  let audioWatchdogDelay = 0;
  let audioSyncTimer = 0;
  let speedMenuTouchAt = 0;

  const AUDIO_WATCHDOG_MS = 600;
  const AUDIO_WATCHDOG_HIDDEN_MS = 3000;
  const SPEED_MENU_WINDOW_MS = 1500;
  const SPEED_MENU_SELECTOR = '.ytp-settings-menu, .ytp-panel-menu, .ytp-menuitem, .ytp-settings-button';

  // YouTube's getVideoData() lives in the page world and a content script
  // cannot see it, so identity comes from markup YouTube keeps in sync:
  // ytd-watch-flexy[video-id] still names the loaded video while it keeps
  // playing in the home miniplayer, while the address bar has already gone to
  // "/" and would read as "a different video" and wipe the edit.
  function currentVideoKey() {
    const flexy = document.querySelector('ytd-watch-flexy[video-id]');
    let id = flexy ? flexy.getAttribute('video-id') : '';
    if (!id && location.pathname.startsWith('/watch')) {
      try {
        id = new URL(location.href).searchParams.get('v') || '';
      } catch (e) {
        id = '';
      }
    }
    // Scrolling between Shorts updates the URL, so the active reel reads as a
    // new video and its edit resets exactly like a watch-page one.
    if (!id && location.pathname.startsWith('/shorts/')) {
      const match = location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) id = match[1];
    }
    return id ? `id:${id}` : '';
  }

  function audioAdActive() {
    return !!adSkipState || isAdPlaying() || Date.now() - lastAdSeenAt < AD_RELEASE_DELAY;
  }

  function audioEffectsActive() {
    return audioRateValue() !== 1 ||
      audioReverbValue() > AUDIO_REVERB_MIN ||
      audioBassValue() > AUDIO_BASS_MIN ||
      audioBoostLevel() > AUDIO_BOOST_MIN;
  }

  function sanitizeAudioBoost(value) {
    const level = Math.round(Number(value));
    if (!Number.isFinite(level)) return AUDIO_BOOST_MIN;
    return Math.min(AUDIO_BOOST_MAX, Math.max(AUDIO_BOOST_MIN, level));
  }

  function sanitizeAudioRate(value) {
    const rate = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(rate)) return 1;
    return Math.min(AUDIO_RATE_MAX, Math.max(AUDIO_RATE_MIN, rate));
  }

  function sanitizeAudioReverb(value) {
    const level = Math.round(Number(value));
    if (!Number.isFinite(level)) return AUDIO_REVERB_MIN;
    return Math.min(AUDIO_REVERB_MAX, Math.max(AUDIO_REVERB_MIN, level));
  }

  function sanitizeAudioBass(value) {
    const level = Math.round(Number(value));
    if (!Number.isFinite(level)) return AUDIO_BASS_MIN;
    return Math.min(AUDIO_BASS_MAX, Math.max(AUDIO_BASS_MIN, level));
  }

  function audioBoostLevel() {
    return sanitizeAudioBoost(settings.audioBoost);
  }

  function audioRateValue() {
    return sanitizeAudioRate(settings.audioRate);
  }

  function audioReverbValue() {
    return sanitizeAudioReverb(settings.audioReverb);
  }

  function audioBassValue() {
    return sanitizeAudioBass(settings.audioBass);
  }

  // "x1.25" — trailing zeros dropped so 1.30 reads as x1.3 and 1.00 as x1.
  function formatAudioRateNumber(rate) {
    return `x${rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
  }

  // Custom-styled ranges draw their colored fill from a --p CSS var (0-100%),
  // so the UI has to keep it in sync with the value.
  function rangeFillPercent(value, min, max) {
    const span = max - min;
    if (!span) return 0;
    return ((value - min) / span) * 100;
  }

  function setRangeFill(el, value, min, max) {
    if (!el) return;
    // The value bubble is a sibling of the input, so the fill vars live on the
    // track wrapper and both children read them (custom properties inherit).
    const host = el.closest('.yt-aid-fx-track') || el;
    const percent = `${rangeFillPercent(value, min, max)}%`;
    if (host.style.getPropertyValue('--p') !== percent) host.style.setProperty('--p', percent);
    const fraction = (rangeFillPercent(value, min, max) / 100).toFixed(4);
    if (host.style.getPropertyValue('--pf') !== fraction) host.style.setProperty('--pf', fraction);
  }

  // Inline starting point for the markup, before any JS has a chance to run.
  function rangeVarsStyle(value, min, max) {
    const percent = rangeFillPercent(value, min, max);
    return `--p:${percent}%;--pf:${(percent / 100).toFixed(4)}`;
  }

  // The watch player and the miniplayer can both be in the DOM at once; the one
  // that is actually on screen is the one carrying the audio we have to edit.
  // Feed autoplay previews are a different video entirely and must never be
  // taken for the player, otherwise leaving for the home page silently moves
  // the edit onto a thumbnail that is not making the sound the user hears.
  const PREVIEW_VIDEO_SELECTOR = '#inline-player, ytd-video-preview, ytd-reel-item-renderer, ytd-shape';

  function playerVideos() {
    const videos = [...document.querySelectorAll('video.html5-main-video')].filter((v) => (
      v.isConnected && !v.closest(PREVIEW_VIDEO_SELECTOR)
    ));
    // The Shorts player has its own element that may not carry the main-video
    // class; the active reel is the one actually on screen.
    const reel = document.querySelector('ytd-reel-video-renderer[is-active] video');
    if (reel && reel.isConnected && !reel.closest(PREVIEW_VIDEO_SELECTOR) && !videos.includes(reel)) {
      videos.push(reel);
    }
    return videos;
  }

  function getBoostVideo() {
    const all = playerVideos();
    if (!all.length) {
      const fallback = document.querySelector('#movie_player video');
      return fallback && !fallback.closest(PREVIEW_VIDEO_SELECTOR) ? fallback : null;
    }
    // On Shorts the active reel is the only element that can be producing the
    // audio the user hears, so it wins over any other candidate.
    const reel = document.querySelector('ytd-reel-video-renderer[is-active] video');
    if (reel && all.includes(reel) && reel.getClientRects().length) return reel;
    const visible = all.filter((v) => v.getClientRects().length);
    return visible.find((v) => !v.paused) || visible[0] || all.find((v) => !v.paused) || all[0];
  }

  function scheduleAudioSync(delay = 60) {
    if (audioSyncTimer) return;
    audioSyncTimer = setTimeout(() => {
      audioSyncTimer = 0;
      syncAudioEngine();
    }, delay);
  }

  // YouTube swaps, empties and re-parents the media element on navigation,
  // miniplayer hand-off and ad breaks, and an emptied element silently returns
  // to x1 without firing ratechange. While an edit is active, keep checking.
  // A background tab is polled more slowly (its timers are throttled anyway)
  // but never dropped: audio keeps playing there and the edit must follow it.
  function startAudioWatchdog() {
    const delay = document.visibilityState === 'hidden' ? AUDIO_WATCHDOG_HIDDEN_MS : AUDIO_WATCHDOG_MS;
    if (audioWatchdogTimer && audioWatchdogDelay === delay) return;
    stopAudioWatchdog();
    audioWatchdogDelay = delay;
    audioWatchdogTimer = setInterval(syncAudioEngine, delay);
  }

  function stopAudioWatchdog() {
    if (!audioWatchdogTimer) return;
    clearInterval(audioWatchdogTimer);
    audioWatchdogTimer = 0;
    audioWatchdogDelay = 0;
  }

  function pageHasUserActivation() {
    try {
      return !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
    } catch (e) {
      return false;
    }
  }

  // Every video starts at natural speed and without reverb; the edit belongs to
  // the video being played, so it survives a miniplayer hand-off but never
  // carries over to the next one.
  function resetAudioForNewVideo() {
    if (audioAdActive()) return;
    const key = currentVideoKey();
    if (!key || key === audioVideoKey) return;
    audioVideoKey = key;
    settings.audioRate = 1;
    settings.audioReverb = AUDIO_REVERB_MIN;
    audioRateApplied = 1;
  }

  function handleAudioMediaReset() {
    scheduleAudioSync(40);
  }

  function trackAudioVideo(video) {
    if (audioRateTrackedVideo === video) return;
    if (audioRateTrackedVideo) {
      audioRateTrackedVideo.removeEventListener('ratechange', handleExternalRateChange);
      audioRateTrackedVideo.removeEventListener('loadedmetadata', handleAudioMediaReset);
      audioRateTrackedVideo.removeEventListener('play', handleAudioMediaReset);
    }
    audioRateTrackedVideo = video;
    video.addEventListener('ratechange', handleExternalRateChange);
    video.addEventListener('loadedmetadata', handleAudioMediaReset);
    video.addEventListener('play', handleAudioMediaReset);
  }

  // Slowed/sped-up the way music edits sound: pitch follows the rate instead
  // of being pitch-corrected, so x0.8 drops the key and x1.2 lifts it.
  function applyAudioRate() {
    // A recording runs at x1 so the clip length matches the marks; the slowed/
    // sped edit would stretch it.
    if (trimSession) return;
    const video = getBoostVideo();
    if (!video) return;
    trackAudioVideo(video);
    // An ad owns the rate while it plays: slowing it down or speeding it up
    // fights the player and the ad skipper.
    if (audioAdActive()) return;

    try {
      video.preservesPitch = false;
      video.webkitPreservesPitch = false;
      video.mozPreservesPitch = false;
    } catch (e) { }

    const rate = audioRateValue();
    audioRateApplied = rate;
    if (Math.abs(video.playbackRate - rate) > 0.001) video.playbackRate = rate;
  }

  // YouTube's own speed menu writes the same property, so a deliberate pick
  // there is adopted (clamped into our slider range). Everything else that
  // moves the rate - ad bursts, the player restoring its remembered speed after
  // an ad or a miniplayer hand-off - is answered by re-asserting our edit.
  function handleExternalRateChange() {
    if (trimSession) return;
    const video = audioRateTrackedVideo;
    if (!video) return;
    const rate = video.playbackRate;
    if (Math.abs(rate - audioRateApplied) < 0.001) return;
    // Ad skip drives this same <video> to 8x. Clamping that burst would pin the
    // slider to its x1.5 notch and leave the video sped up once the ad ends.
    if (audioAdActive() || rate > 2 || rate < 0.1) return;

    if (Date.now() - speedMenuTouchAt <= SPEED_MENU_WINDOW_MS) {
      const next = sanitizeAudioRate(rate);
      audioRateApplied = next;
      settings.audioRate = next;
      if (Math.abs(rate - next) > 0.001) video.playbackRate = next;
      syncAudioUi();
      return;
    }

    applyAudioRate();
  }

  function initSpeedMenuWatch() {
    const note = (e) => {
      const el = e.target;
      if (el instanceof Element && el.closest(SPEED_MENU_SELECTOR)) speedMenuTouchAt = Date.now();
    };
    document.addEventListener('pointerdown', note, true);
    document.addEventListener('click', note, true);
    // YouTube's own speed shortcuts are Shift+, and Shift+.
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === ',' || e.key === '.' || e.key === '<' || e.key === '>')) {
        speedMenuTouchAt = Date.now();
      }
    }, true);
  }

  // Piecewise curve for the soft-clipper stage. The signal arrives scaled by
  // 1/SPAN, so the curve maps that grid back with a slope of SPAN below the
  // knee: anything under AUDIO_CEILING_KNEE passes through bit-true (no level,
  // tone or dynamic change), while peaks above it saturate smoothly towards 1.0
  // and can never exceed it. The tail keeps the same slope as the linear part
  // at the knee, so a transient crossing it produces no discontinuity.
  function buildSoftClipCurve(knee, span, points) {
    const curve = new Float32Array(points);
    const tail = 1 - knee;
    for (let i = 0; i < points; i++) {
      const u = (2 * i - (points - 1)) / (points - 1);
      const x = u * span;
      const ax = Math.abs(x);
      curve[i] = ax <= knee
        ? x
        : Math.sign(x) * (knee + tail * Math.tanh((ax - knee) / tail));
    }
    return curve;
  }

  // Volume is a straight linear gain. Loudness protection lives entirely in the
  // fixed soft-clipper at the end of the chain, so raising bass or volume can
  // never re-tune a threshold/ratio that the other slider already set.
  function audioBoostGain(state) {
    const now = state.context.currentTime;
    const gain = Math.max(1, state.level / 100);

    state.gain.gain.cancelScheduledValues(now);
    state.gain.gain.setTargetAtTime(gain, now, 0.02);
  }

  function setAudioBoostLevel(state, level) {
    state.level = level;
    audioBoostGain(state);
    if (level > AUDIO_BOOST_MIN && state.context.state === 'suspended') {
      state.context.resume().catch(() => { });
    }
  }

  // Low-shelf lift in dB, 0% being a flat line. The lift is linear gain on the
  // low end only, so 100% is loud-but-clean: any peak the extra energy pushes
  // past the knee is absorbed by the soft-clipper downstream.
  function setAudioBass(state, level) {
    state.bassLevel = level;
    const now = state.context.currentTime;
    const dB = (level / AUDIO_BASS_MAX) * AUDIO_BASS_MAX_DB;
    state.bass.gain.cancelScheduledValues(now);
    state.bass.gain.setTargetAtTime(dB, now, 0.03);
    if (level > AUDIO_BASS_MIN && state.context.state === 'suspended') {
      state.context.resume().catch(() => { });
    }
  }

  function createReverbImpulse(context) {
    const seconds = 1.9;
    const decay = 2.8;
    const rate = context.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  // Parallel send: the dry signal stays untouched, the convolver tail is mixed
  // back in *ahead* of the ceiling, so boost, bass and reverb all share the one
  // absolute limit instead of the tail adding level on top of a limited dry
  // path. At 0% the send is disconnected so the convolver costs nothing.
  function setAudioReverb(state, level) {
    state.reverb = level;
    const on = level > AUDIO_REVERB_MIN;

    if (on && !state.reverbOn) {
      state.bass.connect(state.convolver);
      state.wet.connect(state.trim);
      state.reverbOn = true;
    } else if (!on && state.reverbOn) {
      try { state.bass.disconnect(state.convolver); } catch (e) { }
      try { state.wet.disconnect(); } catch (e) { }
      state.reverbOn = false;
    }

    if (state.reverbOn) {
      const now = state.context.currentTime;
      state.wet.gain.cancelScheduledValues(now);
      state.wet.gain.setTargetAtTime(level / 100, now, 0.05);
    }
    if (on && state.context.state === 'suspended') {
      state.context.resume().catch(() => { });
    }
  }

  // One context per page. A media element can only ever be claimed by a single
  // MediaElementSourceNode, so closing the context and building another one
  // would lock us out of the very element YouTube keeps reusing across
  // navigations and miniplayer hand-offs. Rebinding inside the same context is
  // the only safe way to follow the player.
  function createAudioGraph(video) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    let context;
    try {
      context = new AudioCtor();
    } catch (e) {
      return null;
    }

    const gain = context.createGain();
    gain.gain.value = 1;

    // Soft-clipper instead of a compressor: a static curve cannot pump or duck,
    // and it does not care which slider pushed the signal over the knee. SPAN
    // pre-scaling keeps the worst-case boosted peak inside the node's input
    // domain; the curve restores the level and caps the output at exactly 1.
    const trim = context.createGain();
    trim.gain.value = 1 / AUDIO_CEILING_SPAN;

    const clipper = context.createWaveShaper();
    clipper.curve = buildSoftClipCurve(AUDIO_CEILING_KNEE, AUDIO_CEILING_SPAN, AUDIO_CEILING_POINTS);
    clipper.oversample = '2x';

    const convolver = context.createConvolver();
    convolver.buffer = createReverbImpulse(context);
    const wet = context.createGain();
    wet.gain.value = 0;
    convolver.connect(wet);

    const bass = context.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = AUDIO_BASS_HZ;
    bass.gain.value = 0;
    bass.Q.value = 0.7071;

    // Source -> volume -> bass -> ceiling -> out. Bass sits before the clipper
    // so the extra low-end energy is what gets tamed; the reverb send is tapped
    // from the same point and returns into trim, so the wet tail is covered by
    // the ceiling too.
    gain.connect(bass);
    bass.connect(trim);
    trim.connect(clipper);
    clipper.connect(context.destination);

    audioBoostState = {
      video: null, context, source: null, gain, bass, trim, clipper, convolver, wet,
      reverbOn: false, level: AUDIO_BOOST_MIN, reverb: AUDIO_REVERB_MIN,
      bassLevel: AUDIO_BASS_MIN
    };
    return bindAudioSource(video) ? audioBoostState : null;
  }

  function bindAudioSource(video) {
    const state = audioBoostState;
    if (!state || !video) return false;
    if (state.source && state.video === video) return true;
    try {
      const source = state.context.createMediaElementSource(video);
      // Let go of the previous element only after the new one is routed, so a
      // player that is merely re-parented never loses its audio path.
      if (state.source) {
        try { state.source.disconnect(); } catch (e) { }
      }
      source.connect(state.gain);
      state.source = source;
      state.video = video;
      return true;
    } catch (e) {
      // Another extension already claimed this element; leave native audio be.
      return false;
    }
  }

  // Called from a real user gesture (slider) so the AudioContext is allowed to
  // start. Returns null when the video cannot be routed through Web Audio.
  function applyAudioGraphNow() {
    const video = getBoostVideo();
    if (!video) return null;
    // The marked element belongs to a player YouTube already detached; keeping
    // the reference would pin the old player tree in memory after navigation.
    if (audioBoostFailedVideo && !audioBoostFailedVideo.isConnected) audioBoostFailedVideo = null;
    if (audioBoostFailedVideo === video) return null;

    const level = audioBoostLevel();
    const reverb = audioReverbValue();
    const bass = audioBassValue();
    if (!audioBoostState && level <= AUDIO_BOOST_MIN && reverb <= AUDIO_REVERB_MIN && bass <= AUDIO_BASS_MIN) return null;

    const state = audioBoostState || createAudioGraph(video);
    if (!state || !bindAudioSource(video)) {
      audioBoostFailedVideo = video;
      showToast('Không áp được hiệu ứng âm thanh', 'warning', 3200);
      return null;
    }

    setAudioBoostLevel(state, level);
    setAudioBass(state, bass);
    setAudioReverb(state, reverb);
    return state;
  }

  // Prefer starting the context right away once the page already has a user
  // gesture; otherwise wait for one so audio is never routed into a suspended
  // context (which would leave the video silent).
  function armAudioBoostGesture() {
    if (audioBoostGestureArmed) return;
    audioBoostGestureArmed = true;

    const onGesture = () => {
      audioBoostGestureArmed = false;
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('touchstart', onGesture, true);
      applyAudioGraphNow();
    };

    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    document.addEventListener('touchstart', onGesture, true);
  }

  function syncAudioEngine() {
    if (IS_MUSIC_SITE) return;

    // Speed and pitch live on the media element, so they are supervised even
    // while the tab is in the background - that is exactly when a miniplayer
    // hand-off, an ad or the autoplay queue can silently reset them.
    resetAudioForNewVideo();
    applyAudioRate();
    syncAudioUi();

    const video = getBoostVideo();
    const level = audioBoostLevel();
    const reverb = audioReverbValue();
    const bass = audioBassValue();
    const hidden = document.visibilityState === 'hidden';

    if (video && audioBoostState) {
      // A media element routed through Web Audio can never return to the native
      // path, so "idle" means unity passthrough (still audible). Tearing the
      // graph down here would mute the video permanently, and a graph that kept
      // its old wet level would play reverb the toolbar already reads as off.
      if (bindAudioSource(video)) {
        setAudioBoostLevel(audioBoostState, level);
        setAudioBass(audioBoostState, bass);
        setAudioReverb(audioBoostState, reverb);
        if (!hidden && audioBoostState.context.state === 'suspended' && pageHasUserActivation()) {
          // Routed audio is silent while the context is suspended, even at
          // unity gain, so keep it running once the page has a gesture.
          audioBoostState.context.resume().catch(() => { });
        }
      } else {
        audioBoostFailedVideo = video;
      }
    } else if (!hidden && video && (level > AUDIO_BOOST_MIN || reverb > AUDIO_REVERB_MIN || bass > AUDIO_BASS_MIN)) {
      // Building a context waits for a visible tab: a hidden one cannot produce
      // the gesture, and the context would start suspended and route the video
      // into silence.
      if (pageHasUserActivation()) {
        applyAudioGraphNow();
      } else {
        armAudioBoostGesture();
      }
    }

    // Once audio is routed through Web Audio the graph needs supervision even
    // at unity gain: a player hand-off must not leave the video silent.
    if (audioEffectsActive() || audioBoostState) startAudioWatchdog();
    else stopAudioWatchdog();
  }

  // The four sliders share one shape, so the UI reads them from a table:
  // #yt-aid-audio-<id> is the range and #yt-aid-audio-<id>-value its label.
  const AUDIO_SLIDERS = [
    { id: 'boost', min: AUDIO_BOOST_MIN, max: AUDIO_BOOST_MAX, get: audioBoostLevel, show: (v) => `${v}%` },
    { id: 'bass', min: AUDIO_BASS_MIN, max: AUDIO_BASS_MAX, get: audioBassValue, show: (v) => `${v}%` },
    { id: 'rate', min: AUDIO_RATE_MIN, max: AUDIO_RATE_MAX, get: audioRateValue, show: formatAudioRateNumber },
    { id: 'reverb', min: AUDIO_REVERB_MIN, max: AUDIO_REVERB_MAX, get: audioReverbValue, show: (v) => `${v}%` }
  ];

  // Volume and bass are tone preferences and persist; rate and reverb are
  // per-video edits that never leave this tab.
  const AUDIO_CONTROL_BINDINGS = [
    { id: 'boost', key: 'audioBoost', min: AUDIO_BOOST_MIN, max: AUDIO_BOOST_MAX, sanitize: sanitizeAudioBoost, format: (v) => `${v}%`, persist: true },
    { id: 'bass', key: 'audioBass', min: AUDIO_BASS_MIN, max: AUDIO_BASS_MAX, sanitize: sanitizeAudioBass, format: (v) => `${v}%`, persist: true },
    { id: 'rate', key: 'audioRate', min: AUDIO_RATE_MIN, max: AUDIO_RATE_MAX, sanitize: sanitizeAudioRate, format: formatAudioRateNumber, persist: false },
    { id: 'reverb', key: 'audioReverb', min: AUDIO_REVERB_MIN, max: AUDIO_REVERB_MAX, sanitize: sanitizeAudioReverb, format: (v) => `${v}%`, persist: false }
  ];

  // The panel is used in the watch toolbar and as a Shorts dropdown, so the
  // markup lives here and every host binds the same handlers afterwards.
  // `collapsible` is only set by the watch toolbar: there the whole panel can be
  // folded into a single "Âm thanh" pill. The Shorts dropdown keeps the panel
  // always expanded because it already lives inside a menu.
  function buildAudioPanelMarkup(options = {}) {
    const collapseBtn = options.collapsible ? `
            <button type="button" class="yt-aid-audio-collapse" id="yt-aid-audio-collapse" title="${T('Thu gọn giao diện âm thanh')}" aria-label="${T('Thu gọn giao diện âm thanh')}" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
            </button>` : '';
    return `
      <div class="yt-aid-audio-panel" id="yt-aid-audio-panel">
        <div class="yt-aid-audio-head">
          <span class="yt-aid-audio-title">${T('Âm thanh')}</span>
          <span class="yt-aid-audio-flag" id="yt-aid-audio-flag">${T('Đang bật')}</span>
          <button type="button" class="yt-aid-audio-reset" id="yt-aid-audio-reset" title="${T('Đặt lại âm thanh về mặc định')}" aria-label="${T('Đặt lại âm thanh về mặc định')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.15.68 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>${collapseBtn}
        </div>

        <div class="yt-aid-audio-grid">
          <label class="yt-aid-fx-field" title="${T('Tăng âm lượng video')}">
            <span class="yt-aid-fx-name">${T('Âm lượng')}</span>
            <span class="yt-aid-fx-track" style="${rangeVarsStyle(audioBoostLevel(), AUDIO_BOOST_MIN, AUDIO_BOOST_MAX)}">
              <input type="range" id="yt-aid-audio-boost" min="${AUDIO_BOOST_MIN}" max="${AUDIO_BOOST_MAX}" step="${AUDIO_BOOST_STEP}" value="${audioBoostLevel()}" aria-label="${T('Tăng âm lượng video')}">
              <output class="yt-aid-fx-value" id="yt-aid-audio-boost-value">${audioBoostLevel()}%</output>
            </span>
          </label>

          <label class="yt-aid-fx-field" title="${T('Tăng âm trầm (bass boosted)')}">
            <span class="yt-aid-fx-name">${T('Bass')}</span>
            <span class="yt-aid-fx-track" style="${rangeVarsStyle(audioBassValue(), AUDIO_BASS_MIN, AUDIO_BASS_MAX)}">
              <input type="range" id="yt-aid-audio-bass" min="${AUDIO_BASS_MIN}" max="${AUDIO_BASS_MAX}" step="${AUDIO_BASS_STEP}" value="${audioBassValue()}" aria-label="${T('Tăng âm trầm (bass boosted)')}">
              <output class="yt-aid-fx-value" id="yt-aid-audio-bass-value">${audioBassValue()}%</output>
            </span>
          </label>

          <label class="yt-aid-fx-field" title="${T('Tốc độ phát (slowed / sped up)')}">
            <span class="yt-aid-fx-name">${T('Tốc độ')}</span>
            <span class="yt-aid-fx-track" style="${rangeVarsStyle(audioRateValue(), AUDIO_RATE_MIN, AUDIO_RATE_MAX)}">
              <input type="range" id="yt-aid-audio-rate" min="${AUDIO_RATE_MIN}" max="${AUDIO_RATE_MAX}" step="${AUDIO_RATE_STEP}" value="${audioRateValue()}" aria-label="${T('Tốc độ phát (slowed / sped up)')}">
              <output class="yt-aid-fx-value" id="yt-aid-audio-rate-value">${formatAudioRateNumber(audioRateValue())}</output>
            </span>
          </label>

          <label class="yt-aid-fx-field" title="${T('Mức độ vang')}">
            <span class="yt-aid-fx-name">${T('Độ vang')}</span>
            <span class="yt-aid-fx-track" style="${rangeVarsStyle(audioReverbValue(), AUDIO_REVERB_MIN, AUDIO_REVERB_MAX)}">
              <input type="range" id="yt-aid-audio-reverb" min="${AUDIO_REVERB_MIN}" max="${AUDIO_REVERB_MAX}" step="${AUDIO_REVERB_STEP}" value="${audioReverbValue()}" aria-label="${T('Mức độ vang')}">
              <output class="yt-aid-fx-value" id="yt-aid-audio-reverb-value">${audioReverbValue()}%</output>
            </span>
          </label>
        </div>

        <div class="yt-aid-audio-presets" role="group" aria-label="${T('Preset âm thanh')}">
          <button type="button" class="yt-aid-preset-chip" data-preset="slowed">slowed + reverb</button>
          <button type="button" class="yt-aid-preset-chip" data-preset="sped">sped up + reverb</button>
          <button type="button" class="yt-aid-preset-chip" data-preset="nightcore">nightcore</button>
          <button type="button" class="yt-aid-preset-chip" data-preset="bass">bass boosted</button>
        </div>
      </div>
    `;
  }

  // Wires sliders, reset and preset chips for any host that renders the audio
  // panel markup (watch toolbar or Shorts dropdown).
  function bindAudioControls(scope) {
    AUDIO_CONTROL_BINDINGS.forEach(({ id, key, min, max, sanitize, format, persist }) => {
      const range = scope.querySelector(`#yt-aid-audio-${id}`);
      const valueEl = scope.querySelector(`#yt-aid-audio-${id}-value`);
      if (!range) return;

      const paint = (value) => {
        if (valueEl) valueEl.textContent = format(value);
        setRangeFill(range, value, min, max);
      };

      range.addEventListener('input', (event) => {
        const value = sanitize(event.target.value);
        settings[key] = value;
        paint(value);

        if (id === 'rate') {
          applyAudioRate();
          // Keeps the watchdog running so a later player hand-off cannot
          // silently drop the edit the user just made.
          syncAudioEngine();
        } else if (value > min && !applyAudioGraphNow()) {
          // This player cannot be routed through Web Audio: put the slider back
          // so it never claims an effect the video is not actually playing.
          settings[key] = min;
          range.value = String(min);
          paint(min);
        } else {
          syncAudioEngine();
        }
      });

      if (persist) {
        range.addEventListener('change', () => safeSetStorage({ [key]: settings[key] }));
      }
    });

    // Reset every slider: tone settings go back to their stored defaults, the
    // per-video edits simply return to natural playback.
    const resetBtn = scope.querySelector('#yt-aid-audio-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      settings.audioBoost = AUDIO_BOOST_MIN;
      settings.audioBass = AUDIO_BASS_MIN;
      settings.audioRate = 1;
      settings.audioReverb = AUDIO_REVERB_MIN;
      audioRateApplied = 1;
      safeSetStorage({ audioBoost: AUDIO_BOOST_MIN, audioBass: AUDIO_BASS_MIN });
      applyAudioRate();
      syncAudioEngine();
      syncAudioUi();
      // The player can bounce its remembered speed back onto the element just
      // after a reset; re-assert the defaults once to win that race.
      setTimeout(() => { applyAudioRate(); syncAudioUi(); }, 400);
    });

    // Audio presets: one tap applies the genre's typical levels; tapping the
    // active preset again returns every slider to its default.
    scope.querySelectorAll('.yt-aid-preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const preset = AUDIO_PRESETS.find((p) => p.id === chip.dataset.preset);
        if (!preset) return;
        const active = activeAudioPreset();
        const turningOff = !!active && active.id === preset.id;

        settings.audioRate = turningOff ? 1 : preset.rate;
        settings.audioReverb = turningOff ? AUDIO_REVERB_MIN : preset.reverb;
        settings.audioBoost = turningOff ? AUDIO_BOOST_MIN : preset.boost;
        settings.audioBass = turningOff ? AUDIO_BASS_MIN : preset.bass;
        if (turningOff) audioRateApplied = 1;

        // Route the graph right from this gesture, like the sliders do; if this
        // player cannot be routed, drop the graph-only levels so the panel
        // never claims an effect the video is not actually playing.
        const needsGraph = settings.audioBoost > AUDIO_BOOST_MIN ||
          settings.audioBass > AUDIO_BASS_MIN ||
          settings.audioReverb > AUDIO_REVERB_MIN;
        if (needsGraph && !applyAudioGraphNow()) {
          settings.audioBoost = AUDIO_BOOST_MIN;
          settings.audioBass = AUDIO_BASS_MIN;
          settings.audioReverb = AUDIO_REVERB_MIN;
        }
        safeSetStorage({ audioBoost: settings.audioBoost, audioBass: settings.audioBass });
        syncAudioEngine();
        syncAudioUi();
        showToast(turningOff
          ? T('Đã tắt preset: {0}', [preset.name])
          : T('Đã áp preset: {0}', [preset.name]), 'info');
      });
    });
  }

  // Presets mirror the levels the slowed+reverb, sped up+reverb, nightcore and
  // bass-boosted uploads that listeners reach for most average out to, packed
  // into one tap each. Every value lands on a slider notch so the UI stays exact.
  const AUDIO_PRESETS = [
    { id: 'slowed', name: 'slowed + reverb', rate: 0.8, reverb: 35, boost: AUDIO_BOOST_MIN, bass: AUDIO_BASS_MIN },
    { id: 'sped', name: 'sped up + reverb', rate: 1.25, reverb: 25, boost: AUDIO_BOOST_MIN, bass: AUDIO_BASS_MIN },
    { id: 'nightcore', name: 'nightcore', rate: 1.3, reverb: AUDIO_REVERB_MIN, boost: AUDIO_BOOST_MIN, bass: AUDIO_BASS_MIN },
    { id: 'bass', name: 'bass boosted', rate: 1, reverb: AUDIO_REVERB_MIN, boost: 110, bass: 80 }
  ];

  function activeAudioPreset() {
    const rate = audioRateValue();
    const reverb = audioReverbValue();
    const boost = audioBoostLevel();
    const bass = audioBassValue();
    return AUDIO_PRESETS.find((p) => (
      p.rate === rate && p.reverb === reverb && p.boost === boost && p.bass === bass
    )) || null;
  }

  function syncAudioUi() {
    AUDIO_SLIDERS.forEach(({ id, min, max, get, show }) => {
      const value = get();
      const range = document.getElementById(`yt-aid-audio-${id}`);
      if (range && Number(range.value) !== value) range.value = String(value);
      setRangeFill(range, value, min, max);

      const label = document.getElementById(`yt-aid-audio-${id}-value`);
      const text = show(value);
      if (label && label.textContent !== text) label.textContent = text;
    });

    const panel = document.getElementById('yt-aid-audio-panel');
    if (panel) panel.classList.toggle('is-active', audioEffectsActive());

    const collapsed = !!settings.audioPanelCollapsed;
    document.querySelectorAll('.yt-aid-watch-toolbar').forEach((bar) => {
      bar.classList.toggle('yta-audio-collapsed', collapsed);
    });
    const collapseBtn = document.getElementById('yt-aid-audio-collapse');
    if (collapseBtn) {
      const tip = collapsed ? T('Mở rộng giao diện âm thanh') : T('Thu gọn giao diện âm thanh');
      collapseBtn.title = tip;
      collapseBtn.setAttribute('aria-label', tip);
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    }

    const active = activeAudioPreset();
    document.querySelectorAll('.yt-aid-preset-chip').forEach((chip) => {
      const preset = AUDIO_PRESETS.find((p) => p.id === chip.dataset.preset);
      const isActive = !!active && active.id === chip.dataset.preset;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
      if (preset) chip.title = isActive ? T('Tắt preset, về mặc định') : T('Áp preset {0}', [preset.name]);
    });
  }

  function setAudioPanelCollapsed(value) {
    const next = !!value;
    if (settings.audioPanelCollapsed === next) return;
    settings.audioPanelCollapsed = next;
    safeSetStorage({ audioPanelCollapsed: next });
    syncAudioUi();
  }

  function initAudioEngine() {
    initSpeedMenuWatch();
    syncAudioEngine();
    window.addEventListener('yt-navigate-finish', () => scheduleAudioSync(80));
    document.addEventListener('yt-page-data-updated', () => scheduleAudioSync(120));
    document.addEventListener('visibilitychange', syncAudioEngine);
  }

  // ==========================================
  // 3.9 AUTO VIDEO QUALITY
  // ==========================================
  // YouTube's quality controls are methods on #movie_player, which only exist
  // in the page world. player-bridge.js runs there and answers over CustomEvents
  // on document — the one channel both worlds share.
  const QUALITY_LEVELS = [
    { level: 'highres', label: '8K' },
    { level: 'hd2160', label: '4K' },
    { level: 'hd1440', label: '2K' },
    { level: 'hd1080', label: '1080p' },
    { level: 'hd720', label: '720p' },
    { level: 'large', label: '480p' },
    { level: 'medium', label: '360p' },
    { level: 'small', label: '240p' },
    { level: 'tiny', label: '144p' }
  ];
  const QUALITY_AUTO = 'auto';
  const QUALITY_DEFAULT_LEVEL = 'hd1080';
  const QUALITY_RETRY_MS = 1500;
  const QUALITY_MAX_TRIES = 6;

  function sanitizeQualityLevel(value) {
    return QUALITY_LEVELS.some((item) => item.level === value) ? value : QUALITY_DEFAULT_LEVEL;
  }

  function qualityLabel(level) {
    if (!level) return '';
    if (level === QUALITY_AUTO) return T('Tắt');
    const found = QUALITY_LEVELS.find((item) => item.level === level);
    return found ? found.label : level;
  }

  // Position in the table above (0 = best). Unknown names sort last so they can
  // never win a comparison.
  function qualityRank(level) {
    const index = QUALITY_LEVELS.findIndex((item) => item.level === level);
    return index === -1 ? QUALITY_LEVELS.length : index;
  }

  // The requested cap when the video can deliver it, otherwise the best stream
  // below the cap; if the video has nothing that low, its lowest stream.
  function pickQualityLevel(available, target) {
    const playable = (available || []).filter((level) => level && level !== QUALITY_AUTO);
    if (!playable.length) return null;
    const wanted = qualityRank(target);
    const ranked = playable.slice().sort((a, b) => qualityRank(a) - qualityRank(b));
    const atOrBelow = ranked.filter((level) => qualityRank(level) >= wanted);
    if (atOrBelow.length) return atOrBelow[0];
    return ranked[ranked.length - 1];
  }

  const PLAYER_NONCE = `yta${Math.random().toString(36).slice(2, 10)}`;
  const playerRequests = new Map();
  let playerReqSeq = 0;

  document.addEventListener('yt-aid-player-response', (event) => {
    const detail = event && event.detail;
    if (!detail || detail.nonce !== PLAYER_NONCE) return;
    const pending = playerRequests.get(detail.reqId);
    if (!pending) return;
    playerRequests.delete(detail.reqId);
    clearTimeout(pending.timer);
    pending.resolve(detail);
  }, true);

  // Empty level = read-only request. Resolves with ok:false if the bridge or
  // the player has not appeared yet, which the caller treats as "try again".
  // The video id travels with every request so the bridge can prove the data
  // it hands back belongs to the video this page is playing.
  function requestPlayer(action, level, value) {
    return new Promise((resolve) => {
      const reqId = ++playerReqSeq;
      const timer = setTimeout(() => {
        playerRequests.delete(reqId);
        resolve({ ok: false, error: 'no-answer' });
      }, 3000);
      playerRequests.set(reqId, { resolve, timer });
      document.dispatchEvent(new CustomEvent('yt-aid-player-request', {
        detail: {
          nonce: PLAYER_NONCE,
          reqId,
          action,
          level: level || '',
          value: value === undefined ? null : value,
          videoId: currentVideoKey().replace(/^id:/, '')
        }
      }));
    });
  }

  const requestPlayerQuality = (level) => requestPlayer('quality', level);

  let qualityTimer = 0;
  let qualityVideoKey = '';
  let qualityTries = 0;
  let qualityLockedKey = '';

  function scheduleQualityTick(delay) {
    if (qualityTimer) clearTimeout(qualityTimer);
    qualityTimer = setTimeout(() => {
      qualityTimer = 0;
      void runQualityTick();
    }, delay);
  }

  function resetQualityLock() {
    qualityLockedKey = '';
    qualityTries = 0;
  }

  async function runQualityTick() {
    if (IS_MUSIC_SITE || !settings.enableAutoQuality) return;
    const key = currentVideoKey();
    if (!key) return;
    if (key !== qualityVideoKey) {
      qualityVideoKey = key;
      resetQualityLock();
    }
    if (qualityLockedKey === key) return;
    if (qualityTries >= QUALITY_MAX_TRIES) return;
    qualityTries += 1;

    const target = sanitizeQualityLevel(settings.autoQualityLevel);
    const res = await requestPlayerQuality(target);
    if (!res.ok) {
      scheduleQualityTick(QUALITY_RETRY_MS);
      return;
    }
    const chosen = pickQualityLevel(res.levels, target);
    // Locked once the player sits at or above the best level this video allows;
    // it may still dip below on a slow connection, which is YouTube's own
    // buffering decision and must not be fought.
    if (chosen && res.current && qualityRank(res.current) <= qualityRank(chosen)) {
      qualityLockedKey = key;
      return;
    }
    scheduleQualityTick(QUALITY_RETRY_MS);
  }

  // Hands the player back to YouTube when the user turns the feature off.
  async function releaseAutoQuality() {
    resetQualityLock();
    await requestPlayerQuality(QUALITY_AUTO);
  }

  async function applyAutoQualityNow() {
    resetQualityLock();
    if (!settings.enableAutoQuality) return releaseAutoQuality();
    const target = sanitizeQualityLevel(settings.autoQualityLevel);
    const res = await requestPlayerQuality(target);
    if (!res.ok) return scheduleQualityTick(QUALITY_RETRY_MS);
    const chosen = pickQualityLevel(res.levels, target);
    if (chosen && res.current && qualityRank(res.current) <= qualityRank(chosen)) {
      qualityLockedKey = currentVideoKey();
    }
    return chosen;
  }

  function initAutoQuality() {
    if (IS_MUSIC_SITE) return;
    scheduleQualityTick(400);
    window.addEventListener('yt-navigate-finish', () => scheduleQualityTick(700));
    document.addEventListener('yt-page-data-updated', () => scheduleQualityTick(1000));
  }

  // ==========================================
  // 3b. HIGHLIGHT JUMP ("Đoạn nổi bật")
  // ==========================================
  const HIGHLIGHT_RETRY_MS = 1200;
  const HIGHLIGHT_MAX_TRIES = 6;

  let highlightTimer = 0;
  let highlightVideoKey = '';
  let highlightTries = 0;
  let highlightRanges = [];
  // YouTube only ships the heat entity for videos with enough replays, so an
  // empty answer is a real answer: the button settles on "no highlight"
  // instead of rescanning the page forever.
  let highlightResolved = false;

  // Longest range wins — that is the segment YouTube marked as the video's
  // peak — and equal lengths fall back to the earliest so the target never
  // jumps between clicks.
  function pickHighlightRange(ranges, durationSec) {
    let best = null;
    (ranges || []).forEach((range) => {
      if (!range || !Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) return;
      if (range.endMs <= range.startMs) return;
      if (durationSec > 0 && range.startMs / 1000 >= durationSec) return;
      if (!best) {
        best = range;
        return;
      }
      const span = range.endMs - range.startMs;
      const bestSpan = best.endMs - best.startMs;
      if (span > bestSpan || (span === bestSpan && range.startMs < best.startMs)) best = range;
    });
    return best;
  }

  function highlightTarget() {
    const video = getMainVideo();
    let duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    // While a preroll runs, the <video> element is the ad, and a 20-second ad
    // says nothing about where this video's ranges sit — dropping the veto keeps
    // the button lit instead of greying it out mid-ad.
    if (isAdPlaying()) duration = 0;
    return pickHighlightRange(highlightRanges, duration);
  }

  // A disabled <button> swallows hover in some browsers, and the note on hover
  // is the whole point, so the empty state is styled + aria-disabled instead.
  function syncHighlightUi() {
    const btn = document.getElementById('yt-aid-btn-highlight');
    if (!btn) return;
    const target = highlightTarget();
    const label = btn.querySelector('span');
    if (label) label.textContent = T('Đoạn nổi bật');
    btn.classList.toggle('yt-aid-btn-off', !target);
    btn.setAttribute('aria-disabled', target ? 'false' : 'true');
    const title = target
      ? T('Nhảy tới đoạn nổi bật ({0}–{1})', [formatVideoTime(target.startMs / 1000), formatVideoTime(target.endMs / 1000)])
      : T('Video không có đoạn nổi bật');
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }

  async function seekToHighlight() {
    let target = highlightTarget();
    if (!target) {
      // YouTube can deliver the marker deck after the bounded retries stopped,
      // so a click gets one fresh read before the button admits there is
      // nothing to jump to.
      const res = await requestPlayer('highlight');
      if (res.ok && Array.isArray(res.ranges) && res.ranges.length) {
        highlightRanges = res.ranges;
        highlightResolved = true;
        syncHighlightUi();
        target = highlightTarget();
      }
    }
    if (!target) {
      showToast(T('Video không có đoạn nổi bật'), 'warning');
      return;
    }
    if (isAdPlaying()) {
      showToast(T('Đang có quảng cáo, thử lại sau'), 'warning');
      return;
    }
    const video = getMainVideo();
    if (!video) {
      showToast(T('Chưa mở được video'), 'warning');
      return;
    }
    try {
      video.currentTime = target.startMs / 1000;
    } catch (e) {
      showToast(T('Không tua được tới đoạn nổi bật'), 'warning');
      return;
    }
    if (video.paused) video.play().catch(() => { });
    showToast(T('Đã nhảy tới đoạn nổi bật ({0})', [formatVideoTime(target.startMs / 1000)]), 'info');
  }

  function scheduleHighlightTick(delay) {
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightTimer = 0;
      void runHighlightTick();
    }, delay);
  }

  async function runHighlightTick() {
    if (IS_MUSIC_SITE || !window.location.pathname.startsWith('/watch')) return;
    const key = currentVideoKey();
    if (!key) return;
    if (key !== highlightVideoKey) {
      highlightVideoKey = key;
      highlightTries = 0;
      highlightRanges = [];
      highlightResolved = false;
    }
    if (highlightResolved || highlightTries >= HIGHLIGHT_MAX_TRIES) {
      highlightResolved = highlightRanges.length > 0;
      syncHighlightUi();
      return;
    }
    highlightTries += 1;
    const res = await requestPlayer('highlight');
    if (res.ok && Array.isArray(res.ranges) && res.ranges.length) {
      highlightRanges = res.ranges;
      highlightResolved = true;
      syncHighlightUi();
      return;
    }
    syncHighlightUi();
    scheduleHighlightTick(HIGHLIGHT_RETRY_MS);
  }

  function initHighlightJump() {
    if (IS_MUSIC_SITE) return;
    scheduleHighlightTick(900);
    window.addEventListener('yt-navigate-finish', () => scheduleHighlightTick(700));
    document.addEventListener('yt-page-data-updated', () => scheduleHighlightTick(1000));
  }

  // ==========================================
  // 3c. MINIPLAYER ("Trình phát thu nhỏ")
  // ==========================================
  let miniplayerBtnState = null;
  let miniplayerObserver = null;
  let miniplayerPlayer = null;
  let miniplayerBusy = false;

  const isMiniplayerOpen = () => {
    const player = document.getElementById('movie_player');
    return !!(player && player.classList.contains('ytp-player-minimized'));
  };

  function syncMiniplayerUi() {
    const btn = document.getElementById('yt-aid-btn-miniplayer');
    if (!btn) {
      miniplayerBtnState = null;
      return;
    }
    const open = isMiniplayerOpen();
    const lang = I18N ? I18N.getLanguage() : 'vi';
    // The class observer fires on every player class change, so only write
    // when the state or the language actually moved.
    if (miniplayerBtnState && miniplayerBtnState.btn === btn
      && miniplayerBtnState.open === open && miniplayerBtnState.lang === lang) return;
    miniplayerBtnState = { btn, open, lang };

    btn.classList.toggle('active', open);
    btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    const title = T(open ? 'Thoát trình phát thu nhỏ' : 'Trình phát thu nhỏ');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    const label = btn.querySelector('span');
    if (label) label.textContent = T('Thu nhỏ');
  }

  async function toggleMiniplayer() {
    if (miniplayerBusy) return;
    miniplayerBusy = true;
    // While an ad owns the surface the player cannot hand itself to the corner
    // player; calling setMinimized then hides the controls without any
    // miniplayer appearing.
    if (isAdPlaying() && !isMiniplayerOpen()) {
      miniplayerBusy = false;
      showToast(T('Đang có quảng cáo, thử lại sau'), 'warning');
      return;
    }
    const res = await requestPlayer('miniplayer');
    miniplayerBusy = false;
    if (!res.ok) {
      showToast(T('Không mở được trình phát thu nhỏ'), 'warning');
      return;
    }
    syncMiniplayerUi();
  }

  // The class on #movie_player is the one signal that tracks every way the
  // corner player opens or closes, YouTube's own buttons included.
  function watchMiniplayerState() {
    const player = document.getElementById('movie_player');
    if (!player || player === miniplayerPlayer) return;
    if (miniplayerObserver) miniplayerObserver.disconnect();
    miniplayerPlayer = player;
    miniplayerObserver = new MutationObserver(() => syncMiniplayerUi());
    miniplayerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    syncMiniplayerUi();
  }

  function initMiniplayer() {
    if (IS_MUSIC_SITE) return;
    window.addEventListener('yt-navigate-finish', () => {
      miniplayerPlayer = null;
      watchMiniplayerState();
    });
    watchMiniplayerState();
  }

  // ==========================================
  // 4. SHORTCUT SYSTEM (ss, hh, hhh, pp, mm)
  // ==========================================
  function isTypingContext() {
    const el = document.activeElement;
    if (!el) return false;

    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }

    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return true;
    }

    if (el.closest('#contenteditable-root, ytd-searchbox, yt-searchbox, ytmusic-search-box, ytd-comments, #comment-dialog, yt-formatted-string[contenteditable], #edit-box, paper-input, tp-yt-paper-input')) {
      return true;
    }

    return false;
  }

  const SHORTS_LINK = 'a[href*="/shorts/"]';

  function shortsIdFromAnchor(anchor) {
    if (!anchor) return null;
    const href = anchor.getAttribute('href') || anchor.href || '';
    const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  // Shelves / related rail carry real video links, the guide only has "/shorts"
  function updateCachedShorts() {
    const preferred = document.querySelectorAll(
      `ytd-rich-shelf-renderer[is-shorts] ${SHORTS_LINK}, ytd-reel-shelf-renderer ${SHORTS_LINK}, ` +
      `ytd-compact-video-renderer ${SHORTS_LINK}, ytd-rich-item-renderer ${SHORTS_LINK}`
    );
    const pool = preferred.length ? preferred : document.querySelectorAll(SHORTS_LINK);

    for (const anchor of pool) {
      const id = shortsIdFromAnchor(anchor);
      if (id) {
        cachedSuggestedShortsId = id;
        return;
      }
    }
  }

  function findSuggestedShortsElement() {
    const withId = document.querySelector(
      `ytd-rich-shelf-renderer[is-shorts] ${SHORTS_LINK}, ytd-reel-shelf-renderer ${SHORTS_LINK}, ` +
      `ytd-compact-video-renderer ${SHORTS_LINK}, ytd-rich-item-renderer ${SHORTS_LINK}, ${SHORTS_LINK}`
    );
    const withIdAnchor = withId ? (withId.tagName === 'A' ? withId : withId.closest('a')) : null;
    if (shortsIdFromAnchor(withIdAnchor)) return withIdAnchor;

    // Fallback: the guide "Shorts" entry (no video id, opens the Shorts feed)
    const guideGeneral = document.querySelector(
      'ytd-guide-entry-renderer a[href*="/shorts"], ytd-mini-guide-entry-renderer a[href*="/shorts"], a#endpoint[title="Shorts"], a#endpoint[aria-label*="Shorts"], a[title="Shorts"]'
    );
    return guideGeneral ? (guideGeneral.tagName === 'A' ? guideGeneral : guideGeneral.closest('a')) : null;
  }

  function simulateSpaNavigation(pathOrUrl) {
    const target = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.youtube.com${pathOrUrl}`;

    try {
      const url = new URL(target);
      if (url.origin === window.location.origin &&
          url.pathname === window.location.pathname &&
          url.search === window.location.search) {
        return true;
      }
    } catch (e) { }

    try {
      const a = document.createElement('a');
      a.className = 'yt-simple-endpoint';
      a.href = target;
      a.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      const container = document.querySelector('ytd-app') || document.body;
      container.appendChild(a);
      a.click();
      // Keep the anchor alive for a beat in case YouTube reads it asynchronously
      setTimeout(() => a.remove(), 120);
    } catch (e) { }

    // A synthetic click is not guaranteed to be routed by the SPA: verify and
    // hard-navigate if nothing happened.
    const startHref = window.location.href;
    setTimeout(() => {
      if (window.location.href === startHref) window.location.assign(target);
    }, 450);
    return true;
  }

  // Cross-site targets must be a plain navigation: Music has no ytd-app router
  // and its own link conventions.
  function goToYoutubeTarget(pathOrUrl) {
    const target = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.youtube.com${pathOrUrl}`;
    if (IS_MUSIC_SITE) {
      window.location.assign(target);
      return;
    }
    simulateSpaNavigation(target);
  }

  function navigateToShorts() {
    if (IS_MUSIC_SITE) {
      showToast(T('Phím {0}: Shorts', [shortcutSequence('shorts')]), 'info', 1600);
      goToYoutubeTarget('/shorts');
      return;
    }

    updateCachedShorts();
    const shortsAnchor = findSuggestedShortsElement();

    if (shortsAnchor) {
      const id = shortsIdFromAnchor(shortsAnchor);
      if (id) {
        showToast(T('Phím {0}: Shorts gợi ý', [shortcutSequence('shorts')]), 'info', 1600);
      } else {
        showToast(T('Phím {0}: Shorts', [shortcutSequence('shorts')]), 'info', 1600);
      }
      shortsAnchor.click();
      return;
    }

    if (cachedSuggestedShortsId) {
      showToast(T('Phím {0}: Shorts gợi ý', [shortcutSequence('shorts')]), 'info', 1600);
      simulateSpaNavigation(`/shorts/${cachedSuggestedShortsId}`);
      return;
    }

    showToast(T('Phím {0}: Shorts', [shortcutSequence('shorts')]), 'info', 1600);
    simulateSpaNavigation('/shorts');
  }

  function navigateToHome() {
    showToast(T('Phím {0}: Trang chủ', [shortcutSequence('home')]), 'info', 1600);
    if (IS_MUSIC_SITE) {
      goToYoutubeTarget('/');
      return;
    }
    const homeSelectors = [
      'ytd-topbar-logo-renderer a#logo',
      'a#logo',
      'ytd-guide-entry-renderer a[href="/"]',
      'ytd-mini-guide-entry-renderer a[href="/"]'
    ];
    for (const sel of homeSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const anchor = el.tagName === 'A' ? el : el.closest('a');
        if (anchor) {
          anchor.click();
          return;
        }
      }
    }
    simulateSpaNavigation('/');
  }

  function navigateToHistory() {
    showToast(T('Phím {0}: Lịch sử', [shortcutSequence('history')]), 'info', 1600);
    if (IS_MUSIC_SITE) {
      goToYoutubeTarget('/feed/history');
      return;
    }
    const historySelectors = [
      'ytd-guide-entry-renderer a[href^="/feed/history"]',
      'ytd-mini-guide-entry-renderer a[href^="/feed/history"]',
      'a[href="/feed/history"]'
    ];
    for (const sel of historySelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const anchor = el.tagName === 'A' ? el : el.closest('a');
        if (anchor) {
          anchor.click();
          return;
        }
      }
    }
    simulateSpaNavigation('/feed/history');
  }

  function navigateToPlaylists() {
    showToast(T('Phím {0}: Playlist', [shortcutSequence('playlists')]), 'info', 1600);
    if (IS_MUSIC_SITE) {
      goToYoutubeTarget('/feed/playlists');
      return;
    }
    const playlistSelectors = [
      'ytd-guide-entry-renderer a[href^="/feed/playlists"]',
      'ytd-mini-guide-entry-renderer a[href^="/feed/playlists"]',
      'a[href^="/feed/playlists"]',
      'ytd-guide-entry-renderer a[href^="/feed/library"]',
      'a[href^="/feed/library"]'
    ];
    for (const sel of playlistSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const anchor = el.tagName === 'A' ? el : el.closest('a');
        if (anchor) {
          anchor.click();
          return;
        }
      }
    }
    simulateSpaNavigation('/feed/playlists');
  }

  function navigateToMusic() {
    if (IS_MUSIC_SITE) {
      showToast(T('Phím {0}: đang ở Music', [shortcutSequence('music')]), 'info', 1600);
      if (window.location.pathname !== '/') window.location.assign('https://music.youtube.com/');
      return;
    }
    showToast(T('Phím {0}: Music', [shortcutSequence('music')]), 'info', 1600);
    window.location.href = 'https://music.youtube.com/';
  }

  function executeShortcut(actionId) {
    if (!settings.enableShortcuts) return;
    switch (actionId) {
      case 'shorts':
        navigateToShorts();
        break;
      case 'home':
        navigateToHome();
        break;
      case 'history':
        navigateToHistory();
        break;
      case 'playlists':
        navigateToPlaylists();
        break;
      case 'music':
        navigateToMusic();
        break;
    }
  }

  // YouTube binds "m" (mute) and "p" (previous) to the same keys that start
  // our chords. We swallow the key and replay the native action ourselves when
  // no chord completes, so both behaviours keep working.
  const SINGLE_KEY_FALLBACK = {
    m: () => {
      const btn = document.querySelector('.ytp-mute-button, #mute-button');
      if (btn) {
        btn.click();
        return;
      }
      const video = document.querySelector('video');
      if (video) video.muted = !video.muted;
    },
    p: () => {
      const btn = document.querySelector('.ytp-prev-button, #previous-button');
      if (btn) btn.click();
    }
  };

  function resetKeyBuffer(runFallback = false) {
    const pending = keyBuffer;
    keyBuffer = '';
    if (keyBufferTimer) {
      clearTimeout(keyBufferTimer);
      keyBufferTimer = null;
    }
    if (runFallback && pending.length === 1 && SINGLE_KEY_FALLBACK[pending]) {
      SINGLE_KEY_FALLBACK[pending]();
    }
  }

  function flushKeyBuffer() {
    const pending = keyBuffer;
    if (!pending) return;

    if (pending.length === 2) {
      const entry = shortcutKeymap[pending[0]] || {};
      resetKeyBuffer();
      // A key can also start a triple-tap action; only fire the double when
      // the timeout proves the third tap is not coming.
      if (entry.double) executeShortcut(entry.double);
      return;
    }

    resetKeyBuffer(true);
  }

  function initShortcutSystem() {
    document.addEventListener('keydown', (e) => {
      if (cropOverlayEl) return;
      if (!settings.enableShortcuts) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.repeat || e.isComposing) return;
      if (isTypingContext()) return;

      if (e.key === 'Escape') {
        resetKeyBuffer();
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : '';
      if (!/^[a-z]$/.test(key) || !shortcutKeySet.has(key)) {
        resetKeyBuffer(true);
        return;
      }

      // A different key ends the pending chord. Let it reach YouTube so its
      // own shortcuts keep working.
      if (keyBuffer && key !== keyBuffer[0]) {
        resetKeyBuffer(true);
        return;
      }

      // Own the key: YouTube's native single-key shortcuts must not fire.
      // stopImmediatePropagation is required because YouTube listens on
      // document too — stopPropagation alone would still let it run.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const next = keyBuffer + key;
      const entry = shortcutKeymap[key] || {};

      if (next.length === 3) {
        resetKeyBuffer();
        if (entry.triple) executeShortcut(entry.triple);
        return;
      }

      if (next.length === 2) {
        if (entry.triple) {
          // Wait briefly for a possible third tap before running the double
          keyBuffer = next;
          if (keyBufferTimer) clearTimeout(keyBufferTimer);
          keyBufferTimer = setTimeout(flushKeyBuffer, CHORD_TIMEOUT_MS);
          return;
        }
        resetKeyBuffer();
        if (entry.double) executeShortcut(entry.double);
        return;
      }

      keyBuffer = next;
      if (keyBufferTimer) clearTimeout(keyBufferTimer);
      keyBufferTimer = setTimeout(flushKeyBuffer, CHORD_TIMEOUT_MS);
    }, true);

    // Never replay a stale fallback into a page the user just left
    window.addEventListener('blur', () => resetKeyBuffer());
  }

  // ==========================================
  // 5. CLEAN COPY LINK & SEARCH BAR UTILS
  // ==========================================
  const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

  function cleanYoutubeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, window.location.origin);

      if (url.pathname === '/watch') {
        const v = url.searchParams.get('v') || '';
        if (VIDEO_ID_RE.test(v)) {
          // Keep the timestamp: sharing "this part" is a deliberate user intent
          const start = url.searchParams.get('t');
          return `https://www.youtube.com/watch?v=${v}${start ? `&t=${encodeURIComponent(start)}` : ''}`;
        }
      }

      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        if (id && VIDEO_ID_RE.test(id)) {
          return `https://www.youtube.com/shorts/${id}`;
        }
      }

      if (url.pathname.startsWith('/playlist')) {
        const list = url.searchParams.get('list');
        if (list) {
          return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
        }
      }

      const trackingParams = [
        'si', 'pp', 'feature', 'utm_source', 'utm_medium', 'utm_campaign',
        'utm_term', 'utm_content', 'fbclid', 'gclid', 'ab_channel', 'sub_confirmation'
      ];
      trackingParams.forEach(p => url.searchParams.delete(p));
      return url.toString();
    } catch (err) {
      return rawUrl.split('&')[0];
    }
  }

  function getWatchVideoTitle() {
    const el = document.querySelector(
      'ytd-watch-metadata #title h1 yt-formatted-string, ytd-watch-metadata #title h1, h1.style-scope.ytd-watch-metadata, h1.title.ytd-video-primary-info-renderer'
    );
    return el ? el.textContent.trim() : document.title.replace(' - YouTube', '').trim();
  }

  function previewText(text, max = 40) {
    const flat = String(text).replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )?.set;

  function setSearchInputValue(input, text) {
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, text);
    } else {
      input.value = text;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Low-level clipboard write, resolves true on success.
  // The legacy fallback briefly steals focus and the selection, so both are
  // restored afterwards — otherwise copy-on-select would wipe the highlight.
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopyText(text));
    }
    return Promise.resolve(legacyCopyText(text));
  }

  function legacyCopyText(text) {
    const active = document.activeElement;
    const selection = window.getSelection();
    const ranges = [];
    if (selection) {
      for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i));
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();

    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) { }
    ta.remove();

    if (selection && ranges.length) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
    if (active && active !== document.body && typeof active.focus === 'function') {
      try {
        active.focus({ preventScroll: true });
      } catch (e) { }
    }
    return ok;
  }

  function rememberCopiedText(text) {
    lastCopiedText = text;
    lastCopiedAt = Date.now();
    safeSetStorage({ [LAST_COPIED_KEY]: { text, at: lastCopiedAt } });
  }

  function restoreLastCopied(record) {
    if (!record || typeof record.text !== 'string' || !record.text) return false;
    if (Date.now() - (record.at || 0) > LAST_COPIED_TTL_MS) return false;
    lastCopiedText = record.text;
    lastCopiedAt = record.at || Date.now();
    return true;
  }

  // Only text that is still fresh enough may prefill the search box
  function getPasteableText() {
    if (!lastCopiedText) return '';
    if (Date.now() - lastCopiedAt > LAST_COPIED_TTL_MS) return '';
    return lastCopiedText;
  }

  function copyTextToClipboard(text, successMsg) {
    if (!text) {
      showToast('Không có gì để copy', 'warning');
      return;
    }
    rememberCopiedText(text);
    writeClipboard(text).then((ok) => {
      if (!ok) {
        showToast('Copy thất bại', 'warning');
      } else if (successMsg) {
        showToast(successMsg, 'success');
      }
    });
  }

  // YouTube now renders search as <yt-searchbox>, whose first <input> is a
  // hidden file input for image search — so only name/class selectors may be
  // used here. A bare "yt-searchbox input" would match the file input and the
  // typed query would silently go nowhere.
  const SEARCH_INPUT_SELECTOR = [
    'input#search',
    'yt-searchbox input[name="search_query"]',
    'ytd-searchbox input#search',
    'ytd-searchbox input[name="search_query"]',
    'yt-searchbox input[type="text"]',
    'ytd-searchbox input[type="text"]',
    'input.ytSearchboxComponentInput'
  ].join(', ');
  const SEARCH_SCOPE_SELECTOR = 'ytd-searchbox, yt-searchbox';
  const SEARCH_BUTTON_SELECTOR = 'yt-searchbox button.ytSearchboxComponentSearchButton, ytd-searchbox button#search-icon-legacy, button#search-icon-legacy';

  function isUsableSearchInput(el) {
    return !!el && el.type !== 'file';
  }

  function findSearchInput() {
    return [...document.querySelectorAll(SEARCH_INPUT_SELECTOR)].find(isUsableSearchInput) || null;
  }

  // Open search query directly in a brand new tab
  function openSearchInNewTab(text) {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`, '_blank', 'noopener');
    showToast(T('Tìm tab mới: "{0}"', [previewText(text, 18)]), 'success');
  }

  // Fill the search bar then run the search on the current tab
  function autoEnterSearch(text) {
    const searchInput = findSearchInput();
    const startHref = window.location.href;

    if (searchInput) {
      setSearchInputValue(searchInput, text);
      lastAutoPaste = { value: text, text };
      searchInput.focus();
    }

    const searchBtn = document.querySelector(SEARCH_BUTTON_SELECTOR);
    if (searchBtn) searchBtn.click();

    // Synthetic search clicks are not always trusted — fall back to SPA routing
    setTimeout(() => {
      if (window.location.href === startHref) {
        simulateSpaNavigation(`/results?search_query=${encodeURIComponent(text)}`);
      }
    }, 450);

    showToast(T('Đang tìm: "{0}"', [previewText(text, 18)]), 'success');
  }

  // ==========================================
  // 5B. THUMBNAIL DOWNLOAD & CROP
  // ==========================================
  // YouTube serves .jpg for older uploads and .webp for newer ones, and a
  // missing size answers with a tiny grey placeholder instead of a 404.
  const THUMB_VARIANTS = [
    { name: 'maxresdefault', ext: 'jpg' },
    { name: 'maxresdefault', ext: 'webp' },
    { name: 'sddefault', ext: 'jpg' },
    { name: 'hq720', ext: 'jpg' },
    { name: 'hqdefault', ext: 'jpg' },
    { name: 'mqdefault', ext: 'jpg' }
  ];
  const THUMB_CACHE_LIMIT = 20;
  const thumbBlobCache = new Map();
  const thumbRequests = new Map();

  function videoIdFromUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl, window.location.origin);

      const v = url.searchParams.get('v');
      if (v && v.length === 11) return v;

      if (/(^|\.)youtu\.be$/i.test(url.hostname)) {
        const shortId = url.pathname.split('/').filter(Boolean)[0];
        if (shortId && shortId.length === 11) return shortId;
      }

      const match = url.pathname.match(/\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function sanitizeFilename(name) {
    const cleaned = String(name || '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/[\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
    return cleaned.slice(0, 80) || 'youtube-thumbnail';
  }

  function cacheThumbnail(videoId, blob) {
    thumbBlobCache.set(videoId, blob);
    while (thumbBlobCache.size > THUMB_CACHE_LIMIT) {
      thumbBlobCache.delete(thumbBlobCache.keys().next().value);
    }
  }

  function fetchThumbnailBlob(videoId) {
    if (thumbBlobCache.has(videoId)) return Promise.resolve(thumbBlobCache.get(videoId));
    if (thumbRequests.has(videoId)) return thumbRequests.get(videoId);

    const request = (async () => {
      for (const { name, ext } of THUMB_VARIANTS) {
        try {
          const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${name}.${ext}`, {
            credentials: 'omit',
            cache: 'force-cache'
          });
          if (!res.ok) continue;

          const blob = await res.blob();
          if (!blob.size) continue;

          if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(blob).catch(() => null);
            if (bitmap) {
              const tooSmall = bitmap.width < 300;
              bitmap.close();
              if (tooSmall) continue;
            }
          }

          cacheThumbnail(videoId, blob);
          return blob;
        } catch (e) { }
      }
      return null;
    })().finally(() => {
      thumbRequests.delete(videoId);
    });

    thumbRequests.set(videoId, request);
    return request;
  }

  function saveBlobAsFile(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }

  let cropOverlayEl = null;
  let cropCleanup = null;
  const MIN_CROP_FRACTION = 0.03;

  function closeThumbnailCropper() {
    if (cropCleanup) {
      cropCleanup();
      cropCleanup = null;
    }
    if (cropOverlayEl) {
      cropOverlayEl.remove();
      cropOverlayEl = null;
    }
    document.body.classList.remove('yt-aid-crop-open');
    document.documentElement.classList.remove('yt-aid-crop-open');
  }

  function openThumbnailCropper(blob, filename, title, heading = 'Cắt & tải ảnh bìa') {
    closeThumbnailCropper();
    closeDropdown();

    const previousFocus = document.activeElement;
    const objectUrl = URL.createObjectURL(blob);
    const overlay = document.createElement('div');
    overlay.className = 'yt-aid-crop-overlay';
    overlay.innerHTML = `
      <div class="yt-aid-crop-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(heading)}">
        <div class="yt-aid-crop-header">
          <div>
            <div class="yt-aid-crop-title">${escapeHtml(heading)}</div>
            <div class="yt-aid-crop-subtitle">${escapeHtml(previewText(title, 60))}</div>
          </div>
          <button type="button" class="yt-aid-crop-close" id="yt-aid-crop-close" title="Đóng" aria-label="Đóng">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="yt-aid-crop-stage">
          <div class="yt-aid-crop-frame" id="yt-aid-crop-frame">
            <img class="yt-aid-crop-image" id="yt-aid-crop-image" alt="${escapeHtml(heading)}" draggable="false">
            <div class="yt-aid-crop-pane" data-pane="top"></div>
            <div class="yt-aid-crop-pane" data-pane="bottom"></div>
            <div class="yt-aid-crop-pane" data-pane="left"></div>
            <div class="yt-aid-crop-pane" data-pane="right"></div>
            <div class="yt-aid-crop-box" id="yt-aid-crop-box">
              <span class="yt-aid-crop-handle" data-handle="nw"></span>
              <span class="yt-aid-crop-handle" data-handle="ne"></span>
              <span class="yt-aid-crop-handle" data-handle="sw"></span>
              <span class="yt-aid-crop-handle" data-handle="se"></span>
            </div>
          </div>
        </div>

        <div class="yt-aid-crop-footer">
          <div class="yt-aid-crop-hint">Kéo trong khung để di chuyển, kéo 4 góc để thay đổi vùng cắt.</div>
          <div class="yt-aid-crop-actions">
            <button type="button" class="yt-aid-crop-btn" id="yt-aid-crop-reset">Đặt lại</button>
            <button type="button" class="yt-aid-crop-btn" id="yt-aid-crop-cancel">Huỷ</button>
            <button type="button" class="yt-aid-crop-btn" id="yt-aid-crop-original">Tải ảnh gốc</button>
            <button type="button" class="yt-aid-crop-btn primary" id="yt-aid-crop-save">Tải phần đã chọn</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('yt-aid-crop-open');
    document.documentElement.classList.add('yt-aid-crop-open');
    cropOverlayEl = overlay;
    localizeTree(overlay);

    const image = overlay.querySelector('#yt-aid-crop-image');
    const frame = overlay.querySelector('#yt-aid-crop-frame');
    const box = overlay.querySelector('#yt-aid-crop-box');
    const subtitle = overlay.querySelector('.yt-aid-crop-subtitle');
    const closeBtn = overlay.querySelector('#yt-aid-crop-close');
    const saveBtn = overlay.querySelector('#yt-aid-crop-save');
    const originalBtn = overlay.querySelector('#yt-aid-crop-original');
    const resetBtn = overlay.querySelector('#yt-aid-crop-reset');

    requestAnimationFrame(() => closeBtn.focus({ preventScroll: true }));

    let selection = { x: 0, y: 0, w: 1, h: 1 };
    let naturalSize = { width: 0, height: 0 };
    let dragCleanup = null;
    let closed = false;

    const paneEls = {
      top: overlay.querySelector('.yt-aid-crop-pane[data-pane="top"]'),
      bottom: overlay.querySelector('.yt-aid-crop-pane[data-pane="bottom"]'),
      left: overlay.querySelector('.yt-aid-crop-pane[data-pane="left"]'),
      right: overlay.querySelector('.yt-aid-crop-pane[data-pane="right"]')
    };

    const setRect = (el, x, y, w, h) => {
      el.style.left = `${x * 100}%`;
      el.style.top = `${y * 100}%`;
      el.style.width = `${w * 100}%`;
      el.style.height = `${h * 100}%`;
    };

    const applySelection = () => {
      const { x, y, w, h } = selection;
      setRect(box, x, y, w, h);
      setRect(paneEls.top, 0, 0, 1, y);
      setRect(paneEls.bottom, 0, y + h, 1, 1 - y - h);
      setRect(paneEls.left, 0, y, x, h);
      setRect(paneEls.right, x + w, y, 1 - x - w, h);
    };

    const startDrag = (mode, startEvent) => {
      if (!naturalSize.width) return;
      const frameRect = frame.getBoundingClientRect();
      if (!frameRect.width || !frameRect.height) return;

      const start = {
        clientX: startEvent.clientX,
        clientY: startEvent.clientY,
        sel: { ...selection }
      };

      const minW = Math.min(0.5, Math.max(MIN_CROP_FRACTION, 24 / frameRect.width));
      const minH = Math.min(0.5, Math.max(MIN_CROP_FRACTION, 24 / frameRect.height));
      const target = startEvent.currentTarget;

      if (target.setPointerCapture) target.setPointerCapture(startEvent.pointerId);

      const updateFromEvent = (moveEvent) => {
        const dx = (moveEvent.clientX - start.clientX) / frameRect.width;
        const dy = (moveEvent.clientY - start.clientY) / frameRect.height;
        const s = start.sel;
        const next = { ...s };

        if (mode === 'move') {
          next.x = Math.min(Math.max(0, s.x + dx), 1 - s.w);
          next.y = Math.min(Math.max(0, s.y + dy), 1 - s.h);
        } else {
          if (mode === 'nw' || mode === 'sw') {
            next.x = Math.min(Math.max(0, s.x + dx), s.x + s.w - minW);
            next.w = s.x + s.w - next.x;
          }
          if (mode === 'ne' || mode === 'se') {
            next.w = Math.min(Math.max(minW, s.w + dx), 1 - s.x);
          }
          if (mode === 'nw' || mode === 'ne') {
            next.y = Math.min(Math.max(0, s.y + dy), s.y + s.h - minH);
            next.h = s.y + s.h - next.y;
          }
          if (mode === 'sw' || mode === 'se') {
            next.h = Math.min(Math.max(minH, s.h + dy), 1 - s.y);
          }
        }

        selection = next;
        applySelection();
      };

      // Coalesce pointer moves into one style write per animation frame.
      let pendingEvent = null;
      let rafId = 0;

      const flushPending = () => {
        if (!rafId) return;
        cancelAnimationFrame(rafId);
        rafId = 0;
        const pending = pendingEvent;
        pendingEvent = null;
        if (pending) updateFromEvent(pending);
      };

      const onMove = (moveEvent) => {
        pendingEvent = moveEvent;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const pending = pendingEvent;
          pendingEvent = null;
          if (pending) updateFromEvent(pending);
        });
      };

      const stop = () => {
        flushPending();
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', stop);
        target.removeEventListener('pointercancel', stop);
        if (target.releasePointerCapture) target.releasePointerCapture(startEvent.pointerId);
        dragCleanup = null;
      };

      dragCleanup = stop;
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', stop);
      target.addEventListener('pointercancel', stop);
    };

    box.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('.yt-aid-crop-handle')) return;
      event.preventDefault();
      startDrag('move', event);
    });

    box.querySelectorAll('.yt-aid-crop-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        startDrag(handle.dataset.handle, event);
      });
    });

    const setBusy = (busy) => {
      saveBtn.disabled = busy;
      originalBtn.disabled = busy;
      resetBtn.disabled = busy;
      saveBtn.textContent = T(busy ? 'Đang lưu…' : 'Tải phần đã chọn');
    };

    const saveOriginal = () => {
      saveBlobAsFile(blob, filename);
      showToast(T('Đã tải: {0}', [previewText(filename, 20)]), 'success', 2800);
      closeThumbnailCropper();
    };

    const saveCropped = async () => {
      if (!naturalSize.width) return;

      const sourceWidth = naturalSize.width;
      const sourceHeight = naturalSize.height;
      const sx = Math.round(selection.x * sourceWidth);
      const sy = Math.round(selection.y * sourceHeight);
      const sw = Math.max(1, Math.min(sourceWidth - sx, Math.round(selection.w * sourceWidth)));
      const sh = Math.max(1, Math.min(sourceHeight - sy, Math.round(selection.h * sourceHeight)));

      setBusy(true);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, sw, sh);
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

        const cropped = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!cropped) throw new Error('empty canvas');

        saveBlobAsFile(cropped, filename);
        showToast(T('Đã cắt: {0}×{1}', [sw, sh]), 'success', 2800);
        closeThumbnailCropper();
      } catch (e) {
        if (closed) return;
        setBusy(false);
        showToast('Cắt ảnh thất bại', 'warning');
      }
    };

    closeBtn.addEventListener('click', closeThumbnailCropper);
    overlay.querySelector('#yt-aid-crop-cancel').addEventListener('click', closeThumbnailCropper);
    resetBtn.addEventListener('click', () => {
      selection = { x: 0, y: 0, w: 1, h: 1 };
      applySelection();
    });
    originalBtn.addEventListener('click', saveOriginal);
    saveBtn.addEventListener('click', saveCropped);

    const onBackdrop = (event) => {
      if (event.target === overlay) closeThumbnailCropper();
    };
    overlay.addEventListener('mousedown', onBackdrop);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeThumbnailCropper();
        return;
      }
      // Let browser/OS shortcuts through, but keep YouTube's single-key
      // shortcuts and page scrolling from firing behind the modal
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.stopImmediatePropagation();
      if (event.key === 'Tab' || event.key === 'Shift') return;
      if (event.key === ' ' || event.key === 'Spacebar' || event.key.startsWith('Arrow') ||
          event.key === 'PageDown' || event.key === 'PageUp' ||
          event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    image.addEventListener('load', () => {
      if (cropOverlayEl !== overlay) return;
      naturalSize = { width: image.naturalWidth, height: image.naturalHeight };
      subtitle.textContent = `${previewText(title, 60)} · ${naturalSize.width} × ${naturalSize.height}`;
      applySelection();
    });

    image.addEventListener('error', () => {
      if (cropOverlayEl !== overlay) return;
      showToast('Không mở được hộp cắt', 'warning');
      closeThumbnailCropper();
    });

    applySelection();
    image.src = objectUrl;

    cropCleanup = () => {
      closed = true;
      if (dragCleanup) dragCleanup();
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.removeEventListener('mousedown', onBackdrop);
      URL.revokeObjectURL(objectUrl);
      if (previousFocus && previousFocus !== document.body &&
          document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch (e) { }
      }
    };
  }

  async function downloadThumbnail(triggerEl, title, rawUrl) {
    if (triggerEl && triggerEl.dataset.ytAidBusy === 'true') return;

    const videoId = videoIdFromUrl(rawUrl || window.location.href);
    if (!videoId) {
      showToast('Không tìm thấy video', 'warning');
      return;
    }

    if (triggerEl) triggerEl.dataset.ytAidBusy = 'true';
    showToast('Đang tải ảnh bìa…', 'info', 1400);

    const blob = await fetchThumbnailBlob(videoId);
    if (triggerEl) delete triggerEl.dataset.ytAidBusy;

    if (!blob) {
      showToast('Không tải được ảnh bìa', 'warning');
      return;
    }

    openThumbnailCropper(blob, `${sanitizeFilename(title)} [${videoId}].jpg`, title);
  }

  // ==========================================
  // 5C. CHANNEL AVATAR & BANNER DOWNLOAD
  // ==========================================
  let channelHeaderDataCache = { path: '', data: null };

  function urlsFromImageSources(sources) {
    if (!Array.isArray(sources)) return [];

    return sources
      .map((source) => {
        if (typeof source === 'string') return source;
        if (!source || typeof source !== 'object') return '';
        if (typeof source.url === 'string') return source.url;
        if (Array.isArray(source.thumbnails) && source.thumbnails[0]) {
          return source.thumbnails[0].url || '';
        }
        return '';
      })
      .filter((url) => /^https?:\/\//.test(url));
  }

  function imageWidthFromUrl(url) {
    const match = String(url || '').match(/=(?:w|s)(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function pickLargestImage(urls) {
    let best = '';
    let bestWidth = -1;

    for (const url of urls) {
      const width = imageWidthFromUrl(url);
      if (width > bestWidth) {
        best = url;
        bestWidth = width;
      }
    }

    return best;
  }

  function highResAvatarUrl(url) {
    if (!url) return '';
    return url.replace(/=s\d+(-|$)/, '=s1024$1');
  }

  function readInitialChannelData() {
    const result = { avatar: '', banner: '', title: '' };
    let data = null;

    for (const script of document.querySelectorAll('script')) {
      if (script.src) continue;
      const text = script.textContent || '';
      const marker = text.indexOf('ytInitialData');
      if (marker === -1) continue;

      const eq = text.indexOf('=', marker);
      const start = eq === -1 ? -1 : text.indexOf('{', eq);
      const end = text.lastIndexOf('}');
      if (start === -1 || end <= start) continue;

      try {
        data = JSON.parse(text.slice(start, end + 1));
        break;
      } catch (e) { }
    }

    if (!data || !data.header) return result;

    const viewModel = data.header.pageHeaderRenderer &&
      data.header.pageHeaderRenderer.content &&
      data.header.pageHeaderRenderer.content.pageHeaderViewModel;
    const legacy = data.header.c4TabbedHeaderRenderer || {};

    const avatarSources =
      (viewModel && viewModel.image && viewModel.image.decoratedAvatarViewModel &&
        viewModel.image.decoratedAvatarViewModel.avatar &&
        viewModel.image.decoratedAvatarViewModel.avatar.avatarViewModel &&
        viewModel.image.decoratedAvatarViewModel.avatar.avatarViewModel.image &&
        viewModel.image.decoratedAvatarViewModel.avatar.avatarViewModel.image.sources) ||
      (viewModel && viewModel.image && viewModel.image.sources) ||
      (legacy.avatar && legacy.avatar.thumbnails) ||
      [];

    const bannerSources =
      (viewModel && viewModel.banner && viewModel.banner.imageBannerViewModel &&
        viewModel.banner.imageBannerViewModel.image &&
        viewModel.banner.imageBannerViewModel.image.sources) ||
      (legacy.banner && legacy.banner.thumbnails) ||
      [];

    result.avatar = pickLargestImage(urlsFromImageSources(avatarSources));
    result.banner = pickLargestImage(urlsFromImageSources(bannerSources));
    result.title =
      (viewModel && viewModel.title && viewModel.title.dynamicTextViewModel &&
        viewModel.title.dynamicTextViewModel.text &&
        viewModel.title.dynamicTextViewModel.text.content) ||
      legacy.title ||
      '';

    return result;
  }

  function domImageSrc(selectors) {
    for (const selector of selectors) {
      const img = document.querySelector(selector);
      if (!img) continue;
      const src = img.currentSrc || img.src || img.getAttribute('src') || '';
      if (/^https?:\/\//.test(src)) return src;
    }
    return '';
  }

  function getChannelHeaderData() {
    const path = window.location.pathname;
    if (channelHeaderDataCache.path !== path) {
      channelHeaderDataCache = { path, data: readInitialChannelData() };
    }

    const cached = channelHeaderDataCache.data || {};
    const avatarCandidates = [
      domImageSrc([
        'yt-page-header-renderer yt-decorated-avatar-view-model img',
        'yt-page-header-renderer yt-avatar-shape img',
        'ytd-c4-tabbed-header-renderer #avatar img',
        '#channel-header-container #avatar img',
        '#page-header yt-avatar-shape img'
      ]),
      cached.avatar
    ].filter(Boolean);

    const bannerCandidates = [
      domImageSrc([
        '#page-header-banner img',
        'yt-image-banner-view-model img',
        'ytd-c4-tabbed-header-renderer #banner img',
        '#channel-header-container #banner img'
      ]),
      cached.banner
    ].filter(Boolean);

    const titleEl = document.querySelector(
      'yt-page-header-renderer h1, #page-header h1, ' +
      'ytd-c4-tabbed-header-renderer #channel-name #text, #channel-header-container #channel-name'
    );

    const avatar = pickLargestImage(avatarCandidates);
    const banner = pickLargestImage(bannerCandidates);

    return {
      avatar: highResAvatarUrl(avatar),
      avatarFallback: avatar,
      banner,
      bannerFallback: banner,
      title: (titleEl && titleEl.textContent.trim()) ||
        cached.title ||
        document.title.replace(' - YouTube', '').trim()
    };
  }

  async function fetchChannelImageBlob(url, fallbackUrl) {
    const candidates = Array.from(new Set([url, fallbackUrl].filter(Boolean)));

    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate, { credentials: 'omit', cache: 'force-cache' });
        if (!res.ok) continue;

        const blob = await res.blob();
        if (blob.size) return blob;
      } catch (e) { }
    }

    return null;
  }

  async function downloadChannelImage(triggerEl, kind) {
    if (triggerEl && triggerEl.dataset.ytAidBusy === 'true') return;

    const data = getChannelHeaderData();
    const isAvatar = kind === 'avatar';
    const url = isAvatar ? data.avatar : data.banner;
    const fallback = isAvatar ? data.avatarFallback : data.bannerFallback;

    if (!url) {
      showToast(
        isAvatar ? 'Không thấy avatar kênh' : 'Không thấy banner kênh',
        'warning'
      );
      return;
    }

    if (triggerEl) triggerEl.dataset.ytAidBusy = 'true';
    showToast(isAvatar ? 'Đang tải avatar…' : 'Đang tải banner…', 'info', 1400);

    const blob = await fetchChannelImageBlob(url, fallback);
    if (triggerEl) delete triggerEl.dataset.ytAidBusy;

    if (!blob) {
      showToast('Không tải được ảnh kênh', 'warning');
      return;
    }

    const channelName = data.title || 'Kênh YouTube';
    const filename = `${sanitizeFilename(channelName)} - ${isAvatar ? 'avatar' : 'banner'}.jpg`;
    openThumbnailCropper(
      blob,
      filename,
      channelName,
      isAvatar ? 'Cắt & tải ảnh đại diện' : 'Cắt & tải ảnh banner'
    );
  }

  // ==========================================
  // DOWNLOAD QUEUE & BACKGROUND TASKS
  // ==========================================
  const downloadQueue = new Map();
  let queueDrawerEl = null;

  function openDownloadQueueDrawer() {
    if (!queueDrawerEl) {
      queueDrawerEl = document.createElement('div');
      queueDrawerEl.className = 'yt-aid-queue-drawer';
      document.body.appendChild(queueDrawerEl);
    }
    renderDownloadQueue();
    queueDrawerEl.classList.add('yt-aid-queue-open');
  }

  function closeDownloadQueueDrawer() {
    if (queueDrawerEl) {
      queueDrawerEl.classList.remove('yt-aid-queue-open');
    }
  }

  function renderDownloadQueue() {
    if (!queueDrawerEl) return;
    const items = Array.from(downloadQueue.values());
    const count = items.length;

    queueDrawerEl.innerHTML = `
      <div class="yt-aid-queue-header">
        <div class="yt-aid-queue-title-wrap">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          <span class="yt-aid-queue-title">${T('Hàng đợi tải xuống')}</span>
          <span class="yt-aid-queue-count">${count}</span>
        </div>
        <button type="button" class="yt-aid-queue-close-btn" id="yt-aid-queue-close" title="${T('Đóng')}">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="yt-aid-queue-list">
        ${count === 0 ? `<div class="yt-aid-queue-empty">${T('Không có tác vụ nào đang tải')}</div>` : ''}
      </div>
    `;

    queueDrawerEl.querySelector('#yt-aid-queue-close').addEventListener('click', closeDownloadQueueDrawer);

    if (count === 0) return;
    const listEl = queueDrawerEl.querySelector('.yt-aid-queue-list');

    items.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'yt-aid-queue-item';
      const isMp3 = item.format === 'mp3';
      const badgeCls = isMp3 ? 'mp3' : 'mp4';
      const badgeText = isMp3 ? 'MP3' : `MP4 ${item.format}p`;
      const isPaused = item.status === 'paused';
      const statusLabel = isPaused ? T('Đã tạm dừng') : (item.status === 'saving' ? T('Đang tải file về máy…') : `${T('Đang chuyển đổi')}: ${item.progress}%`);

      // Icons: Pause (2 bars) vs Resume/Play (triangle), Cancel (X)
      const pauseIconSvg = isPaused
        ? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
      const cancelIconSvg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

      itemEl.innerHTML = `
        <span class="yt-aid-queue-badge ${badgeCls}">${escapeHtml(badgeText)}</span>
        <div class="yt-aid-queue-info">
          <div class="yt-aid-queue-item-title" title="${escapeHtml(item.title)}">${escapeHtml(previewText(item.title, 36))}</div>
          <div class="yt-aid-queue-item-meta">
            <span>${escapeHtml(statusLabel)}</span>
            <span>${item.progress}%</span>
          </div>
          <div class="yt-aid-queue-bar">
            <div class="yt-aid-queue-fill${isPaused ? ' paused' : ''}" style="width: ${item.progress}%"></div>
          </div>
        </div>
        <div class="yt-aid-queue-actions">
          <button type="button" class="yt-aid-queue-btn btn-pause" data-id="${item.id}" title="${isPaused ? T('Tiếp tục') : T('Tạm dừng')}">
            ${pauseIconSvg}
          </button>
          <button type="button" class="yt-aid-queue-btn btn-cancel" data-id="${item.id}" title="${T('Hủy tải xuống')}">
            ${cancelIconSvg}
          </button>
        </div>
      `;

      const pauseBtn = itemEl.querySelector('.btn-pause');
      const cancelBtn = itemEl.querySelector('.btn-cancel');

      pauseBtn.addEventListener('click', () => {
        togglePauseQueueItem(item.id);
      });

      cancelBtn.addEventListener('click', () => {
        cancelQueueItem(item.id);
      });

      listEl.appendChild(itemEl);
    });
  }

  function togglePauseQueueItem(id) {
    const item = downloadQueue.get(id);
    if (!item) return;

    if (item.status === 'paused') {
      // Resume
      item.status = item.downloadId ? 'saving' : 'converting';
      if (item.downloadId) {
        chrome.runtime.sendMessage({ action: 'resumeMediaDownload', downloadId: item.downloadId });
      }
      showToast(T('Tiếp tục'), 'info', 1600);
    } else {
      // Pause
      item.status = 'paused';
      if (item.downloadId) {
        chrome.runtime.sendMessage({ action: 'pauseMediaDownload', downloadId: item.downloadId });
      }
      showToast(T('Đã tạm dừng'), 'warning', 1600);
    }
    renderDownloadQueue();
  }

  function cancelQueueItem(id) {
    const item = downloadQueue.get(id);
    if (!item) return;

    item.aborted = true;
    if (item.pollTimer) {
      clearInterval(item.pollTimer);
      item.pollTimer = null;
    }
    if (item.downloadId) {
      chrome.runtime.sendMessage({ action: 'cancelMediaDownload', downloadId: item.downloadId });
    }
    downloadQueue.delete(id);
    renderDownloadQueue();
    showToast(T('Đã hủy'), 'warning', 2000);
  }

  // ==========================================
  // 5D. MEDIA DOWNLOAD (MP3 & MP4)
  // ==========================================
  let activeMediaDownload = null;
  let mediaDownloadModalEl = null;

  // Chi dong UI modal, KHONG huy download (cho nut X — tai duoi nen)
  function dismissMediaDownloadModal() {
    if (mediaDownloadModalEl) {
      const el = mediaDownloadModalEl;
      mediaDownloadModalEl = null;
      el.classList.remove('yt-aid-dl-open');
      setTimeout(() => el.remove(), settings.enableAnimations ? 180 : 0);
    }
  }

  // Huy download hoan toan + dong UI (cho nut Huy)
  function closeMediaDownloadModal() {
    if (activeMediaDownload && activeMediaDownload.pollTimer) {
      clearInterval(activeMediaDownload.pollTimer);
      activeMediaDownload.pollTimer = null;
    }
    if (activeMediaDownload) {
      activeMediaDownload.aborted = true;
      if (activeMediaDownload.id) downloadQueue.delete(activeMediaDownload.id);
      activeMediaDownload = null;
      renderDownloadQueue();
    }
    dismissMediaDownloadModal();
  }

  function startMediaDownload({ videoUrl, title, format = 'mp3', formatLabel = 'MP3' }) {
    if (!videoUrl) videoUrl = window.location.href;
    const videoId = videoIdFromUrl(videoUrl);
    if (!videoId) {
      showToast(T('Không tìm thấy video'), 'warning');
      return;
    }

    const cleanTitle = (title || getWatchVideoTitle() || 'youtube-video').trim();
    const cleanUrl = cleanYoutubeUrl(videoUrl) || `https://www.youtube.com/watch?v=${videoId}`;
    const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    closeDropdown();
    closeMediaDownloadModal();

    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      showToast(T('Tải lại trang (F5) để tải video'), 'warning', 4000);
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'yt-aid-dl-overlay yt-aid-dl-open';
    overlay.id = 'yt-aid-dl-overlay';
    overlay.innerHTML = `
      <div class="yt-aid-dl-dialog" role="dialog" aria-modal="true" aria-label="${T('Tải Video & Âm thanh')}">
        <div class="yt-aid-dl-header">
          <div class="yt-aid-dl-title-wrap">
            <span class="yt-aid-dl-badge">${escapeHtml(formatLabel)}</span>
            <div class="yt-aid-dl-heading">${T('Tải Video & Âm thanh')}</div>
          </div>
          <button type="button" class="yt-aid-dl-close" id="yt-aid-dl-close" title="${T('Đóng')}" aria-label="${T('Đóng')}">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="yt-aid-dl-body">
          <div class="yt-aid-dl-card">
            <img class="yt-aid-dl-thumb" src="${escapeHtml(thumbUrl)}" alt="" draggable="false" />
            <div class="yt-aid-dl-meta">
              <div class="yt-aid-dl-video-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(previewText(cleanTitle, 55))}</div>
              <div class="yt-aid-dl-status-text" id="yt-aid-dl-status">${T('Đang khởi tạo tiến trình tải…')}</div>
            </div>
          </div>

          <div class="yt-aid-dl-progress-section">
            <div class="yt-aid-dl-progress-bar">
              <div class="yt-aid-dl-progress-fill" id="yt-aid-dl-progress-fill" style="width: 5%"></div>
            </div>
            <div class="yt-aid-dl-progress-info">
              <span class="yt-aid-dl-progress-text" id="yt-aid-dl-progress-text">5%</span>
              <span class="yt-aid-dl-hint-text">${T('Vui lòng đợi máy chủ chuẩn bị file…')}</span>
            </div>
          </div>
        </div>

        <div class="yt-aid-dl-footer">
          <a href="https://loader.to/?link=${encodeURIComponent(cleanUrl)}" target="_blank" rel="noopener" class="yt-aid-dl-backup-link" id="yt-aid-dl-backup" title="${T('Mở trang tải dự phòng')}">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
            <span>${T('Mở trang tải dự phòng')}</span>
          </a>
          <div class="yt-aid-dl-actions">
            <button type="button" class="yt-aid-dl-btn" id="yt-aid-dl-cancel">${T('Hủy')}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    mediaDownloadModalEl = overlay;
    localizeTree(overlay);

    const closeBtn = overlay.querySelector('#yt-aid-dl-close');
    const cancelBtn = overlay.querySelector('#yt-aid-dl-cancel');
    const statusEl = overlay.querySelector('#yt-aid-dl-status');
    const progressFill = overlay.querySelector('#yt-aid-dl-progress-fill');
    const progressText = overlay.querySelector('#yt-aid-dl-progress-text');

    // Nut X va click backdrop: dong modal, tai duoi nen (khong huy)
    const handleDismiss = () => {
      const wasActive = activeMediaDownload && !activeMediaDownload.aborted;
      dismissMediaDownloadModal();
      if (wasActive) {
        showToast(T('Đang tải ngầm'), 'info', 4000, null, () => openDownloadQueueDrawer());
      }
    };
    // Nut Huy: huy download hoan toan
    const handleCancel = () => closeMediaDownloadModal();
    closeBtn.addEventListener('click', handleDismiss);
    cancelBtn.addEventListener('click', handleCancel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handleDismiss();
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKeyDown, true);
        handleDismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    const isMp3 = format === 'mp3';
    const ext = isMp3 ? 'mp3' : 'mp4';
    const suffix = isMp3 ? '' : ` [${format}p]`;
    const targetFilename = `${sanitizeFilename(cleanTitle)} [${videoId}]${suffix}.${ext}`;

    const downloadTaskId = `${videoId}_${format}_${Date.now()}`;
    activeMediaDownload = {
      id: downloadTaskId,
      videoId,
      title: cleanTitle,
      format,
      formatLabel,
      progress: 5,
      status: "converting",
      pollTimer: null,
      downloadId: null,
      aborted: false
    };
    downloadQueue.set(downloadTaskId, activeMediaDownload);
    renderDownloadQueue();

    chrome.runtime.sendMessage({
      action: 'startMediaDownload',
      videoUrl: cleanUrl,
      format
    }, (res) => {
      if (activeMediaDownload?.aborted) return;

      if (!res || !res.success || !res.progressUrl) {
        const errMsg = res?.error || T('Không thể kết nối dịch vụ chuyển đổi, hãy thử lại.');
        if (mediaDownloadModalEl) {
          statusEl.textContent = errMsg;
          statusEl.classList.add('error');
        }
        showToast(T('Lỗi tải: {0}', [errMsg]), 'error');
        return;
      }

      if (mediaDownloadModalEl) {
        statusEl.textContent = T('Đang chuyển đổi: {0}%', ['10']);
        progressFill.style.width = '10%';
        progressText.textContent = '10%';
      }

      let pollAttempts = 0;
      const MAX_POLLS = 120; // 4 minutes

      activeMediaDownload.pollTimer = setInterval(() => {
        pollAttempts++;
        if (pollAttempts > MAX_POLLS) {
          if (activeMediaDownload?.pollTimer) clearInterval(activeMediaDownload.pollTimer);
          if (mediaDownloadModalEl) {
            statusEl.textContent = T('Hết chờ, thử trang dự phòng');
            statusEl.classList.add('error');
          } else {
            showToast(T('Hết chờ, thử trang dự phòng'), 'warning');
          }
          return;
        }

        chrome.runtime.sendMessage({
          action: 'checkMediaProgress',
          progressUrl: res.progressUrl
        }, (pollRes) => {
          if (activeMediaDownload?.aborted) return;

          if (!pollRes || !pollRes.success) {
            return;
          }

          const pct = Math.max(10, Math.min(100, pollRes.progress || 10));
          if (activeMediaDownload && !activeMediaDownload.aborted) {
            activeMediaDownload.progress = pct;
            renderDownloadQueue();
          }
          if (mediaDownloadModalEl) {
            progressFill.style.width = `${pct}%`;
            progressText.textContent = `${pct}%`;
            statusEl.textContent = T('Đang chuyển đổi: {0}%', [String(pct)]);
          }

          if (pollRes.isFinished && pollRes.downloadUrl) {
            if (activeMediaDownload?.pollTimer) clearInterval(activeMediaDownload.pollTimer);
            if (activeMediaDownload) activeMediaDownload.pollTimer = null;

            if (activeMediaDownload && !activeMediaDownload.aborted) {
              activeMediaDownload.status = "saving";
              activeMediaDownload.progress = 100;
              renderDownloadQueue();
            }
            if (mediaDownloadModalEl) {
              progressFill.style.width = '100%';
              progressText.textContent = '100%';
              statusEl.textContent = T('Đang tải file về máy…');
            }

            chrome.runtime.sendMessage({
              action: 'saveMediaFile',
              url: pollRes.downloadUrl,
              filename: targetFilename
            }, (saveRes) => {
              if (activeMediaDownload?.aborted) return;

              if (saveRes?.success) {
                if (saveRes.downloadId && activeMediaDownload) {
                  activeMediaDownload.downloadId = saveRes.downloadId;
                }
                showToast(T('Tải xong!'), 'success', 3000);
                if (activeMediaDownload?.id) {
                  downloadQueue.delete(activeMediaDownload.id);
                  renderDownloadQueue();
                }
                if (mediaDownloadModalEl) {
                  statusEl.textContent = T('Tải xong!');
                  statusEl.classList.add('success');
                  cancelBtn.textContent = T('Đóng');
                  setTimeout(() => {
                    closeMediaDownloadModal();
                  }, 2400);
                } else {
                  // Download hoan tat o nen, don dep
                  if (activeMediaDownload) activeMediaDownload.aborted = true;
                  activeMediaDownload = null;
                }
              } else {
                const a = document.createElement('a');
                a.href = pollRes.downloadUrl;
                a.download = targetFilename;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => a.remove(), 1000);
                showToast(T('Tải xong!'), 'success', 3000);

                if (mediaDownloadModalEl) {
                  statusEl.textContent = T('Tải xong!');
                  cancelBtn.textContent = T('Đóng');
                } else {
                  if (activeMediaDownload) activeMediaDownload.aborted = true;
                  activeMediaDownload = null;
                }
              }
            });
          }
        });
      }, 2000);
    });
  }

  function buildMediaQualityMenu(data) {
    const menu = document.createElement('div');
    menu.id = 'yt-aid-media-menu';
    menu.className = 'yt-aid-tools-menu yt-aid-media-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <div class="yt-aid-tools-title">${T('Chọn chất lượng tải xuống')}</div>

      <button type="button" class="yt-aid-media-menu-item" data-format="1080" data-label="MP4 1080p">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        <span class="yt-aid-media-menu-label">${T('Video MP4 (1080p Full HD)')}</span>
        <span class="yt-aid-media-menu-tag recommended">FHD</span>
      </button>

      <button type="button" class="yt-aid-media-menu-item" data-format="720" data-label="MP4 720p">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        <span class="yt-aid-media-menu-label">${T('Video MP4 (720p HD)')}</span>
        <span class="yt-aid-media-menu-tag recommended">HD</span>
      </button>

      <button type="button" class="yt-aid-media-menu-item" data-format="480" data-label="MP4 480p">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        <span class="yt-aid-media-menu-label">${T('Video MP4 (480p)')}</span>
        <span class="yt-aid-media-menu-tag">480p</span>
      </button>

      <button type="button" class="yt-aid-media-menu-item" data-format="360" data-label="MP4 360p">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        <span class="yt-aid-media-menu-label">${T('Video MP4 (360p)')}</span>
        <span class="yt-aid-media-menu-tag">360p</span>
      </button>

      <div class="yt-aid-media-menu-divider"></div>

      <button type="button" class="yt-aid-media-menu-item" data-format="mp3" data-label="MP3">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        <span class="yt-aid-media-menu-label">${T('Âm thanh MP3')} (320kbps)</span>
        <span class="yt-aid-media-menu-tag">MP3</span>
      </button>

      <div class="yt-aid-media-menu-divider"></div>

      <button type="button" class="yt-aid-media-menu-item" data-action="thumbnail" data-label="Thumbnail">
        ${THUMBNAIL_ICON_SVG}
        <span class="yt-aid-media-menu-label">${T('Tải ảnh bìa thumbnail')}</span>
        <span class="yt-aid-media-menu-tag">IMG</span>
      </button>
    `;

    menu.querySelectorAll('.yt-aid-media-menu-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        if (item.dataset.action === 'thumbnail') {
          downloadThumbnail(null, data?.title || getWatchVideoTitle(), data?.url || window.location.href);
          return;
        }
        const fmt = item.dataset.format;
        const fmtLabel = item.dataset.label;
        startMediaDownload({
          videoUrl: data?.url || window.location.href,
          title: data?.title || getWatchVideoTitle(),
          format: fmt,
          formatLabel: fmtLabel
        });
      });
    });

    localizeTree(menu);
    return menu;
  }

  // ==========================================
  // 5F. CLIP TRIM ("Cắt đoạn" - record a chosen range straight to WebM)
  // ==========================================
  // The clip is captured live from the player element, so it carries exactly
  // what the user hears: the equalised graph when an effect is on, the plain
  // stream otherwise. Recording costs one second of wall time per second of
  // clip and the tab has to keep playing, hence the short cap and the progress
  // bar. No server, no third-party downloader is involved.
  const TRIM_MAX_SECONDS = 60;
  const TRIM_MIN_SECONDS = 1;
  const TRIM_SLACK_MS = 10000;
  const TRIM_VIDEO_MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const TRIM_AUDIO_MIMES = ['audio/webm;codecs=opus', 'audio/webm'];

  let trimMarks = { a: null, b: null };
  let trimSession = null;

  function trimVideoEl() {
    if (!window.location.pathname.startsWith('/watch')) return null;
    const video = getBoostVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return null;
    return video;
  }

  // The two marks are the player's own whole-second clock, so the range only
  // needs sorting; every other state is reported back to the UI as a reason.
  function trimRange() {
    const { a, b } = trimMarks;
    if (a === null || b === null) return { state: 'incomplete' };
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const len = to - from;
    if (len < TRIM_MIN_SECONDS) return { state: 'empty', from, to, len };
    if (len > TRIM_MAX_SECONDS) return { state: 'toolong', from, to, len };
    return { state: 'ready', from, to, len };
  }

  function trimPickMime(candidates) {
    if (!window.MediaRecorder) return null;
    for (const mime of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
      } catch (e) { }
    }
    return null;
  }

  function buildTrimPanelMarkup() {
    return `
      <div class="yt-aid-trim-panel" id="yt-aid-trim-panel" hidden>
        <div class="yt-aid-trim-marks">
          <button type="button" class="yt-aid-trim-mark" id="yt-aid-trim-mark-a" title="${T('Lấy mốc đầu tại vị trí đang phát')}">
            <span class="yt-aid-trim-role">${T('Đầu')}</span>
            <span class="yt-aid-trim-time" id="yt-aid-trim-time-a">--:--</span>
          </button>
          <span class="yt-aid-trim-len" id="yt-aid-trim-len">${T('Chưa chọn đủ hai mốc')}</span>
          <button type="button" class="yt-aid-trim-mark" id="yt-aid-trim-mark-b" title="${T('Lấy mốc cuối tại vị trí đang phát')}">
            <span class="yt-aid-trim-role">${T('Cuối')}</span>
            <span class="yt-aid-trim-time" id="yt-aid-trim-time-b">--:--</span>
          </button>
        </div>
        <div class="yt-aid-trim-actions">
          <button type="button" class="yt-aid-trim-go" id="yt-aid-trim-video" title="${T('Ghi lại cả hình và tiếng cho đoạn đã chọn')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            <span>${T('Tải video')}</span>
          </button>
          <button type="button" class="yt-aid-trim-go" id="yt-aid-trim-audio" title="${T('Chỉ ghi tiếng cho đoạn đã chọn')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3v9.28a4 4 0 1 0 2 3.55V7h2V3h-4zM4 15a2 2 0 0 1 2-2h1v2H6v4h8v-2h-1v-2h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z"/></svg>
            <span>${T('Tải audio')}</span>
          </button>
          <button type="button" class="yt-aid-trim-cancel" id="yt-aid-trim-cancel" hidden>${T('Hủy')}</button>
        </div>
        <div class="yt-aid-trim-progress" id="yt-aid-trim-progress" hidden>
          <div class="yt-aid-trim-fill" id="yt-aid-trim-fill"></div>
        </div>
        <div class="yt-aid-trim-note" id="yt-aid-trim-note">${T('Tối đa 60 giây, giữ tab mở và đang phát tới khi ghi xong')}</div>
      </div>`;
  }

  function setTrimOff(el, off, title) {
    if (!el) return;
    el.classList.toggle('yt-aid-btn-off', !!off);
    el.setAttribute('aria-disabled', off ? 'true' : 'false');
    if (title) el.title = title;
  }

  function syncTrimUi() {
    const panel = document.getElementById('yt-aid-trim-panel');
    if (!panel) return;

    const busy = !!trimSession;
    const range = trimRange();
    const timeA = document.getElementById('yt-aid-trim-time-a');
    const timeB = document.getElementById('yt-aid-trim-time-b');
    const len = document.getElementById('yt-aid-trim-len');
    const note = document.getElementById('yt-aid-trim-note');
    const markA = document.getElementById('yt-aid-trim-mark-a');
    const markB = document.getElementById('yt-aid-trim-mark-b');
    const goVideo = document.getElementById('yt-aid-trim-video');
    const goAudio = document.getElementById('yt-aid-trim-audio');
    const cancel = document.getElementById('yt-aid-trim-cancel');
    const progress = document.getElementById('yt-aid-trim-progress');

    if (timeA) timeA.textContent = trimMarks.a === null ? '--:--' : formatVideoTime(trimMarks.a);
    if (timeB) timeB.textContent = trimMarks.b === null ? '--:--' : formatVideoTime(trimMarks.b);

    if (len) {
      // Numbers only: the chip never needs translating.
      if (range.state === 'incomplete') len.textContent = T('Chưa chọn đủ hai mốc');
      else len.textContent = `${range.len}s / ${TRIM_MAX_SECONDS}s`;
    }

    if (note) {
      if (busy) note.textContent = T('Đang ghi, giữ tab này mở tới khi xong');
      else if (range.state === 'toolong') note.textContent = T('Đoạn cắt tối đa 60 giây, hãy thu ngắn hai mốc');
      else note.textContent = T('Tối đa 60 giây, giữ tab mở và đang phát tới khi ghi xong');
    }

    setTrimOff(markA, busy, busy ? T('Không đổi được mốc khi đang ghi') : T('Lấy mốc đầu tại vị trí đang phát'));
    setTrimOff(markB, busy, busy ? T('Không đổi được mốc khi đang ghi') : T('Lấy mốc cuối tại vị trí đang phát'));
    setTrimOff(goVideo, busy || range.state !== 'ready', trimGoTitle(busy, range, T('Ghi lại cả hình và tiếng cho đoạn đã chọn')));
    setTrimOff(goAudio, busy || range.state !== 'ready', trimGoTitle(busy, range, T('Chỉ ghi tiếng cho đoạn đã chọn')));

    if (cancel) cancel.hidden = !busy;
    if (goVideo) goVideo.hidden = busy;
    if (goAudio) goAudio.hidden = busy;
    if (progress) progress.hidden = !busy;
  }

  // One reason line for both record buttons; the ready case is button-specific.
  function trimGoTitle(busy, range, readyTitle) {
    if (busy) return T('Đang ghi đoạn cắt');
    if (range.state === 'incomplete') return T('Hãy lấy đủ hai mốc trước');
    if (range.state === 'toolong') return T('Đoạn cắt tối đa 60 giây, hãy thu ngắn hai mốc');
    if (range.state === 'empty') return T('Hai mốc trùng nhau');
    return readyTitle;
  }

  function setTrimProgress(pct) {
    const fill = document.getElementById('yt-aid-trim-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
  }

  function setTrimMark(which) {
    if (trimSession) {
      showToast(T('Không đổi được mốc khi đang ghi'), 'warning', 2600);
      return;
    }
    const video = trimVideoEl();
    if (!video) {
      showToast(T('Không tìm thấy video đang phát'), 'warning');
      return;
    }
    if (isAdPlaying()) {
      showToast(T('Đang có quảng cáo, thử lại sau'), 'warning', 3000);
      return;
    }
    trimMarks[which] = Math.max(0, Math.floor(video.currentTime));
    syncTrimUi();
  }

  function toggleTrimPanel(force) {
    const panel = document.getElementById('yt-aid-trim-panel');
    const btn = document.getElementById('yt-aid-btn-trim');
    if (!panel) return;
    const open = typeof force === 'boolean' ? force : panel.hidden;
    if (!open && trimSession) {
      finishTrimRecording('cancel');
      return;
    }
    panel.hidden = !open;
    if (btn) {
      btn.classList.toggle('active', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (open) syncTrimUi();
  }

  // Clear the marks when the user moves to another video: a range taken from
  // one clip has no meaning in the next one.
  function resetTrimForVideo() {
    trimMarks = { a: null, b: null };
    if (trimSession) finishTrimRecording('cancel');
    syncTrimUi();
  }

  function trimRestore(session) {
    if (trimSession === session) trimSession = null;
    if (session.frame) cancelAnimationFrame(session.frame);
    session.frame = 0;
    if (session.tap) {
      try { session.tap.from.disconnect(session.tap.dest); } catch (e) { }
      session.tap = null;
    }
    if (session.onVisibility) {
      document.removeEventListener('visibilitychange', session.onVisibility);
      session.onVisibility = null;
    }

    const video = session.video;
    // YouTube hands a brand-new element to the player on ads and navigations;
    // writing rate or loop to a detached one only fights whatever owns it now.
    if (!video || !video.isConnected) return;
    try { video.playbackRate = session.restore.rate; } catch (e) { }
    // Loop comes back through its own watchdog now that the session is gone.
    ensureVideoLoop();
    if (session.restore.wasPaused) video.pause();
  }

  function trimSaveBlob(session) {
    const blob = new Blob(session.chunks, { type: session.mime });
    if (!blob.size) {
      showToast(T('Video này được bảo vệ nên không ghi được'), 'warning', 3600);
      return;
    }
    const title = getWatchVideoTitle() || 'youtube-clip';
    const suffix = session.kind === 'video' ? 'clip' : 'audio';
    const name = `${sanitizeFilename(title)} [${session.videoId}] ${session.from}s-${session.to}s ${suffix}.webm`;
    saveBlobAsFile(blob, name);
    showToast(T('Đã cắt: {0}', [previewText(name, 24)]), 'success', 3000);
  }

  // 'done' lets the recorder flush and its onstop handler save the file; every
  // other reason drops what was captured, so a half-written clip never lands in
  // the Downloads folder.
  function finishTrimRecording(reason) {
    const session = trimSession;
    if (!session || session.closing) return;
    session.closing = true;
    session.discarded = reason !== 'done';
    if (session.frame) cancelAnimationFrame(session.frame);
    session.frame = 0;

    if (reason === 'done') {
      try { if (session.rec && session.rec.state !== 'inactive') session.rec.stop(); } catch (e) { }
      return;
    }

    try {
      session.rec.onstop = null;
      session.rec.ondataavailable = null;
      if (session.rec.state !== 'inactive') session.rec.stop();
    } catch (e) { }

    trimRestore(session);
    const messages = {
      cancel: T('Đã hủy đoạn cắt'),
      hidden: T('Tab bị ẩn nên đoạn cắt bị hủy'),
      ad: T('Có quảng cáo giữa lúc ghi, đã hủy'),
      stalled: T('Trình phát dừng nên đoạn cắt bị hủy'),
      error: T('Không ghi được đoạn cắt')
    };
    showToast(messages[reason] || messages.error, 'warning', reason === 'cancel' ? 2200 : 3200);
    syncTrimUi();
  }

  function startTrimRecording(kind) {
    if (trimSession) {
      showToast(T('Đang ghi đoạn cắt, hãy đợi'), 'warning', 2600);
      return;
    }
    const video = trimVideoEl();
    if (!video) {
      showToast(T('Không tìm thấy video đang phát'), 'warning');
      return;
    }
    if (isAdPlaying()) {
      showToast(T('Đang có quảng cáo, thử lại sau'), 'warning', 3000);
      return;
    }
    if (document.visibilityState === 'hidden') {
      showToast(T('Mở tab này lên để ghi đoạn cắt'), 'warning', 3000);
      return;
    }

    const range = trimRange();
    if (range.state === 'incomplete') {
      showToast(T('Hãy lấy đủ hai mốc trước'), 'warning');
      return;
    }
    if (range.state === 'empty') {
      showToast(T('Hai mốc trùng nhau'), 'warning');
      return;
    }
    if (range.state === 'toolong') {
      showToast(T('Đoạn cắt tối đa 60 giây, hãy thu ngắn hai mốc'), 'warning', 3200);
      return;
    }
    if (range.to > Math.floor(video.duration)) {
      showToast(T('Mốc cuối vượt quá thời lượng video'), 'warning', 3200);
      return;
    }

    const mime = trimPickMime(kind === 'video' ? TRIM_VIDEO_MIMES : TRIM_AUDIO_MIMES);
    if (!mime) {
      showToast(T('Trình duyệt không hỗ trợ ghi WebM'), 'warning', 3200);
      return;
    }

    let elementStream = null;
    try {
      elementStream = typeof video.captureStream === 'function' ? video.captureStream()
        : (typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream() : null);
    } catch (e) { elementStream = null; }
    const videoTrack = elementStream ? elementStream.getVideoTracks()[0] : null;
    if (kind === 'video' && !videoTrack) {
      showToast(T('Video này được bảo vệ nên không ghi được'), 'warning', 3600);
      return;
    }

    // Once the element is routed through Web Audio its own captureStream audio
    // track stays dry (verified against a graph tap), so the equalised audio has
    // to come out of the graph. With no routing the element still plays through
    // the native path and its own track is the real signal.
    let audioTrack = elementStream ? elementStream.getAudioTracks()[0] : null;
    const session = {
      kind, mime, video, videoId: videoIdFromUrl(window.location.href) || 'video',
      from: range.from, to: range.to,
      chunks: [], rec: null, tap: null, frame: 0, startedAt: 0, closing: false,
      discarded: false, onVisibility: null,
      restore: { rate: video.playbackRate, wasPaused: video.paused }
    };
    // Nothing is a session yet, so a failed setup only has to let go of the tap.
    const bail = (message, duration) => {
      if (session.tap) {
        try { session.tap.from.disconnect(session.tap.dest); } catch (e) { }
        session.tap = null;
      }
      showToast(message, 'warning', duration);
    };

    // The graph only carries sound while this exact element is routed through a
    // running context; a suspended or unbound graph would record digital
    // silence, so the element's own track stays in front of the recorder.
    const boost = audioBoostState;
    const graphLive = !!boost && boost.source && boost.video === video && boost.context.state === 'running';
    if (graphLive) {
      try {
        const dest = boost.context.createMediaStreamDestination();
        boost.clipper.connect(dest);
        const tapped = dest.stream.getAudioTracks()[0];
        if (tapped) {
          audioTrack = tapped;
          session.tap = { dest, from: boost.clipper };
        }
      } catch (e) { }
    }

    const tracks = kind === 'video' ? [videoTrack, audioTrack].filter(Boolean) : [audioTrack].filter(Boolean);
    if (!tracks.some((t) => t.kind === 'audio')) {
      bail(T('Không lấy được tiếng từ video này'), 3200);
      return;
    }

    let rec;
    try {
      const options = kind === 'video'
        ? { mimeType: mime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 }
        : { mimeType: mime, audioBitsPerSecond: 128000 };
      rec = new MediaRecorder(new MediaStream(tracks), options);
    } catch (e) {
      bail(T('Không khởi động được bộ ghi'), 3200);
      return;
    }

    session.rec = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) session.chunks.push(e.data); };
    rec.onerror = () => finishTrimRecording('error');
    rec.onstop = () => {
      trimRestore(session);
      if (session.discarded) { syncTrimUi(); return; }
      trimSaveBlob(session);
      syncTrimUi();
    };

    trimSession = session;
    // Auto Loop and the slowed/sped edit must not fight the recording: loop
    // would rewind before the end mark and a rate would stretch the clip.
    ensureVideoLoop();
    try { video.playbackRate = 1; } catch (e) { }

    const begin = () => {
      if (trimSession !== session || session.closing) return;
      try { rec.start(250); } catch (e) { finishTrimRecording('error'); return; }
      session.startedAt = Date.now();
      syncTrimUi();
      video.play().catch(() => finishTrimRecording('error'));
      watchTrimRange(session);
    };
    video.addEventListener('seeked', begin, { once: true });
    video.currentTime = session.from;
    syncTrimUi();
    // A seek that never reports would leave the recorder waiting forever.
    setTimeout(() => {
      if (trimSession === session && !session.startedAt) {
        video.removeEventListener('seeked', begin);
        begin();
      }
    }, 4000);
  }

  function watchTrimRange(session) {
    const video = session.video;
    // The rAF loop stops while the tab is backgrounded, so the hidden case has
    // to be caught by an event that still fires.
    session.onVisibility = () => {
      if (document.visibilityState === 'hidden') finishTrimRecording('hidden');
    };
    document.addEventListener('visibilitychange', session.onVisibility);

    const tick = () => {
      if (trimSession !== session || session.closing) return;
      if (isAdPlaying()) {
        finishTrimRecording('ad');
        return;
      }

      const span = session.to - session.from;
      const done = span > 0 ? (video.currentTime - session.from) / span : 0;
      setTrimProgress(done * 100);

      if (video.currentTime >= session.to - 0.05 || video.ended) {
        setTrimProgress(100);
        finishTrimRecording('done');
        return;
      }
      if (Date.now() - session.startedAt > span * 1000 + TRIM_SLACK_MS) {
        finishTrimRecording('stalled');
        return;
      }
      session.frame = requestAnimationFrame(tick);
    };
    session.frame = requestAnimationFrame(tick);
  }

  function bindTrimControls(scope) {
    scope.querySelector('#yt-aid-btn-trim')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTrimPanel();
    });
    scope.querySelector('#yt-aid-trim-mark-a')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTrimMark('a');
    });
    scope.querySelector('#yt-aid-trim-mark-b')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTrimMark('b');
    });
    scope.querySelector('#yt-aid-trim-video')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startTrimRecording('video');
    });
    scope.querySelector('#yt-aid-trim-audio')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startTrimRecording('audio');
    });
    scope.querySelector('#yt-aid-trim-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (trimSession) finishTrimRecording('cancel');
    });
  }

  // ==========================================
  // 5. COPY ON SELECT & AUTO-PASTE INTO SEARCH
  // ==========================================
  function normalizeClipboardText(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim();
  }

  // Manual copies (Ctrl+C / context menu) also feed auto-paste, even when
  // copy-on-select is disabled. Cross-tab copies come from readClipboardText().
  function initClipboardCopyTracking() {
    const rememberSelection = () => {
      const text = normalizeClipboardText(window.getSelection());
      if (text) rememberCopiedText(text);
    };
    document.addEventListener('copy', rememberSelection, true);
    document.addEventListener('cut', rememberSelection, true);
  }

  async function readClipboardText() {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return '';
      return normalizeClipboardText(await navigator.clipboard.readText());
    } catch (err) {
      return '';
    }
  }

  function initSelectionCopy() {
    let copyTimer = null;
    let lastCopied = { text: '', at: 0 };

    const copySelection = () => {
      if (cropOverlayEl) return;
      if (!settings.enableSelectionCopy) return;
      if (isTypingContext()) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const anchorEl = selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode && selection.anchorNode.parentElement;
      if (anchorEl && anchorEl.closest('.yt-aid-toast, .yt-aid-toast-container, .yt-aid-tools-menu, .yt-aid-crop-overlay')) {
        return;
      }

      const text = selection.toString().trim();
      if (!text) return;

      const now = Date.now();
      if (text === lastCopied.text && now - lastCopied.at < 1200) return;
      lastCopied = { text, at: now };
      rememberCopiedText(text);

      writeClipboard(text).then((ok) => {
        if (!ok) return;
        showToast(T('Đã copy: "{0}"', [previewText(text, 20)]), 'success', 1800);
      });
    };

    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (copyTimer) clearTimeout(copyTimer);
      // Let the selection settle before reading it
      copyTimer = setTimeout(copySelection, 0);
    }, true);
  }

  function initSearchAutoPaste() {
    let clipboardReadBusy = false;

    const pasteIntoSearch = (input, text) => {
      setSearchInputValue(input, text);
      lastAutoPaste = { value: text, text };
      input.focus();

      // YouTube's search component may run its own focus/click handling; re-check once
      setTimeout(() => {
        if (!input.value.trim()) {
          setSearchInputValue(input, text);
          lastAutoPaste = { value: text, text };
        }
        try {
          input.setSelectionRange(text.length, text.length);
        } catch (err) { }
      }, 60);
    };

    document.addEventListener('mousedown', (e) => {
      if (!settings.enableAutoPasteSearch) return;

      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest('button, a, [role="button"]')) return;

      let input = target.closest(SEARCH_INPUT_SELECTOR);
      if (!isUsableSearchInput(input)) {
        const scope = target.closest(SEARCH_SCOPE_SELECTOR);
        if (!scope) return;
        input = [...scope.querySelectorAll(SEARCH_INPUT_SELECTOR)].find(isUsableSearchInput) || null;
      }
      if (!input) return;
      if (clipboardReadBusy) return;

      const initialValue = input.value;
      const hasText = !!initialValue.trim();
      // Only text this extension wrote may be replaced/appended; anything the
      // user typed themselves is left untouched.
      const wasAutoPasted = hasText && !!lastAutoPaste.value && initialValue === lastAutoPaste.value;
      if (hasText && !wasAutoPasted) return;

      clipboardReadBusy = true;
      readClipboardText().then((clipboardText) => {
        clipboardReadBusy = false;
        if (!document.contains(input)) return;

        // Abort if the field changed while the clipboard was being read
        if (input.value !== initialValue) return;

        // System clipboard covers manual copies and other tabs/apps; the
        // stored copy is the fallback when the read is blocked
        const text = clipboardText || getPasteableText();
        if (!text) return;

        let nextValue = text;
        if (hasText) {
          if (!settings.enableAutoPasteReplace) {
            // Already ends with the newly copied content — nothing to append
            if (initialValue.trimEnd().endsWith(text)) return;
            nextValue = `${initialValue.trimEnd()} ${text}`;
          }
        }
        if (nextValue === initialValue) return;

        pasteIntoSearch(input, nextValue);
        rememberCopiedText(text);

        if (!hasText) {
          showToast(T('Đã dán: "{0}"', [previewText(text, 18)]), 'success', 2000);
        } else if (settings.enableAutoPasteReplace) {
          showToast(T('Đã thay: "{0}"', [previewText(text, 18)]), 'success', 2000);
        } else {
          showToast(T('Đã thêm: "{0}"', [previewText(text, 18)]), 'success', 2000);
        }
      });
    }, true);
  }

  // ==========================================
  // 6. DOM OBSERVER & NATIVE TOOLBAR INJECTION
  // ==========================================
  function initDOMObserver() {
    injectAllAreas();

    let injectionQueued = false;
    let fullScanNeeded = false;
    const pendingCardRoots = new Set();
    const scheduleInjection = (delay = 200, fullScan = false) => {
      fullScanNeeded ||= fullScan;
      if (document.visibilityState === 'hidden') {
        fullScanNeeded = true;
        pendingCardRoots.clear();
        return;
      }
      if (injectionQueued) return;
      injectionQueued = true;
      setTimeout(() => {
        injectionQueued = false;
        if (document.visibilityState === 'hidden') {
          fullScanNeeded = true;
          pendingCardRoots.clear();
          return;
        }
        const roots = fullScanNeeded ? undefined : [...pendingCardRoots];
        fullScanNeeded = false;
        pendingCardRoots.clear();
        injectAllAreas(roots);
      }, delay);
    };

    const AID_UI_SELECTOR = '#yt-aid-channel-actions, #yt-aid-watch-toolbar, .yt-aid-card-bar, .yt-aid-home-trigger, #yt-aid-home-bookmark-btn, #yt-aid-random-home, .yt-aid-shorts-action';
    // Native hosts carry our layout classes but still need reinjection after rerenders.
    const AID_UI_SCOPE = '[class*="yt-aid-"]:not(.yt-aid-home-card-host):not(.yt-aid-channel-actions-host):not(body):not(html), [id^="yt-aid-"]';
    // None of the injection targets live in these subtrees. They are also the
    // biggest mutation sources (comments alone were ~78% on a watch page), so
    // ignoring them keeps idle playback from re-scanning the page.
    const IGNORED_SCOPES = '#movie_player, .html5-video-player, ytd-comments, #comments, ' +
      'ytd-live-chat-frame, #chat, ytd-guide-renderer, ytd-mini-guide-renderer, ' +
      '#masthead-container, ytd-popup-container, #a11y-announcements';
    const containsAidUi = (node) => node.nodeType === 1 &&
      (node.matches(AID_UI_SELECTOR) || !!node.querySelector(AID_UI_SELECTOR));
    const insideAidUi = (node) => node.nodeType === 1 && !!node.closest(AID_UI_SCOPE);
    const insideIgnoredScope = (node) => node.nodeType === 1 && !!node.closest(IGNORED_SCOPES);

    const cardSelector = `${HOME_CARD_ITEM_SELECTOR}, ${SIDEBAR_CARD_SELECTOR}`;
    const observer = new MutationObserver((mutations) => {
      if (document.visibilityState === 'hidden') {
        fullScanNeeded = true;
        pendingCardRoots.clear();
        return;
      }
      let relevant = false;
      for (const { target, addedNodes, removedNodes } of mutations) {
        if (insideAidUi(target) || insideIgnoredScope(target)) continue;
        const card = target.nodeType === 1 ? target.closest(cardSelector) : target.parentElement?.closest(cardSelector);
        for (const node of addedNodes) {
          if (insideAidUi(node)) continue;
          if (card) pendingCardRoots.add(card);
          else if (node.nodeType === 1) pendingCardRoots.add(node);
          relevant = true;
        }
        if (card && removedNodes.length) {
          pendingCardRoots.add(card);
          relevant = true;
        } else {
          for (const node of removedNodes) {
            if (containsAidUi(node)) { relevant = true; break; }
          }
        }
      }
      if (relevant) scheduleInjection();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener('yt-navigate-start', () => {
      cancelRandomVideo();
      closeDropdown();
      // The player hands over a new element on navigation, so a running
      // recording can no longer reach its end mark.
      if (trimSession) finishTrimRecording('cancel');
      try { dismissMediaDownloadModal(); } catch (e) { }
    });
    window.addEventListener('pagehide', cancelRandomVideo);
    window.addEventListener('yt-navigate-finish', () => {
      cancelRandomVideo();
      closeHomeFlyout();
      closeDropdown();
      resetTrimForVideo();
      try { dismissMediaDownloadModal(); } catch (e) { }
      scheduleInjection(80, true);
    });

    document.addEventListener('yt-page-data-updated', () => scheduleInjection(120, true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') scheduleInjection(0, true);
    });
  }

  function isChannelPage() {
    const path = window.location.pathname;
    if (path.startsWith('/watch') || path === '/' ||
        path.startsWith('/results') || path.startsWith('/feed')) {
      return false;
    }

    if (path.startsWith('/@') || path.startsWith('/channel/') ||
        path.startsWith('/c/') || path.startsWith('/user/')) {
      return true;
    }

    return !!document.querySelector('#page-header-banner, ytd-c4-tabbed-header-renderer');
  }

  function injectAllAreas(cardRoots) {
    const path = window.location.pathname;
    const hasCardTools = settings.enableCopyButtons || settings.enableCleanLink ||
      settings.enableThumbnailDownload || settings.enableMediaDownload;

    if (!isHomeFeedPage()) closeHomeFlyout();
    injectBookmarkUi();
    injectRandomHomeControl();

    if (path.startsWith('/watch')) {
      injectWatchPageToolbar();
      if (hasCardTools) injectSidebarButtons(cardRoots);
    } else if (isShortsPage()) {
      injectShortsActions();
    } else if (path === '/' || path.startsWith('/results') || path.startsWith('/feed')) {
      if (hasCardTools) injectHomePageCards(cardRoots);
    } else if (isChannelPage()) {
      injectChannelHeaderActions();
    }
  }

  // ----------------------------------------------------
  // A. WATCH PAGE INJECTION
  // ----------------------------------------------------
  function injectWatchPageToolbar() {
    if (!window.location.pathname.startsWith('/watch')) return;

    // Replace any toolbar injected by a different build instead of silently
    // reusing it: its click handlers may belong to older, broken code.
    let hasCurrentToolbar = false;
    document.querySelectorAll('.yt-aid-watch-toolbar').forEach((bar) => {
      if (bar.dataset.ytAidVersion === EXT_VERSION) hasCurrentToolbar = true;
      else bar.remove();
    });
    if (hasCurrentToolbar) {
      // YouTube keeps the watch DOM (and this toolbar) alive across SPA
      // navigations, so the sliders must be re-read for the current video
      // instead of showing the previous one's edit.
      syncAudioUi();
      return;
    }

    const titleContainer = document.querySelector(
      'ytd-watch-metadata #title, #above-the-fold #title, ytd-video-primary-info-renderer #container'
    );

    if (!titleContainer) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'yt-aid-watch-toolbar';
    toolbar.className = 'yt-aid-watch-toolbar';
    toolbar.dataset.ytAidVersion = EXT_VERSION;

    toolbar.innerHTML = `
      <div class="yt-aid-toolbar-main">
        <!-- Bookmark (lưu mốc thời gian hiện tại) + log của video này -->
        <div class="yt-aid-split-group yt-aid-bookmark-group">
          <button class="yt-aid-pill-btn yt-aid-bookmark-btn" id="yt-aid-btn-bookmark" title="${T('Lưu bookmark tại thời điểm đang xem')}">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>
            <span>Đánh dấu</span>
          </button>
          <button class="yt-aid-pill-btn yt-aid-pill-sub yt-aid-bookmark-log-btn" id="yt-aid-btn-bookmark-log" title="${T('Xem log bookmark của video này')}" aria-label="${T('Xem log bookmark của video này')}" aria-haspopup="true" aria-expanded="false">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
            <span></span>
          </button>
        </div>

        <!-- Clean Copy Link -->
        <button class="yt-aid-pill-btn yt-aid-clean-link" id="yt-aid-btn-clean-link" title="Copy Link: sao chép liên kết sạch không query tracking" aria-label="Copy Link">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <span>Copy Link</span>
        </button>

        <!-- Copy Title Split Button Group -->
        <div class="yt-aid-split-group" id="yt-aid-copy-title-group">
          <!-- 1. Copy Title Pure -->
          <button class="yt-aid-pill-btn" id="yt-aid-btn-copy-pure" title="Sao chép tiêu đề video">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <span>Copy Title</span>
          </button>

          <!-- 2. Copy + Search + Enter -->
          <button class="yt-aid-pill-btn yt-aid-pill-sub" id="yt-aid-btn-copy-enter" title="Copy & tự động tìm kiếm trực tiếp (Ctrl+Click mở tab mới)" aria-label="Copy và tìm kiếm trực tiếp">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M3 2h7a2 2 0 0 1 2 2v1h-2V4H3v9h1v2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 4h6a2 2 0 0 1 2 2v1h-2V8H6v7h2v2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
              <path fill="currentColor" d="M17 2a3 3 0 1 0 2 5.2l2.3 2.3 1.4-1.4-2.3-2.3A3 3 0 0 0 17 2zm0 1.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>
              <path fill="currentColor" d="M19 14v3H12.8l2.6-2.6-1.4-1.4L9 18l5 5 1.4-1.4-2.6-2.6H21v-5h-2z"/>
            </svg>
            <span>Quick Search</span>
          </button>
          <button class="yt-aid-newtab-btn" id="yt-aid-btn-copy-enter-newtab" title="Mở tìm kiếm sang tab mới">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
          </button>
        </div>

        <!-- Jump to the "Most replayed" segment YouTube marks on the seekbar. -->
        <button class="yt-aid-pill-btn yt-aid-highlight-btn yt-aid-btn-off" type="button" id="yt-aid-btn-highlight" title="Video không có đoạn nổi bật" aria-label="Video không có đoạn nổi bật" aria-disabled="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.6l2.5 5.6 6.1.7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 8.9l6.1-.7L12 2.6zm0 12.9 2.2 1.3-.5-2.5 1.9-1.7-2.6-.3-1-2.4-1 2.4-2.6.3 1.9 1.7-.5 2.5 2.2-1.3zM4 20h16v1.6H4V20z"/></svg>
          <span>Đoạn nổi bật</span>
        </button>

        <!-- Unified Download Button (MP3, MP4, Thumbnail) -->
        ${(settings.enableMediaDownload || settings.enableThumbnailDownload) ? `
        <button class="yt-aid-pill-btn yt-aid-downloads-btn yt-aid-media-btn" id="yt-aid-btn-media" title="${T('Tải xuống')}" aria-label="${T('Tải xuống')}" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          <span>Download</span>
          <svg class="yt-aid-chevron" viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
        </button>
        ` : ''}
        ${settings.enableMediaDownload ? `
        <button class="yt-aid-pill-btn yt-aid-trim-btn ${trimSession ? 'active' : ''}" type="button" id="yt-aid-btn-trim" title="${T('Cắt đoạn video để tải xuống')}" aria-label="${T('Cắt đoạn video để tải xuống')}" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.64 7.64c.23-.51.36-1.06.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.58 0 1.13-.13 1.64-.36L10 12l-2.36 2.36C7.13 14.13 6.58 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.58-.13-1.13-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/></svg>
          <span>${T('Cắt đoạn')}</span>
        </button>
        ` : ''}
      </div>

      <div class="yt-aid-toolbar-row">
      <button type="button" class="yt-aid-pill-btn yt-aid-audio-collapsed" id="yt-aid-btn-audio-collapsed" title="${T('Mở rộng giao diện âm thanh')}" aria-label="${T('Mở rộng giao diện âm thanh')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
        <span>${T('Âm thanh')}</span>
      </button>
      ${buildAudioPanelMarkup({ collapsible: true })}

      <!-- Playback utilities, stacked beside the sound board: loop, then the
           miniplayer, then random underneath (appended below). -->
      <div class="yt-aid-toolbar-stack" id="yt-aid-toolbar-stack-media">
        <!-- Auto Loop Toggle Button -->
        <button class="yt-aid-pill-btn yt-aid-loop-indicator ${settings.enableLoop ? 'active' : ''}" id="yt-aid-btn-toggle-loop" title="${settings.enableLoop ? 'Auto Loop đang bật' : 'Auto Loop đang tắt'}">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>Autoloop: ${settings.enableLoop ? 'ON' : 'OFF'}</span>
        </button>

        <!-- Miniplayer Toggle Button -->
        <button class="yt-aid-pill-btn yt-aid-miniplayer-indicator" id="yt-aid-btn-miniplayer" title="Trình phát thu nhỏ" aria-pressed="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 11h-8v6h8v-6zM21 3H3v18h18V3zM19 19H5V5h14v14z"/></svg>
          <span>Thu nhỏ</span>
        </button>
      </div>

      <!-- Right edge of the bar: name toggle keeps the top slot, so it holds
           the same spot in both label and icon mode. -->
      <div class="yt-aid-toolbar-stack yt-aid-toolbar-preferences">
        <!-- Collapse the toolbar labels to icons only -->
        <button class="yt-aid-pill-btn yt-aid-name-toggle" id="yt-aid-btn-toggle-names" title="Ẩn tên các nút trong thanh công cụ" aria-pressed="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.83 0l7-7a2 2 0 0 0 0-2.84zM7 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
          <span>Hide Button Name</span>
        </button>

        <!-- Extra tools dropdown -->
        <button class="yt-aid-pill-btn yt-aid-tools-btn" id="yt-aid-btn-tools" title="Tính năng phụ" aria-label="Tính năng phụ" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
          <span>Tools</span>
          <svg class="yt-aid-chevron" viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
        </button>
      </div>
      </div>

      ${buildTrimPanelMarkup()}
    `;

    toolbar.querySelector('#yt-aid-toolbar-stack-media').append(buildRandomVideoControl());
    titleContainer.appendChild(toolbar);
    localizeTree(toolbar);
    syncRandomVideoUi();
    syncButtonNamesUi();
    syncAudioUi();
    syncHighlightUi();
    scheduleHighlightTick(600);
    watchMiniplayerState();
    syncMiniplayerUi();

    // 1. Copy Pure
    toolbar.querySelector('#yt-aid-btn-copy-pure').addEventListener('click', () => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, T('Đã copy: "{0}"', [previewText(title, 20)]));
    });

    // 2. Copy + Search + Enter
    const btnCopyEnter = toolbar.querySelector('#yt-aid-btn-copy-enter');
    const handleCopyEnter = (e) => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, '');
      if (e.ctrlKey || e.metaKey || e.button === 1) {
        openSearchInNewTab(title);
      } else {
        autoEnterSearch(title);
      }
    };
    btnCopyEnter.addEventListener('click', handleCopyEnter);
    btnCopyEnter.addEventListener('auxclick', (e) => {
      if (e.button === 1) handleCopyEnter(e);
    });

    // 2b. New Tab Action for Copy + Search + Enter
    toolbar.querySelector('#yt-aid-btn-copy-enter-newtab').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, '');
      openSearchInNewTab(title);
    });

    // Clean Link
    toolbar.querySelector('#yt-aid-btn-clean-link').addEventListener('click', () => {
      const cleanUrl = cleanYoutubeUrl(window.location.href);
      copyTextToClipboard(cleanUrl, T('Đã copy link: {0}', [previewText(cleanUrl, 24)]));
    });

    // Highlight jump — disabled state still answers the click with the reason,
    // because a truly inert button would hide the note the user asked for.
    toolbar.querySelector('#yt-aid-btn-highlight').addEventListener('click', () => {
      void seekToHighlight();
    });

    // Bookmark current video
    const bookmarkBtn = toolbar.querySelector('#yt-aid-btn-bookmark');
    bookmarkBtn.addEventListener('mouseenter', () => {
      bookmarkBtn.title = T('Lưu bookmark tại {0}', [formatVideoTime(getCurrentVideoTime())]);
    });
    bookmarkBtn.addEventListener('click', () => {
      if (isAdPlaying()) {
        showToast('Đang có quảng cáo, thử lại sau', 'warning');
        return;
      }
      addBookmark(currentWatchBookmarkData(), getCurrentVideoTime());
    });

    const bookmarkLogBtn = toolbar.querySelector('#yt-aid-btn-bookmark-log');
    bookmarkLogBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(bookmarkLogBtn, buildBookmarkLogMenu);
    });

    syncBookmarkButtons();

    // Unified Download dropdown (MP3, MP4, Thumbnail)
    const mediaBtn = toolbar.querySelector('#yt-aid-btn-media');
    if (mediaBtn) {
      mediaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(mediaBtn, () => buildMediaQualityMenu({
          url: window.location.href,
          title: getWatchVideoTitle()
        }));
      });
    }

    // Inline audio controls (sliders, reset, presets) — shared with Shorts.
    bindAudioControls(toolbar);

    // Fold the whole audio panel into a single "Âm thanh" pill and back.
    toolbar.querySelector('#yt-aid-audio-collapse')?.addEventListener('click', () => {
      setAudioPanelCollapsed(true);
    });
    toolbar.querySelector('#yt-aid-btn-audio-collapsed').addEventListener('click', () => {
      setAudioPanelCollapsed(false);
    });

    // Toggle Auto Loop
    const loopBtn = toolbar.querySelector('#yt-aid-btn-toggle-loop');
    loopBtn.addEventListener('click', () => {
      const nextLoop = !settings.enableLoop;
      const forcedOff = isLoopBlocked();
      settings.enableLoop = nextLoop;
      safeSetStorage({ enableLoop: nextLoop });
      // While an ad forces loop off, remember the new choice and let the
      // button show it; skip the toast so the forced pause stays invisible.
      ensureVideoLoop();
      if (!forcedOff) {
        showToast(nextLoop ? 'Tự động lặp: BẬT' : 'Tự động lặp: TẮT', 'info');
      }
    });

    // Toggle the corner miniplayer
    toolbar.querySelector('#yt-aid-btn-miniplayer').addEventListener('click', () => {
      void toggleMiniplayer();
    });

    // Tools dropdown
    const toolsBtn = toolbar.querySelector('#yt-aid-btn-tools');
    toolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(toolsBtn, buildToolsMenu);
    });

    // Hide/show the labels of every button in this toolbar
    toolbar.querySelector('#yt-aid-btn-toggle-names').addEventListener('click', (e) => {
      e.stopPropagation();
      updateSetting('hideButtonNames', !settings.hideButtonNames);
      syncButtonNamesUi();
    });

    bindTrimControls(toolbar);
    syncTrimUi();
  }

  // ----------------------------------------------------
  // A3. SHORTS PAGE INJECTION (extra volume + downloads)
  // ----------------------------------------------------
  // YouTube serves the feed at /shorts/<id> but also lands on the bare /shorts
  // and /feed/shorts routes, so a "/shorts/" prefix alone misses the page.
  function isShortsPage() {
    const path = window.location.pathname;
    return path === '/shorts' || path.startsWith('/shorts/') ||
      path === '/feed/shorts' || path.startsWith('/feed/shorts/');
  }

  function currentShortsId() {
    const match = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : '';
  }

  function getShortsTitle() {
    const selectors = [
      'yt-shorts-video-title-view-model',
      'ytd-shorts-video-title yt-formatted-string',
      'ytd-shorts-video-title #title',
      '#shorts-title yt-formatted-string',
      'ytd-reel-multi-format-link h2',
      'ytd-reel-player-header-renderer h2'
    ];
    for (const selector of selectors) {
      const found = document.querySelector(selector);
      const text = found && found.textContent ? found.textContent.trim() : '';
      if (text) return text;
    }
    return '';
  }

  const SHORTS_ACTION_SVG = {
    audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'
  };

  // The audio panel opens as a dropdown over the Shorts player; the same
  // markup and bindings as the watch toolbar, just in a narrower popover.
  function buildShortsAudioMenu() {
    const menu = document.createElement('div');
    menu.id = 'yt-aid-shorts-audio-menu';
    menu.className = 'yt-aid-tools-menu yt-aid-shorts-audio-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <div class="yt-aid-tools-title">${T('Âm thanh')} · ${T('Tăng âm lượng video')}</div>
      ${buildAudioPanelMarkup()}
    `;
    bindAudioControls(menu);
    localizeTree(menu);
    return menu;
  }

  // YouTube keeps moving the engagement rail. Current builds render a
  // <reel-action-bar-view-model> column inside the overlay view model; older
  // ones used #actions, and the active-reel attribute is gone altogether, so
  // walk the known shapes and take the first one that is actually on screen.
  const SHORTS_RAIL_SELECTORS = [
    'reel-action-bar-view-model',
    '.ytReelPlayerOverlayViewModelActionsContainer',
    'ytd-reel-video-renderer[is-active] #actions',
    'ytd-reel-player-overlay-renderer #actions',
    'ytd-reel-player-overlay-renderer-cow #actions',
    '#actions'
  ];

  function findShortsActionRail() {
    for (const selector of SHORTS_RAIL_SELECTORS) {
      const found = [...document.querySelectorAll(selector)].find((node) => {
        if (!node.isConnected) return false;
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (found) return found;
    }
    return null;
  }

  // The same rail survives every swipe in the feed, so remember the one we
  // stamped. Without this, each mutation batch YouTube produces while scrolling
  // ran the whole search above — six document-wide queries plus a forced layout
  // per match — on a page that is already the slowest to update.
  let shortsRail = null;

  const shortsDownloadAllowed = () => settings.enableMediaDownload || settings.enableThumbnailDownload;

  function hasShortsActions() {
    if (!shortsRail || !shortsRail.isConnected) return false;
    if (!shortsRail.querySelector('#yt-aid-shorts-audio')) return false;
    // Turning downloads on in Options must add the button to a rail that already
    // holds the audio one, so a cached rail only counts as complete when it
    // matches the current settings.
    if (shortsDownloadAllowed() && !shortsRail.querySelector('#yt-aid-shorts-download')) return false;
    return true;
  }

  // The rail only gets a size once the player has started, and that is a layout
  // change rather than a DOM change, so the mutation observer never sees it.
  // Retry on a timer until the buttons are actually in place.
  const SHORTS_RETRY_MS = 500;
  const SHORTS_RETRY_TRIES = 30;
  let shortsRetryTimer = 0;

  function stopShortsRetry() {
    if (!shortsRetryTimer) return;
    clearInterval(shortsRetryTimer);
    shortsRetryTimer = 0;
  }

  function scheduleShortsRetry() {
    if (shortsRetryTimer || !isShortsPage()) return;
    let tries = SHORTS_RETRY_TRIES;
    shortsRetryTimer = setInterval(() => {
      if (document.visibilityState === 'hidden' || !isShortsPage()) {
        stopShortsRetry();
        return;
      }
      injectShortsActions();
      if (hasShortsActions() || --tries <= 0) stopShortsRetry();
    }, SHORTS_RETRY_MS);
  }

  function injectShortsActions() {
    if (!isShortsPage()) return;
    if (hasShortsActions()) {
      stopShortsRetry();
      return;
    }
    const actions = findShortsActionRail();
    if (!actions) {
      scheduleShortsRetry();
      return;
    }

    // Drop buttons left by an older build before re-using the rail.
    actions.querySelectorAll('.yt-aid-shorts-action').forEach((el) => {
      if (el.dataset.ytAidVersion !== EXT_VERSION) el.remove();
    });
    shortsRail = actions;

    // Extra volume: the audio engine already follows the active reel's video,
    // this button only exposes the panel.
    if (!actions.querySelector('#yt-aid-shorts-audio')) {
      const audioBtn = document.createElement('button');
      audioBtn.type = 'button';
      audioBtn.className = 'yt-aid-shorts-action';
      audioBtn.id = 'yt-aid-shorts-audio';
      audioBtn.dataset.ytAidVersion = EXT_VERSION;
      audioBtn.title = T('Âm thanh');
      audioBtn.setAttribute('aria-label', T('Âm thanh'));
      audioBtn.setAttribute('aria-haspopup', 'true');
      audioBtn.setAttribute('aria-expanded', 'false');
      audioBtn.innerHTML = SHORTS_ACTION_SVG.audio;
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(audioBtn, buildShortsAudioMenu);
      });
      actions.insertBefore(audioBtn, actions.firstChild);
    }

    // Downloads: the same quality menu as the watch page, pointed at this Short.
    if (shortsDownloadAllowed()) {
      if (!actions.querySelector('#yt-aid-shorts-download')) {
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'yt-aid-shorts-action';
        downloadBtn.id = 'yt-aid-shorts-download';
        downloadBtn.dataset.ytAidVersion = EXT_VERSION;
        downloadBtn.title = T('Tải xuống');
        downloadBtn.setAttribute('aria-label', T('Tải xuống'));
        downloadBtn.setAttribute('aria-haspopup', 'true');
        downloadBtn.setAttribute('aria-expanded', 'false');
        downloadBtn.innerHTML = SHORTS_ACTION_SVG.download;
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const shortsId = currentShortsId();
          const url = shortsId ? `https://www.youtube.com/watch?v=${shortsId}` : window.location.href;
          toggleDropdown(downloadBtn, () => buildMediaQualityMenu({
            url,
            title: getShortsTitle() || getWatchVideoTitle() || 'YouTube Shorts'
          }));
        });
        actions.insertBefore(downloadBtn, actions.firstChild);
      }
    }

    stopShortsRetry();
  }

  // ==========================================
  // 7. TOOLS DROPDOWN
  // ==========================================
  let dropdownEl = null;
  let dropdownBtn = null;

  function closeDropdown() {
    closeFavoritePicker();
    if (dropdownBtn) dropdownBtn.setAttribute('aria-expanded', 'false');
    const menu = dropdownEl;
    dropdownEl = null;
    dropdownBtn = null;
    if (!menu) return;

    menu.classList.remove('yt-aid-tools-menu-show');
    setTimeout(() => menu.remove(), settings.enableAnimations ? 160 : 0);
  }

  function toggleDropdown(btn, buildMenu) {
    if (dropdownEl && dropdownBtn === btn) {
      closeDropdown();
      return;
    }

    closeDropdown();
    const menu = buildMenu();
    document.body.appendChild(menu);

    const rect = btn.getBoundingClientRect();
    const gap = 12;
    const edge = 6;
    // The menu is zoomed by the UI-scale setting, so measure it visually and
    // divide the offsets back at the end: zoom multiplies the panel's own
    // left/top too, and unscalePx keeps the result anchored where it should be.
    const menuBox = menu.getBoundingClientRect();
    const menuWidth = menuBox.width;
    const menuHeight = menuBox.height;
    const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    // Keep the whole menu on screen: flip above the button when the space
    // below would force the last row out of view.
    const openUp = menuHeight > spaceBelow && spaceAbove > spaceBelow;

    const maxLeft = window.innerWidth - menuWidth - 12;
    menu.style.left = `${Math.round(unscalePx(Math.max(12, Math.min(rect.right - menuWidth, maxLeft))))}px`;

    if (openUp) {
      menu.style.maxHeight = `${Math.round(unscalePx(Math.max(160, spaceAbove - 14)))}px`;
      menu.style.top = `${Math.round(unscalePx(Math.max(edge, rect.top - gap - Math.min(menuHeight, spaceAbove))))}px`;
    } else {
      menu.style.maxHeight = `${Math.round(unscalePx(Math.max(160, spaceBelow - 14)))}px`;
      menu.style.top = `${Math.round(unscalePx(rect.bottom + gap))}px`;
    }

    dropdownEl = menu;
    dropdownBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('yt-aid-tools-menu-show'));
  }

  function syncToolbarState() {
    syncLoopButton();

    const selectionToggle = document.getElementById('yt-aid-toggle-selection-copy');
    if (selectionToggle) selectionToggle.checked = !!settings.enableSelectionCopy;

    const autoPasteToggle = document.getElementById('yt-aid-toggle-auto-paste');
    if (autoPasteToggle) autoPasteToggle.checked = !!settings.enableAutoPasteSearch;

    const autoPasteReplaceToggle = document.getElementById('yt-aid-toggle-auto-paste-replace');
    if (autoPasteReplaceToggle) autoPasteReplaceToggle.checked = !!settings.enableAutoPasteReplace;

    const animToggle = document.getElementById('yt-aid-toggle-animations');
    if (animToggle) animToggle.checked = !settings.enableAnimations;

    syncButtonNamesUi();
    syncHighlightUi();
    syncMiniplayerUi();
    syncTrimUi();

    const toolsMenu = document.getElementById('yt-aid-tools-menu');
    if (toolsMenu) {
      syncQualityUi(toolsMenu);
      syncThemeUi(toolsMenu);
    }
  }

  // Collapses every toolbar label to icons only. The toggle button keeps its
  // own label so the next click is always self-explanatory.
  function syncButtonNamesUi() {
    const hidden = !!settings.hideButtonNames;
    document.querySelectorAll('.yt-aid-watch-toolbar').forEach((bar) => {
      bar.classList.toggle('yt-aid-hide-names', hidden);
    });
    const btn = document.getElementById('yt-aid-btn-toggle-names');
    if (!btn) return;
    btn.title = T(hidden ? 'Hiện tên các nút trong thanh công cụ' : 'Ẩn tên các nút trong thanh công cụ');
    btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    const label = btn.querySelector('span');
    if (label) label.textContent = T(hidden ? 'Show Button Name' : 'Hide Button Name');
  }

  function updateSetting(key, value) {
    settings[key] = value;
    safeSetStorage({ [key]: value });
  }

  function buildToolsMenu() {
    const menu = document.createElement('div');
    menu.id = 'yt-aid-tools-menu';
    menu.className = 'yt-aid-tools-menu';
    const checked = (value) => (value ? ' checked' : '');
    menu.innerHTML = `
      <div class="yt-aid-tools-title">${T('Tính năng phụ')}${EXT_VERSION ? ` · v${EXT_VERSION}` : ''}</div>

      <label class="yt-aid-tools-item">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Tự động copy khi bôi đen</span>
          <span class="yt-aid-tools-desc">Bôi xanh đoạn text để sao chép ngay</span>
        </span>
        <span class="yt-aid-switch">
          <input type="checkbox" id="yt-aid-toggle-selection-copy"${checked(settings.enableSelectionCopy)}>
          <span class="yt-aid-switch-slider"></span>
        </span>
      </label>

      <label class="yt-aid-tools-item">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Tự động dán vào ô tìm kiếm</span>
          <span class="yt-aid-tools-desc">Click ô tìm kiếm để dán nội dung bạn vừa copy</span>
        </span>
        <span class="yt-aid-switch">
          <input type="checkbox" id="yt-aid-toggle-auto-paste"${checked(settings.enableAutoPasteSearch)}>
          <span class="yt-aid-switch-slider"></span>
        </span>
      </label>

      <label class="yt-aid-tools-item">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Thay nội dung đã dán</span>
          <span class="yt-aid-tools-desc">Copy nội dung mới sẽ thay nội dung cũ; tắt để nối thêm vào sau</span>
        </span>
        <span class="yt-aid-switch">
          <input type="checkbox" id="yt-aid-toggle-auto-paste-replace"${checked(settings.enableAutoPasteReplace)}>
          <span class="yt-aid-switch-slider"></span>
        </span>
      </label>

      <label class="yt-aid-tools-item">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Chế độ hiệu năng</span>
          <span class="yt-aid-tools-desc">Bật để giảm hiệu ứng, tăng hiệu năng và giảm tải GPU</span>
        </span>
        <span class="yt-aid-switch">
          <input type="checkbox" id="yt-aid-toggle-animations"${checked(!settings.enableAnimations)}>
          <span class="yt-aid-switch-slider"></span>
        </span>
      </label>

      <div class="yt-aid-tools-item" id="yt-aid-tools-theme">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Chủ đề tiện ích</span>
          <span class="yt-aid-tools-desc">Chỉ đổi giao diện của tiện ích, không đổi giao diện YouTube</span>
        </span>
        <span class="yt-aid-tools-actions">
          <button type="button" class="yt-aid-tools-chip" data-theme="light">Sáng</button>
          <button type="button" class="yt-aid-tools-chip" data-theme="dark">Tối</button>
          <button type="button" class="yt-aid-tools-chip" data-theme="auto">Tự đồng bộ</button>
        </span>
      </div>

      <div class="yt-aid-quality-block">
        <div class="yt-aid-quality-head">
          <span class="yt-aid-quality-title">Chất lượng video tự động</span>
          <span class="yt-aid-quality-now" id="yt-aid-quality-now"></span>
        </div>
        <div class="yt-aid-quality-chips" role="group" aria-label="Chất lượng video tự động">
          <button type="button" class="yt-aid-quality-chip" data-quality="auto">Tắt</button>
          ${QUALITY_LEVELS.map((item) => `<button type="button" class="yt-aid-quality-chip" data-quality="${item.level}">${item.label}</button>`).join('')}
        </div>
        <div class="yt-aid-quality-hint">Video thiếu mức đã chọn sẽ phát ở mức cao nhất nó có.</div>
      </div>
    `;

    menu.querySelector('#yt-aid-toggle-selection-copy').addEventListener('change', (e) => {
      updateSetting('enableSelectionCopy', e.target.checked);
    });
    menu.querySelector('#yt-aid-toggle-auto-paste').addEventListener('change', (e) => {
      updateSetting('enableAutoPasteSearch', e.target.checked);
    });
    menu.querySelector('#yt-aid-toggle-auto-paste-replace').addEventListener('change', (e) => {
      updateSetting('enableAutoPasteReplace', e.target.checked);
    });
    menu.querySelector('#yt-aid-toggle-animations').addEventListener('change', (e) => {
      updateSetting('enableAnimations', !e.target.checked);
      document.body.classList.toggle('yt-aid-no-animations', e.target.checked);
      notifyPerfMode(e.target.checked);
    });

    menu.querySelectorAll('#yt-aid-tools-theme .yt-aid-tools-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        updateSetting('extensionTheme', sanitizeThemeMode(chip.dataset.theme));
        syncThemeUi(menu);
      });
    });

    menu.querySelectorAll('.yt-aid-quality-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const level = chip.dataset.quality;
        if (level === QUALITY_AUTO) {
          settings.enableAutoQuality = false;
          safeSetStorage({ enableAutoQuality: false });
          showToast(T('Đã tắt tự chọn chất lượng'), 'info');
        } else {
          settings.enableAutoQuality = true;
          settings.autoQualityLevel = level;
          safeSetStorage({ enableAutoQuality: true, autoQualityLevel: level });
          showToast(T('Đã đặt chất lượng: {0}', [qualityLabel(level)]), 'info');
        }
        // The storage round-trip runs applySettingUpdates, which applies the
        // choice and repaints this menu through syncToolbarState.
        syncQualityUi(menu);
      });
    });

    syncQualityUi(menu);
    syncThemeUi(menu);
    return localizeTree(menu);
  }

  // Highlights the theme chip matching the stored choice.
  function syncThemeUi(scope = document) {
    const mode = sanitizeThemeMode(settings.extensionTheme);
    scope.querySelectorAll('#yt-aid-tools-theme .yt-aid-tools-chip').forEach((chip) => {
      const active = chip.dataset.theme === mode;
      chip.classList.toggle('is-primary', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  // Marks the chip matching the current choice and reads the level the player
  // is actually serving, so the menu can show what the video plays at right now.
  function syncQualityUi(scope = document) {
    const chips = scope.querySelectorAll('.yt-aid-quality-chip');
    if (!chips.length) return;
    chips.forEach((chip) => {
      const isAuto = chip.dataset.quality === QUALITY_AUTO;
      const active = isAuto ? !settings.enableAutoQuality : settings.enableAutoQuality && chip.dataset.quality === sanitizeQualityLevel(settings.autoQualityLevel);
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const now = scope.querySelector('#yt-aid-quality-now');
    if (!now) return;
    now.textContent = T('Đang tải…');
    requestPlayerQuality('').then((res) => {
      if (!res.ok) {
        now.textContent = T('Chưa phát video');
        return;
      }
      const served = res.current && res.current !== QUALITY_AUTO ? qualityLabel(res.current) : '';
      const cap = settings.enableAutoQuality
        ? qualityLabel(pickQualityLevel(res.levels, sanitizeQualityLevel(settings.autoQualityLevel)))
        : '';
      const parts = [];
      if (served) parts.push(`${T('Đang phát')}: ${served}`);
      if (cap) parts.push(`${T('Tối đa')}: ${cap}`);
      now.textContent = parts.join(' · ') || T('Chưa phát video');
    });
  }

  function initDropdownDismiss() {
    document.addEventListener('mousedown', (e) => {
      if (!dropdownEl) return;
      const target = e.target;
      if (target instanceof Node && dropdownEl.contains(target)) return;
      if (target instanceof Node && dropdownBtn && dropdownBtn.contains(target)) return;
      if (target instanceof Element && target.closest('.yt-aid-bm-favorite-picker')) return;
      closeDropdown();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !dropdownEl || favoritePickerEl || bookmarkConfirmEl) return;
      if (e.target && e.target.classList && e.target.classList.contains('yt-aid-bm-rename-input')) return;
      closeDropdown();
    }, true);

    window.addEventListener('resize', closeDropdown);
    window.addEventListener('scroll', (e) => {
      if (!dropdownEl) return;
      // Scrolling inside the menu itself must not dismiss it
      if (e.target instanceof Node && dropdownEl.contains(e.target)) return;
      closeDropdown();
    }, { passive: true, capture: true });
  }

  // ----------------------------------------------------
  // A2. CHANNEL PAGE INJECTION (Avatar & banner)
  // ----------------------------------------------------
  function injectChannelHeaderActions() {
    if (!settings.enableThumbnailDownload) return;

    const hostCandidates = [
      ...document.querySelectorAll('#page-header'),
      ...document.querySelectorAll('yt-page-header-renderer'),
      ...document.querySelectorAll('yt-page-header-view-model'),
      ...document.querySelectorAll('ytd-c4-tabbed-header-renderer #channel-header-container'),
      ...document.querySelectorAll('#channel-header-container'),
      ...document.querySelectorAll('ytd-tabbed-page-header'),
      ...document.querySelectorAll('ytd-c4-tabbed-header-renderer')
    ];
    const host = hostCandidates.find((el) => el.getBoundingClientRect().width > 0) ||
      hostCandidates[0] ||
      null;
    const anchor = host || document.body;
    if (!anchor) return;

    // YouTube keeps old headers in the DOM while swapping pages, so a bar from
    // the previous channel must not block injection into the new header.
    const existingBar = document.querySelector('#yt-aid-channel-actions');
    if (existingBar && existingBar.parentElement === anchor) return;
    document.querySelectorAll('#yt-aid-channel-actions').forEach((el) => el.remove());

    const floating = !host;
    const bar = document.createElement('div');
    bar.id = 'yt-aid-channel-actions';
    bar.className = 'yt-aid-channel-actions' + (floating ? ' yt-aid-channel-actions-floating' : '');
    bar.innerHTML = `
      <button type="button" class="yt-aid-channel-btn" data-kind="avatar" title="Tải ảnh đại diện của kênh">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        <span>Ảnh đại diện</span>
      </button>
      <button type="button" class="yt-aid-channel-btn" data-kind="banner" title="Tải ảnh banner của kênh">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        <span>Ảnh banner</span>
      </button>
    `;

    if (host && getComputedStyle(host).position === 'static') {
      host.classList.add('yt-aid-channel-actions-host');
    }
    anchor.appendChild(bar);
    localizeTree(bar);

    bar.querySelectorAll('.yt-aid-channel-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        downloadChannelImage(btn, btn.dataset.kind);
      });
    });
  }

  // ----------------------------------------------------
  // B. SIDEBAR INJECTION (Related / Up-next videos)
  // ----------------------------------------------------
  // YouTube recycles renderers and re-renders #details, so a marker attribute
  // on the renderer would block re-injection after the bar is wiped out.
  function hasCurrentCardBar(container) {
    let hasCurrent = false;
    container.querySelectorAll('.yt-aid-card-bar').forEach((bar) => {
      if (bar.dataset.ytAidVersion === EXT_VERSION) hasCurrent = true;
      else bar.remove();
    });
    return hasCurrent;
  }

  const SIDEBAR_CARD_SELECTOR = 'ytd-compact-video-renderer, ytd-compact-playlist-renderer, ' +
    'ytd-watch-next-secondary-results-renderer yt-lockup-view-model, #secondary yt-lockup-view-model';

  function findCardsInRoots(selector, roots = [document]) {
    const cards = new Set();
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (root.nodeType === 1 && root.matches(selector)) cards.add(root);
      root.querySelectorAll(selector).forEach((card) => cards.add(card));
    }
    return cards;
  }

  function injectSidebarButtons(roots) {
    findCardsInRoots(SIDEBAR_CARD_SELECTOR, roots).forEach(item => {
      if (hasCurrentCardBar(item)) return;
      // YouTube now renders related videos as bare lockup view models
      const isLockup = item.matches('yt-lockup-view-model');
      if (isLockup && !item.querySelector('a.ytLockupMetadataViewModelTitle')) return;
      const details = isLockup ? item : item.querySelector('#details, .details');
      if (!details) return;

      const cardBar = document.createElement('div');
      cardBar.className = 'yt-aid-card-bar yt-aid-sidebar-bar';
      cardBar.dataset.ytAidVersion = EXT_VERSION;

      cardBar.innerHTML = `
        <div class="yt-aid-side-actions">
          <button class="yt-aid-mini-action yt-aid-copy-pure" title="Copy tiêu đề">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button class="yt-aid-mini-action yt-aid-copy-enter" title="Copy & tự động tìm kiếm trực tiếp (Ctrl+Click mở tab mới)">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M3 2h7a2 2 0 0 1 2 2v1h-2V4H3v9h1v2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 4h6a2 2 0 0 1 2 2v1h-2V8H6v7h2v2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
              <path fill="currentColor" d="M17 2a3 3 0 1 0 2 5.2l2.3 2.3 1.4-1.4-2.3-2.3A3 3 0 0 0 17 2zm0 1.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>
              <path fill="currentColor" d="M19 14v3H12.8l2.6-2.6-1.4-1.4L9 18l5 5 1.4-1.4-2.6-2.6H21v-5h-2z"/>
            </svg>
          </button>
          <button class="yt-aid-mini-action yt-aid-clean-link" title="Copy liên kết sạch">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          </button>
          <button class="yt-aid-mini-action yt-aid-thumb" title="Tải ảnh bìa thumbnail">
            ${THUMBNAIL_ICON_SVG}
          </button>
          ${settings.enableMediaDownload ? `
          <button class="yt-aid-mini-action yt-aid-media-dl" title="${T('Tải video / âm thanh')}" aria-haspopup="menu" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </button>
          <button class="yt-aid-mini-action yt-aid-mp3-dl" title="${T('Tải MP3')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </button>` : ''}
        </div>
        <button type="button" class="yt-aid-side-trigger" title="${T('Công cụ video')}" aria-label="${T('Công cụ video')}" aria-haspopup="true">
          ${homeTriggerSvg()}
        </button>
      `;

      details.appendChild(cardBar);
      localizeTree(cardBar);

      const getCardTitle = () => {
        const titleEl = item.querySelector(isLockup ? 'a.ytLockupMetadataViewModelTitle' : '#video-title, span#video-title');
        return titleEl ? titleEl.textContent.trim() : '';
      };

      const getCardUrl = () => {
        const linkEl = item.querySelector(isLockup
          ? 'a.ytLockupMetadataViewModelTitle, a.ytLockupViewModelContentImage'
          : 'a#video-title, a#thumbnail');
        return linkEl ? linkEl.href : '';
      };

      cardBar.querySelector('.yt-aid-copy-pure').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = getCardTitle();
        copyTextToClipboard(title, T('Đã copy: "{0}"', [previewText(title, 20)]));
      });

      cardBar.querySelector('.yt-aid-copy-enter').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = getCardTitle();
        copyTextToClipboard(title, '');
        if (e.ctrlKey || e.metaKey || e.button === 1) {
          openSearchInNewTab(title);
        } else {
          autoEnterSearch(title);
        }
      });

      cardBar.querySelector('.yt-aid-clean-link').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const clean = cleanYoutubeUrl(getCardUrl());
        copyTextToClipboard(clean, T('Đã copy link: {0}', [previewText(clean, 24)]));
      });

      cardBar.querySelector('.yt-aid-thumb').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        downloadThumbnail(e.currentTarget, getCardTitle(), getCardUrl());
      });

      const sideMediaBtn = cardBar.querySelector('.yt-aid-media-dl');
      if (sideMediaBtn) {
        sideMediaBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const url = getCardUrl();
          if (!videoIdFromUrl(url)) {
            showToast(T('Không tìm thấy liên kết video'), 'warning');
            return;
          }
          // Same quality menu as the watch page, anchored on this card.
          toggleDropdown(e.currentTarget, () => buildMediaQualityMenu({ url, title: getCardTitle() }));
        });
      }

      const sideMp3Btn = cardBar.querySelector('.yt-aid-mp3-dl');
      if (sideMp3Btn) {
        sideMp3Btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const url = getCardUrl();
          if (!videoIdFromUrl(url)) {
            showToast(T('Không tìm thấy liên kết video'), 'warning');
            return;
          }
          startMediaDownload({ videoUrl: url, title: getCardTitle(), format: 'mp3', formatLabel: 'MP3' });
        });
      }
    });
  }

  // ----------------------------------------------------
  // C. HOME PAGE & FEED INJECTION
  // ----------------------------------------------------
  // Every card owns a tiny stationary trigger in its bottom-right corner.
  // The popover is a single node on <body>, created on demand, so hovering
  // the feed costs nothing and YouTube re-rendering a card cannot wipe it.
  const HOME_CARD_LINK_SELECTOR = [
    'a#video-title-link',
    'a#video-title',
    'a#thumbnail',
    'a.ytLockupMetadataViewModelTitle',
    'a.ytLockupViewModelContentImage'
  ].join(', ');
  const HOME_CARD_TITLE_SELECTOR = [
    '#video-title',
    'a.ytLockupMetadataViewModelTitle'
  ].join(', ');
  const HOME_CARD_ITEM_SELECTOR = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer';
  const HOME_CARD_IGNORE_SELECTOR = 'ytd-reel-item-renderer, ytd-shorts-lockup-view-model, ytm-shorts-lockup-view-model';
  const HOME_TRIGGER_CLASS = 'yt-aid-home-trigger';
  const HOME_FLYOUT_CLASS = 'yt-aid-home-flyout';

  const homeFlyout = {
    panel: null,
    panelConfig: '',
    trigger: null,
    item: null,
    data: null,
    open: false,
    listening: false
  };

  function isHomeFeedPage() {
    const path = window.location.pathname;
    return path === '/' || path.startsWith('/results') || path.startsWith('/feed');
  }

  function readHomeCardData(item) {
    if (!item) return null;
    const linkEl = item.querySelector(HOME_CARD_LINK_SELECTOR);
    const titleEl = item.querySelector(HOME_CARD_TITLE_SELECTOR);
    const url = linkEl ? (linkEl.href || linkEl.getAttribute('href') || '') : '';
    const title = titleEl
      ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim()
      : '';
    if (!url || !title || !videoIdFromUrl(url)) return null;
    return { url, title };
  }

  // The title/link nodes vanish for a moment while the inline preview loads,
  // so keep the last valid pair for the card instead of dropping the trigger.
  function homeCardData(item) {
    if (!item) return null;
    const live = readHomeCardData(item);
    if (live) {
      item.__ytAidCardData = live;
      return live;
    }
    return item.__ytAidCardData || null;
  }

  function homeTriggerSvg() {
    return [
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">',
      '<rect x="6.3" y="6.3" width="4.8" height="4.8" rx="1.3"/>',
      '<rect x="12.9" y="6.3" width="4.8" height="4.8" rx="1.3"/>',
      '<rect x="6.3" y="12.9" width="4.8" height="4.8" rx="1.3"/>',
      '<rect x="12.9" y="12.9" width="4.8" height="4.8" rx="1.3"/>',
      '</svg>'
    ].join('');
  }

  function ensureHomeTrigger(item) {
    let trigger = item.querySelector(`:scope > .${HOME_TRIGGER_CLASS}`);
    if (trigger && trigger.dataset.ytAidVersion === EXT_VERSION) return trigger;
    if (trigger) trigger.remove();

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = HOME_TRIGGER_CLASS;
    trigger.dataset.ytAidVersion = EXT_VERSION;
    trigger.title = T('Công cụ video');
    trigger.setAttribute('aria-label', T('Công cụ video'));
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = homeTriggerSvg();
    item.classList.add('yt-aid-home-card-host');
    item.appendChild(trigger);
    return trigger;
  }

  function homeFlyoutConfig() {
    return `copy:${settings.enableCopyButtons ? 1 : 0}|media:${settings.enableMediaDownload ? 1 : 0}`;
  }

  function buildHomeFlyoutContent(panel) {
    const buttons = [];

    if (settings.enableCopyButtons) {
      buttons.push(`
        <button type="button" class="yt-aid-flyout-btn yt-aid-copy-pure" title="Sao chép tiêu đề" aria-label="Sao chép tiêu đề">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
        <button type="button" class="yt-aid-flyout-btn yt-aid-copy-enter" title="Copy &amp; tìm kiếm ngay (Ctrl+Click mở tab mới)" aria-label="Copy và tìm kiếm ngay">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 2h7a2 2 0 0 1 2 2v1h-2V4H3v9h1v2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 4h6a2 2 0 0 1 2 2v1h-2V8H6v7h2v2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
            <path fill="currentColor" d="M17 2a3 3 0 1 0 2 5.2l2.3 2.3 1.4-1.4-2.3-2.3A3 3 0 0 0 17 2zm0 1.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>
            <path fill="currentColor" d="M19 14v3H12.8l2.6-2.6-1.4-1.4L9 18l5 5 1.4-1.4-2.6-2.6H21v-5h-2z"/>
          </svg>
        </button>
        <button type="button" class="yt-aid-flyout-btn yt-aid-copy-link" title="Sao chép liên kết sạch" aria-label="Sao chép liên kết sạch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        </button>
      `);
    }

    buttons.push(`
      <button type="button" class="yt-aid-flyout-btn yt-aid-thumb" title="Tải ảnh bìa thumbnail" aria-label="Tải ảnh bìa thumbnail">
        ${THUMBNAIL_ICON_SVG}
      </button>
    `);

    if (settings.enableMediaDownload) {
      buttons.push(`
        <button type="button" class="yt-aid-flyout-btn yt-aid-media-dl" title="${T('Tải video / âm thanh')}" aria-label="${T('Tải video / âm thanh')}" aria-haspopup="menu" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </button>
        <button type="button" class="yt-aid-flyout-btn yt-aid-mp3-dl" title="${T('Tải MP3')}" aria-label="${T('Tải MP3')}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </button>
      `);
    }

    const btnCount = buttons.length;
    panel.classList.remove('yt-aid-flyout-3', 'yt-aid-flyout-5', 'yt-aid-flyout-6');
    if (btnCount >= 6) panel.classList.add('yt-aid-flyout-6');
    else if (btnCount === 5) panel.classList.add('yt-aid-flyout-5');
    else if (btnCount === 3) panel.classList.add('yt-aid-flyout-3');

    panel.innerHTML = buttons.join('');
    panel.dataset.ytAidConfig = homeFlyoutConfig();
    localizeTree(panel);

    const flyoutData = () => {
      const live = homeFlyout.item ? readHomeCardData(homeFlyout.item) : null;
      if (live) homeFlyout.data = live;
      return homeFlyout.data || { url: '', title: '' };
    };

    const copyBtn = panel.querySelector('.yt-aid-copy-pure');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const title = flyoutData().title;
        closeHomeFlyout();
        if (!title) return;
        copyTextToClipboard(title, T('Đã copy: "{0}"', [previewText(title, 20)]));
      });
    }

    const enterBtn = panel.querySelector('.yt-aid-copy-enter');
    if (enterBtn) {
      const handleCopyEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const title = flyoutData().title;
        closeHomeFlyout();
        if (!title) return;
        copyTextToClipboard(title, '');
        if (e.ctrlKey || e.metaKey || e.button === 1) {
          openSearchInNewTab(title);
        } else {
          autoEnterSearch(title);
        }
      };
      enterBtn.addEventListener('click', handleCopyEnter);
      enterBtn.addEventListener('auxclick', (e) => {
        if (e.button === 1) handleCopyEnter(e);
      });
    }

    const linkBtn = panel.querySelector('.yt-aid-copy-link');
    if (linkBtn) {
      linkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clean = cleanYoutubeUrl(flyoutData().url);
        closeHomeFlyout();
        if (!clean) return;
        copyTextToClipboard(clean, T('Đã copy link: {0}', [previewText(clean, 24)]));
      });
    }

    const thumbBtn = panel.querySelector('.yt-aid-thumb');
    if (thumbBtn) {
      thumbBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget;
        const data = flyoutData();
        closeHomeFlyout();
        downloadThumbnail(btn, data.title, data.url);
      });
    }

    const mediaDlBtn = panel.querySelector('.yt-aid-media-dl');
    if (mediaDlBtn) {
      mediaDlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = flyoutData();
        if (!data.url) {
          showToast(T('Không tìm thấy liên kết video'), 'warning');
          return;
        }
        // Same quality menu as the watch page: MP4 resolutions, MP3 and the
        // thumbnail cropper. The flyout closes so only the menu stays on top.
        toggleDropdown(e.currentTarget, () => buildMediaQualityMenu({ url: data.url, title: data.title }));
        closeHomeFlyout();
      });
    }

    const mp3Btn = panel.querySelector('.yt-aid-mp3-dl');
    if (mp3Btn) {
      mp3Btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = flyoutData();
        closeHomeFlyout();
        if (!data.url) {
          showToast(T('Không tìm thấy liên kết video'), 'warning');
          return;
        }
        startMediaDownload({ videoUrl: data.url, title: data.title, format: 'mp3', formatLabel: 'MP3' });
      });
    }
  }

  function ensureHomeFlyout() {
    // A stale panel from an older build would keep the previous markup.
    document.querySelectorAll(`.${HOME_FLYOUT_CLASS}`).forEach((el) => {
      if (el !== homeFlyout.panel) el.remove();
    });

    let panel = homeFlyout.panel;
    if (panel && !panel.isConnected) {
      panel = null;
      homeFlyout.panel = null;
      homeFlyout.panelConfig = '';
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.className = HOME_FLYOUT_CLASS;
      panel.dataset.ytAidVersion = EXT_VERSION;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', T('Công cụ video'));
      panel.setAttribute('aria-hidden', 'true');
      panel.addEventListener('pointerdown', (e) => e.stopPropagation());
      panel.addEventListener('click', (e) => e.stopPropagation());
      document.body.appendChild(panel);
      homeFlyout.panel = panel;
      homeFlyout.panelConfig = '';
    }

    if (homeFlyout.panelConfig !== homeFlyoutConfig()) {
      buildHomeFlyoutContent(panel);
      homeFlyout.panelConfig = homeFlyoutConfig();
    }
    return panel;
  }

  function positionHomeFlyout() {
    const panel = homeFlyout.panel;
    const trigger = homeFlyout.trigger;
    if (!panel || !trigger || !trigger.isConnected) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    // Visual size (the panel is zoomed), so the clamping below happens in the
    // same viewport pixels the trigger's rect is measured in.
    const panelBox = panel.getBoundingClientRect();
    const width = panelBox.width;
    const height = panelBox.height;
    const viewportW = document.documentElement.clientWidth || window.innerWidth;
    const viewportH = document.documentElement.clientHeight || window.innerHeight;

    let left = Math.round(rect.right - width);
    let top = Math.round(rect.top - height - gap);
    let origin = 'bottom';

    if (top < margin) {
      top = Math.round(rect.bottom + gap);
      origin = 'top';
    }

    left = Math.max(margin, Math.min(left, viewportW - width - margin));
    top = Math.max(margin, Math.min(top, viewportH - height - margin));

    panel.style.left = `${Math.round(unscalePx(left))}px`;
    panel.style.top = `${Math.round(unscalePx(top))}px`;
    panel.style.transformOrigin = `${origin} right`;
  }

  function openHomeFlyout(trigger) {
    const item = trigger.closest(HOME_CARD_ITEM_SELECTOR);
    if (!item) return;

    const data = readHomeCardData(item) || homeCardData(item);
    if (!data) return;
    item.__ytAidCardData = data;

    const panel = ensureHomeFlyout();
    const wasOpen = homeFlyout.open;
    if (homeFlyout.trigger && homeFlyout.trigger !== trigger) {
      homeFlyout.trigger.setAttribute('aria-expanded', 'false');
    }

    homeFlyout.trigger = trigger;
    homeFlyout.item = item;
    homeFlyout.data = data;
    homeFlyout.open = true;
    trigger.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');

    if (!wasOpen) panel.classList.remove('yt-aid-flyout-open');
    positionHomeFlyout();
    panel.classList.add('yt-aid-flyout-open');
    attachHomeFlyoutListeners();
  }

  function closeHomeFlyout() {
    detachHomeFlyoutListeners();
    if (homeFlyout.trigger) homeFlyout.trigger.setAttribute('aria-expanded', 'false');
    if (homeFlyout.panel) {
      homeFlyout.panel.classList.remove('yt-aid-flyout-open');
      homeFlyout.panel.setAttribute('aria-hidden', 'true');
    }
    homeFlyout.open = false;
    homeFlyout.trigger = null;
    homeFlyout.item = null;
    homeFlyout.data = null;
  }

  function onHomeFlyoutPointerDown(event) {
    if (!homeFlyout.open) return;
    const target = event.target;
    if (homeFlyout.panel && homeFlyout.panel.contains(target)) return;
    if (target && target.closest && target.closest(`.${HOME_TRIGGER_CLASS}`)) return;
    closeHomeFlyout();
  }

  function onHomeFlyoutKeyDown(event) {
    if (event.key !== 'Escape') return;
    const trigger = homeFlyout.trigger;
    event.preventDefault();
    event.stopPropagation();
    closeHomeFlyout();
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  // Scroll and resize listeners only exist while the popover is open.
  function attachHomeFlyoutListeners() {
    if (homeFlyout.listening) return;
    homeFlyout.listening = true;
    document.addEventListener('pointerdown', onHomeFlyoutPointerDown, true);
    document.addEventListener('keydown', onHomeFlyoutKeyDown, true);
    window.addEventListener('scroll', closeHomeFlyout, { capture: true, passive: true });
    window.addEventListener('resize', closeHomeFlyout, { passive: true });
  }

  function detachHomeFlyoutListeners() {
    if (!homeFlyout.listening) return;
    homeFlyout.listening = false;
    document.removeEventListener('pointerdown', onHomeFlyoutPointerDown, true);
    document.removeEventListener('keydown', onHomeFlyoutKeyDown, true);
    window.removeEventListener('scroll', closeHomeFlyout, { capture: true });
    window.removeEventListener('resize', closeHomeFlyout);
  }

  // One delegated handler for every card: no per-card listeners to leak.
  function onHomeTriggerClick(event) {
    const target = event.target;
    const trigger = target && target.closest ? target.closest(`.${HOME_TRIGGER_CLASS}`) : null;
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    if (homeFlyout.open && homeFlyout.trigger === trigger) {
      closeHomeFlyout();
    } else {
      openHomeFlyout(trigger);
    }
  }

  document.addEventListener('click', onHomeTriggerClick, true);

  function injectHomePageCards(roots) {
    if (!isHomeFeedPage()) {
      closeHomeFlyout();
      return;
    }

    findCardsInRoots(HOME_CARD_ITEM_SELECTOR, roots).forEach((item) => {
      if (!item.isConnected) return;
      const existing = item.querySelector(`:scope > .${HOME_TRIGGER_CLASS}`);

      if (item.querySelector(HOME_CARD_IGNORE_SELECTOR)) {
        if (existing) existing.remove();
        item.classList.remove('yt-aid-home-card-host');
        return;
      }

      if (!homeCardData(item)) {
        if (existing && existing.dataset.ytAidVersion !== EXT_VERSION) existing.remove();
        return;
      }

      if (existing && existing.dataset.ytAidVersion === EXT_VERSION) return;
      if (existing) existing.remove();
      ensureHomeTrigger(item);
    });

    // The card can be replaced while its menu is open; drop the stale anchor.
    if (homeFlyout.open) {
      const { item, trigger } = homeFlyout;
      if (!item || !item.isConnected || !trigger || !trigger.isConnected) {
        closeHomeFlyout();
      }
    }
  }



  const RANDOM_TYPES = { video: 'Video thường', shorts: 'Shorts', music: 'Video nhạc' };
  const RANDOM_TOPICS = {
    video: ['khoa học', 'du lịch', 'ẩm thực', 'lịch sử', 'công nghệ', 'thiên nhiên', 'thể thao', 'nghệ thuật', 'science documentary', 'travel vlog', 'cooking', 'history', 'technology', 'wildlife', 'animation', 'photography', 'gaming', 'crafts', 'architecture', 'astronomy'],
    shorts: ['du lịch', 'thú cưng', 'ẩm thực', 'khoa học', 'thể thao', 'travel', 'pets', 'cooking', 'science', 'sports', 'art', 'comedy'],
    music: ['nhạc Việt', 'nhạc acoustic', 'nhạc không lời', 'V pop', 'jazz', 'classical music', 'indie music', 'rock music', 'K pop', 'J pop', 'lofi music', 'soul music', 'piano music', 'electronic music']
  };
  let randomRequest = null;
  const randomRecentIds = [];

  function sanitizeRandomVideoOptions(raw) {
    return Object.fromEntries(Object.entries(DEFAULT_SETTINGS.randomVideo).map(([key, value]) =>
      [key, typeof raw?.[key] === 'boolean' ? raw[key] : value]));
  }

  function syncRandomVideoUi() {
    const options = settings.randomVideo;
    const enabled = Object.keys(RANDOM_TYPES).some((key) => options[key]);
    document.querySelectorAll('.yt-aid-random-go').forEach((button) => {
      button.disabled = !!randomRequest || !enabled;
      button.setAttribute('aria-busy', randomRequest ? 'true' : 'false');
      button.querySelector('span').textContent = T(randomRequest ? 'Đang chọn…' : 'Random video');
      button.title = !enabled ? T('Chọn ít nhất một loại video trong bộ lọc') :
        T(options.feed ? 'Chọn ngẫu nhiên từ FYP / feed của bạn' : 'Khám phá từ tìm kiếm công khai, không dùng feed');
    });
    document.querySelectorAll('#yt-aid-random-menu input').forEach((input) => {
      input.checked = options[input.dataset.randomKey];
    });
    const state = document.getElementById('yt-aid-random-feed-state');
    if (state) state.textContent = T(options.feed ? 'Bật' : 'Tắt');
  }

  function buildRandomVideoControl() {
    const group = document.createElement('div');
    group.className = 'yt-aid-split-group yt-aid-random-control';
    const go = makeIconButton('yt-aid-pill-btn yt-aid-random-go', 'Video ngẫu nhiên',
      'M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z', openRandomVideo);
    const label = document.createElement('span');
    label.textContent = 'Random video';
    go.appendChild(label);
    group.appendChild(go);
    const filter = makeIconButton('yt-aid-pill-btn yt-aid-random-filter', 'Lọc video ngẫu nhiên',
      'M3 5h18v2H3V5zm3 6h12v2H6v-2zm4 6h4v2h-4v-2z', () => {
        toggleDropdown(filter, buildRandomVideoMenu);
        if (dropdownBtn === filter) dropdownEl.querySelector('input')?.focus({ preventScroll: true });
      });
    filter.setAttribute('aria-haspopup', 'dialog');
    filter.setAttribute('aria-expanded', 'false');
    group.appendChild(filter);
    return group;
  }

  function buildRandomVideoMenu() {
    const menu = document.createElement('div');
    menu.id = 'yt-aid-random-menu';
    menu.className = 'yt-aid-tools-menu yt-aid-random-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Lọc video ngẫu nhiên');
    const heading = document.createElement('div');
    heading.className = 'yt-aid-tools-title';
    heading.textContent = 'Chọn loại video';
    menu.appendChild(heading);
    for (const [key, label] of Object.entries({ ...RANDOM_TYPES, feed: 'Dựa vào FYP / feed' })) {
      const row = document.createElement('label');
      row.className = 'yt-aid-tools-item yt-aid-random-option';
      const text = document.createElement('span');
      text.className = 'yt-aid-tools-name';
      text.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.randomKey = key;
      input.checked = settings.randomVideo[key];
      if (key === 'feed') {
        row.classList.add('yt-aid-random-source');
        const state = document.createElement('span');
        state.id = 'yt-aid-random-feed-state';
        state.textContent = input.checked ? 'Bật' : 'Tắt';
        text.appendChild(state);
        const toggle = document.createElement('span');
        toggle.className = 'yt-aid-switch';
        input.setAttribute('role', 'switch');
        toggle.appendChild(input);
        const slider = document.createElement('span');
        slider.className = 'yt-aid-switch-slider';
        toggle.appendChild(slider);
        row.append(text, toggle);
      } else {
        row.append(text, input);
      }
      input.addEventListener('change', () => {
        const checked = input.checked;
        cancelRandomVideo();
        settings.randomVideo = { ...settings.randomVideo, [key]: checked };
        safeSetStorage({ randomVideo: settings.randomVideo });
        syncRandomVideoUi();
      });
      menu.appendChild(row);
    }
    const note = document.createElement('p');
    note.className = 'yt-aid-tools-desc yt-aid-random-note';
    note.textContent = 'Bật: chọn trong feed đã tải; ngoài feed sẽ lấy Trang chủ. Tắt: tìm kiếm công khai theo chủ đề ngẫu nhiên, không gửi cookie tài khoản; không phải toàn bộ kho YouTube. Video nhạc theo danh mục Music của YouTube. Chọn ít nhất một loại.';
    menu.appendChild(note);
    return localizeTree(menu);
  }

  function injectRandomHomeControl() {
    const existing = document.getElementById('yt-aid-random-home');
    if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/feed/')) {
      if (existing) existing.remove();
      return;
    }
    const browse = document.querySelector('ytd-browse:not([hidden])');
    const grid = browse?.querySelector('ytd-rich-grid-renderer');
    // Đặt thanh random NGOÀI lưới video (anh em của ytd-rich-grid-renderer) để không làm vỡ layout
    // flex/grid nội bộ của YouTube (lỗi: mỗi hàng chỉ hiện 1 video, còn lại trống).
    if (!grid || !grid.parentElement) {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.nextElementSibling === grid) {
      syncHomeBookmarkButton();
      return;
    }
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.id = 'yt-aid-random-home';
    bar.appendChild(buildRandomVideoControl());
    bar.appendChild(buildHomeBookmarkButton());
    grid.parentElement.insertBefore(bar, grid);
    localizeTree(bar);
    syncRandomVideoUi();
  }

  function parseYoutubePageData(html, name) {
    const marker = new RegExp('(?:var\\s+' + name + '|window\\["' + name + '"\\])\\s*=\\s*');
    const match = marker.exec(html);
    if (!match) throw new Error('Không đọc được dữ liệu YouTube. Hãy thử lại sau.');
    const start = match.index + match[0].length;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
    throw new Error('Dữ liệu YouTube chưa đầy đủ. Hãy thử lại.');
  }

  async function fetchRandomPage(path, personalized, signal) {
    const response = await fetch(path, {
      credentials: personalized ? 'same-origin' : 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store', signal
    });
    if (!response.ok) throw new Error('Không tải được dữ liệu YouTube. Hãy thử lại sau.');
    return response.text();
  }

  function collectRandomCandidates(data) {
    const candidates = new Map();
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.adSlotRenderer || node.promotedSparklesWebRenderer || node.adPlacementRenderer) return;
      const short = node.shortsLockupViewModel || node.reelItemRenderer;
      const video = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
      const lockup = node.lockupViewModel;
      if (short || video || lockup) {
        const item = short || video || lockup;
        const endpoint = short?.onTap?.innertubeCommand || item.navigationEndpoint;
        const isShort = !!short || !!endpoint?.reelWatchEndpoint ||
          endpoint?.commandMetadata?.webCommandMetadata?.webPageType === 'WEB_PAGE_TYPE_SHORTS';
        const id = item.videoId || endpoint?.reelWatchEndpoint?.videoId || item.contentId;
        if (typeof id === 'string' && VIDEO_ID_RE.test(id) &&
            (!lockup || lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO')) {
          const title = item.title?.simpleText || item.title?.runs?.map((run) => run.text).join('') ||
            item.overlayMetadata?.primaryText?.content || item.metadata?.lockupMetadataViewModel?.title?.content || '';
          const previous = candidates.get(id);
          candidates.set(id, { id, title, isShort: isShort || !!previous?.isShort });
        }
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (!/adSlot|adPlacement|promoted|tracking|logging/i.test(key)) visit(value);
      }
    };
    visit(data.contents);
    return [...candidates.values()];
  }

  function randomFeedCandidates() {
    if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/feed/')) return [];
    const browse = document.querySelector('ytd-browse:not([hidden])');
    if (!browse) return [];
    const candidates = new Map();
    browse.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, yt-shorts-lockup-view-model').forEach((card) => {
      if (card.closest('[hidden], ytd-ad-slot-renderer') ||
          card.querySelector('ytd-ad-slot-renderer, ytd-display-ad-renderer')) return;
      const link = card.querySelector('a[href^="/watch?"], a[href^="/shorts/"]');
      if (!link) return;
      const id = videoIdFromUrl(link.href);
      if (!id) return;
      const previous = candidates.get(id);
      candidates.set(id, { id, title: card.textContent || '', isShort: link.pathname.startsWith('/shorts/') || !!previous?.isShort });
    });
    return [...candidates.values()];
  }

  // Dự phòng khi đang ở trang xem video: lấy video gợi ý đang hiện bên phải.
  function randomRelatedCandidates() {
    const candidates = new Map();
    document.querySelectorAll('ytd-watch-next-secondary-results-renderer a[href^="/watch?"], #related a[href^="/watch?"], a.yt-lockup-view-model-wiz__content-image[href^="/watch?"]').forEach((link) => {
      const id = videoIdFromUrl(link.href);
      if (id) candidates.set(id, { id, title: link.textContent || '', isShort: false });
    });
    return [...candidates.values()];
  }

  function shuffledRandomItems(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async function chooseRandomCandidate(candidates, options, signal) {
    const currentId = videoIdFromUrl(window.location.href);
    let pool = shuffledRandomItems(candidates.filter((item) => item.id !== currentId &&
      (item.isShort ? options.shorts : options.video || options.music)));
    if (!options.video && options.music && !options.shorts) {
      const musicHint = (item) => /\b(music|song|audio|lyrics?|vevo|jazz|lofi|piano)\b|âm nhạc|nhạc|bài hát/i.test(item.title);
      pool.sort((a, b) => Number(musicHint(b)) - Number(musicHint(a)));
    }
    pool.sort((a, b) => Number(randomRecentIds.includes(a.id)) - Number(randomRecentIds.includes(b.id)));
    for (const candidate of pool.slice(0, 8)) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const html = await fetchRandomPage(`/watch?v=${candidate.id}`, options.feed, signal);
      const player = parseYoutubePageData(html, 'ytInitialPlayerResponse');
      if (player.videoDetails?.videoId !== candidate.id || player.playabilityStatus?.status !== 'OK' || player.videoDetails?.isLiveContent) continue;
      if (candidate.isShort) return candidate;
      const category = player.microformat?.playerMicroformatRenderer?.category;
      if (!category) continue;
      if (category === 'Music' ? options.music : options.video) return candidate;
    }
    return null;
  }

  function cancelRandomVideo() {
    if (!randomRequest) return;
    randomRequest.abort();
    randomRequest = null;
    syncRandomVideoUi();
  }

  async function openRandomVideo() {
    const options = { ...settings.randomVideo };
    const types = Object.keys(RANDOM_TYPES).filter((type) => options[type]);
    if (randomRequest || !types.length) return;
    closeDropdown();
    const request = new AbortController();
    randomRequest = request;
    let signal = request.signal;
    try {
      if (AbortSignal.any && AbortSignal.timeout) signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
    } catch (e) { signal = request.signal; }
    const startUrl = window.location.href;
    syncRandomVideoUi();
    try {
      let selected = null;
      const searchPick = async () => {
        for (const type of shuffledRandomItems(types)) {
          const topic = shuffledRandomItems(RANDOM_TOPICS[type])[0];
          const query = type === 'shorts' ? `#shorts ${topic}` : type === 'music' ? `${topic} official audio` : topic;
          const params = new URLSearchParams({ search_query: query });
          if (type !== 'shorts') params.set('sp', 'EgIQAQ==');
          const html = await fetchRandomPage(`/results?${params}`, false, signal);
          const candidates = collectRandomCandidates(parseYoutubePageData(html, 'ytInitialData'));
          const pick = await chooseRandomCandidate(candidates, {
            video: type === 'video', shorts: type === 'shorts', music: type === 'music', feed: false
          }, signal);
          if (pick) return pick;
        }
        return null;
      };
      if (options.feed) {
        try {
          let candidates = randomFeedCandidates();
          if (!candidates.length) {
            try {
              const html = await fetchRandomPage('/', true, signal);
              candidates = collectRandomCandidates(parseYoutubePageData(html, 'ytInitialData'));
            } catch (e) { console.warn('[YoutubeAid] random: không đọc được feed', e); }
          }
          if (!candidates.length) candidates = randomRelatedCandidates();
          selected = await chooseRandomCandidate(candidates, options, signal);
        } catch (e) {
          if (request.signal.aborted) throw e;
          console.warn('[YoutubeAid] random: feed lỗi, chuyển sang tìm kiếm công khai', e);
        }
        if (!selected) selected = await searchPick();
      } else {
        selected = await searchPick();
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (randomRequest !== request || window.location.href !== startUrl) return;
      if (!selected) {
        showToast(options.feed ? 'Feed không có video phù hợp' :
          'Không có video phù hợp', 'warning', 4000);
        return;
      }
      randomRecentIds.push(selected.id);
      if (randomRecentIds.length > 20) randomRecentIds.shift();
      goToYoutubeTarget(selected.isShort ? `/shorts/${selected.id}` : `/watch?v=${selected.id}`);
    } catch (error) {
      console.error('[YoutubeAid] random lỗi:', error);
      if (request.signal.aborted) return;
      showToast(signal.aborted ? 'YouTube phản hồi chậm' :
        'Không lấy được video', 'warning', 4000);
    } finally {
      if (randomRequest === request) {
        randomRequest = null;
        syncRandomVideoUi();
      }
    }
  }

  // ==========================================
  // 9. BOOKMARK (lưu mốc thời gian video, xem lại sau)
  // ==========================================
  // Mỗi bookmark = 1 mốc thời gian của 1 video:
  // { uid, id, title, channel, isShort, time, name, favoriteIcon, addedAt }
  const BOOKMARKS_KEY = 'bookmarks';
  const BOOKMARK_LIMIT = 2000;
  const BOOKMARK_NAME_MAX = 200;
  const BOOKMARK_ICON_OUTLINE = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z';
  const BOOKMARK_ICON_FILLED = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z';
  const CLOSE_ICON = 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
  const EDIT_ICON = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
  const TRASH_ICON = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';
  const LOG_ICON = 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z';
  const CHEVRON_DOWN_ICON = 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z';
  const HEART_OUTLINE_ICON = 'M12.1 21.35 10.55 19.94C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.03 6.03 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.45l-1.35 1.4z';
  const FAVORITE_ICONS = {
    music: { label: 'Âm nhạc', path: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z' },
    study: { label: 'Học tập', path: 'M12 3 1 9l4 2.18v6L12 21l7-3.82v-6L21 10v7h2V9L12 3zm5 12.99-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z' },
    outfit: { label: 'Trang phục', path: 'M16 3h-2a2 2 0 0 1-4 0H8L2 7l3 4 2-1.33V21h10V9.67L19 11l3-4-6-4zm.5 4.85L15 6.86V19H9V6.86l-1.5.99L5.08 7 7.3 5.52A4 4 0 0 0 12 7a4 4 0 0 0 4.7-1.48L18.92 7 16.5 7.85z' },
    travel: { label: 'Du lịch', path: 'M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z' },
    food: { label: 'Ăn uống', path: 'M11 9H9V2H7v7H5V2H3v7a4 4 0 0 0 4 4v9h2v-9a4 4 0 0 0 4-4V2h-2v7zm5-3v8h2v8h2V2c-2.21 0-4 1.79-4 4z' },
    scene: { label: 'Đoạn phim hay', path: 'M18 4l2 4h-3l-2-4h-3l2 4h-3L9 4H6l2 4H5L3 4H2v16h20V4h-4zm2 14H4v-8h16v8z' },
    heart: { label: 'Yêu thích', path: 'M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.03 6.03 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.45L12 21.35z' }
  };
  const FAVORITE_ICON_KEYS = Object.keys(FAVORITE_ICONS);
  const BM_LOG_MENU_ID = 'yt-aid-bm-log-menu';

  let bookmarks = [];
  let bookmarkPageOpen = false;
  let bookmarkFilter = '';
  const bookmarkPageCards = new Map();
  const bookmarkSearchCache = new WeakMap();
  let bookmarkConfirmEl = null;
  let bookmarkConfirmResolve = null;
  let bookmarkConfirmReturnFocus = null;
  let favoritePickerEl = null;

  function svgIcon(path, className) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
  }

  function formatVideoTime(totalSeconds) {
    const t = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function sanitizeBookmarks(raw) {
    if (!Array.isArray(raw)) return [];
    const usedUids = new Set();
    const out = [];
    for (const item of raw) {
      if (!item || typeof item.id !== 'string' || !VIDEO_ID_RE.test(item.id)) continue;
      const time = Math.max(0, Math.floor(Number(item.time) || 0));
      const addedAt = Number(item.addedAt) || 0;
      // Dữ liệu cũ (bản chưa có mốc thời gian) không có uid: tạo uid ổn định từ nội dung.
      let uid = typeof item.uid === 'string' && item.uid ? item.uid : `${item.id}-${time}-${addedAt}`;
      if (usedUids.has(uid)) {
        let n = 2;
        while (usedUids.has(`${uid}-${n}`)) n++;
        uid = `${uid}-${n}`;
      }
      usedUids.add(uid);
      out.push({
        uid,
        id: item.id,
        title: typeof item.title === 'string' ? item.title : '',
        channel: typeof item.channel === 'string' ? item.channel : '',
        isShort: !!item.isShort,
        time,
        name: typeof item.name === 'string' ? item.name.slice(0, BOOKMARK_NAME_MAX) : '',
        favoriteIcon: FAVORITE_ICON_KEYS.includes(item.favoriteIcon) ? item.favoriteIcon : '',
        addedAt
      });
    }
    return out;
  }

  function newBookmarkUid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function bookmarkDisplayName(bm) {
    return bm.name || bm.title || bm.id;
  }

  function bookmarkUrl(bm) {
    if (bm.isShort) return `https://www.youtube.com/shorts/${bm.id}`;
    return `https://www.youtube.com/watch?v=${bm.id}${bm.time > 0 ? `&t=${bm.time}s` : ''}`;
  }

  function bookmarksOfVideo(id) {
    return bookmarks
      .filter((b) => b.id === id)
      .sort((a, b) => a.time - b.time || a.addedAt - b.addedAt);
  }

  // Cheap exact comparison used to ignore our own storage write echoes.
  function sameBookmarks(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (x.uid !== y.uid || x.id !== y.id || x.name !== y.name ||
          x.favoriteIcon !== y.favoriteIcon || x.time !== y.time ||
          x.title !== y.title || x.channel !== y.channel) return false;
    }
    return true;
  }

  function saveBookmarks() {
    safeSetStorage({ [BOOKMARKS_KEY]: bookmarks });
  }

  function getMainVideo() {
    return document.querySelector('#movie_player video.html5-main-video') ||
      document.querySelector('#movie_player video') ||
      document.querySelector('video.html5-main-video');
  }

  function getCurrentVideoTime() {
    const v = getMainVideo();
    return v && isFinite(v.currentTime) ? Math.max(0, Math.floor(v.currentTime)) : 0;
  }

  function currentWatchBookmarkData() {
    const id = videoIdFromUrl(window.location.href);
    if (!id) return null;
    const channelEl = document.querySelector(
      'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, ytd-video-owner-renderer ytd-channel-name a'
    );
    return {
      id,
      title: getWatchVideoTitle(),
      channel: channelEl ? channelEl.textContent.trim() : '',
      isShort: false
    };
  }

  // --- Thao tác dữ liệu ---
  function addBookmark(data, time) {
    if (!data || !data.id) return false;
    const t = Math.max(0, Math.floor(Number(time) || 0));
    if (bookmarks.some((b) => b.id === data.id && b.time === t)) {
      showToast(T('Đã có bookmark tại {0}', [formatVideoTime(t)]), 'warning');
      return false;
    }
    const uid = newBookmarkUid();
    bookmarks = [{
      uid,
      id: data.id,
      title: data.title || '',
      channel: data.channel || '',
      isShort: !!data.isShort,
      time: t,
      name: '',
      favoriteIcon: '',
      addedAt: Date.now()
    }, ...bookmarks].slice(0, BOOKMARK_LIMIT);
    saveBookmarks();
    syncBookmarkUi();
    showToast(
      t > 0
        ? T('Đã lưu bookmark tại {0}', [formatVideoTime(t)])
        : T('Đã bookmark: "{0}"', [previewText(data.title || data.id, 18)]),
      'success',
      BOOKMARK_UNDO_MS,
      { label: 'Hoàn tác', onClick: () => undoBookmarkAdd(uid) }
    );
    return true;
  }

  // Silent removal: the Undo toast already confirmed the action, so a second
  // "deleted / restore?" toast on top of it would just be noise.
  function undoBookmarkAdd(uid) {
    if (!bookmarks.some((b) => b.uid === uid)) return;
    bookmarks = bookmarks.filter((b) => b.uid !== uid);
    saveBookmarks();
    syncBookmarkUi();
    syncHomeBookmarkButton();
  }

  function closeBookmarkConfirm(confirmed) {
    if (!bookmarkConfirmEl) return;
    const overlay = bookmarkConfirmEl;
    bookmarkConfirmEl = null;
    document.removeEventListener('keydown', overlay._keyHandler, true);
    overlay.remove();
    if (!confirmed && bookmarkConfirmReturnFocus && bookmarkConfirmReturnFocus.isConnected) {
      bookmarkConfirmReturnFocus.focus({ preventScroll: true });
    }
    bookmarkConfirmReturnFocus = null;
    const resolve = bookmarkConfirmResolve;
    bookmarkConfirmResolve = null;
    if (resolve) resolve(!!confirmed);
  }

  function confirmBookmarkAction(title, message, confirmLabel) {
    closeBookmarkConfirm(false);
    return new Promise((resolve) => {
      bookmarkConfirmResolve = resolve;
      bookmarkConfirmReturnFocus = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'yt-aid-bm-confirm-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'yt-aid-bm-confirm';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'yt-aid-bm-confirm-title');
      dialog.setAttribute('aria-describedby', 'yt-aid-bm-confirm-message');

      const icon = document.createElement('div');
      icon.className = 'yt-aid-bm-confirm-icon';
      icon.appendChild(svgIcon(TRASH_ICON));
      dialog.appendChild(icon);

      const content = document.createElement('div');
      content.className = 'yt-aid-bm-confirm-content';
      const heading = document.createElement('h3');
      heading.id = 'yt-aid-bm-confirm-title';
      heading.textContent = title;
      content.appendChild(heading);
      const text = document.createElement('p');
      text.id = 'yt-aid-bm-confirm-message';
      text.textContent = message;
      content.appendChild(text);
      dialog.appendChild(content);

      const actions = document.createElement('div');
      actions.className = 'yt-aid-bm-confirm-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'yt-aid-bm-confirm-cancel';
      cancel.textContent = T('Hủy');
      cancel.addEventListener('click', () => closeBookmarkConfirm(false));
      actions.appendChild(cancel);
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'yt-aid-bm-confirm-delete';
      accept.textContent = confirmLabel || T('Xóa');
      accept.addEventListener('click', () => closeBookmarkConfirm(true));
      actions.appendChild(accept);
      dialog.appendChild(actions);

      overlay.appendChild(dialog);
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) closeBookmarkConfirm(false);
      });
      overlay._keyHandler = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeBookmarkConfirm(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const first = cancel;
        const last = accept;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      bookmarkConfirmEl = overlay;
      document.body.appendChild(overlay);
      document.addEventListener('keydown', overlay._keyHandler, true);
      requestAnimationFrame(() => cancel.focus({ preventScroll: true }));
    });
  }

  const BOOKMARK_UNDO_MS = 5000;

  // Removed entries remember their position so Undo restores the exact order.
  function snapshotBookmarks(predicate) {
    const entries = [];
    bookmarks.forEach((item, index) => {
      if (!predicate || predicate(item)) entries.push({ item, index });
    });
    return entries;
  }

  function restoreBookmarks(entries) {
    if (!entries || !entries.length) return 0;
    const existing = new Set(bookmarks.map((b) => b.uid));
    const pending = entries
      .filter(({ item }) => item && !existing.has(item.uid))
      .sort((a, b) => a.index - b.index);
    if (!pending.length) return 0;
    const merged = bookmarks.slice();
    for (const { item, index } of pending) {
      merged.splice(Math.min(index, merged.length), 0, item);
    }
    bookmarks = merged.slice(0, BOOKMARK_LIMIT);
    saveBookmarks();
    syncBookmarkUi();
    syncHomeBookmarkButton();
    return pending.length;
  }

  function showUndoToast(message, entries, restoredMessage) {
    showToast(message, 'info', BOOKMARK_UNDO_MS, {
      label: 'Hoàn tác',
      onClick: () => {
        if (restoreBookmarks(entries)) showToast(restoredMessage, 'success');
      }
    });
  }

  function removeBookmark(uid) {
    const index = bookmarks.findIndex((item) => item.uid === uid);
    if (index < 0) return;
    const bm = bookmarks[index];
    bookmarks = bookmarks.filter((item) => item.uid !== uid);
    saveBookmarks();
    syncBookmarkUi();
    showUndoToast('Đã xóa bookmark', [{ item: bm, index }], 'Đã khôi phục bookmark');
  }

  function renameBookmark(uid, rawName) {
    let name = String(rawName || '').replace(/\s+/g, ' ').trim().slice(0, BOOKMARK_NAME_MAX);
    const bm = bookmarks.find((b) => b.uid === uid);
    if (!bm) return;
    // Trùng tên gốc của video hoặc tên mặc định của log thì coi như không đặt tên riêng.
    const timeText = formatVideoTime(bm.time);
    if (name === bm.title || name === `Bookmark tại ${timeText}` || name === `Bookmark at ${timeText}`) name = '';
    if (bm.name !== name) {
      bm.name = name;
      saveBookmarks();
    }
    syncBookmarkUi();
  }

  async function removeVideoBookmarks(id) {
    const entries = snapshotBookmarks((b) => b.id === id);
    if (!entries.length) return;
    const title = entries.find(({ item }) => item.title)?.item.title || id;
    const confirmed = await confirmBookmarkAction(
      T('Xóa {0} bookmark?', [entries.length]),
      previewText(title, 80),
      T('Xóa tất cả mốc')
    );
    if (!confirmed) return;
    // Drop only entries still present: another tab may have deleted some.
    const liveUids = new Set(bookmarks.map((b) => b.uid));
    const removed = entries.filter(({ item }) => liveUids.has(item.uid));
    if (!removed.length) return;
    const targetUids = new Set(removed.map(({ item }) => item.uid));
    bookmarks = bookmarks.filter((b) => !targetUids.has(b.uid));
    saveBookmarks();
    syncBookmarkUi();
    showUndoToast(
      T('Đã xóa {0} bookmark của video', [removed.length]),
      removed,
      T('Đã khôi phục {0} bookmark', [removed.length])
    );
  }

  async function clearAllBookmarks() {
    if (!bookmarks.length) return;
    const count = bookmarks.length;
    const confirmed = await confirmBookmarkAction(
      T('Xóa tất cả bookmark?'),
      T('{0} bookmark sẽ bị xóa. Bạn có 5 giây để hoàn tác.', [count]),
      T('Xóa tất cả')
    );
    if (!confirmed) return;
    const removed = snapshotBookmarks();
    if (!removed.length) return;
    bookmarks = [];
    saveBookmarks();
    syncBookmarkUi();
    showUndoToast(
      T('Đã xóa {0} bookmark', [removed.length]),
      removed,
      T('Đã khôi phục {0} bookmark', [removed.length])
    );
  }

  function loadBookmarks(done) {
    try {
      chrome.storage.local.get({ [BOOKMARKS_KEY]: [] }, (items) => {
        void chrome.runtime?.lastError;
        bookmarks = sanitizeBookmarks(items && items[BOOKMARKS_KEY]);
        if (done) done();
      });
    } catch (e) {
      if (done) done();
    }
  }

  // --- Đổi tên ngay tại chỗ ---
  function startInlineRename(nameEl, bm) {
    if (!nameEl || nameEl.dataset.editing) return;
    const parent = nameEl.parentNode;
    if (!parent) return;
    nameEl.dataset.editing = '1';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'yt-aid-bm-rename-input';
    input.maxLength = BOOKMARK_NAME_MAX;
    input.value = bookmarkDisplayName(bm);
    input.placeholder = T('Tên bookmark');
    parent.replaceChild(input, nameEl);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (input.parentNode) {
        input.parentNode.replaceChild(nameEl, input);
        delete nameEl.dataset.editing;
      }
      if (save) renameBookmark(bm.uid, input.value);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  // --- Trạng thái nút / giao diện ---
  function syncBookmarkButtons() {
    const watchId = window.location.pathname.startsWith('/watch') ? videoIdFromUrl(window.location.href) : null;
    const count = watchId ? bookmarks.reduce((total, bm) => total + Number(bm.id === watchId), 0) : 0;

    const btn = document.getElementById('yt-aid-btn-bookmark');
    if (btn) {
      btn.classList.remove('active');
      if (btn.getAttribute('aria-pressed') !== 'false') btn.setAttribute('aria-pressed', 'false');
      const path = btn.querySelector('path');
      if (path && path.getAttribute('d') !== BOOKMARK_ICON_OUTLINE) path.setAttribute('d', BOOKMARK_ICON_OUTLINE);
    }

    const logBtn = document.getElementById('yt-aid-btn-bookmark-log');
    if (logBtn) {
      const label = logBtn.querySelector('span');
      const text = count > 0 ? String(count) : '';
      if (label && label.textContent !== text) label.textContent = text;
      const logTitle = count > 0
        ? T('Xem log bookmark của video này ({0})', [count])
        : T('Xem log bookmark của video này');
      if (logBtn.title !== logTitle) logBtn.title = logTitle;
      logBtn.classList.toggle('active', count > 0);
    }
  }

  function syncBookmarkUi(favoriteOnly = false) {
    closeFavoritePicker();
    if (!favoriteOnly) {
      syncBookmarkButtons();
      syncHomeBookmarkButton();
    }
    refreshBookmarkLogMenu();
    if (bookmarkPageOpen) renderBookmarkPage();
    else {
      bookmarkPageCards.clear();
      document.querySelector('#yt-aid-bookmark-page .yt-aid-bm-grid')?.replaceChildren();
    }
  }

  // --- Mở / tua tới bookmark ---
  function seekCurrentVideo(time) {
    const v = getMainVideo();
    if (!v) return false;
    try {
      v.currentTime = Math.max(0, time);
      return true;
    } catch (e) {
      return false;
    }
  }

  function openBookmark(event, bm) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return; // mở tab mới theo mặc định
    event.preventDefault();
    closeBookmarkPage();
    closeDropdown();
    const sameVideo = window.location.pathname.startsWith('/watch') &&
      videoIdFromUrl(window.location.href) === bm.id && !bm.isShort;
    if (sameVideo && seekCurrentVideo(bm.time)) return;
    goToYoutubeTarget(bookmarkUrl(bm));
  }

  // --- Thẻ bookmark (dải Trang chủ + trang Bookmark) ---
  function makeIconButton(className, title, iconPath, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.appendChild(svgIcon(iconPath));
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }

  function closeFavoritePicker() {
    if (!favoritePickerEl) return;
    const picker = favoritePickerEl;
    favoritePickerEl = null;
    clearTimeout(picker._outsideTimer);
    document.removeEventListener('mousedown', picker._outsideHandler, true);
    document.removeEventListener('keydown', picker._keyHandler, true);
    window.removeEventListener('resize', closeFavoritePicker);
    window.removeEventListener('scroll', closeFavoritePicker, true);
    picker.remove();
  }

  function setBookmarkFavoriteIcon(uid, iconKey) {
    const bm = bookmarks.find((item) => item.uid === uid);
    if (!bm) return;
    const next = FAVORITE_ICON_KEYS.includes(iconKey) ? iconKey : '';
    if (bm.favoriteIcon === next) return;
    bm.favoriteIcon = next;
    closeFavoritePicker();
    saveBookmarks();
    syncBookmarkUi(true);
    showToast(
      next ? T('Đã yêu thích · {0}', [T(FAVORITE_ICONS[next].label)]) : T('Đã bỏ yêu thích bookmark'),
      next ? 'success' : 'info'
    );
  }

  function toggleBookmarkFavorite(uid) {
    const bm = bookmarks.find((item) => item.uid === uid);
    if (!bm) return;
    setBookmarkFavoriteIcon(uid, bm.favoriteIcon ? '' : 'heart');
  }

  function openFavoritePicker(anchor, bm) {
    closeFavoritePicker();
    const picker = document.createElement('div');
    picker.className = 'yt-aid-bm-favorite-picker';
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', T('Chọn biểu tượng yêu thích'));

    FAVORITE_ICON_KEYS.forEach((key) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'yt-aid-bm-favorite-option';
      option.classList.toggle('active', bm.favoriteIcon === key);
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', bm.favoriteIcon === key ? 'true' : 'false');
      option.title = T(FAVORITE_ICONS[key].label);
      option.appendChild(svgIcon(FAVORITE_ICONS[key].path));
      const label = document.createElement('span');
      label.textContent = T(FAVORITE_ICONS[key].label);
      option.appendChild(label);
      option.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setBookmarkFavoriteIcon(bm.uid, key);
      });
      picker.appendChild(option);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'yt-aid-bm-favorite-remove';
    remove.textContent = T('Bỏ yêu thích');
    remove.disabled = !bm.favoriteIcon;
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setBookmarkFavoriteIcon(bm.uid, '');
    });
    picker.appendChild(remove);

    document.body.appendChild(picker);
    const rect = anchor.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - pickerRect.width, window.innerWidth - pickerRect.width - 8));
    const openAbove = rect.bottom + pickerRect.height + 8 > window.innerHeight && rect.top > pickerRect.height;
    const top = openAbove ? rect.top - pickerRect.height - 6 : rect.bottom + 6;
    picker.style.left = `${Math.round(unscalePx(left))}px`;
    picker.style.top = `${Math.round(unscalePx(Math.max(8, top)))}px`;

    picker._outsideHandler = (event) => {
      if (!picker.contains(event.target) && !anchor.contains(event.target)) closeFavoritePicker();
    };
    picker._keyHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeFavoritePicker();
      anchor.focus({ preventScroll: true });
    };
    favoritePickerEl = picker;
    picker._outsideTimer = setTimeout(() => {
      document.addEventListener('mousedown', picker._outsideHandler, true);
    }, 0);
    document.addEventListener('keydown', picker._keyHandler, true);
    window.addEventListener('resize', closeFavoritePicker);
    window.addEventListener('scroll', closeFavoritePicker, true);
    const selected = picker.querySelector('.yt-aid-bm-favorite-option.active') || picker.querySelector('.yt-aid-bm-favorite-option');
    if (selected) selected.focus({ preventScroll: true });
  }

  function buildBookmarkFavoriteControl(bm) {
    const wrap = document.createElement('div');
    wrap.className = 'yt-aid-bm-favorite-control';

    const iconKey = FAVORITE_ICON_KEYS.includes(bm.favoriteIcon) ? bm.favoriteIcon : '';
    const toggle = makeIconButton(
      `yt-aid-bm-action yt-aid-bm-favorite${iconKey ? ' active' : ''}`,
      iconKey ? T('Bỏ yêu thích · {0}', [T(FAVORITE_ICONS[iconKey].label)]) : T('Yêu thích bookmark'),
      iconKey ? FAVORITE_ICONS[iconKey].path : HEART_OUTLINE_ICON,
      () => toggleBookmarkFavorite(bm.uid)
    );
    toggle.setAttribute('aria-pressed', iconKey ? 'true' : 'false');
    wrap.appendChild(toggle);

    if (iconKey) {
      const choose = makeIconButton(
        'yt-aid-bm-action yt-aid-bm-favorite-choose',
        T('Đổi biểu tượng yêu thích'),
        CHEVRON_DOWN_ICON,
        () => openFavoritePicker(choose, bm)
      );
      choose.setAttribute('aria-haspopup', 'menu');
      wrap.appendChild(choose);
    }
    return wrap;
  }

  // Gộp các bookmark cùng video thành 1 nhóm (giữ thứ tự: video có bookmark mới nhất lên đầu).
  function groupBookmarksByVideo(list) {
    const map = new Map();
    for (const bm of list) {
      let g = map.get(bm.id);
      if (!g) {
        g = { id: bm.id, title: bm.title, channel: bm.channel, isShort: bm.isShort, items: [] };
        map.set(bm.id, g);
      }
      g.items.push(bm);
      if (!g.title && bm.title) g.title = bm.title;
      if (!g.channel && bm.channel) g.channel = bm.channel;
    }
    const groups = [...map.values()];
    groups.forEach((g) => g.items.sort((a, b) => a.time - b.time || a.addedAt - b.addedAt));
    return groups;
  }

  function defaultBookmarkLabel(bm) {
    return T('Bookmark tại {0}', [formatVideoTime(bm.time)]);
  }

  // 1 dòng bookmark: [mốc thời gian] [tên] [đổi tên] [xóa] — dùng ở Log và trang Bookmark.
  function buildBookmarkRow(bm) {
    const row = document.createElement('div');
    row.className = 'yt-aid-bm-log-row';

    const timeBtn = document.createElement('button');
    timeBtn.type = 'button';
    timeBtn.className = 'yt-aid-bm-log-time';
    timeBtn.title = T('Tua tới mốc này');
    timeBtn.textContent = formatVideoTime(bm.time);
    timeBtn.addEventListener('click', (e) => openBookmark(e, bm));
    row.appendChild(timeBtn);

    const name = document.createElement('span');
    name.className = 'yt-aid-bm-log-name';
    name.textContent = bm.name || defaultBookmarkLabel(bm);
    name.title = name.textContent;
    row.appendChild(name);

    row.appendChild(buildBookmarkFavoriteControl(bm));

    // Ô nhập đổi tên bắt đầu từ tên đang hiển thị.
    const editBm = { ...bm, name: bm.name || defaultBookmarkLabel(bm), title: '' };
    row.appendChild(makeIconButton('yt-aid-bm-action', T('Đổi tên'), EDIT_ICON, () => startInlineRename(name, editBm)));
    row.appendChild(makeIconButton('yt-aid-bm-action yt-aid-bm-action-danger', T('Xóa bookmark'), TRASH_ICON, () => removeBookmark(bm.uid)));
    return row;
  }

  // Thẻ của 1 video (gộp tất cả bookmark của video đó).
  function buildBookmarkGroupCard(group) {
    const items = group.items;
    const multi = items.length > 1;
    const single = multi ? null : items[0];
    // Bấm vào ảnh/tiêu đề: mở bookmark được lưu gần nhất.
    const primary = items.reduce((a, b) => (b.addedAt > a.addedAt ? b : a), items[0]);

    const card = document.createElement('div');
    card.className = 'yt-aid-bm-card';
    card.dataset.videoId = group.id;

    const thumbLink = document.createElement('a');
    thumbLink.className = 'yt-aid-bm-thumb';
    thumbLink.href = bookmarkUrl(primary);
    thumbLink.addEventListener('click', (e) => openBookmark(e, primary));
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = `https://i.ytimg.com/vi/${group.id}/mqdefault.jpg`;
    thumbLink.appendChild(img);
    if (multi || (single && single.time > 0)) {
      const badge = document.createElement('span');
      badge.className = multi ? 'yt-aid-bm-time yt-aid-bm-count' : 'yt-aid-bm-time';
      badge.textContent = multi ? T('{0} bookmark', [items.length]) : formatVideoTime(single.time);
      thumbLink.appendChild(badge);
    }
    card.appendChild(thumbLink);

    const info = document.createElement('div');
    info.className = 'yt-aid-bm-info';
    const titleText = group.title || group.id;
    const titleLink = document.createElement('a');
    titleLink.className = 'yt-aid-bm-title';
    titleLink.href = bookmarkUrl(primary);
    titleLink.textContent = titleText;
    titleLink.title = titleText;
    titleLink.addEventListener('click', (e) => openBookmark(e, primary));
    info.appendChild(titleLink);

    if (group.channel) {
      const ch = document.createElement('div');
      ch.className = 'yt-aid-bm-channel';
      ch.textContent = group.channel;
      info.appendChild(ch);
    }

    // Trang Bookmark: liệt kê từng bookmark của video để đổi tên / xóa.
    const rows = document.createElement('div');
    rows.className = 'yt-aid-bm-rows';
    items.forEach((bm) => rows.appendChild(buildBookmarkRow(bm)));
    info.appendChild(rows);

    const clearVideo = document.createElement('button');
    clearVideo.type = 'button';
    clearVideo.className = 'yt-aid-bm-danger-btn yt-aid-bm-video-clear';
    clearVideo.title = T('Xóa tất cả bookmark của video này');
    clearVideo.appendChild(svgIcon(TRASH_ICON));
    const clearVideoText = document.createElement('span');
    clearVideoText.textContent = T('Xóa tất cả ({0})', [items.length]);
    clearVideo.appendChild(clearVideoText);
    clearVideo.addEventListener('click', () => removeVideoBookmarks(group.id));
    info.appendChild(clearVideo);

    card.appendChild(info);
    return card;
  }

  // --- Nút Xem Bookmark trên Trang chủ ---
  function buildHomeBookmarkButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'yt-aid-home-bookmark-btn';
    btn.className = 'yt-aid-pill-btn yt-aid-home-bookmark-btn';
    btn.appendChild(svgIcon(BOOKMARK_ICON_OUTLINE));
    const label = document.createElement('span');
    btn.appendChild(label);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBookmarkPage();
    });
    syncHomeBookmarkButton(btn);
    return btn;
  }

  function syncHomeBookmarkButton(targetBtn) {
    const btn = targetBtn || document.getElementById('yt-aid-home-bookmark-btn');
    if (!btn) return;
    const count = bookmarks.length;
    const label = btn.querySelector('span');
    if (label) {
      label.textContent = count > 0
        ? T('Xem bookmark ({0})', [count])
        : T('Xem bookmark');
    }
    btn.title = T('Mở danh sách video đã lưu bookmark');
    const path = btn.querySelector('path');
    if (path) {
      path.setAttribute('d', count > 0 ? BOOKMARK_ICON_FILLED : BOOKMARK_ICON_OUTLINE);
    }
  }

  // --- Log bookmark của 1 video (dropdown trên Watch page) ---
  function fillBookmarkLogMenu(menu) {
    const id = videoIdFromUrl(window.location.href);
    const list = id ? bookmarksOfVideo(id) : [];
    menu.textContent = '';

    const title = document.createElement('div');
    title.className = 'yt-aid-tools-title';
    title.textContent = `Log bookmark · ${list.length}`;
    menu.appendChild(title);

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'yt-aid-bm-log-empty';
      empty.textContent = T('Video này chưa có bookmark. Bấm nút Bookmark để lưu mốc thời gian hiện tại.');
      menu.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'yt-aid-bm-log-list';
    list.forEach((bm) => wrap.appendChild(buildBookmarkRow(bm)));
    menu.appendChild(wrap);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'yt-aid-bm-danger-btn yt-aid-bm-log-clear';
    clear.textContent = T('Xóa tất cả bookmark của video này');
    clear.addEventListener('click', () => removeVideoBookmarks(id));
    menu.appendChild(clear);
  }

  function buildBookmarkLogMenu() {
    const menu = document.createElement('div');
    menu.id = BM_LOG_MENU_ID;
    menu.className = 'yt-aid-tools-menu yt-aid-bm-log-menu';
    fillBookmarkLogMenu(menu);
    return menu;
  }

  function refreshBookmarkLogMenu() {
    const menu = document.getElementById(BM_LOG_MENU_ID);
    if (menu && menu === dropdownEl) fillBookmarkLogMenu(menu);
  }

  // --- Mục Bookmark ở thanh bên trái ---
  function openBookmarkFromGuide(event) {
    event.preventDefault();
    event.stopPropagation();
    if (bookmarkPageOpen) closeBookmarkPage();
    else openBookmarkPage();
  }

  // Sao chép hình học của mục gốc (Trang chủ, Shorts…) để mục Bookmark thẳng hàng.
  // Trả về false khi mục gốc chưa có kích thước (guide render muộn) để lần sau thử lại.
  function alignGuideEntry(entry, items) {
    const nat = items.querySelector('ytd-guide-entry-renderer a#endpoint, ytd-guide-entry-renderer #endpoint');
    if (!nat) return false;
    const natRect = nat.getBoundingClientRect();
    const itemsRect = items.getBoundingClientRect();
    if (!natRect.width || !natRect.height) return false;

    const iconEl = nat.querySelector('yt-icon, yt-icon-shape, .guide-icon');
    const textEl = nat.querySelector('yt-formatted-string, .title');
    const iconRect = iconEl ? iconEl.getBoundingClientRect() : null;
    const textRect = textEl ? textEl.getBoundingClientRect() : null;

    const style = {
      marginTop: '0px', marginRight: '0px', marginBottom: '0px',
      marginLeft: `${Math.round(natRect.left - itemsRect.left)}px`,
      width: `${Math.round(natRect.width)}px`,
      height: `${Math.round(natRect.height)}px`
    };
    if (iconRect && iconRect.width) {
      style.paddingLeft = `${Math.max(0, Math.round(iconRect.left - natRect.left))}px`;
      if (textRect && textRect.width) {
        style.gap = `${Math.max(0, Math.round(textRect.left - (iconRect.left + 24)))}px`;
      }
    }
    if (textEl) {
      const cs = getComputedStyle(textEl);
      style.fontSize = cs.fontSize;
      style.color = cs.color;
    }
    for (const [key, value] of Object.entries(style)) {
      if (entry.style[key] !== value) entry.style[key] = value;
    }
    entry.dataset.aligned = '1';
    return true;
  }

  function injectGuideEntries(align = false) {
    const items = document.querySelector('ytd-guide-renderer ytd-guide-section-renderer #items');
    if (items && !items.querySelector('#yt-aid-guide-entry')) {
      const entry = document.createElement('a');
      entry.id = 'yt-aid-guide-entry';
      entry.className = 'yt-aid-guide-entry';
      entry.href = '#';
      entry.appendChild(svgIcon(BOOKMARK_ICON_OUTLINE));
      const label = document.createElement('span');
      label.textContent = T('Bookmark');
      entry.appendChild(label);
      entry.addEventListener('click', openBookmarkFromGuide);
      items.appendChild(entry);
      align = true;
    }
    const guideEntry = items && items.querySelector('#yt-aid-guide-entry');
    // Layout reads only until the first successful alignment; the marker is
    // cleared on resize so the entry follows a changed sidebar width.
    if (guideEntry && align && !guideEntry.dataset.aligned) alignGuideEntry(guideEntry, items);

    const mini = document.querySelector('ytd-mini-guide-renderer #items');
    if (mini && !mini.querySelector('#yt-aid-mini-entry')) {
      const entry = document.createElement('a');
      entry.id = 'yt-aid-mini-entry';
      entry.className = 'yt-aid-mini-entry';
      entry.href = '#';
      entry.appendChild(svgIcon(BOOKMARK_ICON_OUTLINE));
      const label = document.createElement('span');
      label.textContent = T('Bookmark');
      entry.appendChild(label);
      entry.addEventListener('click', openBookmarkFromGuide);
      mini.appendChild(entry);
    }

    document.querySelectorAll('#yt-aid-guide-entry, #yt-aid-mini-entry').forEach((el) => {
      el.classList.toggle('active', bookmarkPageOpen);
    });
  }

  // --- Trang Bookmark đầy đủ (overlay) ---
  function positionBookmarkPage() {
    const page = document.getElementById('yt-aid-bookmark-page');
    if (!page) return;
    const masthead = document.querySelector('#masthead-container');
    const top = masthead ? Math.max(0, Math.round(masthead.getBoundingClientRect().bottom)) : 56;
    let left = 0;
    ['ytd-guide-renderer', 'ytd-mini-guide-renderer'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.left >= 0 && r.right > left && r.right < window.innerWidth * 0.5) left = Math.round(r.right);
    });
    page.style.top = `${Math.round(unscalePx(top))}px`;
    page.style.left = `${Math.round(unscalePx(left))}px`;
  }

  function bookmarkSearchText(bm) {
    const source = `${bm.name} ${bm.title} ${bm.channel}`;
    const cached = bookmarkSearchCache.get(bm);
    if (cached?.source === source) return cached.text;
    const text = source.toLowerCase();
    bookmarkSearchCache.set(bm, { source, text });
    return text;
  }

  function renderBookmarkPage() {
    const page = document.getElementById('yt-aid-bookmark-page');
    if (!page) return;
    const grid = page.querySelector('.yt-aid-bm-grid');
    const count = page.querySelector('.yt-aid-bm-page-count');
    const clearBtn = page.querySelector('.yt-aid-bm-clear-all');
    if (!grid) return;

    if (clearBtn) clearBtn.style.display = bookmarks.length ? '' : 'none';
    const ids = new Set(bookmarks.map((bm) => bm.id));
    for (const id of bookmarkPageCards.keys()) {
      if (!ids.has(id)) bookmarkPageCards.delete(id);
    }
    const q = bookmarkFilter.trim().toLowerCase();
    const list = q ? bookmarks.filter((bm) => bookmarkSearchText(bm).includes(q)) : bookmarks;

    if (!list.length) {
      if (count) count.textContent = T('{0} video · {1} bookmark', [0, bookmarks.length]);
      const empty = document.createElement('div');
      empty.className = 'yt-aid-bm-empty';
      empty.textContent = bookmarks.length
        ? T('Không tìm thấy bookmark nào khớp.')
        : T('Chưa có bookmark nào. Mở một video và bấm nút Bookmark để lưu mốc thời gian.');
      grid.replaceChildren(empty);
      return;
    }
    const groups = groupBookmarksByVideo(list);
    const countText = T('{0} video · {1} bookmark', [groups.length, list.length]);
    if (count && count.textContent !== countText) count.textContent = countText;
    const cards = groups.map((group) => {
      const signature = JSON.stringify(group);
      let cached = bookmarkPageCards.get(group.id);
      if (!cached || cached.signature !== signature) {
        cached = { signature, card: buildBookmarkGroupCard(group) };
        bookmarkPageCards.set(group.id, cached);
      }
      return cached.card;
    });
    const visibleCards = new Set(cards);
    for (const child of [...grid.children]) {
      if (!visibleCards.has(child)) child.remove();
    }
    if (!grid.firstChild) {
      grid.append(...cards);
      return;
    }
    let cursor = grid.firstChild;
    for (const card of cards) {
      if (card !== cursor) grid.insertBefore(card, cursor);
      else cursor = cursor.nextSibling;
    }
  }

  function onBookmarkPageKeyDown(event) {
    if (event.key !== 'Escape' || !bookmarkPageOpen || bookmarkConfirmEl || favoritePickerEl) return;
    // Esc khi đang đổi tên chỉ hủy việc đổi tên, không đóng trang.
    if (event.target && event.target.classList && event.target.classList.contains('yt-aid-bm-rename-input')) return;
    event.stopPropagation();
    closeBookmarkPage();
  }

  function onBookmarkOutsideClick(event) {
    if (!bookmarkPageOpen) return;
    const t = event.target;
    if (!t || !t.closest) return;
    if (t.closest('#yt-aid-bookmark-page, #yt-aid-guide-entry, #yt-aid-mini-entry')) return;
    if (t.closest('a[href], ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')) closeBookmarkPage();
  }

  function openBookmarkPage() {
    if (bookmarkPageOpen) return;
    let page = document.getElementById('yt-aid-bookmark-page');
    if (!page) {
      page = document.createElement('div');
      page.id = 'yt-aid-bookmark-page';
      page.className = 'yt-aid-bm-page';

      const header = document.createElement('div');
      header.className = 'yt-aid-bm-page-header';
      const h = document.createElement('h2');
      h.appendChild(svgIcon(BOOKMARK_ICON_FILLED));
      const hText = document.createElement('span');
      hText.textContent = T('Bookmark');
      h.appendChild(hText);
      header.appendChild(h);

      const count = document.createElement('span');
      count.className = 'yt-aid-bm-page-count';
      header.appendChild(count);

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'yt-aid-bm-search';
      search.placeholder = T('Tìm trong bookmark…');
      search.addEventListener('input', () => {
        bookmarkFilter = search.value;
        renderBookmarkPage();
      });
      header.appendChild(search);

      const clearAll = document.createElement('button');
      clearAll.type = 'button';
      clearAll.className = 'yt-aid-bm-danger-btn yt-aid-bm-clear-all';
      clearAll.title = T('Xóa tất cả bookmark');
      clearAll.appendChild(svgIcon(TRASH_ICON));
      const clearText = document.createElement('span');
      clearText.textContent = T('Xóa tất cả');
      clearAll.appendChild(clearText);
      clearAll.addEventListener('click', clearAllBookmarks);
      header.appendChild(clearAll);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'yt-aid-bm-close';
      closeBtn.title = T('Đóng (Esc)');
      closeBtn.setAttribute('aria-label', T('Đóng'));
      closeBtn.appendChild(svgIcon(CLOSE_ICON));
      closeBtn.addEventListener('click', closeBookmarkPage);
      header.appendChild(closeBtn);

      const grid = document.createElement('div');
      grid.className = 'yt-aid-bm-grid';

      page.appendChild(header);
      page.appendChild(grid);
      document.body.appendChild(page);
    }

    bookmarkFilter = '';
    const search = page.querySelector('.yt-aid-bm-search');
    if (search) search.value = '';
    bookmarkPageOpen = true;
    positionBookmarkPage();
    renderBookmarkPage();
    page.classList.add('yt-aid-bm-page-open');
    document.documentElement.classList.add('yt-aid-bm-active');
    page.setAttribute('tabindex', '-1');
    try { page.focus({ preventScroll: true }); } catch (e) { }
    document.addEventListener('keydown', onBookmarkPageKeyDown, true);
    document.addEventListener('click', onBookmarkOutsideClick, true);
    window.addEventListener('resize', positionBookmarkPage);
    injectGuideEntries();
  }

  function closeBookmarkPage() {
    if (!bookmarkPageOpen) return;
    bookmarkPageOpen = false;
    const page = document.getElementById('yt-aid-bookmark-page');
    if (page) page.classList.remove('yt-aid-bm-page-open');
    document.documentElement.classList.remove('yt-aid-bm-active');
    document.removeEventListener('keydown', onBookmarkPageKeyDown, true);
    document.removeEventListener('click', onBookmarkOutsideClick, true);
    window.removeEventListener('resize', positionBookmarkPage);
    injectGuideEntries();
  }

  function injectBookmarkUi() {
    injectGuideEntries();
    syncHomeBookmarkButton();
    syncBookmarkButtons();
  }

  function initBookmarks() {
    loadBookmarks(() => injectBookmarkUi());

    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes[BOOKMARKS_KEY]) {
          const next = sanitizeBookmarks(changes[BOOKMARKS_KEY].newValue);
          if (!sameBookmarks(next, bookmarks)) {
            bookmarks = next;
            syncBookmarkUi();
          }
        }
      });
    } catch (e) { }

    window.addEventListener('yt-navigate-start', () => {
      closeBookmarkPage();
      closeBookmarkConfirm(false);
      closeFavoritePicker();
    });
    window.addEventListener('yt-navigate-finish', closeBookmarkPage);

    let guideAlignTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(guideAlignTimer);
      guideAlignTimer = setTimeout(() => {
        document.querySelectorAll('#yt-aid-guide-entry').forEach((el) => delete el.dataset.aligned);
        injectGuideEntries(true);
      }, 120);
    }, { passive: true });
    // The native guide is outside the main observer and can render late.
    setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      injectGuideEntries(true);
      syncHomeBookmarkButton();
    }, 1500);
  }

  // ==========================================
  // 10. AUTO SKIP ADS (tự bỏ qua quảng cáo video, chạy được cả khi ở tab khác)
  // ==========================================
  // Cách hoạt động: khi player có class "ad-showing", tắt tiếng, tăng tốc, bấm nút
  // "Bỏ qua" nếu có và tua thẳng tới cuối quảng cáo. Không chặn request mạng.
  // Trigger bằng MutationObserver + sự kiện của <video> (không bị trình duyệt tạm
  // dừng khi tab ở nền, khác với timer) kèm một timer dự phòng.
  const AD_SKIP_BUTTON_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-container button',
    '.ytp-skip-ad button',
    'button.ytp-ad-skip-button-modern',
    '[class*="ytp-ad-skip-button"]',
    'button[id^="skip-button"]',
    '.ytp-ad-skip-button-slot button',
    'button[aria-label*="Skip"]',
    'button[aria-label*="skip"]',
    'button[aria-label*="Bỏ qua"]',
    'button[aria-label*="bỏ qua"]'
  ].join(', ');
  const AD_OVERLAY_CLOSE_SELECTORS = '.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container, .ytp-ad-image-overlay button';
  const AD_MAX_SEEK_DURATION = 600; // chỉ tua tới cuối nếu "video" ngắn hơn 10 phút (tránh tua nhầm video chính)
  const AD_SKIP_POLL_MS = 1200; // backstop only — the observers handle the real timing
  const AD_FAST_POLL_MS = 40; // khi đang có quảng cáo: kiểm tra mỗi 40ms để bấm nút ngay khi xuất hiện

  let adSkipObservedPlayer = null;
  let adSkipObservedVideo = null;
  let adSkipObservedLayer = null;
  let adSkipObservers = [];
  let adSkipRaf = 0;

  function getAdVideo(player) {
    return player.querySelector('video.html5-main-video') || player.querySelector('video');
  }

  // Nhận diện quảng cáo bằng nhiều dấu hiệu:
  //  - 'strong': player có class ad-showing/ad-interrupting hoặc getAdState() > 0
  //  - 'weak'  : chỉ thấy giao diện quảng cáo (badge, nút bỏ qua...) có layout
  function detectAdKind(player) {
    if (AD_PLAYER_CLASSES.some((cls) => player.classList.contains(cls))) return 'strong';
    try {
      if (typeof player.getAdState === 'function' && Number(player.getAdState()) > 0) return 'strong';
    } catch (e) { }
    for (const el of player.querySelectorAll(AD_UI_SELECTORS)) {
      if (!el.hidden && el.getClientRects().length) return 'weak';
    }
    return null;
  }

  // Giấu hình quảng cáo bằng thuộc tính trên <html> (CSS ở styles.css), không phụ thuộc tên class của player.
  function setAdHidden(on) {
    const root = document.documentElement;
    if (on) {
      if (!root.hasAttribute('data-yt-aid-ad')) root.setAttribute('data-yt-aid-ad', '1');
    } else if (root.hasAttribute('data-yt-aid-ad')) {
      root.removeAttribute('data-yt-aid-ad');
    }
  }

  let adWeakSince = 0;
  let adHideSince = 0;
  let adAtEndSince = 0;
  let adStuckAttempts = 0;
  const AD_HIDE_MAX_MS = 25000;   // tối đa 25s ẩn nếu quảng cáo kéo dài
  const AD_STUCK_AFTER_MS = 150;  // quảng cáo đứng ở cuối quá 150ms thì xử lý ngay
  const AD_STUCK_MAX_TRIES = 20;
  const AD_WEAK_MAX_MS = 8000; // dấu hiệu "yếu" chỉ giấu tối đa 8 giây để không kẹt player đen

  function restoreAfterAd(player) {
    setAdHidden(false);
    adWeakSince = 0;
    adHideSince = 0;
    adAtEndSince = 0;
    adStuckAttempts = 0;
    if (!adSkipState) return;
    const state = adSkipState;
    adSkipState = null;
    const video = player ? getAdVideo(player) : null;
    if (!video) return;
    try {
      video.muted = state.muted;
      video.playbackRate = state.rate || 1;
    } catch (e) { }
  }

  // Cho quảng cáo chạy tiếp (nếu đang dừng) để player nhận sự kiện "kết thúc" và chuyển sang video chính.
  function nudgeAdPlayback(player, video) {
    try {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => { });
    } catch (e) { }
    try {
      if (typeof player.playVideo === 'function') player.playVideo();
    } catch (e) { }
    const bigPlay = player.querySelector('.ytp-large-play-button');
    if (bigPlay && video.paused) {
      try { bigPlay.click(); } catch (e) { }
    }
  }

  // Click "thật" hơn: YouTube mới nghe pointer/mouse event, .click() đơn thuần đôi khi bị bỏ qua.
  function fireRealClick(el) {
    if (!el) return;
    try {
      if (typeof el.click === 'function') el.click();
    } catch (e) { }
    try {
      const r = el.getBoundingClientRect();
      const clientX = r.left + (r.width > 0 ? r.width / 2 : 5);
      const clientY = r.top + (r.height > 0 ? r.height / 2 : 5);
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
        button: 0,
        buttons: 1
      };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, opts));
      });
    } catch (e) { }
    // Nếu phần tử cha có thể click
    try {
      const parentBtn = el.closest('button, [role="button"]');
      if (parentBtn && parentBtn !== el) {
        parentBtn.click();
      }
    } catch (e) { }
  }

  function runAdSkip() {
    adSkipRaf = 0;
    if (IS_MUSIC_SITE) return;
    const player = getPlayerElement();
    if (!player) return;

    if (!settings.enableAdSkip) {
      restoreAfterAd(player);
      return;
    }

    // Banner quảng cáo đè lên video: đóng lại.
    player.querySelectorAll(AD_OVERLAY_CLOSE_SELECTORS).forEach((btn) => {
      try { btn.click(); } catch (e) { }
    });

    const kind = detectAdKind(player);
    if (!kind) {
      restoreAfterAd(player);
      return;
    }

    if (kind === 'weak') {
      if (!adWeakSince) adWeakSince = Date.now();
      if (Date.now() - adWeakSince > AD_WEAK_MAX_MS) {
        restoreAfterAd(player);
        return;
      }
    } else {
      adWeakSince = 0;
    }

    // Giấu hình + tắt tiếng ngay, rồi mới xử lý bỏ qua.
    if (!adHideSince) adHideSince = Date.now();
    setAdHidden(Date.now() - adHideSince < AD_HIDE_MAX_MS);
    const video = getAdVideo(player);
    if (!video) return;

    if (!adSkipState) adSkipState = { muted: video.muted, rate: video.playbackRate };
    try {
      video.muted = true;
      video.playbackRate = 8;
    } catch (e) { }

    const skipBtn = player.querySelector(AD_SKIP_BUTTON_SELECTORS);
    if (skipBtn) {
      fireRealClick(skipBtn);
    } else {
      // Tìm sâu hơn trong player hoặc document nếu nút nằm ngoài .video-ads
      const docSkipBtn = document.querySelector(AD_SKIP_BUTTON_SELECTORS);
      if (docSkipBtn) fireRealClick(docSkipBtn);
    }

    // Quảng cáo đang tải/đệm: ép phát để nó có dữ liệu sớm nhất có thể.
    if (kind === 'strong' && video.paused) nudgeAdPlayback(player, video);

    // Tua tới cuối quảng cáo (cả loại không có nút bỏ qua). Chỉ tua khi chắc chắn là quảng cáo.
    const duration = video.duration;
    if (kind === 'strong' && isFinite(duration) && duration > 1 && duration <= AD_MAX_SEEK_DURATION) {
      const atEnd = video.ended || video.currentTime >= duration - 0.5;
      if (!atEnd) {
        adAtEndSince = 0;
        if (video.paused) nudgeAdPlayback(player, video);
        try { video.currentTime = duration - 0.2; } catch (e) { }
      } else {
        // Đã ở cuối nhưng quảng cáo vẫn còn hiện (kẹt): lùi nhẹ rồi cho chạy lại để kích hoạt kết thúc.
        if (!adAtEndSince) adAtEndSince = Date.now();
        if (Date.now() - adAtEndSince > AD_STUCK_AFTER_MS && adStuckAttempts < AD_STUCK_MAX_TRIES) {
          adStuckAttempts++;
          try { video.currentTime = Math.max(0, duration - 0.5); } catch (e) { }
          nudgeAdPlayback(player, video);
        }
      }
    }
    // Còn quảng cáo: chạy lại nhanh, không chờ timer 250ms.
    scheduleAdSkip(AD_FAST_POLL_MS);
  }

  function scheduleAdSkip(delay) {
    // Nothing to detect while the feature is off; observers may still fire.
    if (!settings.enableAdSkip) return;
    if (adSkipRaf) return;
    if (typeof delay === 'number' && delay > 0) {
      adSkipRaf = setTimeout(runAdSkip, delay);
      return;
    }
    // requestAnimationFrame không chạy ở tab nền, nên dùng microtask/timeout ngắn.
    adSkipRaf = setTimeout(runAdSkip, 0);
  }

  function attachAdSkipObservers() {
    const player = getPlayerElement();
    if (!player) return;

    if (player !== adSkipObservedPlayer || player.querySelector('.video-ads') !== adSkipObservedLayer) {
      adSkipObservers.forEach((o) => o.disconnect());
      adSkipObservers = [];
      adSkipObservedPlayer = player;

      // Class của player (ad-showing / ad-interrupting).
      const classObserver = new MutationObserver(() => scheduleAdSkip());
      classObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
      adSkipObservers.push(classObserver);

      // Nút "Bỏ qua" và banner xuất hiện trong .video-ads.
      const adsLayer = player.querySelector('.video-ads');
      adSkipObservedLayer = adsLayer;
      if (adsLayer) {
        const layerObserver = new MutationObserver(() => scheduleAdSkip());
        layerObserver.observe(adsLayer, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden']
        });
        adSkipObservers.push(layerObserver);
      }
    }

    const video = getAdVideo(player);
    if (video && video !== adSkipObservedVideo) {
      adSkipObservedVideo = video;
      ['loadstart', 'emptied', 'loadedmetadata', 'durationchange', 'canplay', 'play', 'playing', 'pause', 'seeked', 'ended', 'waiting', 'stalled'].forEach((evt) => {
        video.addEventListener(evt, () => scheduleAdSkip(), { passive: true });
      });
    }
  }

  function clearHiddenAdElements() {
    document.querySelectorAll('[data-yt-aid-hidden-ad]').forEach((el) => {
      el.style.removeProperty('display');
      el.removeAttribute('data-yt-aid-hidden-ad');
    });
  }

  function syncAdSkipSettings() {
    document.body.classList.toggle('yt-aid-hide-ads', !!settings.enableHideAds);
    if (!settings.enableHideAds) {
      clearHiddenAdElements();
    }
    if (IS_MUSIC_SITE) return;
    if (!settings.enableAdSkip) {
      const player = getPlayerElement();
      if (player) restoreAfterAd(player);
      else setAdHidden(false);
      return;
    }
    attachAdSkipObservers();
    scheduleAdSkip();
  }

  function removeSecondaryAdBanners() {
    if (!settings.enableHideAds) {
      clearHiddenAdElements();
      return;
    }
    try {
      const adSlots = document.querySelectorAll(
        'ytd-ad-slot-renderer, ' +
        'ytd-companion-slot-renderer, ' +
        'ytd-action-companion-ad-renderer, ' +
        'ytd-in-feed-ad-layout-renderer, ' +
        'ytd-promoted-sparkles-web-renderer, ' +
        'ytd-compact-promoted-video-renderer, ' +
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"], ' +
        'ytd-engagement-panel-section-list-renderer:has(ytd-ads-engagement-panel-content-renderer), ' +
        '#masthead-ad'
      );
      adSlots.forEach((slot) => {
        if (slot.style.getPropertyValue('display') !== 'none') {
          slot.style.setProperty('display', 'none', 'important');
          slot.setAttribute('data-yt-aid-hidden-ad', '1');
        }
        const parentCard = slot.closest('ytd-rich-item-renderer');
        if (
          parentCard &&
          !parentCard.closest('#secondary, ytd-watch-next-secondary-results-renderer') &&
          !parentCard.querySelector('ytd-rich-grid-media, yt-lockup-view-model, ytd-video-renderer, ytd-reel-item-renderer, ytd-shorts-lockup-view-model')
        ) {
          parentCard.style.setProperty('display', 'none', 'important');
          parentCard.setAttribute('data-yt-aid-hidden-ad', '1');
        }
      });
    } catch (e) { }
  }

  function initAdSkipper() {
    if (IS_MUSIC_SITE) return;
    attachAdSkipObservers();
    window.addEventListener('yt-navigate-finish', () => {
      attachAdSkipObservers();
      scheduleAdSkip();
    });
    // Observe-only paths fire on their own; this poll is the backstop for a
    // player YouTube swapped out from under us. It walks the whole document, so
    // it stays slow and quiet while the tab is in the background.
    setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      removeSecondaryAdBanners();
      if (!settings.enableAdSkip) return;
      attachAdSkipObservers();
      runAdSkip();
    }, AD_SKIP_POLL_MS);
  }

  // ==========================================
  // FEED GRID: lấp chỗ trống do ẩn quảng cáo
  // ==========================================
  // Thẻ video và các dải rộng cả hàng (Shorts...) là con trực tiếp của một khung flex-wrap.
  // Ẩn bớt thẻ làm số thẻ giữa hai dải bị lẻ, hàng cuối trước dải còn trống bên phải.
  // Ta chỉ đổi thứ tự hiển thị bằng CSS "order" (không di chuyển phần tử trong DOM): dải rộng
  // được dời xuống sau khi hàng đang dở được lấp đủ, nên mọi video vẫn giữ nguyên.
  const FEED_ORDER_BASE = -1000000; // thẻ mới chưa xếp (order 0) tự nằm cuối, đúng chỗ của chúng
  let feedReflowTimer = 0;
  let feedReflowSig = '';
  let feedReflowContainer = null;
  let feedReflowObserver = null;

  function feedGridContents() {
    return document.querySelector('ytd-browse:not([hidden]) ytd-rich-grid-renderer > #contents');
  }

  function isFeedPage() {
    const path = window.location.pathname;
    return path === '/' || path.startsWith('/feed/');
  }

  function clearFeedReflow(container) {
    if (!container) return;
    container.querySelectorAll(':scope > [data-yt-aid-order]').forEach((el) => {
      el.style.removeProperty('order');
      el.removeAttribute('data-yt-aid-order');
    });
  }

  function reflowFeedGrid() {
    feedReflowTimer = 0;
    if (IS_MUSIC_SITE || !isFeedPage() || document.visibilityState === 'hidden') return;
    const container = feedGridContents();
    if (!container) return;

    if (container !== feedReflowContainer) {
      if (feedReflowObserver) feedReflowObserver.disconnect();
      feedReflowContainer = container;
      feedReflowSig = '';
      feedReflowObserver = new MutationObserver(() => scheduleFeedReflow(60));
      feedReflowObserver.observe(container, { childList: true });
    }

    if (!settings.enableHideAds) {
      clearFeedReflow(container);
      feedReflowSig = '';
      return;
    }

    const children = [...container.children];
    const firstItem = children.find((c) => c.tagName === 'YTD-RICH-ITEM-RENDERER' && c.getAttribute('items-per-row'));
    const perRow = Math.max(1, parseInt(firstItem && firstItem.getAttribute('items-per-row'), 10) || 1);
    const visible = children.map((c) => getComputedStyle(c).display !== 'none');
    const sig = `${perRow}|${visible.map((v) => (v ? 1 : 0)).join('')}`;
    if (sig === feedReflowSig) return;
    feedReflowSig = sig;

    const sequence = [];
    const pending = []; // dải rộng đang chờ hàng dở được lấp đủ
    let rowCount = 0;
    children.forEach((child, i) => {
      if (!visible[i]) return;
      if (child.tagName === 'YTD-RICH-ITEM-RENDERER') {
        sequence.push(child);
        rowCount = (rowCount + 1) % perRow;
        if (rowCount === 0 && pending.length) sequence.push(...pending.splice(0));
      } else if (rowCount === 0) {
        sequence.push(child);
      } else {
        pending.push(child);
      }
    });
    sequence.push(...pending);

    const orderOf = new Map(sequence.map((el, i) => [el, String(FEED_ORDER_BASE + i)]));
    children.forEach((child) => {
      const order = orderOf.get(child);
      if (order !== undefined) {
        if (child.style.order !== order) child.style.order = order;
        child.setAttribute('data-yt-aid-order', '');
      } else if (child.hasAttribute('data-yt-aid-order')) {
        child.style.removeProperty('order');
        child.removeAttribute('data-yt-aid-order');
      }
    });
  }

  function scheduleFeedReflow(delay = 80) {
    if (feedReflowTimer) return;
    feedReflowTimer = setTimeout(reflowFeedGrid, delay);
  }

  function initFeedReflow() {
    if (IS_MUSIC_SITE) return;
    window.addEventListener('resize', () => scheduleFeedReflow(150));
    window.addEventListener('yt-navigate-finish', () => scheduleFeedReflow(200));
    document.addEventListener('yt-page-data-updated', () => scheduleFeedReflow(200));
    document.addEventListener('visibilitychange', () => scheduleFeedReflow(0));
    // Thẻ quảng cáo chỉ bị ẩn sau khi nội dung của chúng render xong, nên quét nhẹ định kỳ.
    setInterval(() => {
      if (document.visibilityState === 'hidden' || !isFeedPage()) return;
      scheduleFeedReflow(0);
    }, 1200);
    scheduleFeedReflow(300);
  }

  // ==========================================
  // 12. AUTO SCROLL SHORTS (hết video thì tự sang Short kế tiếp)
  // ==========================================
  // Shorts mặc định lặp lại video nên không có sự kiện "ended". Ta bắt hai tín hiệu trên
  // sự kiện timeupdate (vẫn chạy khi tab ở nền): (1) còn <= 0,35s là hết, (2) video vừa
  // quay vòng về đầu. Sau đó bấm nút "Short kế tiếp" của YouTube (hoặc phím mũi tên xuống).
  let shortsLastTime = 0;
  let shortsLastAdvanceAt = 0;

  function findShortsNextButton() {
    return document.querySelector(
      'ytd-shorts #navigation-button-down button, #navigation-button-down button, ' +
      'ytd-shorts #navigation-button-down yt-button-shape button'
    );
  }

  function shortsKeyDown() {
    const opts = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true };
    const target = document.querySelector('ytd-shorts') || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function shortsScrollDown() {
    const box = document.querySelector('#shorts-container, ytd-shorts #shorts-inner-container, #shorts-inner-container');
    if (box) box.scrollBy({ top: box.clientHeight || window.innerHeight, behavior: 'smooth' });
  }

  function advanceShorts() {
    const now = Date.now();
    if (now - shortsLastAdvanceAt < 1500) return;
    shortsLastAdvanceAt = now;
    const startPath = window.location.pathname;
    showShortsChip('Auto scroll → next');

    // Bước 1: bấm nút "Short kế tiếp" (đúng 1 lần). Nếu sau 0,8s URL chưa đổi thì thử cách khác.
    const btn = findShortsNextButton();
    if (btn) btn.click(); else shortsKeyDown();

    setTimeout(() => {
      if (window.location.pathname !== startPath) return;
      if (btn) shortsKeyDown();
      setTimeout(() => {
        if (window.location.pathname === startPath) shortsScrollDown();
      }, 800);
    }, 800);
  }

  // Nhãn nhỏ ở góc trái dưới để biết tính năng đang chạy (tự mất sau vài giây).
  let shortsChip = null;
  let shortsChipTimer = 0;
  function showShortsChip(text, sticky = false) {
    try {
      if (!shortsChip || !shortsChip.isConnected) {
        shortsChip = document.createElement('div');
        shortsChip.id = 'yt-aid-shorts-chip';
        shortsChip.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;padding:6px 12px;' +
          'border-radius:999px;background:rgba(0,0,0,.75);color:#fff;font:12px/1.2 Roboto,Arial,sans-serif;' +
          'pointer-events:none;transition:opacity .3s;';
        document.body.appendChild(shortsChip);
      }
      shortsChip.textContent = text;
      shortsChip.style.opacity = '1';
      clearTimeout(shortsChipTimer);
      if (!sticky) shortsChipTimer = setTimeout(() => { if (shortsChip) shortsChip.style.opacity = '0'; }, 4000);
    } catch (e) { }
  }

  // Tìm video Short đang hiển thị: không phụ thuộc thuộc tính is-active (YouTube hay đổi).
  function getActiveShortsVideo() {
    let v = document.querySelector('ytd-reel-video-renderer[is-active] video');
    if (v) return v;
    const vh = window.innerHeight, vw = window.innerWidth;
    const candidates = document.querySelectorAll('ytd-shorts video, #shorts-player video, #shorts-container video');
    let best = null;
    let bestArea = 0;
    candidates.forEach((el) => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (w * h > bestArea) { bestArea = w * h; best = el; }
    });
    if (!best) best = [...candidates].find((el) => !el.paused) || candidates[0] || null;
    return best;
  }

  let shortsLastVideo = null;

  function shortsTick() {
    // Everything below only matters while the feature is on and a reel is on
    // screen; measuring the video each 150ms otherwise is pure overhead and it
    // lands exactly on the page (Shorts) that is already doing the most work.
    if (!settings.enableShortsAutoScroll) return;
    if (!isShortsPage()) return;
    if (document.visibilityState === 'hidden') return;

    const video = getActiveShortsVideo();
    const dur = video ? video.duration : NaN;
    const t = video ? video.currentTime : 0;

    if (!video) return;
    if (document.querySelector('ytd-reel-video-renderer[is-active] .ytp-ad-player-overlay, ytd-reel-video-renderer[is-active] ytd-ad-slot-renderer')) return;
    if (!isFinite(dur) || dur < 1) return;

    if (video !== shortsLastVideo) {
      shortsLastVideo = video;
      shortsLastTime = t;
      return;
    }
    const nearEnd = (t >= dur - 0.3 && !video.paused) || video.ended;
    const wrapped = shortsLastTime > dur * 0.6 && t < shortsLastTime - dur * 0.5;
    shortsLastTime = t;
    if (nearEnd || wrapped) advanceShorts();
  }

  function initShortsAutoScroll() {
    // timeupdate (~4 lần/giây) + timer 150ms: nếu YouTube đổi thẻ video thì timer vẫn bắt được.
    document.addEventListener('timeupdate', shortsTick, true);
    document.addEventListener('ended', shortsTick, true);
    setInterval(shortsTick, 150);
    window.addEventListener('yt-navigate-finish', () => {
      shortsLastTime = 0;
      shortsLastVideo = null;
      if (settings.enableShortsAutoScroll && isShortsPage()) showShortsChip('Auto scroll Shorts: ON');
    });
    setTimeout(() => {
      if (!isShortsPage()) return;
      showShortsChip(settings.enableShortsAutoScroll ? 'Auto scroll Shorts: ON' : 'Auto scroll Shorts: OFF (bật trong Options)');
    }, 1500);
  }

})();
