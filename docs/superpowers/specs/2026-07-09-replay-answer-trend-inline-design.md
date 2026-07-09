# Replay 回答傾向インライン化 — design

**Date:** 2026-07-09  
**Branch:** `feat/vlm-replay-wrapper`  
**Status:** Approved for implementation (Approach A)  
**Related:** ブレインストーミングで採択した **Approach A**（専用セクション削除 + 質問行インライン表示）

---

## Goal

リプレイ画面で「全フレームの回答傾向」を独立した大きなセクションとして表示するのをやめ、各質問行（`qrow`）の直下に控えめな 1 行メタ（例: `yes 12/17`）として示す。ユーザーが必要とする情報（全フレームにおける yes 件数）は維持しつつ、画面の視覚的優先度を下げる。

**Approach A との対応:** 専用 `h2` + `#analysisSummary` を削除し、集計は既存の `summarizeDetection` / `DATA.detection.stats` を再利用して `renderQuestions` 内でインライン表示する。

---

## Context (current behavior)

| 要素 | 現状 |
|------|------|
| 集計ロジック | `summarizeDetection(frames, questions)` が各質問の `yesCount` / `total` を算出し、`DATA.detection` に格納 |
| 集計ソース | フレーム回答 `answers[q.id] === "yes"`。イベント検出結果ではない |
| 表示 | `h2「全フレームの回答傾向」` の下、`#analysisSummary`（`summary-card`）に全項目を列挙 |
| 警告 | `allNo`（全質問で yes=0）時、同カード内に赤字の注意文（モック／設定ミス検知の役割） |

マークアップ位置（`replay.html` 右カラム）:

```
このフレームの回答
  #questions (.qrow × N)
全フレームの回答傾向        ← 削除対象
  #analysisSummary          ← 削除対象
イベント検出（回答との対応）
  #events
```

---

## Scope

### In scope

1. **専用セクションの削除**
   - `h2「全フレームの回答傾向」` と `#analysisSummary` の HTML を削除
   - `renderAnalysisSummary()` の呼び出しを削除（関数本体は削除または `allNo` 警告専用に縮小）

2. **質問行へのインライン集計**
   - `renderQuestions(frame)` で各 `qrow` に、対応する `DATA.detection.stats` エントリから `yes ${yesCount}/${total}` を muted 1 行で追加
   - 表示例: `yes 12/17`（プレフィックス `yes`、区切り `/`、既存 stats の数値をそのまま使用）

3. **`allNo` 警告の移設**
   - `DATA.detection.allNo === true` のときのみ、「このフレームの回答」`h2` の直下に短い警告を表示
   - 文言の役割は現行 `renderAnalysisSummary` の `allNo` 分支を維持（モックモード／前提説明・質問文・サンプリング間隔の見直しを促す）

4. **スタイル**
   - 新規クラス（例: `.qrow-meta`）を `<style>` に追加。既存 `.hint`（`font-size: 12px; color: #888`）と同等の控えめトーン
   - `qrow` レイアウトは flex のまま。メタ行は質問テキストの下または行内の副情報として視覚的に従属させる

### Out of scope

- イベント検出 UI（`#events`）、判定バッジ／`judge` 結果、relations、スクラバー／再生挙動
- サーバー API（`/api/judge`, `/api/vlm/analyze` 等）
- 集計セマンティクスの変更（yes の定義、フレーム除外ルール等）
- 新規アナリティクス、グラフ、イベント連動の傾向表示

---

## Proposed UI (Approach A)

### Before

```
## このフレームの回答
[qrow] 項目 q1  …  yes
[qrow] 項目 q2  …  no

## 全フレームの回答傾向
[summary-card]
  項目 q1: yes が 12/17 フレーム - …
  項目 q2: yes が 0/17 フレーム - …
  (allNo 時) 全フレームで全項目 no です。…

## イベント検出
```

### After

```
## このフレームの回答
(allNo 時のみ) [警告] 全フレームで全項目 no です。モックモードか、…

[qrow]
  項目 q1  …  yes
  yes 12/17                    ← muted meta

[qrow]
  項目 q2  …  no
  yes 0/17

## イベント検出
```

---

## Likely files and touch points

| ファイル | 変更内容 |
|----------|----------|
| `replay.html`（HTML） | `h2「全フレームの回答傾向」` と `#analysisSummary` 削除。`#questions` の直上または `h2` 直後に `allNo` 用コンテナ（例: `#allNoWarning`）を追加する案 |
| `replay.html`（CSS） | `.qrow-meta`（または既存 `.hint` 流用）のスタイル。必要なら `.qrow` を `flex-direction: column` + 上段 flex 行に分割 |
| `replay.html`（JS） | `renderQuestions`: `DATA.detection.stats` から `q.id` で lookup しメタ行を出力。`renderAnalysisSummary`: 削除または `allNo` 警告のみに変更。`showReplay`: `renderAnalysisSummary()` 呼び出しの整理 |

**変更しないもの:** `summarizeDetection`, `buildAnalysisResult`, `judgeViaServer`, `renderEvents`, `renderViolations`, `render()`, サーバー側 Python。

---

## Acceptance criteria

- [ ] 「全フレームの回答傾向」見出しと `#analysisSummary` カードがリプレイ画面に表示されない
- [ ] 各 `qrow` に、その質問の全フレーム yes 件数が `yes N/M` 形式で控えめに表示される（`N` = `yesCount`, `M` = `total`）
- [ ] インライン数値は `DATA.detection.stats`（`summarizeDetection` 由来）と一致する
- [ ] 全質問で yes=0 のとき、「このフレームの回答」見出し直下に `allNo` 警告が表示される（現行と同等の検知・案内役割）
- [ ] フレーム切り替え（スクラバー／再生）で、インライン集計は変わらず、当該フレームの pill のみが更新される
- [ ] イベント検出・違反一覧・relations・判定バッジの表示と挙動が変更前と同一
- [ ] サーバー API や Python コードに diff がない

---

## Constraints

- **単一ファイル変更:** 実装は原則 `replay.html` のみ（HTML / CSS / JS）
- **データ契約維持:** `DATA.detection` の shape（`{ stats, allNo }`）は変更しない
- **最小 diff:** 集計ロジックの再実装や新 API は不要
- **視覚的従属:** インライン meta は本文・pill より目立たない（muted、小さめフォント）

---

## Validation

1. **目視（リプレイ UI）**
   - `./run.sh` でサーバー起動し、デモ SOP + 動画（またはモック）で分析 → リプレイ表示
   - 専用セクションが無いこと、各 `qrow` に `yes N/M` があること
   - フレーム送りで pill のみ変化し、`yes N/M` は固定であること
   - モック／全 no 条件で `allNo` 警告が「このフレームの回答」直下に出ること

2. **回帰テスト（ロジック無変更の確認）**
   ```bash
   pytest tests/test_server.py
   cd small_vlm_video_analysis && pytest
   ```
   いずれもパスすること（サーバー・judge パイプラインに手を入れないため）。

3. **diff 確認**
   - `git diff` が `replay.html` のみであること（本実装コミット時）

---

## Implementation notes

- `renderQuestions` はフレームごとに呼ばれるが、集計はフレーム非依存。`DATA.detection.stats` は `showReplay` 時に一度計算済みなので、lookup のみでよい
- `renderAnalysisSummary` を完全削除する場合、`allNo` 表示は `showReplay` + 専用小関数、または `renderQuestions` の前段で 1 回だけ描画するパターンが自然
- `.summary-card` スタイルは他で未使用なら削除可能（未使用 CSS の整理は任意・本スコープ外でも可）
- 履歴から `showReplay` した場合も `DATA.detection` が復元されていれば同様に表示される（履歴 payload に `detection` が含まれる前提は現行と同じ）

---

## Open questions

なし（Approach A で要件確定済み）。

---

## Traceability

| 要件（Approach A） | 本 spec の節 |
|--------------------|--------------|
| 専用セクション削除 | Scope §1, Proposed UI, Acceptance criteria 1 |
| qrow インライン `yes N/M` | Scope §2, Likely files, Acceptance criteria 2–3 |
| `allNo` 警告のみ移設 | Scope §3, Proposed UI, Acceptance criteria 4 |
| イベント／judge／relations／再生は不変 | Out of scope, Constraints, Acceptance criteria 5–6 |

---

## Follow-up (separate change)

本ドキュメントは設計のみ。実装は別コミットで `replay.html` を上記どおり更新する。
