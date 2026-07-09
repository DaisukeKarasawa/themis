const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("replay.html", "utf8");

function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} is missing`);

  let depth = 0;
  let seenBody = false;
  for (let i = start; i < html.length; i++) {
    if (html[i] === "{") {
      depth++;
      seenBody = true;
    } else if (html[i] === "}") {
      depth--;
      if (seenBody && depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }
  throw new Error(`${name} body was not closed`);
}

assert.match(html, /const HISTORY_LIMIT = 5;/, "history limit should be 5");
assert.match(html, /const HISTORY_STORAGE_KEY = "videoAnalysis.replayHistory.v2";/, "history storage key should be v2");
assert.doesNotMatch(html, /function detectEvents\(/, "browser judge detectEvents should be removed");
assert.match(html, /function judgeViaServer\(/, "server judge bridge should exist");
assert.match(html, /id: "konro_inspection"/, "konro preset should exist");
assert.match(html, /min_frames: 2/, "konro preset should include min_frames overrides");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`
  const HISTORY_LIMIT = 5;
  ${extract("trimHistoryEntries")}
  ${extract("createHistoryEntry")}
`, sandbox);

const entries = Array.from({ length: 6 }, (_, i) => ({ id: `run-${i + 1}` }));
const trimmed = sandbox.trimHistoryEntries(entries);

assert.deepStrictEqual(
  trimmed.map(entry => entry.id),
  ["run-6", "run-5", "run-4", "run-3", "run-2"],
  "history should keep the latest 5 entries in newest-first order"
);

const historyEntry = sandbox.createHistoryEntry({
  sop: { name: "テストSOP" },
  verdict: "PASS",
  coverage: 1,
  n_frames: 12,
  violations: [],
  events: { step_1: { start_idx: 0, end_idx: 2, t: 1.0 } },
  frames: [{ image: "data:image/jpeg;base64,AAAA" }]
});

assert.strictEqual(historyEntry.hasFrames, true, "history entries should retain frames when present");
assert.strictEqual(historyEntry.title, "テストSOP");
assert.ok("result" in historyEntry, "history entries should embed full result payload");
assert.strictEqual(historyEntry.result.frames.length, 1, "result should include frame images");
assert.ok(!("frames" in historyEntry), "frames should live inside result, not at top level");

console.log("replay history behavior ok");
