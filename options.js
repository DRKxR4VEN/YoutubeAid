/**
 * Youtube Aid - Options Script
 * Handles settings persistence via chrome.storage.local
 */

document.addEventListener('DOMContentLoaded', () => {
  const DEFAULTS = {
    enableLoop: true,
    enableShortcuts: true,
    enableCopyButtons: true,
    enableCleanLink: true,
    enableToasts: true,
    enableSelectionCopy: true,
    enableAutoPasteSearch: true,
    enableThumbnailDownload: true
  };

  const toggleInputs = {
    enableLoop: document.getElementById('enableLoop'),
    enableShortcuts: document.getElementById('enableShortcuts'),
    enableCopyButtons: document.getElementById('enableCopyButtons'),
    enableCleanLink: document.getElementById('enableCleanLink'),
    enableToasts: document.getElementById('enableToasts'),
    enableSelectionCopy: document.getElementById('enableSelectionCopy'),
    enableAutoPasteSearch: document.getElementById('enableAutoPasteSearch'),
    enableThumbnailDownload: document.getElementById('enableThumbnailDownload')
  };

  const statusMsg = document.getElementById('statusMsg');
  const btnReset = document.getElementById('btnReset');
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

  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (items) => {
      Object.keys(toggleInputs).forEach((key) => {
        if (toggleInputs[key]) toggleInputs[key].checked = !!items[key];
      });
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
        loadSettings();
        showStatus('Đã khôi phục cài đặt mặc định!');
      });
    }
  });

  loadSettings();
});
