import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { initializeSchema } from './schema'

let dbInstance: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance
  }

  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = join(userDataPath, 'fb_pulse.db')
  console.log(`[Database] Initializing SQLite database at: ${dbPath}`)

  dbInstance = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  })

  initializeSchema(dbInstance)
  return dbInstance
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close()
      console.log('[Database] Database connection closed.')
    } catch (err) {
      console.error('[Database] Error closing database:', err)
    } finally {
      dbInstance = null
    }
  }
}
