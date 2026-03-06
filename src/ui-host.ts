export function renderHostScript(roomId: string): string {
  return `(() => {
  const roomId = ${JSON.stringify(roomId)};
  const qs = new URLSearchParams(location.search);
  const hostKeyEl = document.getElementById("hostKey");
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const openBtn = document.getElementById("openBtn");
  const lockBtn = document.getElementById("lockBtn");
  const nextBtn = document.getElementById("nextBtn");
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
  const showJudgeButtonsToggleEl = document.getElementById("showJudgeButtonsToggle");
  const judgeHintEl = document.getElementById("judgeHint");
  const questionInputEl = document.getElementById("questionInput");
  const applyQuestionsBtn = document.getElementById("applyQuestionsBtn");
  const realtimeBarEl = document.getElementById("realtimeBar");
  const slotsEl = document.getElementById("slots");
  const logEl = document.getElementById("log");

  hostKeyEl.value = qs.get("hostKey") || "";
  const summaryUrl = location.origin + "/summary/" + roomId;
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
  let selectedJudgeSlot = null;
  let showNextQuestion = false;
  let showAnswers = false;
  let showJudgeButtons = false;
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

  function questionTextAt(pos) {
    const p = Math.max(1, Number(pos) || 1);
    const list = Array.isArray(model.questions) ? model.questions : [];
    const txt = list[p - 1];
    return typeof txt === "string" && txt.trim() ? txt.trim() : ("第" + p + "問");
  }

  function isConnected() {
    return !!ws && ws.readyState === 1;
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
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    hostKeyEl.disabled = connected || roomDeleted;
    deleteBtn.disabled = roomDeleted;
    clearLiveBtn.disabled = !connected || model.liveSlot === null;
    openBtn.disabled = !connected || model.status !== "CREATED";
    lockBtn.disabled = !connected || (model.status !== "OPEN" && model.status !== "LOCKED");
    lockBtn.textContent = model.status === "LOCKED" ? "ロック解除" : "ロック";
    nextBtn.disabled = !connected || model.status === "CLOSED";
    endBtn.disabled = !connected || model.status === "CLOSED";
    applyQuestionsBtn.disabled = !connected || roomDeleted;
  }

  function sendControlAction(msg) {
    const sent = sendWs(msg);
    if (!sent) {
      alert("先に接続してください。");
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

  function render() {
    const now = Date.now();
    const items = Object.values(model.slots).sort((a, b) => a.slotNumber - b.slotNumber);
    slotsEl.innerHTML = "";
    slotsEl.style.display = showAnswers ? "" : "none";
    realtimeBarEl.style.display = showAnswers ? "" : "none";
    if (nextQuestionRowEl) nextQuestionRowEl.style.display = showNextQuestion ? "" : "none";
    if (judgeHintEl) judgeHintEl.style.display = showJudgeButtons ? "none" : "";
    if (showNextQuestionToggleEl) showNextQuestionToggleEl.checked = showNextQuestion;
    if (showAnswersToggleEl) showAnswersToggleEl.checked = showAnswers;
    if (showJudgeButtonsToggleEl) showJudgeButtonsToggleEl.checked = showJudgeButtons;

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

      const canJudge = !!s.finalImage;
      const controls = showJudgeButtons
        ? "<div class='row'>" +
          "<button data-action='grade-o' data-slot='" + s.slotNumber + "'" + (canJudge ? "" : " disabled") + ">O</button>" +
          "<button data-action='grade-x' data-slot='" + s.slotNumber + "'" + (canJudge ? "" : " disabled") + ">X</button>" +
          "<button data-action='resubmit' data-slot='" + s.slotNumber + "'" + (selectable ? "" : " disabled") + ">再提出許可</button>" +
          "</div>"
        : "";

      div.innerHTML =
        "<div><strong>Slot " + s.slotNumber + "</strong>" + (selectedJudgeSlot === s.slotNumber ? " <span class='meta'>(採点対象)</span>" : "") + "</div>" +
        "<div class='meta'>状態: " + s.state + " / 接続: " + s.connected + "</div>" +
        "<div class='meta'>参加者: " + (s.participantName || s.participantId || "-") + "</div>" +
        finalTag +
        gradeTag +
        previewTag +
        liveTag +
        img +
        controls;

      div.addEventListener("click", () => {
        if (!selectable) return;
        selectedJudgeSlot = s.slotNumber;
        sendControlAction({ type: "live:set", slotNumber: s.slotNumber });
        render();
      });

      const actionButtons = div.querySelectorAll("button[data-action]");
      for (const btn of actionButtons) {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (btn.disabled) return;
          const action = btn.getAttribute("data-action");
          const slot = Number(btn.getAttribute("data-slot"));
          if (!Number.isFinite(slot)) return;
          if (action === "grade-o") return sendControlAction({ type: "grade:set", slotNumber: slot, grade: "O" });
          if (action === "grade-x") return sendControlAction({ type: "grade:set", slotNumber: slot, grade: "X" });
          if (action === "resubmit") return sendControlAction({ type: "resubmit:allow", slotNumber: slot });
        });
      }

      slotsEl.appendChild(div);
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
  }

  function connect() {
    if (roomDeleted) return;
    if (isConnected()) return;
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
        if (model.questions.length > 0) {
          questionInputEl.value = model.questions.join("\\n");
        }
      } else if (m.type === "slot:status") {
        const s = model.slots[m.slotNumber];
        if (s) {
          s.connected = m.connected;
          if (m.state) s.state = m.state;
          if (typeof m.participantId === "string") s.participantId = m.participantId;
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
        model.status = m.status;
        model.currentQuestionPos = m.currentQuestionPos || model.currentQuestionPos;
        if (typeof m.questionText === "string" && m.questionText) {
          model.currentQuestionText = m.questionText;
        }
      } else if (m.type === "question:update") {
        model.currentQuestionPos = m.currentQuestionPos || model.currentQuestionPos;
        if (typeof m.questionText === "string" && m.questionText) {
          model.currentQuestionText = m.questionText;
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
        questionInputEl.value = "";
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
    questionInputEl.value = "";
    if (ws) ws.close();
    statusEl.textContent = "削除済み";
    setControlState();
    setStatusPill();
    setTimeout(() => {
      location.href = "/";
    }, 400);
  }

  async function applyQuestions() {
    const hostKey = hostKeyEl.value.trim() || qs.get("hostKey") || "";
    if (!hostKey) {
      alert("hostKey がURLにありません。ロビーから開き直してください。");
      return;
    }

    const questions = questionInputEl.value
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 200);

    if (questions.length === 0) {
      alert("問題文を1行以上入力してください");
      return;
    }

    const res = await fetch("/api/rooms/" + roomId + "/questions?hostKey=" + encodeURIComponent(hostKey), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questions }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {}

    if (!res.ok) {
      const err = data && typeof data.error === "string" ? data.error : "unknown";
      log("問題反映失敗: " + err);
      alert("問題反映失敗: " + err);
      return;
    }

    model.questions = questions;
    model.currentQuestionPos = typeof data.currentQuestionPos === "number" ? data.currentQuestionPos : 1;
    if (typeof data.questionText === "string" && data.questionText) {
      model.currentQuestionText = data.questionText;
    }
    log("問題を反映: " + questions.length + "件");
    render();
  }

  connectBtn.addEventListener("click", connect);
  disconnectBtn.addEventListener("click", () => {
    manualDisconnect = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) ws.close(1000, "manual_disconnect");
  });
  clearLiveBtn.addEventListener("click", () => sendControlAction({ type: "live:set", slotNumber: null }));
  openBtn.addEventListener("click", () => sendControlAction({ type: "control:open" }));
  lockBtn.addEventListener("click", () => {
    if (model.status === "LOCKED") {
      sendControlAction({ type: "control:open" });
      return;
    }
    sendControlAction({ type: "control:lock" });
  });
  nextBtn.addEventListener("click", () => sendControlAction({ type: "control:next" }));
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
  if (showJudgeButtonsToggleEl) {
    showJudgeButtonsToggleEl.addEventListener("change", () => {
      showJudgeButtons = !!showJudgeButtonsToggleEl.checked;
      render();
    });
  }
  deleteBtn.addEventListener("click", () => { void deleteRoom(); });
  applyQuestionsBtn.addEventListener("click", () => { void applyQuestions(); });
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
