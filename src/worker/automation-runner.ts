import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { humanType, naturalScroll, uploadImages, clickPostButton, humanDelay } from './dom-actions'

export interface AutomationTaskPayload {
  id: string
  target_id: string
  target_type?: string
  resolved_spintax_text: string
  media_paths: string[]
  storageState: any
}

export interface AutomationResult {
  success: boolean
  permalink?: string
  error?: string
  newStorageState?: any
}

export class AutomationRunner {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  /**
   * Khởi chạy trình duyệt Playwright Headless Chromium với cờ vô hiệu hóa automation
   */
  async launchBrowser(executablePath?: string): Promise<Browser> {
    const launchOptions: any = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-size=1280,800'
      ]
    }

    if (executablePath) {
      launchOptions.executablePath = executablePath
    }

    this.browser = await chromium.launch(launchOptions)
    return this.browser
  }

  /**
   * Khởi tạo BrowserContext với storageState và vô hiệu hóa cờ navigator.webdriver
   */
  async createContext(storageState?: any): Promise<BrowserContext> {
    if (!this.browser) {
      await this.launchBrowser()
    }

    const contextOptions: any = {
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh'
    }

    if (storageState && storageState.cookies && storageState.cookies.length > 0) {
      contextOptions.storageState = storageState
    }

    this.context = await this.browser!.newContext(contextOptions)

    // Vô hiệu hóa cờ navigator.webdriver để tránh bị phát hiện là bot
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      })
      // Đảm bảo window.chrome tồn tại như trình duyệt thật
      ;(window as any).chrome = {
        runtime: {}
      }
    })

    return this.context
  }

  /**
   * Thực thi trọn vẹn quy trình đăng bài vào Nhóm Facebook
   */
  async executePost(task: AutomationTaskPayload): Promise<AutomationResult> {
    try {
      this.context = await this.createContext(task.storageState)
      const page = await this.context.newPage()

      // 1. Xác định URL trang đích
      let targetUrl = `https://www.facebook.com/groups/${task.target_id}`
      if (task.target_id.startsWith('http://') || task.target_id.startsWith('https://')) {
        targetUrl = task.target_id
      }

      console.log(`[Worker:AutomationRunner] Điều hướng tới ${targetUrl}`)
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

      // 2. Kiểm tra tính hợp lệ của phiên làm việc
      const currentUrl = page.url()
      if (currentUrl.includes('/login') || currentUrl.includes('/two_step_verification')) {
        return {
          success: false,
          error: 'AUTH_SESSION_INVALID: Phiên đăng nhập đã hết hạn hoặc bị đăng xuất'
        }
      }

      // 3. Cuộn trang nhẹ để kích hoạt tải các thành phần giao diện
      await naturalScroll(page, 200)
      await humanDelay(1000, 2000)

      // 4. Tìm và nhấp vào ô mở hộp thoại đăng bài
      const createPostTriggerSelectors = [
        'div[role="button"]:has-text("Bạn viết gì đi...")',
        'div[role="button"]:has-text("Bạn đang nghĩ gì thế?")',
        'div[role="button"]:has-text("Write something...")',
        'div[role="button"]:has-text("Tạo bài viết công khai")',
        'div[role="button"]:has-text("Tạo bài viết")',
        'div[role="region"] div[role="button"]:has-text("viết")'
      ]

      let triggerFound = false
      for (const selector of createPostTriggerSelectors) {
        const trigger = page.locator(selector).first()
        if (await trigger.isVisible()) {
          await trigger.click()
          triggerFound = true
          break
        }
      }

      if (!triggerFound) {
        // Fallback: Tìm bất kỳ ô nào có role="button" chứa từ khóa liên quan đến đăng bài
        const fallbackTrigger = page.locator('div[aria-label*="Tạo bài viết"], div[aria-label*="Create post"]').first()
        if (await fallbackTrigger.isVisible()) {
          await fallbackTrigger.click()
          triggerFound = true
        }
      }

      if (!triggerFound) {
        return {
          success: false,
          error: 'ELEMENT_NOT_FOUND: Không tìm thấy ô mở khung tạo bài viết trên trang nhóm'
        }
      }

      await humanDelay(1000, 1500)

      // 5. Tìm ô nhập văn bản trong modal/popup vừa mở
      const editorSelectors = [
        'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[aria-label*="Bạn đang nghĩ gì"][role="textbox"]',
        'div[aria-label*="Tạo bài viết"][role="textbox"]'
      ]

      let editorLocator = null
      for (const sel of editorSelectors) {
        const loc = page.locator(sel).first()
        if (await loc.isVisible()) {
          editorLocator = loc
          break
        }
      }

      if (!editorLocator) {
        return {
          success: false,
          error: 'ELEMENT_NOT_FOUND: Không tìm thấy ô nhập nội dung bài viết'
        }
      }

      // 6. Gõ nội dung văn bản mô phỏng nhịp người thật
      console.log(`[Worker:AutomationRunner] Đang gõ nội dung (độ dài: ${task.resolved_spintax_text.length} ký tự)`)
      await humanType(page, editorLocator, task.resolved_spintax_text, { minDelay: 50, maxDelay: 150 })

      // 7. Tải lên hình ảnh đính kèm nếu có
      if (task.media_paths && task.media_paths.length > 0) {
        console.log(`[Worker:AutomationRunner] Đang tải lên ${task.media_paths.length} hình ảnh đính kèm`)
        const uploaded = await uploadImages(page, task.media_paths)
        if (!uploaded) {
          console.warn('[Worker:AutomationRunner] Không thể tải ảnh tự động, tiếp tục đăng phần text')
        }
      }

      // 8. Bấm nút Đăng bài
      console.log('[Worker:AutomationRunner] Đang bấm nút Đăng bài')
      const posted = await clickPostButton(page)
      if (!posted) {
        return {
          success: false,
          error: 'ELEMENT_NOT_FOUND: Không tìm thấy hoặc không thể nhấp nút Đăng bài'
        }
      }

      // 9. Chờ bài đăng được xử lý (chờ modal đóng hoặc tối đa 10s)
      try {
        await page.waitForSelector('div[role="dialog"]', { state: 'detached', timeout: 10000 })
      } catch {
        // Modal có thể tự đóng hoặc ẩn đi
      }

      await humanDelay(2000, 3000)

      // 10. Trích xuất storageState mới nhất (Two-Way Session Sync)
      const newStorageState = await this.context.storageState()

      return {
        success: true,
        newStorageState
      }
    } catch (err: any) {
      console.error('[Worker:AutomationRunner] Lỗi thực thi tác vụ:', err)
      return {
        success: false,
        error: err?.message || 'Lỗi không xác định khi thực thi tự động hóa'
      }
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Dọn dẹp context và browser
   */
  async cleanup(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close()
        this.context = null
      }
      if (this.browser) {
        await this.browser.close()
        this.browser = null
      }
    } catch (err) {
      console.error('[Worker:AutomationRunner] Lỗi khi dọn dẹp browser context:', err)
    }
  }
}
