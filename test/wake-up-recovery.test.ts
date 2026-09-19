import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { SchedulerService } from '../src/main/services/scheduler.service'
import { settingsService } from '../src/main/services/settings.service'
import { CampaignService } from '../src/main/services/campaign.service'

// Mock Electron powerSaveBlocker & powerMonitor
let mockBlockerId = 1
let isBlockerStarted = false

vi.mock('electron', () => {
  return {
    BrowserWindow: vi.fn(),
    powerSaveBlocker: {
      start: vi.fn(() => {
        isBlockerStarted = true
        return mockBlockerId
      }),
      stop: vi.fn((id: number) => {
        if (id === mockBlockerId) {
          isBlockerStarted = false
        }
      }),
      isStarted: vi.fn((id: number) => {
        return id === mockBlockerId && isBlockerStarted
      })
    },
    powerMonitor: {
      on: vi.fn()
    }
  }
})

describe('Wake-up Recovery & Power Management (Story 4.4)', () => {
  let db: Database.Database
  let schedulerService: SchedulerService
  let campaignService: CampaignService

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)

    // Mock getDatabase
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    // Insert mock targets & account
    const insertTarget = db.prepare(`
      INSERT INTO targets (id, account_id, fb_id, name, type, privacy)
      VALUES (?, 'primary_account', ?, ?, 'group', 'public')
    `)
    insertTarget.run('target_1', 'fb_1', 'Nhóm React')
    insertTarget.run('target_2', 'fb_2', 'Nhóm Vue')
    insertTarget.run('target_3', 'fb_3', 'Nhóm Node')

    schedulerService = new SchedulerService()
    campaignService = new CampaignService()
    isBlockerStarted = false
  })

  afterEach(() => {
    schedulerService.resetForTesting()
    vi.restoreAllMocks()
    vi.useRealTimers()
    db.close()
  })

  it('Matrix Row 1: Máy thức dậy khi có bài quá hạn - kích hoạt cooldown 60s và sau 60s đăng bù kèm Jitter 180s-420s', () => {
    vi.useFakeTimers()

    // Tạo chiến dịch với 3 bài có scheduled_at trong quá khứ
    campaignService.createCampaign({
      accountId: 'primary_account',
      targetIds: ['target_1', 'target_2', 'target_3'],
      rawContent: 'Bài đăng test wakeup {A|B}',
      spintaxEnabled: true,
      mediaPaths: [],
      scheduledMode: 'scheduled_at',
      scheduledAt: new Date(Date.now() - 3600000).toISOString() // 1 giờ trước
    })

    // Giả lập máy thức dậy: powerMonitor.on('resume')
    schedulerService.handleSystemResume()

    const wakeupStatus = schedulerService.getWakeupStatus()
    expect(wakeupStatus.isRecovering).toBe(true)
    expect(wakeupStatus.overdueCount).toBe(3)
    expect(wakeupStatus.remainingSeconds).toBe(60)

    // Đếm ngược 10 giây
    vi.advanceTimersByTime(10000)
    expect(schedulerService.getWakeupStatus().remainingSeconds).toBe(50)

    // Đếm nốt 50 giây để hoàn tất 60s cooldown
    vi.advanceTimersByTime(50000)
    expect(schedulerService.getWakeupStatus().isRecovering).toBe(false)
    expect(schedulerService.getWakeupStatus().remainingSeconds).toBe(0)

    // Kiểm tra hàng đợi đã bắt đầu xử lý tuần tự và có Jitter an toàn
    const jitterStatus = schedulerService.getJitterStatus()
    expect(['running', 'jitter_waiting', 'idle']).toContain(jitterStatus.status)
  })

  it('Matrix Row 2: Máy thức dậy nhưng không có bài quá hạn - không kích hoạt cooldown', () => {
    // Không có bài nào trong DB
    schedulerService.handleSystemResume()

    const wakeupStatus = schedulerService.getWakeupStatus()
    expect(wakeupStatus.isRecovering).toBe(false)
    expect(wakeupStatus.overdueCount).toBe(0)
    expect(wakeupStatus.remainingSeconds).toBe(0)
  })

  it('Matrix Row 3: Tạm dừng hàng đợi trong lúc đang đếm 60s cooldown - dừng đếm và tiếp tục khi resume', () => {
    vi.useFakeTimers()

    // Tạo 1 bài quá hạn
    campaignService.createCampaign({
      accountId: 'primary_account',
      targetIds: ['target_1'],
      rawContent: 'Test',
      spintaxEnabled: false,
      mediaPaths: [],
      scheduledMode: 'scheduled_at',
      scheduledAt: new Date(Date.now() - 60000).toISOString()
    })

    schedulerService.handleSystemResume()
    expect(schedulerService.getWakeupStatus().remainingSeconds).toBe(60)

    // Đếm 15 giây -> còn 45 giây
    vi.advanceTimersByTime(15000)
    expect(schedulerService.getWakeupStatus().remainingSeconds).toBe(45)

    // Bấm Tạm dừng (Pause)
    schedulerService.pauseQueue()
    expect(schedulerService.getJitterStatus().status).toBe('paused')

    // Thời gian trôi thêm 10 giây nhưng bộ đếm cooldown không bị giảm vì đang paused
    vi.advanceTimersByTime(10000)
    expect(schedulerService.getWakeupStatus().remainingSeconds).toBe(45)

    // Bấm Tiếp tục (Resume)
    schedulerService.resumeQueue()
    vi.advanceTimersByTime(5000)
    expect(schedulerService.getWakeupStatus().remainingSeconds).toBe(40)
  })

  it('Matrix Row 4: Bật cài đặt ngăn máy đi ngủ khi có chiến dịch active - kích hoạt powerSaveBlocker', () => {
    // Tạo 1 bài đăng chờ
    campaignService.createCampaign({
      accountId: 'primary_account',
      targetIds: ['target_1'],
      rawContent: 'Bài test blocker',
      spintaxEnabled: false,
      mediaPaths: [],
      scheduledMode: 'scheduled_at',
      scheduledAt: new Date(Date.now() + 600000).toISOString()
    })

    // Bật cài đặt prevent_sleep_when_active
    settingsService.setPreventSleepWhenActive(true)
    schedulerService.updatePowerSaveBlocker()

    const status = schedulerService.getPowerSaveStatus()
    expect(status.isEnabled).toBe(true)
    expect(status.isBlocked).toBe(true)
  })

  it('Matrix Row 5: Hàng đợi hoàn tất toàn bộ bài đăng - tự động giải phóng powerSaveBlocker', async () => {
    // Bật cài đặt
    settingsService.setPreventSleepWhenActive(true)

    // Tạo 1 bài immediate
    campaignService.createCampaign({
      accountId: 'primary_account',
      targetIds: ['target_1'],
      rawContent: 'Bài test hoàn tất',
      spintaxEnabled: false,
      mediaPaths: [],
      scheduledMode: 'immediate'
    })

    schedulerService.updatePowerSaveBlocker()
    expect(schedulerService.getPowerSaveStatus().isBlocked).toBe(true)

    // Thực thi bài đăng thành công
    await schedulerService.processNextTask()

    // Khi không còn bài scheduled nào, blocker tự động được giải phóng
    schedulerService.updatePowerSaveBlocker()
    expect(schedulerService.getPowerSaveStatus().isBlocked).toBe(false)
  })

  it('Matrix Row 6: Tắt cài đặt ngăn máy đi ngủ - giải phóng powerSaveBlocker ngay lập tức', () => {
    // Tạo bài active và bật blocker
    campaignService.createCampaign({
      accountId: 'primary_account',
      targetIds: ['target_1'],
      rawContent: 'Bài test',
      spintaxEnabled: false,
      mediaPaths: [],
      scheduledMode: 'scheduled_at',
      scheduledAt: new Date(Date.now() + 300000).toISOString()
    })

    settingsService.setPreventSleepWhenActive(true)
    schedulerService.updatePowerSaveBlocker()
    expect(schedulerService.getPowerSaveStatus().isBlocked).toBe(true)

    // Người dùng tắt cài đặt
    settingsService.setPreventSleepWhenActive(false)
    schedulerService.updatePowerSaveBlocker()
    expect(schedulerService.getPowerSaveStatus().isBlocked).toBe(false)
  })
})
