import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { calculateTypingJitter, uploadImages } from '../src/worker/dom-actions'
import { sessionService, encryptSession } from '../src/main/services/session.service'
import { WorkerManager } from '../src/main/services/worker-manager'
import { SchedulerService } from '../src/main/services/scheduler.service'
import { EventEmitter } from 'events'

describe('Story 5.1: Tiến Trình Worker Độc Lập & Giả Lập Tương Tác Người Thật', () => {
  let db: Database.Database
  let workerManager: WorkerManager
  let schedulerService: SchedulerService

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    workerManager = new WorkerManager()
    schedulerService = new SchedulerService()
  })

  afterEach(async () => {
    await workerManager.terminateWorker()
    schedulerService.resetForTesting()
    vi.restoreAllMocks()
    db.close()
  })

  describe('1. Human-like Typing Jitter & DOM Actions', () => {
    it('calculates typing jitter between 50ms and 150ms by default', () => {
      for (let i = 0; i < 50; i++) {
        const delay = calculateTypingJitter(50, 150)
        expect(delay).toBeGreaterThanOrEqual(50)
        expect(delay).toBeLessThanOrEqual(150)
      }
    })

    it('handles custom min and max bounds for typing jitter', () => {
      for (let i = 0; i < 20; i++) {
        const delay = calculateTypingJitter(80, 120)
        expect(delay).toBeGreaterThanOrEqual(80)
        expect(delay).toBeLessThanOrEqual(120)
      }
    })

    it('uploadImages returns true immediately if filePaths is empty', async () => {
      const mockPage = {} as any
      const result = await uploadImages(mockPage, [])
      expect(result).toBe(true)
    })

    it('uploadImages limits upload to maximum 4 images', async () => {
      let passedFiles: string[] = []
      const mockLocator = {
        first: () => mockLocator,
        count: async () => 1,
        setInputFiles: async (files: string[]) => {
          passedFiles = files
        }
      }
      const mockPage = {
        locator: () => mockLocator
      } as any

      const fiveImages = ['img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png']
      const result = await uploadImages(mockPage, fiveImages)
      expect(result).toBe(true)
      expect(passedFiles).toHaveLength(4)
      expect(passedFiles).toEqual(['img1.png', 'img2.png', 'img3.png', 'img4.png'])
    })
  })

  describe('2. Two-Way Session Sync (SessionService)', () => {
    beforeEach(() => {
      const initialPayload = {
        cookies: [
          {
            name: 'c_user',
            value: '100099887766554',
            domain: '.facebook.com',
            path: '/',
            expires: 1780000000,
            httpOnly: false,
            secure: true,
            sameSite: 'lax'
          },
          {
            name: 'xs',
            value: '32:test_session_xs_hash',
            domain: '.facebook.com',
            path: '/',
            expires: 1780000000,
            httpOnly: true,
            secure: true,
            sameSite: 'strict'
          }
        ],
        lastSyncedAt: new Date().toISOString()
      }

      const encrypted = encryptSession(JSON.stringify(initialPayload))
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, encrypted_session, status)
        VALUES ('primary_account', '100099887766554', 'Facebook Test User', ?, 'connected')
      `).run(encrypted)
    })

    it('getDecryptedStorageState returns formatted Playwright storageState', async () => {
      const state = await sessionService.getDecryptedStorageState()
      expect(state).not.toBeNull()
      expect(state?.cookies).toHaveLength(2)

      const cUser = state?.cookies.find((c) => c.name === 'c_user')
      expect(cUser?.value).toBe('100099887766554')
      expect(cUser?.domain).toBe('.facebook.com')
      expect(cUser?.sameSite).toBe('Lax')

      const xs = state?.cookies.find((c) => c.name === 'xs')
      expect(xs?.value).toBe('32:test_session_xs_hash')
      expect(xs?.sameSite).toBe('Strict')
    })

    it('syncSessionFromStorageState updates SQLite with new cookies and updates last_synced_at', async () => {
      const updatedStorageState = {
        cookies: [
          {
            name: 'c_user',
            value: '100099887766554',
            domain: '.facebook.com',
            path: '/',
            expires: 1790000000,
            httpOnly: false,
            secure: true,
            sameSite: 'Lax'
          },
          {
            name: 'xs',
            value: '32:updated_xs_rolling_hash',
            domain: '.facebook.com',
            path: '/',
            expires: 1790000000,
            httpOnly: true,
            secure: true,
            sameSite: 'Strict'
          },
          {
            name: 'fr',
            value: 'new_fr_token',
            domain: '.facebook.com',
            path: '/',
            expires: 1790000000,
            httpOnly: true,
            secure: true,
            sameSite: 'None'
          }
        ]
      }

      const syncSuccess = await sessionService.syncSessionFromStorageState(updatedStorageState)
      expect(syncSuccess).toBe(true)

      // Kiểm tra lại trong DB
      const refreshedState = await sessionService.getDecryptedStorageState()
      expect(refreshedState?.cookies).toHaveLength(3)
      const updatedXs = refreshedState?.cookies.find((c) => c.name === 'xs')
      expect(updatedXs?.value).toBe('32:updated_xs_rolling_hash')
    })
  })

  describe('3. WorkerManager Lifecycle & Matrix Scenarios', () => {
    it('Matrix Row 1: Thực thi tác vụ thành công và đồng bộ phiên 2 chiều về SQLite', async () => {
      // Mock utilityProcess worker
      const mockWorker = new EventEmitter() as any
      mockWorker.pid = 9999
      mockWorker.postMessage = vi.fn((msg: any) => {
        if (msg.type === 'EXECUTE_TASK') {
          setTimeout(() => {
            mockWorker.emit('message', {
              type: 'TASK_COMPLETED',
              taskId: msg.payload.id,
              result: {
                success: true,
                permalink: 'https://facebook.com/groups/123/posts/456',
                newStorageState: {
                  cookies: [
                    { name: 'c_user', value: '100099887766554' },
                    { name: 'xs', value: '32:fresh_session_token' }
                  ]
                }
              }
            })
          }, 10)
        }
      })
      // Gắn mockWorker vào workerManager
      workerManager.attachWorker(mockWorker)

      const syncSpy = vi.spyOn(sessionService, 'syncSessionFromStorageState')

      const task = {
        id: 'task_001',
        target_id: 'group_123',
        resolved_spintax_text: 'Bài viết thử nghiệm tự động',
        media_paths: []
      }

      const result = await workerManager.executeTask(task)
      expect(result.success).toBe(true)
      expect(result.permalink).toBe('https://facebook.com/groups/123/posts/456')
      expect(syncSpy).toHaveBeenCalledWith({
        cookies: [
          { name: 'c_user', value: '100099887766554' },
          { name: 'xs', value: '32:fresh_session_token' }
        ]
      })
    })

    it('Matrix Row 2: Hàng đợi hoàn tất (trở về idle) - giải phóng Worker để thu hồi RAM (< 150MB)', async () => {
      const mockWorker = new EventEmitter() as any
      mockWorker.pid = 8888
      mockWorker.postMessage = vi.fn()
      mockWorker.kill = vi.fn()

      workerManager.attachWorker(mockWorker)

      expect(workerManager.isWorkerRunning()).toBe(true)

      await workerManager.terminateWorker()

      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'SHUTDOWN' })
      expect(workerManager.isWorkerRunning()).toBe(false)
    })

    it('Matrix Row 3: Session hết hạn hoặc không hợp lệ - Báo lỗi AUTH_SESSION_INVALID', async () => {
      const mockWorker = new EventEmitter() as any
      mockWorker.pid = 7777
      mockWorker.postMessage = vi.fn((msg: any) => {
        if (msg.type === 'EXECUTE_TASK') {
          setTimeout(() => {
            mockWorker.emit('message', {
              type: 'TASK_COMPLETED',
              taskId: msg.payload.id,
              result: {
                success: false,
                error: 'AUTH_SESSION_INVALID: Phiên đăng nhập đã hết hạn hoặc bị đăng xuất'
              }
            })
          }, 10)
        }
      })
      mockWorker.kill = vi.fn()

      workerManager.attachWorker(mockWorker)

      const task = {
        id: 'task_002',
        target_id: 'group_456',
        resolved_spintax_text: 'Test bài đăng session lỗi'
      }

      const result = await workerManager.executeTask(task)
      expect(result.success).toBe(false)
      expect(result.error).toContain('AUTH_SESSION_INVALID')
    })

    it('Matrix Row 4: Không tìm thấy ô nhập bài viết trên Facebook - Báo lỗi ELEMENT_NOT_FOUND', async () => {
      const mockWorker = new EventEmitter() as any
      mockWorker.pid = 6666
      mockWorker.postMessage = vi.fn((msg: any) => {
        if (msg.type === 'EXECUTE_TASK') {
          setTimeout(() => {
            mockWorker.emit('message', {
              type: 'TASK_COMPLETED',
              taskId: msg.payload.id,
              result: {
                success: false,
                error: 'ELEMENT_NOT_FOUND: Không tìm thấy ô mở khung tạo bài viết trên trang nhóm'
              }
            })
          }, 10)
        }
      })
      mockWorker.kill = vi.fn()

      workerManager.attachWorker(mockWorker)

      const task = {
        id: 'task_003',
        target_id: 'group_789',
        resolved_spintax_text: 'Test bài đăng DOM lỗi'
      }

      const result = await workerManager.executeTask(task)
      expect(result.success).toBe(false)
      expect(result.error).toContain('ELEMENT_NOT_FOUND')
    })
  })
})
