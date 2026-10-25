/**
 * Youtube Aid — Shortcut Rules (shared by content script and options page)
 *
 * Every action is a repeated-tap chord of one letter: two taps, or three taps
 * for History. Single-key bindings are not offered because they would fire
 * while browsing YouTube and collide with YouTube's own shortcuts.
 */

(function (root) {
  'use strict';

  const ACTIONS = [
    { id: 'shorts', label: 'Mở video Shorts gợi ý', taps: 2, target: 'youtube.com/shorts/{id}' },
    { id: 'home', label: 'Về Trang chủ YouTube', taps: 2, target: 'youtube.com/' },
    { id: 'history', label: 'Mở Lịch sử xem video', taps: 3, target: 'youtube.com/feed/history' },
    { id: 'playlists', label: 'Mở Danh sách phát', taps: 2, target: 'youtube.com/feed/playlists' },
    { id: 'music', label: 'Mở YouTube Music', taps: 2, target: 'music.youtube.com/' }
  ];

  const DEFAULT_KEYS = Object.freeze({
    shorts: 's',
    home: 'h',
    history: 'h',
    playlists: 'p',
    music: 'm'
  });

  // Keys YouTube already handles as single-key shortcuts. m and p are allowed
  // because the content script replays mute / previous-video when a chord is
  // abandoned; every other native key would be swallowed with no way to replay.
  const YOUTUBE_NATIVE_KEYS = ['k', 'j', 'l', 'f', 't', 'i', 'n', 'c', 'm', 'p'];
  const REPLAYABLE_NATIVE_KEYS = ['m', 'p'];

  const ALLOWED_KEYS = 'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .filter((key) => !YOUTUBE_NATIVE_KEYS.includes(key) || REPLAYABLE_NATIVE_KEYS.includes(key));

  function findAction(actionId) {
    return ACTIONS.find((action) => action.id === actionId) || null;
  }

  function isAllowedKey(key) {
    return ALLOWED_KEYS.includes(String(key || '').toLowerCase());
  }

  // Returns '' when the key can be used for this action, otherwise a message
  // explaining why the choice is impossible or conflicts with another binding.
  function conflictMessage(actionId, key, keys) {
    const action = findAction(actionId);
    if (!action) return 'Hành động không hợp lệ.';

    const normalized = String(key || '').toLowerCase();
    if (normalized.length !== 1) {
      return 'Mỗi phím tắt chỉ dùng một chữ cái a–z.';
    }
    if (!/^[a-z]$/.test(normalized)) {
      return 'Chỉ dùng được chữ cái a–z, không dùng số hay ký tự đặc biệt.';
    }
    if (!isAllowedKey(normalized)) {
      return `Phím "${normalized.toUpperCase()}" YouTube đang dùng cho phím tắt gốc nên không thể chọn.`;
    }

    if (action.taps === 2) {
      const clash = ACTIONS.find((other) =>
        other.taps === 2 &&
        other.id !== action.id &&
        String((keys || {})[other.id] || '').toLowerCase() === normalized
      );
      if (clash) {
        return `Phím "${normalized.toUpperCase()}" đã dùng cho "${clash.label}".`;
      }
    }

    return '';
  }

  // Repairs stored / hand-edited values: invalid or conflicting keys fall back
  // to the defaults, then to the first unused allowed letter.
  function sanitizeKeys(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    const usedByDouble = new Set();

    for (const action of ACTIONS) {
      const fallback = DEFAULT_KEYS[action.id];
      const candidate = String(input[action.id] || '').toLowerCase();
      let key = isAllowedKey(candidate) ? candidate : '';

      if (key && action.taps === 2 && usedByDouble.has(key)) key = '';

      if (!key) {
        key = action.taps === 3 || !usedByDouble.has(fallback) ? fallback : '';
      }
      if (!key) {
        key = ALLOWED_KEYS.find((letter) => !usedByDouble.has(letter)) || fallback;
      }

      result[action.id] = key;
      if (action.taps === 2) usedByDouble.add(key);
    }

    return result;
  }

  function sequenceLabel(keys, actionId) {
    const action = findAction(actionId);
    const key = keys && keys[actionId];
    if (!action || !key) return '';
    return String(key).repeat(action.taps).toUpperCase();
  }

  root.YtAidShortcuts = {
    ACTIONS,
    DEFAULT_KEYS,
    ALLOWED_KEYS,
    YOUTUBE_NATIVE_KEYS,
    REPLAYABLE_NATIVE_KEYS,
    findAction,
    isAllowedKey,
    conflictMessage,
    sanitizeKeys,
    sequenceLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
