// Student accounts, lesson progress and daily chat counts.
// Production: Postgres (Neon) from DATABASE_URL. Development and tests: a local SQLite file
// (Node's built-in node:sqlite). Both use the same tables and the same methods below.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     password_hash TEXT,
     google_id TEXT UNIQUE,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS progress (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     lesson_id TEXT NOT NULL,
     score INTEGER NOT NULL,
     completed_at TEXT NOT NULL,
     PRIMARY KEY (user_id, lesson_id)
   )`,
  `CREATE TABLE IF NOT EXISTS chat_usage (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     day TEXT NOT NULL,
     messages INTEGER NOT NULL,
     PRIMARY KEY (user_id, day)
   )`,
];

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);   // UTC day

// The SQL below is written once with $1, $2 placeholders (Postgres); SQLite gets them as ?1, ?2.
class Store {
  constructor(driver) { this.d = driver; }

  async init() { for (const sql of SCHEMA) await this.d.run(sql); }

  async createUser({ email, name, passwordHash = null, googleId = null }) {
    const user = { id: crypto.randomUUID(), email, name, created_at: now() };
    await this.d.run("INSERT INTO users (id, email, name, password_hash, google_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [user.id, email, name, passwordHash, googleId, user.created_at]);
    return user;
  }
  userByEmail(email) { return this.d.get("SELECT * FROM users WHERE email = $1", [email]); }
  userById(id) { return this.d.get("SELECT * FROM users WHERE id = $1", [id]); }
  userByGoogleId(gid) { return this.d.get("SELECT * FROM users WHERE google_id = $1", [gid]); }
  linkGoogle(id, gid) { return this.d.run("UPDATE users SET google_id = $1 WHERE id = $2", [gid, id]); }

  async progress(userId) {
    const rows = await this.d.all("SELECT lesson_id, score, completed_at FROM progress WHERE user_id = $1", [userId]);
    return Object.fromEntries(rows.map((r) => [r.lesson_id, { score: Number(r.score), completed_at: r.completed_at }]));
  }
  // Keeps the best score; the first completion date stays.
  saveProgress(userId, lessonId, score) {
    return this.d.run(
      `INSERT INTO progress (user_id, lesson_id, score, completed_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET score = CASE WHEN excluded.score > progress.score
         THEN excluded.score ELSE progress.score END`,
      [userId, lessonId, score, now()]);
  }

  // Adds one message to today's count and returns the new count.
  async countMessage(userId) {
    const row = await this.d.get(
      `INSERT INTO chat_usage (user_id, day, messages) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET messages = chat_usage.messages + 1
       RETURNING messages`, [userId, today()]);
    return Number(row.messages);
  }
  async messagesToday(userId) {
    const row = await this.d.get("SELECT messages FROM chat_usage WHERE user_id = $1 AND day = $2", [userId, today()]);
    return row ? Number(row.messages) : 0;
  }

  close() { return this.d.close(); }
}

function postgresDriver(url) {
  const { Pool } = require("pg");
  // Neon and most hosted Postgres need TLS; a local server (tests) usually doesn't.
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || url.includes("host=/");
  const pool = new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: true } });
  return {
    kind: "postgres",
    async run(sql, params = []) { await pool.query(sql, params); },
    async get(sql, params = []) { return (await pool.query(sql, params)).rows[0]; },
    async all(sql, params = []) { return (await pool.query(sql, params)).rows; },
    close: () => pool.end(),
  };
}

function sqliteDriver(file) {
  const { DatabaseSync } = require("node:sqlite");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  const q = (sql) => db.prepare(sql.replace(/\$(\d+)/g, "?$1"));
  return {
    kind: "sqlite",
    async run(sql, params = []) { q(sql).run(...params); },
    async get(sql, params = []) { return q(sql).get(...params); },
    async all(sql, params = []) { return q(sql).all(...params); },
    async close() { db.close(); },
  };
}

async function open({ databaseUrl, sqliteFile }) {
  const store = new Store(databaseUrl ? postgresDriver(databaseUrl) : sqliteDriver(sqliteFile));
  await store.init();
  store.kind = store.d.kind;
  return store;
}

module.exports = { open };
