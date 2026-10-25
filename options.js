/**
 * Youtube Aid - Options Script
 * Handles settings persistence via chrome.storage.local
 */

document.addEventListener('DOMContentLoaded', () => {
  const SHORTCUTS = window.YtAidShortcuts;
  const FALLBACK_SHORTCUT_KEYS = {
    shorts: 's',
    home: 'h',
    history: 'h',
    playlists: 'p',
    music: 'm'
  };

  const DEFAULTS = {
    enableLoop: true,
    enableShortcuts: true,
    enableCopyButtons: true,
    enableCleanLink: true,
    enableToasts: true,
    enableSelectionCopy: true,
    enableAutoPasteSearch: true,
    enableAutoPasteReplace: true,
    enableThumbnailDownload: true,
    shortcutKeys: SHORTCUTS ? { ...SHORTCUTS.DEFAULT_KEYS } : { ...FALLBACK_SHORTCUT_KEYS }
  };

  const toggleInputs = {
    enableLoop: document.getElementById('enableLoop'),
    enableShortcuts: document.getElementById('enableShortcuts'),
    enableCopyButtons: document.getElementById('enableCopyButtons'),
    enableToasts: document.getElementById('enableToasts'),
    enableSelectionCopy: document.getElementById('enableSelectionCopy'),
    enableAutoPasteSearch: document.getElementById('enableAutoPasteSearch'),
    enableAutoPasteReplace: document.getElementById('enableAutoPasteReplace')
  };

  const statusMsg = document.getElementById('statusMsg');
  const btnReset = document.getElementById('btnReset');
  const keybindActionsEl = document.getElementById('keybindActions');
  const keybindKeyboard = document.getElementById('keybindKeyboard');
  const keybindError = document.getElementById('keybindError');
  const keybindSection = document.getElementById('keybindSection');

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
  let selectedActionId = 'shorts';
  let statusTimer = null;

  function showStatus(text = 'Đã tự động lưu cài đặt!') {
    statusMsg.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      <span>${text}</span>
    `;
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
      btn.title = action.label;

      const label = document.createElement('span');
      label.className = 'keybind-action-label';
      label.textContent = SHORT_LABELS[action.id] || action.label;

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

  function refreshKeybindState() {
    if (!SHORTCUTS) return;

    document.querySelectorAll('.keybind-action').forEach((el) => {
      const actionId = el.dataset.action;
      const active = actionId === selectedActionId;
      const action = SHORTCUTS.findAction(actionId);
      const key = currentShortcutKeys[actionId];

      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');

      const keysEl = el.querySelector('.keybind-action-keys');
      if (!keysEl) return;
      keysEl.textContent = '';

      if (!action || !key) return;
      for (let i = 0; i < action.taps; i++) {
        const badge = document.createElement('span');
        badge.className = 'kbd-badge';
        badge.textContent = key.toUpperCase();
        keysEl.appendChild(badge);
      }
    });

    const selected = SHORTCUTS.findAction(selectedActionId);
    if (!selected) return;
    const currentKey = currentShortcutKeys[selectedActionId];

    document.querySelectorAll('.keybind-key').forEach((keyEl) => {
      const key = keyEl.dataset.key;
      const isCurrent = key === currentKey;
      const isNative = !SHORTCUTS.isAllowedKey(key);
      const conflictReason = !isNative && !isCurrent
        ? SHORTCUTS.conflictMessage(selectedActionId, key, currentShortcutKeys)
        : '';
      const usedBy = SHORTCUTS.ACTIONS.find((action) => currentShortcutKeys[action.id] === key);

      keyEl.classList.toggle('is-current', isCurrent);
      keyEl.classList.toggle('is-bound', !!usedBy && !isCurrent);
      keyEl.classList.toggle('is-native', isNative);
      keyEl.classList.toggle('is-taken', !!conflictReason);
      keyEl.disabled = isNative || !!conflictReason;
      keyEl.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');

      if (isNative) {
        keyEl.title = `YouTube đang dùng phím ${key.toUpperCase()} cho phím tắt gốc`;
      } else if (isCurrent) {
        keyEl.title = `Phím hiện tại của "${selected.label}"`;
      } else if (conflictReason) {
        keyEl.title = conflictReason;
      } else if (usedBy) {
        keyEl.title = `Phím ${key.toUpperCase()} đang dùng cho "${usedBy.label}"`;
      } else {
        keyEl.title = `Gán phím ${key.toUpperCase()} cho "${selected.label}"`;
      }
    });
  }

  function handleKeyPick(key) {
    if (!SHORTCUTS) return;

    const reason = SHORTCUTS.conflictMessage(selectedActionId, key, currentShortcutKeys);
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

  function saveShortcutKeys() {
    chrome.storage.local.set({ shortcutKeys: { ...currentShortcutKeys } }, () => {
      void chrome.runtime?.lastError;
      showStatus('Đã lưu phím tắt mới!');
    });
  }

  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (items) => {
      Object.keys(toggleInputs).forEach((key) => {
        if (toggleInputs[key]) toggleInputs[key].checked = !!items[key];
      });

      currentShortcutKeys = SHORTCUTS
        ? SHORTCUTS.sanitizeKeys(items.shortcutKeys)
        : { ...FALLBACK_SHORTCUT_KEYS };
      buildKeybindEditor();
    });
  }

  function saveCurrentSettings(showSaved = true) {
    const current = {};

    Object.keys(toggleInputs).forEach((key) => {
      if (toggleInputs[key]) current[key] = toggleInputs[key].checked;
    });

    chrome.storage.local.set(current, () => {
      if (showSaved) showStatus('Đã tự động lưu cài đặt!');
    });
  }

  Object.keys(toggleInputs).forEach((key) => {
    const el = toggleInputs[key];
    if (!el) return;
    el.addEventListener('change', () => saveCurrentSettings());
  });

  btnReset.addEventListener('click', () => {
    if (confirm('Khôi phục tất cả cài đặt về mặc định ban đầu?')) {
      chrome.storage.local.set(DEFAULTS, () => {
        clearKeybindError();
        loadSettings();
        showStatus('Đã khôi phục cài đặt mặc định!');
      });
    }
  });

  loadSettings();
});
