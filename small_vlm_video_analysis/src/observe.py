"""SOP定義の questions: からプロンプトを自動生成し、
ローカル小型VLM(Qwen3-VL, mlx_vlm)でフレームごとに観察する（Phase 1）。

各質問への回答だけでなく、生成トークンのlogitから実測した信頼度(自己申告ではない)も
一緒に返す。これによりPhase 2(judge)側で「低信頼な観察に頼った判定か」を
可視化できる(experiments/sop_step_detect/confidence_judge/ での実験で技術検証済み)。

ドメイン固有の知識(ガスコンロの点検作業など)は一切持たない。
SOP定義ファイルの `questions:` セクションだけを見てプロンプトを組み立てる。
"""
from __future__ import annotations
import json
import math
import re
import time
from typing import Any

GROUNDING_GRID = 1000


def _as_yaml_safe_str(v: Any) -> str:
    """YAMLは 'yes'/'no' のようなクォート無し語をブール値(True/False)と解釈してしまう
    (YAML 1.1のブール語彙)。questions[].values にこの罠があっても壊れないよう、
    ブール値なら"yes"/"no"へ戻し、それ以外は素直にstr化する。
    SOPファイル側は values に必ずクォート付き文字列("yes"等)を書くのが正しい書き方だが、
    ここでは防御的に吸収する。
    """
    if isinstance(v, bool):
        return "yes" if v else "no"
    return str(v)


def _lookup_token_logprob(resp: Any, tid: int) -> float | None:
    """mlx-vlm stream_generate の logprobs (vocab サイズ配列) から token id の logprob を取る。"""
    lp = resp.logprobs
    if lp is not None:
        try:
            val = lp[tid]
            return float(val.item() if hasattr(val, "item") else val)
        except Exception:
            pass
    top_lp = getattr(resp, "top_logprobs", None)
    if top_lp:
        try:
            for entry in top_lp:
                if isinstance(entry, (list, tuple)) and len(entry) >= 2 and entry[0] == tid:
                    v = entry[1]
                    return float(v.item() if hasattr(v, "item") else v)
        except Exception:
            pass
    return None


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def convert_bbox_thousand_to_normalized(bbox: list[float]) -> list[float]:
    """Qwen3-VL の 0–1000 相対座標を 0–1 に変換する。"""
    x1, y1, x2, y2 = bbox
    return [
        clamp01(x1 / GROUNDING_GRID),
        clamp01(y1 / GROUNDING_GRID),
        clamp01(x2 / GROUNDING_GRID),
        clamp01(y2 / GROUNDING_GRID),
    ]


def _bbox_area(bbox: list[float]) -> float:
    x1, y1, x2, y2 = bbox
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def pick_largest_bbox(bboxes: list[list[float]]) -> list[float] | None:
    if not bboxes:
        return None
    return max(bboxes, key=_bbox_area)


def _extract_bbox_2d_objects(data: Any) -> list[list[float]]:
    found: list[list[float]] = []
    if isinstance(data, dict):
        bbox = data.get("bbox_2d")
        if isinstance(bbox, list) and len(bbox) == 4:
            try:
                found.append([float(v) for v in bbox])
            except (TypeError, ValueError):
                pass
        for value in data.values():
            found.extend(_extract_bbox_2d_objects(value))
    elif isinstance(data, list):
        for item in data:
            found.extend(_extract_bbox_2d_objects(item))
    return found


def parse_grounding_bbox_from_raw(raw: str) -> dict[str, Any]:
    """VLM 生出力から bbox_2d を抽出し、正規化 bbox を返す。"""
    cleaned = raw.replace("<|im_end|>", "").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {"status": "failed"}
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return {"status": "failed"}

    bboxes = _extract_bbox_2d_objects(data)
    largest = pick_largest_bbox(bboxes)
    if largest is None:
        return {"status": "failed"}

    x1, y1, x2, y2 = largest
    norm = convert_bbox_thousand_to_normalized(
        [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]
    )
    if norm[2] <= norm[0] or norm[3] <= norm[1]:
        return {"status": "failed"}
    return {"status": "ok", "bbox": norm}


def build_grounding_prompt(question: dict[str, Any], domain_hint: str, t: float) -> str:
    """単一チェック項目の根拠領域を bbox で返すよう促すプロンプト。"""
    qid = question["id"]
    ask = question["ask"]
    return (
        f"{domain_hint}（時刻 t={t}s）。\n"
        f"チェック項目 [{qid}]: {ask}\n"
        "この項目への回答が yes である根拠となる対象物・部位を画像内で特定し、"
        "その領域のバウンディングボックスを JSON で出力してください。\n"
        '形式: {"bbox_2d": [x_min, y_min, x_max, y_max]}\n'
        "座標は 0〜1000 の相対値（左上原点）です。JSON のみ出力してください。"
    )


def build_prompt(questions: list[dict[str, Any]], domain_hint: str, t: float) -> str:
    """SOPの questions: 定義から、1フレーム分の観察プロンプトを自動生成する。"""
    lines = []
    schema_parts = []
    for c in questions:
        values = [_as_yaml_safe_str(v) for v in c.get("values", ["yes", "no"])]
        opts = "/".join(values)
        lines.append(f'- [{c["id"]}] {c["ask"]} （{opts} のいずれか）')
        schema_parts.append(f'"{c["id"]}":"..."')
    schema = "{" + ",".join(schema_parts) + "}"
    return (
        f"{domain_hint}（時刻 t={t}s）。\n"
        "次の各質問について、見えている事実だけを答えてください（憶測禁止）。\n"
        + "\n".join(lines)
        + "\n各値は上記の選択肢のいずれか1語のみ。次のJSON形式で答えてください:\n"
        + schema
    )


class Observer:
    """VLMをロードして、フレーム1枚ごとの観察+信頼度を返すオブジェクト。

    使い方:
        obs = Observer(model="mlx-community/Qwen3-VL-4B-Instruct-4bit", questions=sop["questions"])
        record = obs.ask(image_path, t=7.0, domain_hint=sop["sop"]["domain_hint"])
        # record = {"raw": "...", "confidence": {question_id: {"probs": {...}, "argmax": "..."}}}
    """

    def __init__(self, model: str, questions: list[dict[str, Any]]):
        import mlx.core as mx
        from mlx_vlm import load

        try:
            mx.set_cache_limit(1 << 30)  # Metal断片化によるGPU Hang対策(Mac既知の問題)
        except Exception:
            pass

        self._mx = mx
        self.questions = questions
        print(f"[observe] loading {model} ...", flush=True)
        t0 = time.time()
        self.model, self.processor = load(model)
        self.config = self.model.config
        print(f"[observe] loaded in {time.time()-t0:.1f}s", flush=True)

        tok = self.processor.tokenizer
        self._cand_ids = {}
        for c in questions:
            values = [_as_yaml_safe_str(v) for v in c.get("values", ["yes", "no"])]
            ids = {}
            for v in values:
                enc = tok.encode(v, add_special_tokens=False)
                ids[v] = enc[0] if len(enc) == 1 else None  # 複数トークンに割れる語は計測不能扱い
            self._cand_ids[c["id"]] = ids

    def ask(self, image_path: str, t: float, domain_hint: str, max_tokens: int = 200) -> dict:
        from mlx_vlm.generate import stream_generate
        from mlx_vlm.prompt_utils import apply_chat_template

        mx = self._mx
        prompt = build_prompt(self.questions, domain_hint, t)
        formatted = apply_chat_template(self.processor, self.config, prompt, num_images=1)
        try:
            mx.reset_peak_memory()
        except Exception:
            pass

        tok = self.processor.tokenizer
        full_text = ""
        confidence: dict[str, dict] = {}
        pending_question = None  # 直前が `"question_id":"` で終わっていれば、次トークンがその値

        for resp in stream_generate(self.model, self.processor, formatted, image=[image_path],
                                     max_tokens=max_tokens, verbose=False):
            if pending_question:
                ids = self._cand_ids.get(pending_question, {})
                raw = {}
                for v, tid in ids.items():
                    if tid is None:
                        continue
                    try:
                        logp = _lookup_token_logprob(resp, tid)
                        if logp is not None:
                            raw[v] = math.exp(logp)
                    except Exception:
                        pass
                if raw:
                    total = sum(raw.values())
                    probs = {v: round(p / total, 4) for v, p in raw.items()}
                    confidence[pending_question] = {"probs": probs, "argmax": max(probs, key=probs.get)}
                pending_question = None

            tok_id = resp.token
            full_text += tok.decode([tok_id]) if tok_id is not None else ""
            for c in self.questions:
                # モデルがコンパクトJSON("knob":")と整形JSON("knob": ")のどちらを
                # 出力するかは推論ごとに揺れる(このセッションで何度も確認済み)ので、
                # コロン後の空白の有無を問わず検出する。
                if re.search(rf'"{re.escape(c["id"])}"\s*:\s*"$', full_text):
                    pending_question = c["id"]
                    break

        mem = {}
        try:
            mem = {"active_mb": round(mx.get_active_memory() / 1e6, 1),
                   "peak_mb": round(mx.get_peak_memory() / 1e6, 1)}
        except Exception:
            pass
        mx.clear_cache()
        return {"raw": full_text, "confidence": confidence, "mem": mem}

    def ground(
        self,
        image_path: str,
        questions: list[dict[str, Any]],
        t: float,
        domain_hint: str,
        max_tokens: int = 128,
    ) -> dict:
        """チェック項目ごとに根拠領域 bbox を取得する（Phase 1 補助・判定には使わない）。"""
        from mlx_vlm.generate import stream_generate
        from mlx_vlm.prompt_utils import apply_chat_template

        mx = self._mx
        groundings: dict[str, dict[str, Any]] = {}
        raw_parts: list[str] = []

        for question in questions:
            qid = question["id"]
            prompt = build_grounding_prompt(question, domain_hint, t)
            formatted = apply_chat_template(self.processor, self.config, prompt, num_images=1)
            full_text = ""
            for resp in stream_generate(
                self.model,
                self.processor,
                formatted,
                image=[image_path],
                max_tokens=max_tokens,
                verbose=False,
            ):
                tok_id = resp.token
                full_text += self.processor.tokenizer.decode([tok_id]) if tok_id is not None else ""

            parsed = parse_grounding_bbox_from_raw(full_text)
            groundings[qid] = parsed
            raw_parts.append(f"[{qid}] {full_text.strip()}")

        try:
            mx.clear_cache()
        except Exception:
            pass
        return {"raw": "\n".join(raw_parts), "groundings": groundings}


def confidence_to_answers(confidence: dict[str, dict]) -> dict[str, str]:
    """judge が期待する {question_id: value} 形式に変換する(argmaxだけを取り出す)。"""
    return {question_id: c["argmax"] for question_id, c in confidence.items()}
