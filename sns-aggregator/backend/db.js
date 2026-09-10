const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,          -- 'wecom' | 'dingtalk' | 'email'
    sender TEXT,                   -- 发送者名称/邮箱
    title TEXT,                    -- 邮件主题 / 消息摘要
    content TEXT,                  -- 正文内容
    raw_id TEXT,                   -- 原平台的消息唯一ID，用于去重
    received_at INTEGER NOT NULL,  -- 时间戳(ms)
    is_read INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_messages_source ON messages(source);
  CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_raw_id ON messages(source, raw_id);
`);

function insertMessage({ source, sender, title, content, raw_id, received_at }) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO messages (source, sender, title, content, raw_id, received_at)
    VALUES (@source, @sender, @title, @content, @raw_id, @received_at)
  `);
  return stmt.run({ source, sender, title, content, raw_id, received_at });
}

function listMessages({ source, limit = 50, offset = 0 } = {}) {
  if (source && source !== 'all') {
    return db.prepare(`
      SELECT * FROM messages WHERE source = ?
      ORDER BY received_at DESC LIMIT ? OFFSET ?
    `).all(source, limit, offset);
  }
  return db.prepare(`
    SELECT * FROM messages ORDER BY received_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function markRead(id) {
  db.prepare(`UPDATE messages SET is_read = 1 WHERE id = ?`).run(id);
}

module.exports = { db, insertMessage, listMessages, markRead };
