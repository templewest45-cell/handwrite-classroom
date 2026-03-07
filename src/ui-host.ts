export function renderHostScript(roomId: string): string {
  return `(() => {
  const roomId = ${JSON.stringify(roomId)};
  const qs = new URLSearchParams(location.search);
  const hostKeyEl = document.getElementById("hostKey");
  const connectBtn = document.getElementById("connectBtn");
  const openBtn = document.getElementById("openBtn");
  const showResultBtn = document.getElementById("showResultBtn");
  const endBtn = document.getElementById("endBtn");
  const clearLiveBtn = document.getElementById("clearLiveBtn");
  const summaryBtn = document.getElementById("summaryBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const statusEl = document.getElementById("status");
  const roomStatusEl = document.getElementById("roomStatus");
  const currentQuestionLabelEl = document.getElementById("currentQuestionLabel");
  const nextQuestionRowEl = document.getElementById("nextQuestionRow");
  const nextQuestionLabelEl = document.getElementById("nextQuestionLabel");
  const projectorLinkEl = document.getElementById("projectorLink");
  const showNextQuestionToggleEl = document.getElementById("showNextQuestionToggle");
  const showAnswersToggleEl = document.getElementById("showAnswersToggle");
  const showLogToggleEl = document.getElementById("showLogToggle");
  const judgeListEl = document.getElementById("judgeList");
  const teacherNotePanelEl = document.getElementById("teacherNotePanel");
  const teacherNoteMetaEl = document.getElementById("teacherNoteMeta");
  const teacherNoteCanvasEl = document.getElementById("teacherNoteCanvas");
  const teacherNoteSaveBtn = document.getElementById("teacherNoteSaveBtn");
  const teacherNoteResetBtn = document.getElementById("teacherNoteResetBtn");
  const teacherNoteCancelBtn = document.getElementById("teacherNoteCancelBtn");
  const realtimeBarEl = document.getElementById("realtimeBar");
  const slotsEl = document.getElementById("slots");
  const logEl = document.getElementById("log");
  const teacherNoteCtx = teacherNoteCanvasEl ? teacherNoteCanvasEl.getContext("2d") : null;

  hostKeyEl.value = qs.get("hostKey") || "";
  const summaryUrl = location.origin + "/summary/" + roomId + "?hostKey=" + encodeURIComponent(hostKeyEl.value || "");
  if (projectorLinkEl) {
    projectorLinkEl.href = summaryUrl;
    projectorLinkEl.textContent = summaryUrl;
  }

  let ws = null;
  let roomDeleted = false;
  let manualDisconnect = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let everConnected = false;
  let redirectedToSummary = false;
  let pendingControlMessage = null;
  let selectedJudgeSlot = null;
  let showNextQuestion = false;
  let showAnswers = false;
  let showLog = false;
  let teacherNoteSlot = null;
  let teacherNoteBaseImage = null;
  let teacherNoteDrawing = false;
  let teacherNoteLast = null;
  let model = {
    status: "CREATED",
    currentQuestionPos: 1,
    currentQuestionText: "第1問",
    questions: [],
    liveSlot: null,
    slots: {},
  };

  const slotLastPreviewAt = {};
  let liveLastStrokeAt = 0;
  let liveStrokeCount = 0;
  let liveWindowStart = Date.now();

  function teacherNotePointer(ev) {
    if (!teacherNoteCanvasEl) return { x: 0, y: 0 };
    const rect = teacherNoteCanvasEl.getBoundingClientRect();
    return {
      x: Math.round((ev.clientX - rect.left) * (teacherNoteCanvasEl.width / rect.width)),
      y: Math.round((ev.clientY - rect.top) * (teacherNoteCanvasEl.height / rect.height)),
    };
  }

  function closeTeacherNotePanel() {
    teacherNoteSlot = null;
    teacherNoteBaseImage = null;
    if (teacherNotePanelEl) teacherNotePanelEl.style.display = "none";
    if (teacherNoteMetaEl) teacherNoteMetaEl.textContent = "対象: -";
    setControlState();
  }

  function drawTeacherNoteBaseImage(src) {
    if (!teacherNoteCanvasEl || !teacherNoteCtx) return Promise.resolve(false);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        teacherNoteCtx.clearRect(0, 0, teacherNoteCanvasEl.width, teacherNoteCanvasEl.height);
        teacherNoteCtx.drawImage(img, 0, 0, teacherNoteCanvasEl.width, teacherNoteCanvasEl.height);
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  async function openTeacherNotePanel(slotNumber) {
    const slot = model.slots[slotNumber];
    if (!slot || !slot.participantId) {
      alert("参加者がいない slot は追記できません。");
      return;
    }
    const base = slot.finalImage || slot.draftPreview;
    if (!base) {
      alert("まだ解答画像がありません。");
      return;
    }
    const ok = await drawTeacherNoteBaseImage(base);
    if (!ok) {
      alert("追記対象画像の読込に失敗しました。");
      return;
    }
    teacherNoteSlot = slotNumber;
    teacherNoteBaseImage = base;
    if (teacherNoteMetaEl) {
      teacherNoteMetaEl.textContent = "対象: slot " + slotNumber + " / " + (slot.participantName || slot.participantId);
    }
    if (teacherNotePanelEl) teacherNotePanelEl.style.display = "";
    setControlState();
  }

  function questionTextAt(pos) {
    const p = Math.max(1, Number(pos) || 1);
    const list = Array.isArray(model.questions) ? model.questions : [];
    const txt = list[p - 1];
    return typeof txt === "string" && txt.trim() ? txt.trim() : ("第" + p + "問");
  }

  function isConnected() {
    return !!ws && ws.readyState === 1;
  }

  function isSocketActive() {
    return !!ws && (ws.readyState === 0 || ws.readyState === 1);
  }

  function log(msg) {
    logEl.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg + "\\n" + logEl.textContent;
  }

  function isTypingTarget(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function safeParse(text) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed.type === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  function sendWs(msg) {
    if (!ws || ws.readyState !== 1) {
      log("操作を無視: WebSocket未接続");
      return false;
    }
    if (!msg || typeof msg.type !== "string") return false;
    const raw = JSON.stringify(msg);
    if (new TextEncoder().encode(raw).length > 256 * 1024) {
      log("送信ブロック: メッセージサイズ上限超過");
      return false;
    }
    ws.send(raw);
    return true;
  }

  function setStatusPill() {
    statusEl.classList.remove("ok", "warn");
    if (statusEl.textContent === "接続済み") {
      statusEl.classList.add("ok");
      return;
    }
    if (statusEl.textContent === "接続中") {
      return;
    }
    statusEl.classList.add("warn");
  }

  function setControlState() {
    const connected = isConnected();
    const hostKeyPresent = !!hostKeyEl.value.trim();
    connectBtn.disabled = connected;
    hostKeyEl.disabled = connected || roomDeleted;
    deleteBtn.disabled = roomDeleted;
    if (teacherNoteSaveBtn) teacherNoteSaveBtn.disabled = !connected || !Number.isFinite(teacherNoteSlot);
    if (teacherNoteResetBtn) teacherNoteResetBtn.disabled = !Number.isFinite(teacherNoteSlot);
    clearLiveBtn.disabled = !connected || model.liveSlot === null;
    openBtn.disabled = roomDeleted || model.status !== "CREATED" || !hostKeyPresent;
    showResultBtn.disabled = roomDeleted || !hostKeyPresent;
    endBtn.disabled = !connected || model.status === "CLOSED";
  }

  function sendControlAction(msg) {
    const sent = sendWs(msg);
    if (sent) return;
    if (roomDeleted) return;
    pendingControlMessage = msg;
    connect();
    if (!isSocketActive()) {
      alert("接続できませんでした。hostKey を確認してください。");
      pendingControlMessage = null;
    }
  }

  function updatePresenterToggleLabel() {
    summaryBtn.textContent = document.body.classList.contains("presenter")
      ? "管理UIを表示"
      : "管理UIを隠す";
  }

  function togglePresenterMode() {
    document.body.classList.toggle("presenter");
    updatePresenterToggleLabel();
  }

  function selectJudgeSlot(slotNumber) {
    if (!Number.isFinite(slotNumber)) return false;
    const slot = model.slots[slotNumber];
    if (!slot || !slot.participantId) return false;
    selectedJudgeSlot = slotNumber;
    render();
    return true;
  }

  function runJudgeShortcut(action) {
    if (!Number.isFinite(selectedJudgeSlot)) {
      log("採点対象slotを先に選択してください (1-8キー)");
      return;
    }
    if (action === "grade-o") return sendControlAction({ type: "grade:set", slotNumber: selectedJudgeSlot, grade: "O" });
    if (action === "grade-x") return sendControlAction({ type: "grade:set", slotNumber: selectedJudgeSlot, grade: "X" });
    if (action === "resubmit") return sendControlAction({ type: "resubmit:allow", slotNumber: selectedJudgeSlot });
  }

  function resetSlotsForNextQuestion() {
    for (const slot of Object.values(model.slots)) {
      slot.draftPreview = null;
      slot.finalImage = null;
      slot.grade = null;
      slot.state = slot.participantId ? "JOINED" : "EMPTY";
    }
    selectedJudgeSlot = null;
  }

  function render() {
    const now = Date.now();
    const items = Object.values(model.slots).sort((a, b) => a.slotNumber - b.slotNumber);
    slotsEl.innerHTML = "";
    if (judgeListEl) {
      judgeListEl.innerHTML = "";
    }
    slotsEl.style.display = showAnswers ? "" : "none";
    realtimeBarEl.style.display = showAnswers ? "" : "none";
    logEl.style.display = showLog ? "" : "none";
    if (nextQuestionRowEl) nextQuestionRowEl.style.display = showNextQuestion ? "" : "none";
    if (showNextQuestionToggleEl) showNextQuestionToggleEl.checked = showNextQuestion;
    if (showAnswersToggleEl) showAnswersToggleEl.checked = showAnswers;
    if (showLogToggleEl) showLogToggleEl.checked = showLog;

    for (const s of items) {
      const selectable = !!s.participantId;
      const div = document.createElement("div");
      div.className = "slot" + (model.liveSlot === s.slotNumber ? " live" : "") + (selectable ? "" : " disabled");

      const img = s.draftPreview ? '<img src="' + s.draftPreview + '" alt="preview" />' : '<img alt="empty" />';
      const finalTag = s.finalImage ? "<div class='meta'>最終提出: 済み</div>" : "<div class='meta'>最終提出: 未提出</div>";
      const gradeTag = "<div class='meta'>評価: " + (s.grade || "-") + "</div>";

      const previewAt = slotLastPreviewAt[s.slotNumber] || 0;
      const previewAgeSec = previewAt > 0 ? Math.floor((now - previewAt) / 1000) : -1;
      const previewTag =
        previewAgeSec < 0
          ? "<div class='meta'>プレビュー: なし</div>"
          : "<div class='meta'>プレビュー: " + previewAgeSec + "秒前</div>";

      const liveAgeMs = model.liveSlot === s.slotNumber && liveLastStrokeAt > 0 ? now - liveLastStrokeAt : -1;
      let liveTag = "";
      if (model.liveSlot === s.slotNumber) {
        if (liveAgeMs >= 5000) {
          liveTag = "<div class='meta livedead'>LIVE配信停止気味 (" + Math.floor(liveAgeMs / 1000) + "秒)</div>";
        } else if (liveAgeMs >= 2000) {
          liveTag = "<div class='meta livewarn'>LIVE配信遅延 (" + Math.floor(liveAgeMs / 1000) + "秒)</div>";
        } else {
          liveTag = "<div class='meta'>LIVE配信正常</div>";
        }
      }

      div.innerHTML =
        "<div><strong>Slot " + s.slotNumber + "</strong></div>" +
        "<div class='meta'>状態: " + s.state + " / 接続: " + s.connected + "</div>" +
        "<div class='meta'>参加者: " + (s.participantName || s.participantId || "-") + "</div>" +
        finalTag +
        gradeTag +
        previewTag +
        liveTag +
        img;

      div.addEventListener("click", () => {
        if (!selectable) return;
        selectedJudgeSlot = s.slotNumber;
        sendControlAction({ type: "live:set", slotNumber: s.slotNumber });
        render();
      });

      slotsEl.appendChild(div);

      if (!selectable) continue;
      const canJudge = !!s.finalImage;
      const judgeRow = document.createElement("div");
      judgeRow.className = "judgeRow";
      if (s.grade === "O") {
        judgeRow.classList.add("correct");
      } else if (s.state === "SUBMITTED") {
        judgeRow.classList.add("submitted");
      }
      const participantLabel = "参加者" + s.slotNumber;
      const participantName = s.participantName || "-";
      judgeRow.innerHTML =
        "<div class='judgeHead'><strong>" + participantLabel + " " + participantName + "</strong>" +
        "<span>" + (selectedJudgeSlot === s.slotNumber ? "選択中" : "") + "</span></div>" +
        "<div class='judgeButtons'>" +
        "<button data-action='grade-o' data-slot='" + s.slotNumber + "'" + (canJudge ? "" : " disabled") + ">○</button>" +
        "<button data-action='grade-x' data-slot='" + s.slotNumber + "'" + (canJudge ? "" : " disabled") + ">×</button>" +
        "<button data-action='resubmit' data-slot='" + s.slotNumber + "'>再</button>" +
        "<button data-action='annotate' data-slot='" + s.slotNumber + "'" + (s.finalImage || s.draftPreview ? "" : " disabled") + ">追記</button>" +
        "</div>";
      judgeRow.addEventListener("click", () => {
        selectedJudgeSlot = s.slotNumber;
        render();
      });
      const judgeButtons = judgeRow.querySelectorAll("button[data-action]");
      for (const btn of judgeButtons) {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          selectedJudgeSlot = s.slotNumber;
          const action = btn.getAttribute("data-action");
          if (action === "grade-o") return runJudgeShortcut("grade-o");
          if (action === "grade-x") return runJudgeShortcut("grade-x");
          if (action === "resubmit") return runJudgeShortcut("resubmit");
          if (action === "annotate") return void openTeacherNotePanel(s.slotNumber);
        });
      }
      if (judgeListEl) {
        judgeListEl.appendChild(judgeRow);
      }
    }
    if (judgeListEl && judgeListEl.childElementCount === 0) {
      judgeListEl.innerHTML = "<div class='judgeMeta'>参加中の生徒はいません</div>";
    }

    roomStatusEl.textContent =
      "状態=" + model.status + " / 問題=" + model.currentQuestionPos + " (" + (model.currentQuestionText || "-") + ")";
    currentQuestionLabelEl.textContent = questionTextAt(model.currentQuestionPos);
    if (Array.isArray(model.questions) && model.questions.length > 0) {
      if (model.currentQuestionPos >= model.questions.length) {
        nextQuestionLabelEl.textContent = "この問題が最後です";
      } else {
        nextQuestionLabelEl.textContent = questionTextAt(model.currentQuestionPos + 1);
      }
    } else {
      nextQuestionLabelEl.textContent = "問題未設定";
    }

    const liveSlotLabel = model.liveSlot === null ? "なし" : "slot " + model.liveSlot;
    const liveAge = liveLastStrokeAt > 0 ? now - liveLastStrokeAt : -1;
    const feed =
      model.liveSlot === null
        ? "待機"
        : liveAge < 0
          ? "受信待ち"
          : liveAge >= 5000
            ? "停止気味 " + Math.floor(liveAge / 1000) + "秒"
            : liveAge >= 2000
              ? "遅延 " + Math.floor(liveAge / 1000) + "秒"
              : "リアルタイム";

    const elapsedSec = Math.max(1, Math.floor((now - liveWindowStart) / 1000));
    const strokeRate = (liveStrokeCount / elapsedSec).toFixed(1);
    realtimeBarEl.textContent =
      "LIVE: " + liveSlotLabel + " / ストローク: " + liveStrokeCount + " (" + strokeRate + "/秒) / 配信: " + feed;

    setControlState();
    setStatusPill();
    if (!roomDeleted && model.status === "CLOSED" && !redirectedToSummary) {
      redirectedToSummary = true;
      location.href = summaryUrl;
    }
  }

  function connect() {
    if (roomDeleted) return;
    if (isSocketActive()) return;
    manualDisconnect = false;
    const hostKey = hostKeyEl.value.trim();
    if (!hostKey) {
      alert("hostKey がURLにありません。ロビーから開き直してください。");
      return;
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = proto + "://" + location.host + "/api/rooms/" + roomId + "/ws/host?hostKey=" + encodeURIComponent(hostKey);
    ws = new WebSocket(url);
    statusEl.textContent = "接続中";
    setControlState();
    setStatusPill();

    ws.onopen = () => {
      everConnected = true;
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      statusEl.textContent = "接続済み";
      setControlState();
      setStatusPill();
      log("WS接続完了");
      if (pendingControlMessage && sendWs(pendingControlMessage)) {
        log("保留操作を実行: " + pendingControlMessage.type);
        pendingControlMessage = null;
      }
    };

    ws.onclose = (ev) => {
      statusEl.textContent = roomDeleted ? "削除済み" : "切断";
      ws = null;
      setControlState();
      setStatusPill();
      log("WS切断 code=" + ev.code + " reason=" + (ev.reason || "-"));
      if (!roomDeleted && !manualDisconnect && everConnected) {
        reconnectAttempts += 1;
        const waitMs = Math.min(8000, 1000 + reconnectAttempts * 500);
        statusEl.textContent = "再接続待機";
        setStatusPill();
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, waitMs);
      }
    };

    ws.onerror = () => {
      statusEl.textContent = "エラー";
      setControlState();
      setStatusPill();
      log("WSエラー (hostKey / サーバーログ確認)");
      if (!everConnected && reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      const m = safeParse(event.data);
      if (!m) {
        log("不正な受信メッセージを無視");
        return;
      }

      if (m.type === "room:snapshot") {
        model = {
          status: m.room.status,
          currentQuestionPos: m.room.currentQuestionPos || 1,
          currentQuestionText: m.room.currentQuestionText || ("第" + (m.room.currentQuestionPos || 1) + "問"),
          questions: Array.isArray(m.room.questions) ? m.room.questions : [],
          liveSlot: m.room.liveSlot,
          slots: m.room.slots,
        };
      } else if (m.type === "slot:status") {
        const s = model.slots[m.slotNumber];
        if (s) {
          s.connected = m.connected;
          if (m.state) s.state = m.state;
          if (typeof m.participantId === "string" || m.participantId === null) s.participantId = m.participantId;
          if (typeof m.participantName === "string" || m.participantName === null) s.participantName = m.participantName;
        }
      } else if (m.type === "slot:preview") {
        const s = model.slots[m.slotNumber];
        if (s) {
          s.draftPreview = m.preview;
          slotLastPreviewAt[m.slotNumber] = Date.now();
        }
      } else if (m.type === "slot:final") {
        const s = model.slots[m.slotNumber];
        if (s) {
          s.finalImage = m.finalImage;
          s.state = "SUBMITTED";
        }
      } else if (m.type === "slot:grade") {
        const s = model.slots[m.slotNumber];
        if (s) s.grade = m.grade;
      } else if (m.type === "live:changed") {
        model.liveSlot = m.liveSlot;
        liveLastStrokeAt = 0;
        liveStrokeCount = 0;
        liveWindowStart = Date.now();
      } else if (m.type === "room:status") {
        const prevPos = model.currentQuestionPos;
        model.status = m.status;
        model.currentQuestionPos = m.currentQuestionPos || model.currentQuestionPos;
        if (typeof m.questionText === "string" && m.questionText) {
          model.currentQuestionText = m.questionText;
        }
        if (model.currentQuestionPos !== prevPos) {
          resetSlotsForNextQuestion();
        }
      } else if (m.type === "question:update") {
        const prevPos = model.currentQuestionPos;
        model.currentQuestionPos = m.currentQuestionPos || model.currentQuestionPos;
        if (typeof m.questionText === "string" && m.questionText) {
          model.currentQuestionText = m.questionText;
        }
        if (model.currentQuestionPos !== prevPos) {
          resetSlotsForNextQuestion();
        }
      } else if (m.type === "live:stroke") {
        if (model.liveSlot === m.slotNumber) {
          liveLastStrokeAt = Date.now();
          liveStrokeCount += 1;
        }
      } else if (m.type === "room:deleted") {
        roomDeleted = true;
        log("ルーム削除通知を受信");
        statusEl.textContent = "削除済み";
        model.status = "CLOSED";
        model.liveSlot = null;
        model.slots = {};
        model.questions = [];
        model.currentQuestionText = "-";
        if (ws) ws.close();
      } else if (m.type === "error") {
        log("エラー: " + m.error);
      }
      render();
    };
  }

  async function deleteRoom() {
    const hostKey = hostKeyEl.value.trim() || qs.get("hostKey") || "";
    if (!hostKey) {
      alert("hostKey がURLにありません。ロビーから開き直してください。");
      return;
    }

    const ok = confirm("ルームとメモリ内データを削除します。よろしいですか？");
    if (!ok) return;

    const res = await fetch("/api/rooms/" + roomId + "?hostKey=" + encodeURIComponent(hostKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostKey }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {}

    if (!res.ok) {
      const err = data && typeof data.error === "string" ? data.error : "unknown";
      log("削除失敗: " + err);
      alert("削除失敗: " + err);
      return;
    }

    log("ルームを削除しました");
    roomDeleted = true;
    model.status = "CLOSED";
    model.liveSlot = null;
    model.slots = {};
    model.questions = [];
    model.currentQuestionText = "-";
    if (ws) ws.close();
    statusEl.textContent = "削除済み";
    setControlState();
    setStatusPill();
    setTimeout(() => {
      location.href = "/";
    }, 400);
  }

  connectBtn.addEventListener("click", connect);
  clearLiveBtn.addEventListener("click", () => sendControlAction({ type: "live:set", slotNumber: null }));
  openBtn.addEventListener("click", () => sendControlAction({ type: "control:open" }));
  showResultBtn.addEventListener("click", () => {
    location.href = summaryUrl;
  });
  endBtn.addEventListener("click", () => sendControlAction({ type: "control:end" }));
  summaryBtn.addEventListener("click", togglePresenterMode);
  if (showNextQuestionToggleEl) {
    showNextQuestionToggleEl.addEventListener("change", () => {
      showNextQuestion = !!showNextQuestionToggleEl.checked;
      render();
    });
  }
  if (showAnswersToggleEl) {
    showAnswersToggleEl.addEventListener("change", () => {
      showAnswers = !!showAnswersToggleEl.checked;
      render();
    });
  }
  if (showLogToggleEl) {
    showLogToggleEl.addEventListener("change", () => {
      showLog = !!showLogToggleEl.checked;
      render();
    });
  }
  if (teacherNoteCanvasEl && teacherNoteCtx) {
    teacherNoteCanvasEl.addEventListener("pointerdown", (ev) => {
      if (!Number.isFinite(teacherNoteSlot)) return;
      teacherNoteDrawing = true;
      teacherNoteLast = teacherNotePointer(ev);
      teacherNoteCanvasEl.setPointerCapture(ev.pointerId);
    });
    teacherNoteCanvasEl.addEventListener("pointermove", (ev) => {
      if (!teacherNoteDrawing || !teacherNoteLast) return;
      const p = teacherNotePointer(ev);
      teacherNoteCtx.save();
      teacherNoteCtx.lineCap = "round";
      teacherNoteCtx.lineJoin = "round";
      teacherNoteCtx.lineWidth = 4;
      teacherNoteCtx.strokeStyle = "#2563eb";
      teacherNoteCtx.beginPath();
      teacherNoteCtx.moveTo(teacherNoteLast.x, teacherNoteLast.y);
      teacherNoteCtx.lineTo(p.x, p.y);
      teacherNoteCtx.stroke();
      teacherNoteCtx.restore();
      teacherNoteLast = p;
    });
    const stopDraw = () => {
      teacherNoteDrawing = false;
      teacherNoteLast = null;
    };
    teacherNoteCanvasEl.addEventListener("pointerup", stopDraw);
    teacherNoteCanvasEl.addEventListener("pointercancel", stopDraw);
  }
  if (teacherNoteResetBtn) {
    teacherNoteResetBtn.addEventListener("click", () => {
      if (typeof teacherNoteBaseImage === "string" && teacherNoteBaseImage) {
        void drawTeacherNoteBaseImage(teacherNoteBaseImage);
      }
    });
  }
  if (teacherNoteCancelBtn) {
    teacherNoteCancelBtn.addEventListener("click", closeTeacherNotePanel);
  }
  if (teacherNoteSaveBtn) {
    teacherNoteSaveBtn.addEventListener("click", () => {
      if (!teacherNoteCanvasEl || !Number.isFinite(teacherNoteSlot)) return;
      const msg = {
        type: "teacher:annotate",
        slotNumber: teacherNoteSlot,
        image: teacherNoteCanvasEl.toDataURL("image/webp", 0.92),
      };
      if (!sendWs(msg)) {
        alert("未接続のため反映できません。");
        return;
      }
      log("追記を反映: slot " + teacherNoteSlot);
      closeTeacherNotePanel();
    });
  }
  deleteBtn.addEventListener("click", () => { void deleteRoom(); });
  window.addEventListener("keydown", (ev) => {
    if (isTypingTarget(ev.target)) return;
    if (ev.key.toLowerCase() === "p" && ev.shiftKey) {
      ev.preventDefault();
      togglePresenterMode();
      return;
    }
    if (/^[1-8]$/.test(ev.key)) {
      const ok = selectJudgeSlot(Number(ev.key));
      if (ok) {
        log("採点対象を slot " + ev.key + " に変更");
      }
      return;
    }
    const key = ev.key.toLowerCase();
    if (key === "o") {
      ev.preventDefault();
      runJudgeShortcut("grade-o");
      return;
    }
    if (key === "x") {
      ev.preventDefault();
      runJudgeShortcut("grade-x");
      return;
    }
    if (key === "r") {
      ev.preventDefault();
      runJudgeShortcut("resubmit");
    }
  });

  render();
  updatePresenterToggleLabel();
  if (hostKeyEl.value.trim()) {
    connect();
  }
  setInterval(render, 1000);
})();`;
}
