import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { detectCheckpointOrBlock } from '../src/worker/dom-actions'
import { AutomationRunner } from '../src/worker/automation-runner'
import { SchedulerService } from '../src/main/services/scheduler.service'
import { sessionService } from '../src/main/services/session.service'
import { Notification, shell } from 'electron'
import { existsSync, writeFileSync, unlinkSync, rmdirSync, mkdirSync } from 'fs'
import { join } from 'path'

// Mock Electron modules
vi.mock('electron', () => {
  const showMock = vi.fn()
  const NotificationMock = vi.fn().mockImplementation(() => ({
    show: showMock
  }))
  ;(NotificationMock as any).isSupported = vi.fn().mockReturnValue(true)

  return {
    app: {
      getPath: vi.fn().mockReturnValue('/tmp/fb-pulse-test')
    },
    BrowserWindow: {
      getAllWindows: vi.fn().mockReturnValue([])
    },
    powerSaveBlocker: {
      start: vi.fn().mockReturnValue(1),
      stop: vi.fn(),
      isStarted: vi.fn().mockReturnValue(true)
    },
    utilityProcess: {
      fork: vi.fn()
    },
    shell: {
      beep: vi.fn()
    },
    Notification: NotificationMock
  }
})

describe('Story 5.3: Hàng Rào Phòng Vệ Khẩn Cấp Checkpoint & Cảnh Báo An Toàn', () => {
  let db: Database.Database
  let schedulerService: SchedulerService
  let runner: AutomationRunner

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    // Khởi tạo account mẫu và target mẫu trong database
    db.prepare(`
      INSERT INTO accounts (id, name, status)
      VALUES ('primary_account', 'Test Account', 'connected')
    `).run()

    db.prepare(`
      INSERT INTO targets (id, account_id, fb_id, name, type)
      VALUES ('target-1', 'primary_account', '123456', 'Nhóm Test', 'group')
    `).run()

    db.prepare(`
      INSERT INTO campaigns (id, account_id, title, raw_content, media_paths)
      VALUES ('camp-1', 'primary_account', 'Chiến Dịch Khẩn Cấp', 'Content Spintax', '[]')
    `).run()

    schedulerService = new SchedulerService()
    runner = new AutomationRunner()
    vi.mocked(Notification).mockImplementation(() => ({
      show: vi.fn()
    } as any))
    ;(Notification as any).isSupported = vi.fn().mockReturnValue(true)
  })

  afterEach(() => {
    schedulerService.resetForTesting()
    vi.restoreAllMocks()
    db.close()
  })

  describe('1. Nhận diện Checkpoint & Chặn tính năng (DOM Actions)', () => {
    it('detectCheckpointOrBlock phát hiện URL chuyển hướng sang checkpoint', async () => {
      const mockPage = {
        url: () => 'https://www.facebook.com/checkpoint/15000123456/?next=https%3A%2F%2Fwww.facebook.com',
        locator: () => ({
          count: async () => 0,
          nth: () => ({ textContent: async () => '' }),
          first: () => ({ isVisible: async () => false })
        })
      } as any

      const result = await detectCheckpointOrBlock(mockPage)
      expect(result.isCheckpoint).toBe(true)
      expect(result.reason).toContain('checkpoint')
    })

    it('detectCheckpointOrBlock phát hiện URL chuyển hướng sang recover', async () => {
      const mockPage = {
        url: () => 'https://www.facebook.com/recover/initiate/',
        locator: () => ({
          count: async () => 0,
          nth: () => ({ textContent: async () => '' }),
          first: () => ({ isVisible: async () => false })
        })
      } as any

      const result = await detectCheckpointOrBlock(mockPage)
      expect(result.isCheckpoint).toBe(true)
      expect(result.reason).toContain('checkpoint')
    })

    it('detectCheckpointOrBlock phát hiện modal cảnh báo chặn tính năng tiếng Việt', async () => {
      const mockPage = {
        url: () => 'https://www.facebook.com/groups/123456',
        locator: (selector: string) => {
          if (selector === 'div[role="dialog"]') {
            return {
              count: async () => 1,
              nth: () => ({
                textContent: async () => 'Bạn tạm thời bị chặn thực hiện hành động này để bảo vệ cộng đồng'
              })
            }
          }
          return {
            count: async () => 0,
            nth: () => ({ textContent: async () => '' }),
            first: () => ({ isVisible: async () => false })
          }
        }
      } as any

      const result = await detectCheckpointOrBlock(mockPage)
      expect(result.isCheckpoint).toBe(true)
      expect(result.reason).toContain('bạn tạm thời bị chặn')
    })

    it('detectCheckpointOrBlock phát hiện modal cảnh báo tiếng Anh (Action Blocked)', async () => {
      const mockPage = {
        url: () => 'https://www.facebook.com/groups/123456',
        locator: (selector: string) => {
          if (selector === 'div[role="alert"]') {
            return {
              count: async () => 1,
              nth: () => ({
                textContent: async () => 'Action Blocked: Your account has been temporarily restricted'
              })
            }
          }
          return {
            count: async () => 0,
            nth: () => ({ textContent: async () => '' }),
            first: () => ({ isVisible: async () => false })
          }
        }
      } as any

      const result = await detectCheckpointOrBlock(mockPage)
      expect(result.isCheckpoint).toBe(true)
      expect(result.reason).toContain('action blocked')
    })

    it('detectCheckpointOrBlock trả về false khi trang bình thường', async () => {
      const mockPage = {
        url: () => 'https://www.facebook.com/groups/123456',
        locator: () => ({
          count: async () => 0,
          nth: () => ({ textContent: async () => '' }),
          first: () => ({ isVisible: async () => false })
        })
      } as any

      const result = await detectCheckpointOrBlock(mockPage)
      expect(result.isCheckpoint).toBe(false)
    })
  })

  describe('2. AutomationRunner phân loại lỗi & chụp ảnh Checkpoint', () => {
    it('classifyErrorCode nhận diện chính xác CHECKPOINT_DETECTED từ thông báo', () => {
      expect(runner.classifyErrorCode('Facebook yêu cầu Checkpoint')).toBe('CHECKPOINT_DETECTED')
      expect(runner.classifyErrorCode('Bạn tạm thời bị chặn đăng bài')).toBe('CHECKPOINT_DETECTED')
      expect(runner.classifyErrorCode('Action blocked by community standards')).toBe('CHECKPOINT_DETECTED')
      expect(runner.classifyErrorCode('Tài khoản của bạn đã bị khóa tạm thời')).toBe('CHECKPOINT_DETECTED')
    })

    it('captureErrorScreenshot hỗ trợ tiền tố checkpoint-', async () => {
      const testDir = join(process.cwd(), 'test-screenshots-checkpoint')
      const mockPage = {
        screenshot: vi.fn().mockResolvedValue(undefined)
      } as any

      const screenshotPath = await runner.captureErrorScreenshot(
        mockPage,
        {
          id: 'task-cp-1',
          target_id: '123',
          resolved_spintax_text: 'test',
          media_paths: [],
          storageState: {},
          screenshotDir: testDir
        },
        'checkpoint'
      )

      expect(screenshotPath).toBeDefined()
      expect(screenshotPath).toContain('checkpoint-task-cp-1-')
      expect(mockPage.screenshot).toHaveBeenCalled()

      // Dọn dẹp thư mục test
      if (existsSync(testDir)) {
        try {
          unlinkSync(screenshotPath!)
        } catch {}
      }
    })
  })

  describe('3. Scheduler kích hoạt Emergency Pause & Hàng rào an toàn', () => {
    it('Khi phát hiện Checkpoint: bài hiện tại failed, các bài còn lại paused [Paused - Auth Required], tài khoản checkpoint_required, phát âm thanh và desktop notification', async () => {
      const beepSpy = vi.spyOn(shell, 'beep')
      const emergencySpy = vi.spyOn(sessionService, 'triggerEmergencyPause')

      // Tạo 3 tác vụ trong hàng đợi
      const nowIso = new Date().toISOString()
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, scheduled_at)
        VALUES
          ('task-1', 'camp-1', 'target-1', 'Bài 1', '[]', 'idem-1', 'scheduled', ?),
          ('task-2', 'camp-1', 'target-1', 'Bài 2', '[]', 'idem-2', 'scheduled', ?),
          ('task-3', 'camp-1', 'target-1', 'Bài 3', '[]', 'idem-3', 'scheduled', ?)
      `).run(nowIso, nowIso, nowIso)

      // Giả lập Worker trả về CHECKPOINT_DETECTED ở task-1
      schedulerService.setTaskExecutor(async () => {
        return {
          success: false,
          status: 'failed',
          errorCode: 'CHECKPOINT_DETECTED',
          error: 'Facebook yêu cầu xác minh bảo mật (Checkpoint)',
          screenshotPath: '/logs/screenshots/checkpoint-task-1.png',
          isCheckpoint: true
        }
      })

      // Kích hoạt xử lý tác vụ
      schedulerService.triggerQueueLoop()
      // Chờ hoàn tất tác vụ không đồng bộ
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 1. Kiểm tra task-1 bị đánh dấu failed với mã CHECKPOINT_DETECTED
      const task1 = db.prepare("SELECT * FROM scheduled_tasks WHERE id = 'task-1'").get() as any
      expect(task1.status).toBe('failed')
      expect(task1.error_code).toBe('CHECKPOINT_DETECTED')
      expect(task1.error_message).toBe('[Failed - Checkpoint Detected]')
      expect(task1.screenshot_path).toBe('/logs/screenshots/checkpoint-task-1.png')

      // 2. Kiểm tra các bài còn lại (task-2, task-3) bị chuyển sang paused với mã AUTH_REQUIRED
      const task2 = db.prepare("SELECT * FROM scheduled_tasks WHERE id = 'task-2'").get() as any
      const task3 = db.prepare("SELECT * FROM scheduled_tasks WHERE id = 'task-3'").get() as any
      expect(task2.status).toBe('paused')
      expect(task2.error_code).toBe('AUTH_REQUIRED')
      expect(task2.error_message).toBe('[Paused - Auth Required]')
      expect(task3.status).toBe('paused')
      expect(task3.error_code).toBe('AUTH_REQUIRED')

      // 3. Kiểm tra tài khoản bị chuyển sang checkpoint_required
      const account = db.prepare("SELECT * FROM accounts WHERE id = 'primary_account'").get() as any
      expect(account.status).toBe('checkpoint_required')

      // 4. Kiểm tra triggerEmergencyPause được gọi kèm screenshotPath
      expect(emergencySpy).toHaveBeenCalledWith(
        'Facebook yêu cầu xác minh bảo mật (Checkpoint)',
        null,
        '/logs/screenshots/checkpoint-task-1.png'
      )

      // 5. Kiểm tra phát âm thanh cảnh báo shell.beep()
      expect(beepSpy).toHaveBeenCalled()

      // 6. Kiểm tra phát Desktop Notification
      expect(Notification).toHaveBeenCalled()

      // 7. Kiểm tra trạng thái hàng đợi bị chuyển sang paused
      const jitterStatus = schedulerService.getJitterStatus()
      expect(jitterStatus.status).toBe('paused')
    })

    it('Không thực hiện retry tự động khi gặp CHECKPOINT_DETECTED', async () => {
      const nowIso = new Date().toISOString()
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, scheduled_at, retry_count)
        VALUES ('task-retry-test', 'camp-1', 'target-1', 'Bài test', '[]', 'idem-retry', 'scheduled', ?, 0)
      `).run(nowIso)

      schedulerService.setTaskExecutor(async () => {
        return {
          success: false,
          status: 'failed',
          errorCode: 'CHECKPOINT_DETECTED',
          error: 'Phát hiện URL checkpoint',
          isCheckpoint: true
        }
      })

      schedulerService.triggerQueueLoop()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const task = db.prepare("SELECT * FROM scheduled_tasks WHERE id = 'task-retry-test'").get() as any
      // Trạng thái phải là failed ngay lập tức, KHÔNG phải retrying
      expect(task.status).toBe('failed')
      expect(task.retry_count).toBe(0)
    })
  })
})
