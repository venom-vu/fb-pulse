import { getDatabase } from '../database/connection'

export class SettingsService {
  /**
   * Lấy giá trị cài đặt theo key từ bảng app_settings
   */
  getSetting(key: string, defaultValue = ''): string {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
    return row ? row.value : defaultValue
  }

  /**
   * Lưu hoặc cập nhật giá trị cài đặt theo key
   */
  setSetting(key: string, value: string): void {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value)
  }

  /**
   * Lấy toàn bộ cài đặt dưới dạng Record<string, string>
   */
  getAllSettings(): Record<string, string> {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  /**
   * Lấy cấu hình "Ngăn máy tính đi ngủ khi có chiến dịch đang chạy"
   */
  getPreventSleepWhenActive(): boolean {
    const val = this.getSetting('prevent_sleep_when_active', 'false')
    return val === 'true' || val === '1'
  }

  /**
   * Cập nhật cấu hình "Ngăn máy tính đi ngủ khi có chiến dịch đang chạy"
   */
  setPreventSleepWhenActive(enabled: boolean): void {
    this.setSetting('prevent_sleep_when_active', enabled ? 'true' : 'false')
  }
}

export const settingsService = new SettingsService()
