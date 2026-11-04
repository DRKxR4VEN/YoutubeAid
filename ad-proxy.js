/**
 * YouTube Aid - Ad proxy
 * Runs in the page's MAIN world at document_start, only while "enableAdProxy" is on
 * (registered by background.js). Wraps JSON.parse in a JS Proxy so ad data is gone
 * from YouTube's responses before the player or the page read them.
 */
(() => {
  // Player response fields; removing them leaves the rest of the parent object intact.
  const AD_FIELDS = new Set(['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams']);

  // Renderers that make the feed/sidebar entry holding them an ad.
  const AD_RENDERERS = new Set([
    'adSlotRenderer',
    'inFeedAdLayoutRenderer',
    'displayAdRenderer',
    'promotedSparklesWebRenderer',
    'promotedSparklesTextSearchRenderer',
    'promotedVideoRenderer',
    'compactPromotedVideoRenderer',
    'bannerPromoRenderer',
    'statementBannerRenderer',
    'companionSlotRenderer',
    'actionCompanionAdRenderer',
    'adsEngagementPanelContentRenderer'
  ]);

  // An ad renderer directly on the entry, or wrapped as richItemRenderer.content and the like.
  function isAdEntry(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.command?.reelWatchEndpoint?.adClientParams?.isAd) return true; // Shorts ad
    return Object.keys(node).some((key) => {
      if (AD_RENDERERS.has(key)) return true;
      const content = node[key]?.content;
      return !!content && Object.keys(content).some((inner) => AD_RENDERERS.has(inner));
    });
  }

  function strip(node) {
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (isAdEntry(node[i])) node.splice(i, 1);
        else strip(node[i]);
      }
    } else if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        // YouTube's fixed self-tests use "adPlacements":true; real ad data is never a bare true.
        const adField = AD_FIELDS.has(key) && node[key] !== true;
        if (adField || AD_RENDERERS.has(key) || isAdEntry(node[key])) delete node[key];
        else strip(node[key]);
      }
    }
  }

  function prune(value) {
    try {
      strip(value);
    } catch (e) { } // a parse must never fail because of us
    return value;
  }

  // YouTube parses fake player responses and shows the wall if their ad data goes missing. Those are text
  // the page just serialised itself, or fixed strings with a short fake signature (real ones are long).
  // shortcut: fingerprints YouTube's current self-tests, recheck the j.s_ signal if the wall returns.
  let ownText = '';
  const isSelfTest = (text) => text === ownText || /"trackingParam":"[^"]{0,19}"/.test(text);

  JSON.parse = new Proxy(JSON.parse, {
    apply: (target, self, args) => {
      const value = Reflect.apply(target, self, args);
      return isSelfTest(args[0]) ? value : prune(value);
    }
  });

  // Player request edits the server tends to answer without ads; the wall moves on to the next one.
  const PLAYER_REQUEST_EDITS = [
    (body, playback) => {
      body.params = '8AUB';
      playback.lactMilliseconds = String(Date.now());
    },
    (body) => {
      body.params = 'YAHI';
    },
    (body, playback) => {
      playback.isInlinePlaybackNoAd = true;
      playback.lactMilliseconds = String(Date.now());
    },
    () => { } // all failed: send the request untouched
  ];
  let requestEdit = 0;

  JSON.stringify = new Proxy(JSON.stringify, {
    apply: (target, self, args) => {
      const body = args[0];
      const playback = body?.attestationRequest && body.playbackContext?.contentPlaybackContext;
      if (playback) PLAYER_REQUEST_EDITS[requestEdit](body, playback);
      const text = Reflect.apply(target, self, args);
      if (text?.includes('"adPlacements"')) ownText = text;
      return text;
    }
  });

  // YouTube registers its abnormal-playback handler, which can raise the wall, through a promise callback.
  Promise.prototype.then = new Proxy(Promise.prototype.then, {
    apply: (target, self, args) => {
      if (typeof args[0] === 'function' && Function.prototype.toString.call(args[0]).includes('onAbnormalityDetected')) {
        args[0] = () => { };
      }
      return Reflect.apply(target, self, args);
    }
  });

  const WALL_HELP_URL = 'https://support.google.com/youtube/answer/3037019';
  let restorePlaylist = false;

  // The first page load's player data can't be edited, so a wall there is retried with an edited request.
  function handleWall() {
    const player = document.getElementById('movie_player');
    if (!player?.getPlayerResponse) return;
    const params = new URLSearchParams(location.search);
    const status = player.getPlayerResponse()?.playabilityStatus;

    // The page keeps showing the wall after the player recovers; styles.css hides it on this flag.
    document.documentElement.toggleAttribute(
      'data-yt-aid-wall-cleared',
      status?.status === 'OK' && !!document.querySelector('ytd-enforcement-message-view-model')
    );

    // loadVideoById detaches the player from the playlist, which would stop autoplay.
    if (restorePlaylist && params.has('list') && player.getPlaylistId?.() === null && player.getCurrentTime?.() > 0.1) {
      restorePlaylist = false;
      const manager = document.querySelector('yt-playlist-manager');
      const playlist = manager?.getPlaylistData?.();
      if (playlist) {
        manager.setPlaylistData?.(playlist);
        manager.setPlayerPlaybackControlData?.({ playlistPanelRenderer: playlist });
      }
    }

    if (requestEdit >= PLAYER_REQUEST_EDITS.length - 1) return;
    const screen = status?.errorScreen;
    const links = JSON.stringify(
      screen?.playerErrorMessageRenderer?.subreason?.runs ||
      screen?.playerInterstitialRenderer?.content?.interstitialViewModel?.description?.commandRuns
    );
    const isWall = !!screen?.enforcementMessageViewModel || (status?.status === 'UNPLAYABLE' && links?.includes(WALL_HELP_URL));
    if (!isWall || !params.has('v')) return;

    requestEdit++;
    restorePlaylist = true;
    player.loadVideoById(params.get('v'), parseInt(params.get('t'), 10) || 0);
  }

  setInterval(handleWall, 1000);

  // First page load: these arrive as object literals in inline scripts, not through a parse.
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    let value;
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => value,
      set: (next) => {
        value = prune(next);
      }
    });
  }
})();
