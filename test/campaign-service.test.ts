import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { CampaignService } from '../src/main/services/campaign.service'

describe('CampaignService & Decomposition (Story 4.1)', () => {
  let db: Database.Database
  let campaignService: CampaignService

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)

    // Insert sample targets to satisfy foreign key constraint
    const insertTarget = db.prepare(`
      INSERT INTO targets (id, account_id, fb_id, name, type, privacy)
      VALUES (?, 'primary_account', ?, ?, 'group', 'public')
    `)
    insertTarget.run('target_1', 'fb_1', 'Nhóm 1')
    insertTarget.run('target_2', 'fb_2', 'Nhóm 2')
    insertTarget.run('target_3', 'fb_3', 'Nhóm 3')
    insertTarget.run('target_a', 'fb_a', 'Nhóm A')
    insertTarget.run('target_b', 'fb_b', 'Nhóm B')
    insertTarget.run('target_xyz', 'fb_xyz', 'Nhóm XYZ')

    // Mock getDatabase to return our in-memory DB
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    campaignService = new CampaignService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    db.close()
  })

  it('Matrix Row 1: Chạy ngay (Immediate) hợp lệ - tạo 1 campaign và N scheduled_tasks', () => {
    const result = campaignService.createCampaign({
      rawContent: 'Bài viết test {chào|hello} mọi người!',
      targetIds: ['target_1', 'target_2', 'target_3'],
      scheduleMode: 'immediate',
      mediaPaths: ['/path/to/img1.png', '/path/to/img2.jpg']
    })

    expect(result.campaignId).toBeDefined()
    expect(result.taskCount).toBe(3)
    expect(result.scheduledAt).toBeDefined()

    // Kiểm tra bản ghi trong bảng campaigns
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.campaignId) as any
    expect(campaign).toBeDefined()
    expect(campaign.raw_content).toBe('Bài viết test {chào|hello} mọi người!')
    expect(JSON.parse(campaign.media_paths)).toEqual(['/path/to/img1.png', '/path/to/img2.jpg'])

    // Kiểm tra bản ghi trong bảng scheduled_tasks
    const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE campaign_id = ?').all(result.campaignId) as any[]
    expect(tasks.length).toBe(3)
    for (const task of tasks) {
      expect(task.status).toBe('scheduled')
      expect(task.retry_count).toBe(0)
      expect(task.idempotency_key).toBeDefined()
      expect(task.resolved_spintax_text).toMatch(/Bài viết test (chào|hello) mọi người!/)
    }
  })

  it('Matrix Row 2: Hẹn giờ tương lai hợp lệ - tạo scheduled_tasks với thời điểm chỉ định', () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString() // 1 giờ sau
    const result = campaignService.createCampaign({
      rawContent: 'Thông báo sự kiện {ngày mai|tuần tới}',
      targetIds: ['target_a', 'target_b'],
      scheduleMode: 'scheduled',
      scheduledAt: futureDate
    })

    expect(result.taskCount).toBe(2)
    expect(result.scheduledAt).toBe(futureDate)

    const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE campaign_id = ?').all(result.campaignId) as any[]
    expect(tasks.length).toBe(2)
    expect(tasks[0].scheduled_at).toBe(futureDate)
    expect(tasks[1].scheduled_at).toBe(futureDate)
  })

  it('Matrix Row 3: Chưa chọn nhóm đích nào - ném lỗi xác thực', () => {
    expect(() => {
      campaignService.createCampaign({
        rawContent: 'Nội dung hợp lệ',
        targetIds: [],
        scheduleMode: 'immediate'
      })
    }).toThrow('Vui lòng chọn ít nhất 1 nhóm đích')
  })

  it('Matrix Row 4: Nội dung rỗng hoặc lỗi Spintax - ném lỗi xác thực', () => {
    // Rỗng
    expect(() => {
      campaignService.createCampaign({
        rawContent: '   ',
        targetIds: ['target_1'],
        scheduleMode: 'immediate'
      })
    }).toThrow('Nội dung bài viết không được để trống')

    // Lỗi Spintax (mở ngoặc không đóng)
    expect(() => {
      campaignService.createCampaign({
        rawContent: 'Nội dung có lỗi {chưa đóng ngoặc',
        targetIds: ['target_1'],
        scheduleMode: 'immediate'
      })
    }).toThrow()
  })

  it('Matrix Row 5: Hẹn giờ thời điểm quá khứ - ném lỗi xác thực', () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString() // 1 giờ trước

    expect(() => {
      campaignService.createCampaign({
        rawContent: 'Nội dung hợp lệ',
        targetIds: ['target_1'],
        scheduleMode: 'scheduled',
        scheduledAt: pastDate
      })
    }).toThrow('Thời gian hẹn giờ phải ở tương lai')
  })

  it('Matrix Row 6: Idempotency Key - tính toán MD5 duy nhất và bảo vệ chống trùng lặp', () => {
    const accountId = 'primary_account'
    const targetId = 'target_xyz'
    const campaignId = 'camp_123'
    const scheduledAt = '2026-09-20T10:00:00.000Z'

    const key1 = campaignService.calculateIdempotencyKey(accountId, targetId, campaignId, scheduledAt)
    const key2 = campaignService.calculateIdempotencyKey(accountId, targetId, campaignId, scheduledAt)
    expect(key1).toBe(key2)
    expect(key1).toMatch(/^[a-f0-9]{32}$/)

    // Chèn campaign để thỏa mãn foreign key constraint
    db.prepare(`
      INSERT INTO campaigns (id, account_id, title, raw_content, media_paths)
      VALUES (?, ?, 'Campaign Test', 'Content', '[]')
    `).run(campaignId, accountId)

    // Thử insert cùng một key 2 lần vào bảng scheduled_tasks (INSERT OR IGNORE)
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO scheduled_tasks (
        id, campaign_id, account_id, target_id,
        resolved_spintax_text, media_paths, idempotency_key,
        status, scheduled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const res1 = insertStmt.run('task_1', campaignId, accountId, targetId, 'Text 1', '[]', key1, 'scheduled', scheduledAt)
    expect(res1.changes).toBe(1)

    const res2 = insertStmt.run('task_2', campaignId, accountId, targetId, 'Text 2', '[]', key1, 'scheduled', scheduledAt)
    expect(res2.changes).toBe(0) // Không thêm bản ghi trùng lặp
  })
})
