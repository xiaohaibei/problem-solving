(function () {
  const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const WRONG_STORAGE_PREFIX = "quiz-wrong-ids:";
  const PROGRESS_STORAGE_PREFIX = "quiz-progress:";

  let quizTitle = "在线刷题";
  let questions = [];
  let currentIndex = 0;
  /** @type {"all" | "wrong"} */
  let quizMode = "all";
  /** @type {number[]} 错题重做题在 questions 中的索引 */
  let wrongIndices = [];
  /** @type {Record<number, number>} 每题用户选择的选项索引，key 为题目 id */
  const selections = {};
  /** @type {Set<number>} 错题 id 集合（错题记录，与做题记录独立） */
  let wrongIds = new Set();
  /** @type {Set<number>} 本次错题重做已作答的题目 id */
  let wrongRedoAttempted = new Set();
  /** 进入做题页后短暂忽略选项点击，防止按钮点击穿透 */
  let quizInteractionReady = true;
  let quizInteractionTimer = null;
  /** 答题卡是否展开 */
  let answerSheetExpanded = false;

  const $ = (id) => document.getElementById(id);

  const appEl = document.querySelector(".app");
  const screenStart = $("screen-start");
  const screenQuiz = $("screen-quiz");
  const screenWrong = $("screen-wrong");
  const screenError = $("screen-error");

  function wrongStorageKey() {
    return WRONG_STORAGE_PREFIX + quizTitle;
  }

  function progressStorageKey() {
    return PROGRESS_STORAGE_PREFIX + quizTitle;
  }

  function loadWrongIds() {
    try {
      const raw = localStorage.getItem(wrongStorageKey());
      wrongIds = new Set(raw ? JSON.parse(raw) : []);
    } catch {
      wrongIds = new Set();
    }
  }

  function saveWrongIds() {
    localStorage.setItem(wrongStorageKey(), JSON.stringify([...wrongIds]));
    updateWrongCount();
  }

  function addWrong(id) {
    if (!wrongIds.has(id)) {
      wrongIds.add(id);
      saveWrongIds();
    }
  }

  function removeWrong(id) {
    if (wrongIds.delete(id)) {
      saveWrongIds();
    }
  }

  function clearWrong() {
    wrongIds.clear();
    saveWrongIds();
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(progressStorageKey());
      if (!raw) return;
      const data = JSON.parse(raw);
      currentIndex = Number.isInteger(data.currentIndex) ? data.currentIndex : 0;
      const saved = data.selections || {};
      Object.keys(selections).forEach((key) => delete selections[key]);
      Object.entries(saved).forEach(([id, value]) => {
        selections[Number(id)] = value;
      });
    } catch {
      currentIndex = 0;
    }
  }

  function saveProgress() {
    localStorage.setItem(
      progressStorageKey(),
      JSON.stringify({
        currentIndex,
        selections,
      })
    );
    updateProgressUI();
  }

  function clearProgress() {
    Object.keys(selections).forEach((key) => delete selections[key]);
    currentIndex = 0;
    localStorage.removeItem(progressStorageKey());
    updateProgressUI();
  }

  function getAnsweredCount() {
    return Object.keys(selections).length;
  }

  function getCorrectCount() {
    let correct = 0;
    Object.entries(selections).forEach(([idStr, selected]) => {
      const q = questions.find((item) => item.id === Number(idStr));
      if (q && isAnswerCorrect(q, selected)) {
        correct += 1;
      }
    });
    return correct;
  }

  function getCorrectRateText() {
    const answered = getAnsweredCount();
    if (answered === 0) return "--";
    return Math.round((getCorrectCount() / answered) * 100) + "%";
  }

  function updateProgressUI() {
    const count = getAnsweredCount();
    const wrongCount = wrongIds.size;
    const startBtn = $("btn-start");
    const clearBtn = $("btn-clear-progress");
    const stats = $("start-stats");
    const statAnswered = $("stat-answered");
    const statRate = $("stat-rate");

    if (statAnswered) {
      statAnswered.textContent = count;
    }
    if (statRate) {
      statRate.textContent = getCorrectRateText();
    }
    if (stats) {
      stats.classList.remove("hidden");
    }
    if (startBtn) {
      startBtn.textContent = count > 0 ? "继续做题" : "开始做题";
    }
    if (clearBtn) {
      clearBtn.disabled = count === 0;
    }
  }

  function goHome() {
    quizMode = "all";
    wrongIndices = [];
    wrongRedoAttempted.clear();
    saveProgress();
    showScreen("start");
    updateProgressUI();
  }

  function updateWrongCount() {
    const count = wrongIds.size;
    ["wrong-count-start", "wrong-count-quiz"].forEach((id) => {
      const badge = $(id);
      if (badge) {
        badge.textContent = count;
        badge.classList.toggle("hidden", count === 0);
      }
    });
    const statWrong = $("stat-wrong");

    if (statWrong) {
      statWrong.textContent = count;
    }

    ["btn-clear-wrong", "btn-clear-wrong-start"].forEach((id) => {
      const clearBtn = $(id);
      if (clearBtn) clearBtn.disabled = count === 0;
    });

    const redoBtn = $("btn-redo-wrong");
    if (redoBtn) redoBtn.disabled = count === 0;

    updateProgressUI();
  }

  function lockQuizInteraction() {
    quizInteractionReady = false;
    if (quizInteractionTimer) clearTimeout(quizInteractionTimer);
    quizInteractionTimer = setTimeout(() => {
      quizInteractionReady = true;
      quizInteractionTimer = null;
    }, 400);
  }

  function showScreen(name) {
    screenStart.classList.toggle("hidden", name !== "start");
    screenQuiz.classList.toggle("hidden", name !== "quiz");
    screenWrong.classList.toggle("hidden", name !== "wrong");
    screenError.classList.add("hidden");
    if (appEl) {
      appEl.classList.toggle("is-quiz", name === "quiz");
    }
    if (name === "quiz") {
      lockQuizInteraction();
      collapseAnswerSheet();
    }
  }

  async function init() {
    try {
      const res = await fetch("data/questions.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      questions = data.questions || [];
      if (questions.length === 0) throw new Error("题库为空");

      quizTitle = data.title || "在线刷题";
      $("quiz-title").textContent = quizTitle;
      $("total-count").textContent = questions.length;
      $("total-num").textContent = questions.length;

      loadWrongIds();
      loadProgress();
      if (currentIndex < 0 || currentIndex >= questions.length) {
        currentIndex = 0;
      }
      updateWrongCount();
      updateProgressUI();
      bindEvents();
    } catch (err) {
      $("error-message").textContent = err.message;
      screenStart.classList.add("hidden");
      screenError.classList.remove("hidden");
    }
  }

  function bindEvents() {
    $("btn-start").addEventListener("click", startQuiz);
    $("btn-wrong-book").addEventListener("click", openWrongBook);
    $("btn-wrong-book-quiz").addEventListener("click", openWrongBook);
    $("btn-back-start").addEventListener("click", goHome);
    $("btn-back-home-quiz").addEventListener("click", goHome);
    const onClearWrong = () => {
      if (wrongIds.size === 0) return;
      if (confirm("确定清空全部错题记录吗？")) {
        clearWrong();
        if (!screenWrong.classList.contains("hidden")) {
          renderWrongBook();
        }
      }
    };
    $("btn-clear-wrong").addEventListener("click", onClearWrong);
    $("btn-clear-wrong-start").addEventListener("click", onClearWrong);
    $("btn-redo-wrong").addEventListener("click", startWrongRedo);
    $("btn-clear-progress").addEventListener("click", () => {
      if (getAnsweredCount() === 0) return;
      if (confirm("确定清除全部做题记录吗？已作答内容将被重置。")) {
        clearProgress();
        if (!screenQuiz.classList.contains("hidden")) {
          renderQuestion();
        }
      }
    });
    $("btn-prev").addEventListener("click", () => goToRelative(-1));
    $("btn-next").addEventListener("click", () => goToRelative(1));
    $("answer-sheet-toggle").addEventListener("click", toggleAnswerSheet);
  }

  function getQuestionIndexById(id) {
    return questions.findIndex((q) => q.id === id);
  }

  function startQuiz() {
    quizMode = "all";
    wrongIndices = [];
    wrongRedoAttempted.clear();
    if (currentIndex < 0 || currentIndex >= questions.length) {
      currentIndex = 0;
    }
    showScreen("quiz");
    renderQuestion();
  }

  function buildWrongIndices() {
    return [...wrongIds]
      .sort((a, b) => a - b)
      .map((id) => getQuestionIndexById(id))
      .filter((index) => index >= 0);
  }

  function startWrongRedo() {
    wrongIndices = buildWrongIndices();
    if (wrongIndices.length === 0) return;

    quizMode = "wrong";
    wrongRedoAttempted.clear();
    currentIndex = wrongIndices[0];
    saveProgress();
    showScreen("quiz");
    renderQuestion();
  }

  /** 错题重做中、尚未重新作答：不展示做题记录里的答案 */
  function isWrongRedoPending(q) {
    return quizMode === "wrong" && wrongIds.has(q.id) && !wrongRedoAttempted.has(q.id);
  }

  function openWrongBook() {
    saveProgress();
    renderWrongBook();
    showScreen("wrong");
  }

  function goToQuestionById(id) {
    const index = getQuestionIndexById(id);
    if (index < 0) return;
    quizMode = "all";
    wrongIndices = [];
    wrongRedoAttempted.clear();
    currentIndex = index;
    saveProgress();
    showScreen("quiz");
    renderQuestion();
  }

  function getWrongPosition() {
    return wrongIndices.indexOf(currentIndex);
  }

  function goToRelative(delta) {
    if (quizMode === "wrong") {
      const pos = getWrongPosition();
      const nextPos = pos + delta;
      if (nextPos < 0 || nextPos >= wrongIndices.length) return;
      currentIndex = wrongIndices[nextPos];
    } else {
      if (currentIndex + delta < 0 || currentIndex + delta >= questions.length) return;
      currentIndex += delta;
    }
    saveProgress();
    renderQuestion();
  }

  function getCorrectIndices(q) {
    return Array.isArray(q.answer) ? q.answer : [q.answer];
  }

  function formatAnswerLabels(q) {
    return getCorrectIndices(q)
      .map((i) => LABELS[i])
      .join("、");
  }

  function isAnswerCorrect(q, selected) {
    return getCorrectIndices(q).includes(selected);
  }

  function getQuestionStatus(q) {
    const selected = selections[q.id];
    if (selected === undefined) return "unanswered";
    return isAnswerCorrect(q, selected) ? "correct" : "wrong";
  }

  function collapseAnswerSheet() {
    answerSheetExpanded = false;
    updateAnswerSheetView();
  }

  function toggleAnswerSheet() {
    answerSheetExpanded = !answerSheetExpanded;
    updateAnswerSheetView();
  }

  function updateAnswerSheetView() {
    const card = $("answer-sheet-card");
    const body = $("answer-sheet-body");
    if (card) card.classList.toggle("expanded", answerSheetExpanded);
    if (body) body.classList.toggle("hidden", !answerSheetExpanded);
    if (answerSheetExpanded) renderAnswerSheet();
  }

  function goToQuestionFromSheet(index) {
    if (index < 0 || index >= questions.length) return;
    if (quizMode === "wrong") {
      quizMode = "all";
      wrongIndices = [];
      wrongRedoAttempted.clear();
    }
    currentIndex = index;
    saveProgress();
    showScreen("quiz");
    renderQuestion();
  }

  function renderAnswerSheetGrid(gridId) {
    const grid = $(gridId);
    if (!grid) return;

    grid.innerHTML = "";
    questions.forEach((q, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-dot sheet-" + getQuestionStatus(q);
      if (index === currentIndex) btn.classList.add("sheet-current");
      btn.textContent = q.id;
      btn.title = `第 ${q.id} 题`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        goToQuestionFromSheet(index);
      });
      grid.appendChild(btn);
    });
  }

  function renderAnswerSheet() {
    if (!answerSheetExpanded) return;
    renderAnswerSheetGrid("answer-sheet-grid");
  }

  function renderWrongBook() {
    const list = $("wrong-list");
    const empty = $("wrong-empty");
    const sheet = $("wrong-sheet-card");
    const ids = [...wrongIds].sort((a, b) => a - b);

    list.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);
    if (sheet) sheet.classList.toggle("hidden", ids.length === 0);

    ids.forEach((id) => {
      if (!questions.some((item) => item.id === id)) return;

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "wrong-dot";
      dot.textContent = id;
      dot.title = `第 ${id} 题`;
      dot.addEventListener("click", () => goToQuestionById(id));
      list.appendChild(dot);
    });

    updateWrongCount();
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    const pendingRedo = isWrongRedoPending(q);
    const selected = pendingRedo ? undefined : selections[q.id];
    const isRevealed = selections[q.id] !== undefined && !pendingRedo;
    const correctIndices = getCorrectIndices(q);
    const answeredCount = getAnsweredCount();

    $("current-num").textContent = q.id;
    $("total-num").textContent = questions.length;

    if (quizMode === "wrong") {
      const pos = getWrongPosition();
      $("progress-fill").style.width =
        wrongIndices.length > 0
          ? (((pos + 1) / wrongIndices.length) * 100) + "%"
          : "0%";
    } else {
      $("progress-fill").style.width =
        ((answeredCount / questions.length) * 100) + "%";
    }

    $("question-text").textContent = q.question;

    const list = $("options-list");
    list.innerHTML = "";

    q.options.forEach((text, i) => {
      const li = document.createElement("li");
      li.className = "option";
      if (selected === i) li.classList.add("selected");
      if (isRevealed) {
        li.classList.add("disabled");
        if (correctIndices.includes(i)) li.classList.add("correct");
        if (selected === i && !correctIndices.includes(i)) li.classList.add("wrong");
      }

      li.innerHTML =
        `<span class="option-label">${LABELS[i]}</span>` +
        `<span class="option-text">${text}</span>`;

      li.addEventListener("click", (e) => {
        e.preventDefault();
        selectOption(i);
      });
      list.appendChild(li);
    });

    const result = $("answer-result");
    const explanation = $("answer-explanation");
    if (isRevealed) {
      const correct = isAnswerCorrect(q, selected);
      result.className = "answer-result " + (correct ? "correct-text" : "wrong-text");
      result.textContent = correct
        ? `回答正确！正确答案是 ${formatAnswerLabels(q)}`
        : `回答错误。正确答案是 ${formatAnswerLabels(q)}。已加入错题记录。`;
      if (q.explanation) {
        explanation.textContent = q.explanation;
        explanation.classList.remove("hidden");
      } else {
        explanation.textContent = "";
        explanation.classList.add("hidden");
      }
    } else {
      result.className = "answer-result";
      result.textContent = "";
      explanation.textContent = "";
      explanation.classList.add("hidden");
    }

    if (quizMode === "wrong") {
      const pos = getWrongPosition();
      $("btn-prev").disabled = pos <= 0;
      $("btn-next").disabled = pos >= wrongIndices.length - 1;
    } else {
      $("btn-prev").disabled = currentIndex === 0;
      $("btn-next").disabled = currentIndex === questions.length - 1;
    }

    if (answerSheetExpanded) renderAnswerSheet();
  }

  function selectOption(index) {
    if (!quizInteractionReady) return;

    const q = questions[currentIndex];
    if (selections[q.id] !== undefined && !isWrongRedoPending(q)) return;

    if (quizMode === "wrong") {
      wrongRedoAttempted.add(q.id);
    }

    selections[q.id] = index;
    saveProgress();

    const correct = isAnswerCorrect(q, index);
    if (!correct) {
      addWrong(q.id);
      renderQuestion();
      return;
    }

    if (quizMode === "wrong") {
      const pos = getWrongPosition();
      removeWrong(q.id);
      wrongIndices = buildWrongIndices();
      if (wrongIndices.length === 0) {
        alert("恭喜，错题已全部重做正确！");
        quizMode = "all";
        goHome();
        return;
      }
      currentIndex = wrongIndices[Math.min(pos, wrongIndices.length - 1)];
      saveProgress();
    }

    renderQuestion();
  }

  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener("gesturestart", (e) => e.preventDefault());

  init();
})();
