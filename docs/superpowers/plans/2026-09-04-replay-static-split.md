# Replay static split and contract repayment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repay the maintainability debt from the thermo-nuclear review without changing demo behavior: split the 2798-line `replay.html`, delete draft/replay clones, make the server the answers contract owner, and drop in-flow history backfill.

**Architecture:** `server.py` serves `/static/{css,js}/**` with path-traversal rejection. HTML pages become markup shells. Shared video/editor/guard helpers live in ES modules. Replay JS is split by ownership (`state`, `presets`, `help`, `history`, `setup`, `analysis`, `grounding`, `view`, `main`). Browser analyze handling trusts `{answers, raw, probs, groundings}` and does not re-parse VLM text.

**Tech Stack:** stdlib `http.server`, vanilla ES modules (no bundler), existing pytest + `node tests/replay_history.test.js`.

## Debt Repayment Brief

- Current understanding: wrapper pages are demo shells; VLM answers are a server contract; setup / analysis / replay / grounding / history are separate ownerships; draft and replay share frame extraction and SOP editor rows.
- System mismatch: one HTML file owns every concern; near-duplicate helpers drift; answers are salvaged in browser, wrapper, and pipeline.
- Interest being paid: every UI or response-shape change hits two HTML files and a god script.
- Recommended repayment: static split + shared modules + server-owned answers + history v3.
- Why this is the smallest useful step: no bundler, no pipeline/viewer merge, no `sop.py` deletion.
- Behavior preservation: same APIs, same UI flows, same mock/judge results. Legacy v2 history without `relationResults` becomes a summary alert instead of silent re-judge.
- Verification: pytest server/draft tests, node history test, browser smoke of `/replay.html` and `/draft.html`.
- What would overturn this: an explicit product decision that single-file HTML is a hard constraint, or a need to keep v2 backfill forever.

## Global Constraints

- No bundler, no new npm/Python dependencies.
- Do not mix wrapper files with `small_vlm_video_analysis/src/` or `tools/replay_viewer/`.
- Do not delete `sop.py` answer-log parsing.
- Do not commit unless the user later asks.
- Imports at module top (Python). No inline `import json` in `draft_normalize.py`.
- Demo copy, PASS/FAIL wording, help-button rules, and folded `<details>` stay as they are.
- `file://` still shows the warning and disables generate/analyze.
- Each new JS/CSS file must stay under 1000 lines (prefer under 500).
- `replay.html` and `draft.html` must end under 1000 lines (prefer markup-only shells).
- Move existing functions; do not rewrite behavior while moving.

## File map

```
static/css/replay.css
static/css/draft.css
static/js/shared/html.js
static/js/shared/video-frames.js
static/js/shared/demo-guards.js
static/js/shared/sop-editor.js
static/js/replay/state.js
static/js/replay/presets.js
static/js/replay/help.js
static/js/replay/history.js
static/js/replay/grounding.js
static/js/replay/analysis.js
static/js/replay/view.js
static/js/replay/setup.js
static/js/replay/main.js
static/js/draft/main.js
```

`common.css` is optional. Duplicated tokens in `replay.css` / `draft.css` are acceptable.

---

### Task 1: Serve `/static` safely

**Files:**
- Modify: `server.py` (`_static_path_allowed`, `_resolve_static_file`, `do_GET`)
- Modify: `tests/test_server.py`
- Create: `static/js/shared/html.js` (needed so the new test has a real file)

**Interfaces:**
- Consumes: existing HTML allowlist
- Produces: GET `/static/...` for `.css` / `.js` under `ROOT/static` only

- [ ] **Step 1: Write the failing test**

Add to `tests/test_server.py`:

```python
def test_serves_static_assets_and_rejects_traversal(mock_server):
    base, _ = mock_server
    with urllib.request.urlopen(f"{base}/static/js/shared/html.js", timeout=5) as resp:
        assert resp.status == 200
        body = resp.read().decode("utf-8")
        assert "escapeHtml" in body
        assert resp.headers.get_content_type() in {"text/javascript", "application/javascript"}

    with pytest.raises(urllib.error.HTTPError) as denied:
        urllib.request.urlopen(f"{base}/static/../server.py", timeout=5)
    assert denied.value.code == 404

    with pytest.raises(urllib.error.HTTPError) as missing:
        urllib.request.urlopen(f"{base}/static/js/does-not-exist.js", timeout=5)
    assert missing.value.code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python3 -m pytest tests/test_server.py::test_serves_static_assets_and_rejects_traversal -q`
Expected: FAIL (404 or missing file)

- [ ] **Step 3: Implement serving + `escapeHtml`**

Replace static helpers in `server.py` with:

```python
STATIC_ROOT = ROOT / "static"
STATIC_HTML_PAGES = {
    "/": "replay.html",
    "/replay.html": "replay.html",
    "/draft.html": "draft.html",
}
_STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
}


def _static_path_allowed(path: str) -> bool:
    clean = path.split("?", 1)[0]
    if clean.rstrip("/") in STATIC_HTML_PAGES or clean in STATIC_HTML_PAGES:
        return True
    return clean.startswith("/static/")


def _resolve_static_file(path: str) -> Path | None:
    clean = path.split("?", 1)[0]
    page_key = clean.rstrip("/") or "/"
    filename = STATIC_HTML_PAGES.get(clean) or STATIC_HTML_PAGES.get(page_key)
    if filename:
        target = ROOT / filename
        return target if target.is_file() else None
    if not clean.startswith("/static/"):
        return None
    rel = clean[len("/static/") :]
    if not rel or ".." in Path(rel).parts:
        return None
    target = (STATIC_ROOT / rel).resolve()
    try:
        target.relative_to(STATIC_ROOT.resolve())
    except ValueError:
        return None
    if target.is_file() and target.suffix in _STATIC_TYPES:
        return target
    return None
```

In `do_GET`, set `Content-Type` from `_STATIC_TYPES[target.suffix]` instead of always `text/html`.

Keep `do_GET` path normalization from treating `/static/js/shared/html.js` as `/static/js/shared/html.js` — **do not `rstrip("/")` in a way that breaks files**. Apply `rstrip("/")` only for API/html page keys, not for `/static/` files.

`static/js/shared/html.js`:

```javascript
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Run tests**

Run: `.venv/bin/python3 -m pytest tests/test_server.py -q`
Expected: PASS

- [ ] **Step 5: Do not commit**

---

### Task 2: Shared JS + HTML shells + replay modules

**Files:**
- Create: remaining `static/js/**` and `static/css/**` from the file map
- Modify: `replay.html`, `draft.html` (remove inline `<style>` and `<script>` bodies)
- Modify: `tests/replay_history.test.js`

**Interfaces:**

`static/js/shared/video-frames.js`

```javascript
export function waitForVideoEvent(target, eventName) { /* existing */ }

export async function extractFrames(videoFile, intervalSec, options = {}) {
  const { signal, onProgress, frameExtra } = options;
  // Move replay.html seek-skip loop (lines 1836-1882).
  // Always wait for seeked when currentTime differs by > 1e-3.
  // Push { idx: frames.length, t, image, ...frameExtra?.() }.
  // Call onProgress?.(frames.length, totalSteps, label) when provided.
}
```

`static/js/shared/demo-guards.js`

```javascript
export const isFileProtocol = window.location.protocol === "file:";

export function initFileProtocolGuard({ warningEl, disableEls = [] }) { /* existing */ }

export async function initAnalyzeModeBanner({ warningWrap, warningText, mockMessage }) { /* existing fetch /api/status */ }
```

`static/js/shared/sop-editor.js`

```javascript
export function renderQuestionsEditor(questions, { tbody, includeValues = false, onChange }) { }

export function renderEventsEditor(eventDefs, { tbody, includeMinFrames = false, onChange }) { }
```

Replay uses `includeValues: true` and `includeMinFrames: true`. Draft uses both false (ID + ask; name + evidence + occurrence only). Mutate the given arrays in place, same as today.

`static/js/replay/state.js` holds mutable session fields now at `replay.html` 1347-1354 and 1676-1681 (`DATA`, `idx`, `playing`, `editorState`, `groundingInFlight`, etc.).

`static/js/replay/analysis.js` **must delete** `parseVlmResponse` and the 4-step `normalizeAnalyzeResponse`. Replace with:

```javascript
export function readAnalyzeResponse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("VLM応答が不正です");
  }
  const answers = data.answers && typeof data.answers === "object" ? data.answers : {};
  const groundings = data.groundings && typeof data.groundings === "object" ? data.groundings : {};
  if (Object.keys(answers).length === 0 && Object.keys(groundings).length === 0) {
    const preview = String(data.raw || JSON.stringify(data)).slice(0, 400);
    throw new Error("VLM応答に answers がありません\nraw preview: " + preview);
  }
  return {
    answers,
    raw: data.raw || JSON.stringify(answers, null, 2),
    probs: data.probs || {},
    groundings
  };
}
```

`analyzeFrame` uses `readAnalyzeResponse` only.

Grounding: one module. Export `analyzeFrameGrounding`, `mergeGroundingEntries`, `ensureFrameGroundings`, `renderGroundingOverlays`. Analyze loop and scrub toggle both call `ensureFrameGroundings` / `analyzeFrameGrounding` from this module only.

History: `HISTORY_STORAGE_KEY = "videoAnalysis.replayHistory.v3"`. Delete `needsRelationBackfill`, `ensureRelationResults`, `patchHistoryEntryResult`. `showReplay` mounts once. If a stored entry has no `result.relationResults` while `result.relations` is non-empty, `renderHistoryList` uses the existing summary-alert path instead of `showReplay`. `createHistoryEntry` still embeds full `result`.

`replay.html` / `draft.html` head:

```html
<link rel="stylesheet" href="/static/css/replay.css">
<script type="module" src="/static/js/replay/main.js"></script>
```

(draft uses draft.css / draft/main.js)

- [ ] **Step 1: Move CSS verbatim** from each HTML `<style>` block.
- [ ] **Step 2: Move JS by ownership.** Do not invent new behavior. Wire `main.js` event listeners exactly as the current bottom of `replay.html` / `draft.html`.
- [ ] **Step 3: Update `tests/replay_history.test.js`** to read `static/js/replay/history.js` (strip `export` for `vm` if needed) and scan `replay.html` + `static/js/replay/*.js` as one bundle for string assertions. Assert v3 key. Assert `ensureRelationResults` / `needsRelationBackfill` / `patchHistoryEntryResult` / `parseVlmResponse` / `normalizeAnalyzeResponse` are **absent**. Keep `judgeViaServer`, `analyzeFrameGrounding`, grounding toggle, desk presets, no `detectEvents`.
- [ ] **Step 4: Run**

```bash
.venv/bin/python3 -m pytest tests/test_server.py tests/test_draft_normalize.py -q
node tests/replay_history.test.js
```

Expected: PASS. `wc -l replay.html draft.html static/js/replay/*.js` — no file over 1000.

- [ ] **Step 5: Do not commit**

---

### Task 3: Slim Python salvage and analyze/draft dispatch

**Files:**
- Modify: `draft_normalize.py`
- Modify: `server.py` (`_handle_analyze`, `_handle_draft`)
- Test: `tests/test_draft_normalize.py` (keep truncated + fence tests)

**Interfaces:**
- `extract_json_object`: fence strip, then for each slice try `json.loads(candidate)` then `json.loads(_close_truncated_json(candidate))`. Delete `_fix_trailing_commas` if unused. `import json` at module top.
- Shared dispatch helper inside `server.py` only (no `server/` package):

```python
def _run_vlm_job(payload: dict[str, Any], kind: str) -> tuple[dict[str, Any], str]:
    if kind not in {"analyze", "draft"}:
        raise ValueError(f"unknown vlm job: {kind}")
    if VLM_UPSTREAM:
        result = proxy_upstream(payload) if kind == "analyze" else proxy_upstream_draft(payload)
        return result, "proxy"
    if USE_MOCK:
        result = mock_analyze(payload) if kind == "analyze" else mock_draft(payload)
        return result, "mock"
    warm_up_vlm()
    analyzer = get_analyzer()
    result = analyzer.analyze(payload) if kind == "analyze" else analyzer.draft(payload)
    return result, "vlm"
```

Handlers keep their own body/rate/semaphore/validation. Only the mode branch is shared.

- [ ] **Step 1: Keep existing truncated/fence tests (already failing if you delete too much).**
- [ ] **Step 2: Implement slim extract + dispatch.**
- [ ] **Step 3: Run** `.venv/bin/python3 -m pytest tests/test_draft_normalize.py tests/test_server.py tests/test_draft_prompt.py -q`
- [ ] **Step 4: Do not commit**

---

### Task 4: Docs + line-count gate

**Files:**
- Modify: `AGENTS.md` Learned Workspace Facts
- Modify: `README.md` only if static serving needs a one-line mention (skip if unnecessary)

Add facts:
- Static assets live under `static/css` and `static/js` and are served from `/static/`.
- Replay history key is `videoAnalysis.replayHistory.v3`. v2 entries without `relationResults` show a summary alert, not a silent re-judge.
- Browser analyze UI trusts server `{answers, groundings}` and does not parse VLM raw text.

- [ ] **Step 1: Update AGENTS.md**
- [ ] **Step 2: Confirm `wc -l` gates**
- [ ] **Step 3: Do not commit**

---

## Validation

```bash
.venv/bin/python3 -m pytest tests/test_server.py tests/test_draft_normalize.py tests/test_draft_prompt.py -q
node tests/replay_history.test.js
cd small_vlm_video_analysis && ../.venv/bin/python3 -m pytest -q
```

Browser (mock server is enough):
1. Open `/replay.html` — title, setup cards, mint primary button, help icons, presets, history `<details>` still work.
2. Open `/draft.html` — generate button, file input, nav to チェック.
3. Confirm CSS loaded (mint title `#1e5c50`, not unstyled).
4. Confirm module errors in console are absent.

## Out of scope

- `small_vlm_video_analysis/tools/replay_viewer` unification
- Moving `buildSopDef` into Python
- `ReplaySession` class
- Splitting `server.py` into a package
- Deleting `vlm_backend._parse_answers_from_raw` (wrapper salvage may remain)
- Commits / PR
