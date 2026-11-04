/**
 * Youtube Aid — page-world player bridge
 *
 * YouTube's player controls live on the #movie_player element as plain JS
 * methods, which the content script cannot reach from its isolated world.
 * This tiny MAIN-world script runs next to YouTube's own code, performs the
 * quality and miniplayer calls and answers over CustomEvents on `document` —
 * the one channel both worlds share. For the seekbar's "Most replayed" ranges
 * it only ever reads data YouTube already handed the page.
 */
(function () {
  'use strict';

  if (window.__ytAidPlayerBridge) return;
  window.__ytAidPlayerBridge = true;

  const REQUEST = 'yt-aid-player-request';
  const RESPONSE = 'yt-aid-player-response';

  function getPlayer() {
    const player = document.getElementById('movie_player');
    return player && typeof player.getAvailableQualityLevels === 'function' ? player : null;
  }

  function readQuality() {
    const player = getPlayer();
    if (!player) return null;
    let levels = [];
    let current = '';
    try {
      levels = (player.getAvailableQualityLevels() || []).filter(Boolean);
    } catch (e) {
      levels = [];
    }
    try {
      current = player.getPlaybackQuality() || '';
    } catch (e) {
      current = '';
    }
    return { levels, current };
  }

  // ==========================================
  // "Most replayed" ranges
  // ==========================================
  // YouTube has moved this payload between the heartbeat response, the player
  // response and the marker deck it pushes into the player, and it renames the
  // label per language, so the scan below matches on shape instead of one
  // renderer name: any object carrying a start/end time pair counts as long as
  // something heat-like points at it. Chapters, intro and outro markers are
  // named on purpose and are rejected.
  const HEAT_LABEL = /replay|rewatch|most watched|most repeated|hot ?spot|top moment|highlight|nổi bật|xem nhiều|xem lại|lại nhiều|再生|하이라이트/i;
  const HEAT_KEY = /heat|replay|rewatch|highlighted/i;
  const PLAIN_LABEL = /chapter|intro|outro|chương|giới thiệu|mở đầu|kết thúc|đoạn mở đầu/i;
  const MAX_NODES = 40000;
  const MAX_DEPTH = 45;
  const MAX_RANGES = 24;

  const textOf = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.simpleText) return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || '').join('');
    if (value.accessibilityData) return value.accessibilityData.label || '';
    if (value.label) return textOf(value.label);
    if (value.text) return textOf(value.text);
    return '';
  };

  // Every piece of text a marker renderer can carry: the visible label, the
  // accessibility line the hover chip prints, and the title/description pair
  // the marker deck uses.
  function labelsOf(node) {
    return [
      textOf(node.label),
      textOf(node.title),
      textOf(node.description),
      textOf(node.accessibilityText),
      node.accessibility && textOf(node.accessibility.accessibilityData),
      node.chapterName && textOf(node.chapterName)
    ].filter(Boolean).join(' ');
  }

  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  };

  const firstNum = (values) => {
    for (const value of values) {
      const parsed = num(value);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  // Millisecond, tick and microsecond ranges all show up depending on which
  // YouTube component produced the marker.
  function timeRange(node) {
    const start = firstNum([node.timeRangeStartMillis, node.visibleTimeRangeStartMillis, node.startMillis, node.startTimeMillis]);
    const end = firstNum([node.timeRangeEndMillis, node.visibleTimeRangeEndMillis, node.endMillis, node.endTimeMillis]);
    if (start !== null && end !== null) return { start, end };
    const ticks = num(node.startTicks);
    const ticksDuration = num(node.durationTicks);
    if (ticks !== null && ticksDuration !== null) return { start: ticks, end: ticks + ticksDuration };
    const usecStart = firstNum([node.timeRangeStartUsec, node.startUsec]);
    const usecEnd = firstNum([node.timeRangeEndUsec, node.endUsec]);
    if (usecStart !== null && usecEnd !== null) {
      return { start: Math.round(usecStart / 1000), end: Math.round(usecEnd / 1000) };
    }
    return null;
  }

  // A node is heat-like when it, or the key that reaches it, names heat: the
  // decoration style enum ("..._HEATMAP"), the heat entity, the heatmap
  // metadata sitting next to the markers, or a "heat"/"replay" key name.
  function heatLike(node, keyName) {
    if (HEAT_KEY.test(keyName)) return true;
    if (node.markersMetadata && node.markersMetadata.heatmapMetadata) return true;
    for (const key of Object.keys(node)) {
      if (HEAT_KEY.test(key)) return true;
      const value = node[key];
      if (typeof value === 'string' && /HEAT|heat/i.test(value) && value.length < 60) return true;
    }
    return false;
  }

  function collectRanges(root) {
    const ranges = [];
    const seen = new Set();
    const push = (startMs, endMs, label) => {
      if (endMs <= startMs || endMs - startMs < 1000) return;
      const id = `${startMs}:${endMs}`;
      if (seen.has(id) || ranges.length >= MAX_RANGES) return;
      seen.add(id);
      ranges.push({ startMs, endMs, label: label.trim().slice(0, 60) });
    };

    let visited = 0;
    const stack = [[root, 0, false, '']];
    while (stack.length && visited < MAX_NODES) {
      const [node, depth, inheritedHeat, keyName] = stack.pop();
      if (!node || typeof node !== 'object' || depth > MAX_DEPTH) continue;
      visited++;

      const heat = inheritedHeat || heatLike(node, keyName);
      const range = Array.isArray(node) ? null : timeRange(node);
      if (range) {
        const label = labelsOf(node);
        const replay = HEAT_LABEL.test(label);
        // Chapters and intros are named on purpose, so they never reach the
        // button even when they share a container with the replay ranges.
        if ((heat || replay) && (!PLAIN_LABEL.test(label) || replay)) {
          push(range.start, range.end, replay ? label : '');
        }
      }

      for (const key of Object.keys(node)) {
        const value = node[key];
        if (value && typeof value === 'object') stack.push([value, depth + 1, heat, key]);
      }
    }
    return ranges;
  }

  // YouTube hands the marker deck to the player through setMacroMarkers(), and
  // on newer pages that payload is the only place the replay ranges exist: the
  // same data is stripped from ytInitialPlayerResponse. Take the method over
  // before the player initialises and remember what it was given.
  // The decks are kept per video because YouTube also pushes the markers of the
  // clip it preloads next; a single slot would let that deck overwrite the one
  // the viewer is watching.
  const DECK_LIMIT = 8;
  const markerDecks = new Map();

  function currentVideoId() {
    const match = location.href.match(/[?&]v=([a-zA-Z0-9_-]{6,11})/);
    return match ? match[1] : '';
  }

  function storeDeck(videoId, ranges) {
    if (!videoId || !ranges || !ranges.length) return;
    if (!markerDecks.has(videoId) && markerDecks.size >= DECK_LIMIT) {
      markerDecks.delete(markerDecks.keys().next().value);
    }
    markerDecks.set(videoId, ranges);
  }

  function rememberMarkerDeck(payload) {
    const ranges = collectRanges(payload);
    if (!ranges.length) return;
    const details = payload && (payload.videoDetails || (payload.playerResponse && payload.playerResponse.videoDetails));
    storeDeck((details && details.videoId) || currentVideoId(), ranges);
  }

  let hookedPlayer = null;

  function hookMacroMarkers(player) {
    if (!player || player === hookedPlayer) return !!hookedPlayer;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(player, 'setMacroMarkers');
      if (!descriptor || !descriptor.configurable || typeof descriptor.value !== 'function') return false;
      let original = descriptor.value;
      Object.defineProperty(player, 'setMacroMarkers', {
        configurable: true,
        enumerable: true,
        get() {
          return function (payload) {
            try {
              rememberMarkerDeck(payload);
            } catch (e) {
              // Never let the bookkeeping break YouTube's own call.
            }
            return original.apply(player, arguments);
          };
        },
        set(fn) { original = fn; }
      });
      hookedPlayer = player;
      return true;
    } catch (e) {
      return false;
    }
  }

  // #movie_player is in the served HTML, but the methods are assigned during
  // player init, after this script runs — so watch for the element, and re-arm
  // after SPA navigation, when YouTube can hand over a different player node.
  // Decks are never cleared beyond the cache size: each one is keyed to the
  // video YouTube delivered it for, so a stale deck can only ever be ignored,
  // never applied to the wrong clip.
  function observePlayerUntilHooked() {
    const observer = new MutationObserver(() => {
      if (hookMacroMarkers(document.getElementById('movie_player'))) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }

  function armMacroMarkerHook() {
    if (hookMacroMarkers(document.getElementById('movie_player'))) return;
    observePlayerUntilHooked();
  }
  armMacroMarkerHook();
  installNetworkCapture();
  document.addEventListener('yt-navigate-finish', armMacroMarkerHook, true);

  function readFrom(object) {
    if (!object || typeof object !== 'object') return [];
    return collectRanges(object);
  }

  // ==========================================
  // Network capture (modern marker flow)
  // ==========================================
  // On the modern player YouTube delivers the "Most replayed" deck inside the
  // raw innerTube response bodies — frameworkUpdates.entityBatchUpdate
  // mutations carrying macroMarkersListEntity / markersDecoration — and strips
  // it from every readable payload once the player consumes it. The fetch and
  // XHR channels are therefore scanned here, right after the response text
  // arrives: a cheap string pre-filter, one parse, then each mutation payload
  // goes through the same collectRanges used everywhere else. Heat buckets
  // (startMillis + durationMillis only) never produce a range, because
  // timeRange() requires an explicit start/end pair.
  const NETWORK_MARKER_HINTS = /timedMarkerDecorations|macroMarkers|markersDecoration|HEATSEEKER/;
  const NETWORK_MAX_NODES = 60000;
  const NETWORK_MAX_DEPTH = 50;

  function payloadVideoId(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const entity = payload.macroMarkersListEntity;
    if (entity && typeof entity.externalVideoId === 'string'
      && /^[a-zA-Z0-9_-]{6,11}$/.test(entity.externalVideoId)) {
      return entity.externalVideoId;
    }
    if (typeof payload.externalVideoId === 'string'
      && /^[a-zA-Z0-9_-]{6,11}$/.test(payload.externalVideoId)) {
      return payload.externalVideoId;
    }
    return sourceVideoId(payload);
  }

  function captureFromNetwork(root) {
    if (!root || typeof root !== 'object') return;
    const pending = [];
    const seen = new Set();
    const bind = (payload, videoId) => {
      if (!payload || typeof payload !== 'object' || seen.has(payload)) return;
      seen.add(payload);
      pending.push({ payload, videoId });
    };
    let visited = 0;
    const stack = [[root, 0]];
    while (stack.length && visited < NETWORK_MAX_NODES) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > NETWORK_MAX_DEPTH) continue;
      visited++;
      if (!Array.isArray(node)) {
        const mutations = node.entityBatchUpdate && node.entityBatchUpdate.mutations;
        if (Array.isArray(mutations)) {
          for (const mutation of mutations) {
            if (!mutation || typeof mutation !== 'object') continue;
            // A mutation names its clip through the marker entity or a
            // videoDetails path; the decorations may sit beside the payload
            // instead of inside it, so both are bound to the same id.
            const videoId = payloadVideoId(mutation.payload) || payloadVideoId(mutation);
            bind(mutation.payload, videoId);
            bind(mutation.markersDecoration, videoId);
          }
        }
        // Marker nodes reached outside a mutation (older response trees) carry
        // no naming ancestor, so they belong to the clip being watched.
        bind(node.macroMarkersListEntity, '');
        bind(node.markersDecoration, '');
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        // Bound payloads are parsed by collectRanges wholesale, so their
        // subtree is pruned from the outer walk.
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        stack.push([value, depth + 1]);
      }
    }
    for (const { payload, videoId } of pending) {
      const ranges = collectRanges(payload);
      if (!ranges.length) continue;
      // A payload that names another clip (a preloaded video) is stored under
      // its own id, never under the one being watched.
      storeDeck(videoId || currentVideoId(), ranges);
    }
  }

  function scanNetworkText(text) {
    if (!text || typeof text !== 'string' || !NETWORK_MARKER_HINTS.test(text)) return;
    let root;
    try {
      root = JSON.parse(text);
    } catch (e) {
      return;
    }
    captureFromNetwork(root);
  }

  function installNetworkCapture() {
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (input) {
        const promise = originalFetch.apply(this, arguments);
        try {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/youtubei/v1/') !== -1) {
            promise.then((res) => {
              if (!res || typeof res.clone !== 'function') return;
              try {
                res.clone().text().then(scanNetworkText, () => {});
              } catch (e) {
                // Never break YouTube's own fetch chain.
              }
            }, () => {});
          }
        } catch (e) {
          // Never break YouTube's own fetch chain.
        }
        return promise;
      };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ytAidUrl = typeof url === 'string' ? url : '';
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__ytAidUrl && this.__ytAidUrl.indexOf('/youtubei/v1/') !== -1) {
        this.addEventListener('load', function () {
          try {
            scanNetworkText(this.responseText);
          } catch (e) {
            // Never break YouTube's own XHR handling.
          }
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  // Which clip a page object describes. Only the paths that name the subject of
  // a payload are consulted — a deep search would find a recommended card's id
  // first and throw away the current video's own data.
  const SUBJECT_PATHS = [
    ['videoDetails'],
    ['playerResponse', 'videoDetails'],
    ['initialPlayerResponse', 'videoDetails'],
    ['player', 'videoData', 'videoDetails'],
    ['frameworkUpdates', 'global', 'player', 'videoData', 'videoDetails'],
    ['frameworkUpdates', 'global', 'sharedPlayer', 'videoData', 'videoDetails']
  ];

  function sourceVideoId(root) {
    if (!root || typeof root !== 'object') return '';
    for (const steps of SUBJECT_PATHS) {
      let node = root;
      for (const key of steps) {
        if (!node || typeof node !== 'object') { node = null; break; }
        node = node[key];
      }
      const id = node && node.videoId;
      if (typeof id === 'string' && /^[a-zA-Z0-9_-]{6,11}$/.test(id)) return id;
    }
    return '';
  }

  function readHighlights(videoId) {
    const wanted = videoId || currentVideoId();
    // The player's own marker deck is the freshest answer, and it is keyed to
    // the video YouTube delivered it for.
    const deck = wanted ? markerDecks.get(wanted) : null;
    if (deck && deck.length) return deck;

    const sources = [];
    const app = document.querySelector('ytd-app');
    if (app && app.data) sources.push(app.data);
    const player = getPlayer();
    if (player) {
      ['getPlayerResponse', 'getHeartbeatResponse', 'getWatchNextResponse'].forEach((name) => {
        if (typeof player[name] !== 'function') return;
        try {
          sources.push(player[name]());
        } catch (e) {
          // Player not ready — the remaining sources still cover this video.
        }
      });
    }
    if (window.ytInitialPlayerResponse) sources.push(window.ytInitialPlayerResponse);
    if (window.ytInitialData) sources.push(window.ytInitialData);

    for (const source of sources) {
      // Page objects survive an SPA navigation, so a payload that names a
      // different clip is another video's heat map, not this one's.
      const named = sourceVideoId(source);
      if (wanted && named && named !== wanted) continue;
      const ranges = readFrom(source);
      if (ranges.length) {
        // YouTube prunes these payloads once the player owns the markers, so the
        // answer is kept under the video it was read for instead of being lost.
        storeDeck(wanted, ranges);
        return ranges;
      }
    }
    return [];
  }

  const readMiniplayer = () => {
    const player = document.getElementById('movie_player');
    if (!player || typeof player.setMinimized !== 'function') return null;
    return { player, open: player.classList.contains('ytp-player-minimized') };
  };

  document.addEventListener(REQUEST, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail.reqId !== 'number' || typeof detail.nonce !== 'string') return;

    const answer = (payload) => {
      const data = Object.assign({ reqId: detail.reqId, nonce: detail.nonce }, payload);
      document.dispatchEvent(new CustomEvent(RESPONSE, { detail: data }));
    };

    if (detail.action === 'highlight') {
      return answer({ ok: true, ranges: readHighlights(detail.videoId) });
    }

    if (detail.action === 'miniplayer') {
      const state = readMiniplayer();
      if (!state) return answer({ ok: false, error: 'player-not-ready' });
      const wanted = typeof detail.value === 'boolean' ? detail.value : !state.open;
      try {
        state.player.setMinimized(wanted);
      } catch (e) {
        return answer({ ok: false, error: 'apply-failed', minimized: state.open });
      }
      if (!wanted) {
        answer({ ok: true, minimized: false });
        return;
      }
      // Opening: give the corner UI a beat to mount, then verify it really
      // did. When the player minimises but the miniplayer never renders
      // (e.g. clicked during a preroll ad) the controls would just vanish —
      // hand the player back so the toolbar stays usable.
      setTimeout(() => {
        const minimized = state.player.classList.contains('ytp-player-minimized');
        const ui = document.querySelector('.ytp-miniplayer-ui');
        const uiVisible = !!(ui && getComputedStyle(ui).display !== 'none');
        if (minimized && !uiVisible) {
          try {
            state.player.setMinimized(false);
          } catch (e) {
            // YouTube will settle the state itself.
          }
          answer({ ok: false, error: 'dock-missing', minimized: false });
          return;
        }
        answer({ ok: true, minimized });
      }, 1200);
      return;
    }

    if (detail.action !== 'quality') return answer({ ok: false, error: 'unknown-action' });

    const before = readQuality();
    if (!before) return answer({ ok: false, error: 'player-not-ready' });

    if (detail.level) {
      const player = getPlayer();
      try {
        // Range pins both ends so the adaptive player cannot drift away from
        // the level the user asked for; the plain call covers the same-video
        // switch. Either may be ignored by the player, hence the read-back.
        player.setPlaybackQualityRange(detail.level);
        player.setPlaybackQuality(detail.level);
      } catch (e) {
        return answer({ ok: false, error: 'apply-failed', levels: before.levels, current: before.current });
      }
    }

    const after = readQuality();
    answer({ ok: true, levels: after.levels, current: after.current });
  }, true);
})();
