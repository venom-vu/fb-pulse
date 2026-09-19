import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AccountDTO } from '../../../preload/types'

export const useAccountStore = defineStore('account', () => {
  const account = ref<AccountDTO | null>(null)
  const isLoading = ref<boolean>(false)

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

  function initListeners(): () => void {
    if (!window.fbPulseAPI?.onSessionRefreshed) return () => {}
    return window.fbPulseAPI.onSessionRefreshed((updatedAccount) => {
      account.value = updatedAccount
    })
  }

  return {
    account,
    isLoading,
    fetchProfile,
    initListeners
  }
})
