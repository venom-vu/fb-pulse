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

export interface TaskDTO {
  id: string
  campaign_id: string
  campaign_title?: string
  account_id: string
  target_id: string
  target_name?: string
  target_type?: 'profile' | 'group'
  target_avatar_url?: string | null
  resolved_spintax_text: string
  media_paths: string[]
  idempotency_key: string
  status:
    | 'scheduled'
    | 'jitter_waiting'
    | 'running'
    | 'paused'
    | 'success'
    | 'admin_pending'
    | 'retrying'
    | 'failed'
    | 'cancelled'
    | 'auth_paused'
  retry_count: number
  scheduled_at: string
  executed_at?: string | null
  permalink?: string | null
  error_code?: string | null
  error_message?: string | null
  screenshot_path?: string | null
  created_at: string
  updated_at: string
}

export interface QueueFilterDTO {
  status?: string
  statuses?: string[]
  campaignId?: string
  limit?: number
  offset?: number
  orderBy?: 'asc' | 'desc'
}

export interface QueueTickDTO {
  status: 'idle' | 'jitter_waiting' | 'running' | 'paused'
  remainingSeconds: number
  totalSeconds: number
  formattedCountdown: string
  currentTaskId?: string | null
  nextTaskId?: string | null
  isPausing?: boolean
}

export interface DailyLimitCheckResultDTO {
  currentCount: number
  incomingCount: number
  totalCount: number
  exceedsLimit: boolean
  threshold: number
}

export interface WakeupRecoveryDTO {
  isRecovering: boolean
  overdueCount: number
  remainingSeconds: number
  totalSeconds: number
}

export interface AppSettingsDTO {
  prevent_sleep_when_active?: string
  [key: string]: string | undefined
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
    getJitterStatus: () => Promise<IPCResult<QueueTickDTO>>
    getTasks: (filter?: QueueFilterDTO) => Promise<IPCResult<TaskDTO[]>>
    pauseQueue: () => Promise<IPCResult<void>>
    resumeQueue: () => Promise<IPCResult<void>>
    cancelTask: (taskId: string) => Promise<IPCResult<void>>
    cancelCampaign: (campaignId: string) => Promise<IPCResult<{ cancelledCount: number }>>
    retryTask: (taskId: string) => Promise<IPCResult<void>>
    getWakeupStatus: () => Promise<IPCResult<WakeupRecoveryDTO>>
    getPowerSaveStatus: () => Promise<IPCResult<{ isBlocked: boolean; isEnabled: boolean }>>
  }
  settings: {
    getAll: () => Promise<IPCResult<Record<string, string>>>
    set: (key: string, value: string) => Promise<IPCResult<void>>
    getPreventSleep: () => Promise<IPCResult<boolean>>
    setPreventSleep: (enabled: boolean) => Promise<IPCResult<void>>
  }
  composer: {
    testSpintaxVariant: (template: string) => Promise<IPCResult<string>>
    createCampaign: (payload: CreateCampaignDTO) => Promise<IPCResult<CreateCampaignResultDTO>>
    checkDailyLimit: (incomingTaskCount?: number) => Promise<IPCResult<DailyLimitCheckResultDTO>>
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
    getImageDataUrl: (filePath: string) => Promise<IPCResult<string>>
    openExternal: (url: string) => Promise<IPCResult<void>>
    getPathForFile?: (file: File) => string
  }
  onSessionRefreshed: (callback: (account: AccountDTO) => void) => () => void
  onEmergencyPause: (
    callback: (payload: {
      reason: string
      timestamp: string
      screenshotPath?: string | null
      isCheckpoint?: boolean
    }) => void
  ) => () => void
  onQueueTick: (callback: (payload: QueueTickDTO) => void) => () => void
  onTaskUpdated: (callback: (task: TaskDTO) => void) => () => void
  onWakeupRecovery: (callback: (payload: WakeupRecoveryDTO) => void) => () => void
}

declare global {
  interface Window {
    fbPulseAPI: FBPulseAPI
  }
}
