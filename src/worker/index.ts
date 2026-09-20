import { parentPort } from 'electron'
import { AutomationRunner, type AutomationTaskPayload } from './automation-runner'

const runner = new AutomationRunner()
const port = parentPort || (process as any).parentPort

if (port) {
  port.on('message', async (event: any) => {
    const message = event.data || event
    if (!message || !message.type) return

    switch (message.type) {
      case 'PING':
        port.postMessage({ type: 'PONG' })
        break

      case 'EXECUTE_TASK': {
        const payload = message.payload as AutomationTaskPayload
        console.log(`[Worker] Bắt đầu thực thi tác vụ: ${payload.id}`)
        try {
          const result = await runner.executePost(payload)
          port.postMessage({
            type: 'TASK_COMPLETED',
            taskId: payload.id,
            result
          })
        } catch (err: any) {
          port.postMessage({
            type: 'TASK_COMPLETED',
            taskId: payload.id,
            result: {
              success: false,
              error: err?.message || 'Lỗi không xác định trong tiến trình Worker'
            }
          })
        }
        break
      }

      case 'SHUTDOWN':
        console.log('[Worker] Nhận lệnh SHUTDOWN — Đang dọn dẹp và thoát tiến trình')
        await runner.cleanup()
        process.exit(0)
        break

      default:
        console.warn(`[Worker] Loại thông điệp không được hỗ trợ: ${message.type}`)
    }
  })

  console.log('[Worker] Tiến trình Automation Worker đã khởi động và sẵn sàng nhận lệnh')
} else {
  console.error('[Worker] Không tìm thấy parentPort. Tiến trình không được chạy dưới dạng utilityProcess của Electron.')
}
