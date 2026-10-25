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

  // --- Configuration & Default Settings ---
  const DEFAULT_SETTINGS = {
    enableLoop: true,
    enableShortcuts: true,
    enableCopyButtons: true,
    enableCleanLink: true,
    enableToasts: true,
    enableSelectionCopy: true,
    enableAutoPasteSearch: true
  };

  let settings = { ...DEFAULT_SETTINGS };

  // Last text copied by the extension — feeds the auto-paste search box
  let lastCopiedText = '';

  // --- Shortcut Buffer State ---
  const CHORD_KEYS = ['s', 'h', 'p', 'm'];
  const CHORD_PREFIXES = new Set(['s', 'h', 'p', 'm', 'hh']);
  const CHORD_ACTIONS = new Set(['ss', 'hh', 'hhh', 'pp', 'mm']);
  const CHORD_TIMEOUT_MS = 320;
  let keyBuffer = '';
  let keyBufferTimer = null;

  // Cache for the latest suggested Shorts video ID
  let cachedSuggestedShortsId = null;

  // Load user settings
  chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
    settings = { ...DEFAULT_SETTINGS, ...items };
    initExtension();
  });

  // Listen for setting changes in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }
      applySettingUpdates();
    }
  });

  function applySettingUpdates() {
    const video = document.querySelector('video.video-stream, video');
    if (video) {
      video.loop = !!settings.enableLoop;
    }

    // Toggle button visibility via body class
    document.body.classList.toggle('yt-aid-hide-copy-buttons', !settings.enableCopyButtons);
    document.body.classList.toggle('yt-aid-hide-clean-link', !settings.enableCleanLink);

    syncToolbarState();
    injectAllAreas();
  }

  // --- Main Initializer ---
  function initExtension() {
    createToastContainer();
    initVideoLoopMonitor();
    initShortcutSystem();
    initSelectionCopy();
    initSearchAutoPaste();
    initToolsMenuDismiss();
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
  // 2. AUTO VIDEO.LOOP = TRUE
  // ==========================================
  function ensureVideoLoop() {
    if (!settings.enableLoop) return;
    const video = document.querySelector('video.video-stream, video');
    if (video) {
      if (!video.loop) {
        video.loop = true;
      }
      if (!video.__ytAidLoopBound) {
        video.__ytAidLoopBound = true;
        const enforceLoop = () => {
          if (settings.enableLoop && !video.loop) {
            video.loop = true;
          }
        };
        video.addEventListener('loadedmetadata', enforceLoop);
        video.addEventListener('play', enforceLoop);
        video.addEventListener('ended', enforceLoop);
      }
    }
  }

  function initVideoLoopMonitor() {
    ensureVideoLoop();
    window.addEventListener('yt-navigate-finish', ensureVideoLoop);
    document.addEventListener('yt-page-data-updated', ensureVideoLoop);
    window.addEventListener('spfdone', ensureVideoLoop);
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

    if (el.closest('#contenteditable-root, ytd-searchbox, ytd-comments, #comment-dialog, yt-formatted-string[contenteditable], #edit-box, paper-input')) {
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
    try {
      const a = document.createElement('a');
      a.className = 'yt-simple-endpoint';
      a.href = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.youtube.com${pathOrUrl}`;
      a.style.display = 'none';
      const container = document.querySelector('ytd-app') || document.body;
      container.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 80);
      return true;
    } catch (e) { }

    window.location.href = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.youtube.com${pathOrUrl}`;
    return false;
  }

  function navigateToShorts() {
    updateCachedShorts();
    const shortsAnchor = findSuggestedShortsElement();

    if (shortsAnchor) {
      const id = shortsIdFromAnchor(shortsAnchor);
      if (id) {
        showToast(`Phím tắt [SS]: Mở Shorts gợi ý [${id}]`, 'info', 1600);
      } else {
        showToast('Phím tắt [SS]: Chuyển sang YouTube Shorts', 'info', 1600);
      }
      shortsAnchor.click();
      return;
    }

    if (cachedSuggestedShortsId) {
      showToast(`Phím tắt [SS]: Mở Shorts gợi ý [${cachedSuggestedShortsId}]`, 'info', 1600);
      simulateSpaNavigation(`/shorts/${cachedSuggestedShortsId}`);
      return;
    }

    showToast('Phím tắt [SS]: Chuyển sang YouTube Shorts', 'info', 1600);
    simulateSpaNavigation('/shorts');
  }

  function navigateToHome() {
    showToast('Phím tắt [HH]: Về trang chủ', 'info', 1600);
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
    showToast('Phím tắt [HHH]: Mở lịch sử xem', 'info', 1600);
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
    showToast('Phím tắt [PP]: Danh sách phát', 'info', 1600);
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
    showToast('Phím tắt [MM]: Chuyển sang YouTube Music', 'info', 1600);
    window.location.href = 'https://music.youtube.com/';
  }

  function executeShortcut(actionKey) {
    switch (actionKey) {
      case 'ss':
        navigateToShorts();
        break;
      case 'hh':
        navigateToHome();
        break;
      case 'hhh':
        navigateToHistory();
        break;
      case 'pp':
        navigateToPlaylists();
        break;
      case 'mm':
        navigateToMusic();
        break;
    }
  }

  // YouTube binds "m" (mute) and "p" (previous) to the same keys that start
  // our chords. We swallow the key and replay the native action ourselves when
  // no chord completes, so both behaviours keep working.
  const SINGLE_KEY_FALLBACK = {
    m: () => {
      const btn = document.querySelector('.ytp-mute-button');
      if (btn) btn.click();
    },
    p: () => {
      const btn = document.querySelector('.ytp-prev-button');
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
    if (keyBuffer === 'hh') {
      resetKeyBuffer();
      executeShortcut('hh');
      return;
    }
    resetKeyBuffer(true);
  }

  function initShortcutSystem() {
    document.addEventListener('keydown', (e) => {
      if (!settings.enableShortcuts) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.repeat) return;
      if (isTypingContext()) return;

      if (e.key === 'Escape') {
        resetKeyBuffer();
        return;
      }

      const key = e.key.toLowerCase();
      if (!CHORD_KEYS.includes(key)) {
        resetKeyBuffer(true);
        return;
      }

      // Own the key: YouTube's native single-key shortcuts must not fire
      e.preventDefault();
      e.stopPropagation();

      const next = keyBuffer + key;

      if (CHORD_ACTIONS.has(next) && next !== 'hh') {
        resetKeyBuffer();
        executeShortcut(next);
        return;
      }

      if (CHORD_PREFIXES.has(next)) {
        keyBuffer = next;
        if (keyBufferTimer) clearTimeout(keyBufferTimer);
        keyBufferTimer = setTimeout(flushKeyBuffer, CHORD_TIMEOUT_MS);
        return;
      }

      resetKeyBuffer(true);
    }, true);
  }

  // ==========================================
  // 5. CLEAN COPY LINK & SEARCH BAR UTILS
  // ==========================================
  function cleanYoutubeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, window.location.origin);

      if (url.pathname === '/watch') {
        const v = url.searchParams.get('v');
        if (v) {
          return `https://www.youtube.com/watch?v=${v}`;
        }
      }

      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        if (id) {
          return `https://www.youtube.com/shorts/${id}`;
        }
      }

      if (url.pathname.startsWith('/playlist')) {
        const list = url.searchParams.get('list');
        if (list) {
          return `https://www.youtube.com/playlist?list=${list}`;
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

  // Low-level clipboard write, resolves true on success
  function writeClipboard(text) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) { }
      document.body.removeChild(ta);
      return ok;
    });
  }

  function copyTextToClipboard(text, successMsg) {
    if (!text) {
      showToast('Không tìm thấy nội dung để sao chép!', 'warning');
      return;
    }
    lastCopiedText = text;
    writeClipboard(text).then((ok) => {
      if (!ok) {
        showToast('Lỗi sao chép vào clipboard', 'warning');
      } else if (successMsg) {
        showToast(successMsg, 'success');
      }
    });
  }

  // Open search query directly in a brand new tab
  function openSearchInNewTab(text) {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`, '_blank');
    showToast(`Đã mở tìm kiếm trong tab mới: "${previewText(text, 30)}"`, 'success');
  }

  // Fill the search bar then run the search on the current tab
  function autoEnterSearch(text) {
    const searchInput = document.querySelector('input#search, ytd-searchbox input');
    const startHref = window.location.href;

    if (searchInput) {
      setSearchInputValue(searchInput, text);
      searchInput.focus();
    }

    const searchBtn = document.querySelector('ytd-searchbox button#search-icon-legacy, button#search-icon-legacy');
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
  // 5. COPY ON SELECT & AUTO-PASTE INTO SEARCH
  // ==========================================
  function initSelectionCopy() {
    let copyTimer = null;
    let lastCopied = { text: '', at: 0 };

    const copySelection = () => {
      if (!settings.enableSelectionCopy) return;
      if (isTypingContext()) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const text = selection.toString().trim();
      if (!text) return;

      const now = Date.now();
      if (text === lastCopied.text && now - lastCopied.at < 1200) return;
      lastCopied = { text, at: now };
      lastCopiedText = text;

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
    document.addEventListener('mousedown', (e) => {
      if (!settings.enableAutoPasteSearch) return;

      const input = e.target instanceof Element
        ? e.target.closest('input#search, ytd-searchbox input')
        : null;
      if (!input) return;
      if (input.value.trim()) return;
      if (!lastCopiedText.trim()) return;

      setSearchInputValue(input, lastCopiedText);
      showToast(`Đã dán vào ô tìm kiếm: "${previewText(lastCopiedText, 35)}"`, 'success', 2000);
    }, true);
  }

  // ==========================================
  // 6. DOM OBSERVER & NATIVE TOOLBAR INJECTION
  // ==========================================
  function initDOMObserver() {
    injectAllAreas();
    updateCachedShorts();

    let observerDebounce = null;
    const observer = new MutationObserver((mutations) => {
      let hasAddedNodes = false;
      for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
          hasAddedNodes = true;
          break;
        }
      }
      if (!hasAddedNodes) return;

      if (observerDebounce) clearTimeout(observerDebounce);
      observerDebounce = setTimeout(() => {
        injectAllAreas();
        updateCachedShorts();
      }, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener('yt-navigate-finish', () => {
      updateCachedShorts();
      ensureVideoLoop();
      closeToolsMenu();
      setTimeout(() => {
        injectAllAreas();
        updateCachedShorts();
      }, 80);
    });

    document.addEventListener('yt-page-data-updated', () => {
      updateCachedShorts();
      ensureVideoLoop();
    });
  }

  function injectAllAreas() {
    const path = window.location.pathname;
    const hasCopyTools = settings.enableCopyButtons || settings.enableCleanLink;

    if (path.startsWith('/watch')) {
      injectWatchPageToolbar();
      if (hasCopyTools) injectSidebarButtons();
    } else if (path === '/' || path.startsWith('/results') || path.startsWith('/feed')) {
      if (hasCopyTools) injectHomePageCards();
    }
  }

  // ----------------------------------------------------
  // A. WATCH PAGE INJECTION
  // ----------------------------------------------------
  function injectWatchPageToolbar() {
    if (!window.location.pathname.startsWith('/watch')) return;
    if (document.getElementById('yt-aid-watch-toolbar')) return;

    const titleContainer = document.querySelector(
      'ytd-watch-metadata #title, #above-the-fold #title, ytd-video-primary-info-renderer #container'
    );

    if (!titleContainer) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'yt-aid-watch-toolbar';
    toolbar.className = 'yt-aid-watch-toolbar';

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
      </div>

      <div class="yt-aid-toolbar-right">
        <!-- Auto Loop Toggle Button -->
        <button class="yt-aid-pill-btn yt-aid-loop-indicator ${settings.enableLoop ? 'active' : ''}" id="yt-aid-btn-toggle-loop" title="Tự động lặp lại video">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>Auto Loop</span>
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

    // Toggle Auto Loop
    const loopBtn = toolbar.querySelector('#yt-aid-btn-toggle-loop');
    loopBtn.addEventListener('click', () => {
      const nextLoop = !settings.enableLoop;
      settings.enableLoop = nextLoop;
      chrome.storage.local.set({ enableLoop: nextLoop });
      loopBtn.classList.toggle('active', nextLoop);
      const video = document.querySelector('video.video-stream, video');
      if (video) video.loop = nextLoop;
      showToast(nextLoop ? 'Đã bật tự động lặp lại video' : 'Đã tắt tự động lặp lại video', 'info');
    });

    // Tools dropdown
    const toolsBtn = toolbar.querySelector('#yt-aid-btn-tools');
    toolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openToolsMenu(toolsBtn);
    });
  }

  // ==========================================
  // 7. TOOLS DROPDOWN (Extra features)
  // ==========================================
  let toolsMenuEl = null;

  function closeToolsMenu() {
    const btn = document.getElementById('yt-aid-btn-tools');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (!toolsMenuEl) return;

    const menu = toolsMenuEl;
    toolsMenuEl = null;
    menu.classList.remove('yt-aid-tools-menu-show');
    setTimeout(() => menu.remove(), 160);
  }

  function syncToolbarState() {
    const loopBtn = document.getElementById('yt-aid-btn-toggle-loop');
    if (loopBtn) loopBtn.classList.toggle('active', !!settings.enableLoop);

    const selectionToggle = document.getElementById('yt-aid-toggle-selection-copy');
    if (selectionToggle) selectionToggle.checked = !!settings.enableSelectionCopy;

    const autoPasteToggle = document.getElementById('yt-aid-toggle-auto-paste');
    if (autoPasteToggle) autoPasteToggle.checked = !!settings.enableAutoPasteSearch;
  }

  function updateSetting(key, value) {
    settings[key] = value;
    chrome.storage.local.set({ [key]: value });
  }

  function buildToolsMenu() {
    const menu = document.createElement('div');
    menu.id = 'yt-aid-tools-menu';
    menu.className = 'yt-aid-tools-menu';
    menu.innerHTML = `
      <div class="yt-aid-tools-title">Tính năng phụ</div>

      <label class="yt-aid-tools-item">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Tự động copy khi bôi đen</span>
          <span class="yt-aid-tools-desc">Bôi xanh đoạn text để sao chép ngay</span>
        </span>
        <span class="yt-aid-switch">
          <input type="checkbox" id="yt-aid-toggle-selection-copy">
          <span class="yt-aid-switch-slider"></span>
        </span>
      </label>

      <label class="yt-aid-tools-item">
        <span class="yt-aid-tools-text">
          <span class="yt-aid-tools-name">Tự động dán vào ô tìm kiếm</span>
          <span class="yt-aid-tools-desc">Click ô tìm kiếm trống để dán nội dung vừa copy</span>
        </span>
        <span class="yt-aid-switch">
          <input type="checkbox" id="yt-aid-toggle-auto-paste">
          <span class="yt-aid-switch-slider"></span>
        </span>
      </label>
    `;
    return menu;
  }

  function openToolsMenu(btn) {
    if (toolsMenuEl) {
      closeToolsMenu();
      return;
    }

    const menu = buildToolsMenu();
    document.body.appendChild(menu);

    menu.querySelector('#yt-aid-toggle-selection-copy').addEventListener('change', (e) => {
      updateSetting('enableSelectionCopy', e.target.checked);
    });
    menu.querySelector('#yt-aid-toggle-auto-paste').addEventListener('change', (e) => {
      updateSetting('enableAutoPasteSearch', e.target.checked);
    });

    syncToolbarState();

    const rect = btn.getBoundingClientRect();
    const maxLeft = window.innerWidth - menu.offsetWidth - 12;
    menu.style.top = `${Math.round(rect.bottom + 12)}px`;
    menu.style.left = `${Math.round(Math.max(12, Math.min(rect.right - menu.offsetWidth, maxLeft)))}px`;
    menu.style.maxHeight = `${Math.round(Math.max(160, window.innerHeight - rect.bottom - 24))}px`;

    toolsMenuEl = menu;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('yt-aid-tools-menu-show'));
  }

  function initToolsMenuDismiss() {
    document.addEventListener('mousedown', (e) => {
      if (!toolsMenuEl) return;
      const target = e.target;
      if (toolsMenuEl.contains(target)) return;
      if (target instanceof Element && target.closest('#yt-aid-btn-tools')) return;
      closeToolsMenu();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toolsMenuEl) closeToolsMenu();
    }, true);

    window.addEventListener('resize', closeToolsMenu);
    window.addEventListener('scroll', closeToolsMenu, { passive: true, capture: true });
  }

  // ----------------------------------------------------
  // B. SIDEBAR INJECTION (Related / Up-next videos)
  // ----------------------------------------------------
  function injectSidebarButtons() {
    const sidebarItems = document.querySelectorAll(
      'ytd-compact-video-renderer:not([data-yt-aid-injected]), ytd-compact-playlist-renderer:not([data-yt-aid-injected])'
    );

    sidebarItems.forEach(item => {
      item.setAttribute('data-yt-aid-injected', 'true');
      const details = item.querySelector('#details, .details');
      if (!details) return;

      const cardBar = document.createElement('div');
      cardBar.className = 'yt-aid-card-bar yt-aid-sidebar-bar';

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
      `;

      details.appendChild(cardBar);

      const getCardTitle = () => {
        const titleEl = item.querySelector('#video-title, span#video-title');
        return titleEl ? titleEl.textContent.trim() : '';
      };

      const getCardUrl = () => {
        const linkEl = item.querySelector('a#video-title, a#thumbnail');
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
    });
  }

  // ----------------------------------------------------
  // C. HOME PAGE & FEED INJECTION
  // ----------------------------------------------------
  function injectHomePageCards() {
    const cardItems = document.querySelectorAll(
      'ytd-rich-item-renderer:not([data-yt-aid-injected]), ytd-video-renderer:not([data-yt-aid-injected]), ytd-grid-video-renderer:not([data-yt-aid-injected])'
    );

    cardItems.forEach(item => {
      item.setAttribute('data-yt-aid-injected', 'true');
      const details = item.querySelector('#details, #meta');
      if (!details) return;

      const cardBar = document.createElement('div');
      cardBar.className = 'yt-aid-card-bar yt-aid-home-card-bar';

      cardBar.innerHTML = `
        <div class="yt-aid-card-btn-cluster">
          <button class="yt-aid-mini-action yt-aid-copy-pure" title="Copy tiêu đề">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <span>Title</span>
          </button>
          <button class="yt-aid-mini-action yt-aid-copy-enter" title="Copy & tự động tìm kiếm trực tiếp (Ctrl+Click mở tab mới)">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M3 2h7a2 2 0 0 1 2 2v1h-2V4H3v9h1v2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 4h6a2 2 0 0 1 2 2v1h-2V8H6v7h2v2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
              <path fill="currentColor" d="M17 2a3 3 0 1 0 2 5.2l2.3 2.3 1.4-1.4-2.3-2.3A3 3 0 0 0 17 2zm0 1.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>
              <path fill="currentColor" d="M19 14v3H12.8l2.6-2.6-1.4-1.4L9 18l5 5 1.4-1.4-2.6-2.6H21v-5h-2z"/>
            </svg>
            <span>+ Enter</span>
          </button>
          <button class="yt-aid-mini-action yt-aid-clean-link" title="Copy liên kết sạch">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            <span>Link</span>
          </button>
        </div>
      `;

      details.appendChild(cardBar);

      const getCardTitle = () => {
        const titleEl = item.querySelector('#video-title, #video-title-link');
        return titleEl ? titleEl.textContent.trim() : '';
      };

      const getCardUrl = () => {
        const linkEl = item.querySelector('a#video-title-link, a#video-title, a#thumbnail');
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
    });
  }

})();
