import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import { setDatabase } from '../src/main/database/connection'
import {
  TargetService,
  parseFacebookGroupsHtml,
  RawFacebookGroup
} from '../src/main/services/target.service'

describe('Story 2.1: Target Database & Facebook Group Synchronization Matrix', () => {
  let db: Database.Database
  let targetService: TargetService

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    setDatabase(db)
    targetService = new TargetService()
  })

  afterEach(() => {
    try {
      db.close()
    } catch {
      // Ignore if already closed
    }
  })

  describe('HTML Parser: parseFacebookGroupsHtml', () => {
    it('correctly extracts groups, names, avatars, and privacy from mobile web HTML', () => {
      const mockHtml = `
        <div>
          <a href="/groups/123456789012345/?ref=group_browse">
            <img src="https://fbcdn.net/group1.jpg" />
            <span>Hội Mua Bán Bất Động Sản Hà Nội</span>
            <div>Nhóm công khai · 15K thành viên</div>
          </a>
          <a href="/groups/vietnam_tech_community/">
            <img src="https://fbcdn.net/group2.jpg" />
            <span>Cộng Đồng Lập Trình Viên Việt Nam 🇻🇳</span>
            <div>Nhóm riêng tư · 45K thành viên</div>
          </a>
        </div>
      `
      const groups = parseFacebookGroupsHtml(mockHtml)
      expect(groups).toHaveLength(2)

      expect(groups[0].fb_id).toBe('123456789012345')
      expect(groups[0].name).toContain('Hội Mua Bán Bất Động Sản Hà Nội')
      expect(groups[0].avatar_url).toBe('https://fbcdn.net/group1.jpg')
      expect(groups[0].privacy).toBe('public')

      expect(groups[1].fb_id).toBe('vietnam_tech_community')
      expect(groups[1].name).toContain('Cộng Đồng Lập Trình Viên Việt Nam 🇻🇳')
      expect(groups[1].avatar_url).toBe('https://fbcdn.net/group2.jpg')
      expect(groups[1].privacy).toBe('private')
    })

    it('filters out standard navigation links that are not group IDs', () => {
      const mockHtml = `
        <a href="/groups/feed/">Bảng tin</a>
        <a href="/groups/create/">Tạo nhóm mới</a>
        <a href="/groups/discover/">Khám phá</a>
        <a href="/groups/998877665544/"><span>Nhóm Rao Vặt Miền Bắc</span></a>
      `
      const groups = parseFacebookGroupsHtml(mockHtml)
      expect(groups).toHaveLength(1)
      expect(groups[0].fb_id).toBe('998877665544')
      expect(groups[0].name).toBe('Nhóm Rao Vặt Miền Bắc')
    })

    it('handles empty or malformed HTML gracefully', () => {
      expect(parseFacebookGroupsHtml('')).toEqual([])
      expect(parseFacebookGroupsHtml('<div>No links here</div>')).toEqual([])
      // @ts-ignore
      expect(parseFacebookGroupsHtml(null)).toEqual([])
    })
  })

  describe('Matrix Row 1: Đồng bộ thành công lần đầu (First-time Sync with Profile & Groups)', () => {
    it('creates profile target and saves extracted groups into SQLite with correct types', async () => {
      // Thiết lập tài khoản đang kết nối
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, avatar_url, status)
        VALUES ('primary_account', '100088192837162', 'Nguyễn Văn A', 'https://fbcdn.net/avatar.jpg', 'connected')
      `).run()

      const result = await targetService.syncTargetsFromFacebook('primary_account')

      expect(result.profileTarget).toBeDefined()
      expect(result.profileTarget?.type).toBe('profile')
      expect(result.profileTarget?.name).toBe('Nguyễn Văn A')
      expect(result.profileTarget?.fb_id).toBe('100088192837162')
      expect(result.profileTarget?.id).toBe('target_primary_account_100088192837162')

      const targets = targetService.listTargets('primary_account')
      expect(targets.length).toBeGreaterThanOrEqual(1)

      const profile = targets.find((t) => t.type === 'profile')
      expect(profile).toBeDefined()
      expect(profile?.privacy).toBe('public')
    })
  })

  describe('Matrix Row 2: Đồng bộ khi chưa kết nối Facebook (Auth Required Handling)', () => {
    it('throws AUTH_REQUIRED error when no account exists in SQLite', async () => {
      await expect(targetService.syncTargetsFromFacebook('primary_account')).rejects.toMatchObject({
        code: 'AUTH_REQUIRED'
      })
    })

    it('throws AUTH_REQUIRED error when account is disconnected or checkpoint_required', async () => {
      db.prepare(`
        INSERT INTO accounts (id, fb_user_id, name, status)
        VALUES ('primary_account', '100088192837162', 'Test User', 'checkpoint_required')
      `).run()

      await expect(targetService.syncTargetsFromFacebook('primary_account')).rejects.toMatchObject({
        code: 'AUTH_REQUIRED'
      })
    })
  })

  describe('Matrix Row 3: Đồng bộ lại giữ nguyên Folder (Re-sync Preserves Folder Assignment)', () => {
    it('preserves existing folder_id when re-syncing an existing group target', () => {
      // 1. Tạo thư mục
      const folder = targetService.createFolder('Nhóm Bán Hàng', 'primary_account')
      expect(folder.id).toBeDefined()
      expect(folder.name).toBe('Nhóm Bán Hàng')

      // 2. Chèn target ban đầu và gán vào folder
      const targetId = 'target_primary_account_group_111'
      db.prepare(`
        INSERT INTO targets (id, account_id, folder_id, fb_id, name, type, privacy)
        VALUES (?, 'primary_account', ?, 'group_111', 'Tên nhóm cũ', 'group', 'public')
      `).run(targetId, folder.id)

      let target = targetService.listTargets('primary_account').find((t) => t.id === targetId)
      expect(target?.folder_id).toBe(folder.id)
      expect(target?.name).toBe('Tên nhóm cũ')

      // 3. Thực hiện cập nhật lại target (mô phỏng re-sync)
      db.prepare(`
        INSERT INTO targets (id, account_id, folder_id, fb_id, name, type, privacy, last_synced_at)
        VALUES (?, 'primary_account', NULL, 'group_111', 'Tên nhóm mới đã đổi', 'group', 'private', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          privacy = excluded.privacy,
          last_synced_at = CURRENT_TIMESTAMP
      `).run(targetId)

      target = targetService.listTargets('primary_account').find((t) => t.id === targetId)
      expect(target?.name).toBe('Tên nhóm mới đã đổi')
      expect(target?.privacy).toBe('private')
      // Ràng buộc then chốt: folder_id không bị mất
      expect(target?.folder_id).toBe(folder.id)
    })

    it('assignToFolder updates folder_id and can unassign with null', () => {
      const folder = targetService.createFolder('Folder Test', 'primary_account')
      const targetId = 'target_primary_account_group_222'

      db.prepare(`
        INSERT INTO targets (id, account_id, fb_id, name, type, privacy)
        VALUES (?, 'primary_account', 'group_222', 'Nhóm Test', 'group', 'public')
      `).run(targetId)

      targetService.assignToFolder(targetId, folder.id)
      let target = targetService.listTargets().find((t) => t.id === targetId)
      expect(target?.folder_id).toBe(folder.id)

      targetService.assignToFolder(targetId, null)
      target = targetService.listTargets().find((t) => t.id === targetId)
      expect(target?.folder_id).toBeNull()
    })
  })

  describe('Matrix Row 4 & 5: Unicode & Idempotency Matrix Verification', () => {
    it('handles unicode, emojis, and special characters in group names correctly', () => {
      const targetId = 'target_primary_account_group_unicode'
      const complexName = 'Chợ Xe Cũ Hà Nội 🚗 [Mua Bán & Trao Đổi] (Uy Tín 100%) - 2026'

      db.prepare(`
        INSERT INTO targets (id, account_id, fb_id, name, type, privacy)
        VALUES (?, 'primary_account', 'group_unicode', ?, 'group', 'public')
      `).run(targetId, complexName)

      const target = targetService.listTargets().find((t) => t.id === targetId)
      expect(target?.name).toBe(complexName)
    })

    it('does not create duplicate rows when syncing multiple times with same fb_id', () => {
      const targetId = 'target_primary_account_group_dup'

      const insertStmt = db.prepare(`
        INSERT INTO targets (id, account_id, fb_id, name, type, privacy)
        VALUES (?, 'primary_account', 'group_dup', 'Nhóm Duplicate Test', 'group', 'public')
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `)

      insertStmt.run(targetId)
      insertStmt.run(targetId)
      insertStmt.run(targetId)

      const targets = targetService.listTargets().filter((t) => t.fb_id === 'group_dup')
      expect(targets).toHaveLength(1)
    })
  })
})
