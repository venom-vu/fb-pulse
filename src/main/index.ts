import { app, shell, BrowserWindow, powerMonitor } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { closeDatabase, getDatabase } from './database/connection'
import { sessionService } from './services/session.service'
import { trayService } from './services/tray.service'
import { schedulerService } from './services/scheduler.service'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0B111A',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 11 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Register IPC handlers
  registerIpcHandlers(mainWindow)

  // Initialize System Tray
  trayService.initialize(mainWindow)

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    // Initialize database & restore session
    try {
      getDatabase()
      await sessionService.restoreSessionFromDatabase()
    } catch (err) {
      console.error('[Main] Failed to initialize SQLite database or restore session:', err)
    }

    createWindow()

    // Khởi động tiến trình giám sát sức khỏe phiên nền (mỗi 5 phút)
    sessionService.startHealthMonitoring(300000, () => mainWindow)

    // Lắng nghe sự kiện hệ điều hành đánh thức máy tính (Story 4.4)
    powerMonitor.on('resume', () => {
      console.log('[Main] Hệ điều hành kích hoạt powerMonitor.resume — Khởi động khôi phục an toàn')
      schedulerService.handleSystemResume()
    })

    // Cập nhật trạng thái PowerSaveBlocker khi khởi động
    schedulerService.updatePowerSaveBlocker()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    trayService.destroy()
    sessionService.stopHealthMonitoring()
    schedulerService.resetForTesting()
    closeDatabase()
  })
}
