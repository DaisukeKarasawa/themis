"""Grounding bbox パースの単体テスト（VLM 不要）。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from observe import (  # noqa: E402
    convert_bbox_thousand_to_normalized,
    parse_grounding_bbox_from_raw,
    pick_largest_bbox,
)


def test_parse_valid_bbox():
    raw = '{"bbox_2d": [100, 200, 400, 600]}'
    result = parse_grounding_bbox_from_raw(raw)
    assert result["status"] == "ok"
    assert result["bbox"] == [0.1, 0.2, 0.4, 0.6]


def test_parse_multi_bbox_picks_largest():
    raw = (
        '{"items": ['
        '{"bbox_2d": [0, 0, 100, 100]},'
        '{"bbox_2d": [0, 0, 500, 500]}'
        "]}"
    )
    result = parse_grounding_bbox_from_raw(raw)
    assert result["status"] == "ok"
    assert result["bbox"] == [0.0, 0.0, 0.5, 0.5]


def test_parse_invalid_returns_failed():
    assert parse_grounding_bbox_from_raw("not json")["status"] == "failed"
    assert parse_grounding_bbox_from_raw('{"foo": 1}')["status"] == "failed"


def test_convert_clamps_out_of_range():
    bbox = convert_bbox_thousand_to_normalized([0, 0, 1500, -100])
    assert bbox == [0.0, 0.0, 1.0, 0.0]


def test_pick_largest_bbox():
    boxes = [[0, 0, 10, 10], [0, 0, 50, 50]]
    assert pick_largest_bbox(boxes) == [0, 0, 50, 50]
