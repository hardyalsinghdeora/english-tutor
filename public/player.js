// Narrated lesson "video": slides that Emma reads aloud with the browser's voice (free, no video files).
// Slides: intro → each new word (listen, then your turn) → example sentences (listen and repeat) → recap.
// Pause stops the speech; play starts the current slide again from its beginning.

const LessonPlayer = (() => {
  const REPEAT_PAUSE = 2600;   // ms of quiet after "your turn" so the student can say it
  const canSpeak = !!window.speechSynthesis;

  // What Emma says out loud: no slashes, arrows or blanks read as symbols.
  const spoken = (t) => t.replace(/\s*\/\s*/g, ", ").replace(/\s*→\s*/g, ", ").replace(/_{2,}/g, "blank")
    .replace(/…/g, "").replace(/\s+/g, " ").trim();

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Each step: { slide, say, caption, pause } — one slide can have several steps.
  function buildSlides(lesson, number) {
    const slides = [];
    slides.push({ kind: "intro", tag: `Lesson ${number} · ${lesson.level}`, title: lesson.title, sub: lesson.summary,
      steps: [{ say: `Hi! I'm Emma. Welcome to lesson ${number}: ${lesson.title}.` },
              { say: `In this lesson: ${lesson.summary}` }] });
    lesson.vocab.forEach((v, i) => slides.push({ kind: "word", tag: `New word ${i + 1} of ${lesson.vocab.length}`,
      title: v.word, sub: v.meaning,
      steps: [{ say: spoken(v.word), caption: v.word }, { say: `This means: ${spoken(v.meaning)}.`, caption: v.meaning },
              { say: `Your turn. Say: ${spoken(v.word)}`, caption: `say “${v.word}”`, yourTurn: true, pause: REPEAT_PAUSE }] }));
    (lesson.examples || []).forEach((s, i) => slides.push({ kind: "example", tag: `Example ${i + 1} of ${lesson.examples.length}`,
      title: s, sub: "Listen, then say it with Emma.",
      steps: [{ say: s }, { say: `Again: ${s}`, caption: s }, { say: "Now you.", caption: `say “${s}”`, yourTurn: true, pause: REPEAT_PAUSE + 600 }] }));
    slides.push({ kind: "recap", tag: "Review", title: "Great work! 🎉", list: lesson.vocab.map((v) => v.word),
      steps: [{ say: `Great work! Let's review the new words: ${lesson.vocab.map((v) => spoken(v.word)).join(". ")}.` },
              { say: "Now try the quick quiz below, and practise with me in the chat. See you soon!" }] });
    return slides;
  }

  function mount(box, lesson, number, onQuiz) {
    const slides = buildSlides(lesson, number);
    let index = 0, playing = false, run = 0, timer = null;

    box.innerHTML = "";
    box.classList.add("player");
    const stage = el("div", "stage");
    const avatar = el("div", "p-avatar");
    avatar.innerHTML = '<img src="/avatar.svg" alt="">';
    const content = el("div", "p-content");
    const caption = el("div", "p-caption");
    caption.setAttribute("aria-live", "polite");
    stage.append(avatar, content);

    const bar = el("div", "p-controls");
    const playBtn = el("button", "p-btn p-play");
    const prevBtn = el("button", "p-btn", "⏮");
    const nextBtn = el("button", "p-btn", "⏭");
    const replayBtn = el("button", "p-btn", "↻");
    prevBtn.setAttribute("aria-label", "Previous slide");
    nextBtn.setAttribute("aria-label", "Next slide");
    replayBtn.setAttribute("aria-label", "Repeat this slide");
    replayBtn.title = "Repeat this slide";
    const track = el("div", "p-track");
    slides.forEach((_, i) => {
      const seg = el("button", "p-seg");
      seg.setAttribute("aria-label", `Go to slide ${i + 1}`);
      seg.onclick = () => go(i, true);
      track.append(seg);
    });
    const count = el("span", "p-count");
    bar.append(playBtn, prevBtn, nextBtn, replayBtn, track, count);

    const start = el("button", "p-start");
    start.innerHTML = '<span class="p-start-icon">▶</span><span>Play lesson</span>';
    start.setAttribute("aria-label", `Play lesson ${number}: ${lesson.title}`);

    box.append(stage, caption, bar, start);

    function render() {
      const s = slides[index];
      content.innerHTML = "";
      content.className = `p-content p-${s.kind}`;
      content.append(el("span", "p-tag", s.tag), el("div", "p-title", s.title));
      if (s.sub) content.append(el("div", "p-sub", s.sub));
      if (s.list) {
        const ul = el("ul", "p-list");
        s.list.forEach((w) => ul.append(el("li", "", w)));
        content.append(ul);
      }
      if (s.kind === "recap") {
        const go = el("button", "p-quiz", "Go to the quiz ↓");
        go.onclick = () => { pause(); onQuiz && onQuiz(); };
        content.append(go);
      }
      [...track.children].forEach((seg, i) => seg.classList.toggle("done", i <= index));
      count.textContent = `${index + 1} / ${slides.length}`;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === slides.length - 1;
    }

    function setPlaying(on) {
      playing = on;
      playBtn.textContent = on ? "⏸" : "▶";
      playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
      box.classList.toggle("is-playing", on);
      if (!on) { avatar.classList.remove("talking"); box.classList.remove("your-turn"); }
    }

    function stopSound() {
      run++;
      clearTimeout(timer);
      if (canSpeak) speechSynthesis.cancel();
      avatar.classList.remove("talking");
      box.classList.remove("your-turn");
    }

    // Plays the steps of the current slide, then moves on.
    function playSlide() {
      stopSound();
      const my = run, steps = slides[index].steps;
      let k = 0;
      const nextStep = () => {
        if (my !== run || !playing) return;
        if (k >= steps.length) {
          if (index < slides.length - 1) { timer = setTimeout(() => { if (my === run) { index++; render(); playSlide(); } }, 500); }
          else { setPlaying(false); caption.textContent = "Finished! Try the quiz below."; }
          return;
        }
        const step = steps[k++];
        caption.textContent = step.caption || step.say;
        box.classList.toggle("your-turn", !!step.yourTurn);
        const after = () => {
          if (my !== run) return;
          avatar.classList.remove("talking");
          timer = setTimeout(() => { box.classList.remove("your-turn"); nextStep(); }, step.pause || 350);
        };
        if (canSpeak) {
          avatar.classList.add("talking");
          speak(step.say, after);
        } else {   // no voice in this browser: give time to read the caption instead
          timer = setTimeout(after, Math.max(1500, step.say.split(" ").length * 380));
        }
      };
      nextStep();
    }

    function play() { start.hidden = true; setPlaying(true); playSlide(); }
    function pause() { setPlaying(false); stopSound(); caption.textContent = "Paused. Press ▶ to continue."; }
    function go(i, keepPlaying) {
      index = Math.max(0, Math.min(slides.length - 1, i));
      render();
      start.hidden = true;
      if (keepPlaying && playing) playSlide();
      else { stopSound(); caption.textContent = slides[index].steps[0].caption || slides[index].steps[0].say; }
    }

    playBtn.onclick = () => (playing ? pause() : play());
    start.onclick = play;
    prevBtn.onclick = () => go(index - 1, true);
    nextBtn.onclick = () => go(index + 1, true);
    replayBtn.onclick = () => { start.hidden = true; if (!playing) setPlaying(true); playSlide(); };
    box.tabIndex = 0;
    box.onkeydown = (e) => {
      if (e.target.closest("button") && e.key === " ") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); playing ? pause() : play(); }
      if (e.key === "ArrowRight") go(index + 1, true);
      if (e.key === "ArrowLeft") go(index - 1, true);
    };

    setPlaying(false);
    render();
    caption.textContent = canSpeak ? "Press ▶ to start. Emma will read the lesson to you." : "Your browser can't read aloud: read the captions and use ⏭ to move on.";
    return { destroy() { playing = false; stopSound(); }, pause() { if (playing) pause(); } };
  }

  return { mount, buildSlides };
})();
