#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x .venv/bin/python3 ]]; then
  echo "Missing .venv — run:" >&2
  echo "  python3 -m venv .venv" >&2
  echo "  .venv/bin/pip install -r requirements.txt -r small_vlm_video_analysis/requirements.txt" >&2
  exit 1
fi

_mock="${VLM_USE_MOCK:-}"
_upstream="${VLM_UPSTREAM_URL:-}"
_use_light_deps=0
if [[ -n "$_upstream" ]]; then
  _use_light_deps=1
elif [[ "$_mock" == "1" || "$_mock" == "true" || "$_mock" == "yes" ]]; then
  _use_light_deps=1
fi

if [[ "$_use_light_deps" == 1 ]]; then
  if ! .venv/bin/python3 -c "import yaml" >/dev/null 2>&1; then
    echo "Installing Python dependencies (mock/upstream mode)..." >&2
    .venv/bin/pip install 'pyyaml>=6.0'
  fi
else
  if ! .venv/bin/python3 -c "import yaml, cv2, mlx, mlx_vlm" >/dev/null 2>&1; then
    echo "Installing Python dependencies..." >&2
    .venv/bin/pip install -r requirements.txt -r small_vlm_video_analysis/requirements.txt
  fi
fi

exec .venv/bin/python3 server.py "$@"
