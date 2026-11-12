// Saved settings (this browser only). Reading or writing can fail in private mode, so never rely on it.
const Settings = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

// Emma's voice: the browser's built-in text-to-speech (free). Each device has different voices,
// so we pick a female English one by name, and the student can choose another.
const Voice = (() => {
  const FEMALE = /female|samantha|victoria|karen|moira|tessa|fiona|serena|kate|susan|allison|ava|zoe|nicky|veena|heera|neerja|zira|aria|jenny|sonia|libby|natasha|clara|michelle|hazel|catherine|linda|joanna|salli|kimberly|ivy|kendra|amy|olivia|emma|google us english|google uk english female/i;
  const MALE = /\bmale\b|david|mark|george|james|daniel|alex\b|fred|ryan|guy|thomas|arthur|rishi|prabhat|ravi|aaron|oliver|brian|matthew|justin|joey|eric|christopher|liam/i;
  let voices = [];

  function load() {
    if (!window.speechSynthesis) return;
    voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  }
  const isFemale = (v) => FEMALE.test(v.name) && !MALE.test(v.name.replace(/female/i, ""));
  function rank(v) {
    const langOrder = ["en-us", "en-gb", "en-in", "en-au"].indexOf(v.lang.toLowerCase().replace("_", "-"));
    return (isFemale(v) ? 0 : MALE.test(v.name) ? 20 : 10) + (langOrder < 0 ? 5 : langOrder) + (v.localService ? 0 : 0.5);
  }
  function best() {
    const saved = Settings.get("voice", "");
    return voices.find((v) => v.name === saved) || [...voices].sort((a, b) => rank(a) - rank(b))[0] || null;
  }
  if (window.speechSynthesis) {
    load();
    speechSynthesis.addEventListener?.("voiceschanged", () => { load(); document.dispatchEvent(new Event("voices-ready")); });
  }
  return {
    // Female voices first, for the picker.
    list() { return [...voices].sort((a, b) => rank(a) - rank(b)); },
    current() { return best(); },
    choose(name) { Settings.set("voice", name); },
    isFemale,
  };
})();

// Read text aloud in English. `onend` runs when Emma finishes speaking.
function speak(text, onend) {
  if (!window.speechSynthesis) { alert("Sorry, your browser cannot read aloud."); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""));
  const v = Voice.current();
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
  u.rate = Settings.get("slow", true) ? 0.85 : 1; // a little slower for beginners
  // If this device has no female voice, a slightly higher pitch sounds softer.
  u.pitch = v && !Voice.isFemale(v) ? 1.2 : 1;
  if (onend) u.onend = u.onerror = onend;
  speechSynthesis.speak(u);
}

// ---------- Student account ----------
// Auth.ready resolves to { user, googleEnabled, dailyLimit, usedToday } (user is null when logged out).
const Auth = (() => {
  const loginHref = () => `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  const ready = fetch("/api/auth/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : { user: null }))
    .catch(() => ({ user: null }));

  async function logout() {
    // This browser's progress belongs to the student who is leaving.
    Settings.set("progress", {}); Settings.set("progress_owner", "");
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
    location.reload();
  }

  // Header: "Log in" when logged out; the student's first name and a small menu when logged in.
  function renderHeader(me) {
    const slot = document.getElementById("account");
    if (!slot) return;
    slot.innerHTML = "";
    if (!me.user) {
      const a = document.createElement("a");
      a.className = "btn login-btn"; a.href = loginHref(); a.textContent = "Log in";
      slot.append(a);
      return;
    }
    const first = me.user.name.split(" ")[0];
    const btn = document.createElement("button");
    btn.className = "account-btn"; btn.type = "button";
    btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    const initial = document.createElement("span"); initial.className = "initial"; initial.textContent = first[0].toUpperCase();
    const name = document.createElement("span"); name.className = "account-name"; name.textContent = first;
    btn.append(initial, name);
    const menu = document.createElement("div");
    menu.className = "account-menu"; menu.hidden = true;
    const who = document.createElement("p"); who.textContent = me.user.email;
    const out = document.createElement("button"); out.type = "button"; out.textContent = "Log out"; out.onclick = logout;
    menu.append(who, out);
    btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
    document.addEventListener("click", (e) => { if (!slot.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
    slot.append(btn, menu);
  }
  ready.then(renderHeader);
  return { ready, logout, loginHref };
})();

// ---------- Lesson progress ----------
// Kept in this browser; when the student is logged in it is also saved to their account,
// so it follows them to other devices. Lessons done before logging in are uploaded once.
const Progress = {
  get() { return Settings.get("progress", {}); },
  done(id, score = 100) {
    const p = Progress.get(); p[id] = true; Settings.set("progress", p);
    Auth.ready.then((me) => me.user && Progress._post({ [id]: score }));
  },
  _post(lessons) {
    return fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessons }) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  },
  // Merges this browser's progress with the account's. Resolves to true when anything changed here.
  async sync() {
    const me = await Auth.ready;
    if (!me.user) return false;
    const owner = Settings.get("progress_owner", "");
    // Lessons done here while logged out join the account; another student's never do.
    const local = owner && owner !== me.user.id ? {} : Progress.get();
    const res = await fetch("/api/progress").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!res) return false;
    const server = res.progress || {};
    const missing = Object.keys(local).filter((id) => local[id] && !server[id]);
    if (missing.length) await Progress._post(Object.fromEntries(missing.map((id) => [id, 100])));
    const merged = { ...local };
    for (const id of Object.keys(server)) merged[id] = true;
    const before = JSON.stringify(Progress.get());
    Settings.set("progress", merged);
    Settings.set("progress_owner", me.user.id);
    return JSON.stringify(merged) !== before;
  },
};
