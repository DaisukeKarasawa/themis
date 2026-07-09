# video-analysis

作業動画の各フレームをローカル小型 VLM（Qwen3-VL / Apple Silicon / mlx-vlm）に問い合わせ、`replay.html` 上で SOP 準拠を確認するラッパー。

## 前提

- macOS（Apple Silicon）
- Python 3.10+

## セットアップ

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -r small_vlm_video_analysis/requirements.txt
```

## 起動

```bash
./run.sh
```

ブラウザで表示された `http://127.0.0.1:PORT/replay.html` を開く。`file://` では動作しない。

## 主な API

| エンドポイント | 用途 |
|---|---|
| `GET /replay.html` | ブラウザ UI |
| `GET /api/status` | VLM モード・ready 状態 |
| `POST /api/warmup` | モデル事前ロード |
| `POST /api/vlm/analyze` | 1 フレームの VLM 質問回答 |
| `POST /api/judge` | Python `judge.py` による PASS/FAIL 判定 |

PASS/FAIL はブラウザ内では計算せず、`/api/judge` 経由で `small_vlm_video_analysis/src/judge.py` に委ねる。

## 検証

```bash
.venv/bin/python3 -m pytest small_vlm_video_analysis/tests tests/test_server.py -q
node tests/replay_history.test.js

cd small_vlm_video_analysis
../.venv/bin/python3 src/cli.py judge \
  --sop examples/konro_inspection/sop.yaml \
  --answer-log examples/konro_inspection/sample_output/answer_log.json
```

## 環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| `PORT` | `8765` | HTTP サーバーポート |
| `VLM_MODEL` | `4b` | `2b` / `4b` または Hugging Face モデル ID |
| `VLM_USE_MOCK` | （空） | `1` で全回答 `no` のモック |
| `VLM_UPSTREAM_URL` | （空） | 外部 VLM プロキシ先 |

詳細は [AGENTS.md](AGENTS.md) と [small_vlm_video_analysis/README.md](small_vlm_video_analysis/README.md) を参照。
