import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNavigationStore } from '../src/renderer/src/stores/navigation'
import { useAccountStore } from '../src/renderer/src/stores/account'

describe('Pinia Stores & Navigation Matrix Verification', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Navigation Store (Matrix Row 4): default activeTab is composer and transitions correctly', () => {
    const nav = useNavigationStore()
    expect(nav.activeTab).toBe('composer')

    nav.setActiveTab('queue')
    expect(nav.activeTab).toBe('queue')

    nav.setActiveTab('targets')
    expect(nav.activeTab).toBe('targets')

    nav.setActiveTab('settings')
    expect(nav.activeTab).toBe('settings')
  })

  it('Account Store (Matrix Row 3): initial state is null and handles null gracefully', async () => {
    const accountStore = useAccountStore()
    expect(accountStore.account).toBeNull()
    expect(accountStore.isLoading).toBe(false)

    // Mock window.fbPulseAPI returning null (Chưa kết nối tài khoản Facebook)
    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({ success: true, data: null })
        }
      }
    }

    await accountStore.fetchProfile()
    expect(accountStore.account).toBeNull()
    expect(accountStore.isLoading).toBe(false)
  })

  it('Account Store: updates account when profile is returned', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({
            success: true,
            data: {
              id: 'acc-1',
              fb_user_id: '123456789',
              name: 'John Doe',
              avatar_url: 'https://example.com/avatar.jpg',
              status: 'connected',
              status_reason: null,
              last_synced_at: new Date().toISOString()
            }
          })
        }
      }
    }

    await accountStore.fetchProfile()
    expect(accountStore.account).not.toBeNull()
    expect(accountStore.account?.name).toBe('John Doe')
    expect(accountStore.account?.status).toBe('connected')
  })

  it('Account Store: handles loginFacebook when cancelled by user', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({ success: true, data: null }),
          loginWebView: async () => ({
            success: true,
            data: { success: false, cancelled: true }
          })
        }
      }
    }

    const res = await accountStore.loginFacebook()
    expect(res.success).toBe(false)
    expect(res.cancelled).toBe(true)
    expect(accountStore.isLoggingIn).toBe(false)
    expect(accountStore.account).toBeNull()
  })

  it('Account Store: handles loginFacebook when successful', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({
            success: true,
            data: {
              id: 'primary_account',
              fb_user_id: '100088192837162',
              name: 'Facebook User (100088192837162)',
              avatar_url: null,
              status: 'connected',
              status_reason: null,
              last_synced_at: new Date().toISOString()
            }
          }),
          loginWebView: async () => ({
            success: true,
            data: { success: true, userId: '100088192837162' }
          })
        }
      }
    }

    const res = await accountStore.loginFacebook()
    expect(res.success).toBe(true)
    expect(res.userId).toBe('100088192837162')
    expect(accountStore.isLoggingIn).toBe(false)
    expect(accountStore.account).not.toBeNull()
    expect(accountStore.account?.fb_user_id).toBe('100088192837162')
  })

  it('Account Store (Story 1.3): handles importSessionJson successfully and updates store', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          importSessionJson: async (json: string) => ({
            success: true,
            data: {
              id: 'primary_account',
              fb_user_id: '100099887766554',
              name: 'Imported FB User',
              avatar_url: null,
              status: 'connected',
              status_reason: null,
              last_synced_at: new Date().toISOString()
            }
          })
        }
      }
    }

    const res = await accountStore.importSessionJson('mock_json')
    expect(res.success).toBe(true)
    expect(accountStore.account).not.toBeNull()
    expect(accountStore.account?.fb_user_id).toBe('100099887766554')
    expect(accountStore.account?.status).toBe('connected')
    expect(accountStore.isLoading).toBe(false)
  })

  it('Account Store (Story 1.3): handles logout and clears account in store', async () => {
    const accountStore = useAccountStore()

    // Set an initial account
    accountStore.account = {
      id: 'primary_account',
      fb_user_id: '100099887766554',
      name: 'Imported FB User',
      avatar_url: null,
      status: 'connected',
      status_reason: null,
      last_synced_at: new Date().toISOString()
    }

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          logout: async () => ({ success: true, data: undefined })
        }
      }
    }

    const success = await accountStore.logout()
    expect(success).toBe(true)
    expect(accountStore.account).toBeNull()
    expect(accountStore.isLoading).toBe(false)
  })

  it('Account Store (Story 1.4): detects isCheckpointRequired and runs checkHealth', async () => {
    const accountStore = useAccountStore()

    accountStore.account = {
      id: 'primary_account',
      fb_user_id: '100099887766554',
      name: 'Checkpoint User',
      avatar_url: null,
      status: 'checkpoint_required',
      status_reason: 'Facebook yêu cầu Checkpoint',
      last_synced_at: new Date().toISOString()
    }

    expect(accountStore.isCheckpointRequired).toBe(true)

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          checkHealth: async () => ({
            success: true,
            data: { valid: false, reason: 'Yêu cầu xác thực', isCheckpoint: true }
          }),
          getProfile: async () => ({
            success: true,
            data: accountStore.account
          })
        }
      }
    }

    const health = await accountStore.checkHealth()
    expect(health.valid).toBe(false)
    expect(health.reason).toBe('Yêu cầu xác thực')
  })

  it('Queue Store (Story 1.4): manages emergency pause, fetch status, and resume', async () => {
    const { useQueueStore } = await import('../src/renderer/src/stores/queue')
    const queueStore = useQueueStore()

    expect(queueStore.isEmergencyPaused).toBe(false)
    expect(queueStore.authPausedCount).toBe(0)

    let authPaused = 3
    let scheduled = 0

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        queue: {
          getStatus: async () => ({
            success: true,
            data: { scheduledCount: scheduled, authPausedCount: authPaused, totalCount: 5 }
          }),
          resumeAuthPaused: async () => {
            authPaused = 0
            scheduled = 3
            return {
              success: true,
              data: { resumedCount: 3 }
            }
          }
        }
      }
    }

    await queueStore.fetchQueueStatus()
    expect(queueStore.authPausedCount).toBe(3)
    expect(queueStore.totalCount).toBe(5)
    expect(queueStore.isEmergencyPaused).toBe(true)

    // Test handleEmergencyPauseEvent
    queueStore.handleEmergencyPauseEvent({
      reason: 'Đổi mật khẩu từ xa',
      timestamp: '2026-09-19T11:00:00Z'
    })
    expect(queueStore.isEmergencyPaused).toBe(true)
    expect(queueStore.emergencyPauseReason).toBe('Đổi mật khẩu từ xa')
    expect(queueStore.showSecurityModal).toBe(true)

    // Test resume
    const res = await queueStore.resumeQueue()
    expect(res.success).toBe(true)
    expect(res.resumedCount).toBe(3)
    expect(queueStore.isEmergencyPaused).toBe(false)
  })
})

