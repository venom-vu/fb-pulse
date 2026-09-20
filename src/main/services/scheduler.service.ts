import { BrowserWindow, powerSaveBlocker, Notification } from 'electron'
import { getDatabase } from '../database/connection'
import { settingsService } from './settings.service'
import { sessionService } from './session.service'
import { workerManager } from './worker-manager'
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
  private taskExecutor:
    | ((task: any) => Promise<{
        success: boolean
        status?: 'success' | 'admin_pending' | 'failed'
        permalink?: string
        errorCode?: string
        error?: string
        screenshotPath?: string
        isCheckpoint?: boolean
      }>)
    | null = null
  private futureCheckTimer: NodeJS.Timeout | null = null

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
    executor:
      | ((task: any) => Promise<{
          success: boolean
          status?: 'success' | 'admin_pending' | 'failed'
          permalink?: string
          errorCode?: string
          error?: string
          screenshotPath?: string
          isCheckpoint?: boolean
        }>)
      | null
  ): void {
    this.taskExecutor = executor
  }

  /**
   * Lên lịch kiểm tra lại hàng đợi cho các tác vụ hẹn giờ ở tương lai
   */
  scheduleNextQueueCheck(delayMs: number): void {
    if (this.futureCheckTimer) {
      clearTimeout(this.futureCheckTimer)
      this.futureCheckTimer = null
    }
    const safeDelay = Math.max(1000, Math.floor(delayMs))
    this.futureCheckTimer = setTimeout(() => {
      this.futureCheckTimer = null
      this.triggerQueueLoop()
    }, safeDelay)
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
        WHERE (t.status = 'scheduled' OR t.status = 'retrying')
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

      // Kiểm tra xem có tác vụ hẹn giờ hoặc đang thử lại trong tương lai không
      const futureTask = db
        .prepare(`
          SELECT scheduled_at
          FROM scheduled_tasks
          WHERE status IN ('scheduled', 'retrying')
          ORDER BY datetime(scheduled_at) ASC
          LIMIT 1
        `)
        .get() as { scheduled_at: string } | undefined

      if (futureTask) {
        const futureMs = new Date(futureTask.scheduled_at).getTime() - Date.now()
        if (futureMs > 0) {
          this.scheduleNextQueueCheck(futureMs)
        }
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
    let taskStatus: 'success' | 'admin_pending' | 'failed' = 'failed'
    let permalink: string | undefined
    let errorCode: string | undefined
    let errorMessage: string | undefined
    let screenshotPath: string | undefined

    let isCheckpoint = false

    try {
      if (this.taskExecutor) {
        const res = await this.taskExecutor(nextTask)
        success = res.success
        taskStatus = res.status || (res.success ? 'success' : 'failed')
        permalink = res.permalink
        errorCode = res.errorCode
        errorMessage = res.error
        screenshotPath = res.screenshotPath
        isCheckpoint = !!res.isCheckpoint || errorCode === 'CHECKPOINT_DETECTED'
      } else {
        // Thực thi qua Electron utilityProcess Worker độc lập (Story 5.1 / AD-1)
        const res = await workerManager.executeTask(nextTask)
        success = res.success
        taskStatus = res.status || (res.success ? 'success' : 'failed')
        permalink = res.permalink
        errorCode = res.errorCode
        errorMessage = res.error
        screenshotPath = res.screenshotPath
        isCheckpoint = !!res.isCheckpoint || errorCode === 'CHECKPOINT_DETECTED'
      }
    } catch (err: any) {
      success = false
      taskStatus = 'failed'
      errorMessage = err?.message || 'Lỗi thực thi tác vụ'
      errorCode = 'EXECUTION_ERROR'
    }

    if (isCheckpoint || errorCode === 'CHECKPOINT_DETECTED') {
      // 0. Phát hiện Checkpoint hoặc chặn tính năng: Kích hoạt ngắt khẩn cấp ngay lập tức (Story 5.3)
      console.warn(`[SchedulerService] Phát hiện Checkpoint/chặn tính năng ở tác vụ ${nextTask.id}! Kích hoạt Emergency Pause.`)

      db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'failed',
            error_code = 'CHECKPOINT_DETECTED',
            error_message = ?,
            screenshot_path = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run('[Failed - Checkpoint Detected]', screenshotPath || null, nextTask.id)

      const failedTask = this.getTaskById(nextTask.id)
      if (failedTask) {
        this.broadcastTaskUpdated(failedTask)
      }

      this.currentTaskId = null
      this.isProcessing = false
      this.pauseQueue()
      this.status = 'paused'
      this.broadcastTick()

      // Kích hoạt Emergency Pause qua SessionService (chuyển các bài còn lại sang paused [Paused - Auth Required] và phát IPC)
      try {
        await sessionService.triggerEmergencyPause(
          errorMessage || 'Facebook yêu cầu xác minh bảo mật (Checkpoint)',
          this.mainWindow,
          screenshotPath
        )
      } catch (pauseErr) {
        console.error('[SchedulerService] Lỗi khi kích hoạt triggerEmergencyPause:', pauseErr)
      }

      // Gửi Native Desktop Notification khẩn cấp
      try {
        if (typeof Notification !== 'undefined' && Notification.isSupported()) {
          new Notification({
            title: 'fb-pulse: CẢNH BÁO CHECKPOINT KHẨN CẤP',
            body: 'Facebook yêu cầu xác minh bảo mật (Checkpoint). Toàn bộ hàng đợi đã được dừng khẩn cấp để bảo vệ tài khoản!'
          }).show()
        }
      } catch (notifErr) {
        console.warn('[SchedulerService] Không thể gửi Desktop Notification:', notifErr)
      }

      return
    }

    if (taskStatus === 'admin_pending') {
      // 1. Facebook yêu cầu duyệt: Gán trạng thái admin_pending [Admin Approval Pending]
      db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'admin_pending', permalink = ?, error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(permalink || null, nextTask.id)
    } else if (success || taskStatus === 'success') {
      // 2. Đăng công khai thành công trực tiếp [Success]
      db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'success', permalink = ?, error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(permalink || null, nextTask.id)
    } else {
      // 3. Thất bại: Kiểm tra cơ chế tự động thử lại đa tầng (Multi-tier Non-blocking Retry)
      const currentRetryCount = nextTask.retry_count || 0
      const isRetryable =
        errorCode === 'NETWORK_TIMEOUT' ||
        errorCode === 'DOM_TIMEOUT' ||
        (errorMessage &&
          (errorMessage.toLowerCase().includes('timeout') ||
            errorMessage.toLowerCase().includes('network') ||
            errorMessage.toLowerCase().includes('element_not_found')))

      if (isRetryable && currentRetryCount < 2) {
        const nextRetryCount = currentRetryCount + 1
        // Lần 1 sau 3 phút (180s), Lần 2 sau 5 phút (300s)
        const delayMinutes = nextRetryCount === 1 ? 3 : 5
        const delaySeconds = delayMinutes * 60
        const nextScheduledDate = new Date(Date.now() + delaySeconds * 1000).toISOString()

        console.log(
          `[SchedulerService] Tác vụ ${nextTask.id} gặp sự cố (${errorCode || 'TIMEOUT'}), thử lại lần ${nextRetryCount}/2 sau ${delayMinutes} phút`
        )

        db.prepare(`
          UPDATE scheduled_tasks
          SET status = 'retrying',
              retry_count = ?,
              scheduled_at = ?,
              error_code = ?,
              error_message = ?,
              screenshot_path = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          nextRetryCount,
          nextScheduledDate,
          errorCode || 'TIMEOUT',
          errorMessage || `Đang thử lại (lần ${nextRetryCount}/2)`,
          screenshotPath || null,
          nextTask.id
        )

        this.scheduleNextQueueCheck(delaySeconds * 1000)
      } else {
        // Sau 2 lần thử lại vẫn thất bại hoặc lỗi không thể thử lại
        const finalErrorCode = isRetryable ? 'NETWORK_TIMEOUT' : errorCode || 'EXECUTION_FAILED'
        const finalErrorMessage = isRetryable ? '[Failed - Network Timeout]' : errorMessage || 'Lỗi thực thi tác vụ'

        console.log(`[SchedulerService] Tác vụ ${nextTask.id} thất bại hoàn toàn: ${finalErrorMessage}`)

        db.prepare(`
          UPDATE scheduled_tasks
          SET status = 'failed',
              error_code = ?,
              error_message = ?,
              screenshot_path = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(finalErrorCode, finalErrorMessage, screenshotPath || null, nextTask.id)

        // Gửi Native Desktop Notification
        try {
          if (typeof Notification !== 'undefined' && Notification.isSupported()) {
            new Notification({
              title: 'fb-pulse: Đăng bài thất bại',
              body: `Bài đăng tới "${nextTask.target_name || nextTask.target_id}" thất bại: ${finalErrorMessage}`
            }).show()
          }
        } catch (notifErr) {
          console.warn('[SchedulerService] Không thể gửi Desktop Notification:', notifErr)
        }
      }
    }

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

    // Kiểm tra xem còn tác vụ nào sẵn sàng thực thi ngay không (non-blocking)
    const readyCountRow = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM scheduled_tasks
        WHERE (status = 'scheduled' OR status = 'retrying')
          AND datetime(scheduled_at) <= datetime('now')
      `)
      .get() as { count: number } | undefined

    if (readyCountRow && readyCountRow.count > 0) {
      const overdueRow = db
        .prepare(`
          SELECT COUNT(*) as count
          FROM scheduled_tasks
          WHERE (status = 'scheduled' OR status = 'retrying')
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
      // Không có tác vụ sẵn sàng ngay: kiểm tra xem có tác vụ hẹn giờ ở tương lai không
      const futureTask = db
        .prepare(`
          SELECT scheduled_at
          FROM scheduled_tasks
          WHERE status IN ('scheduled', 'retrying')
          ORDER BY datetime(scheduled_at) ASC
          LIMIT 1
        `)
        .get() as { scheduled_at: string } | undefined

      if (futureTask) {
        const futureMs = new Date(futureTask.scheduled_at).getTime() - Date.now()
        if (futureMs > 0) {
          this.scheduleNextQueueCheck(futureMs)
        }
      }

      this.status = 'idle'
      this.broadcastTick()
      // Giải phóng hoàn toàn tiến trình Worker khi hàng đợi rảnh (Story 5.1 / AD-1)
      workerManager.terminateWorker().catch((err) => {
        console.error('[SchedulerService] Lỗi khi giải phóng worker:', err)
      })
    }

    this.updatePowerSaveBlocker()
  }

  /**
   * Reset trạng thái phục vụ cho unit testing
   */
  resetForTesting(): void {
    if (this.futureCheckTimer) {
      clearTimeout(this.futureCheckTimer)
      this.futureCheckTimer = null
    }
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

    workerManager.terminateWorker().catch(() => {})

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
