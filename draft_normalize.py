"""Normalize VLM draft JSON into replay.html editor config shape."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

DEFAULT_DRAFT_DEFAULTS = {
    "order_tolerance_s": 0,
    "min_frames": 1,
    "max_gap_frames": 2,
}

_ID = r"(?!\d)\w+"
_RELATION_BINARY_RE = re.compile(
    rf"^\s*({_ID})\s+(before|overlaps)\s+({_ID})\s*$",
    flags=re.UNICODE,
)
_RELATION_UNARY_NOT_RE = re.compile(
    rf"^\s*not\s+({_ID})\s*$",
    flags=re.UNICODE,
)
_EVIDENCE_RE = re.compile(
    rf"^({_ID})\s*==\s*(yes|no)$",
    flags=re.UNICODE,
)


def slugify_id(text: str, fallback: str = "item") -> str:
    normalized = unicodedata.normalize("NFKC", str(text or "")).strip().lower()
    slug = re.sub(r"[^\w]+", "_", normalized, flags=re.UNICODE)
    slug = slug.strip("_")
    if not slug:
        return fallback
    if slug[0].isdigit():
        slug = f"q_{slug}"
    return slug[:48]


def _unique_id(base: str, used: set[str]) -> str:
    candidate = slugify_id(base)
    if candidate not in used:
        used.add(candidate)
        return candidate
    index = 2
    while f"{candidate}_{index}" in used:
        index += 1
    final = f"{candidate}_{index}"
    used.add(final)
    return final


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _normalize_questions(raw_questions: Any) -> list[dict[str, Any]]:
    used_ids: set[str] = set()
    questions: list[dict[str, Any]] = []
    for index, item in enumerate(_as_list(raw_questions)):
        if not isinstance(item, dict):
            continue
        ask = str(item.get("ask") or item.get("question") or item.get("text") or "").strip()
        if not ask:
            continue
        base_id = item.get("id") or item.get("name") or f"item_{index + 1}"
        qid = _unique_id(str(base_id), used_ids)
        questions.append({"id": qid, "ask": ask, "values": ["yes", "no"]})
    return questions


def _normalize_event_defs(raw_events: Any, question_ids: set[str]) -> list[dict[str, Any]]:
    used_names: set[str] = set()
    events: list[dict[str, Any]] = []
    for index, item in enumerate(_as_list(raw_events)):
        if isinstance(item, str):
            name = _unique_id(item, used_names)
            evidence = f"{name}==yes"
            if name not in question_ids:
                continue
            events.append({"name": name, "evidence": evidence, "occurrence": 1, "min_frames": 1})
            continue
        if not isinstance(item, dict):
            continue
        name_raw = item.get("name") or item.get("id") or f"event_{index + 1}"
        name = _unique_id(str(name_raw), used_names)
        evidence = str(item.get("evidence") or f"{name}==yes").strip()
        match = _EVIDENCE_RE.match(evidence)
        if not match or match.group(1) not in question_ids:
            continue
        occurrence = item.get("occurrence", 1)
        try:
            occurrence = int(occurrence)
        except (TypeError, ValueError):
            occurrence = 1
        entry: dict[str, Any] = {
            "name": name,
            "evidence": evidence,
            "occurrence": max(1, occurrence),
        }
        if "min_frames" in item:
            try:
                entry["min_frames"] = max(1, int(item["min_frames"]))
            except (TypeError, ValueError):
                pass
        events.append(entry)
    return events


def _normalize_relations(raw_relations: Any, event_names: set[str]) -> list[str]:
    relations: list[str] = []
    for item in _as_list(raw_relations):
        if isinstance(item, dict):
            op = str(
                item.get("op") or item.get("relation") or item.get("type") or ""
            ).strip().lower()
            if op == "not":
                event = (
                    item.get("name")
                    or item.get("event")
                    or item.get("right")
                    or item.get("left")
                    or item.get("target")
                )
                if event:
                    event_str = str(event).strip()
                    if event_str in event_names:
                        relations.append(f"not {event_str}")
                continue
            left = item.get("left") or item.get("a") or item.get("from")
            right = item.get("right") or item.get("b") or item.get("to")
            if left and op and right:
                item = f"{left} {op} {right}"
            else:
                continue
        line = str(item).strip()
        not_match = _RELATION_UNARY_NOT_RE.match(line)
        if not_match:
            event = not_match.group(1)
            if event in event_names:
                relations.append(f"not {event}")
            continue
        match = _RELATION_BINARY_RE.match(line)
        if not match:
            continue
        left, op, right = match.group(1), match.group(2), match.group(3)
        if left not in event_names or right not in event_names:
            continue
        relations.append(f"{left} {op} {right}")
    return relations


def _derive_event_defs_from_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "name": f"step_{q['id']}",
            "evidence": f"{q['id']}==yes",
            "occurrence": 1,
            "min_frames": 1,
        }
        for q in questions
    ]


def normalize_draft(raw: dict[str, Any], work_context: str = "") -> dict[str, Any]:
    """Convert parsed VLM JSON into editor config. Raises ValueError if no questions."""
    sop_block = raw.get("sop") if isinstance(raw.get("sop"), dict) else {}
    sop_id = slugify_id(sop_block.get("id") or raw.get("sop_id") or "draft_sop", "draft_sop")
    sop_name = str(sop_block.get("name") or raw.get("sop_name") or "作業チェック草案").strip()
    domain_hint = str(
        raw.get("domain_hint") or raw.get("work_context") or work_context or ""
    ).strip()
    if not domain_hint:
        domain_hint = "これは作業動画の1フレームです"

    questions = _normalize_questions(raw.get("questions"))
    if not questions:
        raise ValueError("草案にチェック項目（questions）が含まれていません。")

    question_ids = {q["id"] for q in questions}
    event_defs = _normalize_event_defs(raw.get("eventDefs") or raw.get("events"), question_ids)
    if not event_defs:
        event_defs = _derive_event_defs_from_questions(questions)

    event_names = {e["name"] for e in event_defs}
    relations = _normalize_relations(raw.get("relations"), event_names)

    defaults = dict(DEFAULT_DRAFT_DEFAULTS)
    raw_defaults = raw.get("defaults")
    if isinstance(raw_defaults, dict):
        for key in DEFAULT_DRAFT_DEFAULTS:
            if key not in raw_defaults:
                continue
            try:
                if key == "order_tolerance_s":
                    defaults[key] = float(raw_defaults[key])
                else:
                    defaults[key] = int(raw_defaults[key])
            except (TypeError, ValueError):
                pass

    return {
        "sop": {"id": sop_id, "name": sop_name or "作業チェック草案"},
        "domain_hint": domain_hint,
        "questions": questions,
        "eventDefs": event_defs,
        "relations": relations,
        "defaults": defaults,
    }


def _strip_markdown_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json|JSON)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)
    return cleaned.strip()


def _close_truncated_json(text: str) -> str:
    """Best-effort close for truncated objects/arrays (small VLM often cuts mid-JSON)."""
    in_string = False
    escape = False
    stack: list[str] = []
    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack and stack[-1] == ch:
                stack.pop()
    if in_string:
        text += '"'
    while stack:
        text += stack.pop()
    return text


def _candidate_json_slices(cleaned: str) -> list[str]:
    start = cleaned.find("{")
    if start == -1:
        return []
    end = cleaned.rfind("}")
    slices: list[str] = []
    if end > start:
        slices.append(cleaned[start : end + 1])
    # Truncated responses may lack a closing brace.
    slices.append(cleaned[start:])
    return slices


def extract_json_object(raw: str) -> dict[str, Any]:
    """Extract first JSON object from VLM text output."""
    cleaned = raw.replace("<|im_end|>", "").replace("<|endoftext|>", "").strip()
    cleaned = _strip_markdown_fences(cleaned)
    preview = re.sub(r"\s+", " ", cleaned)[:240] or "(empty)"

    last_error: Exception | None = None
    for candidate in _candidate_json_slices(cleaned):
        for variant in (candidate, _close_truncated_json(candidate)):
            try:
                data = json.loads(variant)
            except json.JSONDecodeError as exc:
                last_error = exc
                continue
            if isinstance(data, dict):
                return data
            last_error = ValueError("VLM応答のJSONはオブジェクトである必要があります。")

    detail = f" raw preview: {preview}"
    if last_error is not None:
        detail += f" ({last_error})"
    raise ValueError("VLM応答からJSONを抽出できませんでした。" + detail)
