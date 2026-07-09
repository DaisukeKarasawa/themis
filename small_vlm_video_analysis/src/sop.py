"""SOP定義ファイル(YAML)の読み込みと最低限のバリデーション。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from observe import confidence_to_answers

REQUIRED_TOP_KEYS = ("sop", "questions", "events", "relations")


def load_sop(path: str | Path) -> dict[str, Any]:
    doc = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        raise ValueError(f"{path}: SOPのルートはマッピングである必要があります (got {type(doc).__name__})")
    missing = [k for k in REQUIRED_TOP_KEYS if k not in doc]
    if missing:
        raise ValueError(f"{path}: 必須キーが不足しています: {missing}")
    if "id" not in doc["sop"] or "name" not in doc["sop"]:
        raise ValueError(f"{path}: sop.id / sop.name は必須です")
    if not doc["questions"]:
        raise ValueError(f"{path}: questions が空です(観察プロンプトを生成できません)")
    if not doc["events"]:
        raise ValueError(f"{path}: events が空です(判定対象がありません)")
    return doc


def _answers_from_raw(raw: str) -> dict[str, str]:
    cleaned = raw.replace("<|im_end|>", "").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end <= start:
        return {}
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    answers: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(value, str):
            answers[str(key)] = value
    return answers


def _answers_from_record(record: dict[str, Any]) -> dict[str, str]:
    confidence = record.get("confidence")
    if isinstance(confidence, dict) and confidence:
        return confidence_to_answers(confidence)
    return _answers_from_raw(record.get("raw", ""))


def load_answer_log(path: str | Path) -> list[dict[str, Any]]:
    """observe が出力したログを読み込み、judge が使う形に整形する。"""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    frames = []
    for record in raw:
        if not isinstance(record, dict):
            continue
        frames.append(
            {
                "idx": record.get("idx", len(frames)),
                "t": float(record.get("t", 0.0)),
                "answers": _answers_from_record(record),
            }
        )
    return frames
