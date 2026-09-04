export const isFileProtocol = window.location.protocol === "file:";

export function initFileProtocolGuard({ warningEl, disableEls = [] }) {
  if (!isFileProtocol) return;
  if (warningEl) {
    warningEl.classList.add("active");
    warningEl.hidden = false;
  }
  for (const el of disableEls) {
    if (el) el.disabled = true;
  }
}

export async function initAnalyzeModeBanner({ warningWrap, warningText, mockMessage }) {
  if (isFileProtocol) return;
  try {
    const resp = await fetch("/api/status");
    if (!resp.ok) return;
    const status = await resp.json();
    if (status.mode === "mock") {
      if (warningText) {
        if (mockMessage) {
          warningText.innerHTML = mockMessage;
        } else {
          warningText.textContent = "モックモードです。";
        }
      }
      if (warningWrap) {
        warningWrap.classList.add("active");
        warningWrap.hidden = false;
      }
    } else if (status.mode === "error") {
      if (warningText) {
        warningText.textContent = "";
        const strong = document.createElement("strong");
        strong.textContent = "VLM バックエンド未設定:";
        warningText.append(strong, " ", document.createTextNode(String(status.message || "")));
      }
      if (warningWrap) {
        warningWrap.classList.add("active");
        warningWrap.hidden = false;
      }
    }
  } catch {
    // ignore
  }
}
