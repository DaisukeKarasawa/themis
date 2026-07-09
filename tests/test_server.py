"""server.py の judge API とセキュリティ制約の回帰テスト。"""
from __future__ import annotations

import importlib
import json
import os
import socket
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_SOP = ROOT / "small_vlm_video_analysis" / "examples" / "konro_inspection" / "sop.yaml"
ANSWER_LOG = (
    ROOT
    / "small_vlm_video_analysis"
    / "examples"
    / "konro_inspection"
    / "sample_output"
    / "answer_log.json"
)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _post_json(url: str, payload: dict, headers: dict | None = None) -> tuple[int, dict | str]:
    data = json.dumps(payload).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, body


@pytest.fixture()
def mock_server(monkeypatch):
    monkeypatch.setenv("VLM_USE_MOCK", "1")
    monkeypatch.setenv("VLM_SKIP_VENV", "1")
    import server

    importlib.reload(server)
    port = _free_port()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}", server
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)


def test_serves_replay_html_only(mock_server):
    base, _ = mock_server
    with urllib.request.urlopen(f"{base}/replay.html", timeout=5) as resp:
        assert resp.status == 200
        assert "動画SOPチェックデモ" in resp.read().decode("utf-8")

    with pytest.raises(urllib.error.HTTPError) as denied:
        urllib.request.urlopen(f"{base}/server.py", timeout=5)
    assert denied.value.code == 404

    with pytest.raises(urllib.error.HTTPError) as dot_denied:
        urllib.request.urlopen(f"{base}/.env", timeout=5)
    assert dot_denied.value.code == 404


def test_analyze_endpoint_uses_api_path(mock_server):
    base, _ = mock_server
    status, body = _post_json(
        f"{base}/api/vlm/analyze",
        {
            "image": "data:image/jpeg;base64,/9j/4AAQ",
            "questions": [{"id": "q1", "ask": "test", "values": ["yes", "no"]}],
            "t": 0,
        },
        headers={"Origin": "http://127.0.0.1:8765"},
    )
    assert status == 200
    assert body["answers"]["q1"] == "no"


def test_analyze_rejects_question_missing_id():
    import vlm_backend

    analyzer = vlm_backend.VlmAnalyzer()
    with pytest.raises(ValueError, match="non-empty id"):
        analyzer.analyze(
            {
                "image": "data:image/jpeg;base64,/9j/4AAQ",
                "questions": [{"ask": "test", "values": ["yes", "no"]}],
                "t": 0,
            }
        )


def test_judge_endpoint_returns_python_verdict(mock_server):
    base, _ = mock_server
    import yaml

    sop_def = yaml.safe_load(EXAMPLE_SOP.read_text(encoding="utf-8"))
    frames = json.loads(ANSWER_LOG.read_text(encoding="utf-8"))
    judge_frames = [
        {"idx": f["idx"], "t": f["t"], "answers": {k: v["argmax"] for k, v in f["confidence"].items()}}
        for f in frames
    ]
    status, body = _post_json(
        f"{base}/api/judge",
        {"sop_def": sop_def, "frames": judge_frames},
        headers={"Origin": "http://127.0.0.1:8765"},
    )
    assert status == 200
    assert body["verdict"] == "PASS"
    assert body["coverage"] == 1.0
    assert body["violations"] == []
    assert len(body["relation_results"]) == len(sop_def["relations"])
    assert all(r["passed"] for r in body["relation_results"])


def test_rejects_oversized_payload(mock_server):
    base, _ = mock_server
    payload = json.dumps(
        {"image": "x", "questions": [{"id": "q", "ask": "?", "values": ["yes", "no"]}]}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/api/vlm/analyze",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(11 * 1024 * 1024),
            "Origin": "http://127.0.0.1:8765",
        },
        method="POST",
    )
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=10)
    assert exc.value.code == 413


def test_cors_blocks_unlisted_origin(mock_server):
    base, _ = mock_server
    status, _ = _post_json(
        f"{base}/api/vlm/analyze",
        {
            "image": "data:image/jpeg;base64,/9j/4AAQ",
            "questions": [{"id": "q1", "ask": "test", "values": ["yes", "no"]}],
        },
        headers={"Origin": "https://evil.example"},
    )
    assert status == 403


def test_judge_honors_event_min_frames(mock_server):
    base, _ = mock_server
    sop_def = {
        "sop": {"id": "min_frames_case", "name": "min_frames_case"},
        "questions": [{"id": "knob", "ask": "?", "values": ["yes", "no"]}],
        "events": {"ignite": {"evidence": "knob==yes", "min_frames": 2}},
        "relations": [],
        "defaults": {"min_frames": 1, "max_gap_frames": 0},
    }
    frames = [
        {"idx": 0, "t": 0.0, "answers": {"knob": "yes"}},
        {"idx": 1, "t": 1.0, "answers": {"knob": "no"}},
    ]
    status, body = _post_json(
        f"{base}/api/judge",
        {"sop_def": sop_def, "frames": frames},
        headers={"Origin": "http://127.0.0.1:8765"},
    )
    assert status == 200
    assert body["verdict"] == "FAIL"
    assert body["events"]["ignite"]["start_idx"] is None
