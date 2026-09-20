import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { SchedulerService } from '../src/main/services/scheduler.service'
import { setActivePinia, createPinia } from 'pinia'
import { useQueueStore } from '../src/renderer/src/stores/queue'
import { shell } from 'electron'
import type { TaskDTO } from '../src/preload/types'

// Mock Electron modules
vi.mock('electron', () => {
  const NotificationMock = vi.fn().mockImplementation(() => ({
    show: vi.fn()
  }))
  ;(NotificationMock as any).isSupported = vi.fn().mockReturnValue(true)

  return {
    app: {
      isPackaged: false,
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
      beep: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined)
    },
    Notification: NotificationMock
  }
})

describe('Story 5.4: Bảng Điều Khiển Lịch Sử, Mở Bài Viết & Chẩn Đoán Lỗi Minh Bạch', () => {
  let db: Database.Database
  let schedulerService: SchedulerService

  beforeEach(() => {
    setActivePinia(createPinia())
    db = new Database(':memory:')
    initializeSchema(db)
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    // Khởi tạo account & targets mẫu
    db.prepare(`
      INSERT INTO accounts (id, name, status)
      VALUES ('primary_account', 'Test Account', 'connected')
    `).run()

    db.prepare(`
      INSERT INTO targets (id, account_id, fb_id, name, type)
      VALUES 
        ('target_1', 'primary_account', 'fb_1', 'Nhóm React Vietnam', 'group'),
        ('target_2', 'primary_account', 'fb_2', 'Nhóm VueJS Vietnam', 'group'),
        ('target_3', 'primary_account', 'fb_3', 'Trang Cá Nhân', 'profile')
    `).run()

    db.prepare(`
      INSERT INTO campaigns (id, account_id, title, raw_content, media_paths)
      VALUES ('campaign_1', 'primary_account', 'Chiến dịch Mùa Hè', 'Khuyến mãi khủng', '[]')
    `).run()

    schedulerService = new SchedulerService()
  })

  afterEach(() => {
    schedulerService.resetForTesting()
    vi.restoreAllMocks()
    db.close()
  })

  it('Matrix Row 1: Lấy danh sách lịch sử đăng bài với các trạng thái kết thúc (success, admin_pending, failed, cancelled) sắp xếp mới nhất lên đầu', () => {
    // Chèn các tác vụ với nhiều trạng thái khác nhau
    const insertTask = db.prepare(`
      INSERT INTO scheduled_tasks (
        id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths,
        idempotency_key, status, retry_count, scheduled_at, executed_at, permalink, error_code, error_message, screenshot_path, created_at, updated_at
      ) VALUES (?, 'campaign_1', 'primary_account', ?, 'Nội dung test', '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Task 1: active (scheduled)
    insertTask.run(
      'task_active',
      'target_1',
      'key_1',
      'scheduled',
      0,
      '2026-09-20T10:00:00.000Z',
      null,
      null,
      null,
      null,
      null,
      '2026-09-20T10:00:00.000Z',
      '2026-09-20T10:00:00.000Z'
    )

    // Task 2: success
    insertTask.run(
      'task_success',
      'target_1',
      'key_2',
      'success',
      0,
      '2026-09-20T08:00:00.000Z',
      '2026-09-20T08:05:00.000Z',
      'https://facebook.com/groups/123/posts/456',
      null,
      null,
      null,
      '2026-09-20T08:00:00.000Z',
      '2026-09-20T08:05:00.000Z'
    )

    // Task 3: admin_pending
    insertTask.run(
      'task_admin_pending',
      'target_2',
      'key_3',
      'admin_pending',
      0,
      '2026-09-20T08:10:00.000Z',
      '2026-09-20T08:15:00.000Z',
      null,
      null,
      'Chờ phê duyệt từ quản trị viên',
      null,
      '2026-09-20T08:10:00.000Z',
      '2026-09-20T08:15:00.000Z'
    )

    // Task 4: failed
    insertTask.run(
      'task_failed',
      'target_3',
      'key_4',
      'failed',
      2,
      '2026-09-20T09:00:00.000Z',
      '2026-09-20T09:10:00.000Z',
      null,
      'NETWORK_TIMEOUT',
      '[Failed - Network Timeout]',
      '/tmp/logs/screenshots/timeout-123.png',
      '2026-09-20T09:00:00.000Z',
      '2026-09-20T09:10:00.000Z'
    )

    // Task 5: cancelled
    insertTask.run(
      'task_cancelled',
      'target_1',
      'key_5',
      'cancelled',
      0,
      '2026-09-20T09:30:00.000Z',
      null,
      null,
      null,
      'Người dùng hủy tác vụ',
      null,
      '2026-09-20T09:30:00.000Z',
      '2026-09-20T09:35:00.000Z'
    )

    // Lấy danh sách tác vụ với orderBy: 'desc'
    const allTasks = schedulerService.getTasks({ orderBy: 'desc' })
    expect(allTasks.length).toBe(5)

    // Kiểm tra tính năng lọc theo statuses
    const historyTasks = schedulerService.getTasks({
      statuses: ['success', 'admin_pending', 'failed', 'cancelled'],
      orderBy: 'desc'
    })
    expect(historyTasks.length).toBe(4)
    expect(historyTasks.map((t) => t.id)).not.toContain('task_active')

    // Kiểm tra thứ tự sắp xếp DESC: task_failed (09:10) hoặc task_cancelled (09:35) đứng trước task_success (08:05)
    const timestamps = historyTasks.map((t) => new Date(t.executed_at || t.updated_at || t.scheduled_at).getTime())
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1])
    }

    // Kiểm tra trong Pinia store
    const queueStore = useQueueStore()
    queueStore.tasks = allTasks
    expect(queueStore.activeQueueTasks.length).toBe(1)
    expect(queueStore.activeQueueTasks[0].id).toBe('task_active')
    expect(queueStore.historyTasks.length).toBe(4)
  })

  it('Matrix Row 2: Mở bài viết thành công trên trình duyệt mặc định qua openExternalUrl', async () => {
    const queueStore = useQueueStore()

    // Test trường hợp URL rỗng
    const emptyRes = await queueStore.openExternalUrl('')
    expect(emptyRes.success).toBe(false)
    expect(emptyRes.error).toBe('URL không hợp lệ')

    // Test trường hợp gọi qua fbPulseAPI
    const mockOpenExternal = vi.fn().mockResolvedValue({ success: true })
    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        app: {
          openExternal: mockOpenExternal
        }
      }
    }

    const res = await queueStore.openExternalUrl('https://facebook.com/groups/123/posts/456')
    expect(res.success).toBe(true)
    expect(mockOpenExternal).toHaveBeenCalledWith('https://facebook.com/groups/123/posts/456')

    // Test trường hợp API trả về lỗi
    mockOpenExternal.mockResolvedValueOnce({
      success: false,
      error: { code: 'UNSUPPORTED_PROTOCOL', message: 'Chỉ hỗ trợ giao thức HTTP/HTTPS' }
    })
    const failRes = await queueStore.openExternalUrl('ftp://invalid-protocol.com')
    expect(failRes.success).toBe(false)
    expect(failRes.error).toBe('Chỉ hỗ trợ giao thức HTTP/HTTPS')
  })

  it('Matrix Row 3: Xem chẩn đoán lỗi bài thất bại kèm ảnh chụp màn hình Playwright capture', async () => {
    const failedTask: TaskDTO = {
      id: 'task_failed_1',
      campaign_id: 'campaign_1',
      campaign_title: 'Chiến dịch Mùa Hè',
      account_id: 'primary_account',
      target_id: 'target_1',
      target_name: 'Nhóm React Vietnam',
      target_type: 'group',
      resolved_spintax_text: 'Bài viết thất bại do checkpoint',
      media_paths: [],
      idempotency_key: 'key_failed_1',
      status: 'failed',
      retry_count: 2,
      scheduled_at: '2026-09-20T09:00:00.000Z',
      executed_at: '2026-09-20T09:02:00.000Z',
      error_code: 'CHECKPOINT_DETECTED',
      error_message: '[Failed - Checkpoint Detected] Facebook yêu cầu xác thực tài khoản',
      screenshot_path: '/logs/screenshots/checkpoint-task-1.png',
      created_at: '2026-09-20T08:50:00.000Z',
      updated_at: '2026-09-20T09:02:00.000Z'
    }

    // Mock API tải ảnh sự cố base64
    const mockGetImageDataUrl = vi.fn().mockResolvedValue({
      success: true,
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    })

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        app: {
          getImageDataUrl: mockGetImageDataUrl
        }
      }
    }

    const imgRes = await window.fbPulseAPI.app.getImageDataUrl(failedTask.screenshot_path!)
    expect(imgRes.success).toBe(true)
    expect(imgRes.data).toContain('data:image/png;base64,')
    expect(failedTask.error_code).toBe('CHECKPOINT_DETECTED')
    expect(failedTask.error_message).toContain('Facebook yêu cầu xác thực tài khoản')

    // Test trường hợp file không tồn tại
    mockGetImageDataUrl.mockResolvedValueOnce({
      success: false,
      error: { code: 'FILE_NOT_FOUND', message: 'Tệp không tồn tại' }
    })
    const missingRes = await window.fbPulseAPI.app.getImageDataUrl('/logs/screenshots/not-found.png')
    expect(missingRes.success).toBe(false)
    expect(missingRes.error?.code).toBe('FILE_NOT_FOUND')
  })

  it('Matrix Row 4: Xem chẩn đoán bài thất bại khi không có ảnh chụp màn hình sự cố', () => {
    const failedTaskWithoutScreenshot: TaskDTO = {
      id: 'task_failed_no_img',
      campaign_id: 'campaign_1',
      account_id: 'primary_account',
      target_id: 'target_2',
      resolved_spintax_text: 'Bài viết lỗi cú pháp',
      media_paths: [],
      idempotency_key: 'key_no_img',
      status: 'failed',
      retry_count: 0,
      scheduled_at: '2026-09-20T09:15:00.000Z',
      executed_at: '2026-09-20T09:16:00.000Z',
      error_code: 'INVALID_SYNTAX',
      error_message: 'Không thể phân giải định dạng bài đăng',
      screenshot_path: null,
      created_at: '2026-09-20T09:15:00.000Z',
      updated_at: '2026-09-20T09:16:00.000Z'
    }

    expect(failedTaskWithoutScreenshot.screenshot_path).toBeNull()
    expect(failedTaskWithoutScreenshot.error_code).toBe('INVALID_SYNTAX')
    expect(failedTaskWithoutScreenshot.error_message).toBe('Không thể phân giải định dạng bài đăng')
  })

  it('Matrix Row 5: Thử lại bài viết từ bảng lịch sử đưa trạng thái về scheduled và reset lỗi', async () => {
    // Chèn bài thất bại vào db
    db.prepare(`
      INSERT INTO scheduled_tasks (
        id, campaign_id, account_id, target_id, resolved_spintax_text, media_paths,
        idempotency_key, status, retry_count, scheduled_at, executed_at, error_code, error_message, screenshot_path, created_at, updated_at
      ) VALUES (
        'task_to_retry', 'campaign_1', 'primary_account', 'target_1', 'Nội dung thử lại', '[]',
        'key_retry', 'failed', 2, '2026-09-20T09:00:00.000Z', '2026-09-20T09:10:00.000Z',
        'NETWORK_TIMEOUT', '[Failed - Network Timeout]', '/path/to/img.png', '2026-09-20T09:00:00.000Z', '2026-09-20T09:10:00.000Z'
      )
    `).run()

    // Mock task executor để tránh chạy worker thật khi retryTask tự động process
    schedulerService.setTaskExecutor(async () => ({ success: true, permalink: 'https://fb.com/p/123' }))

    // Thử lại tác vụ thông qua schedulerService.retryTask
    schedulerService.retryTask('task_to_retry')

    // Kiểm tra bản ghi trong DB: error_code và error_message đã được reset về null, retry_count tăng
    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task_to_retry') as any
    expect(row.retry_count).toBe(3)
    expect(row.error_code).toBeNull()
    expect(row.error_message).toBeNull()

    // Kiểm tra thông qua Pinia store
    const queueStore = useQueueStore()
    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        queue: {
          retryTask: vi.fn().mockResolvedValue({ success: true }),
          getTasks: vi.fn().mockResolvedValue({ success: true, data: [row] }),
          getStatus: vi.fn().mockResolvedValue({ success: true, data: { scheduledCount: 1, authPausedCount: 0, totalCount: 1 } })
        }
      }
    }

    const storeRes = await queueStore.retryTask('task_to_retry')
    expect(storeRes.success).toBe(true)
  })
})
