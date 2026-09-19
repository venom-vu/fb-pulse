import { ipcMain, BrowserWindow, app } from 'electron'
import { getDatabase } from '../database/connection'
import type { AccountDTO, IPCResult, AppInfoDTO } from '../../preload/types'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Window Control Handlers
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized()
  })

  // App Info Handler
  ipcMain.handle('app:get-info', (): AppInfoDTO => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform as 'darwin' | 'win32' | 'linux',
      isPackaged: app.isPackaged
    }
  })

  // Account Handlers
  ipcMain.handle('account:get-profile', async (): Promise<IPCResult<AccountDTO | null>> => {
    try {
      const db = getDatabase()
      const row = db.prepare('SELECT * FROM accounts WHERE status = ? LIMIT 1').get('connected') as AccountDTO | undefined

      if (!row) {
        return { success: true, data: null }
      }

      return {
        success: true,
        data: {
          id: row.id,
          fb_user_id: row.fb_user_id,
          name: row.name,
          avatar_url: row.avatar_url,
          status: row.status,
          status_reason: row.status_reason,
          last_synced_at: row.last_synced_at
        }
      }
    } catch (error: any) {
      console.error('[IPC] Failed to get account profile:', error)
      return {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: error?.message || 'Failed to query database'
        }
      }
    }
  })

  ipcMain.handle('account:login-webview', async (): Promise<IPCResult<{ success: boolean }>> => {
    // Scaffolded for Story 1.2
    return {
      success: true,
      data: { success: false }
    }
  })

  ipcMain.handle('account:logout', async (): Promise<IPCResult<void>> => {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM accounts').run()
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: error?.message || 'Failed to logout'
        }
      }
    }
  })
}
