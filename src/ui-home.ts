export function renderHomeScript(): string {
  return `(() => {
  const capacityEl = document.getElementById("capacity");
  const csvFileEl = document.getElementById("csvFile");
  const csvApplyBtn = document.getElementById("csvApplyBtn");
  const csvStatusEl = document.getElementById("csvStatus");
  const questionsEl = document.getElementById("questions");
  const createBtn = document.getElementById("createBtn");
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const hostLinkEl = document.getElementById("hostLink");
  const playerLinkEl = document.getElementById("playerLink");
  const summaryLinkEl = document.getElementById("summaryLink");
  let csvQuestions = [];

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? "#b91c1c" : "#334155";
  }

  function parseQuestions() {
    return questionsEl.value
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 200);
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let i = 0;
    let inQuotes = false;
    const dq = String.fromCharCode(34);

    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === dq) {
          if (text[i + 1] === dq) {
            field += dq;
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }
      if (ch === dq) {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        i += 1;
        continue;
      }
      if (ch === "\\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i += 1;
        continue;
      }
      if (ch === "\\r") {
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  async function loadCsv() {
    const file = csvFileEl.files && csvFileEl.files[0];
    if (!file) {
      csvQuestions = [];
      csvStatusEl.textContent = "CSV未選択";
      return;
    }
    try {
      const raw = await file.text();
      const rows = parseCsvRows(raw);
      const list = rows
        .map((r) => (Array.isArray(r) && r.length > 0 ? String(r[0] || "").trim() : ""))
        .filter((q) => q.length > 0);
      csvQuestions = list.slice(0, 200);
      csvStatusEl.textContent = "CSV取込: " + csvQuestions.length + "問";
    } catch {
      csvQuestions = [];
      csvStatusEl.textContent = "CSV読込失敗";
    }
  }

  function applyCsvToTextarea() {
    if (!csvQuestions.length) {
      csvStatusEl.textContent = "取り込める問題がありません";
      return;
    }
    questionsEl.value = csvQuestions.join("\\n");
    csvStatusEl.textContent = "テキスト欄へ反映済み: " + csvQuestions.length + "問";
  }

  async function createRoom() {
    createBtn.disabled = true;
    setStatus("ルーム作成中...", false);
    const questions = parseQuestions();
    const body = {
      capacity: Number(capacityEl.value) || 4,
      questions,
    };
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("作成失敗: " + (data.error || "unknown"), true);
        return;
      }
      const base = location.origin;
      const hostUrl = base + "/host/" + data.roomId + "?hostKey=" + encodeURIComponent(data.hostKey);
      const playerUrl = base + "/player/" + data.roomId;
      const summaryUrl = base + "/summary/" + data.roomId;
      const lobbyUrl = base + "/lobby/" + data.roomId + "?hostKey=" + encodeURIComponent(data.hostKey);

      hostLinkEl.href = hostUrl;
      hostLinkEl.textContent = hostUrl;
      playerLinkEl.href = playerUrl;
      playerLinkEl.textContent = playerUrl;
      summaryLinkEl.href = summaryUrl;
      summaryLinkEl.textContent = summaryUrl;
      resultEl.style.display = "block";

      setStatus("作成完了。ロビーへ移動します...", false);
      location.href = lobbyUrl;
    } catch {
      setStatus("作成失敗: 通信エラー", true);
    } finally {
      createBtn.disabled = false;
    }
  }

  createBtn.addEventListener("click", () => { void createRoom(); });
  csvFileEl.addEventListener("change", () => { void loadCsv(); });
  csvApplyBtn.addEventListener("click", applyCsvToTextarea);
})();`;
}
