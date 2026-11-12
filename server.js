// English tutor website: serves the pages in /public, student accounts (/api/auth/*, /auth/google)
// and the AI chat at /api/chat (students must be logged in). Run with:  node server.js
// The AI key, database URL and session secret stay on the server; students never see them.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dbLib = require("./lib/db");
const auth = require("./lib/auth");

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
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const hasKey = PROVIDER === "openai" ? !!OPENAI_KEY : !!GEMINI_KEY;
const DEMO_MODE = !hasKey;

// ---------- Accounts ----------
const ON_RENDER = !!process.env.RENDER;
const BASE_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const SECURE = BASE_URL.startsWith("https://");
const DAILY_MESSAGES = Number(process.env.DAILY_MESSAGES) || 100;   // per student per day (UTC)
const AUTH_ATTEMPTS = Number(process.env.AUTH_ATTEMPTS) || 10;      // log-in / sign-up tries per address per 10 minutes

let SESSION_SECRET = process.env.SESSION_SECRET || "";
if (SESSION_SECRET.length < 32) {
  if (ON_RENDER || process.env.NODE_ENV === "production") {
    console.error("SESSION_SECRET is missing or shorter than 32 characters. Set it in the host's environment variables.");
    process.exit(1);
  }
  SESSION_SECRET = crypto.randomBytes(32).toString("hex");   // dev only: everyone is logged out on restart
  console.log("No SESSION_SECRET: using a random one (logins end when the server restarts).");
}
const sessions = new auth.Sessions(SESSION_SECRET);

const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? new auth.Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, baseUrl: BASE_URL,
                      // tests point these at a fake Google; never set in production
                      endpoints: process.env.NODE_ENV === "test" && process.env.GOOGLE_TEST_ENDPOINTS
                        ? JSON.parse(process.env.GOOGLE_TEST_ENDPOINTS) : {} })
  : null;

let db;   // opened before the server starts listening

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
      // Newer Gemini models "think" before answering and that counts as output, so leave room for it.
      // Emma's prompt keeps the visible reply short.
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`);
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
  if (!text) console.error("Gemini gave no text. finishReason:", candidate?.finishReason || data.promptFeedback?.blockReason);
  return text || "Sorry, can you say that again?";
}

async function askOpenAI(messages, system) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_completion_tokens: 2048,
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

// ---------- Rate limits (in memory) ----------
const buckets = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 50_000) buckets.clear();   // keep memory bounded
  return list.length > max;
}
// Render sits behind a proxy, so the student's address is the first X-Forwarded-For entry there.
function clientIp(req) {
  const fwd = ON_RENDER ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
  return fwd || req.socket.remoteAddress || "?";
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

const SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY" };

function sendJson(res, status, obj, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(obj));
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...SECURITY_HEADERS, ...headers });
  res.end();
}

// JSON bodies only: a form on another website can't send JSON to us, which blocks cross-site requests.
async function readJson(req, limit = 50_000) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw httpError(415, "Send JSON.");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw httpError(413, "Message too long.");
  }
  try { return JSON.parse(body || "{}"); } catch { throw httpError(400, "Bad request."); }
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }

async function currentUser(req) {
  const id = sessions.userId(req);
  return id ? (await db.userById(id)) || null : null;
}
const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, google: !!u.google_id, password: !!u.password_hash };

// ---------- Account routes ----------
async function handleSignup(req, res) {
  if (rateLimited(`auth:${clientIp(req)}`, AUTH_ATTEMPTS, 10 * 60_000)) return sendJson(res, 429, { error: "Too many tries. Please wait a few minutes." });
  const input = auth.cleanSignup(await readJson(req, 5_000));
  if (input.error) return sendJson(res, 400, { error: input.error });
  if (await db.userByEmail(input.email)) return sendJson(res, 409, { error: "There is already an account with this email. Please log in." });
  let user;
  try {
    user = await db.createUser({ email: input.email, name: input.name, passwordHash: await auth.hashPassword(input.password) });
  } catch {   // two sign-ups with the same email at the same moment
    return sendJson(res, 409, { error: "There is already an account with this email. Please log in." });
  }
  sendJson(res, 201, { user: publicUser({ ...user, password_hash: "x" }) }, { "Set-Cookie": sessions.issue(user.id, SECURE) });
}

async function handleLogin(req, res) {
  if (rateLimited(`auth:${clientIp(req)}`, AUTH_ATTEMPTS, 10 * 60_000)) return sendJson(res, 429, { error: "Too many tries. Please wait a few minutes." });
  const { email, password } = await readJson(req, 5_000);
  const user = await db.userByEmail(String(email || "").trim().toLowerCase());
  const ok = await auth.checkPassword(String(password || ""), user?.password_hash || (await auth.DUMMY_HASH));
  if (!user || !ok) {
    const googleOnly = user && !user.password_hash;
    return sendJson(res, 401, { error: googleOnly ? "This account uses Google. Please choose “Continue with Google”." : "Wrong email or password." });
  }
  sendJson(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessions.issue(user.id, SECURE) });
}

async function handleMe(req, res) {
  const user = await currentUser(req);
  sendJson(res, 200, { user: publicUser(user), googleEnabled: !!google, dailyLimit: DAILY_MESSAGES,
                       usedToday: user ? await db.messagesToday(user.id) : 0 });
}

async function handleProgress(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "Please log in." });
  if (req.method === "POST") {
    // { lessons: { "<lessonId>": <score 0-100>, ... } }: one lesson, or all lessons saved in this browser.
    const { lessons } = await readJson(req, 10_000);
    const known = new Set(LESSONS.map((l) => l.id));
    for (const [id, score] of Object.entries(lessons || {}).slice(0, LESSONS.length)) {
      const n = Math.round(Number(score));
      if (known.has(id) && n >= 0 && n <= 100) await db.saveProgress(user.id, id, n);
    }
  }
  sendJson(res, 200, { progress: await db.progress(user.id) });
}

// ---------- Google sign-in ----------
function googleStart(req, res, url) {
  if (!google) return redirect(res, "/login?error=google-off");
  const { state, cookie } = sessions.newState(auth.safeNext(url.searchParams.get("next")), SECURE);
  redirect(res, google.loginUrl(state), { "Set-Cookie": cookie });
}

async function googleCallback(req, res, url) {
  const clear = sessions.clearState(SECURE);
  const saved = google && sessions.checkState(req, url.searchParams.get("state"));
  if (!saved || !url.searchParams.get("code")) return redirect(res, "/login?error=google", { "Set-Cookie": clear });
  try {
    const p = await google.profile(url.searchParams.get("code"));
    if (!p.email || !p.emailVerified) return redirect(res, "/login?error=google-email", { "Set-Cookie": clear });
    let user = await db.userByGoogleId(p.googleId);
    if (!user) {
      user = await db.userByEmail(p.email);
      if (user) await db.linkGoogle(user.id, p.googleId);   // same verified email: the same student
      else user = await db.createUser({ email: p.email, name: (p.name || p.email.split("@")[0]).slice(0, 60), googleId: p.googleId });
    }
    redirect(res, saved.next, { "Set-Cookie": [clear, sessions.issue(user.id, SECURE)] });
  } catch (err) {
    console.error("Google sign-in failed:", err.message);
    redirect(res, "/login?error=google", { "Set-Cookie": clear });
  }
}

// ---------- Chat ----------
async function handleChat(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "Please log in to talk to Emma.", login: true });
  if (rateLimited(`chat:${user.id}`, 20, 60_000)) return sendJson(res, 429, { error: "Too many messages. Please wait a minute." });
  if ((await db.messagesToday(user.id)) >= DAILY_MESSAGES) {
    return sendJson(res, 429, { error: `You have used today's ${DAILY_MESSAGES} messages. Come back tomorrow! Lessons are always open.` });
  }
  const payload = await readJson(req);

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
    const used = await db.countMessage(user.id);
    sendJson(res, 200, { reply, demo: DEMO_MODE, usedToday: used, dailyLimit: DAILY_MESSAGES });
  } catch (err) {
    console.error("AI error:", err.message);
    sendJson(res, 502, { error: "The tutor is busy right now. Please try again." });
  }
}

const PUBLIC = path.join(__dirname, "public");

const ROUTES = {
  "POST /api/chat": handleChat,
  "GET /api/status": (req, res) => sendJson(res, 200, { demo: DEMO_MODE, provider: PROVIDER }),
  "GET /api/auth/me": handleMe,
  "POST /api/auth/signup": handleSignup,
  "POST /api/auth/login": handleLogin,
  "POST /api/auth/logout": (req, res) => sendJson(res, 200, { ok: true }, { "Set-Cookie": sessions.clear(SECURE) }),
  "GET /api/progress": handleProgress,
  "POST /api/progress": handleProgress,
  "GET /auth/google": googleStart,
  "GET /auth/google/callback": googleCallback,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  const route = ROUTES[`${req.method} ${url.pathname}`];
  if (route) {
    try {
      return await route(req, res, url);
    } catch (err) {
      if (!err.status) console.error(`${req.method} ${url.pathname}:`, err);
      if (!res.headersSent) return sendJson(res, err.status || 500, { error: err.status ? err.message : "Something went wrong. Please try again." });
      return;
    }
  }
  if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Not found." });

  // Static files (blocks paths like ../../secret)
  let file = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
  if (!path.extname(file)) file += ".html"; // /lessons -> lessons.html
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Page not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", ...SECURITY_HEADERS });
    res.end(data);
  });
});

// One tiny request at startup, so a wrong key or model name shows up in the logs right away.
async function checkAI() {
  try {
    const messages = [{ role: "user", content: "Say hello in three words." }];
    const reply = PROVIDER === "openai" ? await askOpenAI(messages, "Be brief.") : await askGemini(messages, "Be brief.");
    console.log(`AI check: OK. Test reply: "${reply.slice(0, 80)}"`);
  } catch (err) {
    console.error(`AI check FAILED: ${err.message}`);
  }
}

async function start() {
  db = await dbLib.open({ databaseUrl: process.env.DATABASE_URL, sqliteFile: process.env.SQLITE_FILE || path.join(__dirname, "data", "dev.db") });
  console.log(`Accounts database: ${db.kind}`);
  if (db.kind === "sqlite" && ON_RENDER) {
    console.warn("WARNING: no DATABASE_URL, so accounts are kept in a temporary file and are LOST on every deploy. Add DATABASE_URL.");
  }
  console.log(google ? `Google sign-in: on (redirect URI ${google.redirectUri})` : "Google sign-in: off (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)");
  server.listen(PORT, onListening);
}

function onListening() {
  console.log(`English tutor running at http://localhost:${server.address().port}`);
  if (DEMO_MODE) {
    console.log("DEMO MODE: no API key found. Add GEMINI_API_KEY (or OPENAI_API_KEY) for real AI replies.");
  } else {
    console.log(`AI: ${PROVIDER} (${PROVIDER === "openai" ? OPENAI_MODEL : GEMINI_MODEL})`);
    if (process.env.NODE_ENV !== "test") checkAI();
  }
}

start().catch((err) => {
  console.error("Could not start:", err.message);
  process.exit(1);
});
