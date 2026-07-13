"""build_draft_prompt の単体テスト（VLM 不要）。"""

from vlm_backend import build_draft_prompt


def test_build_draft_prompt_includes_action_priority_guidance():
    prompt = build_draft_prompt("デスク作業", [0.0, 1.0, 2.0])
    assert "優先:" in prompt
    assert "手と物の接触" in prompt
    assert "動作の最中" in prompt
    assert "非優先:" in prompt
    assert "置かれているか" in prompt
    assert "静物しか見えない場合のみ可" in prompt


def test_build_draft_prompt_includes_events_and_relations_guidance():
    prompt = build_draft_prompt("作業", [0.0, 1.0])
    assert "eventDefs" in prompt
    assert "relations" in prompt
    assert "before" in prompt
    assert "overlaps" in prompt
    assert "not" in prompt
    assert "複数フレームで作業順序が見えるなら" in prompt


def test_build_draft_prompt_single_frame_omits_multi_frame_hint():
    prompt = build_draft_prompt("作業", [0.0])
    assert "複数フレームで作業順序が見えるなら" not in prompt


def test_build_draft_prompt_includes_good_and_bad_examples():
    prompt = build_draft_prompt("", [])
    assert "良い例:" in prompt
    assert "悪い例:" in prompt
    assert "ペットボトルはデスクの上に置かれているか" in prompt
    assert "触れているか" in prompt
    assert "操作している最中か" in prompt


def test_build_draft_prompt_includes_json_and_constraints():
    prompt = build_draft_prompt("炉点検", [3.5])
    assert "JSON オブジェクトのみ" in prompt
    assert "推測禁止" in prompt
    assert "3〜8 件" in prompt
    assert "1フレームで yes/no" in prompt
    assert "英数字とアンダースコア" in prompt
    assert "3.5s" in prompt
    assert "炉点検" in prompt


def test_build_draft_prompt_default_context_when_empty():
    prompt = build_draft_prompt("  ", [])
    assert "作業の文脈: 作業動画" in prompt
    assert "時刻: 不明" in prompt
