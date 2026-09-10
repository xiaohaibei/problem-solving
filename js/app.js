(function () {
  const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const WRONG_STORAGE_PREFIX = "quiz-wrong-ids:";
  const PROGRESS_STORAGE_PREFIX = "quiz-progress:";

  let quizTitle = "在线刷题";
  let questions = [];
  let currentIndex = 0;
  /** @type {Record<number, number>} 每题用户选择的选项索引，key 为题目 id */
  const selections = {};
  /** @type {Set<number>} 错题 id 集合 */
  let wrongIds = new Set();

  const $ = (id) => document.getElementById(id);

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

  function updateProgressUI() {
    const count = getAnsweredCount();
    const wrongCount = wrongIds.size;
    const startBtn = $("btn-start");
    const clearBtn = $("btn-clear-progress");
    const stats = $("start-stats");
    const statAnswered = $("stat-answered");

    if (statAnswered) {
      statAnswered.textContent = count;
    }
    if (stats) {
      stats.classList.toggle("hidden", count === 0 && wrongCount === 0);
    }
    if (startBtn) {
      startBtn.textContent = count > 0 ? "继续做题" : "开始做题";
    }
    if (clearBtn) {
      clearBtn.disabled = count === 0;
    }
  }

  function goHome() {
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

    updateProgressUI();
  }

  function showScreen(name) {
    screenStart.classList.toggle("hidden", name !== "start");
    screenQuiz.classList.toggle("hidden", name !== "quiz");
    screenWrong.classList.toggle("hidden", name !== "wrong");
    screenError.classList.add("hidden");
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
    $("btn-clear-progress").addEventListener("click", () => {
      if (getAnsweredCount() === 0) return;
      if (confirm("确定清除全部做题记录吗？已作答内容将被重置。")) {
        clearProgress();
        if (!screenQuiz.classList.contains("hidden")) {
          renderQuestion();
        }
      }
    });
    $("btn-prev").addEventListener("click", () => goTo(currentIndex - 1));
    $("btn-next").addEventListener("click", () => goTo(currentIndex + 1));
  }

  function getQuestionIndexById(id) {
    return questions.findIndex((q) => q.id === id);
  }

  function startQuiz() {
    if (currentIndex < 0 || currentIndex >= questions.length) {
      currentIndex = 0;
    }
    showScreen("quiz");
    renderQuestion();
  }

  function openWrongBook() {
    saveProgress();
    renderWrongBook();
    showScreen("wrong");
  }

  function goToQuestionById(id) {
    const index = getQuestionIndexById(id);
    if (index < 0) return;
    currentIndex = index;
    saveProgress();
    showScreen("quiz");
    renderQuestion();
  }

  function goTo(index) {
    if (index < 0 || index >= questions.length) return;
    currentIndex = index;
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

  function renderWrongBook() {
    const list = $("wrong-list");
    const empty = $("wrong-empty");
    const ids = [...wrongIds].sort((a, b) => a - b);

    list.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);

    ids.forEach((id) => {
      const q = questions.find((item) => item.id === id);
      if (!q) return;

      const li = document.createElement("li");
      li.className = "wrong-item";

      const main = document.createElement("button");
      main.type = "button";
      main.className = "wrong-item-main";
      main.innerHTML =
        `<span class="wrong-item-id">第 ${id} 题</span>` +
        `<span class="wrong-item-text">${q.question}</span>` +
        `<span class="wrong-item-answer">正确答案：${formatAnswerLabels(q)}</span>`;

      main.addEventListener("click", () => goToQuestionById(id));

      const mastered = document.createElement("button");
      mastered.type = "button";
      mastered.className = "btn btn-success btn-sm";
      mastered.textContent = "已会";
      mastered.addEventListener("click", (e) => {
        e.stopPropagation();
        removeWrong(id);
        renderWrongBook();
      });

      li.append(main, mastered);
      list.appendChild(li);
    });

    updateWrongCount();
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    const selected = selections[q.id];
    const isRevealed = selected !== undefined;
    const correctIndices = getCorrectIndices(q);
    const answeredCount = getAnsweredCount();

    $("current-num").textContent = currentIndex + 1;
    $("progress-fill").style.width =
      ((answeredCount / questions.length) * 100) + "%";

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

      li.addEventListener("click", () => selectOption(i));
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

    $("btn-prev").disabled = currentIndex === 0;
    $("btn-next").disabled = currentIndex === questions.length - 1;
  }

  function selectOption(index) {
    const q = questions[currentIndex];
    if (selections[q.id] !== undefined) return;

    selections[q.id] = index;
    saveProgress();

    if (!isAnswerCorrect(q, index)) {
      addWrong(q.id);
    }

    renderQuestion();
  }

  init();
})();
