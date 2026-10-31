/**
 * Youtube Aid - Options Script
 * Handles settings persistence via chrome.storage.local
 */

document.addEventListener('DOMContentLoaded', () => {
  const SHORTCUTS = window.YtAidShortcuts;
  const I18N = window.YtAidI18n;
  const T = (text, params) => (I18N ? I18N.t(text, params) : text);

  const FALLBACK_SHORTCUT_KEYS = {
    shorts: 's',
    home: 'h',
    history: 'h',
    playlists: 'p',
    music: 'm'
  };
  const FALLBACK_SHORTCUT_TAPS = {
    shorts: 2,
    home: 2,
    history: 3,
    playlists: 2,
    music: 2
  };

  const DEFAULTS = {
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
    hideButtonNames: false,
    shortcutKeys: SHORTCUTS ? { ...SHORTCUTS.DEFAULT_KEYS } : { ...FALLBACK_SHORTCUT_KEYS },
    shortcutTaps: SHORTCUTS ? { ...SHORTCUTS.DEFAULT_TAPS } : { ...FALLBACK_SHORTCUT_TAPS }
  };

  const toggleInputs = {
    enableLoop: document.getElementById('enableLoop'),
    enableShortcuts: document.getElementById('enableShortcuts'),
    enableCopyButtons: document.getElementById('enableCopyButtons'),
    enableToasts: document.getElementById('enableToasts'),
    enableSelectionCopy: document.getElementById('enableSelectionCopy'),
    enableAutoPasteSearch: document.getElementById('enableAutoPasteSearch'),
    enableAutoPasteReplace: document.getElementById('enableAutoPasteReplace'),
    enableMediaDownload: document.getElementById('enableMediaDownload'),
    enableAdSkip: document.getElementById('enableAdSkip'),
    enableHideAds: document.getElementById('enableHideAds'),
    enableShortsAutoScroll: document.getElementById('enableShortsAutoScroll'),
    enableAnimations: document.getElementById('enableAnimations')
  };

  const statusMsg = document.getElementById('statusMsg');
  const btnReset = document.getElementById('btnReset');
  const keybindActionsEl = document.getElementById('keybindActions');
  const keybindKeyboard = document.getElementById('keybindKeyboard');
  const keybindTapsEl = document.getElementById('keybindTaps');
  const keybindError = document.getElementById('keybindError');
  const keybindSection = document.getElementById('keybindSection');
  const langButtons = document.querySelectorAll('.lang-btn');

  const KEY_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  const SHORT_LABELS = {
    shorts: 'Shorts',
    home: 'Trang chủ',
    history: 'Lịch sử',
    playlists: 'Danh sách phát',
    music: 'YouTube Music'
  };

  let currentShortcutKeys = { ...DEFAULTS.shortcutKeys };
  let currentShortcutTaps = { ...DEFAULTS.shortcutTaps };
  let selectedActionId = 'shorts';
  let statusTimer = null;

  function applyLanguage(lang, { persist = false } = {}) {
    if (!I18N) return;
    I18N.setLanguage(lang);
    I18N.apply(document);
    langButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lang === I18N.getLanguage());
    });
    document.title = `YouTube Aid - ${T('Bảng điều khiển & Phím tắt nhanh')}`;
    try {
      chrome.action?.setTitle({ title: T('Youtube Aid - Cài đặt & Phím tắt') });
    } catch (e) { }
    clearKeybindError();
    buildKeybindEditor();
    if (persist) {
      chrome.storage.local.set({ language: I18N.getLanguage() }, () => {
        void chrome.runtime?.lastError;
      });
    }
  }

  function showStatus(text = 'Đã tự động lưu cài đặt!') {
    const span = statusMsg.querySelector('span');
    if (span) span.textContent = T(text);
    statusMsg.classList.add('visible');

    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMsg.classList.remove('visible');
    }, 2200);
  }

  function showKeybindError(text) {
    keybindError.textContent = text;
  }

  function clearKeybindError() {
    keybindError.textContent = '';
  }

  function buildKeybindEditor() {
    if (!keybindActionsEl || !keybindKeyboard) return;

    if (!SHORTCUTS) {
      if (keybindSection) keybindSection.hidden = true;
      return;
    }

    keybindActionsEl.textContent = '';

    for (const action of SHORTCUTS.ACTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keybind-action';
      btn.dataset.action = action.id;
      btn.setAttribute('role', 'tab');
      btn.title = T(action.label);

      const label = document.createElement('span');
      label.className = 'keybind-action-label';
      label.textContent = T(SHORT_LABELS[action.id] || action.label);

      const keys = document.createElement('span');
      keys.className = 'keybind-action-keys';
      keys.dataset.keysFor = action.id;

      btn.append(label, keys);
      btn.addEventListener('click', () => {
        if (selectedActionId === action.id) return;
        selectedActionId = action.id;
        clearKeybindError();
        refreshKeybindState();
      });

      keybindActionsEl.appendChild(btn);
    }

    keybindKeyboard.textContent = '';

    KEY_ROWS.forEach((row, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = `keybind-row keybind-row-${index + 1}`;

      for (const key of row) {
        const keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = 'keybind-key';
        keyBtn.dataset.key = key;
        keyBtn.textContent = key.toUpperCase();
        keyBtn.addEventListener('click', () => handleKeyPick(key));
        rowEl.appendChild(keyBtn);
      }

      keybindKeyboard.appendChild(rowEl);
    });

    refreshKeybindState();
  }

  function actionTaps(actionId) {
    const value = Number(currentShortcutTaps[actionId]);
    if (value === 2 || value === 3) return value;
    const action = SHORTCUTS ? SHORTCUTS.findAction(actionId) : null;
    return action ? action.taps : 2;
  }

  function refreshKeybindState() {
    if (!SHORTCUTS) return;

    document.querySelectorAll('.keybind-action').forEach((el) => {
      const actionId = el.dataset.action;
      const active = actionId === selectedActionId;
      const action = SHORTCUTS.findAction(actionId);
      const key = currentShortcutKeys[actionId];

      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
      if (action) el.title = T(action.label);

      const keysEl = el.querySelector('.keybind-action-keys');
      if (!keysEl) return;
      keysEl.textContent = '';

      if (!action || !key) return;
      const taps = actionTaps(actionId);
      for (let i = 0; i < taps; i++) {
        const badge = document.createElement('span');
        badge.className = 'kbd-badge';
        badge.textContent = key.toUpperCase();
        keysEl.appendChild(badge);
      }
    });

    if (keybindTapsEl) {
      const taps = actionTaps(selectedActionId);
      keybindTapsEl.querySelectorAll('.keybind-tap').forEach((btn) => {
        const active = Number(btn.dataset.taps) === taps;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    const selected = SHORTCUTS.findAction(selectedActionId);
    if (!selected) return;
    const currentKey = currentShortcutKeys[selectedActionId];

    document.querySelectorAll('.keybind-key').forEach((keyEl) => {
      const key = keyEl.dataset.key;
      const isCurrent = key === currentKey;
      const isNative = !SHORTCUTS.isAllowedKey(key);
      const conflictReason = !isNative && !isCurrent
        ? SHORTCUTS.conflictMessage(selectedActionId, key, currentShortcutKeys, currentShortcutTaps)
        : '';
      const usedBy = SHORTCUTS.ACTIONS.find((action) =>
        action.id !== selectedActionId && currentShortcutKeys[action.id] === key
      );

      keyEl.classList.toggle('is-current', isCurrent);
      keyEl.classList.toggle('is-bound', !!usedBy && !isCurrent);
      keyEl.classList.toggle('is-native', isNative);
      keyEl.classList.toggle('is-taken', !!conflictReason);
      keyEl.disabled = isNative || !!conflictReason;
      keyEl.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');

      if (isNative) {
        keyEl.title = T('YouTube đang dùng phím {0} cho phím tắt gốc', [key.toUpperCase()]);
      } else if (isCurrent) {
        keyEl.title = T('Phím hiện tại của "{0}"', [T(selected.label)]);
      } else if (conflictReason) {
        keyEl.title = conflictReason;
      } else if (usedBy) {
        keyEl.title = T('Phím {0} đang dùng cho "{1}" ({2} lần bấm) — vẫn chọn được vì khác số lần bấm',
          [key.toUpperCase(), T(usedBy.label), actionTaps(usedBy.id)]);
      } else {
        keyEl.title = T('Gán phím {0} cho "{1}"', [key.toUpperCase(), T(selected.label)]);
      }
    });
  }

  function handleKeyPick(key) {
    if (!SHORTCUTS) return;

    const reason = SHORTCUTS.conflictMessage(selectedActionId, key, currentShortcutKeys, currentShortcutTaps);
    if (reason) {
      showKeybindError(reason);
      return;
    }

    if (currentShortcutKeys[selectedActionId] === key) {
      clearKeybindError();
      return;
    }

    currentShortcutKeys[selectedActionId] = key;
    clearKeybindError();
    saveShortcutKeys();
    refreshKeybindState();
  }

  // 2 or 3 taps per action. If the new tap count makes the current letter clash
  // with another action, only this action moves to a free letter — every other
  // binding stays untouched.
  function handleTapPick(taps) {
    if (!SHORTCUTS) return;
    if (taps !== 2 && taps !== 3) return;

    const actionId = selectedActionId;
    const action = SHORTCUTS.findAction(actionId);
    if (!action || actionTaps(actionId) === taps) return;

    const nextTaps = { ...currentShortcutTaps, [actionId]: taps };
    let key = currentShortcutKeys[actionId];
    let note = '';

    if (SHORTCUTS.conflictMessage(actionId, key, currentShortcutKeys, nextTaps)) {
      const usedKeys = new Set(Object.values(currentShortcutKeys));
      const free = SHORTCUTS.ALLOWED_KEYS.find((letter) =>
        !usedKeys.has(letter) &&
        !SHORTCUTS.conflictMessage(actionId, letter, currentShortcutKeys, nextTaps)
      );
      if (!free) {
        showKeybindError(T('Không còn phím trống cho "{0}". Hãy đổi phím của hành động khác trước.', [T(action.label)]));
        return;
      }
      key = free;
      note = free ? T(' Đã đổi phím sang {0} để không trùng phím khác.', [free.toUpperCase()]) : '';
    }

    currentShortcutTaps = SHORTCUTS.sanitizeTaps(nextTaps);
    currentShortcutKeys[actionId] = key;
    clearKeybindError();
    saveShortcutKeys(T('Đã đặt "{0}" thành {1} lần bấm.{2}', [T(SHORT_LABELS[actionId] || action.label), taps, note]));
    refreshKeybindState();
  }

  function saveShortcutKeys(statusText = 'Đã lưu phím tắt mới!') {
    chrome.storage.local.set({
      shortcutKeys: { ...currentShortcutKeys },
      shortcutTaps: { ...currentShortcutTaps }
    }, () => {
      void chrome.runtime?.lastError;
      showStatus(statusText);
    });
  }

  function syncKeybindVisibility() {
    if (!keybindSection) return;
    const isEnabled = toggleInputs.enableShortcuts ? toggleInputs.enableShortcuts.checked : true;
    keybindSection.classList.toggle('is-disabled', !isEnabled);
  }

  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (items) => {
      if (I18N) I18N.setLanguage(items.language);
      applyLanguage(items.language);

      Object.keys(toggleInputs).forEach((key) => {
        if (toggleInputs[key]) toggleInputs[key].checked = !!items[key];
      });
      document.body.classList.toggle('yt-aid-no-animations', !toggleInputs.enableAnimations?.checked);

      syncKeybindVisibility();

      currentShortcutTaps = SHORTCUTS
        ? SHORTCUTS.sanitizeTaps(items.shortcutTaps)
        : { ...FALLBACK_SHORTCUT_TAPS };
      currentShortcutKeys = SHORTCUTS
        ? SHORTCUTS.sanitizeKeys(items.shortcutKeys, currentShortcutTaps)
        : { ...FALLBACK_SHORTCUT_KEYS };
      buildKeybindEditor();
    });
  }

  function saveCurrentSettings(showSaved = true) {
    const current = {};

    Object.keys(toggleInputs).forEach((key) => {
      if (toggleInputs[key]) current[key] = toggleInputs[key].checked;
    });

    syncKeybindVisibility();

    chrome.storage.local.set(current, () => {
      if (showSaved) showStatus('Đã tự động lưu cài đặt!');
    });
  }

  Object.keys(toggleInputs).forEach((key) => {
    const el = toggleInputs[key];
    if (!el) return;
    el.addEventListener('change', () => {
      if (key === 'enableAnimations') {
        document.body.classList.toggle('yt-aid-no-animations', !el.checked);
      }
      saveCurrentSettings();
    });
  });

  if (keybindTapsEl) {
    keybindTapsEl.querySelectorAll('.keybind-tap').forEach((btn) => {
      btn.addEventListener('click', () => handleTapPick(Number(btn.dataset.taps)));
    });
  }

  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!I18N || btn.dataset.lang === I18N.getLanguage()) return;
      applyLanguage(btn.dataset.lang, { persist: true });
    });
  });

  // Another tab (or the popup) changed settings while this page is open.
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.language && I18N && changes.language.newValue !== I18N.getLanguage()) {
        applyLanguage(changes.language.newValue);
      }
      if (changes.enableShortcuts && toggleInputs.enableShortcuts) {
        toggleInputs.enableShortcuts.checked = !!changes.enableShortcuts.newValue;
        syncKeybindVisibility();
      }
      if (changes.enableAnimations && toggleInputs.enableAnimations) {
        toggleInputs.enableAnimations.checked = !!changes.enableAnimations.newValue;
        document.body.classList.toggle('yt-aid-no-animations', !changes.enableAnimations.newValue);
      }
    });
  } catch (e) { }

  btnReset.addEventListener('click', () => {
    if (confirm(T('Khôi phục tất cả cài đặt về mặc định ban đầu?'))) {
      chrome.storage.local.set(DEFAULTS, () => {
        clearKeybindError();
        loadSettings();
        showStatus('Đã khôi phục cài đặt mặc định!');
      });
    }
  });

  loadSettings();
});
