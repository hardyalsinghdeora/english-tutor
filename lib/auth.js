// Passwords (scrypt), session cookies (HMAC-signed, no session table) and Google sign-in.

const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const SESSION_DAYS = 30;
const COOKIE = "session";
const STATE_COOKIE = "oauth_state";

// ---------- passwords ----------
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function checkPassword(password, stored) {
  const [kind, salt, key] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

// Spent on unknown emails too, so a login attempt takes the same time whether the account exists.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex"));

// ---------- signed values ----------
function sign(secret, value) {
  const mac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${mac}`;
}
function unsign(secret, signed) {
  const i = String(signed || "").lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(signed.slice(i + 1)), b = Buffer.from(sign(secret, value).slice(i + 1));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

// ---------- cookies ----------
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, secure }) {
  return [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax",
          `Max-Age=${maxAge}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

class Sessions {
  constructor(secret) { this.secret = secret; }

  // Cookie value: "<userId>|<expires ms>" signed with the server secret.
  issue(userId, secure) {
    const expires = Date.now() + SESSION_DAYS * 86400_000;
    return cookie(COOKIE, sign(this.secret, `${userId}|${expires}`), { maxAge: SESSION_DAYS * 86400, secure });
  }
  clear(secure) { return cookie(COOKIE, "", { maxAge: 0, secure }); }

  userId(req) {
    const value = unsign(this.secret, parseCookies(req.headers.cookie)[COOKIE]);
    if (!value) return null;
    const [id, expires] = value.split("|");
    return id && Number(expires) > Date.now() ? id : null;
  }

  // Google sign-in: a random state (and where to go afterwards) kept in a short-lived signed cookie.
  newState(next, secure) {
    const state = crypto.randomBytes(18).toString("base64url");
    return { state, cookie: cookie(STATE_COOKIE, sign(this.secret, `${state}|${next}`), { maxAge: 600, secure }) };
  }
  checkState(req, state) {
    const value = unsign(this.secret, parseCookies(req.headers.cookie)[STATE_COOKIE]);
    if (!value) return null;
    const i = value.indexOf("|");
    if (i < 1) return null;
    const saved = value.slice(0, i), next = value.slice(i + 1);
    const a = Buffer.from(saved), b = Buffer.from(String(state || ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? { next } : null;
  }
  clearState(secure) { return cookie(STATE_COOKIE, "", { maxAge: 0, secure }); }
}

// ---------- Google (OpenID Connect, authorization code flow) ----------
class Google {
  constructor({ clientId, clientSecret, baseUrl, endpoints = {} }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = `${baseUrl}/auth/google/callback`;
    this.authUrl = endpoints.auth || "https://accounts.google.com/o/oauth2/v2/auth";
    this.tokenUrl = endpoints.token || "https://oauth2.googleapis.com/token";
    this.userinfoUrl = endpoints.userinfo || "https://openidconnect.googleapis.com/v1/userinfo";
  }

  loginUrl(state) {
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, response_type: "code",
                                    scope: "openid email profile", state, prompt: "select_account" });
    return `${this.authUrl}?${q}`;
  }

  // Exchanges the code for tokens, then reads the verified profile.
  async profile(code) {
    const tokenRes = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: this.clientId, client_secret: this.clientSecret,
                                  redirect_uri: this.redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) throw new Error(tokens.error_description || tokens.error || "token exchange failed");
    const infoRes = await fetch(this.userinfoUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const info = await infoRes.json();
    if (!infoRes.ok || !info.sub) throw new Error("could not read the Google profile");
    return { googleId: String(info.sub), email: String(info.email || "").toLowerCase(),
             emailVerified: info.email_verified === true || info.email_verified === "true", name: info.name || info.given_name || "" };
  }
}

// ---------- input checks ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function cleanSignup({ name, email, password }) {
  name = String(name || "").trim().replace(/\s+/g, " ");
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");
  if (!name || name.length > 60) return { error: "Please enter your name (up to 60 letters)." };
  if (!EMAIL.test(email) || email.length > 200) return { error: "Please enter a valid email address." };
  if (password.length < 8) return { error: "Your password needs at least 8 characters." };
  if (password.length > 200) return { error: "That password is too long." };
  return { name, email, password };
}

// Only local paths, so a login link can't send students to another website.
function safeNext(next) {
  next = String(next || "");
  return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(next) ? next : "/";
}

module.exports = { hashPassword, checkPassword, DUMMY_HASH, Sessions, Google, cleanSignup, safeNext, parseCookies };
