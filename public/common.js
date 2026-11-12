// Read text aloud in English (built into the browser, free).
function speak(text) {
  if (!("speechSynthesis" in window)) return alert("Sorry, your browser cannot read aloud.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}]/gu, ""));
  u.lang = "en-US";
  u.rate = 0.85; // a little slower for beginners
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// Lesson progress, saved in this browser only.
const Progress = {
  get() { try { return JSON.parse(localStorage.getItem("progress") || "{}"); } catch { return {}; } },
  done(id) { try { const p = Progress.get(); p[id] = true; localStorage.setItem("progress", JSON.stringify(p)); } catch {} },
};
