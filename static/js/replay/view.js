import { escapeHtml } from "../shared/html.js";
import {
  DATA,
  notOnly,
  idx,
  playing,
  timer,
  DEFAULT_TITLE,
  GROUNDING_OVERLAY_DEFAULT_ON,
  setDATA,
  setNotOnly,
  setIdx,
  setPlaying,
  setTimer
} from "./state.js";
import { renderHistoryLists } from "./history.js";
import { closeHelp } from "./help.js";
import { renderGroundingOverlays, ensureFrameGroundings } from "./grounding.js";

const sopName = document.getElementById("sopName");
const replaySopName = document.getElementById("replaySopName");
const setupPanel = document.getElementById("setupPanel");
const replayMain = document.getElementById("replayMain");
const scrubber = document.getElementById("scrubber");

function setCoverageDisplay(pct) {
  const rounded = Math.round(pct);
  const wrap = document.getElementById("coverageWrap");
  const ring = document.getElementById("coverageRing");
  document.getElementById("coverage").textContent = `coverage ${rounded}%`;
  wrap.hidden = false;
  ring.style.setProperty("--pct", rounded);
  ring.classList.remove("ok", "warn", "bad");
  if (rounded >= 100) ring.classList.add("ok");
  else if (rounded >= 80) ring.classList.add("warn");
  else ring.classList.add("bad");
  ring.setAttribute("aria-label", `coverage ${rounded}%`);
}

function clearCoverageDisplay() {
  document.getElementById("coverage").textContent = "";
  const wrap = document.getElementById("coverageWrap");
  const ring = document.getElementById("coverageRing");
  wrap.hidden = true;
  ring.style.removeProperty("--pct");
  ring.classList.remove("ok", "warn", "bad");
  ring.removeAttribute("aria-label");
}

function setVerdictBadgeDisplay(_coverage, verdict) {
  const badge = document.getElementById("verdictBadge");
  badge.hidden = false;
  if (verdict === "PASS") {
    badge.textContent = "PASS";
    badge.className = "badge pass";
  } else {
    badge.textContent = "FAIL";
    badge.className = "badge fail";
  }
}

export function updateHeader() {
  sopName.textContent = DEFAULT_TITLE;
  replaySopName.textContent = DATA.sop.name;
  setCoverageDisplay(DATA.coverage * 100);
  setVerdictBadgeDisplay(DATA.coverage, DATA.verdict);
}

function relationKind(rel) {
  const trimmed = String(rel).trim();
  if (/^not\s+/i.test(trimmed)) return { kind: "not", label: "禁止" };
  if (/\s+before\s+/i.test(trimmed)) return { kind: "before", label: "順序" };
  if (/\s+overlaps\s+/i.test(trimmed)) return { kind: "overlaps", label: "同時" };
  return { kind: "unknown", label: "関係" };
}

function appendRelationRow(container, rel, passed, message) {
  const kind = relationKind(rel);
  const row = document.createElement("div");
  row.className = "rrow " + (passed == null ? "neutral" : passed ? "pass" : "fail");

  const head = document.createElement("div");
  head.className = "rhead";

  const relWrap = document.createElement("div");
  relWrap.className = "rrel-wrap";
  const code = document.createElement("code");
  code.className = "rrel";
  code.textContent = rel;
  const kindEl = document.createElement("span");
  kindEl.className = "rkind " + kind.kind;
  kindEl.textContent = kind.label;
  relWrap.appendChild(code);
  relWrap.appendChild(kindEl);

  const badge = document.createElement("span");
  badge.className = "rbadge " + (passed == null ? "" : passed ? "pass" : "fail");
  badge.textContent = passed == null ? "—" : passed ? "PASS" : "FAIL";

  head.appendChild(relWrap);
  head.appendChild(badge);
  row.appendChild(head);

  if (message) {
    const detail = document.createElement("div");
    detail.className = "rdetail";
    detail.textContent = message;
    row.appendChild(detail);
  }

  container.appendChild(row);
}

export function renderRelationResults() {
  const panel = document.getElementById("relationsPanel");
  const summaryEl = document.getElementById("relationsSummary");
  const box = document.getElementById("relationResults");
  if (!panel || !summaryEl || !box) return;

  const relations = DATA?.relations || [];
  const results = DATA?.relationResults;

  if (relations.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  box.innerHTML = "";

  if (Array.isArray(results) && results.length > 0) {
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    summaryEl.className = "relations-summary " + (passed === total ? "all-pass" : "has-fail");
    summaryEl.textContent = `${passed} / ${total} ルールを満たしています`;

    results.forEach(r => {
      appendRelationRow(box, r.relation, r.passed, r.message);
    });
    return;
  }

  summaryEl.className = "relations-summary none";
  summaryEl.textContent = "評価結果がありません。再分析すると各ルールの PASS/FAIL が表示されます。";
  relations.forEach(rel => appendRelationRow(box, rel, null, ""));
}

function detectionStatForQuestion(questionId) {
  return DATA?.detection?.stats?.find(s => s.id === questionId) ?? null;
}

function renderAllNoWarning() {
  const box = document.getElementById("allNoWarning");
  if (!box) return;
  if (!DATA?.detection?.allNo) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent =
    "全フレームで全項目 no です。モックモードか、動画の前提説明・質問文・サンプリング間隔(0.5秒など)を見直してください。";
}

function questionById(questionId) {
  return DATA.questions.find(q => q.id === questionId) || null;
}

function formatEvidence(evidence) {
  if (!evidence) return "";

  const clauses = String(evidence).split(/\s+and\s+/);
  const formatted = clauses.map(clause => {
    const match = /^(\w+)==(\w+)$/.exec(clause.trim());
    if (!match) return escapeHtml(clause.trim());

    const [, questionId, expectedValue] = match;
    const question = questionById(questionId);
    if (!question) return escapeHtml(clause.trim());

    return `${escapeHtml(clause.trim())}<span class="qref">根拠: 項目 ${escapeHtml(question.id)}「${escapeHtml(question.ask)}」が ${escapeHtml(expectedValue)}</span>`;
  });

  return formatted.join('<span class="qref"> and </span>');
}

function pillClass(v) {
  if (v === "yes") return "pill yes";
  if (v === "unclear") return "pill unclear";
  return "pill no";
}

function renderQuestions(frame) {
  const box = document.getElementById("questions");
  box.innerHTML = "";
  DATA.questions.forEach(q => {
    const val = frame.answers[q.id] ?? "?";
    const prob = frame.probs[q.id] ? frame.probs[q.id][val] : null;
    const stat = detectionStatForQuestion(q.id);
    const metaHtml = stat
      ? `<div class="qrow-meta">yes ${stat.yesCount}/${stat.total}</div>`
      : "";
    const row = document.createElement("div");
    row.className = "qrow";
    row.innerHTML = `
      <div class="qrow-main">
        <span class="qask">
          <span class="qid">項目 ${escapeHtml(q.id)}</span>
          <span class="qtext">${escapeHtml(q.ask)}</span>
        </span>
        <span class="prob">${prob != null ? Math.round(prob * 100) + "%" : ""}</span>
        <span class="${pillClass(val)}">${escapeHtml(val)}</span>
      </div>
      ${metaHtml}
    `;
    box.appendChild(row);
  });
}

function renderEvents() {
  const box = document.getElementById("events");
  box.innerHTML = "";
  for (const [name, ev] of Object.entries(DATA.events)) {
    const detected = ev.start_idx !== null;
    const isNotOnly = notOnly.has(name);
    const active = detected && idx >= ev.start_idx && idx <= ev.end_idx;

    let statusText;
    let statusClass;
    if (detected && isNotOnly) {
      statusText = `検出された(本来は起きてはいけない) t=${ev.t}s`;
      statusClass = "missing";
    } else if (detected) {
      statusText = `検出 t=${ev.t}s (frame ${ev.start_idx}-${ev.end_idx})`;
      statusClass = "ok";
    } else if (isNotOnly) {
      statusText = "未検出(これが正しい)";
      statusClass = "correctly-absent";
    } else {
      statusText = "未検出";
      statusClass = "missing";
    }

    const row = document.createElement("div");
    row.className = "erow" + (active ? " active" : "");
    row.innerHTML = `
      <div class="ehead">
        <span class="ename">${escapeHtml(name)}</span>
        <span class="estatus ${statusClass}">${escapeHtml(statusText)}</span>
      </div>
      <div class="evidence">${formatEvidence(ev.evidence)}</div>
      <div class="timeline"></div>
    `;

    const tl = row.querySelector(".timeline");
    if (detected) {
      const span = document.createElement("div");
      span.className = "span";
      span.style.left = (ev.start_idx / DATA.n_frames * 100) + "%";
      span.style.width = ((ev.end_idx - ev.start_idx + 1) / DATA.n_frames * 100) + "%";
      tl.appendChild(span);
    }
    const playhead = document.createElement("div");
    playhead.className = "playhead";
    playhead.style.left = (idx / Math.max(DATA.n_frames - 1, 1) * 100) + "%";
    tl.appendChild(playhead);

    box.appendChild(row);
  }
}

export function render() {
  const frame = DATA.frames[idx];
  document.getElementById("frameImg").src = frame.image;
  document.getElementById("timeLabel").textContent =
    `t=${frame.t.toFixed(1)}s  (${idx + 1}/${DATA.n_frames})`;
  document.getElementById("rawOutput").textContent = frame.raw || "(空)";
  scrubber.max = DATA.n_frames - 1;
  scrubber.value = idx;
  renderQuestions(frame);
  renderEvents();
  renderGroundingOverlays(frame);
  void ensureFrameGroundings(idx);
}

export function stopPlayback() {
  setPlaying(false);
  clearInterval(timer);
  setTimer(null);
  document.getElementById("playBtn").textContent = "▶ 再生";
}

export function step(delta) {
  setIdx(Math.max(0, Math.min(DATA.n_frames - 1, idx + delta)));
  render();
}

function mountReplayView(data) {
  setDATA(data);
  setNotOnly(new Set(
    data.relations
      .map(r => /^\s*not\s+(\S+)\s*$/.exec(r))
      .filter(Boolean)
      .map(m => m[1])
  ));

  setupPanel.style.display = "none";
  replayMain.classList.add("visible");
  sopName.classList.add("nav-link");
  renderHistoryLists();

  setIdx(0);
  updateHeader();
  renderRelationResults();
  renderAllNoWarning();
  const groundingToggle = document.getElementById("groundingToggle");
  if (groundingToggle) {
    groundingToggle.checked = GROUNDING_OVERLAY_DEFAULT_ON;
  }
  render();
}

export async function showReplay(data) {
  mountReplayView(data);
}

export function showSetup() {
  stopPlayback();
  setDATA(null);
  setNotOnly(new Set());
  setupPanel.style.display = "block";
  replayMain.classList.remove("visible");
  sopName.classList.remove("nav-link");
  closeHelp();
  replaySopName.textContent = "";
  renderHistoryLists();
  sopName.textContent = DEFAULT_TITLE;
  clearCoverageDisplay();
  const badge = document.getElementById("verdictBadge");
  badge.hidden = true;
  badge.textContent = "";
  badge.className = "badge pending";
}

export function bindReplayControls() {
  document.getElementById("playBtn").addEventListener("click", () => {
    if (!DATA) return;
    if (playing) { stopPlayback(); return; }
    if (idx >= DATA.n_frames - 1) setIdx(0);
    setPlaying(true);
    document.getElementById("playBtn").textContent = "⏸ 停止";
    setTimer(setInterval(() => {
      if (idx >= DATA.n_frames - 1) { stopPlayback(); return; }
      step(1);
    }, 650));
  });
  document.getElementById("prevBtn").addEventListener("click", () => { stopPlayback(); step(-1); });
  document.getElementById("nextBtn").addEventListener("click", () => { stopPlayback(); step(1); });
  scrubber.addEventListener("input", () => {
    if (!DATA) return;
    stopPlayback();
    setIdx(parseInt(scrubber.value, 10));
    render();
  });
  document.getElementById("groundingToggle")?.addEventListener("change", () => {
    if (!DATA) return;
    renderGroundingOverlays(DATA.frames[idx]);
    if (document.getElementById("groundingToggle")?.checked) {
      void ensureFrameGroundings(idx);
    }
  });
  window.addEventListener("keydown", (e) => {
    if (!DATA) return;
    if (e.key === "ArrowLeft") { stopPlayback(); step(-1); }
    if (e.key === "ArrowRight") { stopPlayback(); step(1); }
    if (e.key === " ") { e.preventDefault(); document.getElementById("playBtn").click(); }
  });
}
