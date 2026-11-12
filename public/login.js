const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Only paths on this site, never another website.
const next = /^\/(?![/\\])/.test(params.get("next") || "") ? params.get("next") : "/";
let mode = params.get("mode") === "signup" ? "signup" : "login";

const GOOGLE_ERRORS = {
  google: "Google sign-in didn't work. Please try again, or use your email and password.",
  "google-email": "Your Google email isn't verified, so we can't use it. Please use email and password.",
  "google-off": "Google sign-in isn't available yet. Please use your email and password.",
};

function showError(text) { $("error").textContent = text || ""; $("error").hidden = !text; }

function setMode(m) {
  mode = m;
  const signup = m === "signup";
  $("tab-login").setAttribute("aria-selected", String(!signup));
  $("tab-signup").setAttribute("aria-selected", String(signup));
  $("auth-title").textContent = signup ? "Create your free account" : "Welcome back!";
  $("auth-sub").textContent = signup ? "Save your progress and practise with Emma every day." : "Log in to talk to Emma and save your progress.";
  $("name-field").hidden = !signup;
  $("pw-hint").hidden = !signup;
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("submit").textContent = signup ? "Create account" : "Log in";
  showError("");
  (signup ? $("name") : $("email")).focus();
}

$("tab-login").onclick = () => setMode("login");
$("tab-signup").onclick = () => setMode("signup");
$("show-pw").onclick = () => {
  const show = $("password").type === "password";
  $("password").type = show ? "text" : "password";
  $("show-pw").textContent = show ? "Hide" : "Show";
  $("show-pw").setAttribute("aria-label", show ? "Hide password" : "Show password");
};

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { email: $("email").value.trim(), password: $("password").value };
  if (mode === "signup") body.name = $("name").value.trim();
  if (mode === "signup" && !body.name) return showError("Please enter your name.");
  if (!body.email) return showError("Please enter your email.");
  if (body.password.length < 8 && mode === "signup") return showError("Your password needs at least 8 characters.");
  $("submit").disabled = true;
  showError("");
  try {
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || "Something went wrong. Please try again.");
      if (res.status === 409) setTimeout(() => { setMode("login"); showError(data.error); }, 0);
      return;
    }
    location.href = next;
  } catch {
    showError("No connection. Please check your internet and try again.");
  } finally {
    $("submit").disabled = false;
  }
});

Auth.ready.then((me) => {
  if (me.user) {   // already logged in
    $("auth-forms").hidden = true;
    $("signed-in").hidden = false;
    $("signed-in-name").textContent = me.user.name;
    $("auth-title").textContent = `Hi, ${me.user.name.split(" ")[0]}!`;
    $("auth-sub").textContent = "";
    $("continue").href = next;
    $("logout").onclick = Auth.logout;
    return;
  }
  if (me.googleEnabled) {
    $("google").hidden = false;
    $("or").hidden = false;
    $("google").href = `/auth/google?next=${encodeURIComponent(next)}`;
  }
});

setMode(mode);
if (GOOGLE_ERRORS[params.get("error")]) showError(GOOGLE_ERRORS[params.get("error")]);
