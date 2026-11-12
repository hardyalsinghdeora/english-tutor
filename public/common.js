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
    if (!("speechSynthesis" in window)) return;
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
  if ("speechSynthesis" in window) {
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
  if (!("speechSynthesis" in window)) { alert("Sorry, your browser cannot read aloud."); return; }
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

// Lesson progress, saved in this browser only.
const Progress = {
  get() { return Settings.get("progress", {}); },
  done(id) { const p = Progress.get(); p[id] = true; Settings.set("progress", p); },
};
