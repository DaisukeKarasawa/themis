# Replay Mint Accent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Migakun mint accent tokens to `replay.html` title and buttons only, preserving the neutral overall palette.

**Architecture:** Add five CSS custom properties to `:root` in the inline `<style>` block of `replay.html`, then update `header h1`, `button:hover`, and `button.primary` rules. No JS/markup changes. Semantic status colors untouched.

**Tech Stack:** Static HTML/CSS (`replay.html`), local HTTP server (`server.py` / `./run.sh`) for visual check.

**Spec:** `docs/superpowers/specs/2026-07-09-replay-mint-accent-design.md`

---

### Task 1: Add accent CSS variables

**Files:**
- Modify: `replay.html:7-17` (`:root` block)

- [ ] **Step 1: Add tokens after existing semantic variables**

```css
  :root {
    --ok: #1a7f37;
    --ok-bg: #e6f4ea;
    --no: #6b7280;
    --no-bg: #f1f2f4;
    --unclear: #b45309;
    --unclear-bg: #fef3e0;
    --bad: #c0362c;
    --bad-bg: #fbe9e7;
    --line: #ddd;
    --accent-action: #8ee4d4;
    --accent-action-hover: #76d8c4;
    --accent-action-text: #1e5c50;
    --accent-soft: #e6faf5;
    --accent-title: #1e5c50;
  }
```

- [ ] **Step 2: Verify diff touches only `:root`**

Run: `git diff replay.html`
Expected: new accent variables only in this step.

---

### Task 2: Style title and buttons

**Files:**
- Modify: `replay.html:36-111`

- [ ] **Step 1: Title color**

```css
  header h1 { font-size: 17px; margin: 0; font-weight: 600; flex: 1; color: var(--accent-title); }
```

- [ ] **Step 2: Button hover and primary styles**

```css
  button:hover { background: var(--accent-soft); }
  button.primary {
    background: var(--accent-action);
    color: var(--accent-action-text);
    border-color: var(--accent-action-text);
  }
  button.primary:hover { background: var(--accent-action-hover); }
```

- [ ] **Step 3: Confirm semantic badge colors unchanged**

Run: `git diff replay.html | rg "badge|ok|bad|unclear"`
Expected: no changes to `.badge`, `--ok`, `--bad`, `--unclear` rules.

---

### Task 3: Validate

**Files:**
- Test: visual only (no automated CSS test exists)

- [ ] **Step 1: Run server tests (regression guard)**

Run: `pytest tests/test_server.py -q`
Expected: all tests pass (CSS-only change should not affect server).

- [ ] **Step 2: Visual check**

Run: `./run.sh` and open `http://localhost:8765/replay.html`
Expected:
- Title「動画SOPチェックデモ」is dark teal `#1e5c50`
- `#analyzeBtn` is mint with teal text; hover slightly darker mint
- Secondary buttons hover with very light mint `#e6faf5`
- PASS/FAIL badges unchanged

- [ ] **Step 3: Diff scope check**

Run: `git diff --name-only`
Expected: only `replay.html` (plus plan/spec docs if committed separately)

---

### Task 4: Commit (only if user requests)

**Files:**
- Modify: `replay.html`

- [ ] **Step 1: Stage and commit on user request**

```bash
git add replay.html
git -c commit.gpgsign=false commit -m "Apply Migakun mint accent to replay title and buttons"
```
