(function () {
  const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  let questions = [];
  let currentIndex = 0;
  /** @type {Record<number, number>} 每题用户选择的选项索引 */
  const selections = {};
  /** 当前题目是否已展示答案（切换题目时重置） */
  let revealedCurrent = false;

  const $ = (id) => document.getElementById(id);

  const screenStart = $("screen-start");
  const screenQuiz = $("screen-quiz");
  const screenError = $("screen-error");

  async function init() {
    try {
      const res = await fetch("data/questions.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      questions = data.questions || [];
      if (questions.length === 0) throw new Error("题库为空");

      $("quiz-title").textContent = data.title || "在线刷题";
      $("total-count").textContent = questions.length;
      $("total-num").textContent = questions.length;

      bindEvents();
    } catch (err) {
      $("error-message").textContent = err.message;
      screenStart.classList.add("hidden");
      screenError.classList.remove("hidden");
    }
  }

  function bindEvents() {
    $("btn-start").addEventListener("click", startQuiz);
    $("btn-prev").addEventListener("click", () => goTo(currentIndex - 1));
    $("btn-next").addEventListener("click", () => goTo(currentIndex + 1));
  }

  function startQuiz() {
    currentIndex = 0;
    screenStart.classList.add("hidden");
    screenQuiz.classList.remove("hidden");
    renderQuestion();
  }

  function goTo(index) {
    if (index < 0 || index >= questions.length) return;
    currentIndex = index;
    revealedCurrent = false;
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

  function renderQuestion() {
    const q = questions[currentIndex];
    const selected = selections[currentIndex];
    const isRevealed = revealedCurrent;
    const correctIndices = getCorrectIndices(q);

    $("current-num").textContent = currentIndex + 1;
    $("progress-fill").style.width =
      ((currentIndex + 1) / questions.length) * 100 + "%";

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

    const panel = $("answer-panel");
    if (isRevealed) {
      panel.classList.remove("hidden");
      const correct = isAnswerCorrect(q, selected);
      const result = $("answer-result");
      result.className = "answer-result " + (correct ? "correct-text" : "wrong-text");
      result.textContent = correct
        ? `回答正确！正确答案是 ${formatAnswerLabels(q)}`
        : `回答错误。正确答案是 ${formatAnswerLabels(q)}`;
      $("answer-explanation").textContent =
        q.explanation || "暂无解析。";
    } else {
      panel.classList.add("hidden");
    }

    $("btn-prev").disabled = currentIndex === 0;
    $("btn-next").disabled = currentIndex === questions.length - 1;
  }

  function selectOption(index) {
    if (revealedCurrent) return;

    selections[currentIndex] = index;
    revealedCurrent = true;
    renderQuestion();
  }

  init();
})();
