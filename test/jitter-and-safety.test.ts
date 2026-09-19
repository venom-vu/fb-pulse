import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { CampaignService } from '../src/main/services/campaign.service'
import { SchedulerService } from '../src/main/services/scheduler.service'

describe('Anti-ban Jitter Engine & Daily Safety Limit (Story 4.2)', () => {
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
    insertTarget.run('target_1', 'fb_1', 'Nhóm 1')
    insertTarget.run('target_2', 'fb_2', 'Nhóm 2')

    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    campaignService = new CampaignService()
    schedulerService = new SchedulerService()
  })

  afterEach(() => {
    schedulerService.stopJitter()
    vi.restoreAllMocks()
    db.close()
  })

  it('Matrix Row 1: Cấu hình Jitter hợp lệ (180s – 300s) được lưu chính xác vào DB', () => {
    const result = campaignService.createCampaign({
      rawContent: 'Nội dung test Jitter {hợp lệ|chuẩn}',
      targetIds: ['target_1'],
      scheduleMode: 'immediate',
      minJitterSec: 180,
      maxJitterSec: 300
    })

    const campaign = db.prepare('SELECT min_jitter_sec, max_jitter_sec FROM campaigns WHERE id = ?').get(result.campaignId) as any
    expect(campaign).toBeDefined()
    expect(campaign.min_jitter_sec).toBe(180)
    expect(campaign.max_jitter_sec).toBe(300)
  })

  it('Matrix Row 2: Cấu hình Jitter < 60s bị backend chặn và ném lỗi xác thực', () => {
    expect(() => {
      campaignService.createCampaign({
        rawContent: 'Nội dung test',
        targetIds: ['target_1'],
        scheduleMode: 'immediate',
        minJitterSec: 30,
        maxJitterSec: 50
      })
    }).toThrow('Thời gian nghỉ tối thiểu phải từ 60 giây trở lên')
  })

  it('Matrix Row 3: min_jitter > max_jitter ném lỗi xác thực', () => {
    expect(() => {
      campaignService.createCampaign({
        rawContent: 'Nội dung test',
        targetIds: ['target_1'],
        scheduleMode: 'immediate',
        minJitterSec: 200,
        maxJitterSec: 150
      })
    }).toThrow('Thời gian nghỉ tối đa phải lớn hơn hoặc bằng thời gian tối thiểu')
  })

  it('Matrix Row 4: Động cơ Jitter tính toán khoảng trễ và định dạng mm:ss chính xác', () => {
    // calculateJitter trong [180, 300]
    for (let i = 0; i < 20; i++) {
      const jitter = schedulerService.calculateJitter(180, 300)
      expect(jitter).toBeGreaterThanOrEqual(180)
      expect(jitter).toBeLessThanOrEqual(300)
    }

    // calculateJitter clamp min >= 60
    const clampedJitter = schedulerService.calculateJitter(20, 40)
    expect(clampedJitter).toBeGreaterThanOrEqual(60)

    // formatCountdown
    expect(schedulerService.formatCountdown(225)).toBe('03:45')
    expect(schedulerService.formatCountdown(60)).toBe('01:00')
    expect(schedulerService.formatCountdown(5)).toBe('00:05')
    expect(schedulerService.formatCountdown(0)).toBe('00:00')
  })

  it('Matrix Row 5: Vòng lặp tick và đếm ngược Jitter hoạt động đúng chu kỳ', () => {
    vi.useFakeTimers()

    let completed = false
    schedulerService.startJitter(3, () => {
      completed = true
    })

    const status1 = schedulerService.getJitterStatus()
    expect(status1.status).toBe('jitter_waiting')
    expect(status1.remainingSeconds).toBe(3)
    expect(status1.formattedCountdown).toBe('00:03')

    // Trôi 1 giây
    vi.advanceTimersByTime(1000)
    const status2 = schedulerService.getJitterStatus()
    expect(status2.remainingSeconds).toBe(2)
    expect(status2.formattedCountdown).toBe('00:02')

    // Trôi 2 giây tiếp theo
    vi.advanceTimersByTime(2000)
    expect(completed).toBe(true)
    const statusEnd = schedulerService.getJitterStatus()
    expect(statusEnd.status).toBe('idle')
    expect(statusEnd.remainingSeconds).toBe(0)

    vi.useRealTimers()
  })

  it('Matrix Row 6: Kiểm tra ngưỡng an toàn 30 bài / 24 giờ - trong ngưỡng vs vượt ngưỡng', () => {
    const accountId = 'primary_account'

    // Ban đầu chưa có bài nào
    const checkEmpty = campaignService.checkDailyLimit(accountId, 10)
    expect(checkEmpty.currentCount).toBe(0)
    expect(checkEmpty.incomingCount).toBe(10)
    expect(checkEmpty.totalCount).toBe(10)
    expect(checkEmpty.exceedsLimit).toBe(false)

    // Chèn 1 campaign để thỏa mãn foreign key constraint
    db.prepare(`
      INSERT INTO campaigns (id, account_id, title, raw_content, media_paths)
      VALUES ('camp_test', ?, 'Test Camp', 'Content', '[]')
    `).run(accountId)

    // Chèn 25 bài vào bảng scheduled_tasks trong 24 giờ
    const insertTask = db.prepare(`
      INSERT INTO scheduled_tasks (
        id, campaign_id, account_id, target_id,
        resolved_spintax_text, media_paths, idempotency_key,
        status, scheduled_at, created_at
      ) VALUES (?, 'camp_test', ?, 'target_1', 'Text', '[]', ?, ?, datetime('now'), datetime('now'))
    `)

    for (let i = 0; i < 25; i++) {
      insertTask.run(`task_${i}`, accountId, `key_${i}`, 'scheduled')
    }

    // Kiểm tra với 4 bài thêm -> tổng 29 <= 30 -> Không vượt ngưỡng
    const checkOk = campaignService.checkDailyLimit(accountId, 4)
    expect(checkOk.currentCount).toBe(25)
    expect(checkOk.totalCount).toBe(29)
    expect(checkOk.exceedsLimit).toBe(false)

    // Kiểm tra với 6 bài thêm -> tổng 31 > 30 -> VƯỢT NGƯỠNG
    const checkExceed = campaignService.checkDailyLimit(accountId, 6)
    expect(checkExceed.currentCount).toBe(25)
    expect(checkExceed.totalCount).toBe(31)
    expect(checkExceed.exceedsLimit).toBe(true)
    expect(checkExceed.threshold).toBe(30)

    // Các bài bị cancelled không tính vào limit
    db.prepare("UPDATE scheduled_tasks SET status = 'cancelled' WHERE id IN ('task_0', 'task_1', 'task_2', 'task_3', 'task_4')").run()
    const checkAfterCancel = campaignService.checkDailyLimit(accountId, 6)
    expect(checkAfterCancel.currentCount).toBe(20)
    expect(checkAfterCancel.totalCount).toBe(26)
    expect(checkAfterCancel.exceedsLimit).toBe(false)
  })
})
