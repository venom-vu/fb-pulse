import type { Page, Locator } from 'playwright-core'

/**
 * Tính toán độ trễ gõ phím ngẫu nhiên (50ms - 150ms) mô phỏng người thật
 */
export function calculateTypingJitter(minMs = 50, maxMs = 150): number {
  const min = Math.max(10, Math.floor(minMs))
  const max = Math.max(min, Math.floor(maxMs))
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Tạm dừng ngẫu nhiên giữa các thao tác (ms)
 */
export async function humanDelay(minMs = 500, maxMs = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  await new Promise((resolve) => setTimeout(resolve, delay))
}

/**
 * Gõ nội dung văn bản mô phỏng hành vi người thật với nhịp gõ 50ms - 150ms mỗi ký tự
 */
export async function humanType(
  page: Page,
  target: string | Locator,
  text: string,
  options?: { minDelay?: number; maxDelay?: number }
): Promise<void> {
  const minDelay = options?.minDelay ?? 50
  const maxDelay = options?.maxDelay ?? 150

  if (typeof target === 'string') {
    await page.click(target)
  } else {
    await target.click()
  }

  await humanDelay(200, 500)

  for (const char of text) {
    const delay = calculateTypingJitter(minDelay, maxDelay)
    await page.keyboard.type(char, { delay })
  }
}

/**
 * Mô phỏng cuộn chuột tự nhiên trên trang
 */
export async function naturalScroll(page: Page, totalDistance = 300): Promise<void> {
  const steps = 4 + Math.floor(Math.random() * 4) // 4-7 bước
  const stepDistance = Math.floor(totalDistance / steps)

  for (let i = 0; i < steps; i++) {
    const jitter = Math.floor(Math.random() * 20) - 10
    await page.mouse.wheel(0, stepDistance + jitter)
    await humanDelay(100, 300)
  }
}

/**
 * Tải lên tối đa 4 hình ảnh đính kèm vào khung soạn thảo bài viết
 */
export async function uploadImages(page: Page, filePaths: string[]): Promise<boolean> {
  if (!filePaths || filePaths.length === 0) {
    return true
  }

  const validPaths = filePaths.slice(0, 4)

  try {
    // 1. Tìm nút kích hoạt tải ảnh hoặc input file ẩn
    const fileInput = page.locator('input[type="file"][accept*="image"]').first()
    const fileInputCount = await fileInput.count()

    if (fileInputCount > 0) {
      await fileInput.setInputFiles(validPaths)
      await humanDelay(1500, 3000) // Chờ Facebook xử lý ảnh
      return true
    }

    // 2. Nếu chưa có input file ngay trên DOM, bấm vào icon Ảnh/Video trong popup soạn thảo
    const photoButton = page.locator(
      '[aria-label*="Ảnh/video"], [aria-label*="Photo/video"], [aria-label*="Ảnh"], div[role="button"]:has-text("Ảnh/video")'
    ).first()

    if (await photoButton.isVisible()) {
      await photoButton.click()
      await humanDelay(500, 1000)

      // Chờ input file xuất hiện sau khi bấm nút ảnh
      const fileInputAfterClick = page.locator('input[type="file"][accept*="image"]').first()
      await fileInputAfterClick.waitFor({ state: 'attached', timeout: 5000 })
      await fileInputAfterClick.setInputFiles(validPaths)
      await humanDelay(1500, 3000)
      return true
    }

    return false
  } catch (err) {
    console.error('[Worker:dom-actions] Lỗi khi upload hình ảnh:', err)
    return false
  }
}

/**
 * Nhấp nút Đăng bài trên giao diện Facebook
 */
export async function clickPostButton(page: Page): Promise<boolean> {
  // Cuộn nhẹ và chờ tự nhiên trước khi bấm đăng
  await naturalScroll(page, 150)
  await humanDelay(1000, 2000)

  // Danh sách các selector phổ biến của nút Đăng / Post trên Facebook Web
  const postButtonSelectors = [
    'div[aria-label="Đăng"][role="button"]',
    'div[aria-label="Post"][role="button"]',
    'div[role="button"]:has-text("Đăng")',
    'div[role="button"]:has-text("Post")',
    'button:has-text("Đăng")',
    'button:has-text("Post")'
  ]

  for (const selector of postButtonSelectors) {
    const btn = page.locator(selector).first()
    if (await btn.isVisible()) {
      // Kiểm tra xem nút có bị disabled không
      const ariaDisabled = await btn.getAttribute('aria-disabled')
      if (ariaDisabled === 'true') {
        continue
      }

      await btn.click()
      return true
    }
  }

  return false
}
