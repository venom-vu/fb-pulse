import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '../src/main/database/schema'
import { setDatabase } from '../src/main/database/connection'
import {
  encryptSession,
  decryptSession,
  validateAndParseSessionJson,
  sessionService
} from '../src/main/services/session.service'

describe('Story 1.3: Hardware Encryption & Local Session Persistence', () => {
  describe('safeStorage Encryption & Decryption Roundtrip', () => {
    it('encrypts and decrypts a plain text string correctly', () => {
      const originalText = 'facebook_session_secret_token_123456789'
      const encryptedBlob = encryptSession(originalText)

      expect(Buffer.isBuffer(encryptedBlob)).toBe(true)
      expect(encryptedBlob.length).toBeGreaterThan(0)

      const decryptedText = decryptSession(encryptedBlob)
      expect(decryptedText).toBe(originalText)
    })

    it('encrypts and decrypts complex UTF-8 Unicode characters (Vietnamese & Emojis)', () => {
      const unicodePayload = JSON.stringify({
        userName: 'Nguyễn Văn A',
        tagline: 'Mã hóa phần cứng bảo vệ tài khoản 🛡️ 🔑',
        timestamp: new Date().toISOString()
      })

      const encryptedBlob = encryptSession(unicodePayload)
      const decrypted = decryptSession(encryptedBlob)

      expect(decrypted).toBe(unicodePayload)
      const parsed = JSON.parse(decrypted)
      expect(parsed.userName).toBe('Nguyễn Văn A')
      expect(parsed.tagline).toContain('🛡️')
    })

    it('handles large session payloads with many cookies', () => {
      const mockCookies = Array.from({ length: 50 }, (_, i) => ({
        name: `cookie_${i}`,
        value: `value_${Math.random().toString(36).substring(2)}_${i}`,
        domain: '.facebook.com',
        path: '/',
        secure: true,
        httpOnly: true
      }))

      const payloadString = JSON.stringify({ cookies: mockCookies })
      const encryptedBlob = encryptSession(payloadString)
      const decryptedString = decryptSession(encryptedBlob)

      expect(decryptedString).toBe(payloadString)
      const parsed = JSON.parse(decryptedString)
      expect(parsed.cookies).toHaveLength(50)
      expect(parsed.cookies[0].name).toBe('cookie_0')
    })
  })

  describe('Session JSON Validator (c_user & xs Requirements)', () => {
    it('validates and parses a standard array of cookies successfully', () => {
      const validCookieArray = [
        { name: 'sb', value: 'secret_sb_value' },
        { name: 'c_user', value: '100088192837162' },
        { name: 'xs', value: '45:valid_session_xs_hash' },
        { name: 'fr', value: '0xyz123' }
      ]

      const result = validateAndParseSessionJson(JSON.stringify(validCookieArray))
      expect(result.valid).toBe(true)
      expect(result.userId).toBe('100088192837162')
      expect(result.cookies).toHaveLength(4)
      expect(result.error).toBeUndefined()
    })

    it('validates and parses Playwright storageState JSON structure', () => {
      const playwrightState = {
        cookies: [
          { name: 'c_user', value: '100099283746551' },
          { name: 'xs', value: '32:playwright_token' },
          { name: 'datr', value: 'browser_datr_123' }
        ],
        origins: []
      }

      const result = validateAndParseSessionJson(JSON.stringify(playwrightState))
      expect(result.valid).toBe(true)
      expect(result.userId).toBe('100099283746551')
      expect(result.cookies).toHaveLength(3)
    })

    it('rejects JSON missing the required c_user cookie', () => {
      const missingCUser = [
        { name: 'xs', value: '45:valid_session_xs_hash' },
        { name: 'fr', value: '0xyz123' }
      ]

      const result = validateAndParseSessionJson(JSON.stringify(missingCUser))
      expect(result.valid).toBe(false)
      expect(result.userId).toBeUndefined()
      expect(result.error).toContain('c_user')
    })

    it('rejects JSON missing the required xs cookie', () => {
      const missingXs = [
        { name: 'c_user', value: '100088192837162' },
        { name: 'datr', value: '0xyz123' }
      ]

      const result = validateAndParseSessionJson(JSON.stringify(missingXs))
      expect(result.valid).toBe(false)
      expect(result.userId).toBeUndefined()
      expect(result.error).toContain('xs')
    })

    it('rejects malformed non-JSON strings', () => {
      const malformedInput = 'not a json at all { c_user: 123 }'
      const result = validateAndParseSessionJson(malformedInput)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Cú pháp JSON không hợp lệ')
    })

    it('rejects JSON that is not an array or storageState object', () => {
      const invalidStructures = [
        JSON.stringify(12345),
        JSON.stringify('simple string'),
        JSON.stringify({ someOtherField: 'value' }),
        JSON.stringify(null)
      ]

      for (const input of invalidStructures) {
        const result = validateAndParseSessionJson(input)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }
    })
  })

  describe('SQLite Database Session Storage & Restoration with Encryption', () => {
    let testDb: Database.Database

    beforeEach(() => {
      testDb = new Database(':memory:')
      initializeSchema(testDb)
      setDatabase(testDb)
    })

    afterEach(() => {
      setDatabase(null)
      testDb.close()
    })

    it('saves encrypted session to SQLite accounts table and preserves BLOB integrity', async () => {
      const cookies = [
        { name: 'c_user', value: '100088192837162' },
        { name: 'xs', value: '45:test_session_xs' }
      ]

      const account = await sessionService.saveSessionToDatabase({
        fb_user_id: '100088192837162',
        name: 'Huy VQ Facebook',
        cookies
      })

      expect(account.id).toBe('primary_account')
      expect(account.fb_user_id).toBe('100088192837162')
      expect(account.name).toBe('Huy VQ Facebook')
      expect(account.status).toBe('connected')

      // Inspect the raw row in SQLite
      const row = testDb.prepare('SELECT * FROM accounts WHERE id = ?').get('primary_account') as any
      expect(row).toBeDefined()
      expect(row.status).toBe('connected')
      expect(row.encrypted_session).toBeDefined()
      expect(Buffer.isBuffer(row.encrypted_session)).toBe(true)

      // Ensure the BLOB can be decrypted back
      const decrypted = decryptSession(row.encrypted_session)
      const parsed = JSON.parse(decrypted)
      expect(parsed.cookies).toHaveLength(2)
      expect(parsed.cookies[0].name).toBe('c_user')
      expect(parsed.cookies[0].value).toBe('100088192837162')
    })

    it('restores account profile from SQLite encrypted session', async () => {
      const cookies = [
        { name: 'c_user', value: '100099887766554' },
        { name: 'xs', value: '67:xs_token_restored' }
      ]

      await sessionService.saveSessionToDatabase({
        fb_user_id: '100099887766554',
        name: 'Restored User',
        cookies
      })

      const restored = await sessionService.restoreSessionFromDatabase()
      expect(restored).not.toBeNull()
      expect(restored?.fb_user_id).toBe('100099887766554')
      expect(restored?.name).toBe('Restored User')
      expect(restored?.status).toBe('connected')
    })

    it('returns null when restoring from an empty database', async () => {
      const restored = await sessionService.restoreSessionFromDatabase()
      expect(restored).toBeNull()
    })

    it('clears session from database and returns null on subsequent restore', async () => {
      await sessionService.saveSessionToDatabase({
        fb_user_id: '100011223344556',
        cookies: [
          { name: 'c_user', value: '100011223344556' },
          { name: 'xs', value: '88:xs_to_be_cleared' }
        ]
      })

      const beforeClear = await sessionService.restoreSessionFromDatabase()
      expect(beforeClear).not.toBeNull()

      await sessionService.clearSession()

      const row = testDb.prepare('SELECT * FROM accounts WHERE id = ?').get('primary_account')
      expect(row).toBeUndefined()

      const afterClear = await sessionService.restoreSessionFromDatabase()
      expect(afterClear).toBeNull()
    })
  })
})
