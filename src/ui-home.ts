export function renderHomeScript(): string {
  return `(() => {
  const capacityEl = document.getElementById("capacity");
  const textFileEl = document.getElementById("textFile");
  const textApplyBtn = document.getElementById("textApplyBtn");
  const textStatusEl = document.getElementById("textStatus");
  const questionsEl = document.getElementById("questions");
  const createBtn = document.getElementById("createBtn");
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const hostLinkEl = document.getElementById("hostLink");
  const playerLinkEl = document.getElementById("playerLink");
  const summaryLinkEl = document.getElementById("summaryLink");
  let fileQuestions = [];

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

  async function loadTextFile() {
    const file = textFileEl.files && textFileEl.files[0];
    if (!file) {
      fileQuestions = [];
      textStatusEl.textContent = "テキストファイル未選択";
      return;
    }
    try {
      const raw = await file.text();
      const list = raw
        .split(/\\r?\\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      fileQuestions = list.slice(0, 200);
      textStatusEl.textContent = "テキスト取込: " + fileQuestions.length + "問";
    } catch {
      fileQuestions = [];
      textStatusEl.textContent = "テキスト読込失敗";
    }
  }

  function applyTextToTextarea() {
    if (!fileQuestions.length) {
      textStatusEl.textContent = "取り込める問題がありません";
      return;
    }
    questionsEl.value = fileQuestions.join("\\n");
    textStatusEl.textContent = "テキスト欄へ反映済み: " + fileQuestions.length + "問";
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
  textFileEl.addEventListener("change", () => { void loadTextFile(); });
  textApplyBtn.addEventListener("click", applyTextToTextarea);
})();`;
}
