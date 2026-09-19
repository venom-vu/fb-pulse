import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useQueueStore = defineStore('queue', () => {
  const isEmergencyPaused = ref<boolean>(false)
  const emergencyPauseReason = ref<string | null>(null)
  const emergencyPauseTimestamp = ref<string | null>(null)
  const authPausedCount = ref<number>(0)
  const scheduledCount = ref<number>(0)
  const totalCount = ref<number>(0)
  const isResuming = ref<boolean>(false)
  const showSecurityModal = ref<boolean>(false)

  async function fetchQueueStatus(): Promise<void> {
    if (!window.fbPulseAPI?.queue?.getStatus) return
    try {
      const res = await window.fbPulseAPI.queue.getStatus()
      if (res.success && res.data) {
        scheduledCount.value = res.data.scheduledCount
        authPausedCount.value = res.data.authPausedCount
        totalCount.value = res.data.totalCount
        if (authPausedCount.value > 0) {
          isEmergencyPaused.value = true
        } else {
          isEmergencyPaused.value = false
        }
      }
    } catch (err) {
      console.error('[QueueStore] Lỗi khi lấy trạng thái hàng đợi:', err)
    }
  }

  async function resumeQueue(): Promise<{ success: boolean; resumedCount?: number; error?: string }> {
    if (!window.fbPulseAPI?.queue?.resumeAuthPaused) {
      return { success: false, error: 'API không khả dụng' }
    }
    isResuming.value = true
    try {
      const res = await window.fbPulseAPI.queue.resumeAuthPaused()
      if (res.success && res.data) {
        isEmergencyPaused.value = false
        emergencyPauseReason.value = null
        await fetchQueueStatus()
        return { success: true, resumedCount: res.data.resumedCount }
      }
      return {
        success: false,
        error: res.error?.message || 'Không thể tiếp tục hàng đợi'
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Lỗi khi kích hoạt khôi phục hàng đợi'
      }
    } finally {
      isResuming.value = false
    }
  }

  function handleEmergencyPauseEvent(payload: { reason: string; timestamp: string }): void {
    isEmergencyPaused.value = true
    emergencyPauseReason.value = payload.reason
    emergencyPauseTimestamp.value = payload.timestamp
    showSecurityModal.value = true
    fetchQueueStatus()
  }

  function openSecurityModal(): void {
    showSecurityModal.value = true
  }

  function closeSecurityModal(): void {
    showSecurityModal.value = false
  }

  function initListeners(): () => void {
    if (!window.fbPulseAPI?.onEmergencyPause) return () => {}
    return window.fbPulseAPI.onEmergencyPause((payload) => {
      handleEmergencyPauseEvent(payload)
    })
  }

  return {
    isEmergencyPaused,
    emergencyPauseReason,
    emergencyPauseTimestamp,
    authPausedCount,
    scheduledCount,
    totalCount,
    isResuming,
    showSecurityModal,
    fetchQueueStatus,
    resumeQueue,
    handleEmergencyPauseEvent,
    openSecurityModal,
    closeSecurityModal,
    initListeners
  }
})
