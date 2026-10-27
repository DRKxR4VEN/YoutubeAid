'use strict';
localStorage.setItem('ytAidPopupPage', 'bookmarks');
document.querySelector('.back').addEventListener('click', () => {
  localStorage.removeItem('ytAidPopupPage');
});
const PREFIX = 'ytAidBookmark:';
const videosEl = document.getElementById('videos');
const searchEl = document.getElementById('search');
const statusEl = document.getElementById('status');
let records = [];
let loadSequence = 0;

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = Math.floor(seconds % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function videoLink(record) {
  return 'https://www.youtube.com/watch?v=' + encodeURIComponent(record.videoId) + '&t=' + Math.floor(record.time) + 's';
}
function link(className, text, record) {
  const el = element('a', className, text);
  el.href = videoLink(record);
  el.target = '_blank';
  el.rel = 'noopener';
  el.addEventListener('click', async (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
      const matching = tabs.filter(tab => {
        try { const url = new URL(tab.url); return url.pathname === '/watch' && url.searchParams.get('v') === record.videoId; }
        catch (error) { return false; }
      }).sort((a, b) => Number(b.active) - Number(a.active));
      const tab = matching[0];
      if (!tab) { await chrome.tabs.create({ url: videoLink(record) }); return; }
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: 'ytAidSeekBookmark', videoId: record.videoId, time: record.time });
      } catch (error) { /* Older tabs need one reload to receive the new handler. */ }
      if (!response?.ok) await chrome.tabs.update(tab.id, { url: videoLink(record) });
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (error) { statusEl.textContent = 'Không mở được bookmark. Hãy tải lại tab YouTube rồi thử lại.'; }
  });
  return el;
}
async function changeRecord(record, button, action) {
  button.disabled = true;
  statusEl.textContent = '';
  try { await action(); await load(); }
  catch (error) { statusEl.textContent = 'Không lưu được thay đổi. Vui lòng thử lại.'; }
  finally { button.disabled = false; }
}
function render() {
  videosEl.replaceChildren();
  const query = searchEl.value.trim().toLocaleLowerCase('vi');
  const groups = new Map();
  for (const record of records) {
    if (query && !(record.title + ' ' + record.channelName + ' ' + record.name).toLocaleLowerCase('vi').includes(query)) continue;
    if (!groups.has(record.videoId)) groups.set(record.videoId, []);
    groups.get(record.videoId).push(record);
  }
  const matched = [...groups.values()].reduce((sum, group) => sum + group.length, 0);
  document.getElementById('count').textContent = groups.size + ' video · ' + matched + ' bookmark';
  const empty = document.getElementById('empty');
  empty.hidden = groups.size > 0;
  empty.querySelector('h2').textContent = query ? 'Không tìm thấy bookmark' : 'Chưa có bookmark nào';
  for (const group of groups.values()) {
    const record = group[0];
    const card = element('section', 'video');
    const head = element('div', 'video-head');
    const img = element('img', 'thumbnail');
    img.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(record.videoId) + '/mqdefault.jpg';
    img.alt = ''; img.loading = 'lazy';
    const details = element('div');
    const title = element('h2');
    title.append(link('', record.title || 'Video YouTube', record));
    details.append(title, element('div', 'channel', record.channelName || 'Chưa có tên kênh · Mở lại video để cập nhật'), element('span', 'meta', group.length + ' mốc thời gian' + (query ? ' phù hợp' : ' đã lưu')));
    head.append(img, details); card.append(head);
    for (const bookmark of group.sort((a,b) => a.time - b.time)) {
      const row = element('div', 'row');
      const rename = element('button', '', 'Đổi tên');
      rename.type = 'button';
      rename.setAttribute('aria-label', 'Đổi tên bookmark ' + bookmark.name);
      rename.addEventListener('click', () => {
        const name = prompt('Tên bookmark tại ' + formatTime(bookmark.time), bookmark.name);
        if (name === null || !name.trim()) return;
        changeRecord(bookmark, rename, () => chrome.storage.local.set({ [bookmark.storageKey]: {
          id: bookmark.id, videoId: bookmark.videoId, title: bookmark.title, channelName: bookmark.channelName,
          time: bookmark.time, name: name.trim(), createdAt: bookmark.createdAt
        } }));
      });
      const remove = element('button', 'delete', 'Xóa');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Xóa bookmark ' + bookmark.name);
      remove.addEventListener('click', () => {
        if (!confirm('Xóa bookmark “' + bookmark.name + '” tại ' + formatTime(bookmark.time) + '?')) return;
        changeRecord(bookmark, remove, () => chrome.storage.local.remove(bookmark.storageKey));
      });
      row.append(link('time', formatTime(bookmark.time) + ' ↗', bookmark), link('name', bookmark.name, bookmark), rename, remove);
      card.append(row);
    }
    videosEl.append(card);
  }
}
async function load() {
  const sequence = ++loadSequence;
  try {
    const data = await chrome.storage.local.get(null);
    if (sequence !== loadSequence) return;
    records = Object.entries(data).filter(([key, value]) => key.startsWith(PREFIX) && value &&
      typeof value.videoId === 'string' && /^[a-zA-Z0-9_-]+$/.test(value.videoId) &&
      Number.isFinite(value.time) && value.time >= 0 && typeof value.name === 'string')
      .map(([storageKey, value]) => ({ ...value, title: typeof value.title === 'string' ? value.title : '',
        channelName: typeof data['ytAidChannel:' + value.videoId] === 'string' ? data['ytAidChannel:' + value.videoId] :
          (typeof value.channelName === 'string' ? value.channelName : ''), storageKey }))
      .sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
    statusEl.textContent = '';
    render();
  } catch (error) { statusEl.textContent = 'Không đọc được bookmark. Hãy mở trang này từ tiện ích đã cài trong Chrome.'; }
}
searchEl.addEventListener('input', render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key.startsWith(PREFIX) || key.startsWith('ytAidChannel:'))) load();
});
load();
