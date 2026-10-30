/**
 * YouTube Aid - Background Service Worker
 * Handles media conversion API requests, network header modifications, and native file downloads.
 */

const RULE_ID_LOADER = 1001;
const RULE_ID_AFFADAFFA = 1002;
const RULE_ID_SAVENOW = 1003;

function setupHeaderRules() {
  if (!chrome.declarativeNetRequest) return;

  const rules = [
    {
      id: RULE_ID_LOADER,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://loader.to/' },
          { header: 'Origin', operation: 'set', value: 'https://loader.to' }
        ]
      },
      condition: {
        urlFilter: '||loader.to/ajax/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'other']
      }
    },
    {
      id: RULE_ID_AFFADAFFA,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://loader.to/' },
          { header: 'Origin', operation: 'set', value: 'https://loader.to' }
        ]
      },
      condition: {
        urlFilter: '||affadaffa.com/api/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'other']
      }
    },
    {
      id: RULE_ID_SAVENOW,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://loader.to/' },
          { header: 'Origin', operation: 'set', value: 'https://loader.to' }
        ]
      },
      condition: {
        urlFilter: '||savenow.to/api/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'other']
      }
    }
  ];

  try {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID_LOADER, RULE_ID_AFFADAFFA, RULE_ID_SAVENOW],
      addRules: rules
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[YtAid Background] Error setting rules:', chrome.runtime.lastError);
      }
    });
  } catch (err) {
    console.warn('[YtAid Background] declarativeNetRequest error:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupHeaderRules();
});

chrome.runtime.onStartup.addListener(() => {
  setupHeaderRules();
});

setupHeaderRules();

// Message listener for content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === 'startMediaDownload') {
    handleStartDownload(request)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Unknown error' }));
    return true; // asynchronous sendResponse
  }

  if (request.action === 'checkMediaProgress') {
    handleCheckProgress(request)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Unknown error' }));
    return true;
  }

  if (request.action === 'saveMediaFile') {
    handleSaveFile(request)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Unknown error' }));
    return true;
  }

  return false;
});

async function handleStartDownload({ videoUrl, format = 'mp3' }) {
  if (!videoUrl) throw new Error('Missing video URL');

  const startUrl = `https://loader.to/ajax/download.php?format=${encodeURIComponent(format)}&url=${encodeURIComponent(videoUrl)}`;
  const res = await fetch(startUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://loader.to/',
      'Origin': 'https://loader.to'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const data = await res.json();
  if (!data || !data.success || !data.progress_url) {
    const msg = data?.message || data?.error || 'Could not initiate conversion';
    throw new Error(msg);
  }

  return {
    success: true,
    id: data.id,
    progressUrl: data.progress_url,
    title: data.title,
    info: data.info,
    format: data.format
  };
}

async function handleCheckProgress({ progressUrl }) {
  if (!progressUrl) throw new Error('Missing progress URL');

  const res = await fetch(progressUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://loader.to/',
      'Origin': 'https://loader.to'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const data = await res.json();
  const rawProgress = Number(data.progress) || 0;
  const isFinished = rawProgress >= 1000 && !!data.download_url;

  return {
    success: true,
    rawProgress,
    progress: Math.min(100, Math.round(rawProgress / 10)),
    downloadUrl: data.download_url || null,
    text: data.text || '',
    isFinished
  };
}

function handleSaveFile({ url, filename }) {
  return new Promise((resolve, reject) => {
    if (!chrome.downloads) {
      reject(new Error('downloads API not available'));
      return;
    }

    chrome.downloads.download({
      url: url,
      filename: filename || 'video-download',
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ success: true, downloadId });
      }
    });
  });
}
