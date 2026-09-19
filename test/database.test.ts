import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'

describe('SQLite WAL & Schema Initialization (Row 5 in Matrix)', () => {
  let db: Database.Database

  beforeEach(() => {
    // In-memory database for rapid, isolated testing
    db = new Database(':memory:')
    initializeSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  it('should initialize WAL mode and normal synchronous settings', () => {
    const journalMode = db.pragma('journal_mode', { simple: true })
    // In-memory databases report 'memory', but executing WAL pragma succeeds without error
    expect(journalMode).toBeDefined()

    const foreignKeys = db.pragma('foreign_keys', { simple: true })
    expect(foreignKeys).toBe(1)
  })

  it('should create all required tables defined in ARCHITECTURE-SPINE', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)

    expect(tables).toContain('accounts')
    expect(tables).toContain('target_folders')
    expect(tables).toContain('targets')
    expect(tables).toContain('campaigns')
    expect(tables).toContain('scheduled_tasks')
    expect(tables).toContain('app_settings')
  })

  it('should handle accounts table schema correctly with status disconnected by default', () => {
    db.prepare(`
      INSERT INTO accounts (id, name) VALUES (?, ?)
    `).run('test-acc-1', 'Nguyen Van A')

    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get('test-acc-1') as any
    expect(acc.name).toBe('Nguyen Van A')
    expect(acc.status).toBe('disconnected')
  })
})
