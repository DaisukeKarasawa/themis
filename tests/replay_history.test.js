const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const replayHtml = fs.readFileSync("replay.html", "utf8");
const historyJs = fs.readFileSync("static/js/replay/history.js", "utf8");
const replayJsFiles = fs
  .readdirSync("static/js/replay")
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join("static/js/replay", name), "utf8"));
const bundle = [replayHtml, historyJs, ...replayJsFiles].join("\n");

function extractFromHistory(name) {
  const patterns = [`export function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = historyJs.indexOf(pattern);
    if (start !== -1) {
      start = historyJs.indexOf("function ", start);
      break;
    }
  }
  assert.notStrictEqual(start, -1, `${name} is missing from history.js`);

  let depth = 0;
  let seenBody = false;
  for (let i = start; i < historyJs.length; i++) {
    if (historyJs[i] === "{") {
      depth++;
      seenBody = true;
    } else if (historyJs[i] === "}") {
      depth--;
      if (seenBody && depth === 0) {
        return historyJs.slice(start, i + 1);
      }
    }
  }
  throw new Error(`${name} body was not closed`);
}

assert.match(bundle, /const HISTORY_LIMIT = 5;/, "history limit should be 5");
assert.match(
  bundle,
  /const HISTORY_STORAGE_KEY = "videoAnalysis.replayHistory.v3";/,
  "history storage key should be v3"
);
assert.doesNotMatch(bundle, /function detectEvents\(/, "browser judge detectEvents should be removed");
assert.match(bundle, /function judgeViaServer\(/, "server judge bridge should exist");
assert.match(bundle, /function analyzeFrameGrounding\(/, "grounding API helper should exist");
assert.match(replayHtml, /id="groundingToggle"/, "grounding toggle should exist");
assert.match(replayHtml, /data-help="evidence-region"/, "grounding help topic should exist");
assert.doesNotMatch(bundle, /function ensureRelationResults\(/, "relation result backfill should be removed");
assert.doesNotMatch(bundle, /function needsRelationBackfill\(/, "relation backfill detection should be removed");
assert.doesNotMatch(bundle, /function patchHistoryEntryResult\(/, "history relation backfill persistence should be removed");
assert.doesNotMatch(bundle, /function parseVlmResponse\(/, "parseVlmResponse should be removed");
assert.doesNotMatch(bundle, /function normalizeAnalyzeResponse\(/, "normalizeAnalyzeResponse should be removed");
assert.match(bundle, /function readAnalyzeResponse\(/, "readAnalyzeResponse should exist");
assert.match(
  fs.readFileSync("static/js/replay/presets.js", "utf8"),
  /export const SOP_ASSETS = \[[\s\S]*\n\];\s*$/,
  "SOP_ASSETS array must be closed"
);
assert.match(bundle, /id: "desk_task"/, "desk_task preset should exist");
assert.match(bundle, /id: "desk_cleanup_check"/, "desk_cleanup_check preset should exist");
assert.match(
  bundle,
  /fold_handkerchief_action before handkerchief_folded/,
  "desk_cleanup_check should include before relations"
);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`
  const HISTORY_LIMIT = 5;
  ${extractFromHistory("trimHistoryEntries")}
  ${extractFromHistory("createHistoryEntry")}
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
  frames: [{
    image: "data:image/jpeg;base64,AAAA",
    groundings: { knob: { status: "ok", bbox: [0.1, 0.2, 0.4, 0.6], source: "analyze" } }
  }]
});

assert.strictEqual(historyEntry.hasFrames, true, "history entries should retain frames when present");
assert.strictEqual(historyEntry.title, "テストSOP");
assert.ok("result" in historyEntry, "history entries should embed full result payload");
assert.strictEqual(historyEntry.result.frames.length, 1, "result should include frame images");
assert.ok(historyEntry.result.frames[0].groundings?.knob, "result should retain groundings in frames");
assert.ok(!("frames" in historyEntry), "frames should live inside result, not at top level");

console.log("replay history behavior ok");
