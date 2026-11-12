const listEl = document.getElementById("lesson-list");
const lessonEl = document.getElementById("lesson");

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function videoHtml(lesson) {
  if (!lesson.video) {
    return `<div class="video-placeholder"><div><img src="/avatar.svg" alt="">
      <b>Video coming soon</b><p>Add your HeyGen video link in lessons-data.js</p></div></div>`;
  }
  if (/\.(mp4|webm)$/i.test(lesson.video)) return `<video src="${esc(lesson.video)}" controls playsinline></video>`;
  return `<iframe src="${esc(lesson.video)}" title="${esc(lesson.title)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
}

const LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate" };

function renderList(currentId) {
  const progress = Progress.get();
  const done = LESSONS.filter((l) => progress[l.id]).length;
  listEl.innerHTML = `<p class="list-progress">${done} of ${LESSONS.length} lessons done</p>` + LESSONS.map((l, i) => `
    ${i === 0 || LESSONS[i - 1].level !== l.level ? `<h3 class="level-head">${l.level} · ${LEVEL_NAMES[l.level] || ""}</h3>` : ""}
    <button class="lesson-item" data-id="${l.id}" aria-current="${l.id === currentId}">
      <span class="lesson-num">${i + 1}</span>
      <span><b>${esc(l.title)}</b><small>${l.level} · ${l.minutes} min</small></span>
      ${progress[l.id] ? '<span class="done" title="Completed">✓</span>' : ""}
    </button>`).join("");
}

function renderLesson(id) {
  const lesson = LESSONS.find((l) => l.id === id) || LESSONS[0];
  const index = LESSONS.indexOf(lesson);
  const next = LESSONS[index + 1];
  history.replaceState(null, "", `/lessons?id=${lesson.id}`);
  renderList(lesson.id);

  lessonEl.innerHTML = `
    <span class="tag">Lesson ${index + 1} · ${lesson.level}</span>
    <h1 style="margin:8px 0 4px">${esc(lesson.title)}</h1>
    <p style="margin:0;color:var(--muted)">${esc(lesson.summary)}</p>
    <div class="video-box">${videoHtml(lesson)}</div>

    <h2>New words</h2>
    <div class="vocab">
      ${lesson.vocab.map((v) => `
        <div class="vocab-item">
          <div><b>${esc(v.word)}</b><span>${esc(v.meaning)}</span></div>
          <button class="speak-btn" data-say="${esc(v.word)}" aria-label="Listen to ${esc(v.word)}">🔊</button>
        </div>`).join("")}
    </div>

    <h2>Quick quiz</h2>
    <div id="quiz">
      ${lesson.quiz.map((q, qi) => `
        <div class="quiz-q" data-q="${qi}">
          <p>${qi + 1}. ${esc(q.q)}</p>
          <div class="options">${q.options.map((o, oi) => `<button class="option" data-o="${oi}">${esc(o)}</button>`).join("")}</div>
          <p class="feedback"></p>
        </div>`).join("")}
    </div>

    <div class="hero-actions" style="margin-top:20px">
      <a class="btn" href="/chat?lesson=${lesson.id}">💬 Practice this lesson with Emma</a>
      ${next ? `<button class="btn secondary" data-goto="${next.id}">Next lesson →</button>` : ""}
    </div>`;

  // Quiz logic
  let correct = 0;
  lessonEl.querySelectorAll(".quiz-q").forEach((box) => {
    const q = lesson.quiz[box.dataset.q];
    box.querySelectorAll(".option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const right = Number(btn.dataset.o) === q.answer;
        box.querySelectorAll(".option").forEach((b) => (b.disabled = true));
        btn.classList.add(right ? "correct" : "wrong");
        box.querySelector(`[data-o="${q.answer}"]`).classList.add("correct");
        box.querySelector(".feedback").textContent = right ? "🎉 Great job!" : `Almost! The answer is: “${q.options[q.answer]}”`;
        if (right) correct++;
        const answered = [...lessonEl.querySelectorAll(".quiz-q")].filter((b) => b.querySelector(".option:disabled")).length;
        if (answered >= lesson.quiz.length && correct >= Math.ceil(lesson.quiz.length / 2)) {
          Progress.done(lesson.id);
          renderList(lesson.id);
        }
      });
    });
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (e) => {
  const say = e.target.closest("[data-say]");
  if (say) return speak(say.dataset.say);
  const item = e.target.closest(".lesson-item, [data-goto]");
  if (item) renderLesson(item.dataset.id || item.dataset.goto);
});

renderLesson(new URLSearchParams(location.search).get("id"));
