const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ─── CREATE TABLES ───
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'Уголь',
    unit TEXT DEFAULT 'тонна',
    qty REAL DEFAULT 0,
    buy_price REAL DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT,
    category TEXT,
    unit TEXT,
    qty REAL,
    price REAL,
    total REAL,
    profit REAL,
    paytype TEXT,
    client TEXT,
    source TEXT,
    amount REAL,
    note TEXT,
    description TEXT,
    user_login TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS cash (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    balance REAL DEFAULT 0
  );

  INSERT OR IGNORE INTO cash (id, balance) VALUES (1, 0);
`);

// ─── SEED DEFAULT ADMIN ───
const adminExists = db.prepare('SELECT id FROM users WHERE login = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (login, password, name, role) VALUES (?, ?, ?, ?)').run('admin', hash, 'Администратор', 'admin');
  console.log('✅ Создан admin / admin123');
}

module.exports = db;
