"""vlm_backend answer merge helpers (VLM 不要)."""
from __future__ import annotations

from vlm_backend import _answers_from_confidence, _merge_answers, _parse_answers_from_raw

QUESTIONS = [
    {"id": "q1", "ask": "first?", "values": ["yes", "no"]},
    {"id": "q2", "ask": "second?", "values": ["yes", "no"]},
]


def test_merge_answers_confidence_only():
    confidence = {
        "q1": {"argmax": "yes", "probs": {"yes": 0.9, "no": 0.1}},
        "q2": {"argmax": "no", "probs": {"yes": 0.2, "no": 0.8}},
    }
    raw = '{"q1": "no", "q2": "yes"}'
    answers = _merge_answers(confidence, raw, QUESTIONS)
    assert answers == {"q1": "yes", "q2": "no"}


def test_merge_answers_partial_confidence_fills_from_raw():
    confidence = {"q1": {"argmax": "yes", "probs": {"yes": 0.9, "no": 0.1}}}
    raw = '{"q1": "no", "q2": "yes"}'
    answers = _merge_answers(confidence, raw, QUESTIONS)
    assert answers == {"q1": "yes", "q2": "yes"}


def test_merge_answers_empty_confidence_falls_back_to_raw():
    confidence: dict = {}
    raw = '{"q1": "yes", "q2": "no"}'
    answers = _merge_answers(confidence, raw, QUESTIONS)
    assert answers == {"q1": "yes", "q2": "no"}


def test_merge_answers_confidence_wins_when_both_exist():
    confidence = {"q1": {"argmax": "no", "probs": {"yes": 0.1, "no": 0.9}}}
    raw = '{"q1": "yes"}'
    answers = _merge_answers(confidence, raw, QUESTIONS)
    assert answers["q1"] == "no"


def test_answers_from_confidence_extracts_argmax():
    confidence = {"q1": {"argmax": "yes", "probs": {"yes": 0.7, "no": 0.3}}}
    assert _answers_from_confidence(confidence) == {"q1": "yes"}


def test_parse_answers_from_raw_json():
    raw = '{"q1": "yes", "q2": "no"}'
    assert _parse_answers_from_raw(raw, QUESTIONS) == {"q1": "yes", "q2": "no"}
