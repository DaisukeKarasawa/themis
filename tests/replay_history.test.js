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

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`
  const HISTORY_LIMIT = 5;
  ${extract("trimHistoryEntries")}
`, sandbox);

const entries = Array.from({ length: 6 }, (_, i) => ({ id: `run-${i + 1}` }));
const trimmed = sandbox.trimHistoryEntries(entries);

assert.deepStrictEqual(
  trimmed.map(entry => entry.id),
  ["run-6", "run-5", "run-4", "run-3", "run-2"],
  "history should keep the latest 5 entries in newest-first order"
);

console.log("replay history behavior ok");
