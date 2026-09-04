export function waitForVideoEvent(target, eventName, signal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("動画の読み込みに失敗しました。"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    target.addEventListener(eventName, onEvent);
    target.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
  });
}

export async function extractFrames(videoFile, intervalSec, options = {}) {
  const { signal, onProgress, frameExtra } = options;
  intervalSec = Math.max(0.5, parseFloat(intervalSec) || 1);
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  try {
    await waitForVideoEvent(video, "loadedmetadata", signal);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("動画の長さを取得できませんでした。");
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames = [];
    const totalSteps = Math.max(1, Math.floor(duration / intervalSec) + 1);

    for (let t = 0; t <= duration + 0.001; t += intervalSec) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const target = Math.min(t, duration);
      if (Math.abs(video.currentTime - target) > 1e-3) {
        video.currentTime = target;
        await waitForVideoEvent(video, "seeked", signal);
      } else {
        video.currentTime = target;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      frames.push({
        idx: frames.length,
        t: Math.round(video.currentTime * 10) / 10,
        image: canvas.toDataURL("image/jpeg", 0.85),
        raw: "",
        answers: {},
        probs: {},
        groundings: {},
        ...(frameExtra ? frameExtra() : {})
      });
      onProgress?.(frames.length, totalSteps, `フレーム抽出中… ${frames.length} / 約${totalSteps}`);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
