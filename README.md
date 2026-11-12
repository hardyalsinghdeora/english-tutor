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

## Student accounts
Students sign up with email and password, or with Google. Logged-in students can talk to Emma (up to
`DAILY_MESSAGES` messages a day, default 100) and their finished lessons are saved to their account, so
progress follows them to any device. Lessons and lesson videos stay open to everyone.

| Setting (environment variable) | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string where accounts are stored, e.g. from [Neon](https://neon.tech) (free). Without it, a local file `data/dev.db` is used: fine on your computer, but **on Render it is wiped on every deploy**. |
| `SESSION_SECRET` | A long random string that signs login cookies (at least 32 characters). Required on Render. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turn on "Continue with Google" (see below). Optional. |
| `DAILY_MESSAGES` | Chat messages per student per day (default 100). |

**Neon (free Postgres):** sign up at neon.tech → create a project → copy the connection string
(`postgresql://…?sslmode=require`) → add it on Render as `DATABASE_URL`. Tables are created automatically.

**Google sign-in:** in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services →
OAuth consent screen (External, app name "English with Emma") → Credentials → Create credentials →
OAuth client ID → Web application. Add the authorised redirect URI
`https://<your-site>/auth/google/callback` (for this site: `https://english-with-emma.onrender.com/auth/google/callback`),
then put the client ID and secret on Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

How it's built: passwords are hashed with scrypt; logins are HttpOnly, SameSite cookies signed with
`SESSION_SECRET`; sign-up and log-in are limited to 10 tries per 10 minutes per address; account APIs accept
JSON only. Code: `lib/db.js` (Postgres or SQLite), `lib/auth.js`, routes in `server.js`, page `public/login.html`.

## Tests
```
npm install
npm test
```
Runs the server against a temporary SQLite file and checks sign-up, log-in, Google sign-in (with a fake
Google), chat limits and progress. Set `TEST_DATABASE_URL=postgres://…` to run everything against Postgres too.

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
