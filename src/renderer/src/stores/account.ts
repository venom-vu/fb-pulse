import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  function initListeners(): () => void {
    if (!window.fbPulseAPI?.onSessionRefreshed) return () => {}
    return window.fbPulseAPI.onSessionRefreshed((updatedAccount) => {
      account.value = updatedAccount
    })
  }

  return {
    account,
    isLoading,
    isLoggingIn,
    fetchProfile,
    loginFacebook,
    initListeners
  }
})
