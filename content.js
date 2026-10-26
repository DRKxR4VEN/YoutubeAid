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

  // --- Configuration & Default Settings ---
  const DEFAULT_SETTINGS = {
    enableLoop: true,
    enableShortcuts: true,
    enableCopyButtons: true,
    enableCleanLink: true,
    enableToasts: true,
    enableSelectionCopy: true,
    enableAutoPasteSearch: true,
    enableAutoPasteReplace: true,
    enableThumbnailDownload: true,
    audioBoost: 100,
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

      let settingsChanged = false;
      for (const [key, change] of Object.entries(changes)) {
        if (key === LAST_COPIED_KEY) {
          restoreLastCopied(change.newValue);
          continue;
        }
        if (key === 'shortcutKeys') {
          settings.shortcutKeys = sanitizeShortcutKeys(change.newValue);
          settingsChanged = true;
          continue;
        }
        if (key === 'shortcutTaps') {
          settings.shortcutTaps = sanitizeShortcutTaps(change.newValue);
          settingsChanged = true;
          continue;
        }
        if (key === 'audioBoost') {
          settings.audioBoost = sanitizeAudioBoost(change.newValue);
          syncAudioBoost();
          syncAudioBoostUi();
          continue;
        }
        if (!(key in DEFAULT_SETTINGS)) continue;
        settings[key] = change.newValue === undefined ? DEFAULT_SETTINGS[key] : change.newValue;
        settingsChanged = true;
      }

      if (settingsChanged) applySettingUpdates();
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

  function applySettingUpdates() {
    rebuildShortcutKeymap();

    // Thumbnail downloads and clean links no longer have a UI toggle; force
    // them on so stale stored "false" values cannot disable the features.
    settings.enableCleanLink = true;
    settings.enableThumbnailDownload = true;

    // Also clears loop on every player video when the setting is turned off
    if (!IS_MUSIC_SITE) ensureVideoLoop();

    // Toggle button visibility via body class
    document.body.classList.toggle('yt-aid-hide-copy-buttons', !settings.enableCopyButtons);
    document.body.classList.remove('yt-aid-hide-clean-link', 'yt-aid-hide-thumb-btn');

    if (!settings.enableShortcuts) resetKeyBuffer();

    closeHomeFlyout();
    if (IS_MUSIC_SITE) return;
    syncAudioBoost();
    syncAudioBoostUi();
    syncToolbarState();
    injectAllAreas();
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

    initVideoLoopMonitor();
    initAudioBoost();
    initClipboardCopyTracking();
    rebuildShortcutKeymap();
    initShortcutSystem();
    initSelectionCopy();
    initSearchAutoPaste();
    initDropdownDismiss();
    initDOMObserver();
    applySettingUpdates();
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

  function showToast(message, type = 'info', duration = 2400) {
    if (!settings.enableToasts) return;
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

    // Keep the stack readable when actions fire in quick succession
    while (toastContainer.children.length >= 4) {
      toastContainer.removeChild(toastContainer.firstElementChild);
    }

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('yt-aid-toast-show');
    });

    setTimeout(() => {
      toast.classList.remove('yt-aid-toast-show');
      toast.classList.add('yt-aid-toast-hide');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
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
    const videos = new Set();
    const player = getPlayerElement();
    if (player) player.querySelectorAll('video').forEach((video) => videos.add(video));
    document.querySelectorAll('video.video-stream').forEach((video) => videos.add(video));
    // Ad videos can live outside the main player, so disabling targets every
    // media element on the page.
    if (includePageVideos) document.querySelectorAll('video').forEach((video) => videos.add(video));
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
    loopBtn.title = wanted ? 'Auto Loop đang bật' : 'Auto Loop đang tắt';
    const label = loopBtn.querySelector('span');
    if (label) label.textContent = wanted ? 'Auto Loop: ON' : 'Auto Loop: OFF';
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
      showToast(`Phím tắt [${shortcutSequence('shorts')}]: Chuyển sang YouTube Shorts`, 'info', 1600);
      goToYoutubeTarget('/shorts');
      return;
    }

    updateCachedShorts();
    const shortsAnchor = findSuggestedShortsElement();

    if (shortsAnchor) {
      const id = shortsIdFromAnchor(shortsAnchor);
      if (id) {
        showToast(`Phím tắt [${shortcutSequence('shorts')}]: Mở Shorts gợi ý [${id}]`, 'info', 1600);
      } else {
        showToast(`Phím tắt [${shortcutSequence('shorts')}]: Chuyển sang YouTube Shorts`, 'info', 1600);
      }
      shortsAnchor.click();
      return;
    }

    if (cachedSuggestedShortsId) {
      showToast(`Phím tắt [${shortcutSequence('shorts')}]: Mở Shorts gợi ý [${cachedSuggestedShortsId}]`, 'info', 1600);
      simulateSpaNavigation(`/shorts/${cachedSuggestedShortsId}`);
      return;
    }

    showToast(`Phím tắt [${shortcutSequence('shorts')}]: Chuyển sang YouTube Shorts`, 'info', 1600);
    simulateSpaNavigation('/shorts');
  }

  function navigateToHome() {
    showToast(`Phím tắt [${shortcutSequence('home')}]: Về trang chủ`, 'info', 1600);
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
    showToast(`Phím tắt [${shortcutSequence('history')}]: Mở lịch sử xem`, 'info', 1600);
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
    showToast(`Phím tắt [${shortcutSequence('playlists')}]: Danh sách phát`, 'info', 1600);
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
      showToast(`Phím tắt [${shortcutSequence('music')}]: Bạn đang ở YouTube Music`, 'info', 1600);
      if (window.location.pathname !== '/') window.location.assign('https://music.youtube.com/');
      return;
    }
    showToast(`Phím tắt [${shortcutSequence('music')}]: Chuyển sang YouTube Music`, 'info', 1600);
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
    showToast(`Đã mở tìm kiếm trong tab mới: "${previewText(text, 30)}"`, 'success');
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

    showToast(`Đang tìm kiếm: "${previewText(text, 35)}"`, 'success');
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
      saveBtn.textContent = busy ? 'Đang lưu…' : 'Tải phần đã chọn';
    };

    const saveOriginal = () => {
      saveBlobAsFile(blob, filename);
      showToast(`Đã tải ảnh: ${previewText(filename, 45)}`, 'success', 2800);
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
        showToast(`Đã tải ảnh đã cắt: ${sw} × ${sh}`, 'success', 2800);
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
        showToast(`Đã sao chép đoạn bôi đen: "${previewText(text)}"`, 'success', 1800);
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
          showToast(`Đã dán vào ô tìm kiếm: "${previewText(text, 35)}"`, 'success', 2000);
        } else if (settings.enableAutoPasteReplace) {
          showToast(`Đã thay nội dung tìm kiếm bằng: "${previewText(text, 35)}"`, 'success', 2000);
        } else {
          showToast(`Đã thêm vào ô tìm kiếm: "${previewText(text, 35)}"`, 'success', 2000);
        }
      });
    }, true);
  }

  // ==========================================
  // 6. DOM OBSERVER & NATIVE TOOLBAR INJECTION
  // ==========================================
  function initDOMObserver() {
    injectAllAreas();

    // Throttle instead of debounce: YouTube mutates continuously while a video
    // plays, and a debounce would keep postponing injection forever.
    let injectionQueued = false;
    const scheduleInjection = (delay = 200) => {
      if (injectionQueued) return;
      injectionQueued = true;
      setTimeout(() => {
        injectionQueued = false;
        injectAllAreas();
      }, delay);
    };

    const AID_UI_SELECTOR = '#yt-aid-channel-actions, #yt-aid-watch-toolbar, .yt-aid-card-bar, .yt-aid-home-trigger';
    // Everything this extension owns starts with yt-aid- (classes) or yt-aid-
    // (ids). Mutations inside it must not schedule another page-wide scan.
    const AID_UI_SCOPE = '[class*="yt-aid-"], [id^="yt-aid-"]';
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

    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const { target, addedNodes, removedNodes } = mutations[i];

        // Re-inject when YouTube re-renders a header and drops our bar.
        if (removedNodes && removedNodes.length > 0) {
          for (let j = 0; j < removedNodes.length; j++) {
            if (containsAidUi(removedNodes[j])) {
              scheduleInjection();
              return;
            }
          }
        }

        // Toasts, open menus, the crop dialog and freshly injected toolbars
        // all fire mutations; re-scanning the page for them is pure overhead.
        if (insideAidUi(target) || insideIgnoredScope(target)) continue;

        if (addedNodes && addedNodes.length > 0) {
          let relevant = false;
          for (let j = 0; j < addedNodes.length; j++) {
            if (insideAidUi(addedNodes[j])) continue;
            relevant = true;
            break;
          }
          if (relevant) {
            scheduleInjection();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener('yt-navigate-finish', () => {
      ensureVideoLoop();
      closeHomeFlyout();
      closeDropdown();
      scheduleInjection(80);
    });

    document.addEventListener('yt-page-data-updated', () => {
      ensureVideoLoop();
      scheduleInjection(120);
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

  function injectAllAreas() {
    const path = window.location.pathname;
    const hasCardTools = settings.enableCopyButtons || settings.enableCleanLink || settings.enableThumbnailDownload;

    if (!isHomeFeedPage()) closeHomeFlyout();

    if (path.startsWith('/watch')) {
      injectWatchPageToolbar();
      if (hasCardTools) injectSidebarButtons();
    } else if (path === '/' || path.startsWith('/results') || path.startsWith('/feed')) {
      if (hasCardTools) injectHomePageCards();
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
          <button class="yt-aid-pill-btn yt-aid-pill-sub" id="yt-aid-btn-copy-enter" title="Copy & tự động tìm kiếm trực tiếp (Ctrl+Click mở tab mới)">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M3 2h7a2 2 0 0 1 2 2v1h-2V4H3v9h1v2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 4h6a2 2 0 0 1 2 2v1h-2V8H6v7h2v2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
              <path fill="currentColor" d="M17 2a3 3 0 1 0 2 5.2l2.3 2.3 1.4-1.4-2.3-2.3A3 3 0 0 0 17 2zm0 1.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>
              <path fill="currentColor" d="M19 14v3H12.8l2.6-2.6-1.4-1.4L9 18l5 5 1.4-1.4-2.6-2.6H21v-5h-2z"/>
            </svg>
            <span>Copy + Search + Enter</span>
          </button>
          <button class="yt-aid-newtab-btn" id="yt-aid-btn-copy-enter-newtab" title="Mở tìm kiếm sang tab mới">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
          </button>
        </div>

        <!-- Clean Copy Link -->
        <button class="yt-aid-pill-btn yt-aid-clean-link" id="yt-aid-btn-clean-link" title="Sao chép liên kết sạch không query tracking">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <span>Clean Link</span>
        </button>

        <!-- Downloads button (thumbnail crop) -->
        <button class="yt-aid-pill-btn yt-aid-downloads-btn" id="yt-aid-btn-downloads" title="Tải ảnh bìa thumbnail (có cắt ảnh)">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          <span>Download Thumbnail</span>
        </button>
      </div>

      <div class="yt-aid-toolbar-right">
        <!-- Auto Loop Toggle Button -->
        <button class="yt-aid-pill-btn yt-aid-loop-indicator ${settings.enableLoop ? 'active' : ''}" id="yt-aid-btn-toggle-loop" title="${settings.enableLoop ? 'Auto Loop đang bật' : 'Auto Loop đang tắt'}">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>Auto Loop: ${settings.enableLoop ? 'ON' : 'OFF'}</span>
        </button>

        <!-- Extra tools dropdown -->
        <button class="yt-aid-pill-btn yt-aid-tools-btn" id="yt-aid-btn-tools" title="Tính năng phụ" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
          <span>Tools</span>
          <svg class="yt-aid-chevron" viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
        </button>
      </div>
    `;

    titleContainer.appendChild(toolbar);

    // 1. Copy Pure
    toolbar.querySelector('#yt-aid-btn-copy-pure').addEventListener('click', () => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, `Đã sao chép tiêu đề: "${previewText(title, 35)}"`);
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
      copyTextToClipboard(cleanUrl, `Đã chép liên kết sạch: ${cleanUrl}`);
    });

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
  }

  // ==========================================
  // 7. TOOLS DROPDOWN
  // ==========================================
  let dropdownEl = null;
  let dropdownBtn = null;

  function closeDropdown() {
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
      <div class="yt-aid-tools-title">Tính năng phụ${EXT_VERSION ? ` · v${EXT_VERSION}` : ''}</div>

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

    return menu;
  }

  function initDropdownDismiss() {
    document.addEventListener('mousedown', (e) => {
      if (!dropdownEl) return;
      const target = e.target;
      if (target instanceof Node && dropdownEl.contains(target)) return;
      if (target instanceof Node && dropdownBtn && dropdownBtn.contains(target)) return;
      closeDropdown();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdownEl) closeDropdown();
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

  function injectSidebarButtons() {
    const sidebarItems = document.querySelectorAll(
      'ytd-compact-video-renderer, ytd-compact-playlist-renderer, ' +
      'ytd-watch-next-secondary-results-renderer yt-lockup-view-model, ' +
      '#secondary yt-lockup-view-model'
    );

    sidebarItems.forEach(item => {
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
        copyTextToClipboard(title, `Đã sao chép: "${previewText(title, 30)}"`);
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
        copyTextToClipboard(clean, `Đã chép link sạch: ${clean}`);
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
    trigger.title = 'Công cụ video';
    trigger.setAttribute('aria-label', 'Công cụ video');
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
        copyTextToClipboard(title, `Đã sao chép: "${previewText(title, 30)}"`);
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
        copyTextToClipboard(clean, `Đã chép liên kết: ${previewText(clean, 45)}`);
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
      panel.setAttribute('aria-label', 'Công cụ video');
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

  function injectHomePageCards() {
    if (!isHomeFeedPage()) {
      closeHomeFlyout();
      return;
    }

    document.querySelectorAll(HOME_CARD_ITEM_SELECTOR).forEach((item) => {
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


})();
