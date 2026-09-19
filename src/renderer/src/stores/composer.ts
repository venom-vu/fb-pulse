import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { validateSpintax, resolveSpintax, tryResolveSpintax } from '../../../shared/spintax'

export const useComposerStore = defineStore('composer', () => {
  const content = ref('')
  const currentVariant = ref('')
  const spintaxError = ref<string | null>(null)
  const isTestingVariant = ref(false)

  const isValid = computed(() => spintaxError.value === null)

  function setContent(newContent: string): void {
    content.value = newContent
    if (!newContent.trim()) {
      spintaxError.value = null
      currentVariant.value = ''
      return
    }

    const validation = validateSpintax(newContent)
    if (!validation.isValid) {
      spintaxError.value = validation.error || 'Cú pháp Spintax không hợp lệ'
    } else {
      spintaxError.value = null
      // Tự động cập nhật currentVariant nếu đang rỗng
      if (!currentVariant.value) {
        const resolved = tryResolveSpintax(newContent)
        if (resolved.success) {
          currentVariant.value = resolved.result
        }
      }
    }
  }

  function insertSpintaxPattern(textareaEl?: HTMLTextAreaElement | null): void {
    const pattern = '{lựa chọn 1|lựa chọn 2}'
    const currentVal = content.value

    if (textareaEl) {
      const start = textareaEl.selectionStart ?? currentVal.length
      const end = textareaEl.selectionEnd ?? currentVal.length

      const before = currentVal.substring(0, start)
      const after = currentVal.substring(end)

      content.value = before + pattern + after

      // Re-validate
      const validation = validateSpintax(content.value)
      spintaxError.value = validation.isValid ? null : validation.error || null

      // Đặt vùng chọn vào 'lựa chọn 1'
      const selectStart = start + 1
      const selectEnd = selectStart + 'lựa chọn 1'.length

      setTimeout(() => {
        textareaEl.focus()
        textareaEl.setSelectionRange(selectStart, selectEnd)
      }, 0)
    } else {
      content.value = currentVal ? `${currentVal} ${pattern}` : pattern
      const validation = validateSpintax(content.value)
      spintaxError.value = validation.isValid ? null : validation.error || null
    }

    if (!spintaxError.value) {
      const resolved = tryResolveSpintax(content.value)
      if (resolved.success) {
        currentVariant.value = resolved.result
      }
    }
  }

  async function testSpintaxVariant(): Promise<string> {
    if (!content.value.trim()) {
      currentVariant.value = ''
      return ''
    }

    const validation = validateSpintax(content.value)
    if (!validation.isValid) {
      spintaxError.value = validation.error || 'Cú pháp Spintax không hợp lệ'
      return ''
    }

    spintaxError.value = null
    isTestingVariant.value = true

    try {
      if (window?.fbPulseAPI?.composer?.testSpintaxVariant) {
        const res = await window.fbPulseAPI.composer.testSpintaxVariant(content.value)
        if (res.success && res.data !== undefined) {
          currentVariant.value = res.data
          return res.data
        } else if (res.error) {
          spintaxError.value = res.error.message
          return ''
        }
      }

      // Fallback khi chạy unit test hoặc không có electron bridge
      const variant = resolveSpintax(content.value)
      currentVariant.value = variant
      return variant
    } catch (err: any) {
      spintaxError.value = err?.message || 'Lỗi khi giải mã Spintax'
      return ''
    } finally {
      isTestingVariant.value = false
    }
  }

  return {
    content,
    currentVariant,
    spintaxError,
    isValid,
    isTestingVariant,
    setContent,
    insertSpintaxPattern,
    testSpintaxVariant
  }
})
