import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'

// 16x16 PNG Base64 Icon (Màu xanh Emerald đặc trưng của FB-Pulse)
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVR4nGL4z8DwnwENMDEx/cfB5gJiRjIBuWbgE8NWYIymmKCJMY40/F+0ag0+TfiCgWbAiEYj9jVjN4WwAaR5gFx30D2Q5B7Ag/F5AKaRh3jngWvEI950kOQeB9qQZkQhAwA03C0h3pLgNAAAAABJRU5ErkJggg=='

export class TrayService {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow | null = null

  /**
   * Khởi tạo System Tray và gắn kết với cửa sổ chính
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow

    // Tránh khởi tạo nhiều lần
    if (this.tray) {
      return
    }

    try {
      const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
      this.tray = new Tray(icon)
      this.tray.setToolTip('FB-Pulse - Facebook Campaign Automation')

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Hiển thị FB-Pulse',
          click: (): void => this.showWindow()
        },
        { type: 'separator' },
        {
          label: 'Thoát FB-Pulse',
          click: (): void => {
            app.quit()
          }
        }
      ])

      this.tray.setContextMenu(contextMenu)

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

      this.tray.on('double-click', () => {
        this.showWindow()
      })
    } catch (err) {
      console.error('[TrayService] Không thể khởi tạo System Tray:', err)
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
