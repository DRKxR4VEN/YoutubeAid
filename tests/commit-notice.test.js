// Run with: node tests/commit-notice.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function load(stored, respond) {
  let fetches = 0;
  const ctx = {
    console,
    Date,
    fetch: async () => {
      fetches++;
      return respond();
    },
    chrome: {
      declarativeNetRequest: { updateDynamicRules: async () => { } },
      scripting: { getRegisteredContentScripts: async () => [] },
      runtime: { onInstalled: { addListener() { } }, onStartup: { addListener() { } }, onMessage: { addListener() { } } },
      storage: {
        onChanged: { addListener() { } },
        local: {
          get: async (keys) => {
            const out = {};
            for (const key of Array.isArray(keys) ? keys : Object.keys(keys)) if (key in stored) out[key] = stored[key];
            return out;
          },
          set: async (items) => Object.assign(stored, items)
        }
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), ctx);
  return { check: () => vm.runInContext('handleLatestCommit()', ctx), fetches: () => fetches };
}

const commit = (sha, message = 'feat: thing\n\nbody') => ({ ok: true, json: async () => ({ sha, commit: { message } }) });

(async () => {
  // First run records a baseline and stays quiet.
  let stored = {};
  let run = load(stored, () => commit(SHA_A));
  assert.strictEqual((await run.check()).isNew, false);
  assert.strictEqual(stored.seenCommitSha, SHA_A);

  // A newer commit is news: first line only, and the link is built from the validated sha.
  stored = { seenCommitSha: SHA_A };
  run = load(stored, () => commit(SHA_B));
  let res = await run.check();
  assert.strictEqual(res.isNew, true);
  assert.strictEqual(res.message, 'feat: thing');
  assert.strictEqual(res.url, `https://github.com/DRKxR4VEN/YoutubeAid/commit/${SHA_B}`);

  // The answer is cached for an hour, then checked again.
  await run.check();
  assert.strictEqual(run.fetches(), 1);
  stored.latestCommit.checkedAt = Date.now() - 61 * 60 * 1000;
  await run.check();
  assert.strictEqual(run.fetches(), 2);

  // Already seen: no notice.
  stored = { seenCommitSha: SHA_B };
  run = load(stored, () => commit(SHA_B));
  assert.strictEqual((await run.check()).isNew, false);

  // GitHub errors, offline, and malformed data never produce a notice.
  for (const respond of [() => ({ ok: false }), () => { throw new Error('offline'); }, () => commit('../../evil')]) {
    stored = { seenCommitSha: SHA_A };
    run = load(stored, respond);
    assert.strictEqual((await run.check()).isNew, false);
  }

  console.log('commit-notice: all checks passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
