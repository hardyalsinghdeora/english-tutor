// English tutor website: serves the pages in /public and the AI chat at /api/chat.
// No packages needed. Run with:  node server.js
// The API key stays on the server, so students never see it.

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---------- Load .env (simple KEY=VALUE parser) ----------
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = Number(process.env.PORT) || 3000;
const PROVIDER = (process.env.PROVIDER || "gemini").toLowerCase();
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const hasKey = PROVIDER === "openai" ? !!OPENAI_KEY : !!GEMINI_KEY;
const DEMO_MODE = !hasKey;

// ---------- The tutor's personality ----------
const LESSONS = require("./public/lessons-data.js");

function systemPrompt(lessonId) {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  const lessonPart = lesson
    ? `\nThe student is studying the lesson "${lesson.title}": ${lesson.summary} ` +
      `Key words: ${lesson.vocab.map((v) => v.word).join(", ")}. Focus on this lesson when it fits.`
    : "";
  return `You are Emma, a warm and patient English teacher for complete beginners (CEFR level A1-A2).
Rules:
- Use short, simple sentences and common words. Max 4-5 short sentences per reply.
- If the student makes a mistake, gently show the correct version first, like: "Good try! We say: 'I am happy.'" Then continue the conversation.
- Explain grammar with one tiny example, never long theory.
- End most replies with one easy question so the student keeps practicing.
- If the student writes in another language, reply in simple English and you may add a short translation in brackets.
- Praise effort often. Be kind, never sarcastic.
- Only talk about learning English and everyday topics. Politely refuse anything unsafe or unrelated.
- Never ask for personal information like address, phone number, or school name.${lessonPart}`;
}

// ---------- AI providers ----------
async function askGemini(messages, system) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      // Gemini wants the conversation to start with the student, so skip Emma's greeting.
      contents: messages.slice(messages.findIndex((m) => m.role === "user")).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "Sorry, can you say that again?";
}

async function askOpenAI(messages, system) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: 400,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`);
  return data.choices?.[0]?.message?.content || "Sorry, can you say that again?";
}

// Demo replies so the site works before you add an API key.
function demoReply(text) {
  const t = text.toLowerCase();
  if (/\b(hi|hello|hey)\b/.test(t)) return "Hello! I am Emma, your English teacher. 😊 What is your name?";
  if (/my name is/.test(t)) return "Nice to meet you! Where are you from?";
  if (/\bi is\b/.test(t)) return "Good try! We say: \"I am\", not \"I is\". Can you make a sentence with \"I am\"?";
  return "(Demo mode: add an API key in the .env file to talk to the real AI tutor.) Good job writing in English! Tell me one thing you like.";
}

// ---------- Tiny rate limit: 20 messages per minute per IP ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 20;
}

// ---------- HTTP server ----------
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function handleChat(req, res) {
  if (rateLimited(req.socket.remoteAddress)) return sendJson(res, 429, { error: "Too many messages. Please wait a minute." });

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 50_000) return sendJson(res, 413, { error: "Message too long." });
  }

  let payload;
  try { payload = JSON.parse(body); } catch { return sendJson(res, 400, { error: "Bad request." }); }

  // Keep only the last 20 valid messages, each max 1000 characters.
  const messages = (Array.isArray(payload.messages) ? payload.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return sendJson(res, 400, { error: "No message." });

  try {
    const last = messages[messages.length - 1].content;
    const system = systemPrompt(payload.lessonId);
    const reply = DEMO_MODE ? demoReply(last) : PROVIDER === "openai" ? await askOpenAI(messages, system) : await askGemini(messages, system);
    sendJson(res, 200, { reply, demo: DEMO_MODE });
  } catch (err) {
    console.error("AI error:", err.message);
    sendJson(res, 502, { error: "The tutor is busy right now. Please try again." });
  }
}

const PUBLIC = path.join(__dirname, "public");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/chat" && req.method === "POST") return handleChat(req, res);
  if (url.pathname === "/api/status") return sendJson(res, 200, { demo: DEMO_MODE, provider: PROVIDER });

  // Static files (blocks paths like ../../secret)
  let file = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end("Forbidden"); }
  if (!path.extname(file)) file += ".html"; // /lessons -> lessons.html
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Page not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`English tutor running at http://localhost:${PORT}`);
  console.log(DEMO_MODE ? "DEMO MODE: no API key found. Add one to .env for real AI replies." : `AI: ${PROVIDER} (${PROVIDER === "openai" ? OPENAI_MODEL : GEMINI_MODEL})`);
});
