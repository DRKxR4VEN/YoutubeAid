/**
 * Youtube Aid - Content Script
 * Manifest V3 Extension for YouTube
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
    enableScreenshot: true,
    enableToasts: true,
    screenshotFormat: 'image/png' // 'image/png' | 'image/jpeg'
  };

  let settings = { ...DEFAULT_SETTINGS };

  // --- Session RAM for Screenshot Captures ---
  // In-memory array surviving during page session
  const sessionCaptures = [];

  // --- Shortcut Buffer State ---
  let keyBuffer = '';
  let keyBufferTimer = null;
  let hhPendingTimer = null;
  const BUFFER_TIMEOUT_MS = 450;
  const HH_WAIT_TIMEOUT_MS = 280; // Optimized wait window between hh and hhh for ultra-responsive navigation

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
    // Loop setting changed
    const video = document.querySelector('video.video-stream, video');
    if (video) {
      video.loop = !!settings.enableLoop;
    }

    // Toggle button visibility via body class
    document.body.classList.toggle('yt-aid-hide-copy-buttons', !settings.enableCopyButtons);
    document.body.classList.toggle('yt-aid-hide-clean-link', !settings.enableCleanLink);
    document.body.classList.toggle('yt-aid-hide-screenshot', !settings.enableScreenshot);
  }

  // --- Main Initializer ---
  function initExtension() {
    createToastContainer();
    initVideoLoopMonitor();
    initShortcutSystem();
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

  function showToast(message, type = 'info', duration = 2800) {
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

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('yt-aid-toast-show');
    });

    setTimeout(() => {
      toast.classList.remove('yt-aid-toast-show');
      toast.classList.add('yt-aid-toast-hide');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
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
      // Attach persistent listener to re-assert loop
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
    // YouTube SPA navigations
    window.addEventListener('yt-navigate-finish', ensureVideoLoop);
    document.addEventListener('yt-page-data-updated', ensureVideoLoop);
    window.addEventListener('spfdone', ensureVideoLoop);
  }

  // ==========================================
  // 3. SHORTCUT SYSTEM (ss, hh, hhh, pp, mm)
  // ==========================================
  function isTypingContext() {
    const el = document.activeElement;
    if (!el) return false;

    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }

    // Check contentEditable
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return true;
    }

    // YouTube specific inputs & comment boxes
    if (el.closest('#contenteditable-root, ytd-searchbox, ytd-comments, #comment-dialog, yt-formatted-string[contenteditable], #edit-box, paper-input')) {
      return true;
    }

    return false;
  }

  // ==========================================
  // HIGH-PERFORMANCE SPA NAVIGATION ENGINE
  // Eliminates slow page reloads (window.location.href)
  // Triggers instant YouTube client-side SPA navigation
  // ==========================================

  function updateCachedShorts() {
    // 1. Look into guide / mini-guide for a suggested Short with specific ID
    const guideShorts = document.querySelector(
      'ytd-guide-entry-renderer a[href^="/shorts/"], ytd-mini-guide-entry-renderer a[href^="/shorts/"], a#endpoint[href^="/shorts/"]'
    );
    if (guideShorts) {
      const href = guideShorts.getAttribute('href') || guideShorts.href;
      const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) {
        cachedSuggestedShortsId = match[1];
        return;
      }
    }

    // 2. Look for any shorts shelf or card on current page
    const pageShorts = document.querySelector(
      'ytd-rich-shelf-renderer[is-shorts] a[href^="/shorts/"], ytd-reel-shelf-renderer a[href^="/shorts/"], ytd-rich-item-renderer a[href^="/shorts/"], a[href^="/shorts/"]'
    );
    if (pageShorts) {
      const href = pageShorts.getAttribute('href') || pageShorts.href;
      const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) {
        cachedSuggestedShortsId = match[1];
      }
    }
  }

  function findSuggestedShortsElement() {
    // Priority 1: Sidebar Guide or Mini Guide entry with specific video ID (/shorts/{id})
    const guideWithId = document.querySelector(
      'ytd-guide-entry-renderer a[href^="/shorts/"], ytd-mini-guide-entry-renderer a[href^="/shorts/"], a#endpoint[href^="/shorts/"]'
    );
    if (guideWithId) {
      return guideWithId.tagName === 'A' ? guideWithId : guideWithId.closest('a');
    }

    // Priority 2: Any general Shorts entry in the Guide (desktop guide drawer exists even when collapsed)
    const guideGeneral = document.querySelector(
      'ytd-guide-entry-renderer a[href*="/shorts"], ytd-mini-guide-entry-renderer a[href*="/shorts"], a#endpoint[title="Shorts"], a#endpoint[aria-label*="Shorts"], a[title="Shorts"]'
    );
    if (guideGeneral) {
      const a = guideGeneral.tagName === 'A' ? guideGeneral : guideGeneral.closest('a');
      if (a) {
        const href = a.getAttribute('href') || a.href;
        // Check if YouTube dynamically populated the suggested video ID
        if (href && href.length > '/shorts/'.length && !href.endsWith('/shorts')) {
          return a;
        }
      }
    }

    // Priority 3: Any Shorts reel/shelf card rendered on the page
    const pageShortWithId = document.querySelector(
      'ytd-rich-shelf-renderer[is-shorts] a[href^="/shorts/"], ytd-reel-shelf-renderer a[href^="/shorts/"], ytd-rich-item-renderer a[href^="/shorts/"], ytd-video-renderer a[href^="/shorts/"], a[href^="/shorts/"]'
    );
    if (pageShortWithId) {
      return pageShortWithId.tagName === 'A' ? pageShortWithId : pageShortWithId.closest('a');
    }

    // Priority 4: Return general guide entry if available (native click triggers YouTube's internal SPA router)
    if (guideGeneral) {
      return guideGeneral.tagName === 'A' ? guideGeneral : guideGeneral.closest('a');
    }

    return null;
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
    } catch (e) {}

    window.location.href = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.youtube.com${pathOrUrl}`;
    return false;
  }

  function navigateToShorts() {
    updateCachedShorts();
    const shortsAnchor = findSuggestedShortsElement();

    if (shortsAnchor) {
      const href = shortsAnchor.getAttribute('href') || shortsAnchor.href;
      const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) {
        showToast(`⚡ Phím tắt [SS]: Mở Shorts gợi ý [${match[1]}]`, 'info', 1600);
      } else {
        showToast('⚡ Phím tắt [SS]: Chuyển sang YouTube Shorts', 'info', 1600);
      }
      // Native click triggers YouTube internal router instantly without page reload
      shortsAnchor.click();
      return;
    }

    if (cachedSuggestedShortsId) {
      showToast(`⚡ Phím tắt [SS]: Mở Shorts gợi ý [${cachedSuggestedShortsId}]`, 'info', 1600);
      simulateSpaNavigation(`/shorts/${cachedSuggestedShortsId}`);
      return;
    }

    showToast('⚡ Phím tắt [SS]: Chuyển sang YouTube Shorts', 'info', 1600);
    simulateSpaNavigation('/shorts');
  }

  function navigateToHome() {
    showToast('⚡ Phím tắt [HH]: Về trang chủ', 'info', 1600);
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
    showToast('⚡ Phím tắt [HHH]: Mở lịch sử xem', 'info', 1600);
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
    showToast('⚡ Phím tắt [PP]: Danh sách phát', 'info', 1600);
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
    showToast('⚡ Phím tắt [MM]: Chuyển sang YouTube Music', 'info', 1600);
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

  function initShortcutSystem() {
    document.addEventListener('keydown', (e) => {
      if (!settings.enableShortcuts) return;

      // Ignore if user is inside an input/comment/search or using modifiers
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (isTypingContext()) return;

      const key = e.key.toLowerCase();
      if (!['s', 'h', 'p', 'm'].includes(key)) {
        // Reset buffer if unrelated key pressed
        keyBuffer = '';
        if (hhPendingTimer) {
          clearTimeout(hhPendingTimer);
          hhPendingTimer = null;
        }
        return;
      }

      // Clear existing timeout
      if (keyBufferTimer) clearTimeout(keyBufferTimer);

      keyBuffer += key;

      // Handle HH vs HHH conflict:
      if (keyBuffer === 'hh') {
        // Wait briefly for a 3rd 'h' before triggering 'hh'
        if (hhPendingTimer) clearTimeout(hhPendingTimer);
        hhPendingTimer = setTimeout(() => {
          if (keyBuffer === 'hh') {
            keyBuffer = '';
            executeShortcut('hh');
          }
          hhPendingTimer = null;
        }, HH_WAIT_TIMEOUT_MS);
        return;
      }

      if (keyBuffer === 'hhh') {
        if (hhPendingTimer) {
          clearTimeout(hhPendingTimer);
          hhPendingTimer = null;
        }
        keyBuffer = '';
        executeShortcut('hhh');
        return;
      }

      // Check 2-letter combos
      if (keyBuffer === 'ss') {
        keyBuffer = '';
        executeShortcut('ss');
        return;
      }

      if (keyBuffer === 'pp') {
        keyBuffer = '';
        executeShortcut('pp');
        return;
      }

      if (keyBuffer === 'mm') {
        keyBuffer = '';
        executeShortcut('mm');
        return;
      }

      // If buffer has exceeded 3 chars, reset
      if (keyBuffer.length >= 3) {
        keyBuffer = '';
      }

      // Reset buffer after inactivity
      keyBufferTimer = setTimeout(() => {
        keyBuffer = '';
      }, BUFFER_TIMEOUT_MS);
    }, true);
  }

  // ==========================================
  // 4. CLEAN COPY LINK & COPY TITLE UTILS
  // ==========================================
  function cleanYoutubeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, window.location.origin);
      
      // Watch page: keep only video ID 'v'
      if (url.pathname === '/watch') {
        const v = url.searchParams.get('v');
        if (v) {
          return `https://www.youtube.com/watch?v=${v}`;
        }
      }

      // Shorts: keep clean /shorts/{id}
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        if (id) {
          return `https://www.youtube.com/shorts/${id}`;
        }
      }

      // Channel / User / Playlist
      if (url.pathname.startsWith('/playlist')) {
        const list = url.searchParams.get('list');
        if (list) {
          return `https://www.youtube.com/playlist?list=${list}`;
        }
      }

      // Generic URL without tracking queries
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

  function copyTextToClipboard(text, successMsg) {
    if (!text) {
      showToast('⚠️ Không tìm thấy nội dung để sao chép!', 'warning');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(err => {
      // Fallback using textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast(successMsg, 'success');
      } catch (e) {
        showToast('⚠️ Lỗi sao chép: ' + e.message, 'warning');
      }
      document.body.removeChild(ta);
    });
  }

  function autoEnterSearch(text) {
    // Fill search input and submit directly
    const searchInput = document.querySelector('input#search, input.ytd-searchbox');
    const searchForm = document.querySelector('form#search-form, ytd-searchbox form');
    if (searchInput) {
      searchInput.value = text;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      if (searchForm) {
        searchForm.dispatchEvent(new Event('submit', { bubbles: true }));
      } else {
        const searchBtn = document.querySelector('#search-icon-legacy, button#search-icon-legacy');
        if (searchBtn) searchBtn.click();
      }
      showToast(`⏎ Đã nhập & tìm kiếm: "${text.slice(0, 35)}..."`, 'success');
    } else {
      window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`;
    }
  }

  // ==========================================
  // 5. SCREENSHOT HTML5 VIDEO & MODAL
  // ==========================================
  function captureCurrentVideoFrame() {
    const video = document.querySelector('video.video-stream, video');
    if (!video || !video.videoWidth || !video.videoHeight) {
      showToast('⚠️ Không tìm thấy khung hình video!', 'warning');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const mimeType = settings.screenshotFormat || 'image/png';
      const dataUrl = canvas.toDataURL(mimeType, 0.95);
      const title = getWatchVideoTitle();
      const curTime = video.currentTime || 0;
      const timeStr = formatTimestamp(curTime);

      const captureItem = {
        id: 'cap_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        dataUrl: dataUrl,
        mimeType: mimeType,
        width: canvas.width,
        height: canvas.height,
        title: title,
        currentTime: curTime,
        timeStr: timeStr,
        createdAt: new Date().toLocaleTimeString()
      };

      // Save into Session RAM
      sessionCaptures.unshift(captureItem);
      if (sessionCaptures.length > 40) sessionCaptures.pop();

      showToast(`📷 Đã chụp ảnh video [${timeStr}] (${canvas.width}x${canvas.height})`, 'success');
      openScreenshotModal(captureItem);
    } catch (err) {
      console.error('[YouTube Aid] Screenshot error:', err);
      showToast('⚠️ Không thể chụp ảnh (có thể do bản quyền DRM / CORS)', 'warning');
    }
  }

  function formatTimestamp(seconds) {
    const s = Math.floor(seconds || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ==========================================
  // SCREENSHOT MODAL & CROP COMPONENT
  // ==========================================
  let activeModal = null;
  let currentActiveCapture = null;
  let cropState = {
    active: false,
    aspectRatio: 'free', // 'free' | '16:9' | '4:3' | '1:1'
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isDragging: false,
    isResizing: false,
    dragStart: { x: 0, y: 0 },
    handle: null
  };

  function openScreenshotModal(captureItem) {
    currentActiveCapture = captureItem;
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }

    const modal = document.createElement('div');
    modal.id = 'yt-aid-screenshot-modal';
    modal.className = 'yt-aid-modal-overlay';

    modal.innerHTML = `
      <div class="yt-aid-modal-container">
        <!-- Header -->
        <div class="yt-aid-modal-header">
          <div class="yt-aid-modal-title">
            <span class="yt-aid-modal-logo">⚡ YouTube Aid</span>
            <span class="yt-aid-badge">${escapeHtml(captureItem.timeStr)}</span>
            <span class="yt-aid-meta-res" id="yt-aid-meta-res">${captureItem.width}×${captureItem.height}</span>
            <span class="yt-aid-video-name" title="${escapeHtml(captureItem.title)}">${escapeHtml(captureItem.title)}</span>
          </div>
          <div class="yt-aid-modal-header-actions">
            <button class="yt-aid-btn yt-aid-btn-tab active" id="yt-aid-tab-editor">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              Chỉnh sửa & Crop
            </button>
            <button class="yt-aid-btn yt-aid-btn-tab" id="yt-aid-tab-gallery">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>
              Lịch sử Session (${sessionCaptures.length})
            </button>
            <button class="yt-aid-modal-close" id="yt-aid-close-modal" title="Đóng (Esc)">✕</button>
          </div>
        </div>

        <!-- Editor Toolbar -->
        <div class="yt-aid-toolbar" id="yt-aid-editor-toolbar">
          <div class="yt-aid-tool-group">
            <button class="yt-aid-btn yt-aid-tool-btn" id="yt-aid-btn-toggle-crop">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/></svg>
              <span id="yt-aid-crop-toggle-text">Bật Crop</span>
            </button>
            <div class="yt-aid-aspect-group" id="yt-aid-aspect-group" style="display: none;">
              <span class="yt-aid-label">Tỷ lệ:</span>
              <button class="yt-aid-btn-chip active" data-aspect="free">Tự do</button>
              <button class="yt-aid-btn-chip" data-aspect="16:9">16:9</button>
              <button class="yt-aid-btn-chip" data-aspect="4:3">4:3</button>
              <button class="yt-aid-btn-chip" data-aspect="1:1">1:1</button>
            </div>
            <button class="yt-aid-btn yt-aid-btn-success" id="yt-aid-btn-apply-crop" style="display: none;">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Cắt ảnh
            </button>
            <button class="yt-aid-btn yt-aid-btn-secondary" id="yt-aid-btn-reset-crop" style="display: none;">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
              Hoàn tác gốc
            </button>
          </div>

          <div class="yt-aid-tool-group yt-aid-actions-group">
            <button class="yt-aid-btn yt-aid-btn-primary" id="yt-aid-btn-copy-img">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              Copy ảnh
            </button>
            <button class="yt-aid-btn yt-aid-btn-primary" id="yt-aid-btn-download-png">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
              Tải PNG
            </button>
            <button class="yt-aid-btn yt-aid-btn-secondary" id="yt-aid-btn-download-jpg">
              Tải JPG
            </button>
          </div>
        </div>

        <!-- Viewport Area -->
        <div class="yt-aid-modal-body">
          <div class="yt-aid-editor-view" id="yt-aid-editor-view">
            <div class="yt-aid-canvas-wrapper" id="yt-aid-canvas-wrapper">
              <img id="yt-aid-preview-img" class="yt-aid-preview-img" src="${captureItem.dataUrl}" alt="Preview" />
              <!-- Interactive Crop Overlay -->
              <div class="yt-aid-crop-overlay" id="yt-aid-crop-overlay" style="display: none;">
                <div class="yt-aid-crop-box" id="yt-aid-crop-box">
                  <div class="yt-aid-crop-grid"></div>
                  <!-- 8 Handles -->
                  <div class="yt-aid-crop-handle handle-nw" data-handle="nw"></div>
                  <div class="yt-aid-crop-handle handle-ne" data-handle="ne"></div>
                  <div class="yt-aid-crop-handle handle-sw" data-handle="sw"></div>
                  <div class="yt-aid-crop-handle handle-se" data-handle="se"></div>
                  <div class="yt-aid-crop-handle handle-n" data-handle="n"></div>
                  <div class="yt-aid-crop-handle handle-s" data-handle="s"></div>
                  <div class="yt-aid-crop-handle handle-w" data-handle="w"></div>
                  <div class="yt-aid-crop-handle handle-e" data-handle="e"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- History Gallery View (Hidden by default) -->
          <div class="yt-aid-gallery-view" id="yt-aid-gallery-view" style="display: none;">
            <div class="yt-aid-gallery-header">
              <h3>Bộ sưu tập phiên làm việc (Session RAM: ${sessionCaptures.length} ảnh)</h3>
              <button class="yt-aid-btn yt-aid-btn-danger" id="yt-aid-clear-gallery">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                Xóa tất cả
              </button>
            </div>
            <div class="yt-aid-gallery-grid" id="yt-aid-gallery-grid">
              <!-- Rendered items -->
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    activeModal = modal;

    // Attach listeners
    setupModalEvents(modal, captureItem);
  }

  function setupModalEvents(modal, captureItem) {
    let activeDataUrl = captureItem.dataUrl;
    const previewImg = modal.querySelector('#yt-aid-preview-img');
    const cropOverlay = modal.querySelector('#yt-aid-crop-overlay');
    const cropBox = modal.querySelector('#yt-aid-crop-box');
    const canvasWrapper = modal.querySelector('#yt-aid-canvas-wrapper');
    const aspectGroup = modal.querySelector('#yt-aid-aspect-group');
    const btnToggleCrop = modal.querySelector('#yt-aid-btn-toggle-crop');
    const cropToggleText = modal.querySelector('#yt-aid-crop-toggle-text');
    const btnApplyCrop = modal.querySelector('#yt-aid-btn-apply-crop');
    const btnResetCrop = modal.querySelector('#yt-aid-btn-reset-crop');
    const metaRes = modal.querySelector('#yt-aid-meta-res');

    // Close logic
    const closeModal = () => {
      if (activeModal) {
        activeModal.remove();
        activeModal = null;
      }
      document.removeEventListener('keydown', handleEsc);
    };

    const handleEsc = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleEsc);

    modal.querySelector('#yt-aid-close-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Tab switching
    const tabEditor = modal.querySelector('#yt-aid-tab-editor');
    const tabGallery = modal.querySelector('#yt-aid-tab-gallery');
    const viewEditor = modal.querySelector('#yt-aid-editor-view');
    const viewGallery = modal.querySelector('#yt-aid-gallery-view');
    const toolbarEditor = modal.querySelector('#yt-aid-editor-toolbar');

    tabEditor.addEventListener('click', () => {
      tabEditor.classList.add('active');
      tabGallery.classList.remove('active');
      viewEditor.style.display = 'block';
      viewGallery.style.display = 'none';
      toolbarEditor.style.display = 'flex';
    });

    tabGallery.addEventListener('click', () => {
      tabGallery.classList.add('active');
      tabEditor.classList.remove('active');
      viewEditor.style.display = 'none';
      viewGallery.style.display = 'block';
      toolbarEditor.style.display = 'none';
      renderGalleryGrid(modal);
    });

    // --- Crop Tool Logic ---
    let cropActive = false;

    function initCropBox() {
      const rect = previewImg.getBoundingClientRect();
      const w = Math.round(rect.width * 0.75);
      const h = Math.round(rect.height * 0.75);
      const x = Math.round((rect.width - w) / 2);
      const y = Math.round((rect.height - h) / 2);

      cropState.x = x;
      cropState.y = y;
      cropState.width = w;
      cropState.height = h;

      updateCropBoxDOM();
    }

    function updateCropBoxDOM() {
      cropBox.style.left = `${cropState.x}px`;
      cropBox.style.top = `${cropState.y}px`;
      cropBox.style.width = `${cropState.width}px`;
      cropBox.style.height = `${cropState.height}px`;
    }

    btnToggleCrop.addEventListener('click', () => {
      cropActive = !cropActive;
      cropState.active = cropActive;
      if (cropActive) {
        cropOverlay.style.display = 'block';
        aspectGroup.style.display = 'flex';
        btnApplyCrop.style.display = 'inline-flex';
        btnResetCrop.style.display = 'inline-flex';
        cropToggleText.textContent = 'Hủy Crop';
        btnToggleCrop.classList.add('active');
        initCropBox();
      } else {
        cropOverlay.style.display = 'none';
        aspectGroup.style.display = 'none';
        btnApplyCrop.style.display = 'none';
        btnResetCrop.style.display = 'none';
        cropToggleText.textContent = 'Bật Crop';
        btnToggleCrop.classList.remove('active');
      }
    });

    // Aspect ratio chips
    modal.querySelectorAll('.yt-aid-btn-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('.yt-aid-btn-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        cropState.aspectRatio = chip.dataset.aspect;

        // Apply ratio constraint
        const rect = previewImg.getBoundingClientRect();
        if (cropState.aspectRatio === '16:9') {
          cropState.height = Math.round(cropState.width * (9 / 16));
        } else if (cropState.aspectRatio === '4:3') {
          cropState.height = Math.round(cropState.width * (3 / 4));
        } else if (cropState.aspectRatio === '1:1') {
          cropState.height = cropState.width;
        }

        // Keep inside bounds
        if (cropState.y + cropState.height > rect.height) {
          cropState.y = Math.max(0, rect.height - cropState.height);
        }
        updateCropBoxDOM();
      });
    });

    // Drag & Resize crop box
    let isDragging = false;
    let isResizing = false;
    let activeHandle = null;
    let startMouse = { x: 0, y: 0 };
    let startBox = { x: 0, y: 0, w: 0, h: 0 };

    cropBox.addEventListener('mousedown', (e) => {
      if (e.target.dataset.handle) {
        isResizing = true;
        activeHandle = e.target.dataset.handle;
      } else {
        isDragging = true;
      }
      startMouse = { x: e.clientX, y: e.clientY };
      startBox = { x: cropState.x, y: cropState.y, w: cropState.width, h: cropState.height };
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!cropActive || (!isDragging && !isResizing)) return;

      const dx = e.clientX - startMouse.x;
      const dy = e.clientY - startMouse.y;
      const rect = previewImg.getBoundingClientRect();

      if (isDragging) {
        let nx = startBox.x + dx;
        let ny = startBox.y + dy;
        nx = Math.max(0, Math.min(rect.width - cropState.width, nx));
        ny = Math.max(0, Math.min(rect.height - cropState.height, ny));
        cropState.x = nx;
        cropState.y = ny;
        updateCropBoxDOM();
      } else if (isResizing) {
        let nw = startBox.w;
        let nh = startBox.h;
        let nx = startBox.x;
        let ny = startBox.y;

        if (activeHandle.includes('e')) nw = Math.max(50, startBox.w + dx);
        if (activeHandle.includes('s')) nh = Math.max(50, startBox.h + dy);
        if (activeHandle.includes('w')) {
          const possibleW = startBox.w - dx;
          if (possibleW >= 50) {
            nw = possibleW;
            nx = startBox.x + dx;
          }
        }
        if (activeHandle.includes('n')) {
          const possibleH = startBox.h - dy;
          if (possibleH >= 50) {
            nh = possibleH;
            ny = startBox.y + dy;
          }
        }

        // Apply aspect ratio if active
        if (cropState.aspectRatio === '16:9') nh = Math.round(nw * (9 / 16));
        if (cropState.aspectRatio === '4:3') nh = Math.round(nw * (3 / 4));
        if (cropState.aspectRatio === '1:1') nh = nw;

        // Boundaries
        if (nx + nw <= rect.width && nx >= 0) {
          cropState.x = nx;
          cropState.width = nw;
        }
        if (ny + nh <= rect.height && ny >= 0) {
          cropState.y = ny;
          cropState.height = nh;
        }
        updateCropBoxDOM();
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      isResizing = false;
      activeHandle = null;
    });

    // Apply Crop Action
    btnApplyCrop.addEventListener('click', () => {
      const img = new Image();
      img.onload = () => {
        const rect = previewImg.getBoundingClientRect();
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;

        const sourceX = Math.round(cropState.x * scaleX);
        const sourceY = Math.round(cropState.y * scaleY);
        const sourceW = Math.round(cropState.width * scaleX);
        const sourceH = Math.round(cropState.height * scaleY);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = sourceW;
        cropCanvas.height = sourceH;
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);

        const croppedDataUrl = cropCanvas.toDataURL('image/png');
        activeDataUrl = croppedDataUrl;
        previewImg.src = croppedDataUrl;

        metaRes.textContent = `${sourceW}×${sourceH}`;
        showToast(`✂️ Đã cắt ảnh (${sourceW}×${sourceH})`, 'success');

        // Close crop mode
        btnToggleCrop.click();
      };
      img.src = activeDataUrl;
    });

    // Reset Crop Action
    btnResetCrop.addEventListener('click', () => {
      activeDataUrl = captureItem.dataUrl;
      previewImg.src = activeDataUrl;
      metaRes.textContent = `${captureItem.width}×${captureItem.height}`;
      showToast('🔄 Đã khôi phục ảnh gốc', 'info');
      if (cropActive) btnToggleCrop.click();
    });

    // Copy Image to Clipboard
    modal.querySelector('#yt-aid-btn-copy-img').addEventListener('click', () => {
      copyImageToClipboard(activeDataUrl);
    });

    // Download PNG
    modal.querySelector('#yt-aid-btn-download-png').addEventListener('click', () => {
      downloadDataUrl(activeDataUrl, `${sanitizeFilename(captureItem.title)}_${captureItem.timeStr}.png`, 'image/png');
    });

    // Download JPG
    modal.querySelector('#yt-aid-btn-download-jpg').addEventListener('click', () => {
      downloadDataUrl(activeDataUrl, `${sanitizeFilename(captureItem.title)}_${captureItem.timeStr}.jpg`, 'image/jpeg');
    });

    // Clear all captures in Session RAM
    modal.querySelector('#yt-aid-clear-gallery').addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn xóa tất cả ảnh chụp trong phiên làm việc này?')) {
        sessionCaptures.length = 0;
        renderGalleryGrid(modal);
        modal.querySelector('#yt-aid-tab-gallery').innerHTML = `
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>
          Lịch sử Session (0)
        `;
        showToast('🗑️ Đã xóa sạch lịch sử ảnh chụp', 'info');
      }
    });
  }

  function renderGalleryGrid(modal) {
    const grid = modal.querySelector('#yt-aid-gallery-grid');
    grid.innerHTML = '';

    if (sessionCaptures.length === 0) {
      grid.innerHTML = '<div class="yt-aid-empty-gallery">Chưa có ảnh nào trong bộ nhớ tạm phiên này. Hãy bấm chụp video!</div>';
      return;
    }

    sessionCaptures.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'yt-aid-gallery-card';
      card.innerHTML = `
        <div class="yt-aid-card-thumb">
          <img src="${item.dataUrl}" alt="Capture ${index + 1}" />
          <span class="yt-aid-card-time">${escapeHtml(item.timeStr)}</span>
          <span class="yt-aid-card-res">${item.width}×${item.height}</span>
        </div>
        <div class="yt-aid-card-body">
          <div class="yt-aid-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="yt-aid-card-date">${escapeHtml(item.createdAt)}</div>
          <div class="yt-aid-card-actions">
            <button class="yt-aid-btn-mini yt-aid-btn-primary" data-action="edit" title="Mở ảnh này">Mở</button>
            <button class="yt-aid-btn-mini" data-action="copy" title="Copy ảnh">Copy</button>
            <button class="yt-aid-btn-mini" data-action="download" title="Tải ảnh">Tải về</button>
            <button class="yt-aid-btn-mini yt-aid-btn-danger" data-action="remove" title="Xóa">✕</button>
          </div>
        </div>
      `;

      card.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openScreenshotModal(item);
      });

      card.querySelector('[data-action="copy"]').addEventListener('click', () => {
        copyImageToClipboard(item.dataUrl);
      });

      card.querySelector('[data-action="download"]').addEventListener('click', () => {
        downloadDataUrl(item.dataUrl, `${sanitizeFilename(item.title)}_${item.timeStr}.png`, 'image/png');
      });

      card.querySelector('[data-action="remove"]').addEventListener('click', () => {
        const idx = sessionCaptures.indexOf(item);
        if (idx !== -1) {
          sessionCaptures.splice(idx, 1);
          renderGalleryGrid(modal);
          modal.querySelector('#yt-aid-tab-gallery').innerHTML = `
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>
            Lịch sử Session (${sessionCaptures.length})
          `;
        }
      });

      grid.appendChild(card);
    });
  }

  function copyImageToClipboard(dataUrl) {
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        // Ensure image/png for clipboard API compatibility
        if (blob.type !== 'image/png') {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(pngBlob => {
              writeBlobToClipboard(pngBlob);
            }, 'image/png');
          };
          img.src = dataUrl;
        } else {
          writeBlobToClipboard(blob);
        }
      })
      .catch(err => {
        console.error('Copy image error:', err);
        showToast('⚠️ Không thể copy ảnh vào Clipboard!', 'warning');
      });
  }

  function writeBlobToClipboard(blob) {
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]).then(() => {
        showToast('📋 Đã sao chép ảnh vào Clipboard!', 'success');
      }).catch(err => {
        showToast('⚠️ Clipboard không hỗ trợ sao chép ảnh trực tiếp trên trình duyệt này', 'warning');
      });
    } else {
      showToast('⚠️ Trình duyệt chưa hỗ trợ Clipboard Item API', 'warning');
    }
  }

  function downloadDataUrl(dataUrl, filename, targetFormat = 'image/png') {
    if (targetFormat === 'image/jpeg' && dataUrl.startsWith('data:image/png')) {
      // Convert to JPEG
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        triggerDownload(c.toDataURL('image/jpeg', 0.92), filename);
      };
      img.src = dataUrl;
    } else {
      triggerDownload(dataUrl, filename);
    }
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`⬇️ Đã tải ảnh: ${filename}`, 'success');
  }

  function sanitizeFilename(name) {
    if (!name) return 'youtube_screenshot';
    return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50).trim();
  }

  // ==========================================
  // 6. HIGH-PERFORMANCE DOM OBSERVER & BUTTON INJECTION
  // ==========================================

  function initDOMObserver() {
    // Initial injection & suggested shorts caching
    injectAllAreas();
    updateCachedShorts();

    // Lightweight MutationObserver:
    // Ignores text/attribute/style mutations to prevent any CPU overhead during video playback or scrolling
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

    // YouTube SPA instant navigation hooks
    window.addEventListener('yt-navigate-start', () => {
      // Route transition started
    });

    window.addEventListener('yt-navigate-finish', () => {
      updateCachedShorts();
      ensureVideoLoop();
      // Fast injection on navigation finish
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
    if (!settings.enableCopyButtons && !settings.enableCleanLink && !settings.enableScreenshot) {
      return;
    }

    const path = window.location.pathname;
    // Route-targeted injection prevents scanning non-relevant elements
    if (path.startsWith('/watch')) {
      injectWatchPageToolbar();
      if (settings.enableCopyButtons || settings.enableCleanLink) {
        injectSidebarButtons();
      }
    } else if (path === '/' || path.startsWith('/results') || path.startsWith('/feed')) {
      if (settings.enableCopyButtons || settings.enableCleanLink) {
        injectHomePageCards();
      }
    }
  }

  // ----------------------------------------------------
  // A. WATCH PAGE INJECTION
  // ----------------------------------------------------
  function injectWatchPageToolbar() {
    if (!window.location.pathname.startsWith('/watch')) return;
    if (document.getElementById('yt-aid-watch-toolbar')) return;

    // Target watch metadata title container or action bar
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
          <button class="yt-aid-pill-btn" id="yt-aid-btn-copy-pure" title="Sao chép tiêu đề thuần túy">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <span>Copy Title</span>
          </button>
          <button class="yt-aid-pill-btn yt-aid-pill-sub" id="yt-aid-btn-copy-search" title="Copy & Tìm kiếm tab mới">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <span>+ Search</span>
          </button>
          <button class="yt-aid-pill-btn yt-aid-pill-sub" id="yt-aid-btn-copy-enter" title="Copy & Tự động Enter tìm kiếm trực tiếp">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7h-2z"/></svg>
            <span>+ Enter</span>
          </button>
        </div>

        <!-- Clean Copy Link -->
        <button class="yt-aid-pill-btn yt-aid-clean-link" id="yt-aid-btn-clean-link" title="Sao chép liên kết sạch không query tracking">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <span>Clean Link</span>
        </button>

        <!-- Screenshot HTML5 -->
        <button class="yt-aid-pill-btn yt-aid-screenshot-btn" id="yt-aid-btn-screenshot" title="Chụp ảnh khung hình video HTML5">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.4 10.5l4.77-8.26C13.47 2.09 12.75 2 12 2c-2.4 0-4.6.85-6.32 2.25l3.66 6.35.06-.1zM21.54 9c-.92-2.92-3.15-5.26-6-6.34L11.88 9h9.66zm.26 1h-7.49l.02.04 4.54 7.87C20.64 16.14 21.8 13.9 21.8 11.4c0-.47-.04-.94-.1-1.4zM8.58 12l-4.55-7.87C2.7 5.86 1.8 8.1 1.8 10.6c0 .47.04.94.1 1.4h7.49l-.02-.04zm-.38.74L3.43 21c.73.15 1.45.24 2.2.24 2.4 0 4.6-.85 6.32-2.25l-3.66-6.35-.09.1zM12 22c2.4 0 4.6-.85 6.32-2.25l-3.66-6.35-.09.1-4.77 8.26c.7.15 1.42.24 2.2.24zM12 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/></svg>
          <span>Chụp Video</span>
        </button>
      </div>

      <div class="yt-aid-toolbar-right">
        <!-- Loop Toggle Button -->
        <button class="yt-aid-pill-btn yt-aid-loop-indicator ${settings.enableLoop ? 'active' : ''}" id="yt-aid-btn-toggle-loop" title="Tự động lặp lại video">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>Loop</span>
        </button>
      </div>
    `;

    titleContainer.appendChild(toolbar);

    // Event bindings for watch toolbar
    toolbar.querySelector('#yt-aid-btn-copy-pure').addEventListener('click', () => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, `📋 Đã sao chép tiêu đề: "${title.slice(0, 35)}..."`);
    });

    toolbar.querySelector('#yt-aid-btn-copy-search').addEventListener('click', () => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, `🔍 Đã chép & tìm kiếm: "${title.slice(0, 35)}..."`);
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`, '_blank');
    });

    toolbar.querySelector('#yt-aid-btn-copy-enter').addEventListener('click', () => {
      const title = getWatchVideoTitle();
      copyTextToClipboard(title, `⏎ Đang tìm kiếm: "${title.slice(0, 35)}..."`);
      autoEnterSearch(title);
    });

    toolbar.querySelector('#yt-aid-btn-clean-link').addEventListener('click', () => {
      const cleanUrl = cleanYoutubeUrl(window.location.href);
      copyTextToClipboard(cleanUrl, `🔗 Đã chép liên kết sạch: ${cleanUrl}`);
    });

    toolbar.querySelector('#yt-aid-btn-screenshot').addEventListener('click', () => {
      captureCurrentVideoFrame();
    });

    const loopBtn = toolbar.querySelector('#yt-aid-btn-toggle-loop');
    loopBtn.addEventListener('click', () => {
      const nextLoop = !settings.enableLoop;
      settings.enableLoop = nextLoop;
      chrome.storage.local.set({ enableLoop: nextLoop });
      loopBtn.classList.toggle('active', nextLoop);
      const video = document.querySelector('video.video-stream, video');
      if (video) video.loop = nextLoop;
      showToast(nextLoop ? '🔁 Đã bật tự động lặp video' : '⏸️ Đã tắt tự động lặp video', 'info');
    });
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
        <button class="yt-aid-mini-action yt-aid-copy-search" title="Copy & Tìm kiếm tab mới">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </button>
        <button class="yt-aid-mini-action yt-aid-copy-enter" title="Copy & Auto Enter tìm kiếm">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7h-2z"/></svg>
        </button>
        <button class="yt-aid-mini-action yt-aid-clean-link" title="Copy liên kết sạch">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        </button>
      `;

      details.appendChild(cardBar);

      // Event handlers
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
        copyTextToClipboard(title, `📋 Đã sao chép: "${title.slice(0, 30)}..."`);
      });

      cardBar.querySelector('.yt-aid-copy-search').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = getCardTitle();
        copyTextToClipboard(title, `🔍 Đã chép & tìm kiếm: "${title.slice(0, 30)}..."`);
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`, '_blank');
      });

      cardBar.querySelector('.yt-aid-copy-enter').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = getCardTitle();
        copyTextToClipboard(title, `⏎ Đang tìm kiếm: "${title.slice(0, 30)}..."`);
        autoEnterSearch(title);
      });

      cardBar.querySelector('.yt-aid-clean-link').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const clean = cleanYoutubeUrl(getCardUrl());
        copyTextToClipboard(clean, `🔗 Đã chép link sạch: ${clean}`);
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
          <button class="yt-aid-mini-action yt-aid-copy-search" title="Copy & Tìm kiếm tab mới">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          </button>
          <button class="yt-aid-mini-action yt-aid-copy-enter" title="Copy & Auto Enter tìm kiếm trực tiếp">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7h-2z"/></svg>
          </button>
          <button class="yt-aid-mini-action yt-aid-clean-link" title="Copy liên kết sạch">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            <span>Link</span>
          </button>
        </div>
      `;

      details.appendChild(cardBar);

      // Event handlers
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
        copyTextToClipboard(title, `📋 Đã sao chép: "${title.slice(0, 30)}..."`);
      });

      cardBar.querySelector('.yt-aid-copy-search').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = getCardTitle();
        copyTextToClipboard(title, `🔍 Đã chép & tìm kiếm: "${title.slice(0, 30)}..."`);
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`, '_blank');
      });

      cardBar.querySelector('.yt-aid-copy-enter').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = getCardTitle();
        copyTextToClipboard(title, `⏎ Đang tìm kiếm: "${title.slice(0, 30)}..."`);
        autoEnterSearch(title);
      });

      cardBar.querySelector('.yt-aid-clean-link').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const clean = cleanYoutubeUrl(getCardUrl());
        copyTextToClipboard(clean, `🔗 Đã chép link sạch: ${clean}`);
      });
    });
  }

})();
