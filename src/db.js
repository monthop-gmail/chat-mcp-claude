/**
 * SQLite Database Layer for Chat MCP Server
 * Provides persistent storage and FTS5 full-text search
 */

import { config } from './config.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

let Database;
let db = null;

/**
 * Initialize database connection
 */
export async function initDB() {
  if (db) return db;

  if (!config.DB_ENABLED) {
    console.error('Database disabled via CHAT_DB_ENABLED=false');
    return null;
  }

  try {
    // Ensure data directory exists
    const dataDir = dirname(config.DB_PATH);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Dynamic import for better-sqlite3
    const module = await import('better-sqlite3');
    Database = module.default;
    db = new Database(config.DB_PATH);

    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');

    // Create tables
    createTables();

    console.error(`Database initialized at ${config.DB_PATH}`);
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
    return null;
  }
}

/**
 * Create database tables
 */
function createTables() {
  db.exec(`
    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT,
      chat_file TEXT
    );

    -- FTS5 virtual table for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      date,
      sender,
      content,
      content='messages',
      content_rowid='id',
      tokenize='unicode61'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, date, sender, content)
      VALUES (new.id, new.date, new.sender, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, date, sender, content)
      VALUES ('delete', old.id, old.date, old.sender, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, date, sender, content)
      VALUES ('delete', old.id, old.date, old.sender, old.content);
      INSERT INTO messages_fts(rowid, date, sender, content)
      VALUES (new.id, new.date, new.sender, new.content);
    END;

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_file ON messages(chat_file);
  `);
}

/**
 * Get database instance
 */
export function getDB() {
  return db;
}

/**
 * Check if database is available
 */
export function isDBAvailable() {
  return db !== null;
}

/**
 * Get message count
 */
export function getMessageCount() {
  if (!db) return 0;
  const row = db.prepare('SELECT COUNT(*) as count FROM messages').get();
  return row?.count || 0;
}

/**
 * Insert messages in batch
 */
export function insertMessages(messages) {
  if (!db) return 0;

  const stmt = db.prepare(`
    INSERT INTO messages (date, time, sender, content, chat_file)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((items) => {
    let count = 0;
    for (const msg of items) {
      stmt.run(msg.date, msg.time, msg.sender, msg.content, msg.chat_file);
      count++;
    }
    return count;
  });

  return transaction(messages);
}

/**
 * Clear all messages
 */
export function clearMessages() {
  if (!db) return;
  db.exec('DELETE FROM messages');
  // Rebuild FTS index
  db.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')");
}

/**
 * Search messages using FTS5
 */
export function searchMessages(query, limit = 20) {
  if (!db) return [];

  // Escape special FTS5 characters and prepare query
  const sanitizedQuery = query
    .replace(/['"]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => `"${w}"`)
    .join(' OR ');

  if (!sanitizedQuery) return [];

  try {
    return db.prepare(`
      SELECT
        m.id,
        m.date,
        m.time,
        m.sender,
        m.content,
        m.chat_file,
        snippet(messages_fts, 2, '>>>', '<<<', '...', 64) as snippet
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(sanitizedQuery, limit);
  } catch (error) {
    console.error('Search error:', error.message);
    // Fallback to LIKE search
    return db.prepare(`
      SELECT id, date, time, sender, content, chat_file, content as snippet
      FROM messages
      WHERE content LIKE ?
      ORDER BY date DESC, time DESC
      LIMIT ?
    `).all(`%${query}%`, limit);
  }
}

/**
 * Get messages by date
 */
export function getMessagesByDate(date, limit = 100) {
  if (!db) return [];
  return db.prepare(`
    SELECT id, date, time, sender, content, chat_file
    FROM messages
    WHERE date = ?
    ORDER BY time ASC
    LIMIT ?
  `).all(date, limit);
}

/**
 * Get messages by sender
 */
export function getMessagesBySender(sender, limit = 50) {
  if (!db) return [];
  return db.prepare(`
    SELECT id, date, time, sender, content, chat_file
    FROM messages
    WHERE sender LIKE ?
    ORDER BY date DESC, time DESC
    LIMIT ?
  `).all(`%${sender}%`, limit);
}

/**
 * Get recent messages
 */
export function getRecentMessages(limit = 20) {
  if (!db) return [];
  return db.prepare(`
    SELECT id, date, time, sender, content, chat_file
    FROM messages
    ORDER BY date DESC, time DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get chat statistics
 */
export function getChatStats() {
  if (!db) return null;

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_messages,
      COUNT(DISTINCT sender) as unique_senders,
      COUNT(DISTINCT date) as total_days,
      MIN(date) as first_date,
      MAX(date) as last_date,
      COUNT(DISTINCT chat_file) as chat_files
    FROM messages
  `).get();

  const topSenders = db.prepare(`
    SELECT sender, COUNT(*) as message_count
    FROM messages
    GROUP BY sender
    ORDER BY message_count DESC
    LIMIT 10
  `).all();

  return {
    ...stats,
    top_senders: topSenders,
  };
}

/**
 * Get all unique senders
 */
export function getSenders() {
  if (!db) return [];
  return db.prepare(`
    SELECT DISTINCT sender, COUNT(*) as count
    FROM messages
    GROUP BY sender
    ORDER BY count DESC
  `).all();
}

/**
 * Close database connection
 */
export function closeDB() {
  if (db) {
    db.close();
    db = null;
    console.error('Database connection closed');
  }
}
