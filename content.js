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
    enableAdSkip: true,
    enableHideAds: true,
    enableShortsAutoScroll: false,
    hideButtonNames: false,
    audioBoost: 100,
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
          syncAudioBoost();
          syncAudioBoostUi();
          continue;
        }
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
    if (!settings.enableShortcuts) resetKeyBuffer();
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
    if (IS_MUSIC_SITE) return;

    if (!settings.enableShortcuts) resetKeyBuffer();
    if (changed('enableAdSkip') || changed('enableHideAds')) syncAdSkipSettings();
    if (changed('enableHideAds')) {
      feedReflowSig = '';
      scheduleFeedReflow(0);
    }
    if (changed('hideButtonNames')) syncButtonNamesUi();
    if (changed('enableLoop')) ensureVideoLoop();
    if (changed('enableCopyButtons')) {
      document.body.classList.toggle('yt-aid-hide-copy-buttons', !settings.enableCopyButtons);
      closeHomeFlyout();
    }
    if (!changedKeys) {
      document.body.classList.remove('yt-aid-hide-clean-link', 'yt-aid-hide-thumb-btn');
      syncAudioBoost();
      syncAudioBoostUi();
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

    document.querySelectorAll([
      '.yt-aid-watch-toolbar', '.yt-aid-card-bar', '#yt-aid-channel-actions',
      '#yt-aid-guide-entry', '#yt-aid-mini-entry', '#yt-aid-bookmark-shelf',
      '#yt-aid-random-home', '.yt-aid-home-trigger', '.yt-aid-home-flyout',
      '#yt-aid-bookmark-page', '.yt-aid-crop-overlay', '.yt-aid-bm-confirm-overlay',
      '.yt-aid-bm-favorite-picker', '#yt-aid-tools-menu', '#yt-aid-random-menu'
    ].join(', ')).forEach((el) => el.remove());

    injectAllAreas();
    injectBookmarkShelf();
    syncButtonNamesUi();
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
      initAudioBoost,
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
  // 1. TOAST NOTIFICATION SYSTEM
  // ==========================================
  let toastContainer = null;

  function createToastContainer() {
    if (document.getElementById('yt-aid-toast-container')) return;
    toastContainer = document.createElement('div');
    toastContainer.id = 'yt-aid-toast-container';
    toastContainer.className = 'yt-aid-toast-container';
    document.body.appendChild(toastContainer);
  }

  function showToast(message, type = 'info', duration = 2400, action = null) {
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
      <div class="yt-aid-toast-icon">${iconSvg}</div>
      <div class="yt-aid-toast-message">${escapeHtml(message)}</div>
    `;

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
      removeTimer = setTimeout(() => toast.remove(), 250);
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
  // 3B. AUDIO BOOST (gain above YouTube's 100%)
  // ==========================================
  const AUDIO_BOOST_MIN = 100;
  const AUDIO_BOOST_MAX = 150;
  const AUDIO_BOOST_STEP = 5;

  let audioBoostState = null;
  let audioBoostGestureArmed = false;
  let audioBoostFailedVideo = null;

  function sanitizeAudioBoost(value) {
    const level = Math.round(Number(value));
    if (!Number.isFinite(level)) return AUDIO_BOOST_MIN;
    return Math.min(AUDIO_BOOST_MAX, Math.max(AUDIO_BOOST_MIN, level));
  }

  function audioBoostLevel() {
    return sanitizeAudioBoost(settings.audioBoost);
  }

  function getBoostVideo() {
    return document.querySelector('video.html5-main-video') ||
      document.querySelector('#movie_player video');
  }

  function pageHasUserActivation() {
    try {
      return !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
    } catch (e) {
      return false;
    }
  }

  function audioBoostGain(state) {
    const now = state.context.currentTime;
    const boosting = state.level > AUDIO_BOOST_MIN;
    const gain = Math.max(1, state.level / 100);

    state.gain.gain.cancelScheduledValues(now);
    state.gain.gain.setTargetAtTime(gain, now, 0.02);
    // Unity gain stays transparent; the limiter only engages above 100% so
    // louder material does not clip into harsh distortion.
    state.limiter.ratio.cancelScheduledValues(now);
    state.limiter.ratio.setTargetAtTime(boosting ? 20 : 1, now, 0.02);
    state.limiter.threshold.cancelScheduledValues(now);
    state.limiter.threshold.setTargetAtTime(boosting ? -1.5 : 0, now, 0.02);
  }

  function setAudioBoostLevel(state, level) {
    state.level = level;
    audioBoostGain(state);
    if (level > AUDIO_BOOST_MIN && state.context.state === 'suspended') {
      state.context.resume().catch(() => { });
    }
  }

  function createAudioGraph(video) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    let context;
    try {
      context = new AudioCtor();
    } catch (e) {
      return null;
    }

    let source;
    try {
      // A media element can only ever have one source node. If another
      // extension already claimed it this throws and we leave native audio be.
      source = context.createMediaElementSource(video);
    } catch (e) {
      try { context.close(); } catch (closeError) { }
      return null;
    }

    const gain = context.createGain();
    gain.gain.value = 1;

    const limiter = context.createDynamicsCompressor();
    limiter.knee.value = 0;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.ratio.value = 1;
    limiter.threshold.value = 0;

    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(context.destination);

    audioBoostState = { video, context, source, gain, limiter, level: AUDIO_BOOST_MIN };
    return audioBoostState;
  }

  function releaseAudioGraph() {
    const state = audioBoostState;
    if (!state) return;
    audioBoostState = null;
    try { state.source.disconnect(); } catch (e) { }
    try { state.gain.disconnect(); } catch (e) { }
    try { state.limiter.disconnect(); } catch (e) { }
    try { state.context.close(); } catch (e) { }
  }

  // Called from a real user gesture (slider) so the AudioContext is allowed to
  // start. Returns null when the video cannot be routed through Web Audio.
  function applyAudioBoostNow() {
    const video = getBoostVideo();
    if (!video) return null;
    // The marked element belongs to a player YouTube already detached; keeping
    // the reference would pin the old player tree in memory after navigation.
    if (audioBoostFailedVideo && !audioBoostFailedVideo.isConnected) audioBoostFailedVideo = null;
    if (audioBoostFailedVideo === video) return null;

    const level = audioBoostLevel();
    if (audioBoostState && audioBoostState.video !== video) {
      // YouTube swapped the player element; the old one is out of the page.
      releaseAudioGraph();
    }

    if (level <= AUDIO_BOOST_MIN) {
      if (audioBoostState && audioBoostState.video === video) {
        setAudioBoostLevel(audioBoostState, AUDIO_BOOST_MIN);
      }
      return audioBoostState;
    }

    const state = audioBoostState && audioBoostState.video === video
      ? audioBoostState
      : createAudioGraph(video);

    if (!state) {
      audioBoostFailedVideo = video;
      showToast('Không tăng được âm lượng: trình duyệt hoặc tiện ích khác đang giữ âm thanh video.', 'warning', 3200);
      return null;
    }

    setAudioBoostLevel(state, level);
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
      applyAudioBoostNow();
    };

    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    document.addEventListener('touchstart', onGesture, true);
  }

  function syncAudioBoost() {
    if (IS_MUSIC_SITE) return;
    // Nothing to route while the tab is in the background.
    if (document.visibilityState === 'hidden') return;

    const video = getBoostVideo();
    if (!video) {
      if (audioBoostState && !audioBoostState.video.isConnected) releaseAudioGraph();
      return;
    }

    if (audioBoostState) {
      if (audioBoostState.video === video) {
        setAudioBoostLevel(audioBoostState, audioBoostLevel());
        return;
      }
      // Player swapped while the level sits at 100%: nothing will call
      // applyAudioBoostNow, so drop the stale graph here.
      if (!audioBoostState.video.isConnected) releaseAudioGraph();
    }

    if (audioBoostLevel() <= AUDIO_BOOST_MIN) return;

    if (pageHasUserActivation()) {
      applyAudioBoostNow();
    } else {
      armAudioBoostGesture();
    }
  }

  function syncAudioBoostUi() {
    const range = document.getElementById('yt-aid-audio-boost');
    if (!range) return;
    const level = audioBoostLevel();
    if (range.value !== String(level)) range.value = String(level);
    const valueEl = document.getElementById('yt-aid-audio-boost-value');
    if (valueEl) valueEl.textContent = `${level}%`;
  }

  function initAudioBoost() {
    syncAudioBoost();
    window.addEventListener('yt-navigate-finish', syncAudioBoost);
    document.addEventListener('yt-page-data-updated', syncAudioBoost);
    document.addEventListener('visibilitychange', syncAudioBoost);
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
      showToast(T('Phím tắt [{0}]: Chuyển sang YouTube Shorts', [shortcutSequence('shorts')]), 'info', 1600);
      goToYoutubeTarget('/shorts');
      return;
    }

    updateCachedShorts();
    const shortsAnchor = findSuggestedShortsElement();

    if (shortsAnchor) {
      const id = shortsIdFromAnchor(shortsAnchor);
      if (id) {
        showToast(T('Phím tắt [{0}]: Mở Shorts gợi ý [{1}]', [shortcutSequence('shorts'), id]), 'info', 1600);
      } else {
        showToast(T('Phím tắt [{0}]: Chuyển sang YouTube Shorts', [shortcutSequence('shorts')]), 'info', 1600);
      }
      shortsAnchor.click();
      return;
    }

    if (cachedSuggestedShortsId) {
      showToast(T('Phím tắt [{0}]: Mở Shorts gợi ý [{1}]', [shortcutSequence('shorts'), cachedSuggestedShortsId]), 'info', 1600);
      simulateSpaNavigation(`/shorts/${cachedSuggestedShortsId}`);
      return;
    }

    showToast(T('Phím tắt [{0}]: Chuyển sang YouTube Shorts', [shortcutSequence('shorts')]), 'info', 1600);
    simulateSpaNavigation('/shorts');
  }

  function navigateToHome() {
    showToast(T('Phím tắt [{0}]: Về trang chủ', [shortcutSequence('home')]), 'info', 1600);
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
    showToast(T('Phím tắt [{0}]: Mở lịch sử xem', [shortcutSequence('history')]), 'info', 1600);
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
    showToast(T('Phím tắt [{0}]: Danh sách phát', [shortcutSequence('playlists')]), 'info', 1600);
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
      showToast(T('Phím tắt [{0}]: Bạn đang ở YouTube Music', [shortcutSequence('music')]), 'info', 1600);
      if (window.location.pathname !== '/') window.location.assign('https://music.youtube.com/');
      return;
    }
    showToast(T('Phím tắt [{0}]: Chuyển sang YouTube Music', [shortcutSequence('music')]), 'info', 1600);
    window.location.href = 'https://music.youtube.com/';
  }

  function executeShortcut(actionId) {
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
      showToast('Không tìm thấy nội dung để sao chép!', 'warning');
      return;
    }
    rememberCopiedText(text);
    writeClipboard(text).then((ok) => {
      if (!ok) {
        showToast('Lỗi sao chép vào clipboard', 'warning');
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
    showToast(T('Đã mở tìm kiếm trong tab mới: "{0}"', [previewText(text, 30)]), 'success');
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

    showToast(T('Đang tìm kiếm: "{0}"', [previewText(text, 35)]), 'success');
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
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>
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
      showToast(T('Đã tải ảnh: {0}', [previewText(filename, 45)]), 'success', 2800);
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
        showToast(T('Đã tải ảnh đã cắt: {0} × {1}', [sw, sh]), 'success', 2800);
        closeThumbnailCropper();
      } catch (e) {
        if (closed) return;
        setBusy(false);
        showToast('Không tạo được ảnh đã cắt, thử lại nhé.', 'warning');
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
      showToast('Không hiển thị được ảnh bìa để cắt', 'warning');
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
      showToast('Không tìm thấy mã video để tải ảnh bìa', 'warning');
      return;
    }

    if (triggerEl) triggerEl.dataset.ytAidBusy = 'true';
    showToast('Đang tải ảnh bìa…', 'info', 1400);

    const blob = await fetchThumbnailBlob(videoId);
    if (triggerEl) delete triggerEl.dataset.ytAidBusy;

    if (!blob) {
      showToast('Không tải được ảnh bìa của video này', 'warning');
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
        isAvatar ? 'Không tìm thấy ảnh đại diện của kênh' : 'Không tìm thấy ảnh banner của kênh',
        'warning'
      );
      return;
    }

    if (triggerEl) triggerEl.dataset.ytAidBusy = 'true';
    showToast(isAvatar ? 'Đang tải ảnh đại diện kênh…' : 'Đang tải ảnh banner kênh…', 'info', 1400);

    const blob = await fetchChannelImageBlob(url, fallback);
    if (triggerEl) delete triggerEl.dataset.ytAidBusy;

    if (!blob) {
      showToast('Không tải được ảnh của kênh này', 'warning');
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
        showToast(T('Đã sao chép đoạn bôi đen: "{0}"', [previewText(text)]), 'success', 1800);
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
          showToast(T('Đã dán vào ô tìm kiếm: "{0}"', [previewText(text, 35)]), 'success', 2000);
        } else if (settings.enableAutoPasteReplace) {
          showToast(T('Đã thay nội dung tìm kiếm bằng: "{0}"', [previewText(text, 35)]), 'success', 2000);
        } else {
          showToast(T('Đã thêm vào ô tìm kiếm: "{0}"', [previewText(text, 35)]), 'success', 2000);
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

    const AID_UI_SELECTOR = '#yt-aid-channel-actions, #yt-aid-watch-toolbar, .yt-aid-card-bar, .yt-aid-home-trigger, #yt-aid-bookmark-shelf, #yt-aid-random-home';
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
    });
    window.addEventListener('pagehide', cancelRandomVideo);
    window.addEventListener('yt-navigate-finish', () => {
      cancelRandomVideo();
      closeHomeFlyout();
      closeDropdown();
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
    const hasCardTools = settings.enableCopyButtons || settings.enableCleanLink || settings.enableThumbnailDownload;

    if (!isHomeFeedPage()) closeHomeFlyout();
    injectBookmarkUi();
    injectRandomHomeControl();

    if (path.startsWith('/watch')) {
      injectWatchPageToolbar();
      if (hasCardTools) injectSidebarButtons(cardRoots);
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
    if (hasCurrentToolbar) return;

    const titleContainer = document.querySelector(
      'ytd-watch-metadata #title, #above-the-fold #title, ytd-video-primary-info-renderer #container'
    );

    if (!titleContainer) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'yt-aid-watch-toolbar';
    toolbar.className = 'yt-aid-watch-toolbar';
    toolbar.dataset.ytAidVersion = EXT_VERSION;

    toolbar.innerHTML = `
      <div class="yt-aid-toolbar-left">
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

        <!-- Clean Copy Link -->
        <button class="yt-aid-pill-btn yt-aid-clean-link" id="yt-aid-btn-clean-link" title="Copy Link: sao chép liên kết sạch không query tracking" aria-label="Copy Link">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <span>Copy Link</span>
        </button>

        <!-- Bookmark (lưu mốc thời gian hiện tại) + Log -->
        <div class="yt-aid-split-group yt-aid-bookmark-group">
          <button class="yt-aid-pill-btn yt-aid-bookmark-btn" id="yt-aid-btn-bookmark" title="Lưu bookmark tại thời điểm đang xem">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>
            <span>Bookmark</span>
          </button>
          <button class="yt-aid-pill-btn yt-aid-pill-sub yt-aid-bookmark-log-btn" id="yt-aid-btn-bookmark-log" title="Xem log bookmark của video này" aria-label="Log bookmark của video này" aria-haspopup="true" aria-expanded="false">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
            <span></span>
          </button>
        </div>

        <!-- Downloads button (thumbnail crop) -->
        <button class="yt-aid-pill-btn yt-aid-downloads-btn" id="yt-aid-btn-downloads" title="Tải ảnh bìa thumbnail (có cắt ảnh)" aria-label="Tải thumbnail">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          <span>Thumbnail</span>
        </button>
      </div>

      <div class="yt-aid-toolbar-right">
        <!-- Auto Loop Toggle Button -->
        <button class="yt-aid-pill-btn yt-aid-loop-indicator ${settings.enableLoop ? 'active' : ''}" id="yt-aid-btn-toggle-loop" title="${settings.enableLoop ? 'Auto Loop đang bật' : 'Auto Loop đang tắt'}">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>Autoloop: ${settings.enableLoop ? 'ON' : 'OFF'}</span>
        </button>

        <!-- Extra tools dropdown -->
        <button class="yt-aid-pill-btn yt-aid-tools-btn" id="yt-aid-btn-tools" title="Tính năng phụ" aria-label="Tính năng phụ" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
          <span>Tools</span>
          <svg class="yt-aid-chevron" viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
        </button>

        <!-- Collapse the toolbar labels to icons only -->
        <button class="yt-aid-pill-btn yt-aid-name-toggle" id="yt-aid-btn-toggle-names" title="Ẩn tên các nút trong thanh công cụ" aria-pressed="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.83 0l7-7a2 2 0 0 0 0-2.84zM7 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
          <span>Hide Button Name</span>
        </button>
      </div>
    `;

    toolbar.querySelector('.yt-aid-toolbar-right').prepend(buildRandomVideoControl());
    titleContainer.appendChild(toolbar);
    localizeTree(toolbar);
    syncRandomVideoUi();
    syncButtonNamesUi();

    // 1. Copy Pure
    toolbar.querySelector('#yt-aid-btn-copy-pure').addEventListener('click', () => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, T('Đã sao chép tiêu đề: "{0}"', [previewText(title, 35)]));
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
      copyTextToClipboard(cleanUrl, T('Đã chép liên kết sạch: {0}', [cleanUrl]));
    });

    // Bookmark current video
    const bookmarkBtn = toolbar.querySelector('#yt-aid-btn-bookmark');
    bookmarkBtn.addEventListener('mouseenter', () => {
      bookmarkBtn.title = T('Lưu bookmark tại {0}', [formatVideoTime(getCurrentVideoTime())]);
    });
    bookmarkBtn.addEventListener('click', () => {
      if (isAdPlaying()) {
        showToast('Đang phát quảng cáo, hãy thử lại khi video chính chạy', 'warning');
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

    // Thumbnail download with crop dialog
    const downloadsBtn = toolbar.querySelector('#yt-aid-btn-downloads');
    downloadsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadThumbnail(downloadsBtn, getWatchVideoTitle(), window.location.href);
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
        showToast(nextLoop ? 'Đã bật tự động lặp lại video' : 'Đã tắt tự động lặp lại video', 'info');
      }
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
    setTimeout(() => menu.remove(), 160);
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
    const menuWidth = menu.offsetWidth;
    // offsetHeight is the full box height; maxHeight later clamps the content
    // box, so reserve the menu's 6px padding + 1px border on each side.
    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    // Keep the whole menu on screen: flip above the button when the space
    // below would force the last row out of view.
    const openUp = menuHeight > spaceBelow && spaceAbove > spaceBelow;

    const maxLeft = window.innerWidth - menuWidth - 12;
    menu.style.left = `${Math.round(Math.max(12, Math.min(rect.right - menuWidth, maxLeft)))}px`;

    if (openUp) {
      menu.style.maxHeight = `${Math.round(Math.max(160, spaceAbove - 14))}px`;
      menu.style.top = `${Math.round(Math.max(edge, rect.top - gap - Math.min(menuHeight, spaceAbove)))}px`;
    } else {
      menu.style.maxHeight = `${Math.round(Math.max(160, spaceBelow - 14))}px`;
      menu.style.top = `${Math.round(rect.bottom + gap)}px`;
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

    syncButtonNamesUi();
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

      <div class="yt-aid-tools-item yt-aid-tools-boost">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Tăng âm lượng video</span>
          <span class="yt-aid-tools-desc">Vượt 100% của YouTube, tối đa 150%</span>
        </span>
        <span class="yt-aid-boost">
          <input type="range" id="yt-aid-audio-boost" min="${AUDIO_BOOST_MIN}" max="${AUDIO_BOOST_MAX}" step="${AUDIO_BOOST_STEP}" value="${audioBoostLevel()}" aria-label="Tăng âm lượng video">
          <span class="yt-aid-boost-value" id="yt-aid-audio-boost-value">${audioBoostLevel()}%</span>
        </span>
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

    const boostRange = menu.querySelector('#yt-aid-audio-boost');
    const boostValue = menu.querySelector('#yt-aid-audio-boost-value');
    boostRange.addEventListener('input', (e) => {
      const level = sanitizeAudioBoost(e.target.value);
      settings.audioBoost = level;
      if (boostValue) boostValue.textContent = `${level}%`;

      if (level <= AUDIO_BOOST_MIN) {
        syncAudioBoost();
        return;
      }

      if (!applyAudioBoostNow()) {
        settings.audioBoost = AUDIO_BOOST_MIN;
        boostRange.value = String(AUDIO_BOOST_MIN);
        if (boostValue) boostValue.textContent = `${AUDIO_BOOST_MIN}%`;
      }
    });
    boostRange.addEventListener('change', () => {
      safeSetStorage({ audioBoost: settings.audioBoost });
    });

    return localizeTree(menu);
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
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
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
        copyTextToClipboard(title, T('Đã sao chép: "{0}"', [previewText(title, 30)]));
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
        copyTextToClipboard(clean, T('Đã chép link sạch: {0}', [clean]));
      });

      cardBar.querySelector('.yt-aid-thumb').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        downloadThumbnail(e.currentTarget, getCardTitle(), getCardUrl());
      });
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
    return `copy:${settings.enableCopyButtons ? 1 : 0}`;
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
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      </button>
    `);

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
        copyTextToClipboard(title, T('Đã sao chép: "{0}"', [previewText(title, 30)]));
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
        copyTextToClipboard(clean, T('Đã chép liên kết: {0}', [previewText(clean, 45)]));
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
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
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

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
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
    if (existing && existing.nextElementSibling === grid) return;
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.id = 'yt-aid-random-home';
    bar.appendChild(buildRandomVideoControl());
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
        showToast(options.feed ? 'Feed đã tải chưa có video phù hợp. Hãy tải thêm feed hoặc đổi bộ lọc.' :
          'Chưa tìm được video phù hợp. Hãy thử lại hoặc đổi bộ lọc.', 'warning', 4000);
        return;
      }
      randomRecentIds.push(selected.id);
      if (randomRecentIds.length > 20) randomRecentIds.shift();
      goToYoutubeTarget(selected.isShort ? `/shorts/${selected.id}` : `/watch?v=${selected.id}`);
    } catch (error) {
      console.error('[YoutubeAid] random lỗi:', error);
      if (request.signal.aborted) return;
      showToast(signal.aborted ? 'YouTube phản hồi chậm. Hãy thử lại.' :
        'Không lấy được video từ YouTube. Hãy kiểm tra kết nối rồi thử lại.', 'warning', 4000);
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
  const BOOKMARK_SHELF_COLLAPSED_KEY = 'bookmarkShelfCollapsed';
  const BOOKMARK_LIMIT = 2000;
  const BOOKMARK_SHELF_MAX = 12;
  const BOOKMARK_NAME_MAX = 200;
  const BOOKMARK_ICON_OUTLINE = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z';
  const BOOKMARK_ICON_FILLED = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z';
  const CLOSE_ICON = 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
  const EDIT_ICON = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
  const TRASH_ICON = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';
  const LOG_ICON = 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z';
  const EYE_ICON = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';
  const EYE_OFF_ICON = 'M2.1 3.51.69-.69 18.38 18.37-.69.69-3.45-3.45A11.74 11.74 0 0 1 12 19.5C7 19.5 2.73 16.39 1 12a12.77 12.77 0 0 1 4.11-5.3L2.1 3.51zM12 4.5c5 0 9.27 3.11 11 7.5a12.67 12.67 0 0 1-2.6 4.01l-3.1-3.1A5 5 0 0 0 11.09 6.7L9.13 4.74A12.1 12.1 0 0 1 12 4.5zm-.71 4.55 3.66 3.66A3 3 0 0 0 11.29 9.05z';
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
  let bookmarkShelfCollapsed = false;
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
    bookmarks = [{
      uid: newBookmarkUid(),
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
        : T('Đã thêm bookmark: "{0}"', [previewText(data.title || data.id, 35)]),
      'success'
    );
    return true;
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
    injectBookmarkShelf();
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
      chrome.storage.local.get({ [BOOKMARKS_KEY]: [], [BOOKMARK_SHELF_COLLAPSED_KEY]: false }, (items) => {
        void chrome.runtime?.lastError;
        bookmarks = sanitizeBookmarks(items && items[BOOKMARKS_KEY]);
        bookmarkShelfCollapsed = !!(items && items[BOOKMARK_SHELF_COLLAPSED_KEY]);
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
      renderBookmarkShelf();
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
    picker.style.left = `${Math.round(left)}px`;
    picker.style.top = `${Math.round(Math.max(8, top))}px`;

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
  function buildBookmarkGroupCard(group, compact) {
    const items = group.items;
    const multi = items.length > 1;
    const single = multi ? null : items[0];
    // Bấm vào ảnh/tiêu đề: mở bookmark được lưu gần nhất.
    const primary = items.reduce((a, b) => (b.addedAt > a.addedAt ? b : a), items[0]);

    const card = document.createElement('div');
    card.className = compact ? 'yt-aid-bm-card yt-aid-bm-card-compact' : 'yt-aid-bm-card';
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
    const useBookmarkName = compact && single;
    const titleText = useBookmarkName ? bookmarkDisplayName(single) : (group.title || group.id);
    const titleLink = document.createElement('a');
    titleLink.className = 'yt-aid-bm-title';
    titleLink.href = bookmarkUrl(primary);
    titleLink.textContent = titleText;
    titleLink.title = titleText;
    titleLink.addEventListener('click', (e) => openBookmark(e, primary));
    info.appendChild(titleLink);

    if (useBookmarkName && single.name && single.title) {
      const sub = document.createElement('div');
      sub.className = 'yt-aid-bm-channel';
      sub.textContent = single.title;
      sub.title = single.title;
      info.appendChild(sub);
    }
    if (group.channel) {
      const ch = document.createElement('div');
      ch.className = 'yt-aid-bm-channel';
      ch.textContent = group.channel;
      info.appendChild(ch);
    }

    if (compact && multi) {
      // Dải Trang chủ: hiện các mốc thời gian dạng chip để nhảy thẳng tới mốc cần xem.
      const chips = document.createElement('div');
      chips.className = 'yt-aid-bm-chips';
      const MAX_CHIPS = 5;
      items.slice(0, MAX_CHIPS).forEach((bm) => {
        const chip = document.createElement('a');
        chip.className = 'yt-aid-bm-chip';
        chip.href = bookmarkUrl(bm);
        chip.textContent = formatVideoTime(bm.time);
        chip.title = bm.name || defaultBookmarkLabel(bm);
        chip.addEventListener('click', (e) => openBookmark(e, bm));
        chips.appendChild(chip);
      });
      if (items.length > MAX_CHIPS) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'yt-aid-bm-chip yt-aid-bm-chip-more';
        more.textContent = `+${items.length - MAX_CHIPS}`;
        more.title = T('Xem tất cả bookmark');
        more.addEventListener('click', (e) => {
          e.preventDefault();
          openBookmarkPage();
        });
        chips.appendChild(more);
      }
      info.appendChild(chips);
    }

    if (!compact) {
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
    }
    card.appendChild(info);

    if (!compact) return card;

    const actions = document.createElement('div');
    actions.className = 'yt-aid-bm-actions';
    if (compact && single) {
      actions.appendChild(makeIconButton('yt-aid-bm-action', T('Đổi tên bookmark'), EDIT_ICON, () => startInlineRename(titleLink, single)));
      actions.appendChild(makeIconButton('yt-aid-bm-action yt-aid-bm-action-danger', T('Xóa bookmark'), CLOSE_ICON, () => removeBookmark(single.uid)));
    } else {
      actions.appendChild(makeIconButton(
        'yt-aid-bm-action yt-aid-bm-action-danger',
        multi ? T('Xóa {0} bookmark của video', [items.length]) : T('Xóa bookmark'),
        TRASH_ICON,
        () => removeVideoBookmarks(group.id)
      ));
    }
    card.appendChild(actions);
    return card;
  }

  // --- Dải bookmark trên Trang chủ ---
  function removeBookmarkShelf() {
    document.querySelectorAll('#yt-aid-bookmark-shelf').forEach((el) => el.remove());
  }

  function setBookmarkShelfCollapsed(collapsed) {
    bookmarkShelfCollapsed = !!collapsed;
    safeSetStorage({ [BOOKMARK_SHELF_COLLAPSED_KEY]: bookmarkShelfCollapsed });
    syncBookmarkShelfVisibility();
  }

  function syncBookmarkShelfVisibility() {
    const shelf = document.getElementById('yt-aid-bookmark-shelf');
    if (!shelf) return;
    const row = shelf.querySelector('.yt-aid-bm-shelf-row');
    if (row) row.hidden = bookmarkShelfCollapsed;
    shelf.classList.toggle('yt-aid-bm-shelf-collapsed', bookmarkShelfCollapsed);
    const toggle = shelf.querySelector('.yt-aid-bm-shelf-toggle');
    if (!toggle) return;
    toggle.title = T(bookmarkShelfCollapsed ? 'Hiển thị video bookmark' : 'Ẩn video bookmark');
    toggle.setAttribute('aria-expanded', bookmarkShelfCollapsed ? 'false' : 'true');
    toggle.querySelector('path').setAttribute('d', bookmarkShelfCollapsed ? EYE_ICON : EYE_OFF_ICON);
    toggle.querySelector('span').textContent = T(bookmarkShelfCollapsed ? 'Hiện' : 'Ẩn');
  }

  function renderBookmarkShelf() {
    const shelf = document.getElementById('yt-aid-bookmark-shelf');
    if (!shelf) return;
    if (!bookmarks.length) {
      shelf.remove();
      return;
    }

    shelf.textContent = '';
    const header = document.createElement('div');
    header.className = 'yt-aid-bm-shelf-header';
    const title = document.createElement('div');
    title.className = 'yt-aid-bm-shelf-title';
    title.appendChild(svgIcon(BOOKMARK_ICON_FILLED));
    const titleText = document.createElement('span');
    const shelfGroups = groupBookmarksByVideo(bookmarks);
    titleText.textContent = shelfGroups.length === bookmarks.length
      ? T('Bookmark ({0})', [bookmarks.length])
      : T('Bookmark ({0} video · {1} mốc)', [shelfGroups.length, bookmarks.length]);
    title.appendChild(titleText);
    header.appendChild(title);

    const headerActions = document.createElement('div');
    headerActions.className = 'yt-aid-bm-shelf-header-actions';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'yt-aid-bm-link-btn yt-aid-bm-shelf-toggle';
    toggle.title = T(bookmarkShelfCollapsed ? 'Hiển thị video bookmark' : 'Ẩn video bookmark');
    toggle.setAttribute('aria-expanded', bookmarkShelfCollapsed ? 'false' : 'true');
    toggle.appendChild(svgIcon(bookmarkShelfCollapsed ? EYE_ICON : EYE_OFF_ICON));
    const toggleText = document.createElement('span');
    toggleText.textContent = T(bookmarkShelfCollapsed ? 'Hiện' : 'Ẩn');
    toggle.appendChild(toggleText);
    toggle.addEventListener('click', () => setBookmarkShelfCollapsed(!bookmarkShelfCollapsed));
    headerActions.appendChild(toggle);

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'yt-aid-bm-link-btn';
    more.textContent = T('Xem tất cả');
    more.addEventListener('click', openBookmarkPage);
    headerActions.appendChild(more);
    header.appendChild(headerActions);
    shelf.appendChild(header);

    const row = document.createElement('div');
    row.className = 'yt-aid-bm-shelf-row';
    row.hidden = bookmarkShelfCollapsed;
    shelf.classList.toggle('yt-aid-bm-shelf-collapsed', bookmarkShelfCollapsed);
    shelfGroups.slice(0, BOOKMARK_SHELF_MAX).forEach((g) => row.appendChild(buildBookmarkGroupCard(g, true)));
    shelf.appendChild(row);
  }

  function injectBookmarkShelf() {
    if (window.location.pathname !== '/' || !bookmarks.length) {
      removeBookmarkShelf();
      return;
    }
    const grid = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer') ||
      document.querySelector('ytd-rich-grid-renderer');
    if (!grid) return;

    let shelf = document.getElementById('yt-aid-bookmark-shelf');
    if (shelf && shelf.parentElement === grid) return;
    if (shelf) shelf.remove();

    shelf = document.createElement('section');
    shelf.id = 'yt-aid-bookmark-shelf';
    shelf.className = 'yt-aid-bm-shelf';
    const contents = grid.querySelector(':scope > #contents');
    if (contents) grid.insertBefore(shelf, contents);
    else grid.insertBefore(shelf, grid.firstChild);
    renderBookmarkShelf();
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
    page.style.top = `${top}px`;
    page.style.left = `${left}px`;
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
        cached = { signature, card: buildBookmarkGroupCard(group, false) };
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
    injectBookmarkShelf();
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
            injectBookmarkShelf();
          }
        }
        if (changes[BOOKMARK_SHELF_COLLAPSED_KEY]) {
          const next = !!changes[BOOKMARK_SHELF_COLLAPSED_KEY].newValue;
          if (next !== bookmarkShelfCollapsed) {
            bookmarkShelfCollapsed = next;
            syncBookmarkShelfVisibility();
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
      injectBookmarkShelf();
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
    '.ytp-skip-ad button'
  ].join(', ');
  const AD_OVERLAY_CLOSE_SELECTORS = '.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container';
  const AD_MAX_SEEK_DURATION = 600; // chỉ tua tới cuối nếu "video" ngắn hơn 10 phút (tránh tua nhầm video chính)
  const AD_SKIP_POLL_MS = 250;
  const AD_FAST_POLL_MS = 80; // khi đang có quảng cáo: kiểm tra mỗi 80ms thay vì chờ timer 250ms

  let adSkipState = null; // { muted, rate } của video trước khi vào quảng cáo
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
  const AD_HIDE_MAX_MS = 1500;    // sau 15s mà quảng cáo vẫn chưa hết: ngừng giấu để bạn tự thao tác được
  const AD_STUCK_AFTER_MS = 250;  // quảng cáo đứng ở cuối quá 0,4s thì coi là kẹt
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
    try {
      const r = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, composed: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, opts));
      });
    } catch (e) { }
    try { el.click(); } catch (e) { }
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
      video.playbackRate = 16;
    } catch (e) { }

    const skipBtn = player.querySelector(AD_SKIP_BUTTON_SELECTORS);
    if (skipBtn) fireRealClick(skipBtn);

    // Quảng cáo đang tải/đệm: ép phát để nó có dữ liệu sớm nhất có thể.
    if (kind === 'strong' && video.paused) nudgeAdPlayback(player, video);

    // Tua tới cuối quảng cáo (cả loại không có nút bỏ qua). Chỉ tua khi chắc chắn là quảng cáo.
    const duration = video.duration;
    if (kind === 'strong' && isFinite(duration) && duration > 0 && duration <= AD_MAX_SEEK_DURATION) {
      const atEnd = video.ended || video.currentTime >= duration - 0.1;
      if (!atEnd) {
        adAtEndSince = 0;
        // Video đang dừng thì tua tới cuối sẽ không phát sinh sự kiện kết thúc: cho chạy trước.
        if (video.paused) nudgeAdPlayback(player, video);
        try { video.currentTime = duration; } catch (e) { }
      } else {
        // Đã ở cuối nhưng quảng cáo vẫn còn hiện (kẹt): lùi nhẹ rồi cho chạy lại để kích hoạt kết thúc.
        if (!adAtEndSince) adAtEndSince = Date.now();
        if (Date.now() - adAtEndSince > AD_STUCK_AFTER_MS && adStuckAttempts < AD_STUCK_MAX_TRIES) {
          adStuckAttempts++;
          try { video.currentTime = Math.max(0, duration - 0.3); } catch (e) { }
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

  function syncAdSkipSettings() {
    document.body.classList.toggle('yt-aid-hide-ads', !!settings.enableHideAds);
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

  function initAdSkipper() {
    if (IS_MUSIC_SITE) return;
    attachAdSkipObservers();
    window.addEventListener('yt-navigate-finish', () => {
      attachAdSkipObservers();
      scheduleAdSkip();
    });
    // Dự phòng: gắn lại observer khi player bị YouTube thay mới và quét định kỳ.
    setInterval(() => {
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
  // Tạm bật nhãn gỡ lỗi luôn hiện trên trang Shorts để biết tiện ích thấy gì. Đặt false khi đã ổn.
  const SHORTS_DEBUG_CHIP = false;

  function shortsTick() {
    const onShorts = window.location.pathname.startsWith('/shorts');
    if (!onShorts) {
      if (shortsChip && shortsChip.style.opacity !== '0') shortsChip.style.opacity = '0';
      return;
    }

    const video = getActiveShortsVideo();
    const enabled = !!settings.enableShortsAutoScroll;
    const dur = video ? video.duration : NaN;
    const t = video ? video.currentTime : 0;
    const info = video
      ? `t=${t.toFixed(1)}/${isFinite(dur) ? dur.toFixed(1) : '?'} paused=${video.paused} loop=${video.loop} ended=${video.ended} next=${!!findShortsNextButton()}`
      : 'no-video';
    document.documentElement.setAttribute('data-yt-aid-shorts', info);
    if (SHORTS_DEBUG_CHIP && Date.now() - shortsLastAdvanceAt > 2500) {
      showShortsChip(`Auto scroll: ${enabled ? 'ON' : 'OFF'} · ${info}`, true);
    }

    if (!enabled || !video) return;
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
      if (settings.enableShortsAutoScroll && window.location.pathname.startsWith('/shorts')) showShortsChip('Auto scroll Shorts: ON');
    });
    setTimeout(() => {
      if (window.location.pathname.startsWith('/shorts')) {
        showShortsChip(settings.enableShortsAutoScroll ? 'Auto scroll Shorts: ON' : 'Auto scroll Shorts: OFF (bật trong Options)');
      }
    }, 1500);
    // Gỡ lỗi: trạng thái được ghi vào thuộc tính data-yt-aid-shorts của <html> (xem ở Console của trang).
  }

})();
