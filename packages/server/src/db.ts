import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, daohao TEXT NOT NULL,
      data TEXT NOT NULL, seen_log INTEGER NOT NULL DEFAULT 0, seen_rumor INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stays (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bounties (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS met (pair TEXT PRIMARY KEY, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rumors (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, who TEXT NOT NULL, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, at INTEGER NOT NULL, self INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS logs_player ON logs(player_id, id);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS onboarding (uid TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS visits (player_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (player_id, day));
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, product TEXT NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, delivered_at INTEGER);
    CREATE TABLE IF NOT EXISTS idem (key TEXT NOT NULL, uid TEXT NOT NULL, body_hash TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (uid, key));
  `);
  migrate(db);
  ensureSessionExpiry(db);
  return db;
}

function migrate(db: Db) {
  const ver = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (ver() < 1) {

    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'players'").get() as { sql: string } | undefined)?.sql ?? '';
    tx(db, () => {
      if (/daohao TEXT NOT NULL UNIQUE/.test(sql)) {
        db.exec(`
          CREATE TABLE players_v1 (
            id TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, daohao TEXT NOT NULL,
            data TEXT NOT NULL, seen_log INTEGER NOT NULL DEFAULT 0, seen_rumor INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
          INSERT INTO players_v1 (id, uid, daohao, data, seen_log, seen_rumor, updated_at) SELECT id, uid, daohao, data, seen_log, seen_rumor, updated_at FROM players;
          DROP TABLE players;
          ALTER TABLE players_v1 RENAME TO players;
        `);
      }
      db.exec('PRAGMA user_version = 1');
    });
  }
}

export function ensureSessionExpiry(db: Db): void {
  const cols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'expires_at')) db.exec('ALTER TABLE sessions ADD COLUMN expires_at INTEGER');
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
