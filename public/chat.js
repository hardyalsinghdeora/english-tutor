const messagesEl = document.getElementById("messages");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const chipsEl = document.getElementById("chips");
const noticeEl = document.getElementById("notice");

const lessonId = new URLSearchParams(location.search).get("lesson");
const lesson = LESSONS.find((l) => l.id === lessonId);
const chatHistory = []; // { role: "user" | "assistant", content }

if (lesson) {
  const ctx = document.getElementById("context");
  ctx.textContent = "Lesson: " + lesson.title;
  ctx.hidden = false;
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "student" : "tutor");
  div.textContent = text;
  if (role !== "user") {
    const b = document.createElement("button");
    b.className = "speak-btn";
    b.textContent = "🔊";
    b.setAttribute("aria-label", "Listen");
    b.onclick = () => speak(text);
    div.appendChild(b);
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function setChips(list) {
  chipsEl.innerHTML = "";
  list.forEach((t) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.type = "button";
    c.textContent = t;
    c.onclick = () => send(t);
    chipsEl.appendChild(c);
  });
}

async function send(text) {
  text = text.trim();
  if (!text) return;
  input.value = "";
  document.getElementById("confirm").hidden = true;
  chipsEl.innerHTML = "";
  addMessage("user", text);
  chatHistory.push({ role: "user", content: text });
  sendBtn.disabled = true;
  const typing = addMessage("assistant", "Emma is typing…");
  typing.classList.add("typing");
  typing.querySelector("button")?.remove();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory, lessonId }),
    });
    const data = await res.json().catch(() => ({}));
    typing.remove();
    if (res.status === 401) { showLoginGate(); throw new Error(data.error || "Please log in to talk to Emma."); }
    if (!res.ok) throw new Error(data.error || "Oops, something went wrong. Please try again.");
    showUsage(data.usedToday, data.dailyLimit);
    chatHistory.push({ role: "assistant", content: data.reply });
    addMessage("assistant", data.reply);
    if (Settings.get("read", false)) speak(data.reply);
  } catch (err) {
    typing.remove();
    chatHistory.pop(); // let the student try again
    addMessage("assistant", err.message || "Oops, something went wrong. Please try again.");
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

// ---------- Account: chatting needs a login (lessons don't)
function showLoginGate() {
  const next = encodeURIComponent(location.pathname + location.search);
  document.getElementById("gate-login").href = `/login?next=${next}`;
  document.getElementById("gate-signup").href = `/login?mode=signup&next=${next}`;
  document.getElementById("login-gate").hidden = false;
  form.hidden = true;
  chipsEl.hidden = true;
}
function showUsage(used, limit) {
  const el = document.getElementById("usage");
  const left = limit - used;
  el.hidden = !(limit && left <= 10);
  el.textContent = left > 0 ? `${left} message${left === 1 ? "" : "s"} left today` : "No messages left today. See you tomorrow!";
}
Auth.ready.then((me) => {
  if (!me.user) showLoginGate();
  else showUsage(me.usedToday, me.dailyLimit);
});

// ---------- Settings: Emma's voice, speed, reading aloud, auto-send
const settingsBtn = document.getElementById("settings-btn");
const settingsEl = document.getElementById("settings");
const voiceSelect = document.getElementById("voice-select");
const voiceHint = document.getElementById("voice-hint");

settingsBtn.onclick = () => {
  settingsEl.hidden = !settingsEl.hidden;
  settingsBtn.setAttribute("aria-expanded", String(!settingsEl.hidden));
};
for (const [id, key, fallback] of [["opt-slow", "slow", true], ["opt-read", "read", false], ["opt-autosend", "autosend", false]]) {
  const box = document.getElementById(id);
  box.checked = Settings.get(key, fallback);
  box.onchange = () => Settings.set(key, box.checked);
}

function fillVoices() {
  const list = Voice.list();
  const current = Voice.current();
  voiceSelect.innerHTML = "";
  for (const v of list) {
    const label = `${v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s+Online.*$/, "")} (${v.lang})${Voice.isFemale(v) ? " ♀" : ""}`;
    voiceSelect.add(new Option(label, v.name, false, current && v.name === current.name));
  }
  voiceSelect.disabled = !list.length;
  voiceHint.textContent = !list.length ? "This browser has no English voices to choose from."
    : list.some(Voice.isFemale) ? "♀ marks female voices. Your choice is saved in this browser."
    : "No female voice on this device, so Emma's voice is made a little higher. Try Chrome or Edge for more voices.";
}
voiceSelect.onchange = () => { Voice.choose(voiceSelect.value); speak("Hello! I am Emma, your English teacher."); };
document.getElementById("voice-test").onclick = () => speak("Hello! I am Emma, your English teacher.");
fillVoices();
document.addEventListener("voices-ready", fillVoices);

// ---------- Speaking practice: speech to text (Chrome, Edge, Safari)
// Tap 🎤 → speak (words appear as you talk) → tap Stop → "Send this message?" → Send / Say it again / Edit.
const listeningEl = document.getElementById("listening");
const confirmEl = document.getElementById("confirm");
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (Recognition) {
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.continuous = true;      // keep listening through short pauses
  rec.interimResults = true;  // show the words while the student speaks
  let listening = false;
  let finalText = "";

  const showConfirm = (show) => { confirmEl.hidden = !show; if (show) document.getElementById("confirm-send").focus(); };

  function start() {
    speechSynthesis.cancel();
    finalText = "";
    input.value = "";
    showConfirm(false);
    try { rec.start(); } catch { return; }
    listening = true;
    micBtn.classList.add("listening");
    micBtn.textContent = "⏹";
    micBtn.setAttribute("aria-label", "Stop listening");
    micBtn.title = "Stop";
    listeningEl.hidden = false;
  }
  function stop() { if (listening) rec.stop(); }

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += (finalText ? " " : "") + t.trim();
      else interim += t;
    }
    input.value = (finalText + " " + interim).trim();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      noticeEl.textContent = "The microphone is blocked. Allow it in the address bar, or type your message.";
      noticeEl.hidden = false;
    }
  };
  rec.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
    micBtn.setAttribute("aria-label", "Speak");
    micBtn.title = "Speak in English";
    listeningEl.hidden = true;
    const text = input.value.trim();
    if (!text) return;
    if (Settings.get("autosend", false)) send(text);
    else showConfirm(true);
  };

  micBtn.onclick = () => (listening ? stop() : start());
  document.getElementById("confirm-send").onclick = () => { showConfirm(false); send(input.value); };
  document.getElementById("confirm-again").onclick = () => start();
  document.getElementById("confirm-edit").onclick = () => { showConfirm(false); input.focus(); };
  input.addEventListener("input", () => showConfirm(false));
} else {
  micBtn.hidden = true;
  document.getElementById("opt-autosend").closest("label").hidden = true;
}

// Start
fetch("/api/status").then((r) => r.json()).then((s) => {
  if (s.demo) {
    noticeEl.textContent = "Demo mode: Emma gives simple fixed answers. Add an AI key (GEMINI_API_KEY) on the server for the real AI tutor.";
    noticeEl.hidden = false;
  }
}).catch(() => {});

const greeting = lesson
  ? `Hi! 😊 Let's practice "${lesson.title}". Are you ready?`
  : "Hello! I am Emma, your English teacher. 😊 What is your name?";
addMessage("assistant", greeting);
chatHistory.push({ role: "assistant", content: greeting });
setChips(lesson
  ? ["Yes, I am ready!", "Can you explain it again?", "Give me a small test"]
  : ["Hello! My name is…", "Help me with grammar", "Let's practice talking"]);
input.focus();
