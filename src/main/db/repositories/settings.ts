import type Database from 'better-sqlite3'

// Cubierto por tests/theme.test.ts.

export function createSettingsRepo(db: Database.Database) {
  const select = db.prepare('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )

  const get = (key: string): string | null => {
    const row = select.get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  const set = (key: string, value: string): void => {
    upsert.run({ key, value })
  }

  return { get, set }
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>
