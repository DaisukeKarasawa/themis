# AGENTS.md

Instructions for Cursor agents working in this repository. Before making changes, state the goal, verification method, and stop conditions.

## Project overview

A wrapper that queries each frame of work videos with a local small VLM (Qwen3-VL / Apple Silicon / mlx-vlm) and interactively verifies SOP compliance on `replay.html`. `draft.html` generates check-item drafts from video; after editing, they can be passed to `replay.html`.

| Path | Role |
|---|---|
| `server.py` | HTTP server that serves `replay.html` / `draft.html` and calls VLM / judgment via `/api/vlm/analyze`, `/api/vlm/draft`, `/api/judge`, etc. |
| `vlm_backend.py` | Bridge to `small_vlm_video_analysis`'s `Observer` (closed observation + free-form draft generation) |
| `draft_normalize.py` | Normalizes VLM draft JSON (into the `replay.html` editor shape) |
| `run.sh` | Starts `.venv/bin/python3 server.py` |
| `replay.html` | Browser UI shell (frame playback + VLM Q&A + PASS/FAIL judgment). CSS/JS live under `static/` |
| `draft.html` | Browser UI shell (SOP draft generation from video, editing, handoff to the check screen) |
| `static/css/` / `static/js/` | Demo UI CSS and ES modules (served via `/static/`) |
| `small_vlm_video_analysis/` | Core observe / judge pipeline (originally from a separate repository) |
| `requirements.txt` | Root dependencies (mlx-vlm, opencv-python, etc.) |

## Constraints

- **Target OS**: macOS (Apple Silicon). mlx-vlm assumes Apple Silicon.
- **Python**: 3.10+. The root project uses `.venv` (referenced by `run.sh` / `server.py`).
- **Separation of observation and judgment**: The VLM answers frame-level questions only. PASS/FAIL judgment uses a deterministic rule engine (`judge.py`). `replay.html` displays Python judgment results via `/api/judge` and does not judge on the browser side. Draft generation (`/api/vlm/draft`) is free-form generation on the wrapper side and is not used for judgment.
- **Terminology**: `questions` / `answers` / `events` / `relations`. Do not use the legacy term `cue`.
- **Nested Git**: If `small_vlm_video_analysis/.git` remains, the parent repository treats it as a submodule. To unify into a single repository, remove the nested `.git` or formally submodule it.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8765` | HTTP server port |
| `VLM_MODEL` | `4b` | `2b` / `4b` or a Hugging Face model ID |
| `VLM_SRC` | `small_vlm_video_analysis/src` | Path to the Observer module |
| `VLM_UPSTREAM_URL` | (empty) | When set, proxy to upstream instead of using the local VLM |
| `VLM_USE_MOCK` | (empty) | Mock responses when `1` / `true` / `yes` |
| `VLM_SKIP_VENV` | (empty) | `1` skips re-exec into venv |

## Development and verification

```bash
# Initial setup
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -r small_vlm_video_analysis/requirements.txt

# Start server
./run.sh

# small_vlm_video_analysis regression (no VLM required)
cd small_vlm_video_analysis && ../.venv/bin/python3 -m pytest
python src/cli.py judge \
  --sop examples/konro_inspection/sop.yaml \
  --answer-log examples/konro_inspection/sample_output/answer_log.json
```

Minimum checks after changes:

1. `../.venv/bin/python3 -m pytest` passes in `small_vlm_video_analysis`
2. `.venv/bin/python3 -m pytest tests/test_server.py tests/test_draft_normalize.py tests/test_vlm_backend_answers.py` passes at the repo root
3. PASS is maintained with the VLM-less `judge` command
4. `./run.sh` starts the server and `replay.html` opens (verify on device when VLM changes)

## Implementation guidelines

- **Minimal diff**: Do not mix responsibilities between the wrapper (`server.py`, `vlm_backend.py`, `replay.html`) and the core (`small_vlm_video_analysis/src/`).
- **Imports**: Place at module top (no inline imports).
- **Output artifacts**: CLI results go under `out/`. Not Git-tracked (listed in `.gitignore`).
- **SOP YAML**: `values: ["yes", "no"]` must be quoted (bare yes/no become YAML booleans).
- **Metal GPU Hang**: Rare during mlx-vlm runs. `answer_log` is saved incrementally, so reruns can resume.

## Requirement Definition Gate

Before implementation, organize the following. Resolve unknowns with `AskQuestion` before starting.

- `Goal` / `Scope` / `Acceptance criteria` / `Constraints` / `Validation` / `Open questions`

Do not enter implementation planning or code changes while requirements are undefined.

## Git / commits

- Commit only when the user explicitly asks.
- GPG signing is forbidden. Do not use `-S` / `--gpg-sign`. Do not fall back to `--no-gpg-sign` on signing failure. Use plain `git commit -m "..."` only.
- Do not commit `.venv/`, `__pycache__/`, `out/`, `.env`, `.cursor/hooks/state/`.
- If a path is clearly not needed in Git, add it to `.gitignore` without asking.

## Agent operations

- The main agent acts as manager. It only handles task organization, splitting, orchestration, requirement confirmation, assignment, review coordination, and final summary. It does not directly perform execution tasks such as commits, reviews, verification, tests, documentation edits, or code changes.
- Delegate execution tasks (implementation, verification, investigation, commits, reviews, etc.) to appropriate subagents whenever possible. This is the standard way to complete tasks, not an optional exploration tool. The main agent defines scope, split strategy, instructions, and acceptance criteria; delegates execution and result reporting.
- Break tasks into pieces, route them to appropriate subagents, and harness each subagent so it stays on purpose.
- Use model `composer-2.5` for subagents.

## Learned User Preferences

- Agent-facing repository information (`AGENTS.md` and similar agent instructions) should be written in English. User-facing demo UI copy stays Japanese unless a specific preference says otherwise. Chat replies to the human may follow the user's language.
- When asking the user questions (especially fixed choices or requirement elicitation), when waiting for an answer blocks work, or when requirements are unclear, use `AskQuestion` (Cursor's structured question UI) instead of numbered choices in chat. Fall back to a short prose question only when AskQuestion is unavailable in the session.
- Commit only when the user explicitly asks.
- Do not GPG-sign commits (permanent policy). Do not use `-S` / `--gpg-sign` / `--no-gpg-sign`. If global `commit.gpgsign=true` causes pinentry failure, use `git -c commit.gpgsign=false commit` for unsigned commits. Do not mention GPG repair, re-signing, or rebase-to-sign unless the user explicitly asks. Even if `/commit` or similar commands require signing, this repository does not sign.
- Update `AGENTS.md` when durable preferences or facts emerge (do not forget).
- Add paths that clearly do not need Git to `.gitignore` (do not forget).
- In the demo UI, keep the main line (video settings, check items, CTA) always visible. Fold non-primary features such as scenario presets, `実行履歴`, and judgment rules (events, relations) into `<details>` collapsed by default. Judgment rules use nested `<details>` inside check-item cards.
- The demo targets non-engineers. Embed contextual help in `replay.html` (speech-bubble icon beside blocks → click for popover, concise non-technical copy). Help buttons are icon-only (hide the `説明` label; keep `aria-label`). Do not add help to `デモの進め方`, `デモシナリオ`, or `実行履歴` on the setup screen; `フレーム再生` or `実行履歴` on the results screen; or `判定結果（PASS/FAIL・確認率）` in the header.
- Demo UI judgment labels use English PASS/FAIL (relations badges use PASS/FAIL, not OK/NG). The relations summary is only `n / total ルールを満たしています`; do not append `（n 件の問題）`. Do not show coverage notes on the relations results panel (e.g. `※ 必要イベントの未検出あり（coverage n%）`); header coverage display and history coverage metadata are allowed.

## Learned Workspace Facts

- Root `.gitignore` excludes Python artifacts, secrets (`.env`), macOS/editor files, `.cursor/hooks/state/`, run output (`out/`, `*.log`, `/data/`), and ML caches (`.cache/`, `models/`).
- `small_vlm_video_analysis/.git` is nested. Before the first commit, decide whether to unify into a single repo (remove nested `.git`) or submodule it.
- Default VLM source resolution order (when `VLM_SRC` is unset): in-project `small_vlm_video_analysis/src` → sibling `../small_vlm_video_analysis/src`.
- Remote `origin` is `https://github.com/DaisukeKarasawa/themis.git` (repo name `themis`); default branch is `main`. Local working directory is `~/study/themis` (formerly `video-analysis`). Wrapper development proceeds on feature branches such as `feat/vlm-replay-wrapper`.
- Demo SOP presets are only `desk_task` and `desk_cleanup_check`, embedded in `SOP_ASSETS` in `static/js/replay/presets.js`. Advanced settings use `eventDefs` and `relations` (`before` / `overlaps` / `not`).
- `#setupPanel` order: 0. `デモの進め方` (always visible) → 1. video and analysis settings → 2. check items (with collapsed judgment rules inside: events, relations) → collapsed (`デモシナリオ`, `実行履歴`). History summary is only `実行履歴` (no count suffix).
- `replay.html` page width is controlled by `:root` `--page-max-width` (e.g. `min(1680px, calc(100vw - 32px))`). Do not use the old fixed `1180px` cap.
- On the replay screen, `section.left` (video, controls) is sticky; `section.right` drives vertical scroll in normal flow.
- Relations PASS/FAIL results are shown visually at the bottom of replay `section.right` (near `チェック項目の結果` and event detection).
- Results screen `section.right` headings are `チェック項目の結果`, `イベント検出`, and `relations の結果`.
- `replay.html` can show spatial grounding evidence boxes for yes answers (`ground_for` from `/api/vlm/analyze`; yes only during analysis, on-demand on scrub when missing). Judgment uses `answers` only; bbox is for explanation.
- Static assets live under `static/css` and `static/js` and are served from `/static/` by `server.py` (path traversal rejected).
- The browser analyze UI trusts server `{answers, groundings}` and does not re-parse VLM raw text (`readAnalyzeResponse` in `static/js/replay/analysis.js`).
- `replay.html` replay history stores the latest 5 entries in localStorage key `videoAnalysis.replayHistory.v3`, keeping the full analysis `result` (including frames). `表示` restores the replay view via `showReplay`. v2-compatible entries without `relationResults` fall back to summary alert; no silent re-judgment (backfill). Large base64 frames may cause localStorage save failures due to quota.
- `draft.html` generates SOP drafts from video frames (max 8) via `/api/vlm/draft`. `questions` are required; `eventDefs` / `relations` are best-effort suggestions (UI shows `要確認`). Handoff to the check screen uses localStorage key `videoAnalysis.sopDraft.v1` + `/replay.html?from=draft`. The draft page does not perform PASS/FAIL judgment.
- The draft prompt (`vlm_backend.build_draft_prompt`) prioritizes actions, states, and hand–object relationships; de-prioritizes existence-only checks like “is X placed there”. Includes good/bad examples. Suggests eventDefs/relations only when order is visible across multiple frames. UI hints in `draft.html` follow the same policy. No mechanical filter for existence checks (prompt guidance only).
- Design specs and implementation plans live under `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## References

- Pipeline details: `small_vlm_video_analysis/README.md`
- Design principles and pitfalls: `small_vlm_video_analysis/CLAUDE.md`
