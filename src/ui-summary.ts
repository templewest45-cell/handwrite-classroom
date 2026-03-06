export function renderSummaryScript(roomId: string): string {
  return `(() => {
  const roomId = ${JSON.stringify(roomId)};
  const statusPillEl = document.getElementById("statusPill");
  const questionPillEl = document.getElementById("questionPill");
  const updatedAtEl = document.getElementById("updatedAt");
  const stageBadgeEl = document.getElementById("stageBadge");
  const stageSubEl = document.getElementById("stageSub");
  const accuracyRateEl = document.getElementById("accuracyRate");
  const correctCountEl = document.getElementById("correctCount");
  const submittedCountEl = document.getElementById("submittedCount");
  const boardEl = document.getElementById("board");
  const finalStudentsCardEl = document.getElementById("finalStudentsCard");
  const finalStudentsEl = document.getElementById("finalStudents");
  const finalQuestionsCardEl = document.getElementById("finalQuestionsCard");
  const finalQuestionsEl = document.getElementById("finalQuestions");

  function setError(message) {
    statusPillEl.textContent = "状態: エラー";
    questionPillEl.textContent = message;
  }

  function render(data) {
    statusPillEl.textContent = "状態: " + data.status;
    questionPillEl.textContent = "問題: " + (data.questionText || ("第" + data.currentQuestionPos + "問"));
    updatedAtEl.textContent = "更新: " + new Date().toLocaleTimeString();

    if (data.status === "OPEN" || data.status === "CREATED") {
      stageBadgeEl.textContent = "解答中";
      stageSubEl.textContent = "各生徒の途中解答を表示しています";
    } else if (data.status === "LOCKED") {
      stageBadgeEl.textContent = "解答締切";
      stageSubEl.textContent = "提出済みの解答を表示しています";
    } else {
      stageBadgeEl.textContent = "終了";
      stageSubEl.textContent = "最終解答を表示しています";
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

    if (data.status !== "CLOSED") {
      finalStudentsCardEl.classList.add("hidden");
      finalQuestionsCardEl.classList.add("hidden");
      return;
    }

    finalStudentsCardEl.classList.remove("hidden");
    finalQuestionsCardEl.classList.remove("hidden");

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

    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (!questions.length) {
      finalQuestionsEl.innerHTML = "<div class='muted'>問題履歴がありません</div>";
      return;
    }
    finalQuestionsEl.innerHTML = questions
      .map((q) => {
        const questionRows = Array.isArray(q.results) ? q.results : [];
        const rowsHtml = questionRows
          .map((r) => {
            const name = typeof r.participantName === "string" && r.participantName.trim() ? r.participantName.trim() : (r.participantId || ("参加者" + r.slotNumber));
            const grade = r.grade || "-";
            return "<div class='qhRow'><span>" + name + "</span><span>採点: " + grade + "</span></div>";
          })
          .join("");
        return "<div class='qhItem'><div class='qhTitle'>第" + q.questionPos + "問: " + q.questionText + "</div><div class='qhRows'>" + rowsHtml + "</div></div>";
      })
      .join("");
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
