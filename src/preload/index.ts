import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { FBPulseAPI, AccountDTO } from './types'

const api: FBPulseAPI = {
  account: {
    getProfile: () => ipcRenderer.invoke('account:get-profile'),
    loginWebView: () => ipcRenderer.invoke('account:login-webview'),
    importSessionJson: (jsonStr: string) => ipcRenderer.invoke('account:import-session-json', jsonStr),
    logout: () => ipcRenderer.invoke('account:logout'),
    checkHealth: () => ipcRenderer.invoke('account:check-health'),
    triggerEmergencyPause: (reason?: string) => ipcRenderer.invoke('account:trigger-emergency-pause', reason)
  },
  queue: {
    resumeAuthPaused: () => ipcRenderer.invoke('queue:resume-auth-paused'),
    getStatus: () => ipcRenderer.invoke('queue:get-status')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized')
  },
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info')
  },
  onSessionRefreshed: (callback: (account: AccountDTO) => void) => {
    const subscription = (_event: IpcRendererEvent, account: AccountDTO): void => callback(account)
    ipcRenderer.on('account:session-refreshed', subscription)
    return () => {
      ipcRenderer.removeListener('account:session-refreshed', subscription)
    }
  },
  onEmergencyPause: (callback: (payload: { reason: string; timestamp: string }) => void) => {
    const subscription = (_event: IpcRendererEvent, payload: { reason: string; timestamp: string }): void => callback(payload)
    ipcRenderer.on('queue:emergency-pause', subscription)
    return () => {
      ipcRenderer.removeListener('queue:emergency-pause', subscription)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('fbPulseAPI', api)
  } catch (error) {
    console.error('Failed to expose fbPulseAPI in main world:', error)
  }
} else {
  // Fallback if context isolation is disabled
  // @ts-ignore (define in dts)
  window.fbPulseAPI = api
}
