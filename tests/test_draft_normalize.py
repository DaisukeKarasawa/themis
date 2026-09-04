"""draft_normalize.py の単体テスト（VLM 不要）。"""
from __future__ import annotations

import pytest

from draft_normalize import extract_json_object, normalize_draft, slugify_id


def test_slugify_id_handles_japanese_and_digits():
    assert slugify_id("手が動いている") == "手が動いている"
    assert slugify_id("123abc").startswith("q_")


def test_normalize_draft_requires_questions():
    with pytest.raises(ValueError, match="questions"):
        normalize_draft({"questions": []})


def test_normalize_draft_coerces_questions_and_derives_events():
    raw = {
        "sop": {"id": "My Draft", "name": "テスト草案"},
        "domain_hint": "デスク作業",
        "questions": [
            {"id": "pick_tool", "ask": "作業者が工具を持っているか"},
            {"ask": "机が片付いているか", "id": "desk_clear"},
        ],
        "eventDefs": [
            {"name": "pick_tool", "evidence": "pick_tool==yes"},
            {"name": "step_desk_clear", "evidence": "desk_clear==yes"},
            {"name": "bad_event", "evidence": "missing==yes"},
        ],
        "relations": [
            "pick_tool before step_desk_clear",
            "pick_tool before missing_event",
            "invalid relation",
        ],
    }
    draft = normalize_draft(raw)
    assert len(draft["questions"]) == 2
    assert all(q["values"] == ["yes", "no"] for q in draft["questions"])
    assert draft["sop"]["id"] == "my_draft"
    assert any(e["name"] == "pick_tool" for e in draft["eventDefs"])
    assert "pick_tool before step_desk_clear" in draft["relations"]
    assert all("missing" not in rel for rel in draft["relations"])


def test_extract_json_object_from_wrapped_text():
    raw = '説明文\n{"questions": [{"id": "a", "ask": "test?"}]}\n'
    data = extract_json_object(raw)
    assert data["questions"][0]["id"] == "a"


def test_extract_json_object_from_markdown_fence():
    raw = '```json\n{"questions": [{"id": "b", "ask": "ok?"}]}\n```'
    data = extract_json_object(raw)
    assert data["questions"][0]["id"] == "b"


def test_extract_json_object_repairs_truncated():
    raw = '{"sop": {"id": "x", "name": "n"}, "questions": [{"id": "a", "ask": "q?"}'
    data = extract_json_object(raw)
    assert data["questions"][0]["id"] == "a"


def test_normalize_relations_unary_not_string():
    raw = {
        "questions": [{"id": "gloves", "ask": "手袋をしているか"}],
        "eventDefs": [{"name": "gloves_worn", "evidence": "gloves==yes"}],
        "relations": ["not gloves_worn"],
    }
    draft = normalize_draft(raw)
    assert "not gloves_worn" in draft["relations"]


def test_normalize_relations_unary_not_dict():
    raw = {
        "questions": [{"id": "gloves", "ask": "手袋をしているか"}],
        "eventDefs": [{"name": "gloves_worn", "evidence": "gloves==yes"}],
        "relations": [{"op": "not", "name": "gloves_worn"}],
    }
    draft = normalize_draft(raw)
    assert "not gloves_worn" in draft["relations"]


def test_normalize_relations_binary_still_work():
    raw = {
        "questions": [
            {"id": "pick_tool", "ask": "工具を持っているか"},
            {"id": "desk_clear", "ask": "机が片付いているか"},
        ],
        "eventDefs": [
            {"name": "pick_tool", "evidence": "pick_tool==yes"},
            {"name": "step_desk_clear", "evidence": "desk_clear==yes"},
        ],
        "relations": ["pick_tool before step_desk_clear", "pick_tool overlaps step_desk_clear"],
    }
    draft = normalize_draft(raw)
    assert "pick_tool before step_desk_clear" in draft["relations"]
    assert "pick_tool overlaps step_desk_clear" in draft["relations"]


def test_normalize_japanese_evidence_and_event_ids():
    raw = {
        "questions": [{"id": "手が動いている", "ask": "手が動いているか"}],
        "eventDefs": [{"name": "手の動き", "evidence": "手が動いている==yes"}],
        "relations": [],
    }
    draft = normalize_draft(raw)
    qid = draft["questions"][0]["id"]
    assert qid == "手が動いている"
    assert any(e["evidence"] == f"{qid}==yes" for e in draft["eventDefs"])


def test_normalize_draft_defaults_float_and_int():
    raw = {
        "questions": [{"id": "a", "ask": "test?"}],
        "defaults": {"order_tolerance_s": 1.5, "min_frames": 2, "max_gap_frames": 3},
    }
    draft = normalize_draft(raw)
    assert draft["defaults"]["order_tolerance_s"] == 1.5
    assert draft["defaults"]["min_frames"] == 2
    assert isinstance(draft["defaults"]["min_frames"], int)
    assert draft["defaults"]["max_gap_frames"] == 3
