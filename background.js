/**
 * YouTube Aid - Background Service Worker
 * Handles media conversion API requests, network header modifications, and native file downloads.
 */

const RULE_ID_LOADER = 1001;
const RULE_ID_AFFADAFFA = 1002;
const RULE_ID_SAVENOW = 1003;

// Server danh sách: ưu tiên p.savenow.to (nhanh hơn), fallback sang loader.to
const DOWNLOAD_SERVERS = [
  { base: 'https://p.savenow.to', referer: 'https://p.savenow.to/', origin: 'https://p.savenow.to' },
  { base: 'https://loader.to',    referer: 'https://loader.to/',    origin: 'https://loader.to' }
];

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
          { header: 'Referer', operation: 'set', value: 'https://p.savenow.to/' },
          { header: 'Origin', operation: 'set', value: 'https://p.savenow.to' }
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
          { header: 'Referer', operation: 'set', value: 'https://p.savenow.to/' },
          { header: 'Origin', operation: 'set', value: 'https://p.savenow.to' }
        ]
      },
      condition: {
        urlFilter: '||savenow.to/*',
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

  if (request.action === 'pauseMediaDownload') {
    if (chrome.downloads && request.downloadId) {
      chrome.downloads.pause(request.downloadId, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
      return true;
    }
    sendResponse({ success: false });
    return true;
  }

  if (request.action === 'resumeMediaDownload') {
    if (chrome.downloads && request.downloadId) {
      chrome.downloads.resume(request.downloadId, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
      return true;
    }
    sendResponse({ success: false });
    return true;
  }

  if (request.action === 'cancelMediaDownload') {
    if (chrome.downloads && request.downloadId) {
      chrome.downloads.cancel(request.downloadId, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
      return true;
    }
    sendResponse({ success: false });
    return true;
  }

  return false;
});

async function handleStartDownload({ videoUrl, format = 'mp3' }) {
  if (!videoUrl) throw new Error('Missing video URL');

  let lastError = null;

  // Thử lần lượt các server: ưu tiên server nhanh, fallback server dự phòng
  for (const server of DOWNLOAD_SERVERS) {
    try {
      const startUrl = `${server.base}/ajax/download.php?format=${encodeURIComponent(format)}&url=${encodeURIComponent(videoUrl)}`;
      const res = await fetch(startUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Referer': server.referer,
          'Origin': server.origin
        }
      });

      if (!res.ok) {
        lastError = new Error(`HTTP error ${res.status} from ${server.base}`);
        continue;
      }

      const data = await res.json();
      if (!data || !data.success || !data.progress_url) {
        lastError = new Error(data?.message || data?.error || `No progress URL from ${server.base}`);
        continue;
      }

      console.log(`[YtAid] Download initiated via ${server.base}`);
      return {
        success: true,
        id: data.id,
        progressUrl: data.progress_url,
        title: data.title,
        info: data.info,
        format: data.format
      };
    } catch (err) {
      lastError = err;
      console.warn(`[YtAid] Server ${server.base} failed:`, err.message);
      continue;
    }
  }

  throw lastError || new Error('All download servers failed');
}

async function handleCheckProgress({ progressUrl }) {
  if (!progressUrl) throw new Error('Missing progress URL');

  const res = await fetch(progressUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://p.savenow.to/',
      'Origin': 'https://p.savenow.to'
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
