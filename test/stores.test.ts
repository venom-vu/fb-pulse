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
})
