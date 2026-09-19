import { BrowserWindow, session } from 'electron'

export const FB_PARTITION = 'persist:fb_main'
export const FB_BASE_URL = 'https://www.facebook.com'

export interface LoginResult {
  success: boolean
  cancelled?: boolean
  userId?: string
}

/**
 * Kiểm tra xem một URL có phải là trang chủ / Newsfeed Facebook sau khi đăng nhập thành công hay không.
 * Các URL đăng nhập, checkpoint hoặc khôi phục mật khẩu sẽ bị loại trừ.
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

export class SessionService {
  private loginWindow: BrowserWindow | null = null
  private pendingPromiseResolver: ((result: LoginResult) => void) | null = null
  private autoCloseTimer: NodeJS.Timeout | null = null

  /**
   * Mở cửa sổ In-App Secure Browser để người dùng đăng nhập Facebook.
   * Cửa sổ sử dụng partition riêng biệt `persist:fb_main` và hỗ trợ đầy đủ 2FA.
   */
  public async openLoginWindow(parentWindow?: BrowserWindow): Promise<LoginResult> {
    // Nếu cửa sổ đăng nhập đã mở sẵn, focus vào cửa sổ hiện tại và không mở thêm
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      if (this.loginWindow.isMinimized()) {
        this.loginWindow.restore()
      }
      this.loginWindow.focus()

      return new Promise<LoginResult>((resolve) => {
        // Tiếp tục chờ vào promise hiện hành nếu có
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
      // Loại bỏ định danh Electron khỏi User-Agent để tránh Facebook chặn trình duyệt
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

      // Ngăn chặn mở cửa sổ mới ngoài ý muốn và giữ luồng xác thực bên trong cửa sổ hiện tại
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
            // Truy vấn cookie theo cả URL gốc và domain để đảm bảo bắt trọn host-only cookies
            let cookies = await fbSession.cookies.get({ url: FB_BASE_URL })
            if (!extractFacebookUserId(cookies)) {
              cookies = await fbSession.cookies.get({ domain: '.facebook.com' })
            }
            const userId = extractFacebookUserId(cookies)

            if (userId) {
              hasCompletedLogin = true
              detectedUserId = userId

              // Đếm ngược tối đa 2 giây (1.5 giây) rồi đóng cửa sổ an toàn
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

      // Giám sát các sự kiện điều hướng trang
      this.loginWindow.webContents.on('did-navigate', (_event, url) => {
        handlePossibleSuccess(url)
      })

      this.loginWindow.webContents.on('did-navigate-in-page', (_event, url) => {
        handlePossibleSuccess(url)
      })

      // Đóng cửa sổ an toàn khi người dùng tự tắt
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

      // Điều hướng tới Facebook
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
