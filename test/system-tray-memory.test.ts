import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import * as connectionModule from '../src/main/database/connection'
import { TrayService, trayService } from '../src/main/services/tray.service'
import { schedulerService } from '../src/main/services/scheduler.service'
import { workerManager } from '../src/main/services/worker-manager'
import { app, Menu, Tray } from 'electron'

// Mock Electron modules
vi.mock('electron', () => {
  const NotificationMock = vi.fn().mockImplementation(() => ({
    show: vi.fn()
  }))
  ;(NotificationMock as any).isSupported = vi.fn().mockReturnValue(true)

  const mockTrayInstance = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn()
  }

  const TrayMock = vi.fn().mockImplementation(() => mockTrayInstance)

  return {
    app: {
      isPackaged: false,
      getPath: vi.fn().mockReturnValue('/tmp/fb-pulse-test'),
      quit: vi.fn(),
      getAppMetrics: vi.fn().mockReturnValue([
        { type: 'Browser', memory: { workingSetSize: 45000, peakWorkingSetSize: 50000 } },
        { type: 'Tab', memory: { workingSetSize: 35000, peakWorkingSetSize: 40000 } }
      ])
    },
    BrowserWindow: {
      getAllWindows: vi.fn().mockReturnValue([])
    },
    Menu: {
      buildFromTemplate: vi.fn((template) => template)
    },
    Tray: TrayMock,
    nativeImage: {
      createFromDataURL: vi.fn().mockReturnValue({})
    },
    powerSaveBlocker: {
      start: vi.fn().mockReturnValue(1),
      stop: vi.fn(),
      isStarted: vi.fn().mockReturnValue(true)
    },
    utilityProcess: {
      fork: vi.fn()
    },
    shell: {
      beep: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined)
    },
    Notification: NotificationMock
  }
})

describe('Story 5.5: Vận Hành Chạy Ngầm Khay Hệ Thống & Tối Ưu Bộ Nhớ', () => {
  let db: Database.Database
  let mockWindow: any
  let windowEventHandlers: Record<string, (event: any) => void> = {}

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    vi.spyOn(connectionModule, 'getDatabase').mockReturnValue(db)

    windowEventHandlers = {}

    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      isVisible: vi.fn().mockReturnValue(true),
      isMinimized: vi.fn().mockReturnValue(false),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      restore: vi.fn(),
      on: vi.fn((event: string, handler: (e: any) => void) => {
        windowEventHandlers[event] = handler
      }),
      webContents: {
        send: vi.fn()
      }
    }

    schedulerService.setMainWindow(mockWindow)
    schedulerService.resetForTesting()
    trayService.destroy()
  })

  afterEach(() => {
    trayService.destroy()
    schedulerService.resetForTesting()
    try {
      db.close()
    } catch {}
    vi.clearAllMocks()
  })

  it('Matrix Row 1: Bấm nút đóng cửa sổ (X) khi đang chạy ngầm — ẩn cửa sổ thay vì tắt ứng dụng', () => {
    trayService.initialize(mockWindow)

    // Thiết lập listener giống như trong src/main/index.ts
    const closeHandler = (event: any) => {
      if (!trayService.getIsQuitting()) {
        event.preventDefault()
        trayService.minimizeToTray()
      }
    }
    mockWindow.on('close', closeHandler)

    const event = {
      defaultPrevented: false,
      preventDefault: vi.fn(() => {
        event.defaultPrevented = true
      })
    }

    // Kích hoạt sự kiện đóng cửa sổ
    closeHandler(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(mockWindow.hide).toHaveBeenCalled()
    expect(trayService.getIsQuitting()).toBe(false)
  })

  it('Matrix Row 2: Mở ứng dụng từ Menu ngữ cảnh Tray ("Mở fb-pulse")', () => {
    trayService.initialize(mockWindow)

    // Lấy context menu đã được build
    const calls = (Menu.buildFromTemplate as any).mock.calls
    const template = calls[calls.length - 1][0]

    const openItem = template.find((item: any) => item.label === 'Mở fb-pulse')
    expect(openItem).toBeDefined()

    // Test trường hợp window đang minimized
    mockWindow.isMinimized.mockReturnValue(true)
    openItem.click()

    expect(mockWindow.restore).toHaveBeenCalled()
    expect(mockWindow.show).toHaveBeenCalled()
    expect(mockWindow.focus).toHaveBeenCalled()
  })

  it('Matrix Row 3: Chuyển đổi trạng thái hàng đợi từ Tray ("Tạm dừng / Tiếp tục hàng đợi")', () => {
    trayService.initialize(mockWindow)

    const calls = (Menu.buildFromTemplate as any).mock.calls
    const template = calls[calls.length - 1][0]

    const toggleItem = template.find((item: any) => item.label === 'Tạm dừng / Tiếp tục hàng đợi')
    expect(toggleItem).toBeDefined()

    // Ban đầu trạng thái scheduler là idle -> click sẽ gọi pauseQueue()
    expect(schedulerService.getStatus().status).toBe('idle')
    toggleItem.click()
    expect(schedulerService.getStatus().status).toBe('paused')

    // Click lần 2 -> khi đang paused sẽ gọi resumeQueue()
    toggleItem.click()
    expect(schedulerService.getStatus().status).toBe('idle')
  })

  it('Matrix Row 4: Thoát ứng dụng hoàn toàn từ Tray ("Thoát hoàn toàn")', () => {
    trayService.initialize(mockWindow)

    const calls = (Menu.buildFromTemplate as any).mock.calls
    const template = calls[calls.length - 1][0]

    const quitItem = template.find((item: any) => item.label === 'Thoát hoàn toàn')
    expect(quitItem).toBeDefined()

    quitItem.click()

    expect(trayService.getIsQuitting()).toBe(true)
    expect(app.quit).toHaveBeenCalled()

    // Kiểm tra hành vi close khi isQuitting = true: không preventDefault
    const event = {
      defaultPrevented: false,
      preventDefault: vi.fn()
    }
    const closeHandler = (e: any) => {
      if (!trayService.getIsQuitting()) {
        e.preventDefault()
        trayService.minimizeToTray()
      }
    }

    closeHandler(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('Matrix Row 5: Double-click vào Tray Icon khôi phục cửa sổ làm việc', () => {
    trayService.initialize(mockWindow)

    // Lấy instance tray đã được tạo
    const trayMock = (trayService as any).tray
    expect(trayMock).toBeDefined()

    // Tìm callback registered cho 'double-click'
    const doubleClickCall = trayMock.on.mock.calls.find((call: any[]) => call[0] === 'double-click')
    expect(doubleClickCall).toBeDefined()

    const doubleClickHandler = doubleClickCall[1]
    doubleClickHandler()

    expect(mockWindow.show).toHaveBeenCalled()
    expect(mockWindow.focus).toHaveBeenCalled()
  })

  it('Matrix Row 6: Quản lý RAM khi chạy ngầm — kiểm tra thu hồi Worker và ngân sách RAM < 150MB', async () => {
    trayService.initialize(mockWindow)

    // Khi hàng đợi idle, worker không được chạy
    expect(workerManager.isWorkerRunning()).toBe(false)

    // Kiểm tra tính toán tiêu thụ RAM
    const memoryInfo = await trayService.getMemoryUsage()

    expect(memoryInfo.totalMemoryMB).toBeGreaterThan(0)
    expect(memoryInfo.isWithinBudget).toBe(true)
    expect(memoryInfo.totalMemoryMB).toBeLessThan(150)
  })
})
