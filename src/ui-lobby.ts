export function renderLobbyScript(roomId: string): string {
  return `(() => {
  const roomId = ${JSON.stringify(roomId)};
  const qs = new URLSearchParams(location.search);
  const hostKey = (qs.get("hostKey") || "").trim();

  const roomCodeEl = document.getElementById("roomCode");
  const playerUrlEl = document.getElementById("playerUrl");
  const playerQrEl = document.getElementById("playerQr");
  const hostUrlEl = document.getElementById("hostUrl");
  const statusEl = document.getElementById("status");
  const questionEl = document.getElementById("question");
  const joinedEl = document.getElementById("joinedCount");
  const participantListEl = document.getElementById("participantList");
  const startBtn = document.getElementById("startBtn");

  let ws = null;
  let model = { status: "CREATED", currentQuestionPos: 1, questionText: "第1問", slots: {} };

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? "#b91c1c" : "#334155";
  }

  function qrSrc(url) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=280x280&format=png&data=" + encodeURIComponent(url);
  }

  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  function updateView() {
    roomCodeEl.textContent = roomId;
    if (model.status === "CREATED") {
      questionEl.textContent = "問題: 開始待ち";
    } else {
      questionEl.textContent = "問題: " + (model.questionText || ("第" + model.currentQuestionPos + "問"));
    }

    const joinedSlots = Object.values(model.slots)
      .filter((s) => !!s.participantId)
      .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));
    const joined = joinedSlots.length;
    joinedEl.textContent = String(joined);
    if (participantListEl) {
      participantListEl.innerHTML = "";
      if (joinedSlots.length === 0) {
        participantListEl.innerHTML = "<div class='meta'>まだ参加者はいません</div>";
      } else {
        for (const s of joinedSlots) {
          const row = document.createElement("div");
          row.className = "participantRow";
          const name = s.participantName || "名前未設定";
          row.innerHTML =
            "<div class='participantName'>slot " + s.slotNumber + ": " + name + "</div>" +
            "<button class='smallBtn' data-slot='" + s.slotNumber + "'>削除</button>";
          participantListEl.appendChild(row);
        }
      }
    }

    const connected = !!ws && ws.readyState === 1;
    startBtn.disabled = !connected || model.status === "OPEN";
    if (participantListEl) {
      const removeBtns = participantListEl.querySelectorAll("button[data-slot]");
      for (const btn of removeBtns) {
        btn.disabled = !connected;
      }
    }
  }

  function connect() {
    if (!hostKey) {
      setStatus("hostKey がありません。作成画面から入り直してください。", true);
      return;
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(proto + "://" + location.host + "/api/rooms/" + roomId + "/ws/host?hostKey=" + encodeURIComponent(hostKey));
    setStatus("接続中...", false);

    ws.onopen = () => {
      setStatus("接続済み", false);
      updateView();
    };
    ws.onclose = () => {
      setStatus("切断されました", true);
      ws = null;
      updateView();
    };
    ws.onerror = () => {
      setStatus("接続エラー (hostKey確認)", true);
      updateView();
    };
    ws.onmessage = (event) => {
      let m = null;
      try { m = JSON.parse(event.data); } catch { return; }
      if (!m || typeof m.type !== "string") return;

      if (m.type === "room:snapshot") {
        model.status = m.room.status;
        model.currentQuestionPos = m.room.currentQuestionPos || 1;
        model.questionText = m.room.currentQuestionText || ("第" + model.currentQuestionPos + "問");
        model.slots = m.room.slots || {};
      } else if (m.type === "room:status") {
        model.status = m.status || model.status;
        model.currentQuestionPos = m.currentQuestionPos || model.currentQuestionPos;
        if (typeof m.questionText === "string" && m.questionText) model.questionText = m.questionText;
      } else if (m.type === "question:update") {
        if (typeof m.questionText === "string" && m.questionText) model.questionText = m.questionText;
      } else if (m.type === "slot:status") {
        const s = model.slots[m.slotNumber];
        if (s) {
          if (typeof m.participantId === "string" || m.participantId === null) s.participantId = m.participantId;
          if (typeof m.participantName === "string" || m.participantName === null) s.participantName = m.participantName;
          s.connected = !!m.connected;
          if (m.state) s.state = m.state;
        }
      }
      updateView();
    };
  }

  const playerUrl = location.origin + "/player/" + roomId;
  const hostUrl = location.origin + "/host/" + roomId + "?hostKey=" + encodeURIComponent(hostKey);

  playerUrlEl.href = playerUrl;
  playerUrlEl.textContent = playerUrl;
  playerQrEl.src = qrSrc(playerUrl);
  hostUrlEl.href = hostUrl;

  startBtn.addEventListener("click", () => {
    if (!send({ type: "control:open" })) {
      setStatus("未接続です", true);
      return;
    }
    setStatus("開始しました。管理画面へ移動します...", false);
    setTimeout(() => {
      location.href = hostUrl;
    }, 150);
  });
  if (participantListEl) {
    participantListEl.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("button[data-slot]");
      if (!btn) return;
      const slotNumber = Number(btn.getAttribute("data-slot"));
      if (!Number.isInteger(slotNumber) || slotNumber < 1) return;
      if (!confirm("slot " + slotNumber + " の参加者を削除しますか？")) return;
      if (!send({ type: "participant:remove", slotNumber })) {
        setStatus("未接続です", true);
      }
    });
  }

  updateView();
  connect();
})();`;
}
