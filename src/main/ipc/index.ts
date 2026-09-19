import { ipcMain, BrowserWindow, app } from 'electron'
import { getDatabase } from '../database/connection'
import { sessionService } from '../services/session.service'
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

  ipcMain.handle(
    'account:login-webview',
    async (): Promise<IPCResult<{ success: boolean; cancelled?: boolean; userId?: string }>> => {
      try {
        const result = await sessionService.openLoginWindow(mainWindow)
        if (result.success && result.userId) {
          const accountData: AccountDTO = {
            id: 'primary_account',
            fb_user_id: result.userId,
            name: `Facebook User (${result.userId})`,
            avatar_url: null,
            status: 'connected',
            status_reason: null,
            last_synced_at: new Date().toISOString()
          }
          mainWindow.webContents.send('account:session-refreshed', accountData)
        }
        return {
          success: true,
          data: result
        }
      } catch (error: any) {
        console.error('[IPC] account:login-webview error:', error)
        return {
          success: false,
          error: {
            code: 'LOGIN_ERROR',
            message: error?.message || 'Failed to open secure login window'
          }
        }
      }
    }
  )

  ipcMain.handle(
    'account:import-session-json',
    async (_event, jsonStr: string): Promise<IPCResult<AccountDTO>> => {
      try {
        const result = await sessionService.importSessionJson(jsonStr)
        if (result.success && result.data) {
          mainWindow.webContents.send('account:session-refreshed', result.data)
        }
        return result
      } catch (error: any) {
        console.error('[IPC] account:import-session-json error:', error)
        return {
          success: false,
          error: {
            code: 'IMPORT_ERROR',
            message: error?.message || 'Không thể nhập phiên đăng nhập'
          }
        }
      }
    }
  )

  ipcMain.handle('account:logout', async (): Promise<IPCResult<void>> => {
    try {
      await sessionService.clearSession()
      mainWindow.webContents.send('account:session-refreshed', null)
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'LOGOUT_ERROR',
          message: error?.message || 'Lỗi khi đăng xuất tài khoản'
        }
      }
    }
  })

  // Session Health & Emergency Pause Handlers
  ipcMain.handle('account:check-health', async (): Promise<IPCResult<{ valid: boolean; reason?: string; isCheckpoint?: boolean }>> => {
    try {
      const result = await sessionService.checkSessionHealth(true)
      if (!result.valid) {
        await sessionService.triggerEmergencyPause(
          result.reason || 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi',
          mainWindow
        )
      }
      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      console.error('[IPC] account:check-health error:', error)
      return {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error?.message || 'Kiểm tra sức khỏe phiên thất bại'
        }
      }
    }
  })

  ipcMain.handle('account:trigger-emergency-pause', async (_event, reason?: string): Promise<IPCResult<AccountDTO>> => {
    try {
      const updatedAccount = await sessionService.triggerEmergencyPause(
        reason || 'Cảnh báo: Đã kích hoạt dừng khẩn cấp',
        mainWindow
      )
      return {
        success: true,
        data: updatedAccount
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'EMERGENCY_PAUSE_FAILED',
          message: error?.message || 'Không thể kích hoạt dừng khẩn cấp'
        }
      }
    }
  })

  ipcMain.handle('queue:resume-auth-paused', async (): Promise<IPCResult<{ resumedCount: number }>> => {
    try {
      const result = await sessionService.resumeEmergencyPausedTasks()
      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'RESUME_FAILED',
          message: error?.message || 'Không thể khôi phục các tác vụ trong hàng đợi'
        }
      }
    }
  })

  ipcMain.handle('queue:get-status', async (): Promise<IPCResult<{ scheduledCount: number; authPausedCount: number; totalCount: number }>> => {
    try {
      const status = await sessionService.getQueueStatus()
      return {
        success: true,
        data: status
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'QUEUE_STATUS_FAILED',
          message: error?.message || 'Không thể lấy trạng thái hàng đợi'
        }
      }
    }
  })
}

