// End-to-end tests: start the real server (demo AI) against a temporary SQLite file, and against
// Postgres too when TEST_DATABASE_URL is set. Google sign-in is tested against a fake Google.
//   npm test
//   TEST_DATABASE_URL=postgres://user@localhost/test npm test

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

// ---------- fake Google: codes map to profiles ----------
const PROFILES = {
  "code-new": { sub: "g-1", email: "maria@example.com", email_verified: true, name: "Maria Lopez" },
  "code-link": { sub: "g-2", email: "ravi@example.com", email_verified: true, name: "Ravi" },
  "code-unverified": { sub: "g-3", email: "x@example.com", email_verified: false, name: "X" },
};
function fakeGoogle() {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      if (req.url === "/token") {
        const code = new URLSearchParams(body).get("code");
        if (!PROFILES[code]) { res.writeHead(400); return res.end(JSON.stringify({ error: "invalid_grant" })); }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ access_token: `at-${code}`, id_token: "x" }));
      }
      if (req.url === "/userinfo") {
        const code = String(req.headers.authorization || "").replace("Bearer at-", "");
        res.writeHead(PROFILES[code] ? 200 : 401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(PROFILES[code] || {}));
      }
      res.writeHead(404); res.end();
    });
    srv.listen(0, () => resolve(srv));
  });
}

// ---------- the server under test ----------
function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { PATH: process.env.PATH, ...env } });
    let out = "";
    const onData = (d) => {
      out += d;
      const m = out.match(/running at http:\/\/localhost:(\d+)/);
      if (m) resolve({ child, base: `http://localhost:${m[1]}`, log: () => out });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (d) => { out += d; });
    child.on("exit", (code) => reject(new Error(`server exited (${code}):\n${out}`)));
  });
}

// A tiny browser: keeps cookies, never follows redirects.
function client(base) {
  const jar = {};
  async function req(method, url, body, headers = {}) {
    const h = { ...headers };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) h.Cookie = cookie;
    if (body !== undefined && !h["Content-Type"]) h["Content-Type"] = "application/json";
    const res = await fetch(base + url, { method, headers: h, redirect: "manual",
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (/Max-Age=0/.test(c)) delete jar[name]; else jar[name] = value;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers, cookies: res.headers.getSetCookie() };
  }
  return { req, jar, get: (u, h) => req("GET", u, undefined, h), post: (u, b, h) => req("POST", u, b, h) };
}

const backends = [{ name: "sqlite" }];
if (process.env.TEST_DATABASE_URL) backends.push({ name: "postgres", url: process.env.TEST_DATABASE_URL });

for (const backend of backends) {
  describe(`accounts (${backend.name})`, () => {
    let server, google, tmp, base;
    const email = `ana.${Date.now()}@example.com`;

    before(async () => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-"));
      google = await fakeGoogle();
      const g = `http://localhost:${google.address().port}`;
      if (backend.url) {   // fresh tables for each run
        const { Client } = require("pg");
        const c = new Client({ connectionString: backend.url });
        await c.connect();
        await c.query("DROP TABLE IF EXISTS chat_usage, progress, users");
        await c.end();
      }
      server = await startServer({
        PORT: "0", NODE_ENV: "test", SESSION_SECRET: "test-secret-that-is-long-enough-1234567890",
        SQLITE_FILE: path.join(tmp, "test.db"), DATABASE_URL: backend.url || "", DAILY_MESSAGES: "3", AUTH_ATTEMPTS: "40",
        GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret",
        GOOGLE_TEST_ENDPOINTS: JSON.stringify({ auth: `${g}/auth`, token: `${g}/token`, userinfo: `${g}/userinfo` }),
      });
      base = server.base;
    });
    after(() => { server?.child.kill(); google?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

    test("starts on the right database with Google on", () => {
      assert.match(server.log(), new RegExp(`Accounts database: ${backend.name}`));
      assert.match(server.log(), /Google sign-in: on/);
    });

    test("sign up checks input, logs in, and refuses a second account for the same email", async () => {
      const c = client(base);
      assert.equal((await c.post("/api/auth/signup", { name: "", email, password: "longenough" })).status, 400);
      assert.equal((await c.post("/api/auth/signup", { name: "Ana", email: "not-an-email", password: "longenough" })).status, 400);
      const short = await c.post("/api/auth/signup", { name: "Ana", email, password: "short" });
      assert.equal(short.status, 400);
      assert.match(short.json.error, /8 characters/);

      const ok = await c.post("/api/auth/signup", { name: "  Ana   Silva ", email: email.toUpperCase(), password: "longenough" });
      assert.equal(ok.status, 201);
      assert.deepEqual({ name: ok.json.user.name, email: ok.json.user.email }, { name: "Ana Silva", email });
      const setCookie = ok.cookies.find((x) => x.startsWith("session="));
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /SameSite=Lax/);
      assert.doesNotMatch(JSON.stringify(ok.json), /password_hash|scrypt/);

      const me = await c.get("/api/auth/me");
      assert.equal(me.json.user.email, email);
      assert.equal(me.json.googleEnabled, true);

      const again = await client(base).post("/api/auth/signup", { name: "Other", email, password: "longenough" });
      assert.equal(again.status, 409);
    });

    test("log in, wrong password, log out, forged cookie", async () => {
      const c = client(base);
      assert.equal((await c.post("/api/auth/login", { email, password: "wrong-password" })).status, 401);
      assert.equal((await c.post("/api/auth/login", { email: "nobody@example.com", password: "whatever1" })).status, 401);
      const ok = await c.post("/api/auth/login", { email: ` ${email.toUpperCase()} `, password: "longenough" });
      assert.equal(ok.status, 200);
      assert.equal((await c.get("/api/auth/me")).json.user.email, email);

      const forged = client(base);
      const [id] = decodeURIComponent(c.jar.session).split("|");
      forged.jar.session = encodeURIComponent(`${id}|${Date.now() + 1e9}.AAAA`);
      assert.equal((await forged.get("/api/auth/me")).json.user, null);

      await c.post("/api/auth/logout", {});
      assert.equal((await c.get("/api/auth/me")).json.user, null);
    });

    test("chat needs a login and has a daily limit", async () => {
      const anon = client(base);
      const msg = { messages: [{ role: "user", content: "hello" }] };
      const r = await anon.post("/api/chat", msg);
      assert.equal(r.status, 401);
      assert.equal(r.json.login, true);

      const c = client(base);
      await c.post("/api/auth/signup", { name: "Chatty", email: `chat.${email}`, password: "longenough" });
      for (let i = 1; i <= 3; i++) {
        const ok = await c.post("/api/chat", msg);
        assert.equal(ok.status, 200);
        assert.equal(ok.json.usedToday, i);
      }
      const limited = await c.post("/api/chat", msg);
      assert.equal(limited.status, 429);
      assert.match(limited.json.error, /today's 3 messages/);
      assert.equal((await c.get("/api/auth/me")).json.usedToday, 3);
    });

    test("progress is saved per student, keeps the best score and ignores unknown lessons", async () => {
      const c = client(base);
      assert.equal((await c.get("/api/progress")).status, 401);
      await c.post("/api/auth/signup", { name: "Pat", email: `pat.${email}`, password: "longenough" });
      let p = await c.post("/api/progress", { lessons: { greetings: 67, "no-such-lesson": 50, numbers: 150, family: -1 } });
      assert.deepEqual(Object.keys(p.json.progress), ["greetings"]);
      await c.post("/api/progress", { lessons: { greetings: 33 } });
      p = await c.get("/api/progress");
      assert.equal(p.json.progress.greetings.score, 67);
      await c.post("/api/progress", { lessons: { greetings: 100, numbers: 100 } });
      p = await c.get("/api/progress");
      assert.equal(p.json.progress.greetings.score, 100);
      assert.equal(p.json.progress.numbers.score, 100);

      const other = client(base);
      await other.post("/api/auth/signup", { name: "Sam", email: `sam.${email}`, password: "longenough" });
      assert.deepEqual((await other.get("/api/progress")).json.progress, {});
    });

    test("Google: new student, linking to an existing email, bad state, unverified email, no open redirect", async () => {
      const c = client(base);
      const start = await c.get("/auth/google?next=/chat?lesson=to-be");
      assert.equal(start.status, 302);
      const loc = new URL(start.headers.get("location"));
      assert.equal(loc.searchParams.get("client_id"), "cid");
      assert.match(loc.searchParams.get("redirect_uri"), /\/auth\/google\/callback$/);
      const state = loc.searchParams.get("state");

      const bad = await c.get(`/auth/google/callback?state=wrong&code=code-new`);
      assert.equal(bad.headers.get("location"), "/login?error=google");

      const again = await c.get("/auth/google?next=/chat?lesson=to-be");
      const state2 = new URL(again.headers.get("location")).searchParams.get("state");
      assert.notEqual(state2, state);
      const done = await c.get(`/auth/google/callback?state=${state2}&code=code-new`);
      assert.equal(done.headers.get("location"), "/chat?lesson=to-be");
      const me = (await c.get("/api/auth/me")).json.user;
      assert.deepEqual({ email: me.email, name: me.name, google: me.google, password: me.password },
                       { email: "maria@example.com", name: "Maria Lopez", google: true, password: false });
      // a Google-only account can't log in with a password
      const pw = await client(base).post("/api/auth/login", { email: "maria@example.com", password: "anything1" });
      assert.match(pw.json.error, /uses Google/);

      // same verified email as a password account: Google is linked to it
      const ravi = client(base);
      const created = await ravi.post("/api/auth/signup", { name: "Ravi K", email: "ravi@example.com", password: "longenough" });
      const g = client(base);
      const s = new URL((await g.get("/auth/google")).headers.get("location")).searchParams.get("state");
      await g.get(`/auth/google/callback?state=${s}&code=code-link`);
      const linked = (await g.get("/api/auth/me")).json.user;
      assert.equal(linked.id, created.json.user.id);
      assert.deepEqual({ google: linked.google, password: linked.password }, { google: true, password: true });

      const u = client(base);
      const s3 = new URL((await u.get("/auth/google")).headers.get("location")).searchParams.get("state");
      assert.equal((await u.get(`/auth/google/callback?state=${s3}&code=code-unverified`)).headers.get("location"), "/login?error=google-email");

      const evil = client(base);
      const s4 = new URL((await evil.get("/auth/google?next=//evil.example/x")).headers.get("location")).searchParams.get("state");
      assert.equal((await evil.get(`/auth/google/callback?state=${s4}&code=code-new`)).headers.get("location"), "/");
    });

    test("only JSON is accepted, and server files stay private", async () => {
      const c = client(base);
      const form = await c.post("/api/auth/login", "email=a&password=b", { "Content-Type": "application/x-www-form-urlencoded" });
      assert.equal(form.status, 415);
      assert.equal((await c.get("/lib/db.js")).status, 404);
      assert.equal((await c.get("/server.js")).status, 404);
      assert.notEqual((await c.get("/..%2fserver.js")).status, 200);
      const page = await c.get("/login");
      assert.equal(page.status, 200);
      assert.equal(page.headers.get("x-frame-options"), "DENY");
    });

    test("too many login attempts are slowed down", async () => {
      const c = client(base);
      let last;
      for (let i = 0; i < 45; i++) last = await c.post("/api/auth/login", { email, password: "wrong-password" });
      assert.equal(last.status, 429);
    });
  });
}

test("refuses to start on a host without a session secret", async () => {
  await assert.rejects(startServer({ PORT: "0", RENDER: "true", SQLITE_FILE: path.join(os.tmpdir(), "x.db") }), /SESSION_SECRET/);
});
