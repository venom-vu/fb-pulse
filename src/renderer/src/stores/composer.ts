import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { validateSpintax, resolveSpintax, tryResolveSpintax } from '../../../shared/spintax'
import type { AttachedMedia } from '../types/composer'
import {
  MAX_MEDIA_COUNT,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_IMAGE_EXTENSIONS
} from '../types/composer'
import { useToastStore } from './toast'

export const useComposerStore = defineStore('composer', () => {
  const toastStore = useToastStore()

  // Spintax & Content state
  const content = ref('')
  const currentVariant = ref('')
  const spintaxError = ref<string | null>(null)
  const isTestingVariant = ref(false)

  // Media state
  const mediaFiles = ref<AttachedMedia[]>([])

  // Targets selection state (Story 3.3)
  const selectedTargetIds = ref<string[]>([])

  const isValid = computed(() => spintaxError.value === null)
  const hasMedia = computed(() => mediaFiles.value.length > 0)
  const coverPhoto = computed(() => (mediaFiles.value.length > 0 ? mediaFiles.value[0] : null))
  const selectedTargetsCount = computed(() => selectedTargetIds.value.length)

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

  // --- Media Management Actions ---

  function validateSingleFile(file: File): { valid: boolean; reason?: string } {
    // Check type / extension
    const fileName = file.name.toLowerCase()
    const isExtensionAllowed = ALLOWED_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext))
    const isMimeAllowed = ALLOWED_IMAGE_TYPES.includes(file.type)

    if (!isMimeAllowed && !isExtensionAllowed) {
      return {
        valid: false,
        reason: `Định dạng "${file.name}" không được hỗ trợ. Chỉ chấp nhận PNG, JPG, JPEG, WEBP (không hỗ trợ Video/GIF)`
      }
    }

    // Check size
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        reason: `Ảnh "${file.name}" vượt quá dung lượng tối đa 10MB`
      }
    }

    return { valid: true }
  }

  function addMediaFiles(files: File[] | FileList): { added: number; rejected: string[] } {
    const fileArray = Array.from(files)
    const rejected: string[] = []
    let addedCount = 0

    if (mediaFiles.value.length >= MAX_MEDIA_COUNT) {
      const msg = 'Chỉ được đính kèm tối đa 4 hình ảnh'
      toastStore.showToast(msg, 'warning')
      rejected.push(msg)
      return { added: 0, rejected }
    }

    for (const file of fileArray) {
      if (mediaFiles.value.length >= MAX_MEDIA_COUNT) {
        const msg = 'Chỉ được đính kèm tối đa 4 hình ảnh'
        toastStore.showToast(msg, 'warning')
        rejected.push(msg)
        break
      }

      // Check validation
      const validation = validateSingleFile(file)
      if (!validation.valid) {
        toastStore.showToast(validation.reason!, 'warning')
        rejected.push(validation.reason!)
        continue
      }

      // Check duplicates (by name and size)
      const isDuplicate = mediaFiles.value.some(
        (existing) => existing.name === file.name && existing.size === file.size
      )
      if (isDuplicate) {
        const msg = `Hình ảnh "${file.name}" đã tồn tại trong bài viết`
        toastStore.showToast(msg, 'info')
        rejected.push(msg)
        continue
      }

      // Create preview URL
      let previewUrl = ''
      try {
        previewUrl = URL.createObjectURL(file)
      } catch {
        previewUrl = ''
      }

      const filePath = (file as any).path || ''
      const mediaItem: AttachedMedia = {
        id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type || 'image/jpeg',
        path: filePath,
        previewUrl
      }

      mediaFiles.value.push(mediaItem)
      addedCount++
    }

    return { added: addedCount, rejected }
  }

  function removeMedia(id: string): void {
    const index = mediaFiles.value.findIndex((m) => m.id === id)
    if (index !== -1) {
      const item = mediaFiles.value[index]
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(item.previewUrl)
        } catch {
          // ignore error during cleanup
        }
      }
      mediaFiles.value.splice(index, 1)
    }
  }

  function reorderMedia(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= mediaFiles.value.length ||
      toIndex < 0 ||
      toIndex >= mediaFiles.value.length ||
      fromIndex === toIndex
    ) {
      return
    }

    const [movedItem] = mediaFiles.value.splice(fromIndex, 1)
    mediaFiles.value.splice(toIndex, 0, movedItem)
  }

  function clearMedia(): void {
    for (const item of mediaFiles.value) {
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(item.previewUrl)
        } catch {
          // ignore
        }
      }
    }
    mediaFiles.value = []
  }

  // --- Target Selection Actions (Story 3.3) ---

  function toggleTarget(id: string): void {
    const idx = selectedTargetIds.value.indexOf(id)
    if (idx === -1) {
      selectedTargetIds.value.push(id)
    } else {
      selectedTargetIds.value.splice(idx, 1)
    }
  }

  function selectAllTargets(ids: string[]): void {
    selectedTargetIds.value = [...ids]
  }

  function clearSelectedTargets(): void {
    selectedTargetIds.value = []
  }

  function isTargetSelected(id: string): boolean {
    return selectedTargetIds.value.includes(id)
  }

  return {
    content,
    currentVariant,
    spintaxError,
    isValid,
    isTestingVariant,
    mediaFiles,
    hasMedia,
    coverPhoto,
    selectedTargetIds,
    selectedTargetsCount,
    setContent,
    insertSpintaxPattern,
    testSpintaxVariant,
    addMediaFiles,
    removeMedia,
    reorderMedia,
    clearMedia,
    validateSingleFile,
    toggleTarget,
    selectAllTargets,
    clearSelectedTargets,
    isTargetSelected
  }
})
