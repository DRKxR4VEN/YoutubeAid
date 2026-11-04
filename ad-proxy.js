/**
 * YouTube Aid - Ad proxy
 * Runs in the page's MAIN world at document_start, only while "enableAdProxy" is on
 * (registered by background.js). Wraps JSON.parse and Response.json in JS Proxies so
 * ad data is gone from YouTube's responses before the player or the page read them.
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
        if (AD_FIELDS.has(key) || AD_RENDERERS.has(key) || isAdEntry(node[key])) delete node[key];
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

  JSON.parse = new Proxy(JSON.parse, {
    apply: (target, self, args) => prune(Reflect.apply(target, self, args))
  });

  Response.prototype.json = new Proxy(Response.prototype.json, {
    apply: (target, self, args) => Reflect.apply(target, self, args).then(prune)
  });

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
