export interface SpintaxValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Kiểm tra tính hợp lệ của chuỗi Spintax:
 * - Cân bằng các dấu ngoặc nhọn { và }
 * - Không cho phép khối spintax rỗng {}
 * - Hỗ trợ ký tự escape \{, \}, \|, \\
 */
export function validateSpintax(text: string): SpintaxValidationResult {
  let depth = 0
  const openIndices: number[] = []
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === '{') {
      depth++
      openIndices.push(i)
    } else if (char === '}') {
      if (depth === 0) {
        return {
          isValid: false,
          error: "Thừa dấu đóng ngoặc '}' không có ngoặc mở tương ứng"
        }
      }
      const openIndex = openIndices.pop()!
      const innerContent = text.slice(openIndex + 1, i)
      if (!innerContent.trim()) {
        return {
          isValid: false,
          error: 'Khối Spintax không được để trống'
        }
      }
      depth--
    }
  }

  if (depth > 0) {
    return {
      isValid: false,
      error: "Thiếu dấu đóng ngoặc '}'"
    }
  }

  return { isValid: true }
}

/**
 * Tách các tùy chọn trong khối Spintax theo dấu |, bỏ qua dấu | đã được escape (\|)
 */
function splitOptions(content: string): string[] {
  const options: string[] = []
  let current = ''
  let escaped = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (escaped) {
      current += char
      escaped = false
    } else if (char === '\\') {
      escaped = true
      current += char
    } else if (char === '|') {
      options.push(current)
      current = ''
    } else {
      current += char
    }
  }
  options.push(current)
  return options
}

/**
 * Giải mã các ký tự escape \{, \}, \|, \\ về ký tự nguyên bản
 */
function unescapeSpintax(text: string): string {
  return text.replace(/\\([{}|\\])/g, '$1')
}

/**
 * Giải mã một biến thể Spintax ngẫu nhiên từ cây cú pháp lồng nhau.
 * Hỗ trợ truyền hàm sinh số ngẫu nhiên `rng` phục vụ deterministic unit tests.
 */
export function resolveSpintax(text: string, rng: () => number = Math.random): string {
  const validation = validateSpintax(text)
  if (!validation.isValid) {
    throw new Error(validation.error || 'Cú pháp Spintax không hợp lệ')
  }

  let currentText = text
  const innermostRegex = /\{([^{}]+)\}/

  while (true) {
    const match = innermostRegex.exec(currentText)
    if (!match) break

    const fullMatch = match[0]
    const innerContent = match[1]
    const options = splitOptions(innerContent)
    const chosenIndex = Math.floor(rng() * options.length)
    const chosenOption = options[chosenIndex] ?? ''

    currentText =
      currentText.slice(0, match.index) +
      chosenOption +
      currentText.slice(match.index + fullMatch.length)
  }

  return unescapeSpintax(currentText)
}

/**
 * Thử giải mã Spintax an toàn không throw lỗi.
 */
export function tryResolveSpintax(
  text: string,
  rng: () => number = Math.random
): { success: boolean; result: string; error?: string } {
  const validation = validateSpintax(text)
  if (!validation.isValid) {
    return { success: false, result: text, error: validation.error }
  }
  try {
    const result = resolveSpintax(text, rng)
    return { success: true, result }
  } catch (err: any) {
    return { success: false, result: text, error: err?.message || 'Lỗi khi giải mã Spintax' }
  }
}
