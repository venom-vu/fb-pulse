import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TargetDTO, FolderDTO } from '../../../preload/types'

export const useTargetsStore = defineStore('targets', () => {
  const targets = ref<TargetDTO[]>([])
  const folders = ref<FolderDTO[]>([])
  const isLoading = ref<boolean>(false)
  const isSyncing = ref<boolean>(false)
  const syncError = ref<string | null>(null)
  const lastSyncCount = ref<number | null>(null)
  const syncSuccessMessage = ref<string | null>(null)
  const searchQuery = ref<string>('')
  const selectedFolderId = ref<string | null>(null) // null = all, 'unassigned' = no folder

  const profileTarget = computed(() => targets.value.find((t) => t.type === 'profile') || null)
  const groupTargets = computed(() => targets.value.filter((t) => t.type === 'group'))
  const totalTargetsCount = computed(() => targets.value.length)
  const totalGroupsCount = computed(() => groupTargets.value.length)
  const unassignedCount = computed(
    () => targets.value.filter((t) => !t.folder_id && t.type === 'group').length
  )
  const folderCounts = computed(() => {
    const counts: Record<string, number> = {}
    for (const folder of folders.value) {
      counts[folder.id] = 0
    }
    for (const target of targets.value) {
      if (target.folder_id && counts[target.folder_id] !== undefined) {
        counts[target.folder_id]++
      }
    }
    return counts
  })

  const filteredTargets = computed(() => {
    let result = targets.value

    // Lọc theo thư mục
    if (selectedFolderId.value === 'unassigned') {
      result = result.filter((t) => !t.folder_id && t.type === 'group')
    } else if (selectedFolderId.value) {
      result = result.filter((t) => t.folder_id === selectedFolderId.value)
    }

    // Lọc theo từ khóa tìm kiếm (đáp ứng NFR < 100ms)
    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.fb_id.toLowerCase().includes(query)
      )
    }

    return result
  })

  async function fetchTargets(): Promise<void> {
    if (!window.fbPulseAPI?.targets?.list) return
    isLoading.value = true
    try {
      const res = await window.fbPulseAPI.targets.list()
      if (res.success && res.data) {
        targets.value = res.data
      }
    } catch (err: any) {
      console.error('[TargetsStore] Failed to fetch targets:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchFolders(): Promise<void> {
    if (!window.fbPulseAPI?.targets?.listFolders) return
    try {
      const res = await window.fbPulseAPI.targets.listFolders()
      if (res.success && res.data) {
        folders.value = res.data
      }
    } catch (err: any) {
      console.error('[TargetsStore] Failed to fetch folders:', err)
    }
  }

  async function syncTargets(): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!window.fbPulseAPI?.targets?.syncFromFacebook) {
      return { success: false, error: 'API không sẵn sàng' }
    }

    isSyncing.value = true
    syncError.value = null
    syncSuccessMessage.value = null

    try {
      const res = await window.fbPulseAPI.targets.syncFromFacebook()
      if (res.success && res.data) {
        targets.value = res.data.targets
        lastSyncCount.value = res.data.syncedCount
        syncSuccessMessage.value = `Đã đồng bộ thành công ${res.data.syncedCount} nhóm và 1 trang cá nhân`
        return { success: true, count: res.data.syncedCount }
      } else {
        const msg = res.error?.message || 'Không thể đồng bộ danh sách nhóm'
        syncError.value = msg
        return { success: false, error: msg }
      }
    } catch (err: any) {
      const msg = err?.message || 'Lỗi không xác định khi đồng bộ nhóm'
      syncError.value = msg
      return { success: false, error: msg }
    } finally {
      isSyncing.value = false
    }
  }

  async function createFolder(name: string): Promise<FolderDTO | null> {
    if (!window.fbPulseAPI?.targets?.createFolder) return null
    try {
      const res = await window.fbPulseAPI.targets.createFolder(name)
      if (res.success && res.data) {
        folders.value.push(res.data)
        return res.data
      }
    } catch (err) {
      console.error('[TargetsStore] Failed to create folder:', err)
    }
    return null
  }

  async function updateFolder(folderId: string, name: string): Promise<FolderDTO | null> {
    if (!window.fbPulseAPI?.targets?.updateFolder) return null
    try {
      const res = await window.fbPulseAPI.targets.updateFolder(folderId, name)
      if (res.success && res.data) {
        const idx = folders.value.findIndex((f) => f.id === folderId)
        if (idx !== -1) {
          folders.value[idx] = res.data
        }
        return res.data
      }
    } catch (err) {
      console.error('[TargetsStore] Failed to update folder:', err)
    }
    return null
  }

  async function deleteFolder(folderId: string): Promise<boolean> {
    if (!window.fbPulseAPI?.targets?.deleteFolder) return false
    try {
      const res = await window.fbPulseAPI.targets.deleteFolder(folderId)
      if (res.success) {
        folders.value = folders.value.filter((f) => f.id !== folderId)
        // Reset folder_id on targets
        for (const target of targets.value) {
          if (target.folder_id === folderId) {
            target.folder_id = null
          }
        }
        if (selectedFolderId.value === folderId) {
          selectedFolderId.value = null
        }
        return true
      }
    } catch (err) {
      console.error('[TargetsStore] Failed to delete folder:', err)
    }
    return false
  }

  async function assignToFolder(targetId: string, folderId: string | null): Promise<boolean> {
    if (!window.fbPulseAPI?.targets?.assignToFolder) return false
    try {
      const res = await window.fbPulseAPI.targets.assignToFolder(targetId, folderId)
      if (res.success) {
        const target = targets.value.find((t) => t.id === targetId)
        if (target) {
          target.folder_id = folderId
        }
        return true
      }
    } catch (err) {
      console.error('[TargetsStore] Failed to assign target to folder:', err)
    }
    return false
  }

  async function batchAssignToFolder(targetIds: string[], folderId: string | null): Promise<boolean> {
    if (!window.fbPulseAPI?.targets?.batchAssignToFolder) return false
    try {
      const res = await window.fbPulseAPI.targets.batchAssignToFolder(targetIds, folderId)
      if (res.success) {
        const idSet = new Set(targetIds)
        for (const target of targets.value) {
          if (idSet.has(target.id)) {
            target.folder_id = folderId
          }
        }
        return true
      }
    } catch (err) {
      console.error('[TargetsStore] Failed to batch assign targets to folder:', err)
    }
    return false
  }

  return {
    targets,
    folders,
    isLoading,
    isSyncing,
    syncError,
    lastSyncCount,
    syncSuccessMessage,
    searchQuery,
    selectedFolderId,
    profileTarget,
    groupTargets,
    totalTargetsCount,
    totalGroupsCount,
    unassignedCount,
    folderCounts,
    filteredTargets,
    fetchTargets,
    fetchFolders,
    syncTargets,
    createFolder,
    updateFolder,
    deleteFolder,
    assignToFolder,
    batchAssignToFolder
  }
})
