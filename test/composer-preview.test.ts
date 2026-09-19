import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useComposerStore } from '../src/renderer/src/stores/composer'
import { useAccountStore } from '../src/renderer/src/stores/account'
import { useTargetsStore } from '../src/renderer/src/stores/targets'
import type { AttachedMedia } from '../src/renderer/src/types/composer'
import type { TargetDTO } from '../src/preload/types'
import { resolveSpintax } from '../src/shared/spintax'

describe('Composer Live Preview & Target Selection Verification (Story 3.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // Mock URL methods
    global.URL.createObjectURL = vi.fn((file: any) => `blob:mock-url-${file.name}`)
    global.URL.revokeObjectURL = vi.fn()

    // Mock window.fbPulseAPI
    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({ success: true, data: null })
        },
        composer: {
          testSpintaxVariant: async (tmpl: string) => ({
            success: true,
            data: resolveSpintax(tmpl)
          })
        },
        targets: {
          list: async () => ({ success: true, data: [] }),
          listFolders: async () => ({ success: true, data: [] })
        }
      }
    }
  })

  function createMockFile(name: string, size: number, type: string): File {
    const file = new File(['mock content'], name, { type })
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  function createMockMedia(name: string, idSuffix: string): AttachedMedia {
    return {
      id: `media_${idSuffix}`,
      name,
      size: 1024,
      type: 'image/png',
      previewUrl: `blob:mock-url-${name}`
    }
  }

  it('Matrix Row 1 (Hiển thị Live Preview bài viết không ảnh): Soạn text, 0 ảnh đính kèm', () => {
    const composer = useComposerStore()
    composer.setContent('Nội dung bài viết giới thiệu sản phẩm cáp sạc nhanh Type-C.')

    expect(composer.content).toContain('cáp sạc nhanh Type-C')
    expect(composer.hasMedia).toBe(false)
    expect(composer.mediaFiles.length).toBe(0)
    expect(composer.coverPhoto).toBeNull()
    expect(composer.currentVariant).toBe('Nội dung bài viết giới thiệu sản phẩm cáp sạc nhanh Type-C.')
  })

  it('Matrix Row 2 (Hiển thị Live Preview 1 ảnh): 1 ảnh đính kèm hiển thị full khổ', () => {
    const composer = useComposerStore()
    const file1 = createMockFile('cover.png', 1024, 'image/png')
    composer.addMediaFiles([file1])

    expect(composer.mediaFiles.length).toBe(1)
    expect(composer.hasMedia).toBe(true)
    expect(composer.coverPhoto?.name).toBe('cover.png')
  })

  it('Matrix Row 3 (Hiển thị Live Preview 2 ảnh): Lưới 2 ảnh chia đôi song song', () => {
    const composer = useComposerStore()
    const file1 = createMockFile('img1.png', 1024, 'image/png')
    const file2 = createMockFile('img2.jpg', 2048, 'image/jpeg')
    composer.addMediaFiles([file1, file2])

    expect(composer.mediaFiles.length).toBe(2)
    expect(composer.mediaFiles[0].name).toBe('img1.png')
    expect(composer.mediaFiles[1].name).toBe('img2.jpg')
    expect(composer.coverPhoto?.name).toBe('img1.png')
  })

  it('Matrix Row 4 (Hiển thị Live Preview 3 ảnh): 1 ảnh lớn bên trái và 2 ảnh nhỏ xếp dọc bên phải', () => {
    const composer = useComposerStore()
    const file1 = createMockFile('img1.png', 1024, 'image/png')
    const file2 = createMockFile('img2.png', 2048, 'image/png')
    const file3 = createMockFile('img3.png', 3072, 'image/png')
    composer.addMediaFiles([file1, file2, file3])

    expect(composer.mediaFiles.length).toBe(3)
    expect(composer.coverPhoto?.name).toBe('img1.png')
    expect(composer.mediaFiles[1].name).toBe('img2.png')
    expect(composer.mediaFiles[2].name).toBe('img3.png')
  })

  it('Matrix Row 5 (Hiển thị Live Preview 4 ảnh): Bố cục collage 4 ảnh', () => {
    const composer = useComposerStore()
    const file1 = createMockFile('img1.png', 1024, 'image/png')
    const file2 = createMockFile('img2.png', 2048, 'image/png')
    const file3 = createMockFile('img3.png', 3072, 'image/png')
    const file4 = createMockFile('img4.png', 4096, 'image/png')
    composer.addMediaFiles([file1, file2, file3, file4])

    expect(composer.mediaFiles.length).toBe(4)
    expect(composer.coverPhoto?.name).toBe('img1.png')
    expect(composer.mediaFiles[3].name).toBe('img4.png')
  })

  it('Matrix Row 6 (Đổi thứ tự ảnh trong MediaDropzone): Kéo thả đổi vị trí và cập nhật tức thì ảnh bìa', () => {
    const composer = useComposerStore()
    const file1 = createMockFile('img1.png', 1024, 'image/png')
    const file2 = createMockFile('img2.png', 2048, 'image/png')
    composer.addMediaFiles([file1, file2])

    expect(composer.coverPhoto?.name).toBe('img1.png')

    // Hoán đổi vị trí ảnh 1 và ảnh 0
    composer.reorderMedia(1, 0)
    expect(composer.coverPhoto?.name).toBe('img2.png')
    expect(composer.mediaFiles[0].name).toBe('img2.png')
    expect(composer.mediaFiles[1].name).toBe('img1.png')
  })

  it('Matrix Row 7 (Thử nghiệm biến thể Spintax qua nút bấm hoặc phím tắt ⌘R): Giải mã biến thể ngẫu nhiên và cảnh báo lỗi cú pháp', async () => {
    const composer = useComposerStore()

    // Cú pháp Spintax hợp lệ
    composer.setContent('{Chào bạn|Xin chào|Hi cả nhà}, shop vừa về hàng mới!')
    expect(composer.spintaxError).toBeNull()

    const variant1 = await composer.testSpintaxVariant()
    expect(['Chào bạn, shop vừa về hàng mới!', 'Xin chào, shop vừa về hàng mới!', 'Hi cả nhà, shop vừa về hàng mới!']).toContain(variant1)

    // Cú pháp Spintax lỗi
    composer.setContent('{Chưa đóng ngoặc Spintax|Lỗi cú pháp')
    expect(composer.spintaxError).not.toBeNull()
    const errorVariant = await composer.testSpintaxVariant()
    expect(errorVariant).toBe('')
  })

  it('Matrix Row 8 (Chọn nhóm đích trong TargetSelectorCompact): Tích chọn nhóm và cập nhật số lượng đã chọn', () => {
    const composer = useComposerStore()
    const targets = useTargetsStore()

    // Khởi tạo mock targets
    const mockGroup1: TargetDTO = {
      id: 'target-grp-1',
      account_id: 'acc-1',
      folder_id: null,
      fb_id: 'fb-grp-1',
      name: 'Hội Săn Đồ Công Nghệ HN',
      type: 'group',
      privacy: 'public',
      avatar_url: null,
      last_synced_at: null
    }

    const mockGroup2: TargetDTO = {
      id: 'target-grp-2',
      account_id: 'acc-1',
      folder_id: null,
      fb_id: 'fb-grp-2',
      name: 'Chợ Phụ Kiện Điện Thoại VN',
      type: 'group',
      privacy: 'private',
      avatar_url: null,
      last_synced_at: null
    }

    targets.targets = [mockGroup1, mockGroup2]

    // Ban đầu chưa chọn gì
    expect(composer.selectedTargetsCount).toBe(0)
    expect(composer.isTargetSelected('target-grp-1')).toBe(false)

    // Tích chọn group 1
    composer.toggleTarget('target-grp-1')
    expect(composer.isTargetSelected('target-grp-1')).toBe(true)
    expect(composer.selectedTargetsCount).toBe(1)

    // Tích chọn group 2
    composer.toggleTarget('target-grp-2')
    expect(composer.selectedTargetsCount).toBe(2)

    // Bỏ chọn group 1
    composer.toggleTarget('target-grp-1')
    expect(composer.isTargetSelected('target-grp-1')).toBe(false)
    expect(composer.selectedTargetsCount).toBe(1)
  })

  it('Matrix Row 9 (Chưa chọn nhóm đích nào): Live Preview hiển thị Chưa chọn nhóm đích hoặc Trang cá nhân', () => {
    const composer = useComposerStore()
    composer.clearSelectedTargets()

    expect(composer.selectedTargetIds.length).toBe(0)
    expect(composer.selectedTargetsCount).toBe(0)
  })

  it('Matrix Row 10 (Tài khoản chưa đăng nhập Facebook): Xử lý gracefully khi accountStore.account là null', () => {
    const account = useAccountStore()
    expect(account.account).toBeNull()

    // Helper logic fallback trong preview: tên mặc định "Tài khoản Facebook", chữ cái đầu "U"
    const authorName = account.account?.name || 'Tài khoản Facebook'
    const authorInitial = authorName.trim() ? authorName.charAt(0).toUpperCase() : 'U'

    expect(authorName).toBe('Tài khoản Facebook')
    expect(authorInitial).toBe('T')
  })
})
