import Database from 'better-sqlite3'
import { migrate } from './schema'

export function openDatabase(filePath: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
