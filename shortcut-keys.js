/**
 * Youtube Aid — Shortcut Rules (shared by content script and options page)
 *
 * Every action is a repeated-tap chord of one letter: two taps by default, or
 * three taps for History. The tap count is configurable per action (2 or 3),
 * and two actions may share a letter only when their tap counts differ.
 * Single-key bindings are not offered because they would fire while browsing
 * YouTube and collide with YouTube's own shortcuts.
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

  const DEFAULT_TAPS = Object.freeze(
    ACTIONS.reduce((acc, action) => {
      acc[action.id] = action.taps;
      return acc;
    }, {})
  );

  const TAP_CHOICES = Object.freeze([2, 3]);

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

  // Repairs stored tap counts: only 2 or 3 are accepted, otherwise the
  // action's shipped default applies.
  function sanitizeTaps(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    for (const action of ACTIONS) {
      const value = Number(input[action.id]);
      result[action.id] = TAP_CHOICES.includes(value) ? value : action.taps;
    }
    return result;
  }

  function tapsFor(actionId, taps) {
    const action = findAction(actionId);
    if (!action) return 0;
    return sanitizeTaps(taps)[actionId];
  }

  // Returns '' when the key can be used for this action, otherwise a message
  // explaining why the choice is impossible or conflicts with another binding.
  // The same letter is allowed twice only when the tap counts differ.
  function conflictMessage(actionId, key, keys, taps) {
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

    const effectiveTaps = sanitizeTaps(taps);
    const actionTaps = effectiveTaps[actionId];
    const clash = ACTIONS.find((other) =>
      other.id !== action.id &&
      String((keys || {})[other.id] || '').toLowerCase() === normalized &&
      effectiveTaps[other.id] === actionTaps
    );
    if (clash) {
      return `Phím "${normalized.toUpperCase()}" đã dùng cho "${clash.label}" (${actionTaps} lần bấm).`;
    }

    return '';
  }

  // Repairs stored / hand-edited values: invalid or conflicting keys fall back
  // to the defaults, then to the first unused allowed letter.
  function sanitizeKeys(raw, taps) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const effectiveTaps = sanitizeTaps(taps);
    const result = {};
    const used = new Set();

    for (const action of ACTIONS) {
      const actionTaps = effectiveTaps[action.id];
      const fallback = DEFAULT_KEYS[action.id];
      const candidate = String(input[action.id] || '').toLowerCase();
      let key = isAllowedKey(candidate) ? candidate : '';

      if (key && used.has(`${key}:${actionTaps}`)) key = '';

      if (!key && !used.has(`${fallback}:${actionTaps}`)) key = fallback;

      if (!key) {
        const usedKeys = new Set([...used].map((entry) => entry.split(':')[0]));
        key = ALLOWED_KEYS.find((letter) => !usedKeys.has(letter)) ||
          ALLOWED_KEYS.find((letter) => !used.has(`${letter}:${actionTaps}`)) ||
          fallback;
      }

      result[action.id] = key;
      used.add(`${key}:${actionTaps}`);
    }

    return result;
  }

  function sequenceLabel(keys, actionId, taps) {
    const action = findAction(actionId);
    const key = keys && keys[actionId];
    if (!action || !key) return '';
    return String(key).repeat(tapsFor(actionId, taps)).toUpperCase();
  }

  root.YtAidShortcuts = {
    ACTIONS,
    DEFAULT_KEYS,
    DEFAULT_TAPS,
    TAP_CHOICES,
    ALLOWED_KEYS,
    YOUTUBE_NATIVE_KEYS,
    REPLAYABLE_NATIVE_KEYS,
    findAction,
    isAllowedKey,
    sanitizeTaps,
    tapsFor,
    conflictMessage,
    sanitizeKeys,
    sequenceLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
