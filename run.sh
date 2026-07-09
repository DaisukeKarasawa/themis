#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x .venv/bin/python3 ]]; then
  echo "Missing .venv — run:" >&2
  echo "  python3 -m venv .venv" >&2
  echo "  .venv/bin/pip install -r requirements.txt -r small_vlm_video_analysis/requirements.txt" >&2
  exit 1
fi

if ! .venv/bin/python3 -c "import yaml" >/dev/null 2>&1; then
  echo "Installing Python dependencies..." >&2
  .venv/bin/pip install -r requirements.txt -r small_vlm_video_analysis/requirements.txt
fi

exec .venv/bin/python3 server.py "$@"
