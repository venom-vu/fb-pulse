export interface AttachedMedia {
  id: string
  name: string
  size: number
  type: string
  path?: string
  previewUrl: string
}

export interface MediaValidationResult {
  valid: boolean
  error?: string
}

export const MAX_MEDIA_COUNT = 4
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

export interface TargetPreviewInfo {
  id: string
  name: string
  type: 'profile' | 'group'
  avatarUrl?: string | null
}
