import { app, nativeTheme, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDatabase } from './db/connection'
import { resolveDatabasePath } from './db/path'
import { createSettingsRepo } from './db/repositories/settings'
import { registerIpc } from './ipc/registerIpc'
import { applyStoredTheme, applyThemePreference } from './theme'
import { THEME_PREFERENCE_KEY } from '../shared/theme'
import { benchmarkEvent, isBenchmarkEnabled } from './benchmark'

benchmarkEvent('main-start')

if (process.env['ELECTRON_DISABLE_GPU']) {
  app.commandLine.appendSwitch('disable-gpu')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Synapse',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    benchmarkEvent('window-ready')
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  benchmarkEvent('app-ready')
  const db = openDatabase(resolveDatabasePath())
  benchmarkEvent('database-open')
  applyStoredTheme(createSettingsRepo(db))
  registerIpc(db, {
    onSettingChanged: (key, value) => {
      if (key === THEME_PREFERENCE_KEY) applyThemePreference(value)
    }
  })
  benchmarkEvent('ipc-ready')

  createWindow()

  const memoryTimer = isBenchmarkEnabled()
    ? setInterval(() => {
        try {
          const processes = app.getAppMetrics().map((metric) => ({
            type: metric.type,
            pid: metric.pid,
            workingSetSizeKb: metric.memory.workingSetSize,
            privateBytesKb: metric.memory.privateBytes
          }))
          benchmarkEvent('memory-sample', { processes })
        } catch {
          // Metrics are diagnostic only; sampling must not affect the app.
        }
      }, 500)
    : null

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('will-quit', () => {
    if (memoryTimer) clearInterval(memoryTimer)
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
