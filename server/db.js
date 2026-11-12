const path = require('path');
const fs = require('fs');

// Ensure .env is loaded even when db.js is required directly outside server/index.js
if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_PATH) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const tursoToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
const isTurso = Boolean(tursoUrl);

const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    name TEXT NOT NULL,
    username TEXT,
    pronouns TEXT,
    bio TEXT,
    status_text TEXT,
    status_mode TEXT DEFAULT 'online',
    custom_emoji TEXT,
    avatar_color TEXT,
    avatar_url TEXT,
    banner_color TEXT DEFAULT '#1e1b4b',
    banner_url TEXT,
    accent_color TEXT DEFAULT '#8b5cf6',
    profile_theme TEXT DEFAULT 'default',
    theme_primary TEXT DEFAULT '#1e1b4b',
    theme_secondary TEXT DEFAULT '#0f172a',
    avatar_frame TEXT DEFAULT 'none',
    preferences TEXT,
    privacy_settings TEXT,
    voice_settings TEXT,
    study_streak INTEGER DEFAULT 0,
    total_focus_minutes INTEGER DEFAULT 0,
    last_study_date TEXT,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT DEFAULT '',
    banned_at INTEGER,
    banned_by TEXT,
    chat_muted_until INTEGER,
    warning_count INTEGER DEFAULT 0,
    account_notes TEXT DEFAULT '',
    token_version INTEGER DEFAULT 0,
    is_guest INTEGER DEFAULT 0,
    last_seen INTEGER,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    content TEXT,
    updated_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    visibility TEXT DEFAULT 'public',
    password_hash TEXT,
    capacity INTEGER DEFAULT 10,
    host_id TEXT,
    cover_url TEXT,
    vibe TEXT DEFAULT 'Study',
    mode TEXT DEFAULT 'Group',
    theme TEXT DEFAULT 'default',
    theme_accent TEXT DEFAULT '',
    is_locked INTEGER DEFAULT 0,
    waiting_room INTEGER DEFAULT 0,
    allow_mic INTEGER DEFAULT 1,
    allow_cam INTEGER DEFAULT 1,
    allow_screen INTEGER DEFAULT 1,
    allow_chat INTEGER DEFAULT 1,
    allow_media_control INTEGER DEFAULT 1,
    youtube_url TEXT,
    is_seed INTEGER DEFAULT 0,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS favourite_rooms (
    user_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    PRIMARY KEY (user_id, room_id)
  )`,
  `CREATE TABLE IF NOT EXISTS room_memberships (
    user_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    joined_at INTEGER,
    last_joined_at INTEGER,
    PRIMARY KEY (user_id, room_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS room_roles (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (room_id, room_id ? user_id : user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`.replace('PRIMARY KEY (room_id, room_id ? user_id : user_id)', 'PRIMARY KEY (room_id, user_id)'),
  `CREATE TABLE IF NOT EXISTS room_bans (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    banned_by TEXT,
    created_at INTEGER,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS room_join_requests (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER,
    UNIQUE(room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    note TEXT,
    created_at INTEGER,
    UNIQUE(user_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER,
    read_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data TEXT,
    is_read INTEGER DEFAULT 0,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    target_user_id TEXT,
    room_id TEXT,
    target_type TEXT DEFAULT 'user',
    category TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    description TEXT NOT NULL,
    evidence_image TEXT,
    status TEXT DEFAULT 'submitted',
    reviewer_note TEXT,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS user_warnings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    issued_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    severity TEXT DEFAULT 'warning',
    acknowledged INTEGER DEFAULT 0,
    created_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    admin_email TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS system_announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS user_appeals (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    name TEXT,
    appeal_type TEXT DEFAULT 'ban_appeal',
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    admin_response TEXT,
    resolved_by TEXT,
    created_at INTEGER,
    resolved_at INTEGER
  )`
];

const COLUMN_MIGRATIONS = {
  users: [
    ['username', 'TEXT'],
    ['pronouns', 'TEXT'],
    ['bio', 'TEXT'],
    ['status_text', 'TEXT'],
    ['status_mode', "TEXT DEFAULT 'online'"],
    ['custom_emoji', 'TEXT'],
    ['banner_color', "TEXT DEFAULT '#1e1b4b'"],
    ['banner_url', 'TEXT'],
    ['accent_color', "TEXT DEFAULT '#8b5cf6'"],
    ['profile_theme', "TEXT DEFAULT 'default'"],
    ['theme_primary', "TEXT DEFAULT '#1e1b4b'"],
    ['theme_secondary', "TEXT DEFAULT '#0f172a'"],
    ['avatar_frame', "TEXT DEFAULT 'none'"],
    ['preferences', 'TEXT'],
    ['privacy_settings', 'TEXT'],
    ['voice_settings', 'TEXT'],
    ['study_streak', 'INTEGER DEFAULT 0'],
    ['total_focus_minutes', 'INTEGER DEFAULT 0'],
    ['last_study_date', 'TEXT'],
    ['is_banned', 'INTEGER DEFAULT 0'],
    ['ban_reason', "TEXT DEFAULT ''"],
    ['banned_at', 'INTEGER'],
    ['banned_by', 'TEXT'],
    ['chat_muted_until', 'INTEGER'],
    ['warning_count', 'INTEGER DEFAULT 0'],
    ['account_notes', "TEXT DEFAULT ''"],
    ['token_version', 'INTEGER DEFAULT 0'],
    ['last_seen', 'INTEGER']
  ],
  rooms: [
    ['cover_url', 'TEXT'],
    ['vibe', "TEXT DEFAULT 'Study'"],
    ['mode', "TEXT DEFAULT 'Group'"],
    ['theme', "TEXT DEFAULT 'default'"],
    ['theme_accent', "TEXT DEFAULT ''"],
    ['is_locked', 'INTEGER DEFAULT 0'],
    ['waiting_room', 'INTEGER DEFAULT 0'],
    ['allow_mic', 'INTEGER DEFAULT 1'],
    ['allow_cam', 'INTEGER DEFAULT 1'],
    ['allow_screen', 'INTEGER DEFAULT 1'],
    ['allow_chat', 'INTEGER DEFAULT 1'],
    ['allow_media_control', 'INTEGER DEFAULT 1'],
    ['youtube_url', 'TEXT']
  ],
  friendships: [['note', 'TEXT']]
};

function sanitizeArgs(params = []) {
  return params.map((v) => (v === undefined ? null : v));
}

function normalizeLibsqlRows(result) {
  if (!result || !Array.isArray(result.rows)) return [];
  const columns = result.columns || [];
  return result.rows.map((row) => {
    const obj = {};
    if (Array.isArray(row)) {
      for (let i = 0; i < columns.length; i += 1) {
        const v = row[i];
        obj[columns[i]] = typeof v === 'bigint' ? Number(v) : v;
      }
      return obj;
    }
    const keys = columns.length > 0 ? columns : Object.keys(row);
    for (const col of keys) {
      const v = row[col];
      obj[col] = typeof v === 'bigint' ? Number(v) : v;
    }
    return obj;
  });
}

let db = null;
let libsqlClient = null;
let initPromise = null;

if (isTurso) {
  const { createClient } = require('@libsql/client');
  libsqlClient = createClient({
    url: tursoUrl,
    authToken: tursoToken || undefined
  });
  const redactedUrl = tursoUrl.replace(/\/\/([^@/]+@)?/, '//');
  console.log(`Configured Turso / libSQL database client (${redactedUrl})`);
} else {
  const sqlite3 = require('sqlite3').verbose();
  const defaultDataDir = path.join(__dirname, '..', 'data');
  const dbPath = process.env.DATABASE_PATH || path.join(defaultDataDir, 'studyhub.db');
  const dbDir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open SQLite database:', err.message);
    } else {
      console.log(`Connected to SQLite database at ${dbPath}`);
    }
  });
}

function rawSqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, sanitizeArgs(params), function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function rawSqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, sanitizeArgs(params), (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function rawSqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, sanitizeArgs(params), (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function runSchemaInitialization() {
  if (isTurso) {
    // Batch all DDL creation statements into one round-trip for fast cold starts
    await libsqlClient.batch(
      ['PRAGMA foreign_keys = ON;', ...TABLE_DEFINITIONS, 'DELETE FROM rooms WHERE is_seed = 1'],
      'write'
    );

    const alterStatements = [];
    for (const [tableName, columns] of Object.entries(COLUMN_MIGRATIONS)) {
      const infoRes = await libsqlClient.execute(`PRAGMA table_info(${tableName})`);
      const existing = new Set(normalizeLibsqlRows(infoRes).map((c) => c.name));
      for (const [colName, colType] of columns) {
        if (!existing.has(colName)) {
          alterStatements.push(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`);
        }
      }
    }
    if (alterStatements.length > 0) {
      await libsqlClient.batch(alterStatements, 'write');
    }
    console.log('Turso database schema verified and ready');
    return;
  }

  // Local SQLite initialization (serialized sequentially)
  await rawSqliteRun('PRAGMA journal_mode = WAL;');
  await rawSqliteRun('PRAGMA synchronous = NORMAL;');
  await rawSqliteRun('PRAGMA foreign_keys = ON;');

  for (const ddl of TABLE_DEFINITIONS) {
    await rawSqliteRun(ddl);
  }

  for (const [tableName, columns] of Object.entries(COLUMN_MIGRATIONS)) {
    const existingRows = await rawSqliteAll(`PRAGMA table_info(${tableName})`);
    const existing = new Set((existingRows || []).map((c) => c.name));
    for (const [colName, colType] of columns) {
      if (!existing.has(colName)) {
        await rawSqliteRun(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`);
      }
    }
  }

  await rawSqliteRun('DELETE FROM rooms WHERE is_seed = 1');
}

function initDatabase() {
  if (!initPromise) {
    initPromise = runSchemaInitialization().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// Kick off initialization immediately so local workflows match previous behavior
initDatabase().catch((err) => {
  console.error('Database initialization error:', err.message);
});

const dbAsync = {
  async run(sql, params = []) {
    await initDatabase();
    if (isTurso) {
      const res = await libsqlClient.execute({ sql, args: sanitizeArgs(params) });
      return {
        lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
        changes: res.rowsAffected ?? 0
      };
    }
    return rawSqliteRun(sql, params);
  },

  async get(sql, params = []) {
    await initDatabase();
    if (isTurso) {
      const res = await libsqlClient.execute({ sql, args: sanitizeArgs(params) });
      return normalizeLibsqlRows(res)[0];
    }
    return rawSqliteGet(sql, params);
  },

  async all(sql, params = []) {
    await initDatabase();
    if (isTurso) {
      const res = await libsqlClient.execute({ sql, args: sanitizeArgs(params) });
      return normalizeLibsqlRows(res);
    }
    return rawSqliteAll(sql, params);
  }
};

function closeDatabase() {
  return new Promise((resolve) => {
    if (isTurso) {
      try {
        libsqlClient?.close();
      } catch {
        // Ignore close errors during shutdown
      }
      return resolve();
    }
    if (!db) return resolve();
    db.close(() => resolve());
  });
}

module.exports = { db, dbAsync, initDatabase, closeDatabase, isTurso };
