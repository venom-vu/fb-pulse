import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Window Configuration & Design Tokens (Matrix Rows 1 & 2)', () => {
  it('Matrix Row 1: electron main creates frameless 100vh window with obsidian background', () => {
    const mainSrc = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf-8')
    expect(mainSrc).toContain("frame: false")
    expect(mainSrc).toContain("backgroundColor: '#0B111A'")
    expect(mainSrc).toContain("contextIsolation: true")
    expect(mainSrc).toContain("nodeIntegration: false")
  })

  it('Matrix Row 2: Titlebar is 38px and supports adaptive window controls', () => {
    const titlebarSrc = readFileSync(
      join(__dirname, '../src/renderer/src/components/layout/Titlebar.vue'),
      'utf-8'
    )
    expect(titlebarSrc).toContain('h-[38px]')
    expect(titlebarSrc).toContain('titlebar-drag-region')
    expect(titlebarSrc).toContain('Chưa kết nối tài khoản Facebook')
    expect(titlebarSrc).toContain('minimizeWindow')
    expect(titlebarSrc).toContain('maximizeWindow')
    expect(titlebarSrc).toContain('closeWindow')
  })

  it('Pure Dark Mode Design Tokens in CSS match DESIGN.md specifications', () => {
    const cssSrc = readFileSync(
      join(__dirname, '../src/renderer/src/assets/main.css'),
      'utf-8'
    )
    expect(cssSrc).toContain('--color-obsidian: #0B111A;')
    expect(cssSrc).toContain('--color-surface: #131B26;')
    expect(cssSrc).toContain('--color-slate-border: #1E293B;')
    expect(cssSrc).toContain('--color-emerald-pulse: #10B981;')
  })
})
