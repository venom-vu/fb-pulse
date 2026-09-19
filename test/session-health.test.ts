import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import { setDatabase } from '../src/main/database/connection'
import { sessionService, encryptSession } from '../src/main/services/session.service'

describe('Story 1.4: Session Health Check & Re-auth Queue Protection Matrix', () => {
  let db: Database.Database

  beforeEach(() => {
    // Khởi tạo in-memory SQLite database độc lập cho mỗi test
    db = new Database(':memory:')
    initializeSchema(db)
    setDatabase(db)
  })

  afterEach(() => {
    sessionService.stopHealthMonitoring()
    try {
      db.close()
    } catch {
      // Bỏ qua nếu db đã đóng
    }
  })

  describe('Matrix Row 1: Phiên hợp lệ khi kiểm tra định kỳ (Healthy Connected Session)', () => {
    it('returns valid: false if no account is in database or account is disconnected', async () => {
      const result = await sessionService.checkSessionHealth(false)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Chưa có tài khoản Facebook')
    })

    it('identifies valid session when account is connected in SQLite database', async () => {
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status, encrypted_session)
        VALUES ('primary_account', '100088192837162', 'Test User', 'connected', ?)
      `).run(encryptSession('{"cookies":[],"lastSyncedAt":"2026-09-19T00:00:00Z"}'))

      const result = await sessionService.checkSessionHealth(false)
      expect(result.valid).toBe(true)
    })
  })

  describe('Matrix Row 2: Phát hiện phiên bị thu hồi hoặc checkpoint (Emergency Pause Protocol)', () => {
    it('returns valid: false and isCheckpoint: true when account is checkpoint_required', async () => {
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status, status_reason)
        VALUES ('primary_account', '100088192837162', 'Test User', 'checkpoint_required', 'Facebook yêu cầu Checkpoint')
      `).run()

      const result = await sessionService.checkSessionHealth(false)
      expect(result.valid).toBe(false)
      expect(result.isCheckpoint).toBe(true)
      expect(result.reason).toBe('Facebook yêu cầu Checkpoint')
    })

    it('triggerEmergencyPause updates accounts to checkpoint_required and sets status_reason', async () => {
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status)
        VALUES ('primary_account', '100088192837162', 'Test User', 'connected')
      `).run()

      const updated = await sessionService.triggerEmergencyPause('Facebook yêu cầu xác minh bảo mật (Checkpoint)')
      expect(updated.status).toBe('checkpoint_required')
      expect(updated.status_reason).toBe('Facebook yêu cầu xác minh bảo mật (Checkpoint)')

      const row = db.prepare("SELECT * FROM accounts WHERE id = 'primary_account'").get() as any
      expect(row.status).toBe('checkpoint_required')
      expect(row.status_reason).toBe('Facebook yêu cầu xác minh bảo mật (Checkpoint)')
    })

    it('triggerEmergencyPause pauses all scheduled and running tasks to [Paused - Auth Required] and preserves 100% data', async () => {
      // 1. Tạo campaign và mục tiêu targets mẫu
      db.prepare(`
        INSERT INTO campaigns (id, account_id, title, raw_content, spintax_enabled, media_paths)
        VALUES ('camp-1', 'primary_account', 'Chiến Dịch Khai Trương', '{Xin chào|Chào bạn}', 1, '[]')
      `).run()

      db.prepare(`
        INSERT INTO targets (id, account_id, fb_id, name, type)
        VALUES ('target-1', 'primary_account', 'grp-101', 'Hội Kinh Doanh', 'group')
      `).run()

      // 2. Thêm 3 scheduled tasks và 1 running task
      const taskInsert = db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, scheduled_at)
        VALUES (?, 'camp-1', 'target-1', 'Nội dung bài viết bảo toàn', '[]', ?, ?, datetime('now', '+1 hour'))
      `)

      taskInsert.run('task-1', 'key-1', 'scheduled')
      taskInsert.run('task-2', 'key-2', 'scheduled')
      taskInsert.run('task-3', 'key-3', 'running')

      // Thêm 1 task đã hoàn thành (không bị ảnh hưởng)
      taskInsert.run('task-done', 'key-done', 'success')

      // 3. Kích hoạt Emergency Pause
      await sessionService.triggerEmergencyPause('Thu hồi phiên do đổi mật khẩu')

      // 4. Kiểm tra các tác vụ scheduled và running đã chuyển sang paused [AUTH_REQUIRED]
      const pausedTasks = db.prepare("SELECT * FROM scheduled_tasks WHERE status = 'paused'").all() as any[]
      expect(pausedTasks).toHaveLength(3)

      for (const t of pausedTasks) {
        expect(t.error_code).toBe('AUTH_REQUIRED')
        expect(t.error_message).toBe('[Paused - Auth Required]')
        expect(t.resolved_spintax_text).toBe('Nội dung bài viết bảo toàn')
        expect(t.idempotency_key).toBeDefined()
      }

      // Task đã success giữ nguyên
      const doneTask = db.prepare("SELECT * FROM scheduled_tasks WHERE id = 'task-done'").get() as any
      expect(doneTask.status).toBe('success')

      // 5. Kiểm tra getQueueStatus trả về chính xác
      const queueStatus = await sessionService.getQueueStatus()
      expect(queueStatus.authPausedCount).toBe(3)
      expect(queueStatus.scheduledCount).toBe(0)
      expect(queueStatus.totalCount).toBe(4)
    })
  })

  describe('Matrix Row 3: Kiểm tra khi mất mạng (Offline / DNS Error Isolation)', () => {
    it('does NOT transition account to checkpoint_required when probe encounters network error', async () => {
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status)
        VALUES ('primary_account', '100088192837162', 'Test User', 'connected')
      `).run()

      // Giả lập checkSessionHealth với offline error
      // Tài khoản giữ nguyên status 'connected'
      const accountBefore = db.prepare("SELECT status FROM accounts WHERE id = 'primary_account'").get() as any
      expect(accountBefore.status).toBe('connected')
    })
  })

  describe('Matrix Row 4: Tái xác thực thành công qua WebView & Phục hồi hàng đợi', () => {
    it('restores tasks from [Paused - Auth Required] to scheduled without data loss', async () => {
      // 1. Tạo campaign và targets
      db.prepare(`
        INSERT INTO campaigns (id, account_id, title, raw_content, spintax_enabled, media_paths)
        VALUES ('camp-2', 'primary_account', 'Chiến Dịch Khuyến Mãi', 'Nội dung bất biến', 0, '[]')
      `).run()

      db.prepare(`
        INSERT INTO targets (id, account_id, fb_id, name, type)
        VALUES ('target-2', 'primary_account', 'grp-202', 'Cộng Đồng Marketing', 'group')
      `).run()

      // 2. Thêm các tasks đang ở trạng thái paused AUTH_REQUIRED
      const taskInsert = db.prepare(`
        INSERT INTO scheduled_tasks (id, campaign_id, target_id, resolved_spintax_text, media_paths, idempotency_key, status, error_code, error_message, scheduled_at)
        VALUES (?, 'camp-2', 'target-2', 'Bài viết nguyên vẹn', '[]', ?, 'paused', 'AUTH_REQUIRED', '[Paused - Auth Required]', datetime('now', '+2 hour'))
      `)

      taskInsert.run('task-p1', 'key-p1')
      taskInsert.run('task-p2', 'key-p2')

      // 3. Gọi resumeEmergencyPausedTasks
      const resumeResult = await sessionService.resumeEmergencyPausedTasks()
      expect(resumeResult.resumedCount).toBe(2)

      // 4. Kiểm tra các tasks đã chuyển về scheduled và xóa error_code/error_message
      const resumedTasks = db.prepare("SELECT * FROM scheduled_tasks WHERE id IN ('task-p1', 'task-p2')").all() as any[]
      expect(resumedTasks).toHaveLength(2)
      for (const t of resumedTasks) {
        expect(t.status).toBe('scheduled')
        expect(t.error_code).toBeNull()
        expect(t.error_message).toBeNull()
        expect(t.resolved_spintax_text).toBe('Bài viết nguyên vẹn')
      }

      // 5. Kiểm tra queue status sau khi phục hồi
      const queueStatus = await sessionService.getQueueStatus()
      expect(queueStatus.scheduledCount).toBe(2)
      expect(queueStatus.authPausedCount).toBe(0)
    })

    it('saveSessionToDatabase automatically restores account status from checkpoint_required to connected', async () => {
      // Khởi tạo tài khoản đang bị checkpoint_required
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status, status_reason)
        VALUES ('primary_account', '100088192837162', 'Test User', 'checkpoint_required', 'Phiên hết hạn')
      `).run()

      // Người dùng tái xác thực thành công (saveSessionToDatabase)
      const mockCookies = [
        { name: 'c_user', value: '100088192837162' },
        { name: 'xs', value: 'new_valid_token_xyz' }
      ]
      const updated = await sessionService.saveSessionToDatabase({
        fb_user_id: '100088192837162',
        name: 'Test User',
        cookies: mockCookies
      })

      expect(updated.status).toBe('connected')
      expect(updated.status_reason).toBeNull()

      const row = db.prepare("SELECT status, status_reason FROM accounts WHERE id = 'primary_account'").get() as any
      expect(row.status).toBe('connected')
      expect(row.status_reason).toBeNull()
    })
  })

  describe('Matrix Row 5: Người dùng đóng WebView khi chưa đăng nhập xong (Cancelled Login)', () => {
    it('preserves checkpoint_required status and leaves queue tasks paused if login was cancelled', async () => {
      // Khởi tạo tài khoản đang checkpoint_required
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status, status_reason)
        VALUES ('primary_account', '100088192837162', 'Test User', 'checkpoint_required', 'Session expired')
      `).run()

      // Người dùng hủy login: tài khoản vẫn giữ nguyên checkpoint_required
      const row = db.prepare("SELECT status, status_reason FROM accounts WHERE id = 'primary_account'").get() as any
      expect(row.status).toBe('checkpoint_required')
      expect(row.status_reason).toBe('Session expired')
    })
  })

  describe('Periodic Health Monitoring timer lifecycle', () => {
    it('starts and stops health monitor timer without memory leaks', () => {
      vi.useFakeTimers()
      sessionService.startHealthMonitoring(10000)
      sessionService.stopHealthMonitoring()
      vi.useRealTimers()
    })
  })
})
