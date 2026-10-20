import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

let instance = null;

export function initDatabase(customPath) {
  const dbPath = customPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'linkpulse.db');

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for concurrency if file-based
  if (dbPath !== ':memory:') {
    try {
      db.exec('PRAGMA journal_mode = WAL;');
    } catch {
      // WAL fallback
    }
  }
  db.exec('PRAGMA foreign_keys = ON;');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_code TEXT UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      custom_alias TEXT UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      expires_at TEXT,
      click_limit INTEGER,
      click_count INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      short_code TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      device TEXT,
      browser TEXT,
      is_bot INTEGER DEFAULT 0 NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code);
    CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON clicks(short_code);
    CREATE INDEX IF NOT EXISTS idx_clicks_timestamp ON clicks(timestamp);
  `);

  instance = db;
  return db;
}

export function getDatabase() {
  if (!instance) {
    return initDatabase();
  }
  return instance;
}

export function closeDatabase() {
  if (instance) {
    try {
      instance.close();
    } catch {
      // already closed
    }
    instance = null;
  }
}
