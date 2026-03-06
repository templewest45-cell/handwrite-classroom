export function renderSummaryScript(roomId: string): string {
  return `(() => {
  const roomId = ${JSON.stringify(roomId)};
  const qs = new URLSearchParams(location.search);
  const hostKey = (qs.get("hostKey") || "").trim();
  const hostUrl = location.origin + "/host/" + roomId + (hostKey ? ("?hostKey=" + encodeURIComponent(hostKey)) : "");
  const pageTitleEl = document.getElementById("pageTitle");
  const statusPillEl = document.getElementById("statusPill");
  const questionPillEl = document.getElementById("questionPill");
  const updatedAtEl = document.getElementById("updatedAt");
  const nextFromSummaryBtnEl = document.getElementById("nextFromSummaryBtn");
  const summaryControlStatusEl = document.getElementById("summaryControlStatus");
  const stageBadgeEl = document.getElementById("stageBadge");
  const stageSubEl = document.getElementById("stageSub");
  const accuracyRateEl = document.getElementById("accuracyRate");
  const correctCountEl = document.getElementById("correctCount");
  const submittedCountEl = document.getElementById("submittedCount");
  const boardCardEl = document.getElementById("boardCard");
  const boardEl = document.getElementById("board");
  const finalStudentsCardEl = document.getElementById("finalStudentsCard");
  const finalStudentsEl = document.getElementById("finalStudents");
  const finalQuestionsCardEl = document.getElementById("finalQuestionsCard");
  const finalQuestionsTitleEl = document.getElementById("finalQuestionsTitle");
  const finalQuestionsEl = document.getElementById("finalQuestions");

  let hostWs = null;
  let latestStatus = "CREATED";

  function setError(message) {
    statusPillEl.textContent = "状態: エラー";
    questionPillEl.textContent = message;
  }

  function updateControlStatus(text, isError) {
    if (!summaryControlStatusEl) return;
    summaryControlStatusEl.textContent = text;
    summaryControlStatusEl.style.color = isError ? "#b91c1c" : "#475569";
  }

  function isHostConnected() {
    return !!hostWs && hostWs.readyState === 1;
  }

  function sendControl(msg) {
    if (!isHostConnected()) {
      updateControlStatus("未接続", true);
      return false;
    }
    hostWs.send(JSON.stringify(msg));
    return true;
  }

  function connectHostControl() {
    if (!hostKey) return;
    if (hostWs && (hostWs.readyState === 0 || hostWs.readyState === 1)) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = proto + "://" + location.host + "/api/rooms/" + roomId + "/ws/host?hostKey=" + encodeURIComponent(hostKey);
    hostWs = new WebSocket(wsUrl);
    updateControlStatus("接続中...", false);
    hostWs.onopen = () => updateControlStatus("接続済み", false);
    hostWs.onclose = () => {
      updateControlStatus("切断", true);
      hostWs = null;
      setTimeout(connectHostControl, 1000);
    };
    hostWs.onerror = () => updateControlStatus("接続エラー", true);
  }

  function render(data) {
    latestStatus = data.status || latestStatus;
    statusPillEl.textContent = "状態: " + data.status;
    questionPillEl.textContent = "問題: " + (data.questionText || ("第" + data.currentQuestionPos + "問"));
    updatedAtEl.textContent = "更新: " + new Date().toLocaleTimeString();

    if (data.status === "OPEN" || data.status === "CREATED") {
      pageTitleEl.textContent = "公開解答ボード";
      stageBadgeEl.textContent = "解答中";
      stageSubEl.textContent = "各生徒の途中解答を表示しています";
      boardCardEl.classList.remove("hidden");
    } else if (data.status === "LOCKED") {
      pageTitleEl.textContent = "公開解答ボード";
      stageBadgeEl.textContent = "解答締切";
      stageSubEl.textContent = "提出済みの解答を表示しています";
      boardCardEl.classList.remove("hidden");
    } else {
      pageTitleEl.textContent = "最終結果";
      stageBadgeEl.textContent = "終了";
      stageSubEl.textContent = "最終解答を表示しています";
      boardCardEl.classList.add("hidden");
    }

    if (nextFromSummaryBtnEl) {
      if (data.status === "CLOSED") {
        nextFromSummaryBtnEl.disabled = false;
      } else {
        nextFromSummaryBtnEl.disabled = data.status === "CREATED" || !isHostConnected();
      }
    }

    const totals = data && typeof data.totals === "object" && data.totals ? data.totals : {};
    const correct = Number(totals.correct) || 0;
    const graded = Number(totals.graded) || 0;
    const submitted = Number(totals.submitted) || 0;
    const joined = Number(totals.joined) || 0;
    const rate = graded > 0 ? Math.round((correct / graded) * 100) : 0;
    accuracyRateEl.textContent = rate + "%";
    correctCountEl.textContent = correct + " / " + graded;
    submittedCountEl.textContent = submitted + " / " + joined;

    const rows = Array.isArray(data.slots) ? data.slots : [];
    boardEl.innerHTML = rows
      .map((s) => {
        const image = typeof s.previewImage === "string" && s.previewImage
          ? "<img class='tileImg' src='" + s.previewImage + "' alt='slot " + s.slotNumber + " answer' />"
          : "<div class='empty'>未入力</div>";
        const name = typeof s.participantName === "string" && s.participantName.trim()
          ? s.participantName.trim()
          : "未参加";
        const gradeClass = s.grade === "O" ? "ok" : (s.grade === "X" ? "ng" : "");
        const gradeText = s.grade === "O" ? "O" : (s.grade === "X" ? "X" : "-");
        return "<article class='tile'>" +
          "<div class='tileHead'><strong>Slot " + s.slotNumber + "</strong><span class='gradeBadge " + gradeClass + "'>採点: " + gradeText + "</span></div>" +
          "<div class='tileName'>" + name + " / " + s.state + "</div>" +
          image +
          "</article>";
      })
      .join("");

    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (data.status !== "CLOSED") {
      finalStudentsCardEl.classList.add("hidden");
      finalQuestionsCardEl.classList.add("hidden");
      return;
    }

    finalStudentsCardEl.classList.remove("hidden");
    finalQuestionsCardEl.classList.remove("hidden");
    finalQuestionsTitleEl.textContent = "全問題の結果";

    const students = Array.isArray(data.students) ? data.students : [];
    if (!students.length) {
      finalStudentsEl.innerHTML = "<div class='muted'>集計データがありません</div>";
    } else {
      const rowsHtml = students
        .map((s) => {
          const name = typeof s.participantName === "string" && s.participantName.trim() ? s.participantName.trim() : s.participantId;
          return "<tr><td>" + name + "</td><td>" + s.correct + " / " + s.graded + "</td><td>" + s.accuracy + "%</td></tr>";
        })
        .join("");
      finalStudentsEl.innerHTML =
        "<table class='studentTable'><thead><tr><th>生徒</th><th>正解 / 採点</th><th>正解率</th></tr></thead><tbody>" +
        rowsHtml +
        "</tbody></table>";
    }

    if (!questions.length) {
      finalQuestionsEl.innerHTML = "<div class='muted'>問題履歴がありません</div>";
      return;
    }
    finalQuestionsEl.innerHTML = renderQuestionCards(questions);
  }

  function renderQuestionCards(questions) {
    return questions
      .map((q) => {
        const questionRows = Array.isArray(q.results) ? q.results : [];
        const answersHtml = questionRows
          .map((r) => {
            const name = typeof r.participantName === "string" && r.participantName.trim()
              ? r.participantName.trim()
              : (r.participantId || ("参加者" + r.slotNumber));
            const grade = r.grade || "-";
            const image = typeof r.finalImage === "string" && r.finalImage
              ? "<img src='" + r.finalImage + "' alt='" + name + " answer' />"
              : "<div class='qhAnswerEmpty'>未提出</div>";
            return "<div class='qhAnswer'><div class='qhAnswerHead'><span>" + name + "</span><span>採点: " + grade + "</span></div>" + image + "</div>";
          })
          .join("");
        return "<div class='qhItem'><div class='qhTitle'>第" + q.questionPos + "問: " + q.questionText + "</div><div class='qhAnswerGrid'>" + answersHtml + "</div></div>";
      })
      .join("");
  }

  if (hostKey) {
    nextFromSummaryBtnEl.classList.remove("hidden");
    summaryControlStatusEl.classList.remove("hidden");
    nextFromSummaryBtnEl.addEventListener("click", () => {
      if (latestStatus === "CLOSED") {
        location.href = "/";
        return;
      }
      if (!sendControl({ type: "control:next" })) return;
      updateControlStatus("次の問題へ送信", false);
      setTimeout(() => {
        location.href = hostUrl;
      }, 250);
    });
    connectHostControl();
  }

  async function reload() {
    try {
      const res = await fetch("/api/rooms/" + roomId + "/public-summary", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data && data.error ? data.error : "取得失敗");
        return;
      }
      render(data);
      if (nextFromSummaryBtnEl) {
        nextFromSummaryBtnEl.textContent = data.status === "CLOSED" ? "終了" : "次の問題へ";
      }
    } catch {
      setError("通信失敗");
    }
  }

  void reload();
  setInterval(() => {
    void reload();
  }, 1200);
})();`;
}
