import type Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    -- Accounts: Facebook credentials & encrypted session
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      fb_user_id TEXT,
      name TEXT NOT NULL,
      avatar_url TEXT,
      encrypted_session BLOB,
      status TEXT NOT NULL DEFAULT 'disconnected',
      status_reason TEXT,
      last_synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Target Folders: Group organization
    CREATE TABLE IF NOT EXISTS target_folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'primary_account',
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Targets: Profiles and Joined Groups
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'primary_account',
      folder_id TEXT,
      fb_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'profile' | 'group'
      privacy TEXT NOT NULL DEFAULT 'public', -- 'public' | 'private'
      avatar_url TEXT,
      last_synced_at DATETIME,
      FOREIGN KEY(folder_id) REFERENCES target_folders(id) ON DELETE SET NULL
    );

    -- Campaigns: Composed campaigns with spintax & media
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'primary_account',
      title TEXT NOT NULL,
      raw_content TEXT NOT NULL,
      spintax_enabled INTEGER NOT NULL DEFAULT 1,
      media_paths TEXT NOT NULL, -- JSON array string, max 4 paths
      min_jitter_sec INTEGER NOT NULL DEFAULT 180,
      max_jitter_sec INTEGER NOT NULL DEFAULT 300,
      scheduled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Scheduled Tasks: Individual target delivery executions
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      account_id TEXT NOT NULL DEFAULT 'primary_account',
      target_id TEXT NOT NULL,
      resolved_spintax_text TEXT NOT NULL,
      media_paths TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      retry_count INTEGER NOT NULL DEFAULT 0,
      scheduled_at DATETIME NOT NULL,
      executed_at DATETIME,
      permalink TEXT,
      error_code TEXT,
      error_message TEXT,
      screenshot_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY(target_id) REFERENCES targets(id) ON DELETE CASCADE
    );

    -- App Settings: Key-value configuration
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}
