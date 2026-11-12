# English with Emma

A beginner English website with video lessons, quizzes, and an AI tutor named Emma.
It uses **Google Gemini** (has a free tier) or **OpenAI**. No Claude is needed.

## Run it on your computer
1. Install **Node.js** (version 18 or newer) from https://nodejs.org
2. Open a terminal in this folder and run:
   ```
   node server.js
   ```
3. Open http://localhost:3000 in your browser.

It starts in **demo mode** with fixed answers. To turn on the real AI:

## Add your AI key
1. Get a free Gemini key at https://aistudio.google.com/apikey
   (or an OpenAI key at https://platform.openai.com/api-keys)
2. Copy `.env.example` to a new file named `.env`
3. Paste your key after `GEMINI_API_KEY=` (or set `PROVIDER=openai` and fill `OPENAI_API_KEY=`)
4. Stop the server (Ctrl+C) and run `node server.js` again.

Never put your key in the files inside `public/`, because everyone can see those.

## Lesson videos
Every lesson has a built-in narrated "video" (`public/player.js`): Emma reads the lesson aloud with the
browser's voice. It goes intro → each new word (listen, then "your turn" to say it) → the lesson's 3 example
sentences (listen and repeat) → review → quiz, with play/pause, back/next, a clickable progress bar, captions
and arrow-key controls. It is free, needs no video files, and uses the voice chosen in ⚙️ on the chat page.
The slides are built from each lesson's `vocab` and `examples` in `public/lessons-data.js`.

To use a real video instead (for example from HeyGen), set `video:` for that lesson:
- YouTube: `"https://www.youtube.com/embed/VIDEO_ID"` (upload your HeyGen video as Unlisted)
- Your own file: put it in `public/videos/` and use `"/videos/lesson1.mp4"`

## Change things
| What | File |
|---|---|
| Lessons, words, quizzes | `public/lessons-data.js` |
| Emma's personality and rules | `server.js` → `systemPrompt` |
| Colors and fonts | `public/styles.css` (top of the file) |
| Home page text | `public/index.html` |
| Emma's picture | replace `public/avatar.svg` (or use your HeyGen image) |

## Put it online for free (Render)
1. Sign in at https://render.com with your GitHub account (free, no credit card).
2. Click **New → Blueprint** and pick this repository. Render reads `render.yaml`.
3. Paste your Gemini key when it asks for `GEMINI_API_KEY`, then click **Apply**.
4. After 1–2 minutes your site is live at `https://english-with-emma.onrender.com` (or a similar name).

Every time you push to GitHub, Render updates the site automatically. This needs the Render GitHub app
installed with access to this repository (GitHub → Settings → Applications → Render → Configure; choose
"Only select repositories" so Render can't see your other repos).
On the free plan the site sleeps after 15 minutes without visitors, so the first visit after that takes about 30–50 seconds.

## Features
- 16 beginner lessons (9 at A1, 7 at A2), each with a narrated lesson video, new words, example sentences and a quiz,
  grouped by level with progress
- 🔊 Listen button on every word and every Emma message (browser text-to-speech, free).
  Emma uses a female English voice when the device has one; students can pick another in ⚙️ on the chat page
- 🎤 Speaking practice: tap the mic, speak (words appear as you talk), tap Stop, then **Send / Say it again / Edit**.
  "Send automatically when I stop speaking" and "Emma reads her replies aloud" are options in ⚙️ (Chrome, Edge, Safari)
- On startup the server sends one tiny test request to the AI and logs `AI check: OK` or the error, so a wrong key
  or model name shows up in the host's logs right away
- "Practice this lesson with Emma" focuses the chat on that lesson
- Lesson progress saved in the browser (✓ marks)
- Key is kept on the server, with a simple limit of 20 messages per minute per user
