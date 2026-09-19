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
  targets: {
    list: () => ipcRenderer.invoke('targets:list'),
    syncFromFacebook: () => ipcRenderer.invoke('targets:sync-from-facebook'),
    createFolder: (name: string) => ipcRenderer.invoke('targets:create-folder', name),
    updateFolder: (folderId: string, name: string) => ipcRenderer.invoke('targets:update-folder', folderId, name),
    deleteFolder: (folderId: string) => ipcRenderer.invoke('targets:delete-folder', folderId),
    listFolders: () => ipcRenderer.invoke('targets:list-folders'),
    assignToFolder: (targetId: string, folderId: string | null) =>
      ipcRenderer.invoke('targets:assign-to-folder', targetId, folderId),
    batchAssignToFolder: (targetIds: string[], folderId: string | null) =>
      ipcRenderer.invoke('targets:batch-assign-to-folder', targetIds, folderId)
  },
  queue: {
    resumeAuthPaused: () => ipcRenderer.invoke('queue:resume-auth-paused'),
    getStatus: () => ipcRenderer.invoke('queue:get-status'),
    getJitterStatus: () => ipcRenderer.invoke('queue:get-jitter-status'),
    getTasks: (filter) => ipcRenderer.invoke('queue:get-tasks', filter),
    pauseQueue: () => ipcRenderer.invoke('queue:pause'),
    resumeQueue: () => ipcRenderer.invoke('queue:resume'),
    cancelTask: (taskId) => ipcRenderer.invoke('queue:cancel-task', taskId),
    cancelCampaign: (campaignId) => ipcRenderer.invoke('queue:cancel-campaign', campaignId),
    retryTask: (taskId) => ipcRenderer.invoke('queue:retry-task', taskId)
  },
  composer: {
    testSpintaxVariant: (template: string) => ipcRenderer.invoke('composer:test-spintax', template),
    createCampaign: (payload) => ipcRenderer.invoke('composer:create-campaign', payload),
    checkDailyLimit: (incomingTaskCount) => ipcRenderer.invoke('composer:check-daily-limit', incomingTaskCount)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray')
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
  },
  onQueueTick: (callback: (payload: any) => void) => {
    const subscription = (_event: IpcRendererEvent, payload: any): void => callback(payload)
    ipcRenderer.on('queue:tick', subscription)
    return () => {
      ipcRenderer.removeListener('queue:tick', subscription)
    }
  },
  onTaskUpdated: (callback: (task: any) => void) => {
    const subscription = (_event: IpcRendererEvent, task: any): void => callback(task)
    ipcRenderer.on('queue:task-updated', subscription)
    return () => {
      ipcRenderer.removeListener('queue:task-updated', subscription)
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
