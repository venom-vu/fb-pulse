import { BrowserWindow, session } from 'electron'
import { getDatabase } from '../database/connection'
import { FB_PARTITION } from './session.service'
import type { TargetDTO, FolderDTO, TargetSyncResultDTO } from '../../preload/types'
import { randomUUID } from 'crypto'

export interface RawFacebookGroup {
  fb_id: string
  name: string
  avatar_url: string | null
  privacy: 'public' | 'private'
}

/**
 * Phân tích cú pháp HTML từ trang danh sách nhóm của Facebook (m.facebook.com hoặc mbasic.facebook.com).
 * Hàm thuần túy (pure function) hỗ trợ kiểm thử tự động không cần kết nối mạng thật.
 */
export function parseFacebookGroupsHtml(html: string): RawFacebookGroup[] {
  const groups: RawFacebookGroup[] = []
  const seenIds = new Set<string>()

  if (!html || typeof html !== 'string') {
    return groups
  }

  // Regex 1: Tìm các thẻ chứa liên kết nhóm dạng /groups/123456789 hoặc /groups/group_name
  // Hỗ trợ cả m.facebook.com và mbasic.facebook.com
  const groupLinkRegex = /<a[^>]+href=["'](?:\/groups\/|https?:\/\/[^/]+\/groups\/)([a-zA-Z0-9._-]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = groupLinkRegex.exec(html)) !== null) {
    const rawId = match[1]
    const innerContent = match[2]

    // Bỏ qua các đường dẫn điều hướng không phải ID nhóm
    if (
      !rawId ||
      ['create', 'discover', 'feed', 'joins', 'notifications', 'categories'].includes(rawId.toLowerCase())
    ) {
      continue
    }

    if (seenIds.has(rawId)) {
      continue
    }

    // Trích xuất tên nhóm từ innerContent hoặc thẻ lồng
    let name = innerContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!name || name.length < 2) {
      continue
    }

    // Trích xuất avatar nếu có thẻ img
    let avatarUrl: string | null = null
    const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(innerContent)
    if (imgMatch && imgMatch[1] && !imgMatch[1].includes('data:image')) {
      avatarUrl = imgMatch[1].replace(/&amp;/g, '&')
    }

    // Xác định quyền riêng tư: mặc định public, nếu có từ khóa "riêng tư" hoặc "private" thì là private
    const isPrivate = /riêng tư|private/i.test(innerContent) || /riêng tư|private/i.test(html.slice(match.index, match.index + 300))
    const privacy: 'public' | 'private' = isPrivate ? 'private' : 'public'

    // Dọn dẹp tên nhóm nếu bị lẫn thông tin thành viên
    name = name.split(/·|•|\d+\s*(?:thành viên|members)/i)[0].trim()

    seenIds.add(rawId)
    groups.push({
      fb_id: rawId,
      name,
      avatar_url: avatarUrl,
      privacy
    })
  }

  return groups
}

export class TargetService {
  /**
   * Lấy danh sách toàn bộ các đích đăng (Trang cá nhân & Nhóm) của tài khoản.
   */
  public listTargets(accountId = 'primary_account'): TargetDTO[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM targets WHERE account_id = ? ORDER BY type DESC, name ASC')
      .all(accountId) as any[]

    return rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      folder_id: row.folder_id,
      fb_id: row.fb_id,
      name: row.name,
      type: row.type,
      privacy: row.privacy,
      avatar_url: row.avatar_url,
      last_synced_at: row.last_synced_at
    }))
  }

  /**
   * Lấy danh sách các thư mục đích của tài khoản.
   */
  public listFolders(accountId = 'primary_account'): FolderDTO[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM target_folders WHERE account_id = ? ORDER BY name ASC')
      .all(accountId) as any[]

    return rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      name: row.name,
      created_at: row.created_at
    }))
  }

  /**
   * Tạo thư mục đích mới.
   */
  public createFolder(name: string, accountId = 'primary_account'): FolderDTO {
    const db = getDatabase()
    const id = `folder_${randomUUID().replace(/-/g, '').slice(0, 12)}`

    const stmt = db.prepare(`
      INSERT INTO target_folders (id, account_id, name, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)
    stmt.run(id, accountId, name.trim())

    return {
      id,
      account_id: accountId,
      name: name.trim()
    }
  }

  /**
   * Gán hoặc hủy gán target vào thư mục.
   */
  public assignToFolder(targetId: string, folderId: string | null): void {
    const db = getDatabase()
    const stmt = db.prepare('UPDATE targets SET folder_id = ? WHERE id = ?')
    stmt.run(folderId, targetId)
  }

  /**
   * Đồng bộ toàn bộ danh sách Trang cá nhân và Nhóm Facebook từ phiên hiện tại vào SQLite.
   */
  public async syncTargetsFromFacebook(accountId = 'primary_account'): Promise<TargetSyncResultDTO> {
    const db = getDatabase()

    // 1. Kiểm tra tính hợp lệ của tài khoản
    const account = db
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any

    if (!account || account.status !== 'connected') {
      const error: any = new Error('Tài khoản Facebook chưa được kết nối hoặc đang yêu cầu xác thực')
      error.code = 'AUTH_REQUIRED'
      throw error
    }

    const fbUserId = account.fb_user_id || 'unknown'
    const accountName = account.name || 'Trang cá nhân'
    const accountAvatar = account.avatar_url || null

    // 2. Lưu hoặc cập nhật Target loại Personal Profile
    const profileTargetId = `target_${accountId}_${fbUserId}`
    const upsertProfileStmt = db.prepare(`
      INSERT INTO targets (id, account_id, folder_id, fb_id, name, type, privacy, avatar_url, last_synced_at)
      VALUES (?, ?, NULL, ?, ?, 'profile', 'public', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar_url = COALESCE(excluded.avatar_url, targets.avatar_url),
        last_synced_at = CURRENT_TIMESTAMP
    `)
    upsertProfileStmt.run(profileTargetId, accountId, fbUserId, accountName, accountAvatar)

    const profileTarget: TargetDTO = {
      id: profileTargetId,
      account_id: accountId,
      folder_id: null,
      fb_id: fbUserId,
      name: accountName,
      type: 'profile',
      privacy: 'public',
      avatar_url: accountAvatar,
      last_synced_at: new Date().toISOString()
    }

    // 3. Trích xuất danh sách nhóm từ session Facebook
    let extractedGroups: RawFacebookGroup[] = []

    if (session && typeof session.fromPartition === 'function') {
      try {
        const fbSession = session.fromPartition(FB_PARTITION)
        if (typeof (fbSession as any).fetch === 'function') {
          const response = await (fbSession as any).fetch('https://m.facebook.com/groups/?seemore', {
            method: 'GET',
            headers: {
              'User-Agent': fbSession.getUserAgent()
            }
          })

          if (response.ok) {
            const html = await response.text()
            extractedGroups = parseFacebookGroupsHtml(html)
          }
        }
      } catch (err) {
        console.warn('[TargetService] Fetching groups via session.fetch failed, attempting browser fallback:', err)
      }

      // Fallback: nếu session.fetch không có kết quả, thử qua offscreen BrowserWindow
      if (extractedGroups.length === 0 && BrowserWindow) {
        try {
          const offscreenWin = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
              partition: FB_PARTITION,
              contextIsolation: true,
              nodeIntegration: false
            }
          })

          await offscreenWin.loadURL('https://m.facebook.com/groups/?seemore')
          const pageHtml = await offscreenWin.webContents.executeJavaScript('document.documentElement.outerHTML')
          extractedGroups = parseFacebookGroupsHtml(pageHtml)
          offscreenWin.destroy()
        } catch (winErr) {
          console.warn('[TargetService] Offscreen window group extraction failed:', winErr)
        }
      }
    }

    // 4. Lưu bền vững danh sách nhóm vào SQLite trong Transaction
    const upsertGroupStmt = db.prepare(`
      INSERT INTO targets (id, account_id, folder_id, fb_id, name, type, privacy, avatar_url, last_synced_at)
      VALUES (?, ?, NULL, ?, ?, 'group', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        privacy = excluded.privacy,
        avatar_url = COALESCE(excluded.avatar_url, targets.avatar_url),
        last_synced_at = CURRENT_TIMESTAMP
    `)

    const saveTransaction = db.transaction((groups: RawFacebookGroup[]) => {
      for (const group of groups) {
        const targetId = `target_${accountId}_${group.fb_id}`
        upsertGroupStmt.run(
          targetId,
          accountId,
          group.fb_id,
          group.name,
          group.privacy,
          group.avatar_url
        )
      }
    })

    saveTransaction(extractedGroups)

    // 5. Trả về toàn bộ danh sách targets sau khi đồng bộ
    const allTargets = this.listTargets(accountId)

    return {
      targets: allTargets,
      syncedCount: extractedGroups.length,
      profileTarget
    }
  }
}

export const targetService = new TargetService()
