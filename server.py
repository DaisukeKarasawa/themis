#!/usr/bin/env python3
"""Serve replay.html and run local Qwen3-VL analysis via small_vlm_video_analysis."""

from __future__ import annotations

import errno
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from judge_bridge import run_judge

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8765"))
VLM_UPSTREAM = os.environ.get("VLM_UPSTREAM_URL", "").strip()
USE_MOCK = os.environ.get("VLM_USE_MOCK", "").strip() in {"1", "true", "yes"}
VENV_PYTHON = ROOT / ".venv" / "bin" / "python3"

MAX_ANALYZE_BODY_BYTES = 10 * 1024 * 1024
MAX_JUDGE_BODY_BYTES = 2 * 1024 * 1024
ANALYZE_MIN_INTERVAL_S = 0.25

ALLOWED_ORIGIN_PREFIXES = (
    "http://127.0.0.1",
    "http://localhost",
    "null",
)


def _reexec_in_venv() -> None:
    """Local VLM needs mlx; re-exec with project .venv when system python lacks it."""
    if os.environ.get("VLM_SKIP_VENV") == "1":
        return
    if VLM_UPSTREAM or USE_MOCK:
        return
    try:
        import mlx.core  # noqa: F401
        return
    except ModuleNotFoundError:
        pass
    if not VENV_PYTHON.is_file():
        return
    if str(ROOT / ".venv") in sys.prefix:
        return
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])


_analyzer = None
_analyzer_error: str | None = None
_analyzer_lock = threading.Lock()
_preload_state = "idle"  # idle | loading | ready | error
_analyze_semaphore = threading.Semaphore(1)
_last_analyze_at = 0.0
_rate_lock = threading.Lock()


def _reset_analyzer_state() -> None:
    global _analyzer, _analyzer_error, _preload_state
    _analyzer = None
    _analyzer_error = None
    _preload_state = "idle"


def warm_up_vlm(force: bool = False) -> None:
    global _preload_state, _analyzer_error
    if USE_MOCK or VLM_UPSTREAM:
        _preload_state = "ready"
        return

    with _analyzer_lock:
        if _preload_state == "loading":
            return
        if _preload_state == "ready" and not force:
            return
        if force:
            _reset_analyzer_state()
        _preload_state = "loading"
        _analyzer_error = None

    try:
        analyzer = get_analyzer(force=force)
        analyzer.warm_up()
        with _analyzer_lock:
            _preload_state = "ready"
        print("[vlm] model ready", flush=True)
    except Exception as exc:
        with _analyzer_lock:
            _analyzer_error = str(exc)
            _preload_state = "error"
        print(f"[vlm] preload failed: {exc}", flush=True)
        raise


def start_preload_thread() -> None:
    if USE_MOCK or VLM_UPSTREAM:
        return
    thread = threading.Thread(target=warm_up_vlm, name="vlm-preload", daemon=True)
    thread.start()


def get_analyzer(force: bool = False):
    global _analyzer, _analyzer_error
    if USE_MOCK or VLM_UPSTREAM:
        return None
    with _analyzer_lock:
        if force:
            _analyzer = None
            _analyzer_error = None
        if _analyzer is not None:
            return _analyzer
        if _analyzer_error is not None and not force:
            raise RuntimeError(_analyzer_error)
        try:
            from vlm_backend import VlmAnalyzer

            _analyzer = VlmAnalyzer()
            return _analyzer
        except Exception as exc:
            _analyzer_error = str(exc)
            raise


def _origin_allowed(origin: str | None) -> bool:
    if not origin:
        return True
    return any(origin == prefix or origin.startswith(f"{prefix}:") for prefix in ALLOWED_ORIGIN_PREFIXES)


def _static_path_allowed(path: str) -> bool:
    clean = path.split("?", 1)[0]
    if clean in {"/", "/replay.html"}:
        return True
    return False


def _resolve_static_file(path: str) -> Path | None:
    clean = path.split("?", 1)[0]
    if clean in {"/", "/replay.html"}:
        target = ROOT / "replay.html"
        return target if target.is_file() else None
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "VideoAnalysisReplay/1.0"

    def _set_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def end_headers(self) -> None:
        self._set_cors_headers()
        super().end_headers()

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin")
        if origin and not _origin_allowed(origin):
            self.send_error(403, "Origin not allowed")
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.rstrip("/") or "/"
        if path == "/api/status":
            self._send_json(api_status())
            return
        if not _static_path_allowed(self.path):
            self.send_error(404, "Not found")
            return
        target = _resolve_static_file(self.path)
        if target is None:
            self.send_error(404, "Not found")
            return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        origin = self.headers.get("Origin")
        if origin and not _origin_allowed(origin):
            self.send_error(403, "Origin not allowed")
            return

        path = self.path.rstrip("/")
        if path == "/api/warmup":
            try:
                warm_up_vlm(force=True)
                self._send_json({"ok": True, "state": _preload_state})
            except Exception as exc:
                self._send_json_error(500, str(exc))
            return

        if path == "/api/judge":
            self._handle_judge()
            return

        if path == "/api/vlm/analyze":
            self._handle_analyze()
            return

        self.send_error(404, "Not found")

    def _read_body(self, max_bytes: int) -> bytes | None:
        length_header = self.headers.get("Content-Length", "0")
        try:
            length = int(length_header)
        except ValueError:
            self.send_error(400, "Invalid Content-Length")
            return None
        if length > max_bytes:
            self.send_error(413, "Payload too large")
            return None
        return self.rfile.read(length)

    def _handle_judge(self) -> None:
        body = self._read_body(MAX_JUDGE_BODY_BYTES)
        if body is None:
            return
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        try:
            result = run_judge(payload)
        except ValueError as exc:
            self._send_json_error(400, str(exc))
            return
        except Exception as exc:
            self._send_json_error(500, str(exc))
            return
        self._send_json(result)

    def _handle_analyze(self) -> None:
        global _last_analyze_at
        body = self._read_body(MAX_ANALYZE_BODY_BYTES)
        if body is None:
            return
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        with _rate_lock:
            now = time.monotonic()
            wait_s = ANALYZE_MIN_INTERVAL_S - (now - _last_analyze_at)
            if wait_s > 0:
                time.sleep(wait_s)
            _last_analyze_at = time.monotonic()

        if not _analyze_semaphore.acquire(blocking=False):
            self._send_json_error(429, "Analyze busy; retry shortly")
            return

        try:
            if VLM_UPSTREAM:
                result = proxy_upstream(payload)
                mode = "proxy"
            elif USE_MOCK:
                result = mock_analyze(payload)
                mode = "mock"
            else:
                warm_up_vlm()
                analyzer = get_analyzer()
                result = analyzer.analyze(payload)
                mode = "vlm"
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            self._send_json_error(exc.code, f"Upstream VLM error: {detail}")
            return
        except urllib.error.URLError as exc:
            self._send_json_error(502, f"Upstream VLM unreachable: {exc.reason}")
            return
        except ValueError as exc:
            self._send_json_error(400, str(exc))
            return
        except Exception as exc:
            self._send_json_error(500, str(exc))
            return
        finally:
            _analyze_semaphore.release()

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Analyze-Mode", mode)
        encoded = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_json_error(self, status: int, message: str) -> None:
        self._send_json({"error": message}, status=status)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - [%s] %s\n" % (self.log_date_time_string(), self.address_string(), fmt % args))


def mock_analyze(payload: dict[str, Any]) -> dict[str, Any]:
    answers = {q["id"]: "no" for q in payload.get("questions", []) if q.get("id")}
    return {"raw": json.dumps(answers, ensure_ascii=False), "answers": answers, "probs": {}}


def proxy_upstream(payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        VLM_UPSTREAM,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        text = resp.read().decode("utf-8")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "answers" in parsed:
            return parsed
    except json.JSONDecodeError:
        pass
    return {"raw": text, "answers": {}, "probs": {}}


def api_status() -> dict[str, Any]:
    if VLM_UPSTREAM:
        return {"mode": "proxy", "upstream": VLM_UPSTREAM}
    if USE_MOCK:
        return {"mode": "mock", "state": "ready"}
    try:
        analyzer = get_analyzer() if _analyzer is not None else None
        return {
            "mode": "vlm",
            "model": analyzer.model_name if analyzer else os.environ.get("VLM_MODEL", "4b"),
            "ready": _preload_state == "ready" and analyzer is not None and analyzer.ready,
            "state": _preload_state,
            "error": _analyzer_error,
        }
    except Exception as exc:
        return {"mode": "error", "message": str(exc), "state": _preload_state}


def create_server(host: str, preferred_port: int) -> tuple[ThreadingHTTPServer, int]:
    last_err: OSError | None = None
    for port in range(preferred_port, preferred_port + 20):
        try:
            return ThreadingHTTPServer((host, port), Handler), port
        except OSError as exc:
            if exc.errno != errno.EADDRINUSE:
                raise
            last_err = exc
    raise SystemExit(
        f"Ports {preferred_port}-{preferred_port + 19} are all in use.\n"
        "Stop the other process or run: PORT=9000 python3 server.py"
    ) from last_err


def main() -> None:
    os.chdir(ROOT)
    server, port = create_server("127.0.0.1", PORT)
    print(f"Serving replay UI from {ROOT / 'replay.html'}", flush=True)
    if port != PORT:
        print(f"Note: port {PORT} is busy; using {port} instead.", flush=True)
    print(f"Open http://127.0.0.1:{port}/replay.html", flush=True)
    print(f"Analyze endpoint: http://127.0.0.1:{port}/api/vlm/analyze", flush=True)
    print(f"Judge endpoint: http://127.0.0.1:{port}/api/judge", flush=True)
    if VLM_UPSTREAM:
        print(f"Proxying VLM requests to: {VLM_UPSTREAM}", flush=True)
    elif USE_MOCK:
        print("Mock mode: /api/vlm/analyze returns all 'no' (unset VLM_USE_MOCK to use local VLM)", flush=True)
    else:
        print("Local VLM mode: preloading Qwen3-VL in background...", flush=True)
        print("Set VLM_MODEL=2b|4b (default 4b)", flush=True)
        start_preload_thread()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    _reexec_in_venv()
    main()
