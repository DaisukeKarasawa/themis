"""sop.load_answer_log の堅牢性テスト。"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from sop import load_answer_log


def test_load_answer_log_missing_confidence_uses_raw_json(tmp_path: Path):
  log_path = tmp_path / "answer_log.json"
  log_path.write_text(
    json.dumps(
      [
        {
          "idx": 0,
          "t": 0.0,
          "raw": '{"knob": "yes", "flame": "no"}',
        }
      ]
    ),
    encoding="utf-8",
  )
  frames = load_answer_log(log_path)
  assert frames[0]["answers"]["knob"] == "yes"
  assert frames[0]["answers"]["flame"] == "no"


def test_load_answer_log_empty_confidence_falls_back_to_raw(tmp_path: Path):
  log_path = tmp_path / "answer_log.json"
  log_path.write_text(
    json.dumps([{"idx": 1, "t": 1.0, "raw": '{"item": "yes"}', "confidence": {}}]),
    encoding="utf-8",
  )
  frames = load_answer_log(log_path)
  assert frames[0]["answers"]["item"] == "yes"


def test_load_answer_log_missing_confidence_and_raw_returns_empty_answers(tmp_path: Path):
  log_path = tmp_path / "answer_log.json"
  log_path.write_text(json.dumps([{"idx": 2, "t": 2.0}]), encoding="utf-8")
  frames = load_answer_log(log_path)
  assert frames[0]["answers"] == {}
