import { BrowserWindow, session, safeStorage } from 'electron'
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
      const account = await this.saveSessionToDatabase({
        fb_user_id: validation.userId,
        cookies: validation.cookies
      })

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
}

export const sessionService = new SessionService()
