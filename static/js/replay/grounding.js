import {
  DATA,
  idx,
  GROUNDING_OVERLAY_DEFAULT_ON,
  groundingInFlight
} from "./state.js";

export function collectYesQuestionIds(answers) {
  return Object.entries(answers || {})
    .filter(([, value]) => value === "yes")
    .map(([id]) => id);
}

export function mergeGroundingEntries(existing, incoming, defaultSource) {
  const merged = { ...(existing || {}) };
  for (const [qid, entry] of Object.entries(incoming || {})) {
    merged[qid] = {
      ...entry,
      source: entry.source || defaultSource
    };
  }
  return merged;
}

export async function analyzeFrameGrounding(frame, groundForIds, questions, apiUrl, domainHint, signal, source = "analyze") {
  if (!groundForIds.length) return {};
  const subset = questions.filter(q => groundForIds.includes(q.id));
  let resp;
  try {
    resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: frame.image,
        questions: subset,
        ground_for: groundForIds,
        t: frame.t,
        domain_hint: domainHint,
        grounding_source: source
      }),
      signal
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error(`Grounding fetch failed: ${err.message || err}`);
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
    throw new Error(`Grounding API error ${resp.status}: ${msg}`);
  }
  const data = await resp.json();
  return data.groundings || {};
}

export function renderGroundingOverlays(frame) {
  const layer = document.getElementById("groundingLayer");
  const toggle = document.getElementById("groundingToggle");
  if (!layer) return;
  layer.innerHTML = "";
  if (!toggle?.checked || !frame || !DATA) {
    layer.hidden = true;
    return;
  }
  let any = false;
  for (const q of DATA.questions) {
    if (frame.answers?.[q.id] !== "yes") continue;
    const g = frame.groundings?.[q.id];
    if (!g || g.status !== "ok" || !Array.isArray(g.bbox) || g.bbox.length !== 4) continue;
    const [x1, y1, x2, y2] = g.bbox;
    const box = document.createElement("div");
    box.className = "grounding-box";
    box.style.left = `${x1 * 100}%`;
    box.style.top = `${y1 * 100}%`;
    box.style.width = `${(x2 - x1) * 100}%`;
    box.style.height = `${(y2 - y1) * 100}%`;
    box.dataset.label = q.id;
    layer.appendChild(box);
    any = true;
  }
  layer.hidden = !any;
}

export async function ensureFrameGroundings(frameIndex) {
  if (!GROUNDING_OVERLAY_DEFAULT_ON || !DATA?.frames?.[frameIndex]) return;
  const toggle = document.getElementById("groundingToggle");
  if (!toggle?.checked) return;

  const frame = DATA.frames[frameIndex];
  const yesIds = collectYesQuestionIds(frame.answers);
  const missing = yesIds.filter(qid => {
    const g = frame.groundings?.[qid];
    return !g || g.status !== "ok" || !g.bbox;
  });
  if (missing.length === 0) return;

  const flightKey = `${frameIndex}:${missing.sort().join(",")}`;
  if (groundingInFlight.has(flightKey)) return;
  groundingInFlight.add(flightKey);

  try {
    const apiUrlInput = document.getElementById("apiUrl");
    const domainHintInput = document.getElementById("domainHint");
    const apiUrl = apiUrlInput?.value.trim() || "/api/vlm/analyze";
    const domainHint = domainHintInput?.value.trim() || "これは作業動画の1フレームです";
    const groundings = await analyzeFrameGrounding(
      frame,
      missing,
      DATA.questions,
      apiUrl,
      domainHint,
      null,
      "on_demand"
    );
    frame.groundings = mergeGroundingEntries(frame.groundings, groundings, "on_demand");
    for (const qid of missing) {
      if (!frame.groundings[qid]) {
        frame.groundings[qid] = { status: "failed", source: "on_demand" };
      }
    }
    if (frameIndex === idx) renderGroundingOverlays(frame);
  } catch (err) {
    console.warn("on-demand grounding failed", err);
    frame.groundings = frame.groundings || {};
    for (const qid of missing) {
      if (!frame.groundings[qid]) {
        frame.groundings[qid] = { status: "failed", source: "on_demand" };
      }
    }
  } finally {
    groundingInFlight.delete(flightKey);
  }
}
