export const HISTORY_STORAGE_KEY = "videoAnalysis.replayHistory.v3";
export const HISTORY_LIMIT = 5;

export function trimHistoryEntries(entries) {
  return entries.slice(-HISTORY_LIMIT).reverse();
}

export function loadStoredHistoryEntries() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredHistoryEntries(entries) {
  const trimmedOldestFirst = entries.slice(-HISTORY_LIMIT);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmedOldestFirst));
}

export function createHistoryEntry(result) {
  const createdAt = new Date().toISOString();
  const hasFrames = Boolean(result.frames?.length);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    title: result.sop?.name || "名称未設定のSOP",
    verdict: result.verdict,
    coverage: result.coverage,
    n_frames: result.n_frames,
    violations: result.violations || [],
    events: result.events || {},
    hasFrames,
    ...(hasFrames ? { result } : {})
  };
}

export function saveResultToHistory(result) {
  try {
    const history = loadStoredHistoryEntries();
    writeStoredHistoryEntries([...history, createHistoryEntry(result)]);
    renderHistoryLists();
    return true;
  } catch (err) {
    console.warn("履歴の保存に失敗しました。localStorage の容量上限に達した可能性があります。", err);
    return false;
  }
}

export function formatHistoryTimestamp(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function entryNeedsSummaryAlert(entry) {
  if (!entry.hasFrames || !entry.result) return true;
  const relations = entry.result.relations || [];
  const results = entry.result.relationResults;
  if (relations.length > 0 && !(Array.isArray(results) && results.length > 0)) {
    return true;
  }
  return false;
}

export function renderHistoryList(container) {
  container.innerHTML = "";
  const entries = trimHistoryEntries(loadStoredHistoryEntries());
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "まだ実行履歴はありません。";
    container.appendChild(empty);
    return;
  }

  entries.forEach(entry => {
    const row = document.createElement("div");
    row.className = "history-row";

    const main = document.createElement("span");
    main.className = "history-main";

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = entry.title || "名称未設定のSOP";

    const meta = document.createElement("span");
    meta.className = "history-meta";
    const coveragePct = Math.round((entry.coverage || 0) * 100);
    meta.textContent = `${formatHistoryTimestamp(entry.createdAt)} / ${entry.verdict || "判定なし"} / coverage ${coveragePct}% / ${entry.n_frames || 0}フレーム`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "表示";
    button.addEventListener("click", async () => {
      if (entry.hasFrames && entry.result && !entryNeedsSummaryAlert(entry)) {
        const { stopPlayback, showReplay } = await import("./view.js");
        stopPlayback();
        await showReplay(entry.result);
        return;
      }
      showHistorySummary(entry);
    });

    main.append(title, meta);
    row.append(main, button);
    container.appendChild(row);
  });
}

export function renderHistoryLists() {
  renderHistoryList(document.getElementById("historyList"));
  renderHistoryList(document.getElementById("replayHistoryList"));
}

export function showHistorySummary(entry) {
  const coveragePct = Math.round((entry.coverage || 0) * 100);
  const violations = (entry.violations || []).slice(0, 8);
  const violationText = violations.length > 0
    ? violations.map(v => `・${v}`).join("\n")
    : "違反なし";
  const moreViolations = (entry.violations || []).length > violations.length
    ? `\n…他 ${entry.violations.length - violations.length} 件`
    : "";
  window.alert(
    `${entry.title || "名称未設定のSOP"}\n`
    + `${formatHistoryTimestamp(entry.createdAt)} / ${entry.verdict || "判定なし"} / coverage ${coveragePct}% / ${entry.n_frames || 0}フレーム\n\n`
    + "フレーム画像は履歴に保存していません。再生するには同じ動画で再分析してください。\n\n"
    + `違反:\n${violationText}${moreViolations}`
  );
}
