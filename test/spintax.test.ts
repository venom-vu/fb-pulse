import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { validateSpintax, resolveSpintax, tryResolveSpintax } from '../src/shared/spintax'
import { composerService } from '../src/main/services/composer.service'
import { useComposerStore } from '../src/renderer/src/stores/composer'

describe('Story 3.1: Spintax Engine & Matrix Verification', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Scenario 1: Chèn Spintax cơ bản
  it('Scenario 1: insertSpintaxPattern chèn cụm {lựa chọn 1|lựa chọn 2} vào đúng vị trí con trỏ', () => {
    const store = useComposerStore()
    store.setContent('Xin chào, chúc bạn một ngày tốt lành!')

    // Giả lập HTMLTextAreaElement
    const textarea = {
      value: store.content,
      selectionStart: 9, // sau chữ "Xin chào,"
      selectionEnd: 9,
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    } as unknown as HTMLTextAreaElement

    store.insertSpintaxPattern(textarea)

    expect(store.content).toBe('Xin chào,{lựa chọn 1|lựa chọn 2} chúc bạn một ngày tốt lành!')
    expect(store.spintaxError).toBeNull()
    expect(store.isValid).toBe(true)
  })

  // Scenario 2: Spintax lồng nhau hợp lệ
  it('Scenario 2: Xử lý chính xác Spintax lồng nhau đa cấp {Chào {anh|chị}|Hi {bạn|cả nhà}}', () => {
    const template = '{Chào {anh|chị}|Hi {bạn|cả nhà}}'
    const validation = validateSpintax(template)
    expect(validation.isValid).toBe(true)
    expect(validation.error).toBeUndefined()

    const validVariants = ['Chào anh', 'Chào chị', 'Hi bạn', 'Hi cả nhà']

    // Thử nghiệm 20 lần ngẫu nhiên
    for (let i = 0; i < 20; i++) {
      const variant = resolveSpintax(template)
      expect(validVariants).toContain(variant)
    }

    // Test với deterministic rng
    // rng = 0 -> nhánh 0 "Chào {anh|chị}" -> nhánh 0 "anh" -> "Chào anh"
    const variant0 = resolveSpintax(template, () => 0)
    expect(variant0).toBe('Chào anh')

    // rng = 0.99 -> nhánh 1 "Hi {bạn|cả nhà}" -> nhánh 1 "cả nhà" -> "Hi cả nhà"
    const variant1 = resolveSpintax(template, () => 0.99)
    expect(variant1).toBe('Hi cả nhà')
  })

  // Scenario 3: Thiếu ngoặc đóng }
  it('Scenario 3: Phát hiện lỗi thiếu ngoặc đóng "}"', () => {
    const template = '{Chào bạn|Hi cả nhà'
    const validation = validateSpintax(template)
    expect(validation.isValid).toBe(false)
    expect(validation.error).toBe("Thiếu dấu đóng ngoặc '}'")

    // Khi đưa vào store
    const store = useComposerStore()
    store.setContent(template)
    expect(store.spintaxError).toBe("Thiếu dấu đóng ngoặc '}'")
    expect(store.isValid).toBe(false)
  })

  // Scenario 4: Thừa ngoặc đóng }
  it('Scenario 4: Phát hiện lỗi thừa ngoặc đóng "}" không có ngoặc mở tương ứng', () => {
    const template = 'Chào bạn}|Hi cả nhà'
    const validation = validateSpintax(template)
    expect(validation.isValid).toBe(false)
    expect(validation.error).toBe("Thừa dấu đóng ngoặc '}' không có ngoặc mở tương ứng")

    const store = useComposerStore()
    store.setContent(template)
    expect(store.spintaxError).toBe("Thừa dấu đóng ngoặc '}' không có ngoặc mở tương ứng")
    expect(store.isValid).toBe(false)
  })

  // Scenario 5: Cặp ngoặc rỗng {}
  it('Scenario 5: Phát hiện lỗi khối Spintax rỗng {}', () => {
    const template = 'Chào {} bạn'
    const validation = validateSpintax(template)
    expect(validation.isValid).toBe(false)
    expect(validation.error).toBe('Khối Spintax không được để trống')

    const templateWithSpaces = 'Chào {   } bạn'
    const valSpaces = validateSpintax(templateWithSpaces)
    expect(valSpaces.isValid).toBe(false)
    expect(valSpaces.error).toBe('Khối Spintax không được để trống')

    const store = useComposerStore()
    store.setContent(template)
    expect(store.spintaxError).toBe('Khối Spintax không được để trống')
  })

  // Scenario 6: Văn bản không chứa Spintax
  it('Scenario 6: Văn bản thuần túy không chứa Spintax trả về nguyên bản', () => {
    const template = 'Hôm nay shop xả kho giá tốt'
    const validation = validateSpintax(template)
    expect(validation.isValid).toBe(true)

    const resolved = resolveSpintax(template)
    expect(resolved).toBe(template)

    const store = useComposerStore()
    store.setContent(template)
    expect(store.isValid).toBe(true)
    expect(store.spintaxError).toBeNull()
  })

  // Scenario 7: Thử nghiệm biến thể (⌘R hoặc click nút xúc xắc)
  it('Scenario 7: testSpintaxVariant tạo biến thể ngẫu nhiên hiển thị xem trước', async () => {
    const store = useComposerStore()
    store.setContent('{Sáng|Chiều|Tối} nay {khai trương|mở bán} ưu đãi!')

    // Giả lập IPC bridge
    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        composer: {
          testSpintaxVariant: vi.fn().mockImplementation(async (tmpl: string) => ({
            success: true,
            data: composerService.resolveSpintaxVariant(tmpl)
          }))
        }
      }
    }

    const variant = await store.testSpintaxVariant()
    expect(variant).toBeTruthy()
    expect(store.currentVariant).toBe(variant)
    expect(store.spintaxError).toBeNull()
  })

  // Scenario 8: Ký tự đặc biệt trong Spintax
  it('Scenario 8: Xử lý an toàn ký tự đặc biệt và escape pipe \\|', () => {
    const template = '{Giá: 100k (free ship)|Hotline: 0909... \\| sale 50%}'
    const validation = validateSpintax(template)
    expect(validation.isValid).toBe(true)

    // Option 0
    const variant0 = resolveSpintax(template, () => 0)
    expect(variant0).toBe('Giá: 100k (free ship)')

    // Option 1 with escaped pipe
    const variant1 = resolveSpintax(template, () => 0.99)
    expect(variant1).toBe('Hotline: 0909... | sale 50%')
  })

  // Edge Case: Cấu trúc lồng nhau sâu 4 cấp
  it('Edge Case: Cấu trúc lồng nhau sâu 4 cấp {A|{B|{C|{D|E}}}}', () => {
    const template = '{A|{B|{C|{D|E}}}}'
    expect(validateSpintax(template).isValid).toBe(true)

    const allExpected = ['A', 'B', 'C', 'D', 'E']
    for (let i = 0; i < 30; i++) {
      const result = resolveSpintax(template)
      expect(allExpected).toContain(result)
    }
  })

  // ComposerService integration
  it('ComposerService: validateSpintax và resolveSpintaxVariant hoạt động đồng nhất', () => {
    const template = '{Khuyến mãi|Ưu đãi} sốc!'
    const validation = composerService.validateSpintax(template)
    expect(validation.isValid).toBe(true)

    const variant = composerService.resolveSpintaxVariant(template)
    expect(['Khuyến mãi sốc!', 'Ưu đãi sốc!']).toContain(variant)

    const safeResult = composerService.tryResolveSpintaxVariant('{Lỗi ngoặc')
    expect(safeResult.success).toBe(false)
    expect(safeResult.error).toBe("Thiếu dấu đóng ngoặc '}'")
  })
})
