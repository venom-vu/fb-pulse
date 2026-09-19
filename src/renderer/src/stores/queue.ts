import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QueueTickDTO, TaskDTO, QueueFilterDTO, WakeupRecoveryDTO } from '../../../preload/types'

export const useQueueStore = defineStore('queue', () => {
  const isEmergencyPaused = ref<boolean>(false)
  const emergencyPauseReason = ref<string | null>(null)
  const emergencyPauseTimestamp = ref<string | null>(null)
  const authPausedCount = ref<number>(0)
  const scheduledCount = ref<number>(0)
  const totalCount = ref<number>(0)
  const isResuming = ref<boolean>(false)
  const showSecurityModal = ref<boolean>(false)

  // Anti-ban Jitter State (Story 4.2 & 4.3)
  const queueTick = ref<QueueTickDTO>({
    status: 'idle',
    remainingSeconds: 0,
    totalSeconds: 0,
    formattedCountdown: '00:00',
    currentTaskId: null,
    isPausing: false
  })

  // Task List & Controls (Story 4.3)
  const tasks = ref<TaskDTO[]>([])
  const filterStatus = ref<string>('all')
  const isLoadingTasks = ref<boolean>(false)
  const isPausingQueue = ref<boolean>(false)
  const isResumingQueue = ref<boolean>(false)

  // Wake-up Recovery State (Story 4.4)
  const wakeupRecovery = ref<WakeupRecoveryDTO>({
    isRecovering: false,
    overdueCount: 0,
    remainingSeconds: 0,
    totalSeconds: 0
  })

  const isJitterWaiting = computed(() => queueTick.value.status === 'jitter_waiting')
  const isQueuePaused = computed(() => queueTick.value.status === 'paused' || !!queueTick.value.isPausing)
  const isQueueRunning = computed(() => queueTick.value.status === 'running')
  const isWakeupRecovering = computed(() => wakeupRecovery.value.isRecovering)

  const filteredTasks = computed(() => {
    if (filterStatus.value === 'all') return tasks.value
    return tasks.value.filter((t) => t.status === filterStatus.value)
  })

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

  async function fetchJitterStatus(): Promise<void> {
    if (!window.fbPulseAPI?.queue?.getJitterStatus) return
    try {
      const res = await window.fbPulseAPI.queue.getJitterStatus()
      if (res.success && res.data) {
        queueTick.value = res.data
      }
    } catch (err) {
      console.error('[QueueStore] Lỗi khi lấy trạng thái Jitter:', err)
    }
  }

  async function fetchTasks(filter?: QueueFilterDTO): Promise<void> {
    if (!window.fbPulseAPI?.queue?.getTasks) return
    isLoadingTasks.value = true
    try {
      const res = await window.fbPulseAPI.queue.getTasks(filter)
      if (res.success && res.data) {
        tasks.value = res.data
      }
    } catch (err) {
      console.error('[QueueStore] Lỗi khi lấy danh sách tác vụ:', err)
    } finally {
      isLoadingTasks.value = false
    }
  }

  async function pauseQueue(): Promise<{ success: boolean; error?: string }> {
    if (!window.fbPulseAPI?.queue?.pauseQueue) {
      return { success: false, error: 'API không khả dụng' }
    }
    isPausingQueue.value = true
    try {
      const res = await window.fbPulseAPI.queue.pauseQueue()
      if (res.success) {
        await fetchJitterStatus()
        return { success: true }
      }
      return { success: false, error: res.error?.message || 'Không thể tạm dừng hàng đợi' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi khi gọi tạm dừng hàng đợi' }
    } finally {
      isPausingQueue.value = false
    }
  }

  async function resumeGeneralQueue(): Promise<{ success: boolean; error?: string }> {
    if (!window.fbPulseAPI?.queue?.resumeQueue) {
      return { success: false, error: 'API không khả dụng' }
    }
    isResumingQueue.value = true
    try {
      const res = await window.fbPulseAPI.queue.resumeQueue()
      if (res.success) {
        await fetchJitterStatus()
        await fetchTasks()
        return { success: true }
      }
      return { success: false, error: res.error?.message || 'Không thể tiếp tục hàng đợi' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi khi gọi tiếp tục hàng đợi' }
    } finally {
      isResumingQueue.value = false
    }
  }

  async function cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    if (!window.fbPulseAPI?.queue?.cancelTask) {
      return { success: false, error: 'API không khả dụng' }
    }
    try {
      const res = await window.fbPulseAPI.queue.cancelTask(taskId)
      if (res.success) {
        const idx = tasks.value.findIndex((t) => t.id === taskId)
        if (idx !== -1) {
          tasks.value[idx].status = 'cancelled'
        }
        await fetchQueueStatus()
        return { success: true }
      }
      return { success: false, error: res.error?.message || 'Không thể hủy tác vụ' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi khi gọi hủy tác vụ' }
    }
  }

  async function cancelCampaign(
    campaignId: string
  ): Promise<{ success: boolean; cancelledCount?: number; error?: string }> {
    if (!window.fbPulseAPI?.queue?.cancelCampaign) {
      return { success: false, error: 'API không khả dụng' }
    }
    try {
      const res = await window.fbPulseAPI.queue.cancelCampaign(campaignId)
      if (res.success && res.data) {
        await fetchTasks()
        await fetchQueueStatus()
        return { success: true, cancelledCount: res.data.cancelledCount }
      }
      return { success: false, error: res.error?.message || 'Không thể hủy chiến dịch' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi khi gọi hủy chiến dịch' }
    }
  }

  async function retryTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    if (!window.fbPulseAPI?.queue?.retryTask) {
      return { success: false, error: 'API không khả dụng' }
    }
    try {
      const res = await window.fbPulseAPI.queue.retryTask(taskId)
      if (res.success) {
        await fetchTasks()
        await fetchQueueStatus()
        return { success: true }
      }
      return { success: false, error: res.error?.message || 'Không thể thử lại tác vụ' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi khi gọi thử lại tác vụ' }
    }
  }

  // Khôi phục hàng đợi sau lỗi xác thực / Checkpoint (Story 1.4)
  async function resumeAuthPaused(): Promise<{ success: boolean; resumedCount?: number; error?: string }> {
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
        await fetchTasks()
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
    fetchTasks()
  }

  function openSecurityModal(): void {
    showSecurityModal.value = true
  }

  function closeSecurityModal(): void {
    showSecurityModal.value = false
  }

  function initListeners(): () => void {
    const cleanups: Array<() => void> = []

    if (window.fbPulseAPI?.onEmergencyPause) {
      const cleanupPause = window.fbPulseAPI.onEmergencyPause((payload) => {
        handleEmergencyPauseEvent(payload)
      })
      cleanups.push(cleanupPause)
    }

    if (window.fbPulseAPI?.onQueueTick) {
      const cleanupTick = window.fbPulseAPI.onQueueTick((payload) => {
        queueTick.value = payload
      })
      cleanups.push(cleanupTick)
    }

    if (window.fbPulseAPI?.onTaskUpdated) {
      const cleanupTask = window.fbPulseAPI.onTaskUpdated((task) => {
        const index = tasks.value.findIndex((t) => t.id === task.id)
        if (index !== -1) {
          tasks.value[index] = task
        } else {
          tasks.value.unshift(task)
        }
        fetchQueueStatus()
      })
      cleanups.push(cleanupTask)
    }

    if (window.fbPulseAPI?.onWakeupRecovery) {
      const cleanupWakeup = window.fbPulseAPI.onWakeupRecovery((payload) => {
        wakeupRecovery.value = payload
        if (!payload.isRecovering) {
          fetchTasks()
          fetchQueueStatus()
        }
      })
      cleanups.push(cleanupWakeup)
    }

    return () => {
      cleanups.forEach((c) => c())
    }
  }

  async function fetchWakeupStatus(): Promise<void> {
    if (!window.fbPulseAPI?.queue?.getWakeupStatus) return
    try {
      const res = await window.fbPulseAPI.queue.getWakeupStatus()
      if (res.success && res.data) {
        wakeupRecovery.value = res.data
      }
    } catch (err) {
      console.error('[QueueStore] Lỗi khi lấy trạng thái khôi phục:', err)
    }
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
    queueTick,
    tasks,
    filterStatus,
    isLoadingTasks,
    isPausingQueue,
    isResumingQueue,
    isJitterWaiting,
    isQueuePaused,
    isQueueRunning,
    isWakeupRecovering,
    wakeupRecovery,
    filteredTasks,
    fetchQueueStatus,
    fetchJitterStatus,
    fetchWakeupStatus,
    fetchTasks,
    pauseQueue,
    resumeQueue: resumeAuthPaused,
    resumeAuthPaused,
    resumeGeneralQueue,
    cancelTask,
    cancelCampaign,
    retryTask,
    handleEmergencyPauseEvent,
    openSecurityModal,
    closeSecurityModal,
    initListeners
  }
})
