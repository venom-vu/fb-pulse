import { ipcMain, BrowserWindow, app } from 'electron'
import { getDatabase } from '../database/connection'
import { sessionService } from '../services/session.service'
import { targetService } from '../services/target.service'
import { composerService } from '../services/composer.service'
import { campaignService } from '../services/campaign.service'
import { trayService } from '../services/tray.service'
import type {
  AccountDTO,
  IPCResult,
  AppInfoDTO,
  TargetDTO,
  FolderDTO,
  TargetSyncResultDTO,
  CreateCampaignDTO,
  CreateCampaignResultDTO
} from '../../preload/types'

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

  ipcMain.handle('window:minimize-to-tray', () => {
    trayService.minimizeToTray()
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

  // Targets & Folders Handlers
  ipcMain.handle('targets:list', async (): Promise<IPCResult<TargetDTO[]>> => {
    try {
      const targets = targetService.listTargets()
      return {
        success: true,
        data: targets
      }
    } catch (error: any) {
      console.error('[IPC] targets:list error:', error)
      return {
        success: false,
        error: {
          code: 'TARGETS_LIST_FAILED',
          message: error?.message || 'Không thể lấy danh sách đích đăng'
        }
      }
    }
  })

  ipcMain.handle('targets:sync-from-facebook', async (): Promise<IPCResult<TargetSyncResultDTO>> => {
    try {
      const result = await targetService.syncTargetsFromFacebook()
      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      console.error('[IPC] targets:sync-from-facebook error:', error)
      return {
        success: false,
        error: {
          code: error?.code || 'TARGETS_SYNC_FAILED',
          message: error?.message || 'Không thể đồng bộ danh sách nhóm từ Facebook'
        }
      }
    }
  })

  ipcMain.handle('targets:create-folder', async (_event, name: string): Promise<IPCResult<FolderDTO>> => {
    try {
      const folder = targetService.createFolder(name)
      return {
        success: true,
        data: folder
      }
    } catch (error: any) {
      console.error('[IPC] targets:create-folder error:', error)
      return {
        success: false,
        error: {
          code: 'CREATE_FOLDER_FAILED',
          message: error?.message || 'Không thể tạo thư mục đích'
        }
      }
    }
  })

  ipcMain.handle('targets:list-folders', async (): Promise<IPCResult<FolderDTO[]>> => {
    try {
      const folders = targetService.listFolders()
      return {
        success: true,
        data: folders
      }
    } catch (error: any) {
      console.error('[IPC] targets:list-folders error:', error)
      return {
        success: false,
        error: {
          code: 'LIST_FOLDERS_FAILED',
          message: error?.message || 'Không thể lấy danh sách thư mục'
        }
      }
    }
  })

  ipcMain.handle(
    'targets:update-folder',
    async (_event, folderId: string, name: string): Promise<IPCResult<FolderDTO>> => {
      try {
        const folder = targetService.updateFolder(folderId, name)
        return {
          success: true,
          data: folder
        }
      } catch (error: any) {
        console.error('[IPC] targets:update-folder error:', error)
        return {
          success: false,
          error: {
            code: 'UPDATE_FOLDER_FAILED',
            message: error?.message || 'Không thể cập nhật thư mục đích'
          }
        }
      }
    }
  )

  ipcMain.handle(
    'targets:delete-folder',
    async (_event, folderId: string): Promise<IPCResult<void>> => {
      try {
        targetService.deleteFolder(folderId)
        return { success: true }
      } catch (error: any) {
        console.error('[IPC] targets:delete-folder error:', error)
        return {
          success: false,
          error: {
            code: 'DELETE_FOLDER_FAILED',
            message: error?.message || 'Không thể xóa thư mục đích'
          }
        }
      }
    }
  )

  ipcMain.handle(
    'targets:assign-to-folder',
    async (_event, targetId: string, folderId: string | null): Promise<IPCResult<void>> => {
      try {
        targetService.assignToFolder(targetId, folderId)
        return { success: true }
      } catch (error: any) {
        console.error('[IPC] targets:assign-to-folder error:', error)
        return {
          success: false,
          error: {
            code: 'ASSIGN_FOLDER_FAILED',
            message: error?.message || 'Không thể gán nhóm vào thư mục'
          }
        }
      }
    }
  )

  ipcMain.handle(
    'targets:batch-assign-to-folder',
    async (_event, targetIds: string[], folderId: string | null): Promise<IPCResult<void>> => {
      try {
        targetService.batchAssignToFolder(targetIds, folderId)
        return { success: true }
      } catch (error: any) {
        console.error('[IPC] targets:batch-assign-to-folder error:', error)
        return {
          success: false,
          error: {
            code: 'BATCH_ASSIGN_FOLDER_FAILED',
            message: error?.message || 'Không thể gán nhiều nhóm vào thư mục'
          }
        }
      }
    }
  )

  // Composer Handlers
  ipcMain.handle(
    'composer:test-spintax',
    async (_event, template: string): Promise<IPCResult<string>> => {
      try {
        const result = composerService.resolveSpintaxVariant(template)
        return { success: true, data: result }
      } catch (error: any) {
        console.error('[IPC] composer:test-spintax error:', error)
        return {
          success: false,
          error: {
            code: 'SPINTAX_ERROR',
            message: error?.message || 'Lỗi khi giải mã Spintax'
          }
        }
      }
    }
  )

  ipcMain.handle(
    'composer:create-campaign',
    async (_event, payload: CreateCampaignDTO): Promise<IPCResult<CreateCampaignResultDTO>> => {
      try {
        const result = campaignService.createCampaign(payload)
        return { success: true, data: result }
      } catch (error: any) {
        console.error('[IPC] composer:create-campaign error:', error)
        return {
          success: false,
          error: {
            code: 'CREATE_CAMPAIGN_FAILED',
            message: error?.message || 'Không thể tạo chiến dịch'
          }
        }
      }
    }
  )
}

