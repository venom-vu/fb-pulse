import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import {
  humanType,
  naturalScroll,
  uploadImages,
  clickPostButton,
  humanDelay,
  checkAdminApprovalPending,
  extractPostPermalink,
  detectCheckpointOrBlock
} from './dom-actions'

export interface AutomationTaskPayload {
  id: string
  target_id: string
  target_type?: string
  resolved_spintax_text: string
  media_paths: string[]
  storageState: any
  screenshotDir?: string
}

export interface AutomationResult {
  success: boolean
  status?: 'success' | 'admin_pending' | 'failed'
  permalink?: string
  errorCode?: string
  error?: string
  screenshotPath?: string
  newStorageState?: any
  isCheckpoint?: boolean
}

export class AutomationRunner {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  /**
   * Phân loại mã lỗi dựa trên nội dung thông điệp lỗi
   */
  classifyErrorCode(errorMessage: string): string {
    const msg = errorMessage.toLowerCase()
    if (
      msg.includes('checkpoint') ||
      msg.includes('chặn tính năng') ||
      msg.includes('bị chặn') ||
      msg.includes('action blocked') ||
      msg.includes('tài khoản của bạn đã bị khóa') ||
      msg.includes('temporarily blocked') ||
      msg.includes('xác minh danh tính')
    ) {
      return 'CHECKPOINT_DETECTED'
    }
    if (
      msg.includes('network') ||
      msg.includes('err_internet_disconnected') ||
      msg.includes('err_name_not_resolved') ||
      msg.includes('net::') ||
      msg.includes('timeouterror') ||
      msg.includes('timeout') ||
      msg.includes('navigation timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnrefused')
    ) {
      return 'NETWORK_TIMEOUT'
    }
    if (msg.includes('element_not_found') || msg.includes('element') || msg.includes('selector')) {
      return 'DOM_TIMEOUT'
    }
    return 'EXECUTION_ERROR'
  }

  /**
   * Chụp ảnh màn hình khi xảy ra lỗi sự cố
   */
  async captureErrorScreenshot(
    page: Page | null,
    task: AutomationTaskPayload,
    prefix = 'error'
  ): Promise<string | undefined> {
    if (!page || !task.screenshotDir) return undefined
    try {
      if (!existsSync(task.screenshotDir)) {
        mkdirSync(task.screenshotDir, { recursive: true })
      }
      const screenshotPath = join(task.screenshotDir, `${prefix}-${task.id}-${Date.now()}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
      return screenshotPath
    } catch (err) {
      console.warn('[Worker:AutomationRunner] Lỗi khi chụp ảnh màn hình sự cố:', err)
      return undefined
    }
  }

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
    let page: Page | null = null
    try {
      this.context = await this.createContext(task.storageState)
      page = await this.context.newPage()

      // 1. Xác định URL trang đích
      let targetUrl = `https://www.facebook.com/groups/${task.target_id}`
      if (task.target_id.startsWith('http://') || task.target_id.startsWith('https://')) {
        targetUrl = task.target_id
      } else if (task.target_type === 'profile') {
        targetUrl = 'https://www.facebook.com/me'
      }

      console.log(`[Worker:AutomationRunner] Điều hướng tới ${targetUrl}`)
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

      // 1.1 Kiểm tra Checkpoint hoặc chặn tính năng ngay sau khi mở trang
      const initialCheckpoint = await detectCheckpointOrBlock(page)
      if (initialCheckpoint.isCheckpoint) {
        console.warn('[Worker:AutomationRunner] Phát hiện Checkpoint hoặc chặn tính năng:', initialCheckpoint.reason)
        const screenshotPath = await this.captureErrorScreenshot(page, task, 'checkpoint')
        return {
          success: false,
          status: 'failed',
          errorCode: 'CHECKPOINT_DETECTED',
          error: initialCheckpoint.reason || 'Facebook yêu cầu xác minh danh tính (Checkpoint)',
          screenshotPath,
          isCheckpoint: true
        }
      }

      // 2. Kiểm tra tính hợp lệ của phiên làm việc
      const currentUrl = page.url()
      if (currentUrl.includes('/checkpoint') || currentUrl.includes('/recover')) {
        console.warn('[Worker:AutomationRunner] URL chuyển hướng sang checkpoint:', currentUrl)
        const screenshotPath = await this.captureErrorScreenshot(page, task, 'checkpoint')
        return {
          success: false,
          status: 'failed',
          errorCode: 'CHECKPOINT_DETECTED',
          error: 'Facebook yêu cầu xác minh bảo mật (Checkpoint)',
          screenshotPath,
          isCheckpoint: true
        }
      }

      if (currentUrl.includes('/login') || currentUrl.includes('/two_step_verification')) {
        return {
          success: false,
          status: 'failed',
          errorCode: 'AUTH_SESSION_INVALID',
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
        'div[role="button"]:has-text("Bạn đang nghĩ gì?")',
        'div[role="button"]:has-text("Write something...")',
        'div[role="button"]:has-text("What\'s on your mind?")',
        'div[role="button"]:has-text("Tạo bài viết công khai")',
        'div[role="button"]:has-text("Tạo bài viết")',
        'div[role="region"] div[role="button"]:has-text("viết")',
        'div[role="region"] div[role="button"]:has-text("nghĩ")'
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
        const fallbackTrigger = page
          .locator(
            'div[aria-label*="Tạo bài viết"], div[aria-label*="Create post"], div[aria-label*="Bạn đang nghĩ gì"], div[aria-label*="What\'s on your mind"]'
          )
          .first()
        if (await fallbackTrigger.isVisible()) {
          await fallbackTrigger.click()
          triggerFound = true
        }
      }

      if (!triggerFound) {
        const screenshotPath = await this.captureErrorScreenshot(page, task)
        return {
          success: false,
          status: 'failed',
          errorCode: 'DOM_TIMEOUT',
          error: 'ELEMENT_NOT_FOUND: Không tìm thấy ô mở khung tạo bài viết trên trang nhóm',
          screenshotPath
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
        const screenshotPath = await this.captureErrorScreenshot(page, task)
        return {
          success: false,
          status: 'failed',
          errorCode: 'DOM_TIMEOUT',
          error: 'ELEMENT_NOT_FOUND: Không tìm thấy ô nhập nội dung bài viết',
          screenshotPath
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
        const screenshotPath = await this.captureErrorScreenshot(page, task)
        return {
          success: false,
          status: 'failed',
          errorCode: 'DOM_TIMEOUT',
          error: 'ELEMENT_NOT_FOUND: Không tìm thấy hoặc không thể nhấp nút Đăng bài',
          screenshotPath
        }
      }

      // 9. Chờ bài đăng được xử lý (chờ modal đóng)
      let modalClosed = false
      try {
        await page.waitForSelector('div[role="dialog"]', { state: 'detached', timeout: 15000 })
        modalClosed = true
      } catch {
        // Kiểm tra xem modal có thực sự còn hiển thị trên màn hình không
        const dialog = page.locator('div[role="dialog"]').first()
        modalClosed = !(await dialog.isVisible().catch(() => false))
      }

      if (!modalClosed) {
        console.warn('[Worker:AutomationRunner] Modal đăng bài chưa đóng sau khi bấm Đăng!')
        const screenshotPath = await this.captureErrorScreenshot(page, task, 'modal_not_closed')
        return {
          success: false,
          status: 'failed',
          errorCode: 'POST_SUBMIT_FAILED',
          error: 'Lỗi đăng bài: Hộp thoại soạn thảo không đóng sau khi bấm Đăng. Có thể ảnh không hợp lệ hoặc thao tác bị Facebook chặn.',
          screenshotPath
        }
      }

      await humanDelay(2000, 3000)

      // 9.1 Kiểm tra xem Facebook có hiển thị popup chặn tính năng hoặc chuyển hướng checkpoint không
      const postCheckpoint = await detectCheckpointOrBlock(page)
      if (postCheckpoint.isCheckpoint) {
        console.warn('[Worker:AutomationRunner] Phát hiện Checkpoint sau khi bấm Đăng:', postCheckpoint.reason)
        const screenshotPath = await this.captureErrorScreenshot(page, task, 'checkpoint')
        return {
          success: false,
          status: 'failed',
          errorCode: 'CHECKPOINT_DETECTED',
          error: postCheckpoint.reason || 'Facebook chặn tính năng hoặc yêu cầu xác minh bảo mật',
          screenshotPath,
          isCheckpoint: true
        }
      }

      // 10. Kiểm tra xem bài viết có ở trạng thái chờ Admin duyệt không
      const isAdminPending = await checkAdminApprovalPending(page)
      const newStorageState = await this.context.storageState().catch(() => undefined)

      if (isAdminPending) {
        console.log('[Worker:AutomationRunner] Phát hiện bài viết đang chờ Quản trị viên duyệt [Admin Approval Pending]')
        return {
          success: true,
          status: 'admin_pending',
          newStorageState
        }
      }

      // 11. Trích xuất permalink bài viết công khai
      const permalink = await extractPostPermalink(page, task.target_id, task.target_type)
      console.log(`[Worker:AutomationRunner] Đăng bài thành công [Success], permalink: ${permalink || 'N/A'}`)

      return {
        success: true,
        status: 'success',
        permalink: permalink || undefined,
        newStorageState
      }
    } catch (err: any) {
      console.error('[Worker:AutomationRunner] Lỗi thực thi tác vụ:', err)
      const errorMessage = err?.message || 'Lỗi không xác định khi thực thi tự động hóa'
      const errorCode = this.classifyErrorCode(errorMessage)
      const prefix = errorCode === 'CHECKPOINT_DETECTED' ? 'checkpoint' : 'error'
      const screenshotPath = await this.captureErrorScreenshot(page, task, prefix)

      return {
        success: false,
        status: 'failed',
        errorCode,
        error: errorMessage,
        screenshotPath,
        isCheckpoint: errorCode === 'CHECKPOINT_DETECTED'
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
