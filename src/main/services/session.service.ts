import { BrowserWindow, session, safeStorage, shell } from 'electron'
import { getDatabase } from '../database/connection'
import type { AccountDTO, IPCResult } from '../../preload/types'

export const FB_PARTITION = 'persist:fb_main'
export const FB_BASE_URL = 'https://www.facebook.com'

export interface LoginResult {
  success: boolean
  cancelled?: boolean
  userId?: string
}

export interface StoredSessionPayload {
  cookies: Array<{
    name: string
    value: string
    domain?: string
    path?: string
    secure?: boolean
    httpOnly?: boolean
    sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
    expirationDate?: number
    expires?: number
  }>
  lastSyncedAt: string
}

/**
 * Mã hóa chuỗi dữ liệu phiên bằng Electron safeStorage (DPAPI trên Windows / Keychain trên macOS).
 * Tự động chuyển sang fallback UTF-8 buffer an toàn nếu môi trường không có hardware keychain.
 */
export function encryptSession(plainText: string): Buffer {
  if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plainText)
  }
  return Buffer.from(plainText, 'utf-8')
}

/**
 * Giải mã dữ liệu BLOB phiên bằng Electron safeStorage.
 */
export function decryptSession(encrypted: Buffer): string {
  if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(encrypted)
    } catch {
      return encrypted.toString('utf-8')
    }
  }
  return encrypted.toString('utf-8')
}

/**
 * Kiểm tra xem một URL có phải là trang chủ / Newsfeed Facebook sau khi đăng nhập thành công hay không.
 */
export function isFacebookNewsfeed(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    const validHosts = ['www.facebook.com', 'web.facebook.com', 'm.facebook.com', 'facebook.com']
    if (!validHosts.includes(url.hostname)) {
      return false
    }

    const pathname = url.pathname
    const isHome = pathname === '/' || pathname === '' || pathname === '/home.php'
    const isAuthFlow =
      pathname.includes('/login') ||
      pathname.includes('/checkpoint') ||
      pathname.includes('/recover') ||
      pathname.includes('/two_step_verification')

    return isHome && !isAuthFlow
  } catch {
    return false
  }
}

/**
 * Kiểm tra sự tồn tại của cookie c_user (chứa User ID của Facebook).
 */
export function extractFacebookUserId(cookies: Array<{ name: string; value: string }>): string | null {
  const cUser = cookies.find((c) => c.name === 'c_user')
  return cUser && cUser.value ? cUser.value : null
}

/**
 * Kiểm tra và phân tích cú pháp chuỗi Cookie / Session JSON nhập từ người dùng.
 * Yêu cầu bắt buộc phải chứa các cookie xác thực cốt lõi của Facebook (c_user và xs).
 */
export function validateAndParseSessionJson(jsonStr: string): {
  valid: boolean
  error?: string
  cookies?: any[]
  userId?: string
} {
  try {
    const cleanJson = jsonStr.replace(/^\uFEFF/, '').trim()
    const parsed = JSON.parse(cleanJson)
    let cookieList: any[] = []

    if (Array.isArray(parsed)) {
      cookieList = parsed
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cookies)) {
      cookieList = parsed.cookies
    } else {
      return {
        valid: false,
        error: 'Định dạng JSON không hợp lệ. Vui lòng cung cấp mảng cookies hoặc đối tượng storageState.'
      }
    }

    const cUserCookie = cookieList.find((c: any) => c.name === 'c_user')
    const xsCookie = cookieList.find((c: any) => c.name === 'xs')

    if (!cUserCookie || !cUserCookie.value) {
      return {
        valid: false,
        error: 'Thiếu cookie định danh "c_user" hợp lệ của Facebook.'
      }
    }

    if (!xsCookie || !xsCookie.value) {
      return {
        valid: false,
        error: 'Thiếu cookie phiên "xs" hợp lệ của Facebook.'
      }
    }

    return {
      valid: true,
      cookies: cookieList,
      userId: String(cUserCookie.value)
    }
  } catch (err: any) {
    return {
      valid: false,
      error: `Cú pháp JSON không hợp lệ: ${err?.message || 'Lỗi phân tích'}`
    }
  }
}

export class SessionService {
  private loginWindow: BrowserWindow | null = null
  private pendingPromiseResolver: ((result: LoginResult) => void) | null = null
  private autoCloseTimer: NodeJS.Timeout | null = null

  /**
   * Lưu trữ phiên làm việc vào SQLite bảng `accounts` với mã hóa phần cứng safeStorage.
   */
  public async saveSessionToDatabase(accountData: {
    fb_user_id: string
    name?: string
    avatar_url?: string | null
    cookies: any[]
  }): Promise<AccountDTO> {
    const db = getDatabase()
    const payload: StoredSessionPayload = {
      cookies: accountData.cookies,
      lastSyncedAt: new Date().toISOString()
    }

    const encryptedBlob = encryptSession(JSON.stringify(payload))
    const accountName = accountData.name || `Facebook User (${accountData.fb_user_id})`
    const avatarUrl = accountData.avatar_url || null

    const stmt = db.prepare(`
      INSERT INTO accounts (id, fb_user_id, name, avatar_url, encrypted_session, status, status_reason, last_synced_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'connected', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        fb_user_id = excluded.fb_user_id,
        name = CASE
          WHEN excluded.name LIKE 'Facebook User (%)' AND accounts.name IS NOT NULL AND accounts.name NOT LIKE 'Facebook User (%)'
          THEN accounts.name
          ELSE excluded.name
        END,
        avatar_url = COALESCE(excluded.avatar_url, accounts.avatar_url),
        encrypted_session = excluded.encrypted_session,
        status = 'connected',
        status_reason = NULL,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `)

    stmt.run('primary_account', accountData.fb_user_id, accountName, avatarUrl, encryptedBlob)

    return {
      id: 'primary_account',
      fb_user_id: accountData.fb_user_id,
      name: accountName,
      avatar_url: avatarUrl,
      status: 'connected',
      status_reason: null,
      last_synced_at: payload.lastSyncedAt
    }
  }

  /**
   * Khôi phục phiên làm việc từ SQLite: giải mã safeStorage và nạp lại cookies vào partition `persist:fb_main`.
   */
  public async restoreSessionFromDatabase(): Promise<AccountDTO | null> {
    try {
      const db = getDatabase()
      const row = db
        .prepare('SELECT * FROM accounts WHERE id = ? AND status = ? LIMIT 1')
        .get('primary_account', 'connected') as any

      if (!row || !row.encrypted_session) {
        return null
      }

      const decryptedJson = decryptSession(row.encrypted_session)
      const payload = JSON.parse(decryptedJson) as StoredSessionPayload

      if (payload && Array.isArray(payload.cookies)) {
        if (session && typeof session.fromPartition === 'function') {
          const fbSession = session.fromPartition(FB_PARTITION)
          for (const cookie of payload.cookies) {
            try {
              const domain = cookie.domain
                ? cookie.domain.startsWith('.')
                  ? cookie.domain.slice(1)
                  : cookie.domain
                : 'facebook.com'
              const url = `https://${domain}${cookie.path || '/'}`

              await fbSession.cookies.set({
                url,
                name: cookie.name,
                value: cookie.value,
                domain,
                path: cookie.path || '/',
                secure: cookie.secure !== undefined ? Boolean(cookie.secure) : true,
                httpOnly: cookie.httpOnly !== undefined ? Boolean(cookie.httpOnly) : false,
                sameSite: cookie.sameSite,
                expirationDate: cookie.expirationDate
              })
            } catch (err) {
              // Bỏ qua lỗi cookie cá biệt không quan trọng
            }
          }
        }
      }

      return {
        id: row.id,
        fb_user_id: row.fb_user_id,
        name: row.name,
        avatar_url: row.avatar_url,
        status: 'connected',
        status_reason: null,
        last_synced_at: row.last_synced_at
      }
    } catch (error) {
      console.error('[SessionService] Lỗi khi tự phục hồi phiên đăng nhập:', error)
      return null
    }
  }

  /**
   * Nhập phiên từ chuỗi Cookie / Session JSON hợp lệ, nạp vào partition và mã hóa phần cứng lưu SQLite.
   */
  public async importSessionJson(jsonStr: string): Promise<IPCResult<AccountDTO>> {
    const validation = validateAndParseSessionJson(jsonStr)
    if (!validation.valid || !validation.cookies || !validation.userId) {
      return {
        success: false,
        error: {
          code: 'INVALID_SESSION_JSON',
          message: validation.error || 'Dữ liệu Cookie JSON không hợp lệ'
        }
      }
    }

    try {
      if (session && typeof session.fromPartition === 'function') {
        const fbSession = session.fromPartition(FB_PARTITION)

        // Nạp danh sách cookies vào partition
        for (const cookie of validation.cookies) {
          try {
            const domain = cookie.domain
              ? cookie.domain.startsWith('.')
                ? cookie.domain.slice(1)
                : cookie.domain
              : 'facebook.com'
            const url = `https://${domain}${cookie.path || '/'}`

            await fbSession.cookies.set({
              url,
              name: cookie.name,
              value: cookie.value,
              domain,
              path: cookie.path || '/',
              secure: cookie.secure !== undefined ? Boolean(cookie.secure) : true,
              httpOnly: cookie.httpOnly !== undefined ? Boolean(cookie.httpOnly) : false,
              sameSite: cookie.sameSite,
              expirationDate: cookie.expirationDate
            })
          } catch {
            // Bỏ qua lỗi cookie cá biệt
          }
        }
      }

      // Mã hóa phần cứng và lưu vào SQLite
      let account = await this.saveSessionToDatabase({
        fb_user_id: validation.userId,
        cookies: validation.cookies
      })

      // Tự động lấy tên hiển thị và ảnh đại diện thật từ Facebook
      try {
        const profile = await this.fetchUserProfile(validation.userId)
        if (profile.name || profile.avatar_url) {
          const updated = await this.updateAccountProfile(profile)
          if (updated) {
            account = updated
          }
        }
      } catch (profileErr) {
        console.warn('[SessionService] Lỗi khi tự động lấy profile:', profileErr)
      }

      return {
        success: true,
        data: account
      }
    } catch (error: any) {
      console.error('[SessionService] Lỗi khi nhập session JSON:', error)
      return {
        success: false,
        error: {
          code: 'IMPORT_FAILED',
          message: error?.message || 'Không thể lưu phiên đăng nhập vào cơ sở dữ liệu'
        }
      }
    }
  }

  /**
   * Tự động lấy tên hiển thị và ảnh đại diện thật của tài khoản Facebook.
   * Kết hợp truy vấn Graph CDN và trích xuất profile từ Facebook.
   */
  public async fetchUserProfile(fbUserId: string): Promise<{
    name: string | null
    avatar_url: string | null
  }> {
    let name: string | null = null
    let avatarUrl: string | null = null

    // 1. Lấy ảnh đại diện (avatar) qua Graph API redirect hoặc direct url
    try {
      const avatarRes = await fetch(`https://graph.facebook.com/${fbUserId}/picture?type=normal`, {
        method: 'GET',
        redirect: 'manual'
      })
      const loc = avatarRes.headers.get('location')
      if (loc) {
        avatarUrl = loc
      } else {
        avatarUrl = `https://graph.facebook.com/${fbUserId}/picture?type=normal`
      }
    } catch (err) {
      console.warn('[SessionService] Lấy avatar qua Graph API thất bại:', err)
      avatarUrl = `https://graph.facebook.com/${fbUserId}/picture?type=normal`
    }

    // 2. Lấy tên hiển thị tài khoản từ Facebook
    const fbSession = session && typeof session.fromPartition === 'function'
      ? session.fromPartition(FB_PARTITION)
      : null

    // Cách 1: Fetch trang cá nhân với cookies của session
    if (fbSession && typeof (fbSession as any).fetch === 'function') {
      try {
        const profileRes = await (fbSession as any).fetch(`https://www.facebook.com/${fbUserId}`, {
          method: 'GET',
          headers: {
            'User-Agent': fbSession.getUserAgent() || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        })
        if (profileRes.ok) {
          const html = await profileRes.text()
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
          if (titleMatch) {
            const cleanTitle = titleMatch[1].replace(/\s*\|\s*Facebook/i, '').trim()
            if (
              cleanTitle &&
              !cleanTitle.toLowerCase().includes('facebook') &&
              !cleanTitle.toLowerCase().includes('đăng nhập') &&
              !cleanTitle.toLowerCase().includes('log in')
            ) {
              name = cleanTitle
            }
          }
        }
      } catch (err) {
        console.warn('[SessionService] Fetch profile via fbSession failed:', err)
      }
    }

    // Cách 2: Public fetch qua https://www.facebook.com/${fbUserId}
    if (!name) {
      try {
        const publicRes = await fetch(`https://www.facebook.com/${fbUserId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        })
        if (publicRes.ok) {
          const html = await publicRes.text()
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
          if (titleMatch) {
            const cleanTitle = titleMatch[1].replace(/\s*\|\s*Facebook/i, '').trim()
            if (
              cleanTitle &&
              !cleanTitle.toLowerCase().includes('facebook') &&
              !cleanTitle.toLowerCase().includes('đăng nhập') &&
              !cleanTitle.toLowerCase().includes('log in')
            ) {
              name = cleanTitle
            }
          }
        }
      } catch (err) {
        console.warn('[SessionService] Public fetch profile failed:', err)
      }
    }

    // Cách 3: mbasic.facebook.com
    if (!name && fbSession && typeof (fbSession as any).fetch === 'function') {
      try {
        const mbasicRes = await (fbSession as any).fetch('https://mbasic.facebook.com/profile.php', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
        if (mbasicRes.ok) {
          const html = await mbasicRes.text()
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
          if (titleMatch) {
            const cleanTitle = titleMatch[1].replace(/\s*\|\s*Facebook/i, '').trim()
            if (
              cleanTitle &&
              !cleanTitle.toLowerCase().includes('facebook') &&
              !cleanTitle.toLowerCase().includes('đăng nhập')
            ) {
              name = cleanTitle
            }
          }
        }
      } catch (err) {
        console.warn('[SessionService] mbasic fetch profile failed:', err)
      }
    }

    return { name, avatar_url: avatarUrl }
  }

  /**
   * Cập nhật thông tin profile (name, avatar_url) vào SQLite và trả về AccountDTO mới nhất.
   */
  public async updateAccountProfile(data: {
    name?: string | null
    avatar_url?: string | null
  }): Promise<AccountDTO | null> {
    const db = getDatabase()
    const row = db.prepare("SELECT * FROM accounts WHERE id = 'primary_account'").get() as any
    if (!row) return null

    const newName = data.name || row.name
    const newAvatar = data.avatar_url || row.avatar_url

    db.prepare(`
      UPDATE accounts
      SET name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 'primary_account'
    `).run(newName, newAvatar)

    return {
      id: row.id,
      fb_user_id: row.fb_user_id,
      name: newName,
      avatar_url: newAvatar,
      status: row.status,
      status_reason: row.status_reason,
      last_synced_at: row.last_synced_at
    }
  }

  /**
   * Xóa sạch phiên đăng nhập trong SQLite và xóa cookies trong partition persist:fb_main.
   */
  public async clearSession(): Promise<void> {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM accounts').run()
    } catch (err) {
      console.error('[SessionService] Lỗi khi xóa bảng accounts:', err)
    }

    try {
      if (session && typeof session.fromPartition === 'function') {
        const fbSession = session.fromPartition(FB_PARTITION)
        await fbSession.clearStorageData({
          storages: ['cookies', 'localstorage']
        })
      }
    } catch (err) {
      console.error('[SessionService] Lỗi khi dọn dẹp storage partition:', err)
    }
  }

  /**
   * Lấy storageState đã giải mã phục vụ cho Playwright Worker.
   * Chuyển đổi cấu trúc cookies tương thích hoàn toàn với Playwright context.
   */
  public async getDecryptedStorageState(): Promise<{
    cookies: Array<{
      name: string
      value: string
      domain: string
      path: string
      expires: number
      httpOnly: boolean
      secure: boolean
      sameSite: 'Strict' | 'Lax' | 'None'
    }>
    origins: any[]
  } | null> {
    try {
      const db = getDatabase()
      const row = db
        .prepare('SELECT encrypted_session FROM accounts WHERE id = ? AND status = ? LIMIT 1')
        .get('primary_account', 'connected') as any

      if (!row || !row.encrypted_session) {
        return null
      }

      const decryptedJson = decryptSession(row.encrypted_session)
      const payload = JSON.parse(decryptedJson) as StoredSessionPayload

      if (!payload || !Array.isArray(payload.cookies)) {
        return null
      }

      const playwrightCookies = payload.cookies.map((c) => {
        let sameSite: 'Strict' | 'Lax' | 'None' = 'None'
        if (c.sameSite?.toLowerCase() === 'strict') sameSite = 'Strict'
        else if (c.sameSite?.toLowerCase() === 'lax') sameSite = 'Lax'

        let domain = c.domain || '.facebook.com'
        if (!domain.startsWith('.') && !domain.includes('facebook.com')) {
          domain = '.facebook.com'
        }

        return {
          name: c.name,
          value: c.value,
          domain,
          path: c.path || '/',
          expires: c.expires || c.expirationDate || -1,
          httpOnly: Boolean(c.httpOnly),
          secure: c.secure !== undefined ? Boolean(c.secure) : true,
          sameSite
        }
      })

      return {
        cookies: playwrightCookies,
        origins: []
      }
    } catch (err) {
      console.error('[SessionService] Lỗi khi lấy decrypted storageState:', err)
      return null
    }
  }

  /**
   * Đồng bộ phiên 2 chiều (Two-Way Session Sync): Nhận storageState mới nhất từ Playwright Worker,
   * mã hóa qua safeStorage và cập nhật lại bảng accounts trong SQLite.
   */
  public async syncSessionFromStorageState(storageState: { cookies: any[]; origins?: any[] }): Promise<boolean> {
    try {
      if (!storageState || !Array.isArray(storageState.cookies) || storageState.cookies.length === 0) {
        return false
      }

      const db = getDatabase()
      const row = db
        .prepare('SELECT fb_user_id, name, avatar_url FROM accounts WHERE id = ?')
        .get('primary_account') as any

      if (!row) {
        return false
      }

      const payload: StoredSessionPayload = {
        cookies: storageState.cookies,
        lastSyncedAt: new Date().toISOString()
      }

      const encryptedBlob = encryptSession(JSON.stringify(payload))

      db.prepare(`
        UPDATE accounts
        SET encrypted_session = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = 'primary_account'
      `).run(encryptedBlob)

      // Cập nhật cookies vào Electron partition nếu session khả dụng
      if (session && typeof session.fromPartition === 'function') {
        const fbSession = session.fromPartition(FB_PARTITION)
        for (const cookie of storageState.cookies) {
          try {
            const domain = cookie.domain
              ? cookie.domain.startsWith('.')
                ? cookie.domain.slice(1)
                : cookie.domain
              : 'facebook.com'
            const url = `https://${domain}${cookie.path || '/'}`

            await fbSession.cookies.set({
              url,
              name: cookie.name,
              value: cookie.value,
              domain,
              path: cookie.path || '/',
              secure: cookie.secure !== undefined ? Boolean(cookie.secure) : true,
              httpOnly: cookie.httpOnly !== undefined ? Boolean(cookie.httpOnly) : false,
              sameSite:
                cookie.sameSite?.toLowerCase() === 'strict'
                  ? 'strict'
                  : cookie.sameSite?.toLowerCase() === 'lax'
                    ? 'lax'
                    : 'no_restriction',
              expirationDate: cookie.expires || cookie.expirationDate
            })
          } catch {}
        }
      }

      return true
    } catch (err) {
      console.error('[SessionService] Lỗi khi syncSessionFromStorageState:', err)
      return false
    }
  }

  /**
   * Mở cửa sổ In-App Secure Browser để người dùng đăng nhập Facebook.
   */
  public async openLoginWindow(parentWindow?: BrowserWindow): Promise<LoginResult> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      if (this.loginWindow.isMinimized()) {
        this.loginWindow.restore()
      }
      this.loginWindow.focus()

      return new Promise<LoginResult>((resolve) => {
        const originalResolver = this.pendingPromiseResolver
        this.pendingPromiseResolver = (res) => {
          if (originalResolver) originalResolver(res)
          resolve(res)
        }
      })
    }

    return new Promise<LoginResult>((resolve) => {
      this.pendingPromiseResolver = resolve
      let hasCompletedLogin = false
      let detectedUserId: string | null = null

      const fbSession = session.fromPartition(FB_PARTITION)
      const rawUserAgent = fbSession.getUserAgent()
      const cleanUserAgent = rawUserAgent.replace(/Electron\/\S+\s?/, '')
      fbSession.setUserAgent(cleanUserAgent)

      this.loginWindow = new BrowserWindow({
        width: 980,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        parent: parentWindow || undefined,
        modal: false,
        title: 'Đăng nhập Facebook - An Toàn & Bảo Mật',
        backgroundColor: '#0B111A',
        autoHideMenuBar: true,
        webPreferences: {
          partition: FB_PARTITION,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })

      this.loginWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('facebook.com') || url.includes('meta.com') || url.includes('accountkit.com')) {
          this.loginWindow?.loadURL(url)
        }
        return { action: 'deny' }
      })

      const handlePossibleSuccess = async (currentUrl: string): Promise<void> => {
        if (hasCompletedLogin) return

        if (isFacebookNewsfeed(currentUrl)) {
          try {
            let cookies = await fbSession.cookies.get({ url: FB_BASE_URL })
            if (!extractFacebookUserId(cookies)) {
              cookies = await fbSession.cookies.get({ domain: '.facebook.com' })
            }
            const userId = extractFacebookUserId(cookies)

            if (userId) {
              hasCompletedLogin = true
              detectedUserId = userId

              // Tự động mã hóa an toàn và lưu vào SQLite
              await this.saveSessionToDatabase({
                fb_user_id: userId,
                cookies
              })

              if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer)
              this.autoCloseTimer = setTimeout(() => {
                const resolver = this.pendingPromiseResolver
                this.pendingPromiseResolver = null

                if (this.loginWindow && !this.loginWindow.isDestroyed()) {
                  this.loginWindow.close()
                  this.loginWindow = null
                }

                if (resolver) {
                  resolver({
                    success: true,
                    userId
                  })
                }
              }, 1500)
            }
          } catch (err) {
            console.error('[SessionService] Error inspecting Facebook cookies:', err)
          }
        }
      }

      this.loginWindow.webContents.on('did-navigate', (_event, url) => {
        handlePossibleSuccess(url)
      })

      this.loginWindow.webContents.on('did-navigate-in-page', (_event, url) => {
        handlePossibleSuccess(url)
      })

      this.loginWindow.on('closed', () => {
        if (this.autoCloseTimer) {
          clearTimeout(this.autoCloseTimer)
          this.autoCloseTimer = null
        }
        this.loginWindow = null

        if (this.pendingPromiseResolver) {
          const resolver = this.pendingPromiseResolver
          this.pendingPromiseResolver = null
          if (hasCompletedLogin && detectedUserId) {
            resolver({
              success: true,
              userId: detectedUserId
            })
          } else {
            resolver({
              success: false,
              cancelled: true
            })
          }
        }
      })

      this.loginWindow.loadURL(FB_BASE_URL)
    })
  }

  public isLoginWindowOpen(): boolean {
    return this.loginWindow !== null && !this.loginWindow.isDestroyed()
  }

  public closeLoginWindow(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.close()
    }
    this.loginWindow = null
  }

  private healthMonitorTimer: NodeJS.Timeout | null = null

  /**
   * Kiểm tra tính hợp lệ của phiên đăng nhập (Session Health Check).
   * Phân biệt rạch ròi giữa mất kết nối mạng internet và lỗi xác thực/thu hồi phiên thực sự.
   */
  public async checkSessionHealth(probeNetwork = true): Promise<{
    valid: boolean
    reason?: string
    isCheckpoint?: boolean
  }> {
    const db = getDatabase()
    const row = db.prepare("SELECT * FROM accounts WHERE id = 'primary_account'").get() as any
    if (!row || row.status === 'disconnected') {
      return { valid: false, reason: 'Chưa có tài khoản Facebook nào được kết nối' }
    }

    if (row.status === 'checkpoint_required') {
      return {
        valid: false,
        reason: row.status_reason || 'Tài khoản đang yêu cầu xác thực bảo mật',
        isCheckpoint: true
      }
    }

    if (session && typeof session.fromPartition === 'function') {
      try {
        const fbSession = session.fromPartition(FB_PARTITION)
        let cookies = await fbSession.cookies.get({ domain: '.facebook.com' })
        if (cookies.length === 0) {
          cookies = await fbSession.cookies.get({ url: FB_BASE_URL })
        }

        const cUser = cookies.find((c) => c.name === 'c_user')
        const xs = cookies.find((c) => c.name === 'xs')

        if (!cUser || !xs) {
          return {
            valid: false,
            reason: 'Cookie xác thực (c_user/xs) không tồn tại trong phiên'
          }
        }

        const nowSec = Math.floor(Date.now() / 1000)
        if (cUser.expirationDate && cUser.expirationDate < nowSec) {
          return {
            valid: false,
            reason: 'Cookie xác thực c_user đã hết hạn'
          }
        }
        if (xs.expirationDate && xs.expirationDate < nowSec) {
          return {
            valid: false,
            reason: 'Cookie xác thực xs đã hết hạn'
          }
        }

        if (probeNetwork && typeof (fbSession as any).fetch === 'function') {
          try {
            const response = await (fbSession as any).fetch('https://m.facebook.com/me', {
              method: 'GET',
              headers: {
                'User-Agent': fbSession.getUserAgent()
              },
              redirect: 'manual'
            })

            const location = response.headers.get('location') || ''
            if (
              response.status === 301 ||
              response.status === 302 ||
              response.status === 303 ||
              response.status === 307
            ) {
              if (location.includes('/login') || location.includes('login.php')) {
                return {
                  valid: false,
                  reason: 'Facebook đã thu hồi phiên đăng nhập (yêu cầu đăng nhập lại)',
                  isCheckpoint: false
                }
              }
              if (location.includes('/checkpoint') || location.includes('/recover')) {
                return {
                  valid: false,
                  reason: 'Facebook yêu cầu xác minh bảo mật (Checkpoint)',
                  isCheckpoint: true
                }
              }
            }
          } catch (netErr: any) {
            const errMsg = netErr?.message || ''
            const isNetworkOffline =
              errMsg.includes('ERR_INTERNET_DISCONNECTED') ||
              errMsg.includes('ERR_NAME_NOT_RESOLVED') ||
              errMsg.includes('ENOTFOUND') ||
              errMsg.includes('ECONNREFUSED') ||
              errMsg.includes('ETIMEDOUT') ||
              errMsg.includes('timeout')

            if (isNetworkOffline) {
              console.warn('[SessionService] Không thể thăm dò Facebook do lỗi kết nối mạng:', errMsg)
              return {
                valid: true,
                reason: 'Không có kết nối mạng internet, tạm thời bỏ qua probe'
              }
            }
          }
        }
      } catch (cookieErr) {
        console.error('[SessionService] Lỗi khi kiểm tra cookies:', cookieErr)
      }
    }

    return { valid: true }
  }

  /**
   * Kích hoạt Emergency Pause: cập nhật trạng thái tài khoản sang checkpoint_required,
   * chuyển toàn bộ tác vụ đang chờ trong scheduled_tasks sang paused [Paused - Auth Required],
   * và phát sự kiện IPC thông báo tới Renderer.
   */
  public async triggerEmergencyPause(
    reason: string,
    targetWindow?: BrowserWindow | null,
    screenshotPath?: string
  ): Promise<AccountDTO> {
    const db = getDatabase()
    const nowIso = new Date().toISOString()

    // 1. Cập nhật trạng thái tài khoản
    db.prepare(`
      UPDATE accounts
      SET status = 'checkpoint_required',
          status_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 'primary_account'
    `).run(reason)

    // 2. Chuyển các tác vụ đang chờ sang paused kèm AUTH_REQUIRED (bảo toàn nguyên vẹn 100%)
    db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'paused',
          error_code = 'AUTH_REQUIRED',
          error_message = '[Paused - Auth Required]',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'scheduled' OR status = 'running'
    `).run()

    // Phát âm thanh cảnh báo ngắn qua Electron shell.beep()
    try {
      if (shell && typeof shell.beep === 'function') {
        shell.beep()
      }
    } catch {
      // Bỏ qua nếu môi trường không hỗ trợ beep
    }

    const row = db.prepare("SELECT * FROM accounts WHERE id = 'primary_account'").get() as any
    const updatedAccount: AccountDTO = {
      id: row?.id || 'primary_account',
      fb_user_id: row?.fb_user_id || null,
      name: row?.name || 'Facebook User',
      avatar_url: row?.avatar_url || null,
      status: 'checkpoint_required',
      status_reason: reason,
      last_synced_at: row?.last_synced_at || nowIso
    }

    // 3. Phát sự kiện IPC tới Renderer
    const rawWindows = targetWindow
      ? [targetWindow]
      : BrowserWindow && typeof BrowserWindow.getAllWindows === 'function'
        ? BrowserWindow.getAllWindows()
        : []
    const windows = Array.isArray(rawWindows) ? rawWindows : []
    for (const win of windows) {
      if (win && typeof win.isDestroyed === 'function' && !win.isDestroyed()) {
        win.webContents?.send('account:session-refreshed', updatedAccount)
        win.webContents?.send('queue:emergency-pause', {
          reason,
          timestamp: nowIso,
          screenshotPath: screenshotPath || null,
          isCheckpoint: true
        })
      }
    }

    return updatedAccount
  }

  /**
   * Khôi phục các tác vụ bị tạm dừng do xác thực (AUTH_REQUIRED) trở lại scheduled.
   */
  public async resumeEmergencyPausedTasks(): Promise<{ resumedCount: number }> {
    const db = getDatabase()
    const result = db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'scheduled',
          error_code = NULL,
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'paused' AND error_code = 'AUTH_REQUIRED'
    `).run()

    return {
      resumedCount: result.changes
    }
  }

  /**
   * Lấy thống kê số lượng tác vụ trong hàng đợi.
   */
  public async getQueueStatus(): Promise<{
    scheduledCount: number
    authPausedCount: number
    totalCount: number
  }> {
    const db = getDatabase()
    const scheduledRow = db.prepare("SELECT COUNT(*) as count FROM scheduled_tasks WHERE status = 'scheduled'").get() as any
    const pausedRow = db.prepare("SELECT COUNT(*) as count FROM scheduled_tasks WHERE status = 'paused' AND error_code = 'AUTH_REQUIRED'").get() as any
    const totalRow = db.prepare("SELECT COUNT(*) as count FROM scheduled_tasks").get() as any

    return {
      scheduledCount: scheduledRow?.count || 0,
      authPausedCount: pausedRow?.count || 0,
      totalCount: totalRow?.count || 0
    }
  }

  /**
   * Bắt đầu tiến trình giám sát sức khỏe phiên định kỳ (mặc định 5 phút / lần).
   */
  public startHealthMonitoring(
    intervalMs = 300000,
    getMainWindow?: () => BrowserWindow | null
  ): void {
    this.stopHealthMonitoring()

    this.healthMonitorTimer = setInterval(async () => {
      try {
        const health = await this.checkSessionHealth(true)
        if (!health.valid) {
          console.warn('[SessionService] Phát hiện phiên không hợp lệ trong chu kỳ giám sát:', health.reason)
          const win = getMainWindow ? getMainWindow() : null
          await this.triggerEmergencyPause(
            health.reason || 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi',
            win
          )
        }
      } catch (err) {
        console.error('[SessionService] Lỗi trong chu kỳ giám sát phiên:', err)
      }
    }, intervalMs)
  }

  /**
   * Dừng tiến trình giám sát định kỳ.
   */
  public stopHealthMonitoring(): void {
    if (this.healthMonitorTimer) {
      clearInterval(this.healthMonitorTimer)
      this.healthMonitorTimer = null
    }
  }
}

export const sessionService = new SessionService()

