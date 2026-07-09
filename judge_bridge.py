"""Bridge replay.html -> small_vlm_video_analysis judge (deterministic PASS/FAIL)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def _default_judge_src() -> Path:
    candidates = (
        ROOT / "small_vlm_video_analysis" / "src",
        ROOT.parent / "small_vlm_video_analysis" / "src",
    )
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[0]


JUDGE_SRC = Path(os.environ.get("VLM_SRC", _default_judge_src()))


def _ensure_judge_src() -> None:
    if not JUDGE_SRC.is_dir():
        raise RuntimeError(f"judge source not found: {JUDGE_SRC}")
    src = str(JUDGE_SRC)
    if src not in sys.path:
        sys.path.insert(0, src)


def _event_evidence(event_defs: dict[str, Any], name: str) -> str:
    spec = event_defs.get(name, {})
    if isinstance(spec, str):
        return spec
    if isinstance(spec, dict):
        return str(spec.get("evidence", ""))
    return ""


def _serialize_run(run: Any | None, evidence: str) -> dict[str, Any]:
    if run is None:
        return {
            "evidence": evidence,
            "start_idx": None,
            "end_idx": None,
            "t": None,
            "hits": 0,
        }
    return {
        "evidence": evidence,
        "start_idx": run.start_idx,
        "end_idx": run.end_idx,
        "t": run.t,
        "hits": run.hits,
    }


def run_judge(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate frames against an SOP definition using judge.py."""
    sop_def = payload.get("sop_def")
    frames = payload.get("frames")
    if not isinstance(sop_def, dict):
        raise ValueError("sop_def is required")
    if not isinstance(frames, list):
        raise ValueError("frames is required")

    _ensure_judge_src()
    from judge import judge

    result = judge(sop_def, frames)
    event_defs = sop_def.get("events", {})
    events = {
        name: _serialize_run(run, _event_evidence(event_defs, name))
        for name, run in result.events.items()
    }
    return {
        "verdict": result.verdict,
        "coverage": result.coverage,
        "violations": result.violations,
        "events": events,
    }
