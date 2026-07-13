"""Bridge replay.html -> small_vlm_video_analysis Observer (Qwen3-VL / mlx-vlm)."""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def _default_vlm_src() -> Path:
    candidates = (
        ROOT / "small_vlm_video_analysis" / "src",
        ROOT.parent / "small_vlm_video_analysis" / "src",
    )
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[0]


VLM_SRC = Path(os.environ.get("VLM_SRC", _default_vlm_src()))
MODELS = {
    "2b": "mlx-community/Qwen3-VL-2B-Instruct-4bit",
    "4b": "mlx-community/Qwen3-VL-4B-Instruct-4bit",
}


def _as_yaml_safe_str(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


def _questions_key(questions: list[dict[str, Any]]) -> str:
    return json.dumps(questions, ensure_ascii=False, sort_keys=True)


def _rebuild_cand_ids(observer: Any, questions: list[dict[str, Any]]) -> None:
    tok = observer.processor.tokenizer
    observer.questions = questions
    observer._cand_ids = {}
    for question in questions:
        values = [_as_yaml_safe_str(v) for v in question.get("values", ["yes", "no"])]
        ids: dict[str, int | None] = {}
        for value in values:
            encoded = tok.encode(value, add_special_tokens=False)
            ids[value] = encoded[0] if len(encoded) == 1 else None
        observer._cand_ids[question["id"]] = ids


def _lookup_json_value(data: dict[Any, Any], qid: str) -> Any:
    if qid in data:
        return data[qid]
    if qid.isdigit():
        as_int = int(qid)
        if as_int in data:
            return data[as_int]
    return None


def _coerce_answer_value(raw_val: Any, allowed: list[str]) -> str | None:
    val = _as_yaml_safe_str(raw_val).strip().strip('"').strip("'")
    if val in allowed:
        return val
    for opt in sorted(allowed, key=len, reverse=True):
        if re.search(rf"(?:^|[\s/]){re.escape(opt)}$", val):
            return opt
    return None


def _parse_answers_from_raw(raw: str, questions: list[dict[str, Any]]) -> dict[str, str]:
    """logprobs / strict JSON が使えない場合、VLM 生出力から key:value を抽出する。"""
    cleaned = raw.replace("<|im_end|>", "").strip()
    allowed = {
        q["id"]: [_as_yaml_safe_str(v) for v in q.get("values", ["yes", "no"])]
        for q in questions
        if q.get("id")
    }
    answers: dict[str, str] = {}

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(cleaned[start : end + 1])
            if isinstance(data, dict):
                for qid, values in allowed.items():
                    raw_entry = _lookup_json_value(data, qid)
                    if raw_entry is None:
                        continue
                    val = _coerce_answer_value(raw_entry, values)
                    if val is not None:
                        answers[qid] = val
                if answers:
                    return answers
        except json.JSONDecodeError:
            pass

    all_values = sorted({v for vals in allowed.values() for v in vals}, key=len, reverse=True)
    value_pattern = "|".join(re.escape(v) for v in all_values)
    for qid, values in allowed.items():
        patterns = [
            rf'["\']?{re.escape(qid)}["\']?\s*:\s*["\']?({value_pattern})["\']?',
            rf'["\']?{re.escape(qid)}["\']?\s*:\s*["\'](?:[^"\']*?)({value_pattern})["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, cleaned)
            if not match:
                continue
            val = match.group(1)
            if val in values:
                answers[qid] = val
                break
    return answers


def _answers_from_confidence(confidence: dict[str, Any]) -> dict[str, str]:
    return {
        qid: info["argmax"]
        for qid, info in confidence.items()
        if isinstance(info, dict) and "argmax" in info
    }


def build_draft_prompt(work_context: str, frame_times: list[float]) -> str:
    times_text = ", ".join(f"{t:.1f}s" for t in frame_times) if frame_times else "不明"
    context = work_context.strip() or "作業動画"
    n = len(frame_times)
    multi_frame_hint = ""
    if n > 1:
        multi_frame_hint = (
            "- 複数フレームで作業順序が見えるなら questions から eventDefs を作り、"
            "before/overlaps で relations も提案。確信がなければ []\n"
        )
    return (
        f"作業動画のチェックリスト草案を作ってください。\n"
        f"添付は等間隔の {n} フレームです（時刻: {times_text}）。\n"
        f"作業の文脈: {context}\n\n"
        "要件:\n"
        "- 画像に見える事実だけ（推測禁止）\n"
        "- questions は 3〜8 件。各 ask は1フレームで yes/no 判定できる具体文\n"
        "- 優先: 手と物の接触、動作の最中（〜している最中か）、物体の状態（開いている/入っている/折り畳まれている等）、左右など具体的位置関係\n"
        "- 非優先: 「〜が置かれているか」「〜があるか」だけの存在確認。動作・状態が画像から取れるなら使わない。静物しか見えない場合のみ可\n"
        "- 可能なら動作系と結果状態系を混ぜる\n"
        f"{multi_frame_hint}"
        "- id は英数字とアンダースコアのみ（例: hands_on_bottle）\n"
        "- eventDefs / relations は任意。確信がなければ []\n"
        "- relations は before / overlaps / not のみ\n"
        "- 出力は JSON オブジェクトのみ。前後に説明・Markdown・コードフェンスを付けない\n\n"
        "良い例:\n"
        '{"questions":[{"id":"hands_on_bottle","ask":"作業者の手がペットボトルに触れているか"},'
        '{"id":"tissue_in_cup","ask":"作業者がティッシュを紙コップの中に入れている最中か"}]}\n'
        '{"questions":[{"id":"operating_valve","ask":"作業者がバルブを操作している最中か"},'
        '{"id":"lid_open","ask":"容器の蓋が開いているか"}]}\n'
        "悪い例:\n"
        '{"questions":[{"id":"bottle_on_desk","ask":"ペットボトルはデスクの上に置かれているか"}]}\n\n'
        "出力 JSON の形:\n"
        '{"sop":{"id":"desk_task","name":"デスク作業"},'
        '"domain_hint":"デスク上の作業を上から撮影",'
        '"questions":[{"id":"hands_on_bottle","ask":"作業者の手がペットボトルに触れているか"}],'
        '"eventDefs":[{"name":"step_hands_on_bottle","evidence":"hands_on_bottle==yes","occurrence":1,"min_frames":1}],'
        '"relations":["step_hands_on_bottle before step_tissue_in_cup"]}'
    )


class VlmAnalyzer:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._observer: Any | None = None
        self._questions_key: str | None = None
        model_key = os.environ.get("VLM_MODEL", "4b")
        self.model_name = MODELS.get(model_key, model_key)
        self._load_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._observer is not None

    @property
    def error(self) -> str | None:
        return self._load_error

    def _ensure_src(self) -> None:
        if not VLM_SRC.is_dir():
            local = ROOT / "small_vlm_video_analysis"
            sibling = ROOT.parent / "small_vlm_video_analysis"
            raise RuntimeError(
                f"VLM source not found: {VLM_SRC}\n"
                "git clone https://github.com/shure-dev/small_vlm_video_analysis.git "
                f"{local}\n"
                f"or: git clone ... {sibling}\n"
                "or set VLM_SRC to the src directory."
            )
        src = str(VLM_SRC)
        if src not in sys.path:
            sys.path.insert(0, src)

    def _ensure_loaded(self) -> None:
        if self._observer is not None:
            return
        with self._lock:
            if self._observer is not None:
                return
            try:
                self._ensure_src()
                from observe import Observer

                print(f"[vlm] loading {self.model_name} ...", flush=True)
                self._observer = Observer(model=self.model_name, questions=[])
                _rebuild_cand_ids(self._observer, [])
                self._questions_key = _questions_key([])
                print("[vlm] model ready", flush=True)
            except Exception as exc:
                self._load_error = str(exc)
                raise

    def _sync_questions(self, questions: list[dict[str, Any]]) -> None:
        key = _questions_key(questions)
        if self._observer is None or key == self._questions_key:
            return
        _rebuild_cand_ids(self._observer, questions)
        self._questions_key = key

    def _decode_image(self, image_data: str) -> str:
        payload = image_data.split(",", 1)[1] if "," in image_data else image_data
        raw = base64.b64decode(payload)
        temp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        try:
            temp.write(raw)
            temp.close()
            return temp.name
        except Exception:
            temp.close()
            os.unlink(temp.name)
            raise

    def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
        questions = payload.get("questions") or []
        if not questions:
            raise ValueError("questions is required")
        for i, q in enumerate(questions):
            if not isinstance(q, dict) or not q.get("id"):
                raise ValueError(f"questions[{i}] must be an object with a non-empty id")

        ground_for = payload.get("ground_for") or []
        if ground_for:
            return self._analyze_grounding(payload, questions, ground_for)

        self._ensure_loaded()
        domain_hint = payload.get("domain_hint") or "これは作業動画の1フレームです"
        t = float(payload.get("t", 0))
        image_data = payload.get("image")
        if not image_data:
            raise ValueError("image is required")

        image_path = self._decode_image(image_data)
        try:
            with self._lock:
                self._sync_questions(questions)
                record = self._observer.ask(image_path, t=t, domain_hint=domain_hint)
        finally:
            os.unlink(image_path)

        confidence = record.get("confidence", {})
        raw = record.get("raw", "")
        answers = _answers_from_confidence(confidence)
        if not answers:
            answers = _parse_answers_from_raw(raw, questions)
        probs = {
            qid: info["probs"]
            for qid, info in confidence.items()
            if isinstance(info, dict) and "probs" in info
        }
        if not answers:
            preview = re.sub(r"\s+", " ", raw).strip()[:400]
            raise ValueError(
                "VLM応答から answers を抽出できませんでした。"
                f" raw preview: {preview or '(empty)'}"
            )
        return {
            "raw": raw,
            "answers": answers,
            "probs": probs,
        }

    def _analyze_grounding(
        self,
        payload: dict[str, Any],
        questions: list[dict[str, Any]],
        ground_for: list[str],
    ) -> dict[str, Any]:
        self._ensure_loaded()
        domain_hint = payload.get("domain_hint") or "これは作業動画の1フレームです"
        t = float(payload.get("t", 0))
        image_data = payload.get("image")
        if not image_data:
            raise ValueError("image is required")

        q_by_id = {q["id"]: q for q in questions if q.get("id")}
        ground_questions = [q_by_id[qid] for qid in ground_for if qid in q_by_id]
        if not ground_questions:
            raise ValueError("ground_for に一致する questions がありません")

        source = payload.get("grounding_source") or "analyze"
        image_path = self._decode_image(image_data)
        try:
            with self._lock:
                record = self._observer.ground(
                    image_path,
                    ground_questions,
                    t=t,
                    domain_hint=domain_hint,
                )
        finally:
            os.unlink(image_path)

        groundings: dict[str, dict[str, Any]] = {}
        for qid, parsed in record.get("groundings", {}).items():
            entry: dict[str, Any] = {"status": parsed.get("status", "failed"), "source": source}
            if parsed.get("status") == "ok" and parsed.get("bbox"):
                entry["bbox"] = parsed["bbox"]
            groundings[qid] = entry

        return {
            "raw": record.get("raw", ""),
            "answers": {},
            "probs": {},
            "groundings": groundings,
        }

    def _stream_generate_text(
        self,
        prompt: str,
        image_paths: list[str],
        max_tokens: int = 2048,
    ) -> str:
        from mlx_vlm.generate import stream_generate
        from mlx_vlm.prompt_utils import apply_chat_template

        num_images = len(image_paths)
        processor = self._observer.processor
        formatted = apply_chat_template(
            processor,
            self._observer.config,
            prompt,
            num_images=num_images,
        )
        full_text = ""
        tok = processor.tokenizer
        for resp in stream_generate(
            self._observer.model,
            processor,
            formatted,
            image=image_paths,
            max_tokens=max_tokens,
            verbose=False,
        ):
            tok_id = resp.token
            full_text += tok.decode([tok_id]) if tok_id is not None else ""
        try:
            self._observer._mx.clear_cache()
        except Exception:
            pass
        return full_text

    def _build_draft_prompt(
        self,
        work_context: str,
        frame_times: list[float],
    ) -> str:
        return build_draft_prompt(work_context, frame_times)

    def draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        from draft_normalize import extract_json_object, normalize_draft

        images = payload.get("images") or []
        if not images:
            raise ValueError("images is required")
        if len(images) > 8:
            raise ValueError("images must contain at most 8 frames")

        work_context = str(payload.get("work_context") or payload.get("domain_hint") or "").strip()
        frame_times_raw = payload.get("frame_times") or []
        frame_times: list[float] = []
        for item in frame_times_raw:
            try:
                frame_times.append(float(item))
            except (TypeError, ValueError):
                continue
        if len(frame_times) < len(images):
            frame_times.extend(float(i) for i in range(len(frame_times), len(images)))

        self._ensure_loaded()
        image_paths: list[str] = []
        raw = ""
        try:
            for image_data in images:
                image_paths.append(self._decode_image(image_data))

            prompt = self._build_draft_prompt(work_context, frame_times[: len(image_paths)])
            with self._lock:
                try:
                    raw = self._stream_generate_text(prompt, image_paths)
                except Exception as multi_err:
                    if len(image_paths) <= 1:
                        raise
                    print(f"[vlm] draft multi-image failed, fallback to 1 frame: {multi_err}", flush=True)
                    fallback_prompt = self._build_draft_prompt(
                        work_context + f"\n（代表フレーム時刻: {frame_times[0]:.1f}s）",
                        frame_times[:1],
                    )
                    raw = self._stream_generate_text(fallback_prompt, image_paths[:1])

            if not raw.strip():
                raise ValueError("VLM応答が空でした。モデルまたはプロンプトを確認してください。")

            try:
                parsed = extract_json_object(raw)
            except ValueError:
                # Retry once with a stricter single-frame prompt if first parse fails.
                if len(image_paths) > 1:
                    print("[vlm] draft JSON parse failed; retrying with 1 frame", flush=True)
                    with self._lock:
                        retry_prompt = self._build_draft_prompt(
                            work_context + "\n重要: JSON のみを1つ出力すること。",
                            frame_times[:1],
                        )
                        raw = self._stream_generate_text(retry_prompt, image_paths[:1])
                    parsed = extract_json_object(raw)
                else:
                    raise
        finally:
            for path in image_paths:
                try:
                    os.unlink(path)
                except OSError:
                    pass

        draft = normalize_draft(parsed, work_context=work_context)
        return {"raw": raw, "draft": draft}

    def warm_up(self) -> None:
        self._ensure_loaded()
