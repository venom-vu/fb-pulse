import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const preventSleepWhenActive = ref<boolean>(false)
  const isPowerSaveBlocked = ref<boolean>(false)
  const isLoading = ref<boolean>(false)

  async function fetchSettings(): Promise<void> {
    if (!window.fbPulseAPI?.settings?.getPreventSleep) return
    isLoading.value = true
    try {
      const [sleepRes, powerRes] = await Promise.all([
        window.fbPulseAPI.settings.getPreventSleep(),
        window.fbPulseAPI.queue.getPowerSaveStatus()
      ])

      if (sleepRes.success && typeof sleepRes.data === 'boolean') {
        preventSleepWhenActive.value = sleepRes.data
      }

      if (powerRes.success && powerRes.data) {
        isPowerSaveBlocked.value = powerRes.data.isBlocked
      }
    } catch (err) {
      console.error('[SettingsStore] Lỗi khi tải cài đặt:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function setPreventSleep(enabled: boolean): Promise<{ success: boolean; error?: string }> {
    if (!window.fbPulseAPI?.settings?.setPreventSleep) {
      return { success: false, error: 'API không khả dụng' }
    }
    try {
      const res = await window.fbPulseAPI.settings.setPreventSleep(enabled)
      if (res.success) {
        preventSleepWhenActive.value = enabled
        const powerRes = await window.fbPulseAPI.queue.getPowerSaveStatus()
        if (powerRes.success && powerRes.data) {
          isPowerSaveBlocked.value = powerRes.data.isBlocked
        }
        return { success: true }
      }
      return { success: false, error: res.error?.message || 'Không thể cập nhật cấu hình' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi khi cập nhật cấu hình' }
    }
  }

  async function togglePreventSleep(): Promise<{ success: boolean; error?: string }> {
    return setPreventSleep(!preventSleepWhenActive.value)
  }

  return {
    preventSleepWhenActive,
    isPowerSaveBlocked,
    isLoading,
    fetchSettings,
    setPreventSleep,
    togglePreventSleep
  }
})
