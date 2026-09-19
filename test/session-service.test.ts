import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isFacebookNewsfeed,
  extractFacebookUserId,
  FB_PARTITION,
  FB_BASE_URL,
  SessionService
} from '../src/main/services/session.service'

describe('Session Service Matrix & Logic Verification (Story 1.2)', () => {
  describe('Matrix Row 3: isFacebookNewsfeed verification', () => {
    it('returns true for root Facebook URLs (Newsfeed)', () => {
      expect(isFacebookNewsfeed('https://www.facebook.com/')).toBe(true)
      expect(isFacebookNewsfeed('https://web.facebook.com/')).toBe(true)
      expect(isFacebookNewsfeed('https://m.facebook.com/')).toBe(true)
      expect(isFacebookNewsfeed('https://www.facebook.com/?sk=h_chr')).toBe(true)
      expect(isFacebookNewsfeed('https://www.facebook.com/home.php')).toBe(true)
    })

    it('returns false for auth, checkpoint, login or external pages', () => {
      expect(isFacebookNewsfeed('https://www.facebook.com/login')).toBe(false)
      expect(isFacebookNewsfeed('https://www.facebook.com/login/device-based/regular/login/')).toBe(false)
      expect(isFacebookNewsfeed('https://www.facebook.com/checkpoint/1501092823525282/')).toBe(false)
      expect(isFacebookNewsfeed('https://www.facebook.com/recover/initiate/')).toBe(false)
      expect(isFacebookNewsfeed('https://www.facebook.com/two_step_verification/')).toBe(false)
      expect(isFacebookNewsfeed('https://www.google.com/')).toBe(false)
      expect(isFacebookNewsfeed('not-a-valid-url')).toBe(false)
    })
  })

  describe('Matrix Row 3: extractFacebookUserId verification', () => {
    it('correctly extracts c_user value from cookies array', () => {
      const cookies = [
        { name: 'fr', value: '0xyz123' },
        { name: 'c_user', value: '100088192837162' },
        { name: 'xs', value: '45:session_token' }
      ]
      expect(extractFacebookUserId(cookies)).toBe('100088192837162')
    })

    it('returns null if c_user is missing or empty', () => {
      expect(extractFacebookUserId([{ name: 'datr', value: 'token' }])).toBeNull()
      expect(extractFacebookUserId([{ name: 'c_user', value: '' }])).toBeNull()
      expect(extractFacebookUserId([])).toBeNull()
    })
  })

  describe('Matrix Row 1 & 5: Partition and configuration constants', () => {
    it('uses the security-isolated partition persist:fb_main', () => {
      expect(FB_PARTITION).toBe('persist:fb_main')
      expect(FB_BASE_URL).toBe('https://www.facebook.com')
    })
  })

  describe('Matrix Row 4 & 5: SessionService window lifecycle & cancellation', () => {
    let service: SessionService

    beforeEach(() => {
      service = new SessionService()
      vi.useFakeTimers()
    })

    afterEach(() => {
      service.closeLoginWindow()
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('isLoginWindowOpen returns false initially', () => {
      expect(service.isLoginWindowOpen()).toBe(false)
    })
  })
})
