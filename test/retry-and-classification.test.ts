import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { checkAdminApprovalPending, extractPostPermalink } from '../src/worker/dom-actions'
import { AutomationRunner } from '../src/worker/automation-runner'
import { SchedulerService } from '../src/main/services/scheduler.service'
import { Notification } from 'electron'
import { existsSync, unlinkSync, rmdirSync } from 'fs'
import { join } from 'path'

// Mock Electron Notification
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
    BrowserWindow: vi.fn(),
    powerSaveBlocker: {
      start: vi.fn().mockReturnValue(1),
      stop: vi.fn(),
      isStarted: vi.fn().mockReturnValue(true)
    },
    utilityProcess: {
      fork: vi.fn()
    },
    Notification: NotificationMock
  }
})

describe('Story 5.2: Phân Loại Kết Quả Đăng Bài & Tự Động Thử Lại Đa Tầng', () => {
  let db: Database.Database
  let schedulerService: SchedulerService
  let runner: AutomationRunner

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    // Tạo account mẫu và target mẫu trong database
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
      VALUES ('camp-1', 'primary_account', 'Test Campaign', 'Content', '[]')
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

  describe('1. Phân loại kết quả & DOM actions', () => {
    it('checkAdminApprovalPending nhận diện thông báo phê duyệt tiếng Việt trong alert/dialog', async () => {
      const mockPage = {
        locator: (selector: string) => {
          if (selector === 'div[role="alert"]') {
            return {
              count: async () => 1,
              nth: () => ({
                textContent: async () => 'Bài viết của bạn đã được gửi và đang chờ phê duyệt từ quản trị viên'
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

      const isPending = await checkAdminApprovalPending(mockPage)
      expect(isPending).toBe(true)
    })

    it('checkAdminApprovalPending nhận diện thông báo tiếng Anh (pending approval)', async () => {
      const mockPage = {
        locator: (selector: string) => {
          if (selector === 'div[role="dialog"]') {
            return {
              count: async () => 1,
              nth: () => ({
                textContent: async () => 'Your post has been submitted and is pending approval from an admin.'
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

      const isPending = await checkAdminApprovalPending(mockPage)
      expect(isPending).toBe(true)
    })

    it('checkAdminApprovalPending trả về false khi không có thông báo chờ duyệt', async () => {
      const mockPage = {
        locator: () => ({
          count: async () => 0,
          nth: () => ({ textContent: async () => '' }),
          first: () => ({ isVisible: async () => false })
        })
      } as any

      const isPending = await checkAdminApprovalPending(mockPage)
      expect(isPending).toBe(false)
    })

    it('extractPostPermalink trích xuất đúng permalink bài viết', async () => {
      const mockPage = {
        locator: (selector: string) => {
          if (selector === 'a[href*="/posts/"]') {
            return {
              count: async () => 1,
              nth: () => ({
                getAttribute: async (attr: string) =>
                  attr === 'href' ? 'https://www.facebook.com/groups/123456/posts/789012/?ref=share' : null
              })
            }
          }
          return {
            count: async () => 0,
            nth: () => ({ getAttribute: async () => null })
          }
        }
      } as any

      const permalink = await extractPostPermalink(mockPage, '123456')
      expect(permalink).toBe('https://www.facebook.com/groups/123456/posts/789012/')
    })

    it('AutomationRunner.classifyErrorCode phân loại chính xác các mã lỗi', () => {
      expect(runner.classifyErrorCode('net::ERR_INTERNET_DISCONNECTED')).toBe('NETWORK_TIMEOUT')
      expect(runner.classifyErrorCode('TimeoutError: Timeout 30000ms exceeded')).toBe('NETWORK_TIMEOUT')
      expect(runner.classifyErrorCode('ELEMENT_NOT_FOUND: Ô nhập nội dung')).toBe('DOM_TIMEOUT')
      expect(runner.classifyErrorCode('Cannot find selector: div[role="button"]')).toBe('DOM_TIMEOUT')
      expect(runner.classifyErrorCode('Database lock error')).toBe('EXECUTION_ERROR')
    })
  })

  describe('2. I/O Matrix Scenarios: Scheduler & Multi-tier Retry', () => {
    it('Scenario 1: Đăng công khai thành công trực tiếp -> [Success] và lưu permalink', async () => {
      // Chuẩn bị tác vụ scheduled trong DB
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-1', 'camp-1', 'primary_account', 'target-1', 'Hello world', '[]', 'idemp-1', 'scheduled', 0, datetime('now', '-1 minute'))
      `).run()

      schedulerService.setTaskExecutor(async () => {
        return {
          success: true,
          status: 'success',
          permalink: 'https://www.facebook.com/groups/123456/posts/789012/'
        }
      })

      await schedulerService.processNextTask()

      const task = schedulerService.getTaskById('task-1')
      expect(task).not.toBeNull()
      expect(task?.status).toBe('success')
      expect(task?.permalink).toBe('https://www.facebook.com/groups/123456/posts/789012/')
      expect(task?.error_code).toBeNull()
      expect(task?.error_message).toBeNull()
    })

    it('Scenario 2: Bài viết chờ quản trị viên duyệt -> [Admin Approval Pending], không coi là lỗi và tiếp tục bài kế tiếp', async () => {
      // Chuẩn bị 2 tác vụ: task-1 (sẽ chờ duyệt) và task-2 (bài kế tiếp)
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-1', 'camp-1', 'primary_account', 'target-1', 'Bài 1', '[]', 'idemp-1', 'scheduled', 0, datetime('now', '-2 minutes'))
      `).run()

      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-2', 'camp-1', 'primary_account', 'target-1', 'Bài 2', '[]', 'idemp-2', 'scheduled', 0, datetime('now', '-1 minute'))
      `).run()

      schedulerService.setTaskExecutor(async (task) => {
        if (task.id === 'task-1') {
          return {
            success: true,
            status: 'admin_pending',
            permalink: 'https://www.facebook.com/groups/123456'
          }
        }
        return {
          success: true,
          status: 'success',
          permalink: 'https://www.facebook.com/groups/123456/posts/2'
        }
      })

      // Xử lý task-1
      await schedulerService.processNextTask()

      const task1 = schedulerService.getTaskById('task-1')
      expect(task1?.status).toBe('admin_pending')
      expect(task1?.error_code).toBeNull()
      expect(task1?.error_message).toBeNull()

      // Tác vụ kế tiếp task-2 vẫn sẵn sàng trong hàng đợi
      const task2 = schedulerService.getTaskById('task-2')
      expect(task2?.status).toBe('scheduled')
    })

    it('Scenario 3: Lỗi mạng/timeout lần 1 -> Tự động thử lại lần 1 sau 3 phút, non-blocking hàng đợi', async () => {
      // Chuẩn bị task-1 (lỗi timeout) và task-2 (bài khác sẵn sàng)
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-1', 'camp-1', 'primary_account', 'target-1', 'Bài 1', '[]', 'idemp-1', 'scheduled', 0, datetime('now', '-2 minutes'))
      `).run()

      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-2', 'camp-1', 'primary_account', 'target-1', 'Bài 2', '[]', 'idemp-2', 'scheduled', 0, datetime('now', '-1 minute'))
      `).run()

      schedulerService.setTaskExecutor(async (task) => {
        if (task.id === 'task-1') {
          return {
            success: false,
            status: 'failed',
            errorCode: 'NETWORK_TIMEOUT',
            error: 'net::ERR_TIMED_OUT',
            screenshotPath: '/tmp/screenshots/error-task-1.png'
          }
        }
        return {
          success: true,
          status: 'success',
          permalink: 'https://www.facebook.com/groups/123456/posts/2'
        }
      })

      await schedulerService.processNextTask()

      const task1 = schedulerService.getTaskById('task-1')
      expect(task1?.status).toBe('retrying')
      expect(task1?.retry_count).toBe(1)
      expect(task1?.screenshot_path).toBe('/tmp/screenshots/error-task-1.png')

      // Thời gian scheduled_at phải dời về sau khoảng 3 phút (~180 giây)
      const scheduledAtTime = new Date(task1!.scheduled_at).getTime()
      const diffSeconds = Math.round((scheduledAtTime - Date.now()) / 1000)
      expect(diffSeconds).toBeGreaterThanOrEqual(175)
      expect(diffSeconds).toBeLessThanOrEqual(185)

      // Task 2 không bị nghẽn và vẫn ở trạng thái scheduled sẵn sàng
      const task2 = schedulerService.getTaskById('task-2')
      expect(task2?.status).toBe('scheduled')
    })

    it('Scenario 4: Lỗi timeout lần 2 -> Tự động thử lại lần 2 sau 5 phút', async () => {
      // Task đã từng retry 1 lần (retry_count = 1)
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-retry', 'camp-1', 'primary_account', 'target-1', 'Bài retry', '[]', 'idemp-retry', 'retrying', 1, datetime('now', '-10 seconds'))
      `).run()

      schedulerService.setTaskExecutor(async () => {
        return {
          success: false,
          status: 'failed',
          errorCode: 'DOM_TIMEOUT',
          error: 'ELEMENT_NOT_FOUND: Nút đăng bài',
          screenshotPath: '/tmp/screenshots/error-task-retry-2.png'
        }
      })

      await schedulerService.processNextTask()

      const task = schedulerService.getTaskById('task-retry')
      expect(task?.status).toBe('retrying')
      expect(task?.retry_count).toBe(2)
      expect(task?.screenshot_path).toBe('/tmp/screenshots/error-task-retry-2.png')

      // Thời gian scheduled_at dời lại 5 phút (~300 giây)
      const scheduledAtTime = new Date(task!.scheduled_at).getTime()
      const diffSeconds = Math.round((scheduledAtTime - Date.now()) / 1000)
      expect(diffSeconds).toBeGreaterThanOrEqual(295)
      expect(diffSeconds).toBeLessThanOrEqual(305)
    })

    it('Scenario 5: Thất bại hoàn toàn sau 2 lần thử lại -> [Failed - Network Timeout], chụp screenshot, gửi Desktop Notification', async () => {
      // Task đã qua 2 lần retry (retry_count = 2)
      db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, retry_count, scheduled_at)
        VALUES ('task-fail', 'camp-1', 'primary_account', 'target-1', 'Bài fail', '[]', 'idemp-fail', 'retrying', 2, datetime('now', '-5 seconds'))
      `).run()

      schedulerService.setTaskExecutor(async () => {
        return {
          success: false,
          status: 'failed',
          errorCode: 'NETWORK_TIMEOUT',
          error: 'Navigation timeout of 30000ms exceeded',
          screenshotPath: '/tmp/screenshots/error-task-fail-final.png'
        }
      })

      await schedulerService.processNextTask()

      const task = schedulerService.getTaskById('task-fail')
      expect(task?.status).toBe('failed')
      expect(task?.error_code).toBe('NETWORK_TIMEOUT')
      expect(task?.error_message).toBe('[Failed - Network Timeout]')
      expect(task?.screenshot_path).toBe('/tmp/screenshots/error-task-fail-final.png')

      // Kiểm tra Desktop Notification đã được phát
      expect(Notification).toHaveBeenCalled()
    })
  })
})
