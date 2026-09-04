import { escapeHtml } from "./html.js";

function createRemoveButton(onRemove) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "削除";
  btn.addEventListener("click", onRemove);
  return btn;
}

export function renderQuestionsEditor(questions, { tbody, includeValues = false, onChange }) {
  tbody.innerHTML = "";
  questions.forEach((q, index) => {
    const tr = document.createElement("tr");
    if (includeValues) {
      const idTd = document.createElement("td");
      const askTd = document.createElement("td");
      const valuesTd = document.createElement("td");
      const actionsTd = document.createElement("td");
      actionsTd.className = "table-actions";

      const idInput = document.createElement("input");
      idInput.type = "text";
      idInput.value = q.id;
      idInput.addEventListener("change", () => {
        q.id = idInput.value.trim();
        onChange?.();
      });

      const askInput = document.createElement("input");
      askInput.type = "text";
      askInput.value = q.ask;
      askInput.addEventListener("change", () => {
        q.ask = askInput.value;
        onChange?.();
      });

      const valuesInput = document.createElement("input");
      valuesInput.type = "text";
      valuesInput.value = q.values.join(", ");
      valuesInput.addEventListener("change", () => {
        q.values = valuesInput.value.split(",").map(v => v.trim()).filter(Boolean);
        onChange?.();
      });

      idTd.appendChild(idInput);
      askTd.appendChild(askInput);
      valuesTd.appendChild(valuesInput);
      actionsTd.appendChild(createRemoveButton(() => {
        questions.splice(index, 1);
        renderQuestionsEditor(questions, { tbody, includeValues, onChange });
        onChange?.();
      }));

      tr.append(idTd, askTd, valuesTd, actionsTd);
    } else {
      tr.innerHTML = `
      <td><input type="text" data-field="id" value="${escapeHtml(q.id)}"></td>
      <td><input type="text" data-field="ask" value="${escapeHtml(q.ask)}"></td>
      <td class="table-actions"><button type="button" data-action="remove">削除</button></td>
    `;
      tr.querySelector('[data-field="id"]').addEventListener("input", (e) => {
        q.id = e.target.value;
        onChange?.();
      });
      tr.querySelector('[data-field="ask"]').addEventListener("input", (e) => {
        q.ask = e.target.value;
        onChange?.();
      });
      tr.querySelector('[data-action="remove"]').addEventListener("click", () => {
        questions.splice(index, 1);
        renderQuestionsEditor(questions, { tbody, includeValues, onChange });
        onChange?.();
      });
    }
    tbody.appendChild(tr);
  });
}

export function renderEventsEditor(eventDefs, { tbody, includeMinFrames = false, onChange }) {
  tbody.innerHTML = "";
  eventDefs.forEach((ev, index) => {
    const tr = document.createElement("tr");
    if (includeMinFrames) {
      const nameTd = document.createElement("td");
      const evidenceTd = document.createElement("td");
      const occTd = document.createElement("td");
      const actionsTd = document.createElement("td");
      actionsTd.className = "table-actions";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = ev.name;
      nameInput.addEventListener("change", () => {
        ev.name = nameInput.value.trim();
        onChange?.();
      });

      const evidenceInput = document.createElement("input");
      evidenceInput.type = "text";
      evidenceInput.value = ev.evidence;
      evidenceInput.addEventListener("change", () => {
        ev.evidence = evidenceInput.value.trim();
        onChange?.();
      });

      const minFramesTd = document.createElement("td");
      const minFramesInput = document.createElement("input");
      minFramesInput.type = "number";
      minFramesInput.min = "1";
      minFramesInput.value = ev.min_frames != null ? String(ev.min_frames) : "";
      minFramesInput.placeholder = "—";
      minFramesInput.style.width = "64px";
      minFramesInput.addEventListener("change", () => {
        const raw = minFramesInput.value.trim();
        if (!raw) {
          delete ev.min_frames;
          onChange?.();
          return;
        }
        ev.min_frames = Math.max(1, parseInt(raw, 10) || 1);
        onChange?.();
      });

      const occInput = document.createElement("input");
      occInput.type = "number";
      occInput.min = "1";
      occInput.value = String(ev.occurrence || 1);
      occInput.style.width = "64px";
      occInput.addEventListener("change", () => {
        ev.occurrence = Math.max(1, parseInt(occInput.value, 10) || 1);
        onChange?.();
      });

      nameTd.appendChild(nameInput);
      evidenceTd.appendChild(evidenceInput);
      minFramesTd.appendChild(minFramesInput);
      occTd.appendChild(occInput);
      actionsTd.appendChild(createRemoveButton(() => {
        eventDefs.splice(index, 1);
        renderEventsEditor(eventDefs, { tbody, includeMinFrames, onChange });
        onChange?.();
      }));

      tr.append(nameTd, evidenceTd, minFramesTd, occTd, actionsTd);
    } else {
      tr.innerHTML = `
      <td><input type="text" data-field="name" value="${escapeHtml(ev.name)}"></td>
      <td><input type="text" data-field="evidence" value="${escapeHtml(ev.evidence)}"></td>
      <td><input type="number" data-field="occurrence" min="1" value="${ev.occurrence ?? 1}"></td>
      <td class="table-actions"><button type="button" data-action="remove">削除</button></td>
    `;
      ["name", "evidence", "occurrence"].forEach((field) => {
        tr.querySelector(`[data-field="${field}"]`).addEventListener("input", (e) => {
          eventDefs[index][field] = field === "occurrence"
            ? Math.max(1, parseInt(e.target.value, 10) || 1)
            : e.target.value;
          onChange?.();
        });
      });
      tr.querySelector('[data-action="remove"]').addEventListener("click", () => {
        eventDefs.splice(index, 1);
        renderEventsEditor(eventDefs, { tbody, includeMinFrames, onChange });
        onChange?.();
      });
    }
    tbody.appendChild(tr);
  });
}
