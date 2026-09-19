import { BrowserWindow } from 'electron'
import type { QueueTickDTO } from '../../preload/types'

export class SchedulerService {
  private status: 'idle' | 'jitter_waiting' | 'running' | 'paused' = 'idle'
  private remainingSeconds = 0
  private totalSeconds = 0
  private tickInterval: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private onCompleteCallback: (() => void) | null = null

  /**
   * Thiết lập BrowserWindow để phát broadcast sự kiện tick
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * Tính toán khoảng thời gian trễ ngẫu nhiên Jitter (giây)
   * Ràng buộc: min >= 60, max >= min
   */
  calculateJitter(minSec = 180, maxSec = 300): number {
    const validMin = Math.max(60, Math.floor(minSec))
    const validMax = Math.max(validMin, Math.floor(maxSec))
    return Math.floor(Math.random() * (validMax - validMin + 1)) + validMin
  }

  /**
   * Định dạng số giây còn lại thành chuỗi mm:ss
   */
  formatCountdown(seconds: number): string {
    const sec = Math.max(0, Math.floor(seconds))
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /**
   * Lấy trạng thái hiện tại của bộ đếm Jitter
   */
  getJitterStatus(): QueueTickDTO {
    return {
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      formattedCountdown: this.formatCountdown(this.remainingSeconds)
    }
  }

  /**
   * Bắt đầu đếm ngược thời gian nghỉ Jitter giữa 2 bài đăng
   */
  startJitter(jitterSeconds: number, onComplete?: () => void): void {
    this.stopJitter()

    const validDuration = Math.max(0, Math.floor(jitterSeconds))
    this.totalSeconds = validDuration
    this.remainingSeconds = validDuration
    this.status = validDuration > 0 ? 'jitter_waiting' : 'idle'
    this.onCompleteCallback = onComplete || null

    this.broadcastTick()

    if (validDuration <= 0) {
      if (this.onCompleteCallback) {
        const cb = this.onCompleteCallback
        this.onCompleteCallback = null
        cb()
      }
      return
    }

    this.tickInterval = setInterval(() => {
      this.remainingSeconds--
      this.broadcastTick()

      if (this.remainingSeconds <= 0) {
        this.stopJitter()
        if (this.onCompleteCallback) {
          const cb = this.onCompleteCallback
          this.onCompleteCallback = null
          cb()
        }
      }
    }, 1000)
  }

  /**
   * Dừng đếm ngược Jitter hiện tại
   */
  stopJitter(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.status === 'jitter_waiting') {
      this.status = 'idle'
      this.remainingSeconds = 0
      this.broadcastTick()
    }
  }

  /**
   * Tạm dừng hoặc tiếp tục
   */
  setPaused(paused: boolean): void {
    if (paused) {
      if (this.status === 'jitter_waiting') {
        if (this.tickInterval) {
          clearInterval(this.tickInterval)
          this.tickInterval = null
        }
        this.status = 'paused'
        this.broadcastTick()
      }
    } else {
      if (this.status === 'paused' && this.remainingSeconds > 0) {
        this.status = 'jitter_waiting'
        this.broadcastTick()
        this.tickInterval = setInterval(() => {
          this.remainingSeconds--
          this.broadcastTick()

          if (this.remainingSeconds <= 0) {
            this.stopJitter()
            if (this.onCompleteCallback) {
              const cb = this.onCompleteCallback
              this.onCompleteCallback = null
              cb()
            }
          }
        }, 1000)
      }
    }
  }

  /**
   * Gửi sự kiện tick tới Renderer Process qua IPC
   */
  private broadcastTick(): void {
    const payload = this.getJitterStatus()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('queue:tick', payload)
    }
  }
}

export const schedulerService = new SchedulerService()
