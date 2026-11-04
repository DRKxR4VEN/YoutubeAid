// Run with: node tests/ad-proxy.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeResponse {
  constructor(body) {
    this.body = body;
  }
  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
}

let tickWallCheck;
const loaded = [];
let playerResponse = {};
const fakePlayer = {
  getPlayerResponse: () => playerResponse,
  getPlaylistId: () => 'kept',
  loadVideoById: (id, start) => loaded.push([id, start])
};
const ctx = {
  Response: FakeResponse,
  URLSearchParams,
  location: { search: '?v=abc&t=7' },
  document: { getElementById: () => fakePlayer, querySelector: () => null, documentElement: { toggleAttribute() { } } },
  setInterval: (fn) => { tickWallCheck = fn; }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ad-proxy.js'), 'utf8'), ctx);

const parseInPage = (data) => {
  ctx.input = JSON.stringify(data);
  return JSON.parse(vm.runInContext('JSON.stringify(JSON.parse(input))', ctx));
};

const video = { videoRenderer: { videoId: 'real' } };

// Player response: ad fields go, playback data stays, also when nested under playerResponse.
assert.deepStrictEqual(
  parseInPage({
    streamingData: { formats: [] },
    adPlacements: [{}],
    adSlots: [{ adSlotRenderer: {} }],
    playerAds: [{}],
    adBreakHeartbeatParams: 'x'
  }),
  { streamingData: { formats: [] } }
);
assert.deepStrictEqual(
  parseInPage([{ playerResponse: { videoDetails: { videoId: 'real' }, adPlacements: [{}] } }]),
  [{ playerResponse: { videoDetails: { videoId: 'real' } } }]
);

// Feed, sidebar, masthead and engagement panel: only the ad entries go.
assert.deepStrictEqual(
  parseInPage({
    masthead: { adSlotRenderer: {} },
    contents: [
      { richItemRenderer: { content: video } },
      { richItemRenderer: { content: { adSlotRenderer: {} } } },
      { richSectionRenderer: { content: { statementBannerRenderer: {} } } }
    ],
    results: [{ adSlotRenderer: {} }, video],
    engagementPanels: [
      { engagementPanelSectionListRenderer: { content: { adsEngagementPanelContentRenderer: {} } } },
      { engagementPanelSectionListRenderer: { content: { transcriptRenderer: {} } } }
    ]
  }),
  {
    contents: [{ richItemRenderer: { content: video } }],
    results: [video],
    engagementPanels: [{ engagementPanelSectionListRenderer: { content: { transcriptRenderer: {} } } }]
  }
);

// Shorts: ad entries go, normal entries stay.
const short = { command: { reelWatchEndpoint: { videoId: 'real' } } };
assert.deepStrictEqual(
  parseInPage({ entries: [{ command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } }, short] }),
  { entries: [short] }
);

// YouTube's self-tests must come back intact, or it raises the wall. Three kinds exist today:
// fixed "true" flags, fixed fake responses with a short signature, and text it just stringified itself.
const flagsTest = { adPlacements: true, playerAds: true, playerResponse: { adPlacements: true, playerAds: true } };
assert.deepStrictEqual(parseInPage(flagsTest), flagsTest);
const fakeResponse = {
  playerResponse: {
    responseContext: { mainAppWebResponseContext: { trackingParam: 'dd' } },
    adPlacements: [{}],
    adSlots: [{ adSlotRenderer: {} }],
    playerAds: [{}]
  }
};
assert.deepStrictEqual(parseInPage(fakeResponse), fakeResponse);
const generated = { adPlacements: [{ x: 1 }], adSlots: [{ adSlotRenderer: {} }] };
assert.strictEqual(
  vm.runInContext(`JSON.stringify(JSON.parse(JSON.stringify(${JSON.stringify(generated)})))`, ctx),
  JSON.stringify(generated)
);
// A real response carries a long signature and is still pruned.
assert.deepStrictEqual(
  parseInPage({ responseContext: { mainAppWebResponseContext: { trackingParam: 'x'.repeat(40) } }, adPlacements: [{}] }),
  { responseContext: { mainAppWebResponseContext: { trackingParam: 'x'.repeat(40) } } }
);
const wall = { status: 'ERROR', reason: 'x', errorScreen: { enforcementMessageViewModel: {} } };

// Inline-script globals are pruned on assignment.
vm.runInContext('var ytInitialPlayerResponse = { adSlots: [1], videoDetails: {} };', ctx);
assert.strictEqual(vm.runInContext('JSON.stringify(ytInitialPlayerResponse)', ctx), '{"videoDetails":{}}');

// A malformed body still throws like the native JSON.parse.
assert.throws(() => vm.runInContext('JSON.parse("{")', ctx));

// Player requests are edited; other payloads are not.
const sendPlayerRequest = () => JSON.parse(vm.runInContext(
  'JSON.stringify({ attestationRequest: {}, context: { client: { clientName: "WEB" } }, playbackContext: { contentPlaybackContext: {} } })', ctx));
assert.strictEqual(sendPlayerRequest().params, '8AUB');
assert.strictEqual(
  vm.runInContext('JSON.stringify({ playbackContext: { contentPlaybackContext: {} } })', ctx),
  '{"playbackContext":{"contentPlaybackContext":{}}}'
);

// A healthy player, or an error that isn't the wall, never triggers a retry.
tickWallCheck();
playerResponse = { playabilityStatus: { status: 'UNPLAYABLE', errorScreen: {} } };
tickWallCheck();
assert.strictEqual(loaded.length, 0);

// The wall walks through each edit once, ending with an untouched request, then gives up.
playerResponse = {
  playabilityStatus: {
    status: 'UNPLAYABLE',
    errorScreen: { playerInterstitialRenderer: { content: { interstitialViewModel: { description: { commandRuns: [{ url: 'https://support.google.com/youtube/answer/3037019' }] } } } } }
  }
};
tickWallCheck();
assert.deepStrictEqual(loaded[0], ['abc', 7]);
assert.strictEqual(sendPlayerRequest().params, 'YAHI');
tickWallCheck();
assert.strictEqual(sendPlayerRequest().playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
tickWallCheck();
const untouched = sendPlayerRequest();
assert.deepStrictEqual(untouched.playbackContext.contentPlaybackContext, {});
assert.strictEqual(untouched.params, undefined);
tickWallCheck();
assert.strictEqual(loaded.length, 3);

// The wall as YouTube really sends it (ERROR with enforcementMessageViewModel) is recognized too.
{
  const freshLoaded = [];
  const flags = [];
  let freshResponse = { playabilityStatus: wall };
  const freshCtx = {
    Response: FakeResponse,
    URLSearchParams,
    location: { search: '?v=abc' },
    document: {
      getElementById: () => ({
        getPlayerResponse: () => freshResponse,
        getPlaylistId: () => 'kept',
        loadVideoById: (id, start) => freshLoaded.push([id, start])
      }),
      querySelector: () => ({}), // the wall element is on the page
      documentElement: { toggleAttribute: (name, on) => flags.push([name, on]) }
    },
    setInterval: (fn) => { freshCtx.tick = fn; }
  };
  freshCtx.window = freshCtx;
  vm.createContext(freshCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ad-proxy.js'), 'utf8'), freshCtx);
  freshCtx.tick();
  assert.deepStrictEqual(freshLoaded, [['abc', 0]]);

  // The wall is only hidden once the player itself is healthy.
  assert.deepStrictEqual(flags.at(-1), ['data-yt-aid-wall-cleared', false]);
  freshResponse = { playabilityStatus: { status: 'OK' } };
  freshCtx.tick();
  assert.deepStrictEqual(flags.at(-1), ['data-yt-aid-wall-cleared', true]);
}

// The abnormal-playback handler is swapped out; ordinary callbacks still run.
vm.runInContext(`
  globalThis.abnormal = 0; globalThis.normal = 0;
  Promise.resolve().then(function () { abnormal++; return 'onAbnormalityDetected'; });
  Promise.resolve().then(function () { normal++; });
`, ctx);
setTimeout(() => {
  assert.strictEqual(ctx.abnormal, 0);
  assert.strictEqual(ctx.normal, 1);
  console.log('ad-proxy: all checks passed');
}, 0);
