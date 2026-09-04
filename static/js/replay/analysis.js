import { isFileProtocol } from "../shared/demo-guards.js";
import { extractFrames } from "../shared/video-frames.js";
import {
  analysisAbortController,
  setAnalysisAbortController,
  setAnalysisRunning
} from "./state.js";
import { saveResultToHistory } from "./history.js";
import { showReplay } from "./view.js";
import {
  analyzeFrameGrounding,
  collectYesQuestionIds,
  mergeGroundingEntries
} from "./grounding.js";

export function readAnalyzeResponse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("VLM応答が不正です");
  }
  const answers = data.answers && typeof data.answers === "object" ? data.answers : {};
  const groundings = data.groundings && typeof data.groundings === "object" ? data.groundings : {};
  if (Object.keys(answers).length === 0 && Object.keys(groundings).length === 0) {
    const preview = String(data.raw || JSON.stringify(data)).slice(0, 400);
    throw new Error("VLM応答に answers がありません\nraw preview: " + preview);
  }
  return {
    answers,
    raw: data.raw || JSON.stringify(answers, null, 2),
    probs: data.probs || {},
    groundings
  };
}

export async function ensureServerReady(signal, setProgress) {
  if (isFileProtocol) return;
  const statusResp = await fetch("/api/status", { signal });
  if (!statusResp.ok) {
    throw new Error(`サーバー応答異常 (${statusResp.status})。${window.location.origin} が server.py の URL と一致しているか確認してください。`);
  }
  const status = await statusResp.json();
  if (status.mode === "vlm" && !status.ready) {
    setProgress(0, 1, "VLMモデルをロード中（初回は数分かかります）...");
    const warmResp = await fetch("/api/warmup", { method: "POST", signal });
    if (!warmResp.ok) {
      const body = await warmResp.text();
      throw new Error(`VLMロード失敗: ${body.slice(0, 300)}`);
    }
  }
}

export async function analyzeFrame(frame, questions, apiUrl, domainHint, signal) {
  let resp;
  try {
    resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: frame.image,
        questions,
        t: frame.t,
        domain_hint: domainHint
      }),
      signal
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    const hint = window.location.protocol === "file:"
      ? "file:// で開いています。server.py 起動後に表示された http://127.0.0.1:PORT/replay.html を開いてください。"
      : `接続先: ${window.location.origin}${apiUrl}\nserver.py が同じポートで起動しているか確認してください（古い 8769 等は使わない）。`;
    throw new Error(`Failed to fetch (${apiUrl})\n${hint}`);
  }
  if (!resp.ok) {
    const body = await resp.text();
    let msg = body.slice(0, 400);
    try {
      const err = JSON.parse(body);
      if (err.error) msg = err.error;
    } catch {
      // keep raw body
    }
    throw new Error(`API error ${resp.status}: ${msg}`);
  }

  const data = await resp.json();
  return readAnalyzeResponse(data);
}

export function deriveEventDefs(questions, eventDefs) {
  if (eventDefs.length > 0) return eventDefs;
  return questions
    .filter(q => q.id)
    .map(q => ({
      name: `step_${q.id}`,
      evidence: `${q.id}==yes`,
      occurrence: 1
    }));
}

export function buildSopDef(config) {
  const eventDefs = deriveEventDefs(config.questions, config.eventDefs);
  const events = {};
  for (const ev of eventDefs) {
    const spec = { evidence: ev.evidence };
    if (ev.occurrence) spec.occurrence = ev.occurrence;
    if (ev.min_frames != null && ev.min_frames !== "") spec.min_frames = Number(ev.min_frames);
    if (ev.max_gap_frames != null && ev.max_gap_frames !== "") spec.max_gap_frames = Number(ev.max_gap_frames);
    events[ev.name] = spec;
  }
  return {
    sop: config.sop,
    questions: config.questions,
    events,
    relations: config.relations,
    defaults: config.defaults || {}
  };
}

export function summarizeDetection(frames, questions) {
  const stats = questions.map(q => {
    const yesCount = frames.filter(f => f.answers?.[q.id] === "yes").length;
    return { id: q.id, ask: q.ask, yesCount, total: frames.length };
  });
  const allNo = stats.every(s => s.yesCount === 0);
  return { stats, allNo };
}

export async function judgeViaServer(config, frames, signal) {
  const sopDef = buildSopDef(config);
  const judgeFrames = frames.map((frame, index) => ({
    idx: index,
    t: frame.t,
    answers: frame.answers || {}
  }));
  const resp = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sop_def: sopDef, frames: judgeFrames }),
    signal
  });
  if (!resp.ok) {
    const body = await resp.text();
    let msg = body.slice(0, 400);
    try {
      const err = JSON.parse(body);
      if (err.error) msg = err.error;
    } catch {
      // keep raw body
    }
    throw new Error(`Judge API error ${resp.status}: ${msg}`);
  }
  return resp.json();
}

export function buildAnalysisResult(config, frames, judgeResult) {
  const eventDefs = deriveEventDefs(config.questions, config.eventDefs);
  const detection = summarizeDetection(frames, config.questions);
  return {
    sop: config.sop,
    questions: config.questions,
    relations: config.relations,
    eventDefs,
    defaults: config.defaults || {},
    verdict: judgeResult.verdict,
    coverage: judgeResult.coverage,
    violations: judgeResult.violations || [],
    relationResults: judgeResult.relation_results || [],
    events: judgeResult.events || {},
    n_frames: frames.length,
    frames,
    detection,
    hasFrames: true
  };
}

export function isAbortError(err, signal) {
  return err?.name === "AbortError" || Boolean(signal?.aborted);
}

export async function runAnalysis(deps) {
  const {
    clearError,
    showError,
    setProgress,
    hideProgress,
    setAnalyzeButtonCancel,
    setAnalyzeButtonIdle,
    readConfigFromEditor,
    videoInput,
    sampleIntervalInput,
    apiUrlInput,
    domainHintInput
  } = deps;

  clearError();
  if (isFileProtocol) {
    showError("file:// では分析できません。server.py を起動し、http://127.0.0.1:PORT/replay.html から開き直してください。");
    return;
  }
  const file = videoInput.files?.[0];
  if (!file) {
    showError("動画ファイルを選択してください。");
    return;
  }

  const config = readConfigFromEditor();
  if (config.questions.some(q => !q.id || !q.ask)) {
    showError("すべてのチェック項目に ID と質問文を入力してください。");
    return;
  }

  setAnalysisAbortController(new AbortController());
  const signal = analysisAbortController.signal;
  setAnalysisRunning(true);
  setAnalyzeButtonCancel();

  try {
    const intervalSec = Math.max(0.5, parseFloat(sampleIntervalInput.value) || 1);
    setProgress(0, 1, "フレーム抽出中...");
    const frames = await extractFrames(file, intervalSec, {
      signal,
      onProgress: (current, total) => {
        setProgress(current, total, `フレーム抽出中... ${current}/${total}`);
      },
      frameExtra: () => ({ raw: "", answers: {}, probs: {}, groundings: {} })
    });

    await ensureServerReady(signal, setProgress);

    const apiUrl = apiUrlInput.value.trim() || "/api/vlm/analyze";
    const domainHint = domainHintInput.value.trim() || "これは作業動画の1フレームです";
    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      setProgress(i, frames.length, `VLM分析中... frame ${i + 1}/${frames.length} (t=${frames[i].t}s)`);
      const result = await analyzeFrame(frames[i], config.questions, apiUrl, domainHint, signal);
      frames[i].answers = result.answers;
      frames[i].raw = result.raw;
      frames[i].probs = result.probs || {};
      frames[i].groundings = frames[i].groundings || {};
      const yesIds = collectYesQuestionIds(result.answers);
      if (yesIds.length > 0) {
        setProgress(i, frames.length, `根拠箇所を取得中... frame ${i + 1}/${frames.length}`);
        try {
          const groundings = await analyzeFrameGrounding(
            frames[i],
            yesIds,
            config.questions,
            apiUrl,
            domainHint,
            signal,
            "analyze"
          );
          frames[i].groundings = mergeGroundingEntries(frames[i].groundings, groundings, "analyze");
        } catch (groundErr) {
          if (groundErr?.name === "AbortError") throw groundErr;
          console.warn("analyze-time grounding failed", groundErr);
          for (const qid of yesIds) {
            if (!frames[i].groundings[qid]) {
              frames[i].groundings[qid] = { status: "failed", source: "analyze" };
            }
          }
        }
      }
    }

    setProgress(frames.length, frames.length, "SOP判定中 (Python judge)...");
    const judgeResult = await judgeViaServer(config, frames, signal);
    const analysisData = buildAnalysisResult(config, frames, judgeResult);
    const historySaved = saveResultToHistory(analysisData);
    await showReplay(analysisData);
    if (!historySaved) {
      window.alert("分析結果は表示できましたが、履歴保存に失敗しました。ブラウザの保存容量を超えている可能性があります。");
    }
  } catch (err) {
    if (!isAbortError(err, signal)) {
      showError(String(err.message || err));
    }
  } finally {
    setAnalysisRunning(false);
    setAnalysisAbortController(null);
    setAnalyzeButtonIdle();
    hideProgress();
  }
}
