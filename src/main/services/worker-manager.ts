import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
import { sessionService } from './session.service'

export interface WorkerTaskResult {
  success: boolean
  status?: 'success' | 'admin_pending' | 'failed'
  permalink?: string
  errorCode?: string
  error?: string
  screenshotPath?: string
  newStorageState?: any
  isCheckpoint?: boolean
}

export class WorkerManager {
  private worker: UtilityProcess | null = null
  private pendingTaskId: string | null = null
  private pendingResolver: ((result: WorkerTaskResult) => void) | null = null
  private pendingRejecter: ((err: any) => void) | null = null
  private customWorkerPath: string | null = null

  constructor(customWorkerPath?: string) {
    if (customWorkerPath) {
      this.customWorkerPath = customWorkerPath
    }
  }

  /**
   * Thiết lập đường dẫn tùy chỉnh tới file kịch bản worker (phục vụ test)
   */
  setCustomWorkerPath(path: string | null): void {
    this.customWorkerPath = path
  }

  /**
   * Lấy đường dẫn tới file kịch bản worker đã được biên dịch
   */
  getWorkerPath(): string {
    if (this.customWorkerPath) {
      return this.customWorkerPath
    }
    // Khi chạy trong build hoặc dev của electron-vite: out/main/worker.js
    return join(__dirname, 'worker.js')
  }

  /**
   * Lấy đường dẫn thư mục lưu ảnh chụp màn hình sự cố
   */
  getScreenshotDir(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return join(app.getPath('userData'), 'logs', 'screenshots')
      }
    } catch {}
    return join(process.cwd(), 'logs', 'screenshots')
  }

  /**
   * Kiểm tra tiến trình worker có đang hoạt động hay không
   */
  isWorkerRunning(): boolean {
    return this.worker !== null && this.worker.pid !== undefined
  }

  /**
   * Gắn worker process và thiết lập các trình lắng nghe sự kiện
   */
  attachWorker(worker: UtilityProcess): UtilityProcess {
    this.worker = worker

    if (this.worker.stdout) {
      this.worker.stdout.on('data', (data) => {
        console.log(`[Worker:stdout] ${data.toString().trim()}`)
      })
    }

    if (this.worker.stderr) {
      this.worker.stderr.on('data', (data) => {
        console.error(`[Worker:stderr] ${data.toString().trim()}`)
      })
    }

    this.worker.on('message', async (message: any) => {
      console.log(`[WorkerManager] Nhận thông điệp từ Worker:`, message?.type)

      if (message?.type === 'TASK_COMPLETED') {
        const { taskId, result } = message
        if (this.pendingTaskId === taskId && this.pendingResolver) {
          // Xử lý Two-Way Session Sync nếu có storageState mới từ Worker
          if (result?.newStorageState) {
            console.log('[WorkerManager] Thực hiện Two-Way Session Sync với SQLite')
            try {
              await sessionService.syncSessionFromStorageState(result.newStorageState)
            } catch (syncErr) {
              console.error('[WorkerManager] Lỗi khi đồng bộ session:', syncErr)
            }
          }

          const resolver = this.pendingResolver
          this.pendingTaskId = null
          this.pendingResolver = null
          this.pendingRejecter = null
          resolver(result)
        }
      }
    })

    this.worker.on('exit', (code) => {
      console.log(`[WorkerManager] Tiến trình Worker đã thoát với mã: ${code}`)
      if (this.pendingRejecter) {
        const rejecter = this.pendingRejecter
        this.pendingTaskId = null
        this.pendingResolver = null
        this.pendingRejecter = null
        rejecter(new Error(`Worker process exited unexpectedly with code ${code}`))
      }
      this.worker = null
    })

    return this.worker
  }

  /**
   * Khởi chạy tiến trình Worker độc lập qua utilityProcess của Electron (AD-1)
   */
  spawnWorker(): UtilityProcess {
    if (this.isWorkerRunning()) {
      return this.worker!
    }

    const scriptPath = this.getWorkerPath()
    console.log(`[WorkerManager] Đang khởi chạy utilityProcess: ${scriptPath}`)

    if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
      throw new Error('Môi trường không hỗ trợ Electron utilityProcess')
    }

    const worker = utilityProcess.fork(scriptPath, [], {
      serviceName: 'fb-pulse-automation-worker',
      stdio: 'pipe'
    })

    return this.attachWorker(worker)
  }

  /**
   * Điều phối tác vụ tới tiến trình Worker và chờ phản hồi kết quả
   */
  async executeTask(task: any): Promise<WorkerTaskResult> {
    const worker = this.spawnWorker()

    // Lấy storageState đã giải mã từ SQLite để cấp cho Worker
    const storageState = await sessionService.getDecryptedStorageState()

    let mediaPaths: string[] = []
    if (Array.isArray(task.media_paths)) {
      mediaPaths = task.media_paths
    } else if (typeof task.media_paths === 'string') {
      try {
        mediaPaths = JSON.parse(task.media_paths)
      } catch {
        mediaPaths = []
      }
    }

    const payload = {
      id: task.id,
      target_id: task.fb_id || task.target_id,
      target_type: task.target_type || 'group',
      resolved_spintax_text: task.resolved_spintax_text || '',
      media_paths: mediaPaths,
      storageState,
      screenshotDir: this.getScreenshotDir()
    }

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      this.pendingTaskId = task.id
      this.pendingResolver = resolve
      this.pendingRejecter = reject

      worker.postMessage({
        type: 'EXECUTE_TASK',
        payload
      })
    })
  }

  /**
   * Chấm dứt và giải phóng hoàn toàn tiến trình Worker để thu hồi 100% RAM (< 150MB) (AD-1)
   */
  async terminateWorker(): Promise<void> {
    if (!this.worker) {
      return
    }

    console.log('[WorkerManager] Đang giải phóng tiến trình Worker...')
    try {
      this.worker.postMessage({ type: 'SHUTDOWN' })
    } catch {}

    const workerToKill = this.worker
    this.worker = null
    this.pendingTaskId = null
    this.pendingResolver = null
    this.pendingRejecter = null

    setTimeout(() => {
      try {
        if (workerToKill && workerToKill.pid) {
          workerToKill.kill()
        }
      } catch {}
    }, 2000)
  }
}

export const workerManager = new WorkerManager()
