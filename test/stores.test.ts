import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNavigationStore } from '../src/renderer/src/stores/navigation'
import { useAccountStore } from '../src/renderer/src/stores/account'
import { useTargetsStore } from '../src/renderer/src/stores/targets'

describe('Pinia Stores & Navigation Matrix Verification', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Navigation Store (Matrix Row 4): default activeTab is composer and transitions correctly', () => {
    const nav = useNavigationStore()
    expect(nav.activeTab).toBe('composer')

    nav.setActiveTab('queue')
    expect(nav.activeTab).toBe('queue')

    nav.setActiveTab('targets')
    expect(nav.activeTab).toBe('targets')

    nav.setActiveTab('settings')
    expect(nav.activeTab).toBe('settings')
  })

  it('Account Store (Matrix Row 3): initial state is null and handles null gracefully', async () => {
    const accountStore = useAccountStore()
    expect(accountStore.account).toBeNull()
    expect(accountStore.isLoading).toBe(false)

    // Mock window.fbPulseAPI returning null (Chưa kết nối tài khoản Facebook)
    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({ success: true, data: null })
        }
      }
    }

    await accountStore.fetchProfile()
    expect(accountStore.account).toBeNull()
    expect(accountStore.isLoading).toBe(false)
  })

  it('Account Store: updates account when profile is returned', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({
            success: true,
            data: {
              id: 'acc-1',
              fb_user_id: '123456789',
              name: 'John Doe',
              avatar_url: 'https://example.com/avatar.jpg',
              status: 'connected',
              status_reason: null,
              last_synced_at: new Date().toISOString()
            }
          })
        }
      }
    }

    await accountStore.fetchProfile()
    expect(accountStore.account).not.toBeNull()
    expect(accountStore.account?.name).toBe('John Doe')
    expect(accountStore.account?.status).toBe('connected')
  })

  it('Account Store: handles loginFacebook when cancelled by user', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({ success: true, data: null }),
          loginWebView: async () => ({
            success: true,
            data: { success: false, cancelled: true }
          })
        }
      }
    }

    const res = await accountStore.loginFacebook()
    expect(res.success).toBe(false)
    expect(res.cancelled).toBe(true)
    expect(accountStore.isLoggingIn).toBe(false)
    expect(accountStore.account).toBeNull()
  })

  it('Account Store: handles loginFacebook when successful', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          getProfile: async () => ({
            success: true,
            data: {
              id: 'primary_account',
              fb_user_id: '100088192837162',
              name: 'Facebook User (100088192837162)',
              avatar_url: null,
              status: 'connected',
              status_reason: null,
              last_synced_at: new Date().toISOString()
            }
          }),
          loginWebView: async () => ({
            success: true,
            data: { success: true, userId: '100088192837162' }
          })
        }
      }
    }

    const res = await accountStore.loginFacebook()
    expect(res.success).toBe(true)
    expect(res.userId).toBe('100088192837162')
    expect(accountStore.isLoggingIn).toBe(false)
    expect(accountStore.account).not.toBeNull()
    expect(accountStore.account?.fb_user_id).toBe('100088192837162')
  })

  it('Account Store (Story 1.3): handles importSessionJson successfully and updates store', async () => {
    const accountStore = useAccountStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          importSessionJson: async (json: string) => ({
            success: true,
            data: {
              id: 'primary_account',
              fb_user_id: '100099887766554',
              name: 'Imported FB User',
              avatar_url: null,
              status: 'connected',
              status_reason: null,
              last_synced_at: new Date().toISOString()
            }
          })
        }
      }
    }

    const res = await accountStore.importSessionJson('mock_json')
    expect(res.success).toBe(true)
    expect(accountStore.account).not.toBeNull()
    expect(accountStore.account?.fb_user_id).toBe('100099887766554')
    expect(accountStore.account?.status).toBe('connected')
    expect(accountStore.isLoading).toBe(false)
  })

  it('Account Store (Story 1.3): handles logout and clears account in store', async () => {
    const accountStore = useAccountStore()

    // Set an initial account
    accountStore.account = {
      id: 'primary_account',
      fb_user_id: '100099887766554',
      name: 'Imported FB User',
      avatar_url: null,
      status: 'connected',
      status_reason: null,
      last_synced_at: new Date().toISOString()
    }

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          logout: async () => ({ success: true, data: undefined })
        }
      }
    }

    const success = await accountStore.logout()
    expect(success).toBe(true)
    expect(accountStore.account).toBeNull()
    expect(accountStore.isLoading).toBe(false)
  })

  it('Account Store (Story 1.4): detects isCheckpointRequired and runs checkHealth', async () => {
    const accountStore = useAccountStore()

    accountStore.account = {
      id: 'primary_account',
      fb_user_id: '100099887766554',
      name: 'Checkpoint User',
      avatar_url: null,
      status: 'checkpoint_required',
      status_reason: 'Facebook yêu cầu Checkpoint',
      last_synced_at: new Date().toISOString()
    }

    expect(accountStore.isCheckpointRequired).toBe(true)

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        account: {
          checkHealth: async () => ({
            success: true,
            data: { valid: false, reason: 'Yêu cầu xác thực', isCheckpoint: true }
          }),
          getProfile: async () => ({
            success: true,
            data: accountStore.account
          })
        }
      }
    }

    const health = await accountStore.checkHealth()
    expect(health.valid).toBe(false)
    expect(health.reason).toBe('Yêu cầu xác thực')
  })

  it('Queue Store (Story 1.4): manages emergency pause, fetch status, and resume', async () => {
    const { useQueueStore } = await import('../src/renderer/src/stores/queue')
    const queueStore = useQueueStore()

    expect(queueStore.isEmergencyPaused).toBe(false)
    expect(queueStore.authPausedCount).toBe(0)

    let authPaused = 3
    let scheduled = 0

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        queue: {
          getStatus: async () => ({
            success: true,
            data: { scheduledCount: scheduled, authPausedCount: authPaused, totalCount: 5 }
          }),
          resumeAuthPaused: async () => {
            authPaused = 0
            scheduled = 3
            return {
              success: true,
              data: { resumedCount: 3 }
            }
          }
        }
      }
    }

    await queueStore.fetchQueueStatus()
    expect(queueStore.authPausedCount).toBe(3)
    expect(queueStore.totalCount).toBe(5)
    expect(queueStore.isEmergencyPaused).toBe(true)

    // Test handleEmergencyPauseEvent
    queueStore.handleEmergencyPauseEvent({
      reason: 'Đổi mật khẩu từ xa',
      timestamp: '2026-09-19T11:00:00Z'
    })
    expect(queueStore.isEmergencyPaused).toBe(true)
    expect(queueStore.emergencyPauseReason).toBe('Đổi mật khẩu từ xa')
    expect(queueStore.showSecurityModal).toBe(true)

    // Test resume
    const res = await queueStore.resumeQueue()
    expect(res.success).toBe(true)
    expect(res.resumedCount).toBe(3)
    expect(queueStore.isEmergencyPaused).toBe(false)
  })

  it('Targets Store: fetches targets and calculates profile/group getters correctly', async () => {
    const targetsStore = useTargetsStore()
    expect(targetsStore.targets).toEqual([])
    expect(targetsStore.isLoading).toBe(false)

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        targets: {
          list: async () => ({
            success: true,
            data: [
              {
                id: 'target_primary_account_profile_1',
                account_id: 'primary_account',
                folder_id: null,
                fb_id: 'profile_1',
                name: 'Nguyễn Văn A',
                type: 'profile',
                privacy: 'public',
                avatar_url: null,
                last_synced_at: '2026-09-19T10:00:00Z'
              },
              {
                id: 'target_primary_account_group_1',
                account_id: 'primary_account',
                folder_id: null,
                fb_id: 'group_1',
                name: 'Nhóm Công Nghệ',
                type: 'group',
                privacy: 'public',
                avatar_url: null,
                last_synced_at: '2026-09-19T10:00:00Z'
              },
              {
                id: 'target_primary_account_group_2',
                account_id: 'primary_account',
                folder_id: 'folder_1',
                fb_id: 'group_2',
                name: 'Nhóm Mua Bán Kín',
                type: 'group',
                privacy: 'private',
                avatar_url: null,
                last_synced_at: '2026-09-19T10:00:00Z'
              }
            ]
          }),
          listFolders: async () => ({
            success: true,
            data: [{ id: 'folder_1', account_id: 'primary_account', name: 'Folder 1' }]
          })
        }
      }
    }

    await targetsStore.fetchTargets()
    await targetsStore.fetchFolders()

    expect(targetsStore.totalTargetsCount).toBe(3)
    expect(targetsStore.totalGroupsCount).toBe(2)
    expect(targetsStore.profileTarget?.name).toBe('Nguyễn Văn A')
    expect(targetsStore.groupTargets).toHaveLength(2)

    // Lọc theo tìm kiếm
    targetsStore.searchQuery = 'Công Nghệ'
    expect(targetsStore.filteredTargets).toHaveLength(1)
    expect(targetsStore.filteredTargets[0].name).toBe('Nhóm Công Nghệ')

    targetsStore.searchQuery = ''
    expect(targetsStore.filteredTargets).toHaveLength(3)
  })

  it('Targets Store: syncTargets updates state and handles success/error', async () => {
    const targetsStore = useTargetsStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        targets: {
          syncFromFacebook: async () => ({
            success: true,
            data: {
              targets: [
                {
                  id: 'target_primary_account_profile_1',
                  account_id: 'primary_account',
                  folder_id: null,
                  fb_id: 'profile_1',
                  name: 'Nguyễn Văn A',
                  type: 'profile',
                  privacy: 'public',
                  avatar_url: null,
                  last_synced_at: '2026-09-19T10:00:00Z'
                }
              ],
              syncedCount: 10
            }
          })
        }
      }
    }

    const result = await targetsStore.syncTargets()
    expect(result.success).toBe(true)
    expect(result.count).toBe(10)
    expect(targetsStore.lastSyncCount).toBe(10)
    expect(targetsStore.syncSuccessMessage).toContain('10 nhóm')
    expect(targetsStore.isSyncing).toBe(false)
  })

  it('Targets Store (Story 2.2): folder CRUD, filtering, counts, and batch assign', async () => {
    const targetsStore = useTargetsStore()

    // @ts-ignore
    global.window = {
      fbPulseAPI: {
        targets: {
          createFolder: async (name: string) => ({
            success: true,
            data: { id: 'folder_1', account_id: 'primary_account', name }
          }),
          updateFolder: async (folderId: string, name: string) => ({
            success: true,
            data: { id: folderId, account_id: 'primary_account', name }
          }),
          deleteFolder: async (_folderId: string) => ({
            success: true
          }),
          assignToFolder: async (_targetId: string, _folderId: string | null) => ({
            success: true
          }),
          batchAssignToFolder: async (_targetIds: string[], _folderId: string | null) => ({
            success: true
          })
        }
      }
    }

    // 1. Tạo folder
    const created = await targetsStore.createFolder('Nhóm Đồ Công Nghệ')
    expect(created).not.toBeNull()
    expect(created?.name).toBe('Nhóm Đồ Công Nghệ')
    expect(targetsStore.folders).toHaveLength(1)

    // 2. Cập nhật folder
    const updated = await targetsStore.updateFolder('folder_1', 'Cộng Đồng Công Nghệ VN')
    expect(updated?.name).toBe('Cộng Đồng Công Nghệ VN')
    expect(targetsStore.folders[0].name).toBe('Cộng Đồng Công Nghệ VN')

    // 3. Chuẩn bị targets test
    targetsStore.targets = [
      {
        id: 't1',
        account_id: 'primary_account',
        folder_id: null,
        fb_id: 'fb1',
        name: 'Nhóm 1',
        type: 'group',
        privacy: 'public',
        avatar_url: null,
        last_synced_at: null
      },
      {
        id: 't2',
        account_id: 'primary_account',
        folder_id: null,
        fb_id: 'fb2',
        name: 'Nhóm 2',
        type: 'group',
        privacy: 'private',
        avatar_url: null,
        last_synced_at: null
      }
    ]

    expect(targetsStore.unassignedCount).toBe(2)
    expect(targetsStore.folderCounts['folder_1']).toBe(0)

    // 4. Batch assign t1 và t2 vào folder_1
    const batchOk = await targetsStore.batchAssignToFolder(['t1', 't2'], 'folder_1')
    expect(batchOk).toBe(true)
    expect(targetsStore.targets[0].folder_id).toBe('folder_1')
    expect(targetsStore.targets[1].folder_id).toBe('folder_1')
    expect(targetsStore.unassignedCount).toBe(0)
    expect(targetsStore.folderCounts['folder_1']).toBe(2)

    // 5. Lọc theo folder
    targetsStore.selectedFolderId = 'folder_1'
    expect(targetsStore.filteredTargets).toHaveLength(2)

    targetsStore.selectedFolderId = 'unassigned'
    expect(targetsStore.filteredTargets).toHaveLength(0)

    // 6. Gán đơn lẻ t2 về null
    await targetsStore.assignToFolder('t2', null)
    expect(targetsStore.targets[1].folder_id).toBeNull()
    expect(targetsStore.unassignedCount).toBe(1)
    expect(targetsStore.folderCounts['folder_1']).toBe(1)

    // 7. Xóa folder
    targetsStore.selectedFolderId = 'folder_1'
    const delOk = await targetsStore.deleteFolder('folder_1')
    expect(delOk).toBe(true)
    expect(targetsStore.folders).toHaveLength(0)
    // Target t1 từng ở folder_1 giờ đã được reset về null
    expect(targetsStore.targets[0].folder_id).toBeNull()
    expect(targetsStore.selectedFolderId).toBeNull()
  })
})


