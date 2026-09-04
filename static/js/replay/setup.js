import { isFileProtocol, initFileProtocolGuard, initAnalyzeModeBanner } from "../shared/demo-guards.js";
import { renderQuestionsEditor, renderEventsEditor } from "../shared/sop-editor.js";
import { SOP_ASSETS } from "./presets.js";
import {
  editorState,
  SOP_DRAFT_STORAGE_KEY,
  analysisRunning,
  analysisAbortController
} from "./state.js";
import { renderHistoryLists } from "./history.js";
import { runAnalysis } from "./analysis.js";
import { showSetup } from "./view.js";

const videoInput = document.getElementById("videoInput");
const apiUrlInput = document.getElementById("apiUrl");
const assetCards = document.getElementById("assetCards");
const sampleIntervalInput = document.getElementById("sampleInterval");
const sopTitleInput = document.getElementById("sopTitle");
const domainHintInput = document.getElementById("domainHint");
const relationsInput = document.getElementById("relationsInput");
const defaultOrderToleranceInput = document.getElementById("defaultOrderTolerance");
const defaultMinFramesInput = document.getElementById("defaultMinFrames");
const defaultMaxGapFramesInput = document.getElementById("defaultMaxGapFrames");
const analyzeBtn = document.getElementById("analyzeBtn");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const errorBox = document.getElementById("errorBox");
const fileProtocolWarning = document.getElementById("fileProtocolWarning");
const mockModeWarning = document.getElementById("mockModeWarning");
const mockModeText = document.getElementById("mockModeText");
const questionsBody = document.getElementById("questionsBody");
const eventsBody = document.getElementById("eventsBody");

function onEditorChange() {
  editorState.sopId = "custom_sop";
  renderAssetCards();
}

export function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add("active");
}

export function clearError() {
  errorBox.textContent = "";
  errorBox.classList.remove("active");
}

export function setProgress(current, total, label) {
  progressWrap.classList.add("active");
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressText.textContent = label || `${current}/${total} (${pct}%)`;
}

export function hideProgress() {
  progressWrap.classList.remove("active");
}

export function setAnalyzeButtonIdle() {
  analyzeBtn.textContent = "分析開始";
  analyzeBtn.classList.remove("danger");
  analyzeBtn.classList.add("primary");
  analyzeBtn.disabled = !(videoInput.files && videoInput.files.length > 0);
}

export function setAnalyzeButtonCancel() {
  analyzeBtn.textContent = "キャンセル";
  analyzeBtn.classList.remove("primary");
  analyzeBtn.classList.add("danger");
  analyzeBtn.disabled = false;
}

function cancelAnalysis() {
  analysisAbortController?.abort();
}

function readDefaultsFromEditor() {
  return {
    order_tolerance_s: Math.max(0, parseFloat(defaultOrderToleranceInput.value) || 0),
    min_frames: Math.max(1, parseInt(defaultMinFramesInput.value, 10) || 1),
    max_gap_frames: Math.max(0, parseInt(defaultMaxGapFramesInput.value, 10) || 0)
  };
}

function applyDefaultsToEditor(defaults = {}) {
  editorState.defaults = {
    order_tolerance_s: defaults.order_tolerance_s ?? 0,
    min_frames: defaults.min_frames ?? 1,
    max_gap_frames: defaults.max_gap_frames ?? 2
  };
  defaultOrderToleranceInput.value = String(editorState.defaults.order_tolerance_s);
  defaultMinFramesInput.value = String(editorState.defaults.min_frames);
  defaultMaxGapFramesInput.value = String(editorState.defaults.max_gap_frames);
}

function isEditorDirty() {
  return editorState.questions.length > 0
    || editorState.eventDefs.length > 0
    || relationsInput.value.trim()
    || sopTitleInput.value.trim()
    || domainHintInput.value.trim();
}

export function applyConfigToEditor(config) {
  editorState.sopId = config.sop?.id || "custom_sop";
  editorState.questions = structuredClone(config.questions || []);
  editorState.eventDefs = structuredClone(config.eventDefs || []);
  renderQuestionsEditor(editorState.questions, {
    tbody: questionsBody,
    includeValues: true,
    onChange: onEditorChange
  });
  renderEventsEditor(editorState.eventDefs, {
    tbody: eventsBody,
    includeMinFrames: true,
    onChange: onEditorChange
  });
  relationsInput.value = (config.relations || []).join("\n");
  applyDefaultsToEditor(config.defaults || {});
  sopTitleInput.value = config.sop?.name || "";
  domainHintInput.value = config.domain_hint || "";
  clearError();
}

function tryApplyDraftFromStorage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("from") !== "draft") return;

  const raw = localStorage.getItem(SOP_DRAFT_STORAGE_KEY);
  if (!raw) return;

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.warn("草案の読み込みに失敗しました:", err);
    return;
  }

  if (isEditorDirty()) {
    const ok = window.confirm(
      "草案をチェック画面に読み込みます。現在の設定を上書きします。よろしいですか？"
    );
    if (!ok) return;
  }

  applyConfigToEditor(config);
  renderAssetCards(config.sop?.id || editorState.sopId);
  localStorage.removeItem(SOP_DRAFT_STORAGE_KEY);
  showSetup();
  history.replaceState({}, "", window.location.pathname);
}

function applyAssetConfig(asset) {
  if (!asset) return;
  if (isEditorDirty()) {
    const ok = window.confirm(
      `現在の設定をすべて破棄し、「${asset.label}」の設定で置き換えます。よろしいですか？`
    );
    if (!ok) return;
  }

  applyConfigToEditor(asset);
  renderAssetCards(asset.id);
}

export function renderAssetCards(selectedAssetId = editorState.sopId) {
  assetCards.innerHTML = "";
  SOP_ASSETS.forEach(asset => {
    const card = document.createElement("article");
    card.className = "asset-card" + (asset.id === selectedAssetId ? " active" : "");
    card.innerHTML = `
      <h3>${asset.label}</h3>
      <p>${asset.description}</p>
      <span class="asset-meta">${asset.questions.length}項目 / ${asset.eventDefs.length}イベント</span>
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "このシナリオを使う";
    button.addEventListener("click", () => applyAssetConfig(asset));
    card.appendChild(button);
    assetCards.appendChild(card);
  });
}

export function readConfigFromEditor() {
  const relations = relationsInput.value
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  return {
    sop: { id: editorState.sopId || "custom_sop", name: sopTitleInput.value.trim() || "カスタムSOP" },
    questions: structuredClone(editorState.questions),
    relations,
    eventDefs: structuredClone(editorState.eventDefs),
    defaults: readDefaultsFromEditor(),
    domain_hint: domainHintInput.value.trim() || "これは作業動画の1フレームです"
  };
}

export function initSetup() {
  initFileProtocolGuard({
    warningEl: fileProtocolWarning,
    disableEls: [analyzeBtn]
  });
  void initAnalyzeModeBanner({
    warningWrap: mockModeWarning,
    warningText: mockModeText,
    mockMessage:
      "<strong>モックモードです。</strong> 全項目 <code>no</code> を返します。ローカル VLM を使うには <code>VLM_USE_MOCK</code> を外して server.py を再起動してください。"
  });

  renderAssetCards();
  renderQuestionsEditor(editorState.questions, {
    tbody: questionsBody,
    includeValues: true,
    onChange: onEditorChange
  });
  renderEventsEditor(editorState.eventDefs, {
    tbody: eventsBody,
    includeMinFrames: true,
    onChange: onEditorChange
  });
  renderHistoryLists();
  relationsInput.value = "";
  applyDefaultsToEditor();
  sopTitleInput.value = "";
  domainHintInput.value = "";

  document.getElementById("addQuestionBtn").addEventListener("click", () => {
    editorState.sopId = "custom_sop";
    editorState.questions.push({ id: "item_" + (editorState.questions.length + 1), ask: "", values: ["yes", "no"] });
    renderQuestionsEditor(editorState.questions, {
      tbody: questionsBody,
      includeValues: true,
      onChange: onEditorChange
    });
    renderAssetCards();
  });

  document.getElementById("addEventBtn").addEventListener("click", () => {
    editorState.sopId = "custom_sop";
    editorState.eventDefs.push({ name: "event_" + (editorState.eventDefs.length + 1), evidence: "item_1==yes", occurrence: 1 });
    renderEventsEditor(editorState.eventDefs, {
      tbody: eventsBody,
      includeMinFrames: true,
      onChange: onEditorChange
    });
    renderAssetCards();
  });

  videoInput.addEventListener("change", () => {
    if (!analysisRunning) setAnalyzeButtonIdle();
  });

  analyzeBtn.addEventListener("click", () => {
    if (analysisRunning) {
      cancelAnalysis();
    } else {
      void runAnalysis({
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
      });
    }
  });

  document.getElementById("sopName").addEventListener("click", () => {
    if (document.getElementById("replayMain").classList.contains("visible")) {
      showSetup();
    }
  });

  tryApplyDraftFromStorage();
}
