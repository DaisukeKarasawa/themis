export const DEFAULT_TITLE = "動画SOPチェックデモ";
export const SOP_DRAFT_STORAGE_KEY = "videoAnalysis.sopDraft.v1";
export const GROUNDING_OVERLAY_DEFAULT_ON = true;

export let DATA = null;
export let notOnly = new Set();
export let idx = 0;
export let playing = false;
export const groundingInFlight = new Set();
export let timer = null;
export let analysisAbortController = null;
export let analysisRunning = false;

export const editorState = {
  sopId: "custom_sop",
  questions: [],
  eventDefs: [],
  defaults: { order_tolerance_s: 0, min_frames: 1, max_gap_frames: 2 }
};

export function setDATA(value) {
  DATA = value;
}

export function setNotOnly(value) {
  notOnly = value;
}

export function setIdx(value) {
  idx = value;
}

export function setPlaying(value) {
  playing = value;
}

export function setTimer(value) {
  timer = value;
}

export function setAnalysisAbortController(value) {
  analysisAbortController = value;
}

export function setAnalysisRunning(value) {
  analysisRunning = value;
}
