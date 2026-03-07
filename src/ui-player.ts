export function renderPlayerScript(roomId: string): string {
  return `(() => {
  const roomId = ${JSON.stringify(roomId)};
  const nameEl = document.getElementById("name");
  const statusEl = document.getElementById("status");
  const lockStateEl = document.getElementById("lockState");
  const questionBoxEl = document.getElementById("questionBox");
  const gradeBannerEl = document.getElementById("gradeBanner");
  const gradeMarkEl = document.getElementById("gradeMark");
  const joinBtn = document.getElementById("joinBtn");
  const submitBtn = document.getElementById("submitBtn");
  const clearBtn = document.getElementById("clearBtn");
  const toolSelect = document.getElementById("toolSelect");
  const sizeSelect = document.getElementById("sizeSelect");
  const canvasWrap = document.getElementById("canvasWrap");
  const lockOverlay = document.getElementById("lockOverlay");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  let ws = null;
  let participantId = null;
  let roomDeleted = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let locked = true;
  let drawing = false;
  let dirty = false;
  let submitted = false;
  let batch = [];
  let currentQuestionPos = 1;
  let roomStatus = "CREATED";
  const resumeKey = "hwc:resume:" + roomId;
  const wsProto = location.protocol === "https:" ? "wss" : "ws";

  function playerWsUrl(pid) {
    return wsProto + "://" + location.host + "/api/rooms/" + roomId + "/ws/player?participantId=" + encodeURIComponent(pid);
  }

  function getResumeToken() {
    try {
      const raw = localStorage.getItem(resumeKey) || "";
      const token = raw.trim();
      return token || null;
    } catch {
      return null;
    }
  }

  function setResumeToken(token) {
    try {
      if (typeof token === "string" && token.trim()) {
        localStorage.setItem(resumeKey, token.trim());
      }
    } catch {}
  }

  function clearResumeToken() {
    try {
      localStorage.removeItem(resumeKey);
    } catch {}
  }

  function isConnected() {
    return !!ws && ws.readyState === 1;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setGradeBanner(grade) {
    gradeBannerEl.className = "";
    gradeMarkEl.classList.remove("show");
    if (grade === "O") {
      gradeBannerEl.classList.add("ok");
      gradeBannerEl.textContent = "やった！正解";
      gradeMarkEl.classList.add("show");
      return;
    }
    if (grade === "X") {
      gradeBannerEl.classList.add("ng");
      gradeBannerEl.textContent = "おしい！ もう一回チャレンジしよう";
      return;
    }
    gradeBannerEl.textContent = "";
  }

  function renderQuestion(text) {
    questionBoxEl.textContent = text;
  }

  function updateQuestion(pos, text) {
    if (Number.isFinite(pos) && pos > 0) {
      currentQuestionPos = pos;
    }
    if (typeof text === "string" && text.trim()) {
      renderQuestion("問題: " + text.trim());
      return;
    }
    renderQuestion("問題: 第" + currentQuestionPos + "問");
  }

  function applyRoomStatus(nextStatus) {
    roomStatus = nextStatus || roomStatus;
    if (roomStatus === "CREATED") {
      locked = true;
      submitted = false;
      renderQuestion("問題: 開始待ち");
      setStatus("開始待ち");
      return;
    }
    if (roomStatus === "LOCKED" || roomStatus === "CLOSED") {
      locked = true;
      setStatus("ロック中");
      return;
    }
    locked = false;
    submitted = false;
    setStatus("入力可能");
  }

  function updateStrokeStyle() {
    const size = Number(sizeSelect.value) || 3;
    const tool = toolSelect.value;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#111827";
  }

  function updateLockView() {
    canvasWrap.classList.toggle("locked", locked);
    lockStateEl.classList.remove("warn", "ok");
    if (locked) {
      lockStateEl.textContent = submitted ? "提出済み" : "ロック中";
      lockStateEl.classList.add("warn");
      lockOverlay.textContent = submitted ? "提出済み" : "ホストがロック中";
      return;
    }
    lockStateEl.textContent = "入力可能";
    lockStateEl.classList.add("ok");
    lockOverlay.textContent = "ホストがロック中";
  }

  function updateControlState() {
    const joined = !!participantId;
    const editable = joined && isConnected() && !locked && !roomDeleted;
    joinBtn.disabled = joined;
    nameEl.disabled = joined;
    toolSelect.disabled = !editable;
    sizeSelect.disabled = !editable;
    clearBtn.disabled = !editable;
    submitBtn.disabled = !editable;
    updateLockView();
  }

  function pointFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) * (canvas.width / r.width)),
      y: Math.round((e.clientY - r.top) * (canvas.height / r.height)),
      t: Date.now(),
    };
  }

  function safeParse(text) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed.type === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    if (!msg || typeof msg.type !== "string") return false;
    const raw = JSON.stringify(msg);
    if (new TextEncoder().encode(raw).length > 256 * 1024) {
      setStatus("送信メッセージが大きすぎます");
      return false;
    }
    ws.send(raw);
    return true;
  }

  function drawImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function clearCanvas(markDirty) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (markDirty) {
      dirty = true;
    }
  }

  function attachSocketHandlers(socket, openLabel) {
    socket.onopen = () => {
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setStatus(openLabel);
      updateControlState();
    };

    socket.onclose = (ev) => {
      ws = null;
      locked = true;
      if (ev.code === 4001) {
        participantId = null;
        clearResumeToken();
        setStatus("先生により参加から削除されました。再参加してください。");
        updateControlState();
        return;
      }
      setStatus(roomDeleted ? "ルーム削除済み" : "WS切断 (code " + ev.code + ")");
      updateControlState();
      if (!roomDeleted && participantId) {
        reconnectAttempts += 1;
        const waitMs = Math.min(8000, 1000 + reconnectAttempts * 500);
        setStatus("再接続待機...");
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!participantId || roomDeleted || isConnected()) return;
          const nextWs = new WebSocket(playerWsUrl(participantId));
          ws = nextWs;
          setStatus("再接続中...");
          updateControlState();
          attachSocketHandlers(nextWs, "再接続完了");
        }, waitMs);
      }
    };

    socket.onerror = () => {
      locked = true;
      setStatus("WSエラー (サーバーログを確認)");
      updateControlState();
    };

    socket.onmessage = (event) => {
      const m = safeParse(event.data);
      if (!m) return;

      if (m.type === "player:welcome") {
        applyRoomStatus(m.status);
        if (roomStatus === "OPEN") {
          updateQuestion(m.currentQuestionPos, m.questionText);
        }
      } else if (m.type === "answer:lock") {
        if (roomStatus !== "CREATED") {
          locked = !!m.locked;
          setStatus(locked ? "ロック中" : "入力可能");
        }
      } else if (m.type === "room:status") {
        applyRoomStatus(m.status);
        if (roomStatus === "OPEN" || roomStatus === "LOCKED" || roomStatus === "CLOSED") {
          updateQuestion(m.currentQuestionPos, m.questionText);
        }
      } else if (m.type === "question:update") {
        if (roomStatus !== "CREATED") {
          updateQuestion(m.currentQuestionPos, m.questionText);
          locked = false;
          submitted = false;
          setGradeBanner(null);
          clearCanvas(false);
          setStatus("第" + currentQuestionPos + "問 入力可能");
        }
      } else if (m.type === "answer:grade") {
        setGradeBanner(m.grade);
        setStatus(m.grade === "O" ? "評価: まる" : "評価: おしい");
      } else if (m.type === "answer:resubmit_allowed") {
        locked = false;
        submitted = false;
        setGradeBanner(null);
        setStatus("再提出が許可されました");
        if (typeof m.finalImage === "string" && m.finalImage) {
          void drawImageFromDataUrl(m.finalImage);
        }
      } else if (m.type === "room:deleted") {
        roomDeleted = true;
        locked = true;
        participantId = null;
        clearResumeToken();
        setStatus("ルームが削除されました");
        setGradeBanner(null);
        updateQuestion(currentQuestionPos, "ルームは削除されました");
        clearCanvas(false);
        if (ws) ws.close();
      } else if (m.type === "participant:removed") {
        participantId = null;
        locked = true;
        clearResumeToken();
        setGradeBanner(null);
        setStatus("先生により参加から削除されました。再参加してください。");
        updateQuestion(currentQuestionPos, "参加から削除されました。もう一度参加してください。");
        clearCanvas(false);
        if (ws) ws.close(1000, "removed_notice_ack");
      } else if (m.type === "error") {
        setStatus("エラー: " + m.error);
      }
      updateControlState();
    };
  }

  async function join() {
    if (roomDeleted) return;
    if (participantId) return;
    const resumeToken = getResumeToken();
    const res = await fetch("/api/rooms/" + roomId + "/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantName: nameEl.value.trim() || null,
        resumeToken: resumeToken || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus("参加失敗: " + (data.error || "unknown") + " (status " + res.status + ")");
      return;
    }

    participantId = data.participantId;
    if (typeof data.resumeToken === "string" && data.resumeToken.trim()) {
      setResumeToken(data.resumeToken);
    }
    ws = new WebSocket(playerWsUrl(participantId));
    setStatus("WS接続中...");
    updateControlState();
    attachSocketHandlers(ws, (data.resumed ? "再参加完了" : "参加完了") + ": slot " + data.slotNumber);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (locked) return;
    drawing = true;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    batch.push({ type: "down", ...p });
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (locked || !drawing) return;
    const p = pointFromEvent(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    batch.push({ type: "move", ...p });
    dirty = true;
  });

  function finishStroke(e) {
    if (!drawing) return;
    if (locked) {
      drawing = false;
      batch = [];
      return;
    }
    drawing = false;
    const p = pointFromEvent(e);
    batch.push({ type: "up", ...p });
    send({ type: "stroke:batch", strokes: batch });
    batch = [];
    dirty = true;
  }

  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);

  setInterval(() => {
    if (!dirty || locked) return;
    dirty = false;
    send({ type: "preview:update", preview: canvas.toDataURL("image/webp", 0.65) });
  }, 1500);

  toolSelect.addEventListener("change", updateStrokeStyle);
  sizeSelect.addEventListener("change", updateStrokeStyle);
  joinBtn.addEventListener("click", () => { void join(); });
  clearBtn.addEventListener("click", () => {
    if (locked) return;
    clearCanvas(true);
    send({ type: "preview:update", preview: canvas.toDataURL("image/webp", 0.65) });
    setStatus("キャンバスを全消去");
  });
  submitBtn.addEventListener("click", () => {
    if (locked) return;
    if (!send({ type: "final:submit", finalImage: canvas.toDataURL("image/webp", 0.85) })) {
      setStatus("提出失敗: 未接続");
      return;
    }
    submitted = true;
    locked = true;
    setStatus("提出しました");
    updateControlState();
  });

  updateStrokeStyle();
  renderQuestion("問題: 開始待ち");
  setGradeBanner(null);
  if (getResumeToken()) {
    setStatus("前回の席に復帰できます（参加を押す）");
  }
  updateControlState();
})();`;
}
