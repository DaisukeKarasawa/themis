export function waitForVideoEvent(target, eventName) {
  return new Promise((resolve) => {
    const handler = () => {
      target.removeEventListener(eventName, handler);
      resolve();
    };
    target.addEventListener(eventName, handler);
  });
}

export async function extractFrames(videoFile, intervalSec, options = {}) {
  const { signal, onProgress, frameExtra } = options;
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  await waitForVideoEvent(video, "loadedmetadata");
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("動画の長さを取得できませんでした。");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const frames = [];
  const totalSteps = Math.max(1, Math.floor(duration / intervalSec) + 1);

  for (let t = 0; t <= duration + 0.001; t += intervalSec) {
    if (signal?.aborted) {
      URL.revokeObjectURL(url);
      throw new DOMException("Aborted", "AbortError");
    }
    const target = Math.min(t, duration);
    if (Math.abs(video.currentTime - target) > 1e-3) {
      video.currentTime = target;
      await waitForVideoEvent(video, "seeked");
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

  URL.revokeObjectURL(url);
  return frames;
}
