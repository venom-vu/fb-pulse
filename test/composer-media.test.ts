import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useComposerStore } from '../src/renderer/src/stores/composer'
import { useToastStore } from '../src/renderer/src/stores/toast'
import { MAX_MEDIA_COUNT, MAX_IMAGE_SIZE_BYTES } from '../src/renderer/src/types/composer'

describe('Composer Media & Dropzone Verification (Story 3.2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn((file: any) => `blob:mock-url-${file.name}`)
    global.URL.revokeObjectURL = vi.fn()
  })

  function createMockFile(name: string, size: number, type: string): File {
    const file = new File(['mock content'], name, { type })
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  it('Matrix Row 1 (Tải ảnh hợp lệ 1-4 ảnh): Thêm ảnh hợp lệ, hiển thị trong lưới và gắn nhãn ảnh bìa', () => {
    const composerStore = useComposerStore()
    const file1 = createMockFile('product1.png', 2 * 1024 * 1024, 'image/png')
    const file2 = createMockFile('product2.jpg', 3 * 1024 * 1024, 'image/jpeg')

    const result = composerStore.addMediaFiles([file1, file2])

    expect(result.added).toBe(2)
    expect(result.rejected.length).toBe(0)
    expect(composerStore.mediaFiles.length).toBe(2)
    expect(composerStore.hasMedia).toBe(true)

    // Ảnh đầu tiên là ảnh bìa (coverPhoto)
    expect(composerStore.coverPhoto).not.toBeNull()
    expect(composerStore.coverPhoto?.name).toBe('product1.png')
    expect(composerStore.mediaFiles[0].previewUrl).toBe('blob:mock-url-product1.png')
  })

  it('Matrix Row 2 (Kéo thả đổi thứ tự ảnh): Hoán đổi vị trí và cập nhật tức thì ảnh bìa', () => {
    const composerStore = useComposerStore()
    const file1 = createMockFile('first.png', 1024, 'image/png')
    const file2 = createMockFile('second.webp', 2048, 'image/webp')
    const file3 = createMockFile('third.jpg', 3072, 'image/jpeg')

    composerStore.addMediaFiles([file1, file2, file3])
    expect(composerStore.coverPhoto?.name).toBe('first.png')

    // Kéo ảnh thứ 2 (index 1) lên vị trí đầu tiên (index 0)
    composerStore.reorderMedia(1, 0)

    expect(composerStore.mediaFiles[0].name).toBe('second.webp')
    expect(composerStore.mediaFiles[1].name).toBe('first.png')
    expect(composerStore.mediaFiles[2].name).toBe('third.jpg')
    expect(composerStore.coverPhoto?.name).toBe('second.webp')
  })

  it('Matrix Row 3 (Xóa ảnh đính kèm): Loại bỏ ảnh, thu hồi URL preview và gán ảnh bìa mới', () => {
    const composerStore = useComposerStore()
    const file1 = createMockFile('cover.png', 1024, 'image/png')
    const file2 = createMockFile('next.png', 2048, 'image/png')

    composerStore.addMediaFiles([file1, file2])
    const firstId = composerStore.mediaFiles[0].id

    composerStore.removeMedia(firstId)

    expect(composerStore.mediaFiles.length).toBe(1)
    expect(composerStore.coverPhoto?.name).toBe('next.png')
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url-cover.png')
  })

  it('Matrix Row 4 (Tải file quá dung lượng > 10MB): Chặn file và hiển thị Toast cảnh báo', () => {
    const composerStore = useComposerStore()
    const toastStore = useToastStore()
    const oversizedFile = createMockFile('huge.png', 12 * 1024 * 1024, 'image/png') // 12MB > 10MB

    const result = composerStore.addMediaFiles([oversizedFile])

    expect(result.added).toBe(0)
    expect(result.rejected.length).toBe(1)
    expect(composerStore.mediaFiles.length).toBe(0)
    expect(toastStore.toasts.length).toBe(1)
    expect(toastStore.toasts[0].type).toBe('warning')
    expect(toastStore.toasts[0].message).toContain('vượt quá dung lượng tối đa 10MB')
  })

  it('Matrix Row 5 (Tải định dạng không hỗ trợ Video/GIF/PDF): Chặn file và thông báo Toast rõ ràng', () => {
    const composerStore = useComposerStore()
    const toastStore = useToastStore()
    const videoFile = createMockFile('video.mp4', 5 * 1024 * 1024, 'video/mp4')
    const gifFile = createMockFile('animation.gif', 1 * 1024 * 1024, 'image/gif')

    const result = composerStore.addMediaFiles([videoFile, gifFile])

    expect(result.added).toBe(0)
    expect(result.rejected.length).toBe(2)
    expect(composerStore.mediaFiles.length).toBe(0)
    expect(toastStore.toasts.length).toBe(2)
    expect(toastStore.toasts[0].message).toContain('không được hỗ trợ')
    expect(toastStore.toasts[1].message).toContain('không được hỗ trợ')
  })

  it('Matrix Row 6 (Tải vượt quá 4 ảnh): Đã có 3 ảnh, thêm 2 ảnh thì chỉ nhận 1 ảnh và chặn ảnh thứ 5', () => {
    const composerStore = useComposerStore()
    const toastStore = useToastStore()

    // Thêm trước 3 ảnh
    const f1 = createMockFile('img1.png', 1000, 'image/png')
    const f2 = createMockFile('img2.png', 1000, 'image/png')
    const f3 = createMockFile('img3.png', 1000, 'image/png')
    composerStore.addMediaFiles([f1, f2, f3])
    expect(composerStore.mediaFiles.length).toBe(3)

    // Kéo thả thêm 2 ảnh
    const f4 = createMockFile('img4.png', 1000, 'image/png')
    const f5 = createMockFile('img5.png', 1000, 'image/png')
    const result = composerStore.addMediaFiles([f4, f5])

    expect(result.added).toBe(1)
    expect(composerStore.mediaFiles.length).toBe(MAX_MEDIA_COUNT)
    expect(toastStore.toasts.some((t) => t.message.includes('tối đa 4 hình ảnh'))).toBe(true)
  })

  it('Matrix Row 7 (Đã đủ 4 ảnh): Đang có 4 ảnh, thêm ảnh tiếp sẽ bị chặn hoàn toàn', () => {
    const composerStore = useComposerStore()
    const toastStore = useToastStore()

    const files = [
      createMockFile('a.png', 100, 'image/png'),
      createMockFile('b.png', 100, 'image/png'),
      createMockFile('c.png', 100, 'image/png'),
      createMockFile('d.png', 100, 'image/png')
    ]
    composerStore.addMediaFiles(files)
    expect(composerStore.mediaFiles.length).toBe(4)

    // Cố tình thêm ảnh thứ 5
    const extra = createMockFile('e.png', 100, 'image/png')
    const result = composerStore.addMediaFiles([extra])

    expect(result.added).toBe(0)
    expect(composerStore.mediaFiles.length).toBe(4)
    expect(toastStore.toasts.some((t) => t.message.includes('tối đa 4 hình ảnh'))).toBe(true)
  })

  it('Matrix Row 8 (Chọn file trùng lặp): Bỏ qua file trùng tên và dung lượng đã có trong bài viết', () => {
    const composerStore = useComposerStore()
    const toastStore = useToastStore()

    const file = createMockFile('duplicate.png', 5000, 'image/png')
    composerStore.addMediaFiles([file])
    expect(composerStore.mediaFiles.length).toBe(1)

    // Thêm lại file trùng
    const duplicate = createMockFile('duplicate.png', 5000, 'image/png')
    const result = composerStore.addMediaFiles([duplicate])

    expect(result.added).toBe(0)
    expect(composerStore.mediaFiles.length).toBe(1)
    expect(toastStore.toasts.some((t) => t.message.includes('đã tồn tại'))).toBe(true)
  })

  it('ClearMedia: dọn dẹp toàn bộ ảnh và giải phóng URL', () => {
    const composerStore = useComposerStore()
    const f1 = createMockFile('1.png', 100, 'image/png')
    const f2 = createMockFile('2.png', 100, 'image/png')
    composerStore.addMediaFiles([f1, f2])

    composerStore.clearMedia()
    expect(composerStore.mediaFiles.length).toBe(0)
    expect(composerStore.hasMedia).toBe(false)
    expect(composerStore.coverPhoto).toBeNull()
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
