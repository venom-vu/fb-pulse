import crypto from 'crypto'
import { getDatabase } from '../database/connection'
import { resolveSpintax, validateSpintax } from '../../shared/spintax'
import type { CreateCampaignDTO, CreateCampaignResultDTO } from '../../preload/types'

export class CampaignService {
  /**
   * Tạo một chiến dịch mới và phân rã thành N tác vụ trong bảng scheduled_tasks
   */
  createCampaign(payload: CreateCampaignDTO, accountId = 'primary_account'): CreateCampaignResultDTO {
    // 1. Kiểm tra nội dung bài viết
    if (!payload.rawContent || !payload.rawContent.trim()) {
      throw new Error('Nội dung bài viết không được để trống')
    }

    const spintaxEnabled = payload.spintaxEnabled !== false
    if (spintaxEnabled) {
      const validation = validateSpintax(payload.rawContent)
      if (!validation.isValid) {
        throw new Error(validation.error || 'Cú pháp Spintax không hợp lệ')
      }
    }

    // 2. Kiểm tra danh sách nhóm đích
    if (!payload.targetIds || payload.targetIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất 1 nhóm đích')
    }

    // 3. Xác định thời gian lên lịch
    let scheduledAt: string
    const now = new Date()

    if (payload.scheduleMode === 'scheduled') {
      if (!payload.scheduledAt) {
        throw new Error('Vui lòng chọn thời gian hẹn giờ phát hành')
      }
      const scheduledTime = new Date(payload.scheduledAt)
      if (isNaN(scheduledTime.getTime())) {
        throw new Error('Thời gian hẹn giờ không hợp lệ')
      }
      if (scheduledTime.getTime() <= now.getTime()) {
        throw new Error('Thời gian hẹn giờ phải ở tương lai')
      }
      scheduledAt = scheduledTime.toISOString()
    } else {
      scheduledAt = now.toISOString()
    }

    const campaignId = crypto.randomUUID()
    const title =
      payload.title?.trim() ||
      (payload.rawContent.length > 50
        ? payload.rawContent.slice(0, 50).replace(/\r?\n/g, ' ') + '...'
        : payload.rawContent.replace(/\r?\n/g, ' '))
    const mediaPathsJson = JSON.stringify(payload.mediaPaths || [])
    const minJitter = payload.minJitterSec !== undefined ? payload.minJitterSec : 180
    const maxJitter = payload.maxJitterSec !== undefined ? payload.maxJitterSec : 300

    if (minJitter < 60) {
      throw new Error('Thời gian nghỉ tối thiểu phải từ 60 giây trở lên')
    }
    if (maxJitter < minJitter) {
      throw new Error('Thời gian nghỉ tối đa phải lớn hơn hoặc bằng thời gian tối thiểu')
    }

    const db = getDatabase()

    // 4. Thực thi transaction ghi vào campaigns và scheduled_tasks
    const insertCampaign = db.prepare(`
      INSERT INTO campaigns (
        id, account_id, title, raw_content, spintax_enabled,
        media_paths, min_jitter_sec, max_jitter_sec, scheduled_at
      ) VALUES (
        @id, @account_id, @title, @raw_content, @spintax_enabled,
        @media_paths, @min_jitter_sec, @max_jitter_sec, @scheduled_at
      )
    `)

    const insertTask = db.prepare(`
      INSERT OR IGNORE INTO scheduled_tasks (
        id, campaign_id, account_id, target_id,
        resolved_spintax_text, media_paths, idempotency_key,
        status, retry_count, scheduled_at
      ) VALUES (
        @id, @campaign_id, @account_id, @target_id,
        @resolved_spintax_text, @media_paths, @idempotency_key,
        'scheduled', 0, @scheduled_at
      )
    `)

    let insertedTasksCount = 0

    const runTransaction = db.transaction(() => {
      insertCampaign.run({
        id: campaignId,
        account_id: accountId,
        title,
        raw_content: payload.rawContent,
        spintax_enabled: spintaxEnabled ? 1 : 0,
        media_paths: mediaPathsJson,
        min_jitter_sec: minJitter,
        max_jitter_sec: maxJitter,
        scheduled_at: scheduledAt
      })

      for (const targetId of payload.targetIds) {
        const taskId = crypto.randomUUID()
        const resolvedText = spintaxEnabled
          ? resolveSpintax(payload.rawContent)
          : payload.rawContent

        // MD5(account_id + target_id + campaign_id + scheduled_at)
        const rawKey = `${accountId}:${targetId}:${campaignId}:${scheduledAt}`
        const idempotencyKey = crypto.createHash('md5').update(rawKey).digest('hex')

        const result = insertTask.run({
          id: taskId,
          campaign_id: campaignId,
          account_id: accountId,
          target_id: targetId,
          resolved_spintax_text: resolvedText,
          media_paths: mediaPathsJson,
          idempotency_key: idempotencyKey,
          scheduled_at: scheduledAt
        })

        if (result.changes > 0) {
          insertedTasksCount++
        }
      }
    })

    runTransaction()

    return {
      campaignId,
      taskCount: insertedTasksCount,
      scheduledAt
    }
  }

  /**
   * Tính toán Idempotency Key (tiện ích dùng chung hoặc kiểm thử)
   */
  calculateIdempotencyKey(
    accountId: string,
    targetId: string,
    campaignId: string,
    scheduledAt: string
  ): string {
    const rawKey = `${accountId}:${targetId}:${campaignId}:${scheduledAt}`
    return crypto.createHash('md5').update(rawKey).digest('hex')
  }

  /**
   * Đếm tổng số bài đăng trong vòng 24 giờ qua của tài khoản
   */
  get24hPostCount(accountId = 'primary_account'): number {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM scheduled_tasks
      WHERE account_id = ?
        AND status != 'cancelled'
        AND (
          datetime(scheduled_at) >= datetime('now', '-24 hours')
          OR datetime(created_at) >= datetime('now', '-24 hours')
        )
    `).get(accountId) as { count: number } | undefined

    return row?.count ?? 0
  }

  /**
   * Kiểm tra ngưỡng an toàn 30 bài/24h
   */
  checkDailyLimit(
    accountId = 'primary_account',
    incomingTaskCount = 0
  ): {
    currentCount: number
    incomingCount: number
    totalCount: number
    exceedsLimit: boolean
    threshold: number
  } {
    const currentCount = this.get24hPostCount(accountId)
    const totalCount = currentCount + incomingTaskCount
    return {
      currentCount,
      incomingCount: incomingTaskCount,
      totalCount,
      exceedsLimit: totalCount > 30,
      threshold: 30
    }
  }
}

export const campaignService = new CampaignService()
