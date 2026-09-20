import { app, nativeTheme, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDatabase } from './db/connection'
import { resolveDatabasePath } from './db/path'
import { createSettingsRepo } from './db/repositories/settings'
import { registerIpc } from './ipc/registerIpc'
import { applyStoredTheme } from './theme'

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

  mainWindow.on('ready-to-show', () => mainWindow.show())

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
  const db = openDatabase(resolveDatabasePath())
  applyStoredTheme(createSettingsRepo(db))
  registerIpc(db)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('will-quit', () => {
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
