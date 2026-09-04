import { isFileProtocol, initFileProtocolGuard, initAnalyzeModeBanner } from "../shared/demo-guards.js";
import { extractFrames } from "../shared/video-frames.js";
import { renderQuestionsEditor, renderEventsEditor } from "../shared/sop-editor.js";

const SOP_DRAFT_STORAGE_KEY = "videoAnalysis.sopDraft.v1";
const MAX_DRAFT_FRAMES = 8;

const videoInput = document.getElementById("videoInput");
const sampleIntervalInput = document.getElementById("sampleInterval");
const workContextInput = document.getElementById("workContext");
const generateBtn = document.getElementById("generateBtn");
const cancelBtn = document.getElementById("cancelBtn");
const statusText = document.getElementById("statusText");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const resultPanel = document.getElementById("resultPanel");
const errorBox = document.getElementById("errorBox");
const sopTitleInput = document.getElementById("sopTitle");
const domainHintInput = document.getElementById("domainHint");
const questionsBody = document.getElementById("questionsBody");
const eventsBody = document.getElementById("eventsBody");
const relationsInput = document.getElementById("relationsInput");

let draftState = {
  sopId: "draft_sop",
  questions: [],
  eventDefs: [],
  relations: [],
  defaults: { order_tolerance_s: 0, min_frames: 1, max_gap_frames: 2 }
};
let draftAbortController = null;
let waitingTimer = null;

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
}
function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}
function setStatus(message) {
  statusText.textContent = message || "";
}

function setProgress(current, total, label) {
  progressWrap.classList.add("active");
  progressWrap.classList.remove("waiting");
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressText.textContent = label || `${current}/${total} (${pct}%)`;
}

function setWaitingProgress(label) {
  progressWrap.classList.add("active", "waiting");
  progressFill.style.width = "40%";
  progressText.textContent = label;
}

function hideProgress() {
  progressWrap.classList.remove("active", "waiting");
  progressFill.style.width = "0%";
  progressText.textContent = "";
  if (waitingTimer) {
    clearInterval(waitingTimer);
    waitingTimer = null;
  }
}

function startWaitingClock(baseLabel) {
  const started = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - started) / 1000);
    setWaitingProgress(`${baseLabel}（経過 ${sec} 秒）`);
  };
  tick();
  waitingTimer = setInterval(tick, 1000);
}

function subsampleFrames(frames, maxCount) {
  if (frames.length <= maxCount) return frames;
  const picked = [];
  for (let i = 0; i < maxCount; i += 1) {
    const index = Math.round(i * (frames.length - 1) / (maxCount - 1));
    picked.push(frames[index]);
  }
  return picked;
}

function syncDraftRelations(text) {
  draftState.relations = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderDraftQuestions() {
  renderQuestionsEditor(draftState.questions, {
    tbody: questionsBody,
    includeValues: false,
    onChange: () => {},
    sync: {
      eventDefs: draftState.eventDefs,
      onEventDefsChanged: () => renderDraftEvents()
    }
  });
}

function renderDraftEvents() {
  renderEventsEditor(draftState.eventDefs, {
    tbody: eventsBody,
    includeMinFrames: false,
    onChange: () => {},
    sync: {
      relationsInput,
      onRelationsChanged: syncDraftRelations
    }
  });
}

function applyDraftToEditor(draft) {
  draftState.sopId = draft.sop?.id || "draft_sop";
  draftState.questions = structuredClone(draft.questions || []);
  draftState.eventDefs = structuredClone(draft.eventDefs || []);
  draftState.defaults = structuredClone(draft.defaults || draftState.defaults);
  draftState.relations = structuredClone(draft.relations || []);
  sopTitleInput.value = draft.sop?.name || "";
  domainHintInput.value = draft.domain_hint || "";
  relationsInput.value = draftState.relations.join("\n");
  renderDraftQuestions();
  renderDraftEvents();
  resultPanel.hidden = false;
}

function readConfigFromEditor() {
  const relations = relationsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    sop: {
      id: draftState.sopId || "draft_sop",
      name: sopTitleInput.value.trim() || "作業チェック草案"
    },
    domain_hint: domainHintInput.value.trim() || "これは作業動画の1フレームです",
    questions: structuredClone(draftState.questions),
    eventDefs: structuredClone(draftState.eventDefs),
    relations,
    defaults: structuredClone(draftState.defaults)
  };
}

function validateConfig(config) {
  if (!config.questions.length) {
    throw new Error("チェック項目を1件以上入力してください。");
  }
  if (config.questions.some((q) => !q.id?.trim() || !q.ask?.trim())) {
    throw new Error("すべてのチェック項目に ID と質問文を入力してください。");
  }
}

async function requestDraft(frames, workContext, signal) {
  const resp = await fetch("/api/vlm/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      images: frames.map((f) => f.image),
      frame_times: frames.map((f) => f.t),
      work_context: workContext
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `草案生成に失敗しました (${resp.status})`);
  }
  if (!data.draft?.questions?.length) {
    throw new Error("草案にチェック項目が含まれていません。");
  }
  return data;
}

async function runDraftGeneration() {
  clearError();
  if (isFileProtocol) {
    showError("file:// では生成できません。server.py 経由で開き直してください。");
    return;
  }
  const file = videoInput.files?.[0];
  if (!file) {
    showError("動画ファイルを選択してください。");
    return;
  }

  draftAbortController = new AbortController();
  const signal = draftAbortController.signal;
  generateBtn.disabled = true;
  cancelBtn.hidden = false;
  setStatus("");
  setProgress(0, 1, "準備中…");

  try {
    const interval = Math.max(0.5, parseFloat(sampleIntervalInput.value) || 1);
    const allFrames = await extractFrames(file, interval, {
      signal,
      onProgress: setProgress
    });
    const frames = subsampleFrames(allFrames, MAX_DRAFT_FRAMES);
    setProgress(1, 1, `抽出完了（${allFrames.length} → 送信 ${frames.length} フレーム）`);
    setStatus(`${frames.length} フレームを VLM に送信中…`);
    startWaitingClock("VLM が草案を生成中…（数十秒かかることがあります）");
    const result = await requestDraft(frames, workContextInput.value.trim(), signal);
    hideProgress();
    setProgress(1, 1, "完了");
    applyDraftToEditor(result.draft);
    setStatus(`草案を生成しました（${result.draft.questions.length} 項目）。内容を確認してからチェック画面へ進んでください。`);
    setTimeout(hideProgress, 800);
  } catch (err) {
    hideProgress();
    if (err.name === "AbortError") {
      setStatus("キャンセルしました。");
    } else {
      showError(err.message || String(err));
      setStatus("");
    }
  } finally {
    generateBtn.disabled = false;
    cancelBtn.hidden = true;
    draftAbortController = null;
  }
}

function saveDraftForReplay(config) {
  localStorage.setItem(SOP_DRAFT_STORAGE_KEY, JSON.stringify(config));
  window.location.href = "/replay.html?from=draft";
}

function copyDraftJson(config) {
  const text = JSON.stringify(config, null, 2);
  return navigator.clipboard.writeText(text);
}

function downloadDraftJson(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${config.sop?.id || "draft"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

initFileProtocolGuard({
  warningEl: document.getElementById("fileProtocolWarning"),
  disableEls: [generateBtn]
});
void initAnalyzeModeBanner({
  warningWrap: document.getElementById("mockModeWarning"),
  warningText: document.getElementById("mockModeText"),
  mockMessage: "モックモード: 草案は固定サンプルを返します（VLM_USE_MOCK=1）。"
});

generateBtn.addEventListener("click", () => { void runDraftGeneration(); });
cancelBtn.addEventListener("click", () => draftAbortController?.abort());
document.getElementById("addQuestionBtn").addEventListener("click", () => {
  draftState.questions.push({
    id: `item_${draftState.questions.length + 1}`,
    ask: "",
    values: ["yes", "no"]
  });
  renderDraftQuestions();
});
document.getElementById("addEventBtn").addEventListener("click", () => {
  draftState.eventDefs.push({
    name: `event_${draftState.eventDefs.length + 1}`,
    evidence: "item_1==yes",
    occurrence: 1,
    min_frames: 1
  });
  renderDraftEvents();
});
document.getElementById("openCheckBtn").addEventListener("click", () => {
  try {
    const config = readConfigFromEditor();
    validateConfig(config);
    saveDraftForReplay(config);
  } catch (err) {
    showError(err.message || String(err));
  }
});
document.getElementById("copyJsonBtn").addEventListener("click", async () => {
  try {
    const config = readConfigFromEditor();
    validateConfig(config);
    await copyDraftJson(config);
    setStatus("JSON をクリップボードにコピーしました。");
  } catch (err) {
    showError(err.message || String(err));
  }
});
document.getElementById("downloadJsonBtn").addEventListener("click", () => {
  try {
    const config = readConfigFromEditor();
    validateConfig(config);
    downloadDraftJson(config);
  } catch (err) {
    showError(err.message || String(err));
  }
});

document.querySelectorAll(".help-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const topic = btn.getAttribute("data-help");
    const messages = {
      "video-setup": "作業動画から数秒おきに画像を抜き出し、AI に「何をチェックすべきか」の草案を作らせます。作業の説明を書くと精度が上がりやすいです。",
      "draft-edit": "生成された項目はあくまで草案です。動作や状態が見える質問を優先し、単なる「置かれているか」だけの項目は見直してください。イベントと relations は誤っていることがあるので、チェック画面へ渡す前に直してください。"
    };
    window.alert(messages[topic] || "説明は準備中です。");
  });
});
