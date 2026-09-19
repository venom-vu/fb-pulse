import { resolveSpintax, validateSpintax, tryResolveSpintax, SpintaxValidationResult } from '../../shared/spintax'

export class ComposerService {
  /**
   * Kiểm tra tính hợp lệ của cú pháp Spintax
   */
  validateSpintax(template: string): SpintaxValidationResult {
    return validateSpintax(template)
  }

  /**
   * Giải mã một biến thể văn bản ngẫu nhiên từ template Spintax
   */
  resolveSpintaxVariant(template: string, rng?: () => number): string {
    return resolveSpintax(template, rng)
  }

  /**
   * Giải mã an toàn không throw lỗi
   */
  tryResolveSpintaxVariant(
    template: string,
    rng?: () => number
  ): { success: boolean; result: string; error?: string } {
    return tryResolveSpintax(template, rng)
  }
}

export const composerService = new ComposerService()
