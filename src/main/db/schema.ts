import type Database from 'better-sqlite3'

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
      icon TEXT,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{"text":""}',
      position INTEGER NOT NULL,
      indent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id);
  `)
}
