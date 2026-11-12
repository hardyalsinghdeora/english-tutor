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
    const data = await res.json();
    typing.remove();
    if (!res.ok) throw new Error(data.error);
    chatHistory.push({ role: "assistant", content: data.reply });
    addMessage("assistant", data.reply);
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

// Speaking practice: speech to text (Chrome, Edge, Safari)
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.onresult = (e) => { input.value = e.results[0][0].transcript; send(input.value); };
  rec.onend = () => micBtn.classList.remove("listening");
  micBtn.onclick = () => { micBtn.classList.add("listening"); rec.start(); };
} else {
  micBtn.hidden = true;
}

// Start
fetch("/api/status").then((r) => r.json()).then((s) => {
  if (s.demo) {
    noticeEl.textContent = "Demo mode: Emma gives simple fixed answers. Add an API key to the .env file for the real AI tutor.";
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
