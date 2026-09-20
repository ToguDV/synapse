import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function resolveDatabasePath(): string {
  const dir = app.isPackaged ? app.getPath('userData') : join(app.getAppPath(), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'synapse.db')
}
