import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { schedulerService } from './scheduler.service'

// 16x16 PNG Base64 Icon (Màu xanh Emerald đặc trưng của FB-Pulse)
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVR4nGL4z8DwnwENMDEx/cfB5gJiRjIBuWbgE8NWYIymmKCJMY40/F+0ag0+TfiCgWbAiEYj9jVjN4WwAaR5gFx30D2Q5B7Ag/F5AKaRh3jngWvEI950kOQeB9qQZkQhAwA03C0h3pLgNAAAAABJRU5ErkJggg=='

export class TrayService {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow | null = null
  private isQuitting = false

  getIsQuitting(): boolean {
    return this.isQuitting
  }

  setIsQuitting(val: boolean): void {
    this.isQuitting = val
  }

  getTray(): Tray | null {
    return this.tray
  }

  /**
   * Khởi tạo System Tray và gắn kết với cửa sổ chính
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    this.isQuitting = false

    // Tránh khởi tạo nhiều lần
    if (this.tray) {
      return
    }

    try {
      const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
      this.tray = new Tray(icon)
      this.tray.setToolTip('fb-pulse - Facebook Campaign Automation')

      this.updateContextMenu()

      // Xử lý click trực tiếp vào icon khay hệ thống
      this.tray.on('click', () => {
        if (!this.mainWindow) return
        if (this.mainWindow.isVisible()) {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore()
            this.mainWindow.focus()
          } else {
            this.mainWindow.focus()
          }
        } else {
          this.showWindow()
        }
      })

      // Double-click vào icon khay hệ thống: khôi phục vị trí và kích thước làm việc
      this.tray.on('double-click', () => {
        this.showWindow()
      })
    } catch (err) {
      console.error('[TrayService] Không thể khởi tạo System Tray:', err)
    }
  }

  /**
   * Cập nhật Menu ngữ cảnh của System Tray
   */
  updateContextMenu(): void {
    if (!this.tray) return

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mở fb-pulse',
        click: (): void => this.showWindow()
      },
      {
        label: 'Tạm dừng / Tiếp tục hàng đợi',
        click: (): void => this.toggleQueue()
      },
      { type: 'separator' },
      {
        label: 'Thoát hoàn toàn',
        click: (): void => this.quitApp()
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }

  /**
   * Chuyển đổi trạng thái hàng đợi (Tạm dừng hoặc Tiếp tục)
   */
  toggleQueue(): void {
    const queueStatus = schedulerService.getStatus().status
    if (queueStatus === 'paused') {
      schedulerService.resumeQueue()
    } else {
      schedulerService.pauseQueue()
    }
    this.updateContextMenu()
  }

  /**
   * Thoát ứng dụng hoàn toàn
   */
  quitApp(): void {
    this.isQuitting = true
    if (app && typeof app.quit === 'function') {
      app.quit()
    }
  }

  /**
   * Thu gọn cửa sổ chính xuống System Tray (ẩn khỏi thanh tác vụ)
   */
  minimizeToTray(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide()
    }
  }

  /**
   * Khôi phục và hiển thị lại cửa sổ chính từ System Tray
   */
  showWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * Kiểm tra mức tiêu thụ RAM toàn hệ thống khi chạy ngầm
   */
  async getMemoryUsage(): Promise<{
    totalMemoryMB: number
    mainMemoryMB: number
    isWithinBudget: boolean
  }> {
    let totalMemoryKB = 0
    let mainMemoryKB = 0

    try {
      if (typeof process.getProcessMemoryInfo === 'function') {
        const mem = await process.getProcessMemoryInfo()
        mainMemoryKB = mem.residentSet || mem.private || 0
      } else {
        const mem = process.memoryUsage()
        mainMemoryKB = Math.round(mem.rss / 1024)
      }
    } catch {
      const mem = process.memoryUsage()
      mainMemoryKB = Math.round(mem.rss / 1024)
    }

    try {
      if (app && typeof app.getAppMetrics === 'function') {
        const metrics = app.getAppMetrics()
        totalMemoryKB = metrics.reduce((acc, m) => acc + (m.memory?.workingSetSize || 0), 0)
      }
    } catch {}

    if (totalMemoryKB === 0) {
      totalMemoryKB = mainMemoryKB
    }

    const totalMemoryMB = Math.round((totalMemoryKB / 1024) * 10) / 10
    const mainMemoryMB = Math.round((mainMemoryKB / 1024) * 10) / 10

    // Ngân sách RAM: < 150MB khi chạy ngầm / idle (mục tiêu ~80MB)
    const isWithinBudget = totalMemoryMB < 150

    return {
      totalMemoryMB,
      mainMemoryMB,
      isWithinBudget
    }
  }

  /**
   * Giải phóng Tray khi ứng dụng thoát
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
    this.mainWindow = null
  }
}

export const trayService = new TrayService()
