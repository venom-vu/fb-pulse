import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AccountDTO } from '../../../preload/types'

export const useAccountStore = defineStore('account', () => {
  const account = ref<AccountDTO | null>(null)
  const isLoading = ref<boolean>(false)
  const isLoggingIn = ref<boolean>(false)

  async function fetchProfile(): Promise<void> {
    if (!window.fbPulseAPI?.account) return
    isLoading.value = true
    try {
      const res = await window.fbPulseAPI.account.getProfile()
      if (res.success && res.data) {
        account.value = res.data
      } else {
        account.value = null
      }
    } catch (err) {
      console.error('[AccountStore] Error fetching profile:', err)
      account.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function loginFacebook(): Promise<{ success: boolean; cancelled?: boolean; userId?: string }> {
    if (!window.fbPulseAPI?.account) return { success: false }
    isLoggingIn.value = true
    try {
      const res = await window.fbPulseAPI.account.loginWebView()
      if (res.success && res.data) {
        if (res.data.success) {
          await fetchProfile()
        }
        return res.data
      }
      return { success: false }
    } catch (err) {
      console.error('[AccountStore] Error during login:', err)
      return { success: false }
    } finally {
      isLoggingIn.value = false
    }
  }

  async function importSessionJson(jsonStr: string): Promise<{ success: boolean; error?: string }> {
    if (!window.fbPulseAPI?.account) {
      return { success: false, error: 'API không khả dụng' }
    }
    isLoading.value = true
    try {
      const res = await window.fbPulseAPI.account.importSessionJson(jsonStr)
      if (res.success && res.data) {
        account.value = res.data
        return { success: true }
      }
      return {
        success: false,
        error: res.error?.message || 'Không thể nhập Cookie JSON'
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Lỗi không xác định khi nhập session'
      }
    } finally {
      isLoading.value = false
    }
  }

  async function logout(): Promise<boolean> {
    if (!window.fbPulseAPI?.account) return false
    isLoading.value = true
    try {
      const res = await window.fbPulseAPI.account.logout()
      if (res.success) {
        account.value = null
        return true
      }
      return false
    } catch (err) {
      console.error('[AccountStore] Error logging out:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const isCheckpointRequired = computed(() => account.value?.status === 'checkpoint_required')

  async function checkHealth(): Promise<{ valid: boolean; reason?: string }> {
    if (!window.fbPulseAPI?.account?.checkHealth) return { valid: true }
    try {
      const res = await window.fbPulseAPI.account.checkHealth()
      if (res.success && res.data) {
        if (!res.data.valid) {
          await fetchProfile()
        }
        return res.data
      }
      return { valid: false, reason: res.error?.message }
    } catch (err: any) {
      return { valid: false, reason: err?.message }
    }
  }

  function initListeners(): () => void {
    if (!window.fbPulseAPI?.onSessionRefreshed) return () => {}
    return window.fbPulseAPI.onSessionRefreshed((updatedAccount) => {
      account.value = updatedAccount
    })
  }

  async function refreshProfile(): Promise<void> {
    if (!window.fbPulseAPI?.account?.refreshProfile) return
    try {
      const res = await window.fbPulseAPI.account.refreshProfile()
      if (res.success && res.data) {
        account.value = res.data
      }
    } catch (err) {
      console.error('[AccountStore] Error refreshing profile:', err)
    }
  }

  return {
    account,
    isLoading,
    isLoggingIn,
    isCheckpointRequired,
    checkHealth,
    fetchProfile,
    loginFacebook,
    importSessionJson,
    logout,
    initListeners,
    refreshProfile
  }
})

