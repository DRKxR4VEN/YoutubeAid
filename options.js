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
    enableScreenshot: true,
    enableToasts: true,
    screenshotFormat: 'image/png'
  };

  const inputs = {
    enableLoop: document.getElementById('enableLoop'),
    enableShortcuts: document.getElementById('enableShortcuts'),
    enableCopyButtons: document.getElementById('enableCopyButtons'),
    enableCleanLink: document.getElementById('enableCleanLink'),
    enableScreenshot: document.getElementById('enableScreenshot'),
    enableToasts: document.getElementById('enableToasts'),
    screenshotFormat: document.getElementById('screenshotFormat')
  };

  const statusMsg = document.getElementById('statusMsg');
  const btnReset = document.getElementById('btnReset');
  let statusTimer = null;

  function showStatus(text = 'Đã tự động lưu cài đặt!') {
    statusMsg.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      ${text}
    `;
    statusMsg.classList.add('visible');

    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMsg.classList.remove('visible');
    }, 2200);
  }

  // Load saved settings from chrome.storage.local
  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (items) => {
      inputs.enableLoop.checked = items.enableLoop;
      inputs.enableShortcuts.checked = items.enableShortcuts;
      inputs.enableCopyButtons.checked = items.enableCopyButtons;
      inputs.enableCleanLink.checked = items.enableCleanLink;
      inputs.enableScreenshot.checked = items.enableScreenshot;
      inputs.enableToasts.checked = items.enableToasts;
      inputs.screenshotFormat.value = items.screenshotFormat || 'image/png';
    });
  }

  // Save current settings
  function saveCurrentSettings() {
    const current = {
      enableLoop: inputs.enableLoop.checked,
      enableShortcuts: inputs.enableShortcuts.checked,
      enableCopyButtons: inputs.enableCopyButtons.checked,
      enableCleanLink: inputs.enableCleanLink.checked,
      enableScreenshot: inputs.enableScreenshot.checked,
      enableToasts: inputs.enableToasts.checked,
      screenshotFormat: inputs.screenshotFormat.value
    };

    chrome.storage.local.set(current, () => {
      showStatus('Đã tự động lưu cài đặt!');
    });
  }

  // Bind change events
  Object.keys(inputs).forEach(key => {
    const el = inputs[key];
    if (el) {
      el.addEventListener('change', () => {
        saveCurrentSettings();
      });
    }
  });

  // Reset to defaults
  btnReset.addEventListener('click', () => {
    if (confirm('Khôi phục tất cả cài đặt về mặc định ban đầu?')) {
      chrome.storage.local.set(DEFAULTS, () => {
        loadSettings();
        showStatus('Đã khôi phục cài đặt mặc định!');
      });
    }
  });

  // Initial load
  loadSettings();
});
