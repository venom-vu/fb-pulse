import { BrowserWindow, powerSaveBlocker } from 'electron'
import { getDatabase } from '../database/connection'
import { settingsService } from './settings.service'
import type { QueueTickDTO, TaskDTO, QueueFilterDTO, WakeupRecoveryDTO } from '../../preload/types'

export class SchedulerService {
  private status: 'idle' | 'jitter_waiting' | 'running' | 'paused' = 'idle'
  private remainingSeconds = 0
  private totalSeconds = 0
  private tickInterval: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private onCompleteCallback: (() => void) | null = null

  // Single-threaded FIFO State Machine flags
  private isPausing = false
  private currentTaskId: string | null = null
  private isProcessing = false
  private taskExecutor: ((task: any) => Promise<{ success: boolean; permalink?: string; error?: string }>) | null = null

  // Wake-up Recovery & Power Management (Story 4.4)
  private wakeupRecovery: WakeupRecoveryDTO = {
    isRecovering: false,
    overdueCount: 0,
    remainingSeconds: 0,
    totalSeconds: 0
  }
  private wakeupInterval: NodeJS.Timeout | null = null
  private powerSaveBlockerId: number | null = null

  /**
   * Thiết lập BrowserWindow để phát broadcast sự kiện tick và task-updated
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * Đăng ký hàm thực thi tác vụ (dùng cho Playwright Worker ở Epic 5 hoặc Mock trong Unit Tests)
   */
  setTaskExecutor(
    executor: ((task: any) => Promise<{ success: boolean; permalink?: string; error?: string }>) | null
  ): void {
    this.taskExecutor = executor
  }

  /**
   * Tính toán khoảng thời gian trễ ngẫu nhiên Jitter (giây)
   * Ràng buộc: min >= 60, max >= min
   */
  calculateJitter(minSec = 180, maxSec = 300): number {
    const validMin = Math.max(60, Math.floor(minSec))
    const validMax = Math.max(validMin, Math.floor(maxSec))
    return Math.floor(Math.random() * (validMax - validMin + 1)) + validMin
  }

  /**
   * Định dạng số giây còn lại thành chuỗi mm:ss
   */
  formatCountdown(seconds: number): string {
    const sec = Math.max(0, Math.floor(seconds))
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /**
   * Lấy trạng thái hiện tại của bộ đếm Jitter và hàng đợi
   */
  getJitterStatus(): QueueTickDTO {
    return {
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      formattedCountdown: this.formatCountdown(this.remainingSeconds),
      currentTaskId: this.currentTaskId,
      isPausing: this.isPausing
    }
  }

  /**
   * Bắt đầu đếm ngược thời gian nghỉ Jitter giữa 2 bài đăng
   */
  startJitter(jitterSeconds: number, onComplete?: () => void): void {
    this.stopJitter()

    const validDuration = Math.max(0, Math.floor(jitterSeconds))
    this.totalSeconds = validDuration
    this.remainingSeconds = validDuration
    this.status = validDuration > 0 ? 'jitter_waiting' : 'idle'
    this.onCompleteCallback = onComplete || null

    this.broadcastTick()

    if (validDuration <= 0) {
      if (this.onCompleteCallback) {
        const cb = this.onCompleteCallback
        this.onCompleteCallback = null
        cb()
      }
      return
    }

    this.tickInterval = setInterval(() => {
      this.remainingSeconds--
      this.broadcastTick()

      if (this.remainingSeconds <= 0) {
        this.stopJitter()
        if (this.onCompleteCallback) {
          const cb = this.onCompleteCallback
          this.onCompleteCallback = null
          cb()
        }
      }
    }, 1000)
  }

  /**
   * Dừng đếm ngược Jitter hiện tại
   */
  stopJitter(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.status === 'jitter_waiting') {
      this.status = 'idle'
      this.remainingSeconds = 0
      this.broadcastTick()
    }
  }

  /**
   * Tạm dừng hàng đợi (Safe Pause)
   * - Nếu đang jitter_waiting: dừng interval, lưu remainingSeconds, chuyển sang paused
   * - Nếu đang running: đánh dấu isPausing = true để hoàn tất tác vụ hiện tại rồi mới dừng
   * - Nếu đang trong 60s cooldown của Wake-up Recovery: tạm dừng đếm ngược
   * - Nếu đang idle: chuyển sang paused
   */
  pauseQueue(): void {
    if (this.wakeupRecovery.isRecovering && this.wakeupInterval) {
      clearInterval(this.wakeupInterval)
      this.wakeupInterval = null
    }

    if (this.status === 'jitter_waiting') {
      if (this.tickInterval) {
        clearInterval(this.tickInterval)
        this.tickInterval = null
      }
      this.status = 'paused'
      this.broadcastTick()
    } else if (this.status === 'running') {
      this.isPausing = true
      this.broadcastTick()
    } else {
      this.status = 'paused'
      this.broadcastTick()
    }

    this.updatePowerSaveBlocker()
  }

  /**
   * Tiếp tục hàng đợi (Resume)
   * - Nếu trước đó tạm dừng khi Jitter và còn remainingSeconds: tiếp tục đếm ngược
   * - Nếu trước đó tạm dừng trong 60s cooldown của Wake-up Recovery: tiếp tục đếm cooldown
   * - Nếu không: chuyển sang idle và bốc tác vụ kế tiếp theo FIFO
   */
  resumeQueue(): void {
    this.isPausing = false
    if (this.status === 'paused') {
      if (this.wakeupRecovery.isRecovering && this.wakeupRecovery.remainingSeconds > 0) {
        this.status = 'idle'
        this.broadcastTick()
        this.wakeupInterval = setInterval(() => {
          this.wakeupRecovery.remainingSeconds--
          this.broadcastWakeupRecovery()

          if (this.wakeupRecovery.remainingSeconds <= 0) {
            this.stopWakeupRecovery()
            this.triggerQueueLoop()
          }
        }, 1000)
      } else if (this.remainingSeconds > 0) {
        this.status = 'jitter_waiting'
        this.broadcastTick()
        this.tickInterval = setInterval(() => {
          this.remainingSeconds--
          this.broadcastTick()

          if (this.remainingSeconds <= 0) {
            this.stopJitter()
            if (this.onCompleteCallback) {
              const cb = this.onCompleteCallback
              this.onCompleteCallback = null
              cb()
            }
          }
        }, 1000)
      } else {
        this.status = 'idle'
        this.broadcastTick()
        this.triggerQueueLoop()
      }
    }

    this.updatePowerSaveBlocker()
  }

  /**
   * Hủy một tác vụ cụ thể
   */
  cancelTask(taskId: string): void {
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId) as any
    if (!task) {
      throw new Error('Không tìm thấy tác vụ')
    }
    if (task.status === 'running' && this.currentTaskId === taskId) {
      throw new Error('Không thể hủy tác vụ đang trong tiến trình chạy')
    }

    if (['scheduled', 'paused', 'retrying', 'jitter_waiting'].includes(task.status)) {
      db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(taskId)

      const updated = this.getTaskById(taskId)
      if (updated) {
        this.broadcastTaskUpdated(updated)
      }
    }
  }

  /**
   * Hủy toàn bộ tác vụ của một chiến dịch
   */
  cancelCampaign(campaignId: string): { cancelledCount: number } {
    const db = getDatabase()
    const stmt = db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE campaign_id = ? AND status IN ('scheduled', 'paused', 'retrying')
    `)
    const result = stmt.run(campaignId)

    const tasks = db
      .prepare("SELECT * FROM scheduled_tasks WHERE campaign_id = ? AND status = 'cancelled'")
      .all(campaignId) as any[]

    for (const t of tasks) {
      const full = this.getTaskById(t.id)
      if (full) this.broadcastTaskUpdated(full)
    }

    return { cancelledCount: result.changes }
  }

  /**
   * Thử lại một tác vụ bị thất bại
   */
  retryTask(taskId: string): void {
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId) as any
    if (!task) {
      throw new Error('Không tìm thấy tác vụ')
    }
    if (task.status !== 'failed') {
      throw new Error('Chỉ có thể thử lại các tác vụ thất bại')
    }

    db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'scheduled', retry_count = retry_count + 1, error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(taskId)

    const updated = this.getTaskById(taskId)
    if (updated) {
      this.broadcastTaskUpdated(updated)
    }

    this.updatePowerSaveBlocker()

    if (this.status === 'idle') {
      this.triggerQueueLoop()
    }
  }

  /**
   * Lấy danh sách tác vụ theo bộ lọc
   */
  getTasks(filter?: QueueFilterDTO): TaskDTO[] {
    const db = getDatabase()
    let query = `
      SELECT 
        t.id, t.campaign_id, c.title as campaign_title,
        t.account_id, t.target_id, tg.name as target_name, tg.type as target_type, tg.avatar_url as target_avatar_url,
        t.resolved_spintax_text, t.media_paths, t.idempotency_key,
        t.status, t.retry_count, t.scheduled_at, t.executed_at,
        t.permalink, t.error_code, t.error_message, t.screenshot_path,
        t.created_at, t.updated_at
      FROM scheduled_tasks t
      LEFT JOIN campaigns c ON t.campaign_id = c.id
      LEFT JOIN targets tg ON t.target_id = tg.id
      WHERE 1=1
    `
    const params: any[] = []

    if (filter?.status && filter.status !== 'all') {
      query += ` AND t.status = ?`
      params.push(filter.status)
    }

    if (filter?.campaignId) {
      query += ` AND t.campaign_id = ?`
      params.push(filter.campaignId)
    }

    query += ` ORDER BY datetime(t.scheduled_at) ASC, datetime(t.created_at) ASC`

    if (filter?.limit) {
      query += ` LIMIT ?`
      params.push(filter.limit)
      if (filter?.offset) {
        query += ` OFFSET ?`
        params.push(filter.offset)
      }
    }

    const rows = db.prepare(query).all(...params) as any[]
    return rows.map((r) => ({
      ...r,
      media_paths: (() => {
        try {
          return JSON.parse(r.media_paths || '[]')
        } catch {
          return []
        }
      })()
    }))
  }

  /**
   * Lấy chi tiết một tác vụ theo ID
   */
  getTaskById(taskId: string): TaskDTO | null {
    const list = this.getTasks()
    return list.find((t) => t.id === taskId) || null
  }

  /**
   * Kích hoạt vòng lặp xử lý hàng đợi đơn luồng FIFO
   */
  triggerQueueLoop(): void {
    if (
      this.status === 'paused' ||
      this.isPausing ||
      this.isProcessing ||
      this.status === 'jitter_waiting' ||
      this.wakeupRecovery.isRecovering
    ) {
      return
    }
    this.processNextTask()
  }

  /**
   * Xử lý tác vụ tiếp theo trong hàng đợi theo thứ tự FIFO
   */
  async processNextTask(): Promise<void> {
    if (
      this.status === 'paused' ||
      this.isPausing ||
      this.isProcessing ||
      this.status === 'jitter_waiting' ||
      this.wakeupRecovery.isRecovering
    ) {
      return
    }

    const db = getDatabase()
    const nextTask = db
      .prepare(`
        SELECT t.*, c.min_jitter_sec, c.max_jitter_sec
        FROM scheduled_tasks t
        LEFT JOIN campaigns c ON t.campaign_id = c.id
        WHERE t.status = 'scheduled'
          AND datetime(t.scheduled_at) <= datetime('now')
        ORDER BY datetime(t.scheduled_at) ASC, datetime(t.created_at) ASC
        LIMIT 1
      `)
      .get() as any

    if (!nextTask) {
      if (this.status === 'running') {
        this.status = 'idle'
        this.currentTaskId = null
        this.broadcastTick()
      }
      return
    }

    this.isProcessing = true
    this.status = 'running'
    this.currentTaskId = nextTask.id
    this.broadcastTick()

    db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'running', executed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextTask.id)

    const runningTask = this.getTaskById(nextTask.id)
    if (runningTask) {
      this.broadcastTaskUpdated(runningTask)
    }

    let success = false
    let permalink: string | undefined
    let errorMessage: string | undefined

    try {
      if (this.taskExecutor) {
        const res = await this.taskExecutor(nextTask)
        success = res.success
        permalink = res.permalink
        errorMessage = res.error
      } else {
        // Mặc định cho giai đoạn Story 4.3 (khi chưa nối Playwright worker ở Epic 5)
        success = true
      }
    } catch (err: any) {
      success = false
      errorMessage = err?.message || 'Lỗi thực thi tác vụ'
    }

    const finalStatus = success ? 'success' : 'failed'
    db.prepare(`
      UPDATE scheduled_tasks
      SET status = ?, permalink = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalStatus, permalink || null, errorMessage || null, nextTask.id)

    const completedTask = this.getTaskById(nextTask.id)
    if (completedTask) {
      this.broadcastTaskUpdated(completedTask)
    }

    this.currentTaskId = null
    this.isProcessing = false

    // Kiểm tra cờ isPausing (nếu người dùng bấm tạm dừng trong lúc tác vụ đang chạy)
    if (this.isPausing) {
      this.isPausing = false
      this.status = 'paused'
      this.broadcastTick()
      return
    }

    // Kiểm tra xem còn tác vụ scheduled nào không
    const remainingCountRow = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM scheduled_tasks
        WHERE status = 'scheduled'
      `)
      .get() as { count: number } | undefined

    if (remainingCountRow && remainingCountRow.count > 0) {
      // Kiểm tra xem có tác vụ quá hạn cần áp dụng dải Jitter an toàn (3–7 phút = 180s–420s) không
      const overdueRow = db
        .prepare(`
          SELECT COUNT(*) as count
          FROM scheduled_tasks
          WHERE status = 'scheduled'
            AND datetime(scheduled_at) <= datetime('now')
        `)
        .get() as { count: number } | undefined

      const hasOverdue = (overdueRow?.count || 0) > 0
      const minJitter = hasOverdue ? Math.max(180, nextTask.min_jitter_sec || 180) : nextTask.min_jitter_sec || 180
      const maxJitter = hasOverdue ? Math.max(420, nextTask.max_jitter_sec || 300) : nextTask.max_jitter_sec || 300
      const jitterSec = this.calculateJitter(minJitter, maxJitter)

      this.startJitter(jitterSec, () => {
        this.triggerQueueLoop()
      })
    } else {
      this.status = 'idle'
      this.broadcastTick()
    }

    this.updatePowerSaveBlocker()
  }

  /**
   * Reset trạng thái phục vụ cho unit testing
   */
  resetForTesting(): void {
    this.stopJitter()
    this.stopWakeupRecovery()
    this.status = 'idle'
    this.remainingSeconds = 0
    this.totalSeconds = 0
    this.isPausing = false
    this.currentTaskId = null
    this.isProcessing = false
    this.taskExecutor = null
    this.onCompleteCallback = null

    if (this.powerSaveBlockerId !== null) {
      try {
        if (typeof powerSaveBlocker !== 'undefined' && powerSaveBlocker?.isStarted?.(this.powerSaveBlockerId)) {
          powerSaveBlocker.stop(this.powerSaveBlockerId)
        }
      } catch {}
      this.powerSaveBlockerId = null
    }
  }

  /**
   * Lấy trạng thái hiện tại của Wake-up Recovery
   */
  getWakeupStatus(): WakeupRecoveryDTO {
    return { ...this.wakeupRecovery }
  }

  /**
   * Xử lý sự kiện máy tính thức dậy từ OS (powerMonitor.on('resume'))
   */
  handleSystemResume(): void {
    const db = getDatabase()
    const overdueRow = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM scheduled_tasks
        WHERE status = 'scheduled'
          AND datetime(scheduled_at) <= datetime('now')
      `)
      .get() as { count: number } | undefined

    const overdueCount = overdueRow?.count || 0
    if (overdueCount > 0) {
      // Dừng sạch sẽ timer Jitter cũ trước đó
      this.stopJitter()

      // Khởi tạo trạng thái 60s cooldown ổn định mạng
      this.wakeupRecovery = {
        isRecovering: true,
        overdueCount,
        remainingSeconds: 60,
        totalSeconds: 60
      }
      this.broadcastWakeupRecovery()

      if (this.wakeupInterval) {
        clearInterval(this.wakeupInterval)
        this.wakeupInterval = null
      }

      this.wakeupInterval = setInterval(() => {
        this.wakeupRecovery.remainingSeconds--
        this.broadcastWakeupRecovery()

        if (this.wakeupRecovery.remainingSeconds <= 0) {
          this.stopWakeupRecovery()
          // Sau khoảng nghỉ 60s, các bài trễ được đưa vào hàng đợi đăng bù tuần tự kèm Jitter an toàn
          this.triggerQueueLoop()
        }
      }, 1000)
    }

    this.updatePowerSaveBlocker()
  }

  /**
   * Dừng chế độ Wake-up Recovery
   */
  stopWakeupRecovery(): void {
    if (this.wakeupInterval) {
      clearInterval(this.wakeupInterval)
      this.wakeupInterval = null
    }
    this.wakeupRecovery = {
      isRecovering: false,
      overdueCount: 0,
      remainingSeconds: 0,
      totalSeconds: 0
    }
    this.broadcastWakeupRecovery()
  }

  /**
   * Cập nhật trạng thái Electron powerSaveBlocker dựa trên cài đặt và hàng đợi
   */
  updatePowerSaveBlocker(): void {
    try {
      if (typeof powerSaveBlocker === 'undefined' || !powerSaveBlocker) {
        return
      }

      const isEnabled = settingsService.getPreventSleepWhenActive()
      const db = getDatabase()
      const activeTasksRow = db
        .prepare(`
          SELECT COUNT(*) as count
          FROM scheduled_tasks
          WHERE status IN ('scheduled', 'running', 'jitter_waiting')
        `)
        .get() as { count: number } | undefined

      const hasActiveTasks = (activeTasksRow?.count || 0) > 0
      const shouldBlock = isEnabled && hasActiveTasks && this.status !== 'paused'

      if (shouldBlock) {
        if (this.powerSaveBlockerId === null || !powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
          this.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
        }
      } else {
        if (this.powerSaveBlockerId !== null && powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
          powerSaveBlocker.stop(this.powerSaveBlockerId)
          this.powerSaveBlockerId = null
        }
      }
    } catch (err) {
      console.error('[SchedulerService] Lỗi khi cập nhật powerSaveBlocker:', err)
    }
  }

  /**
   * Lấy trạng thái hoạt động của PowerSaveBlocker
   */
  getPowerSaveStatus(): { isBlocked: boolean; isEnabled: boolean } {
    let isBlocked = false
    try {
      if (typeof powerSaveBlocker !== 'undefined' && powerSaveBlocker && this.powerSaveBlockerId !== null) {
        isBlocked = powerSaveBlocker.isStarted(this.powerSaveBlockerId)
      }
    } catch {}

    return {
      isBlocked,
      isEnabled: settingsService.getPreventSleepWhenActive()
    }
  }

  /**
   * Phát broadcast sự kiện Wake-up Recovery tới Renderer Process qua IPC
   */
  private broadcastWakeupRecovery(): void {
    const payload = this.getWakeupStatus()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('queue:wakeup-recovery', payload)
    }
  }

  /**
   * Gửi sự kiện tick tới Renderer Process qua IPC
   */
  private broadcastTick(): void {
    const payload = this.getJitterStatus()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('queue:tick', payload)
    }
  }

  /**
   * Gửi sự kiện cập nhật tác vụ tới Renderer Process qua IPC
   */
  private broadcastTaskUpdated(task: TaskDTO): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('queue:task-updated', task)
    }
  }
}

export const schedulerService = new SchedulerService()
