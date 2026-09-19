import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { CampaignService } from '../src/main/services/campaign.service'
import { SchedulerService } from '../src/main/services/scheduler.service'

describe('Queue State Machine & Single-threaded FIFO (Story 4.3)', () => {
  let db: Database.Database
  let campaignService: CampaignService
  let schedulerService: SchedulerService

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)

    // Insert mock targets
    const insertTarget = db.prepare(`
      INSERT INTO targets (id, account_id, fb_id, name, type, privacy)
      VALUES (?, 'primary_account', ?, ?, 'group', 'public')
    `)
    insertTarget.run('target_1', 'fb_1', 'Nhóm React')
    insertTarget.run('target_2', 'fb_2', 'Nhóm Vue')
    insertTarget.run('target_3', 'fb_3', 'Nhóm Node')

    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    campaignService = new CampaignService()
    schedulerService = new SchedulerService()
  })

  afterEach(() => {
    schedulerService.resetForTesting()
    vi.restoreAllMocks()
    db.close()
  })

  it('Matrix Row 1: Tạm dừng khi đang nghỉ Jitter - dừng timer, lưu remainingSeconds và chuyển sang paused', () => {
    schedulerService.startJitter(120)
    expect(schedulerService.getJitterStatus().status).toBe('jitter_waiting')
    expect(schedulerService.getJitterStatus().remainingSeconds).toBe(120)

    schedulerService.pauseQueue()
    const status = schedulerService.getJitterStatus()
    expect(status.status).toBe('paused')
    expect(status.remainingSeconds).toBe(120)
  })

  it('Matrix Row 2: Tiếp tục khi đang tạm dừng Jitter - khôi phục timer và tiếp tục đếm ngược', () => {
    vi.useFakeTimers()
    try {
      schedulerService.startJitter(100)
      // Đếm 10 giây
      vi.advanceTimersByTime(10000)
      expect(schedulerService.getJitterStatus().remainingSeconds).toBe(90)

      // Tạm dừng
      schedulerService.pauseQueue()
      expect(schedulerService.getJitterStatus().status).toBe('paused')
      expect(schedulerService.getJitterStatus().remainingSeconds).toBe(90)

      // Tiếp tục
      schedulerService.resumeQueue()
      expect(schedulerService.getJitterStatus().status).toBe('jitter_waiting')
      expect(schedulerService.getJitterStatus().remainingSeconds).toBe(90)

      // Tiếp tục đếm thêm 5 giây
      vi.advanceTimersByTime(5000)
      expect(schedulerService.getJitterStatus().remainingSeconds).toBe(85)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Matrix Row 3: Tạm dừng khi đang thực thi bài viết - tác vụ đang chạy hoàn tất, hàng đợi chuyển sang paused', async () => {
    // Tạo chiến dịch với 2 tác vụ
    const campaign = campaignService.createCampaign({
      rawContent: 'Bài đăng test an toàn',
      targetIds: ['target_1', 'target_2'],
      scheduleMode: 'immediate'
    })

    let taskExecutionStarted = false
    let resolveTask: (() => void) | null = null

    schedulerService.setTaskExecutor(async () => {
      taskExecutionStarted = true
      return new Promise((resolve) => {
        resolveTask = () => resolve({ success: true, permalink: 'https://fb.com/p/123' })
      })
    })

    // Bắt đầu xử lý tác vụ đầu tiên
    const processPromise = schedulerService.processNextTask()
    expect(taskExecutionStarted).toBe(true)
    expect(schedulerService.getJitterStatus().status).toBe('running')

    // Người dùng bấm tạm dừng hàng đợi trong khi tác vụ đang chạy
    schedulerService.pauseQueue()
    expect(schedulerService.getJitterStatus().isPausing).toBe(true)

    // Hoàn tất tác vụ đang chạy dở dang
    if (resolveTask) {
      ;(resolveTask as () => void)()
    }
    await processPromise

    // Hàng đợi phải chuyển sang paused, không chạy tiếp bài thứ hai
    expect(schedulerService.getJitterStatus().status).toBe('paused')
    expect(schedulerService.getJitterStatus().isPausing).toBe(false)

    // Kiểm tra trong DB: 1 bài success, 1 bài vẫn scheduled
    const tasks = db.prepare('SELECT status FROM scheduled_tasks WHERE campaign_id = ? ORDER BY created_at ASC').all(campaign.campaignId) as any[]
    expect(tasks[0].status).toBe('success')
    expect(tasks[1].status).toBe('scheduled')
  })

  it('Matrix Row 4: Hủy 1 bài đăng đang chờ - cập nhật status sang cancelled trong DB và loại khỏi luồng', () => {
    const campaign = campaignService.createCampaign({
      rawContent: 'Bài đăng cần hủy',
      targetIds: ['target_1'],
      scheduleMode: 'immediate'
    })

    const task = db.prepare('SELECT id, status FROM scheduled_tasks WHERE campaign_id = ?').get(campaign.campaignId) as any
    expect(task.status).toBe('scheduled')

    schedulerService.cancelTask(task.id)

    const updatedTask = db.prepare('SELECT status FROM scheduled_tasks WHERE id = ?').get(task.id) as any
    expect(updatedTask.status).toBe('cancelled')

    // Thử hủy lại hoặc hủy task không tồn tại
    expect(() => schedulerService.cancelTask('non_existent_id')).toThrow('Không tìm thấy tác vụ')
  })

  it('Matrix Row 5: Hủy toàn bộ chiến dịch - chuyển tất cả các bài chưa chạy của chiến dịch sang cancelled', () => {
    const campaign = campaignService.createCampaign({
      rawContent: 'Chiến dịch cần hủy toàn bộ',
      targetIds: ['target_1', 'target_2', 'target_3'],
      scheduleMode: 'immediate'
    })

    const result = schedulerService.cancelCampaign(campaign.campaignId)
    expect(result.cancelledCount).toBe(3)

    const cancelledTasks = db
      .prepare('SELECT COUNT(*) as count FROM scheduled_tasks WHERE campaign_id = ? AND status = ?')
      .get(campaign.campaignId, 'cancelled') as { count: number }
    expect(cancelledTasks.count).toBe(3)
  })

  it('Matrix Row 6: Thử lại bài đăng thất bại - cập nhật status từ failed về scheduled và tăng retry_count', () => {
    // Tạm dừng hàng đợi để kiểm tra trạng thái scheduled được cập nhật trong DB
    schedulerService.pauseQueue()

    const campaign = campaignService.createCampaign({
      rawContent: 'Bài đăng bị lỗi',
      targetIds: ['target_1'],
      scheduleMode: 'immediate'
    })

    const task = db.prepare('SELECT id FROM scheduled_tasks WHERE campaign_id = ?').get(campaign.campaignId) as any

    // Giả lập tác vụ thất bại
    db.prepare("UPDATE scheduled_tasks SET status = 'failed', error_message = 'Lỗi mạng' WHERE id = ?").run(task.id)

    // Thử lại tác vụ
    schedulerService.retryTask(task.id)

    const retriedTask = db.prepare('SELECT status, retry_count, error_message FROM scheduled_tasks WHERE id = ?').get(task.id) as any
    expect(retriedTask.status).toBe('scheduled')
    expect(retriedTask.retry_count).toBe(1)
    expect(retriedTask.error_message).toBeNull()

    // Thử lại tác vụ không ở trạng thái failed sẽ ném lỗi
    expect(() => schedulerService.retryTask(task.id)).toThrow('Chỉ có thể thử lại các tác vụ thất bại')
  })

  it('Matrix Row 7: Lấy danh sách tác vụ có bộ lọc và map đầy đủ thông tin nhóm đích', () => {
    const campaign = campaignService.createCampaign({
      rawContent: 'Bài đăng test bộ lọc',
      targetIds: ['target_1', 'target_2'],
      scheduleMode: 'immediate'
    })

    const allTasks = schedulerService.getTasks()
    expect(allTasks.length).toBe(2)
    expect(allTasks[0].target_name).toBeDefined()
    expect(allTasks[0].campaign_title).toBeDefined()
    expect(Array.isArray(allTasks[0].media_paths)).toBe(true)

    // Lọc theo campaignId
    const filteredByCampaign = schedulerService.getTasks({ campaignId: campaign.campaignId })
    expect(filteredByCampaign.length).toBe(2)

    // Lọc theo status
    const scheduledTasks = schedulerService.getTasks({ status: 'scheduled' })
    expect(scheduledTasks.length).toBe(2)

    const failedTasks = schedulerService.getTasks({ status: 'failed' })
    expect(failedTasks.length).toBe(0)
  })

  it('AC FIFO: Các bài đăng được điều phối tuần tự đơn luồng theo thời gian lên lịch', async () => {
    // Tạo 2 chiến dịch với thời gian lên lịch khác nhau
    const c1 = campaignService.createCampaign({
      rawContent: 'Chiến dịch 1',
      targetIds: ['target_1'],
      scheduleMode: 'immediate'
    })

    const c2 = campaignService.createCampaign({
      rawContent: 'Chiến dịch 2',
      targetIds: ['target_2'],
      scheduleMode: 'immediate'
    })

    const executedOrder: string[] = []
    schedulerService.setTaskExecutor(async (task) => {
      executedOrder.push(task.campaign_id)
      return { success: true }
    })

    // Xử lý bài 1
    await schedulerService.processNextTask()
    expect(executedOrder.length).toBe(1)
    expect(executedOrder[0]).toBe(c1.campaignId)

    // Tắt jitter và xử lý tiếp bài 2
    schedulerService.stopJitter()
    await schedulerService.processNextTask()
    expect(executedOrder.length).toBe(2)
    expect(executedOrder[1]).toBe(c2.campaignId)
  })
})
