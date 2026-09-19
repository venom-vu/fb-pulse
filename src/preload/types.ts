export interface AccountDTO {
  id: string
  fb_user_id: string | null
  name: string
  avatar_url: string | null
  status: 'connected' | 'disconnected' | 'checkpoint_required'
  status_reason: string | null
  last_synced_at: string | null
  created_at?: string
  updated_at?: string
}

export interface AppInfoDTO {
  name: string
  version: string
  platform: 'darwin' | 'win32' | 'linux'
  isPackaged: boolean
}

export interface IPCResult<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface TargetDTO {
  id: string
  account_id: string
  folder_id: string | null
  fb_id: string
  name: string
  type: 'profile' | 'group'
  privacy: 'public' | 'private'
  avatar_url: string | null
  last_synced_at: string | null
}

export interface FolderDTO {
  id: string
  account_id: string
  name: string
  created_at?: string
}

export interface TargetSyncResultDTO {
  targets: TargetDTO[]
  syncedCount: number
  profileTarget?: TargetDTO
}

export interface CreateCampaignDTO {
  title?: string
  rawContent: string
  spintaxEnabled?: boolean
  mediaPaths?: string[]
  targetIds: string[]
  scheduleMode: 'immediate' | 'scheduled'
  scheduledAt?: string // ISO 8601 string
  minJitterSec?: number
  maxJitterSec?: number
}

export interface CreateCampaignResultDTO {
  campaignId: string
  taskCount: number
  scheduledAt: string
}

export interface FBPulseAPI {
  account: {
    getProfile: () => Promise<IPCResult<AccountDTO | null>>
    loginWebView: () => Promise<IPCResult<{ success: boolean; cancelled?: boolean; userId?: string }>>
    importSessionJson: (jsonStr: string) => Promise<IPCResult<AccountDTO>>
    logout: () => Promise<IPCResult<void>>
    checkHealth: () => Promise<IPCResult<{ valid: boolean; reason?: string; isCheckpoint?: boolean }>>
    triggerEmergencyPause: (reason?: string) => Promise<IPCResult<AccountDTO>>
  }
  targets: {
    list: () => Promise<IPCResult<TargetDTO[]>>
    syncFromFacebook: () => Promise<IPCResult<TargetSyncResultDTO>>
    createFolder: (name: string) => Promise<IPCResult<FolderDTO>>
    updateFolder: (folderId: string, name: string) => Promise<IPCResult<FolderDTO>>
    deleteFolder: (folderId: string) => Promise<IPCResult<void>>
    listFolders: () => Promise<IPCResult<FolderDTO[]>>
    assignToFolder: (targetId: string, folderId: string | null) => Promise<IPCResult<void>>
    batchAssignToFolder: (targetIds: string[], folderId: string | null) => Promise<IPCResult<void>>
  }
  queue: {
    resumeAuthPaused: () => Promise<IPCResult<{ resumedCount: number }>>
    getStatus: () => Promise<IPCResult<{ scheduledCount: number; authPausedCount: number; totalCount: number }>>
  }
  composer: {
    testSpintaxVariant: (template: string) => Promise<IPCResult<string>>
    createCampaign: (payload: CreateCampaignDTO) => Promise<IPCResult<CreateCampaignResultDTO>>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    minimizeToTray: () => Promise<void>
  }
  app: {
    getInfo: () => Promise<AppInfoDTO>
  }
  onSessionRefreshed: (callback: (account: AccountDTO) => void) => () => void
  onEmergencyPause: (callback: (payload: { reason: string; timestamp: string }) => void) => () => void
}

declare global {
  interface Window {
    fbPulseAPI: FBPulseAPI
  }
}
