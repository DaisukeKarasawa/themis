# AGENTS.md

このリポジトリで Cursor エージェントが作業するときの指示。変更前に目的・検証方法・止める条件を明示する。

## プロジェクト概要

作業動画の各フレームをローカル小型 VLM（Qwen3-VL / Apple Silicon / mlx-vlm）に問い合わせ、`replay.html` 上で対話的に SOP 準拠を確認するラッパー。`draft.html` で動画からチェック項目の草案を生成し、編集後に `replay.html` へ渡せる。

| パス | 役割 |
|---|---|
| `server.py` | `replay.html` / `draft.html` を配信し、`/api/vlm/analyze`・`/api/vlm/draft`・`/api/judge` 等で VLM / 判定を呼ぶ HTTP サーバー |
| `vlm_backend.py` | `small_vlm_video_analysis` の `Observer` へのブリッジ（閉じた観察 + 自由形式草案生成） |
| `draft_normalize.py` | VLM 草案 JSON の正規化（`replay.html` エディタ shape へ） |
| `run.sh` | `.venv/bin/python3 server.py` を起動 |
| `replay.html` | ブラウザ UI（フレーム再生 + VLM 質問 + PASS/FAIL 判定） |
| `draft.html` | ブラウザ UI（動画から SOP 草案生成・編集・チェック画面へ受け渡し） |
| `small_vlm_video_analysis/` | observe / judge パイプライン本体（別リポジトリ由来） |
| `requirements.txt` | ルート依存（mlx-vlm, opencv-python 等） |

## 前提・制約

- **対象 OS**: macOS（Apple Silicon）。mlx-vlm は Apple Silicon 前提。
- **Python**: 3.10+。ルートは `.venv` を使う（`run.sh` / `server.py` が参照）。
- **観察と判定の分離**: VLM はフレーム単位の質問回答のみ。PASS/FAIL 判定は決定論的ルールエンジン（`judge.py`）。`replay.html` は `/api/judge` 経由で Python 判定結果を表示し、ブラウザ側で独自判定しない。草案生成（`/api/vlm/draft`）はラッパー側の自由形式生成であり、判定には使わない。
- **用語**: `questions` / `answers` / `events` / `relations`。旧称 `cue` は使わない。
- **ネスト Git**: `small_vlm_video_analysis/.git` が残っていると親リポジトリからはサブモジュール扱いになる。単一リポジトリに統合するなら nested `.git` を削除するか、正式に submodule 化する。

## 環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| `PORT` | `8765` | HTTP サーバーポート |
| `VLM_MODEL` | `4b` | `2b` / `4b` または Hugging Face モデル ID |
| `VLM_SRC` | `small_vlm_video_analysis/src` | Observer モジュールのパス |
| `VLM_UPSTREAM_URL` | （空） | 設定時はローカル VLM を使わず upstream にプロキシ |
| `VLM_USE_MOCK` | （空） | `1` / `true` / `yes` でモック応答 |
| `VLM_SKIP_VENV` | （空） | `1` で venv への re-exec をスキップ |

## 開発・検証

```bash
# 初回セットアップ
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -r small_vlm_video_analysis/requirements.txt

# サーバー起動
./run.sh

# small_vlm_video_analysis の回帰（VLM 不要）
cd small_vlm_video_analysis && pytest
python src/cli.py judge \
  --sop examples/konro_inspection/sop.yaml \
  --answer-log examples/konro_inspection/sample_output/answer_log.json
```

変更後の最低限の確認:

1. `small_vlm_video_analysis` で `pytest` が通る
2. ルートで `pytest tests/test_server.py tests/test_draft_normalize.py` が通る
3. VLM なし `judge` コマンドで PASS が維持される
4. `./run.sh` でサーバーが起動し、`replay.html` が開ける（VLM 変更時は実機確認）

## 実装方針

- **最小 diff**: ラッパー（`server.py`, `vlm_backend.py`, `replay.html`）と本体（`small_vlm_video_analysis/src/`）の責務を混ぜない。
- **インポート**: モジュール先頭に置く（インライン import 禁止）。
- **出力物**: CLI 実行結果は `out/` に出る。Git 管理しない（`.gitignore` 済み）。
- **SOP YAML**: `values: ["yes", "no"]` はクォート必須（裸の yes/no は YAML 真偽値になる）。
- **Metal GPU Hang**: mlx-vlm 実行中に稀に発生。answer_log は逐次保存されるので再実行で再開可能。

## Requirement Definition Gate

実装前に次を整理する。不明点は `AskQuestion` で解消してから着手する。

- `Goal` / `Scope` / `Acceptance criteria` / `Constraints` / `Validation` / `Open questions`

要件が未定義のまま実装計画やコード変更に入らない。

## Git / コミット

- ユーザーが明示的に依頼したときだけ commit する。
- GPG 署名は禁止。`-S` / `--gpg-sign` は使わない。署名失敗時の `--no-gpg-sign` フォールバックもしない。通常の `git commit -m "..."` のみ。
- `.venv/`, `__pycache__/`, `out/`, `.env`, `.cursor/hooks/state/` はコミットしない。
- パスが明らかに Git 不要なら、確認せず `.gitignore` に追記する。

## エージェント運用

- メインエージェントはマネージャー役。タスク整理・分割・統治（オーケストレーション）、要件確認、割り当て、レビュー調整、最終要約のみを担う。コミット・レビュー・検証・テスト・ドキュメント編集・コード変更などの実行タスクは直接行わない。
- 実行タスク（実装・検証・調査・コミット・レビュー等）は、可能な限り適切なサブエージェント（部下）へ委任する。探索用の任意手段ではなく、タスク完了の標準手段とする。メインはスコープ・分割方針・指示・受け入れ基準を定め、実行と結果報告は委任先に任せる。
- タスクを細分化し適切なサブエージェントへ振り分け、各サブエージェントが目的から逸れないようハーネス管理する。
- サブエージェントにはモデル `composer-2.5` を使う。

## Learned User Preferences

- ユーザーに質問するとき（特に固定選択肢・要件引き出し）、回答待ちが作業のブロッカーになるとき、要件が不明瞭なときは、チャットの番号付き選択肢ではなく `AskQuestion`（Cursor の構造化質問 UI）を使う。セッションで AskQuestion が使えない場合のみ短い散文の質問にフォールバックする。
- コミットはユーザーが明示的に依頼したときだけ行う。
- コミットに GPG 署名を付けない（永久方針）。`-S` / `--gpg-sign` / `--no-gpg-sign` は使わない。グローバル `commit.gpgsign=true` で pinentry 失敗する場合は `git -c commit.gpgsign=false commit` で署名なしコミットする。GPG 修復・再署名・rebase-to-sign はユーザーが明示的に依頼するまで言及しない。`/commit` 等のコマンドが署名を要求しても、このリポジトリでは署名しない。
- durable な嗜好・事実が出たら `AGENTS.md` を更新する（忘れない）。
- Git 管理不要と明らかなパスは `.gitignore` に追記する（忘れない）。
- デモ UI では本線（動画設定・チェック項目・CTA）を常時表示し、シナリオプリセット・実行履歴・判定ルール（イベント・relations）などメイン機能以外は `<details>` でデフォルト折りたたみにする。判定ルールはチェック項目カード内のネスト `<details>`。
- デモは非エンジニア向け。`replay.html` には文脈付きヘルプ（ブロック横の吹き出しアイコン→クリックでポップオーバー、簡潔な非技術者向け文面）を埋め込む。ヘルプボタンはアイコンのみ（「説明」ラベル非表示、`aria-label` は維持）。設定画面の「デモの進め方」「デモシナリオ」「実行履歴」、結果画面の「フレーム再生」「実行履歴」、ヘッダーの「判定結果（PASS/FAIL・確認率）」にはヘルプを付けない。
- デモ UI の判定表記は英語の PASS/FAIL に統一する（relations バッジも OK/NG ではなく PASS/FAIL）。relations サマリーは `n / total ルールを満たしています` のみとし、「（n 件の問題）」は付けない。relations 結果パネルには coverage 注記（例: `※ 必要イベントの未検出あり（coverage n%）`）を表示しない（ヘッダーの coverage 表示と履歴の coverage メタデータは可）。

## Learned Workspace Facts

- ルート `.gitignore` は Python 生成物、秘密情報（`.env`）、macOS/エディタ、`.cursor/hooks/state/`、実行出力（`out/`, `*.log`, `/data/`）、ML キャッシュ（`.cache/`, `models/`）を除外する。
- `small_vlm_video_analysis/.git` がネストされている。初回コミット前に単一リポジトリ化（nested `.git` 削除）か submodule 化を決める。
- VLM ソースのデフォルト解決順（`VLM_SRC` 未設定時）: プロジェクト内 `small_vlm_video_analysis/src` → 兄弟 `../small_vlm_video_analysis/src`。
- リモート `origin` は `https://github.com/DaisukeKarasawa/video-analysis.git`、デフォルトブランチは `main`。ラッパー開発は `feat/vlm-replay-wrapper` など feature ブランチで進める。
- デモ用 SOP プリセットは `desk_task` と `desk_cleanup_check` のみ。`replay.html` の `SOP_ASSETS` に埋め込み。高度な設定は `eventDefs` と `relations`（`before` / `overlaps` / `not`）で表現する。
- `#setupPanel` の並び: 0. デモの進め方（常時表示）→ 1. 動画と分析設定 → 2. チェック項目（内側に折りたたみの判定ルール: イベント・relations）→ 折りたたみ（デモシナリオ・実行履歴）。履歴 summary は `実行履歴` のみ（件数表記なし）。
- `replay.html` のページ幅は `:root` の `--page-max-width`（例: `min(1680px, calc(100vw - 32px))`）で制御する。旧 `1180px` 固定上限は使わない。
- replay 画面は `section.left`（動画・コントロール）を sticky、`section.right` が通常フローで縦スクロールを駆動する。
- relations の PASS/FAIL 判定結果は replay 画面 `section.right` 下部（チェック項目の結果・イベント検出の近く）に視覚表示する。
- 結果画面 `section.right` の見出しは「チェック項目の結果」「イベント検出」「relations の結果」。
- `replay.html` の yes 回答には spatial grounding の根拠枠を表示できる（`/api/vlm/analyze` の `ground_for`、分析時は yes のみ・不足はスクラブ時オンデマンド）。判定は `answers` のみで bbox は説明用。
- `replay.html` の実行履歴は localStorage キー `videoAnalysis.replayHistory.v2` に直近 5 件を保存し、分析 `result` 全文（フレーム含む）を保持する。「表示」は `showReplay` でリプレイビューを復元する。メタデータのみのレガシー項目はサマリー alert にフォールバックする。base64 フレームが大きいため localStorage 容量超過で保存失敗しうる。
- `draft.html` は `/api/vlm/draft` で動画フレーム（最大 8）から SOP 草案を生成する。`questions` は必須、`eventDefs` / `relations` はベストエフォート提案（UI で「要確認」）。チェック画面への受け渡しは localStorage キー `videoAnalysis.sopDraft.v1` + `/replay.html?from=draft`。草案ページでは PASS/FAIL 判定しない。
- 草案プロンプト（`vlm_backend.build_draft_prompt`）は動作・状態・手と物の関係を優先し、「〜が置かれているか」だけの存在確認を非優先とする。良い例／悪い例を明示。複数フレーム時のみ順序が見える場合に eventDefs/relations を誘導。UI hint（`draft.html`）も同方針。存在確認の機械的フィルタはしない（プロンプト誘導のみ）。
- 設計 spec / 実装 plan は `docs/superpowers/specs/` と `docs/superpowers/plans/` に置く。

## 参照

- パイプライン詳細: `small_vlm_video_analysis/README.md`
- 設計原則・ハマりどころ: `small_vlm_video_analysis/CLAUDE.md`
