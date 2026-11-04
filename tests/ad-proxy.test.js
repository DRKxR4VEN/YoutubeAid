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

const ctx = { Response: FakeResponse };
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

// Inline-script globals are pruned on assignment.
vm.runInContext('var ytInitialPlayerResponse = { adSlots: [1], videoDetails: {} };', ctx);
assert.strictEqual(vm.runInContext('JSON.stringify(ytInitialPlayerResponse)', ctx), '{"videoDetails":{}}');

// A malformed body still throws like the native JSON.parse.
assert.throws(() => vm.runInContext('JSON.parse("{")', ctx));

// Response.json goes through the same pruning.
vm.runInContext('new Response(\'{"adSlots":[1],"ok":true}\').json()', ctx).then((data) => {
  assert.strictEqual(JSON.stringify(data), '{"ok":true}');
  console.log('ad-proxy: all checks passed');
});
