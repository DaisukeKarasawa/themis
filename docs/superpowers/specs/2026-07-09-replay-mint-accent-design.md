# Replay UI mint accent (minimal) — design

**Date:** 2026-07-09  
**Branch:** `feat/vlm-replay-wrapper`  
**Status:** Approved for implementation (CSS-only follow-up)

---

## Goal

`replay.html` の全体トーンは現状のニュートラル（背景 `#f7f7f5`、本文 `#1c1c1c`、カード白）を維持する。Migakun ブランドのミント／ティールは **タイトル文字色** と **プライマリボタン（CTA）** のアクセントにだけ使う。グラデーションや全面リテーマは行わない。

---

## Reference

`~/dev/migakun-operations` ブランチ `feature/mynavi-cleaning-compensation-webapp-gas` の  
`web/mynavi-cleaning-compensation/Styles.html` に定義されているトークンを流用する。

| Token | Value | 用途（本変更） |
|-------|-------|----------------|
| `--accent-action` | `#8ee4d4` | プライマリボタン背景 |
| `--accent-action-hover` | `#76d8c4` | プライマリボタン hover 背景 |
| `--accent-action-text` | `#1e5c50` | プライマリボタン文字・ボーダー |
| `--accent-soft` | `#e6faf5` | 通常ボタン hover 背景 |
| `--accent-title` | `#1e5c50` | ヘッダータイトル（`--accent-action-text` と同色） |

---

## Scope

### In scope

- **対象ファイル:** `replay.html` 内 `<style>` ブロックのみ
- **`:root` に CSS 変数を追加**（上表の 5 トークン）
- **適用箇所:**

  1. **`header h1`** — `color: var(--accent-title);`
  2. **`button.primary`** — ミント塗り、ティール文字、hover はやや濃いミント、ボーダーはミント系（`--accent-action-text`）
  3. **`button:hover`（デフォルト）** — `background: var(--accent-soft);`（ごく薄いミント）

### Out of scope

- ページ背景、カード、本文テキスト色
- PASS / FAIL / unclear など **意味論的ステータス色**（`--ok`, `--bad`, `--unclear` 等は変更しない）
- アクティブ選択のボーダー、フォーカスリング、プログレスバー、プレイヘッド
- グラデーション
- JS / マークアップ変更（既存クラス `primary` はそのまま利用）

---

## Current state (baseline)

`replay.html` 冒頭の `:root` にはステータス用変数のみ:

```css
:root {
  --ok: #1a7f37;
  --ok-bg: #e6f4ea;
  /* ... --no, --unclear, --bad, --line ... */
}
```

ボタンはニュートラル:

```css
button:hover { background: #f0f0f0; }
button.primary {
  background: #1c1c1c;
  color: #fff;
  border-color: #1c1c1c;
}
button.primary:hover { background: #333; }
```

`header h1` は色未指定（本文 `#1c1c1c` を継承）。

---

## Proposed CSS (implementation sketch)

`:root` への追加:

```css
:root {
  /* existing semantic tokens unchanged */
  --accent-action: #8ee4d4;
  --accent-action-hover: #76d8c4;
  --accent-action-text: #1e5c50;
  --accent-soft: #e6faf5;
  --accent-title: #1e5c50;
}
```

差し替え・追加ルール:

```css
header h1 {
  color: var(--accent-title);
  /* keep existing: font-size, margin, font-weight, flex */
}

button:hover {
  background: var(--accent-soft);
}

button.primary {
  background: var(--accent-action);
  color: var(--accent-action-text);
  border-color: var(--accent-action-text);
}

button.primary:hover {
  background: var(--accent-action-hover);
}
```

**維持するもの:** `button` の `font-size`, `padding`, `border-radius`, `cursor`、および `button:disabled` の挙動。

---

## Acceptance criteria

- [ ] 画面全体は引き続きニュートラルに見える（背景・カード・本文は現状のまま）
- [ ] ヘッダー `h1`（「動画SOPチェックデモ」）が控えめなティール（`#1e5c50`）で読める
- [ ] `.primary` ボタン（例: 解析開始、セットアップへ戻る等）がミント塗り＋ティール文字で、hover で少し濃いミントになる
- [ ] 通常ボタンの hover がごく薄いミント（`#e6faf5`）になる
- [ ] グラデーションなし（フラット色のみ）
- [ ] PASS / FAIL / pending バッジ、テーブル、タイムライン等の **セマンティック色は変更前と同一**

---

## Validation

1. `./run.sh` でサーバー起動し、ブラウザで `replay.html` を開く
2. セットアップ画面・リプレイ画面の両方で以下を目視確認:
   - タイトル色
   - プライマリ CTA の通常 / hover
   - セカンダリボタンの hover
   - PASS/FAIL バッジ色が変わっていないこと
3. `git diff` が `replay.html` の `<style>` 内 CSS のみであること

---

## Non-goals / constraints

- アプリ全体のリテーマはしない
- 「営業資料っぽい」過剰ブランディングにしない（アクセントはタイトル＋CTA＋軽い hover のみ）
- フラットカラーのみ（`linear-gradient` 等は使わない）
- 新規依存・ビルドステップは追加しない

---

## Implementation notes

- 色の単一ソースは `:root` の CSS 変数。将来のトーン調整は変数だけ触ればよい
- 既存の `button.primary` クラスをそのまま使う（HTML 変更不要）
- `button.primary:hover` では文字色・ボーダー色は変えず、背景のみ `--accent-action-hover` にする
- 通常 `button:hover` を `--accent-soft` にすると、プライマリの hover より詳細度が低いため、`button.primary:hover` が優先される（意図どおり）
- コントラスト: ティール文字 on ミント背景は Migakun 既存 Web と同系。WCAG 厳密準拠は本スコープ外（デモ UI の控えめアクセント）

---

## Follow-up (separate change)

本ドキュメントは設計のみ。実装は別コミットで `replay.html` の `<style>` を上記スケッチどおり更新する。
