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

export interface FBPulseAPI {
  account: {
    getProfile: () => Promise<IPCResult<AccountDTO | null>>
    loginWebView: () => Promise<IPCResult<{ success: boolean }>>
    logout: () => Promise<IPCResult<void>>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
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
