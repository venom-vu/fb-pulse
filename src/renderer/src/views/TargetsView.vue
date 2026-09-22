<template>
  <div class="h-full flex flex-col p-5 space-y-3.5 bg-[#0B111A] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-3 flex-shrink-0">
      <div>
        <h1 class="text-lg font-bold text-[#F1F5F9] tracking-tight">Quản Lý Đích Đăng</h1>
        <p class="text-[11px] text-[#94A3B8] mt-0.5">
          Quản lý trang cá nhân và các nhóm Facebook dùng để phân phối bài viết.
        </p>
      </div>

      <div class="flex items-center space-x-2.5">
        <button
          id="btn-create-folder"
          class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#F1F5F9] text-xs font-semibold border border-[#334155] transition-all duration-150 cursor-pointer"
          @click="openCreateFolderModal"
        >
          <FolderPlus class="w-3.5 h-3.5 text-[#10B981]" />
          <span>Tạo Thư Mục</span>
        </button>

        <button
          id="btn-sync-targets"
          :disabled="targetsStore.isSyncing || !isConnected"
          class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-md shadow-[#10B981]/20 transition-all duration-150 cursor-pointer"
          @click="handleSync"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': targetsStore.isSyncing }" />
          <span>{{ targetsStore.isSyncing ? 'Đang đồng bộ...' : 'Làm mới danh sách nhóm' }}</span>
        </button>
      </div>
    </div>

    <!-- Alert Banners -->
    <!-- Not connected warning -->
    <div
      v-if="!isConnected"
      class="bg-[#1E1B18] border border-[#F59E0B]/30 rounded-lg p-3 flex items-center justify-between text-xs text-[#FDE68A] flex-shrink-0"
    >
      <div class="flex items-center space-x-2.5">
        <AlertTriangle class="w-4 h-4 text-[#F59E0B] flex-shrink-0" />
        <span>Tài khoản Facebook chưa được kết nối. Vui lòng kết nối tài khoản để đồng bộ danh sách nhóm.</span>
      </div>
      <button
        class="px-2.5 py-1 bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] font-medium rounded text-[11px] transition-colors cursor-pointer"
        @click="accountStore.loginFacebook"
      >
        Kết nối ngay
      </button>
    </div>

    <!-- Sync Success Banner -->
    <div
      v-if="targetsStore.syncSuccessMessage"
      class="bg-[#0D2818] border border-[#10B981]/40 rounded-lg p-2.5 px-3 flex items-center justify-between text-xs text-[#A7F3D0] transition-all flex-shrink-0"
    >
      <div class="flex items-center space-x-2">
        <CheckCircle2 class="w-4 h-4 text-[#10B981] flex-shrink-0" />
        <span>{{ targetsStore.syncSuccessMessage }}</span>
      </div>
      <button
        class="text-[#6EE7B7] hover:text-white transition-colors cursor-pointer p-0.5"
        @click="targetsStore.syncSuccessMessage = null"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Sync Error Banner -->
    <div
      v-if="targetsStore.syncError"
      class="bg-[#2D1515] border border-[#EF4444]/40 rounded-lg p-2.5 px-3 flex items-center justify-between text-xs text-[#FECACA] transition-all flex-shrink-0"
    >
      <div class="flex items-center space-x-2">
        <AlertCircle class="w-4 h-4 text-[#EF4444] flex-shrink-0" />
        <span>{{ targetsStore.syncError }}</span>
      </div>
      <button
        class="text-[#FCA5A5] hover:text-white transition-colors cursor-pointer p-0.5"
        @click="targetsStore.syncError = null"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Stats & Quick Overview (Compact Bar) -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
      <div class="bg-[#131B26] border border-[#1E293B] rounded-lg p-2.5 px-3 flex items-center space-x-3">
        <div class="w-8 h-8 rounded-md bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981] flex-shrink-0">
          <User class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">Trang cá nhân</div>
          <div class="text-xs font-bold text-[#F1F5F9] truncate">
            {{ targetsStore.profileTarget ? targetsStore.profileTarget.name : 'Chưa đồng bộ' }}
          </div>
        </div>
      </div>

      <div class="bg-[#131B26] border border-[#1E293B] rounded-lg p-2.5 px-3 flex items-center space-x-3">
        <div class="w-8 h-8 rounded-md bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#3B82F6] flex-shrink-0">
          <Users class="w-4 h-4" />
        </div>
        <div>
          <div class="text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">Tổng số nhóm</div>
          <div class="text-sm font-bold text-[#F1F5F9]">
            {{ targetsStore.totalGroupsCount }} <span class="text-[11px] font-normal text-[#94A3B8]">nhóm</span>
          </div>
        </div>
      </div>

      <div class="bg-[#131B26] border border-[#1E293B] rounded-lg p-2.5 px-3 flex items-center space-x-3">
        <div class="w-8 h-8 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] flex-shrink-0">
          <Folder class="w-4 h-4" />
        </div>
        <div>
          <div class="text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">Thư mục phân loại</div>
          <div class="text-sm font-bold text-[#F1F5F9]">
            {{ targetsStore.folders.length }} <span class="text-[11px] font-normal text-[#94A3B8]">thư mục</span>
          </div>
        </div>
      </div>

      <div class="bg-[#131B26] border border-[#1E293B] rounded-lg p-2.5 px-3 flex items-center space-x-3">
        <div class="w-8 h-8 rounded-md bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6] flex-shrink-0">
          <Database class="w-4 h-4" />
        </div>
        <div>
          <div class="text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">Cơ sở dữ liệu</div>
          <div class="text-sm font-bold text-[#F1F5F9] flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
            <span>SQLite WAL</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Folder Tabs Bar -->
    <div class="flex items-center space-x-2 overflow-x-auto pb-0.5 scrollbar-thin flex-shrink-0">
      <!-- All Tab -->
      <button
        class="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
        :class="targetsStore.selectedFolderId === null
          ? 'bg-[#10B981] text-white shadow-sm shadow-[#10B981]/20'
          : 'bg-[#131B26] text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] border border-[#1E293B]'"
        @click="targetsStore.selectedFolderId = null"
      >
        <span>Tất cả</span>
        <span
          class="px-1.5 py-0.2 rounded-full text-[10px]"
          :class="targetsStore.selectedFolderId === null ? 'bg-white/20 text-white' : 'bg-[#1E293B] text-[#94A3B8]'"
        >
          {{ targetsStore.totalTargetsCount }}
        </span>
      </button>

      <!-- Unassigned Tab -->
      <button
        class="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
        :class="targetsStore.selectedFolderId === 'unassigned'
          ? 'bg-[#10B981] text-white shadow-sm shadow-[#10B981]/20'
          : 'bg-[#131B26] text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] border border-[#1E293B]'"
        @click="targetsStore.selectedFolderId = 'unassigned'"
      >
        <span>Chưa phân loại</span>
        <span
          class="px-1.5 py-0.2 rounded-full text-[10px]"
          :class="targetsStore.selectedFolderId === 'unassigned' ? 'bg-white/20 text-white' : 'bg-[#1E293B] text-[#94A3B8]'"
        >
          {{ targetsStore.unassignedCount }}
        </span>
      </button>

      <!-- Custom Folder Tabs -->
      <div
        v-for="folder in targetsStore.folders"
        :key="folder.id"
        class="group flex items-center rounded-lg border transition-all whitespace-nowrap"
        :class="targetsStore.selectedFolderId === folder.id
          ? 'bg-[#10B981] text-white border-[#10B981] shadow-sm shadow-[#10B981]/20'
          : 'bg-[#131B26] text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] border-[#1E293B]'"
      >
        <button
          class="flex items-center space-x-1.5 px-3 py-1 text-xs font-medium"
          @click="targetsStore.selectedFolderId = folder.id"
        >
          <span>{{ folder.name }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px]"
            :class="targetsStore.selectedFolderId === folder.id ? 'bg-white/20 text-white' : 'bg-[#1E293B] text-[#94A3B8]'"
          >
            {{ targetsStore.folderCounts[folder.id] || 0 }}
          </span>
        </button>

        <!-- Folder Actions (Edit / Delete) -->
        <div class="pr-1.5 flex items-center space-x-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            class="p-0.5 hover:bg-black/20 rounded transition-colors cursor-pointer"
            title="Đổi tên thư mục"
            @click.stop="openEditFolderModal(folder)"
          >
            <Pencil class="w-3 h-3" />
          </button>
          <button
            class="p-0.5 hover:bg-black/20 rounded transition-colors text-red-400 hover:text-red-300 cursor-pointer"
            title="Xóa thư mục"
            @click.stop="openDeleteFolderModal(folder)"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="flex items-center space-x-2.5 flex-shrink-0">
      <!-- Search input -->
      <div class="relative flex-1">
        <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
        <input
          ref="searchInputRef"
          v-model="targetsStore.searchQuery"
          type="text"
          placeholder="Tìm theo tên nhóm hoặc ID... (⌘F hoặc /)"
          class="w-full pl-9 pr-8 py-1.5 rounded-lg bg-[#131B26] border border-[#1E293B] text-xs text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#10B981] transition-colors"
        />
        <button
          v-if="targetsStore.searchQuery"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8] cursor-pointer"
          title="Xóa tìm kiếm"
          @click="targetsStore.searchQuery = ''"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Button "Chọn tất cả trong thư mục" -->
      <button
        id="btn-select-all-folder"
        :disabled="targetsStore.currentFolderGroups.length === 0"
        class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-[#334155] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-[#F1F5F9] border border-[#334155] transition-all whitespace-nowrap cursor-pointer"
        :class="{ 'border-[#10B981]/50 text-[#10B981]': isAllInFolderSelected }"
        @click="toggleSelectAllInFolder"
      >
        <CheckSquare class="w-3.5 h-3.5 text-[#10B981]" />
        <span>{{ isAllInFolderSelected ? 'Bỏ chọn toàn bộ' : 'Chọn tất cả trong thư mục' }}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded bg-[#0E1520] text-[#94A3B8]">
          {{ targetsStore.currentFolderGroups.length }}
        </span>
      </button>

      <div class="text-[11px] text-[#94A3B8] whitespace-nowrap">
        Hiển thị: <strong class="text-[#F1F5F9]">{{ targetsStore.filteredTargets.length }}</strong> đích
      </div>
    </div>

    <!-- Bulk Action Bar (Prominent when targets selected) -->
    <div
      v-if="selectedTargetIds.length > 0"
      class="bg-[#162130] border border-[#3B82F6]/40 rounded-lg p-2 px-3.5 flex items-center justify-between shadow-lg shadow-[#0B111A]/50 transition-all duration-200 flex-shrink-0"
    >
      <div class="flex items-center space-x-2.5">
        <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#3B82F6] text-white text-[11px] font-bold">
          {{ selectedTargetIds.length }}
        </span>
        <span class="text-xs font-medium text-[#F1F5F9]">
          Đã chọn {{ selectedTargetIds.length }} nhóm mục tiêu
        </span>
      </div>

      <div class="flex items-center space-x-2.5">
        <div class="flex items-center space-x-2">
          <label class="text-[11px] text-[#94A3B8]">Gán vào:</label>
          <select
            v-model="bulkFolderTargetId"
            class="bg-[#0E1520] border border-[#1E293B] rounded-md px-2.5 py-1 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#10B981]"
          >
            <option value="">-- Chọn thư mục --</option>
            <option value="__unassign__">Gỡ khỏi thư mục (Chưa phân loại)</option>
            <option
              v-for="folder in targetsStore.folders"
              :key="folder.id"
              :value="folder.id"
            >
              {{ folder.name }}
            </option>
          </select>
          <button
            :disabled="!bulkFolderTargetId"
            class="px-2.5 py-1 rounded-md bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
            @click="handleBulkAssign"
          >
            Áp dụng
          </button>
        </div>

        <div class="h-3.5 w-[1px] bg-[#1E293B]"></div>

        <button
          class="text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
          @click="selectedTargetIds = []"
        >
          Bỏ chọn
        </button>
      </div>
    </div>

    <!-- Compact Targets Table Container (Scrollable internally) -->
    <div class="bg-[#131B26] border border-[#1E293B] rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
      <!-- Loading State -->
      <div v-if="targetsStore.isLoading && targetsStore.targets.length === 0" class="p-8 text-center text-xs text-[#94A3B8] my-auto">
        <RefreshCw class="animate-spin h-6 w-6 text-[#10B981] mx-auto mb-2" />
        Đang tải danh sách đích đăng...
      </div>

      <!-- Empty State -->
      <div
        v-else-if="targetsStore.targets.length === 0"
        class="p-10 text-center space-y-2.5 my-auto"
      >
        <div class="w-10 h-10 rounded-full bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto">
          <Users class="w-5 h-5 text-[#94A3B8]" />
        </div>
        <h3 class="text-xs font-semibold text-[#F1F5F9]">Chưa có dữ liệu nhóm</h3>
        <p class="text-[11px] text-[#94A3B8] max-w-sm mx-auto">
          Nhấn nút "Làm mới danh sách nhóm" ở góc trên để tự động trích xuất các nhóm Facebook bạn đã tham gia vào hệ thống.
        </p>
      </div>

      <!-- No Search Results -->
      <div
        v-else-if="targetsStore.filteredTargets.length === 0"
        class="p-8 text-center text-xs text-[#94A3B8] my-auto space-y-1.5"
      >
        <p>Không tìm thấy nhóm nào khớp với từ khóa "{{ targetsStore.searchQuery }}".</p>
        <button
          class="text-[#10B981] hover:underline text-[11px]"
          @click="targetsStore.searchQuery = ''"
        >
          Xóa bộ lọc tìm kiếm
        </button>
      </div>

      <!-- Compact Target Table -->
      <div v-else class="flex-1 overflow-y-auto scrollbar-thin">
        <table class="w-full text-left border-collapse">
          <thead class="sticky top-0 z-10 bg-[#0E1520] border-b border-[#1E293B] shadow-sm">
            <tr class="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
              <th class="py-2 px-3.5 w-10">
                <input
                  type="checkbox"
                  class="rounded bg-[#1E293B] border-[#334155] text-[#10B981] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  :checked="isAllSelected"
                  title="Chọn tất cả nhóm hiển thị"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="py-2 px-3">Đích đăng</th>
              <th class="py-2 px-3">Thư mục</th>
              <th class="py-2 px-3">Loại hình</th>
              <th class="py-2 px-3">Quyền riêng tư</th>
              <th class="py-2 px-3">Facebook ID</th>
              <th class="py-2 px-3.5 text-right">Lần đồng bộ cuối</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#1E293B]/60 text-xs">
            <tr
              v-for="target in targetsStore.filteredTargets"
              :key="target.id"
              class="hover:bg-[#162130] transition-colors"
              :class="{
                'bg-[#10B981]/5': target.type === 'profile',
                'bg-[#3B82F6]/5': selectedTargetIds.includes(target.id)
              }"
            >
              <!-- Checkbox -->
              <td class="py-2 px-3.5">
                <input
                  v-if="target.type === 'group'"
                  type="checkbox"
                  class="rounded bg-[#1E293B] border-[#334155] text-[#10B981] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  :checked="selectedTargetIds.includes(target.id)"
                  @change="toggleSelectTarget(target.id)"
                />
              </td>

              <!-- Name & Avatar -->
              <td class="py-2 px-3">
                <div class="flex items-center space-x-2.5">
                  <img
                    v-if="target.avatar_url"
                    :src="target.avatar_url"
                    alt=""
                    class="w-6.5 h-6.5 rounded-md object-cover bg-[#1E293B] flex-shrink-0"
                    @error="target.avatar_url = null"
                  />
                  <div
                    v-else
                    class="w-6.5 h-6.5 rounded-md bg-[#1E293B] flex items-center justify-center text-[#94A3B8] flex-shrink-0 text-[11px] font-bold"
                  >
                    {{ target.name ? target.name.charAt(0).toUpperCase() : '?' }}
                  </div>
                  <div class="min-w-0">
                    <div class="font-medium text-[#F1F5F9] truncate max-w-xs md:max-w-md" :title="target.name">
                      {{ target.name }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Folder Badge -->
              <td class="py-2 px-3 whitespace-nowrap">
                <span
                  v-if="getFolderName(target.folder_id)"
                  class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30"
                >
                  <Folder class="w-3 h-3 text-[#A78BFA]" />
                  <span>{{ getFolderName(target.folder_id) }}</span>
                </span>
                <span v-else-if="target.type === 'group'" class="text-[11px] text-[#64748B]">
                  Chưa phân loại
                </span>
                <span v-else class="text-[11px] text-[#64748B]">-</span>
              </td>

              <!-- Type Badge -->
              <td class="py-2 px-3 whitespace-nowrap">
                <span
                  v-if="target.type === 'profile'"
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30"
                >
                  Trang cá nhân
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/30"
                >
                  Nhóm
                </span>
              </td>

              <!-- Privacy Badge -->
              <td class="py-2 px-3 whitespace-nowrap">
                <span
                  v-if="target.privacy === 'public'"
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#1E293B] text-[#94A3B8]"
                >
                  Công khai
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#78350F]/30 text-[#FBBF24] border border-[#F59E0B]/30"
                >
                  Riêng tư
                </span>
              </td>

              <!-- FB ID -->
              <td class="py-2 px-3 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                {{ target.fb_id }}
              </td>

              <!-- Last Synced At -->
              <td class="py-2 px-3.5 text-right text-[11px] text-[#64748B] whitespace-nowrap">
                {{ formatDate(target.last_synced_at) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Tạo Thư Mục Mới -->
    <div
      v-if="showCreateFolderModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showCreateFolderModal = false"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-[#F1F5F9]">Tạo Thư Mục Đích Mới</h3>
        <div>
          <label class="block text-xs text-[#94A3B8] mb-1.5">Tên thư mục</label>
          <input
            v-model="newFolderName"
            type="text"
            placeholder="Ví dụ: Nhóm Rao Vặt Hà Nội"
            class="w-full px-3 py-2 rounded-lg bg-[#0E1520] border border-[#1E293B] text-xs text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#10B981]"
            @keyup.enter="handleCreateFolder"
          />
          <p v-if="folderError" class="text-[11px] text-red-400 mt-1">{{ folderError }}</p>
        </div>

        <div class="flex items-center justify-end space-x-2 pt-1">
          <button
            class="px-3 py-1.5 rounded-lg text-xs text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] transition-colors"
            @click="showCreateFolderModal = false"
          >
            Hủy
          </button>
          <button
            class="px-4 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold transition-colors shadow-sm shadow-[#10B981]/20"
            @click="handleCreateFolder"
          >
            Tạo Thư Mục
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Đổi Tên Thư Mục -->
    <div
      v-if="showEditFolderModal && editingFolder"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showEditFolderModal = false"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-[#F1F5F9]">Đổi Tên Thư Mục</h3>
        <div>
          <label class="block text-xs text-[#94A3B8] mb-1.5">Tên mới</label>
          <input
            v-model="editFolderName"
            type="text"
            class="w-full px-3 py-2 rounded-lg bg-[#0E1520] border border-[#1E293B] text-xs text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#10B981]"
            @keyup.enter="handleUpdateFolder"
          />
          <p v-if="folderError" class="text-[11px] text-red-400 mt-1">{{ folderError }}</p>
        </div>

        <div class="flex items-center justify-end space-x-2 pt-1">
          <button
            class="px-3 py-1.5 rounded-lg text-xs text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] transition-colors"
            @click="showEditFolderModal = false"
          >
            Hủy
          </button>
          <button
            class="px-4 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold transition-colors shadow-sm shadow-[#10B981]/20"
            @click="handleUpdateFolder"
          >
            Lưu Thay Đổi
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Xác Nhận Xóa Thư Mục -->
    <div
      v-if="showDeleteFolderModal && deletingFolder"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showDeleteFolderModal = false"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
        <div class="flex items-center space-x-3 text-red-400">
          <AlertTriangle class="w-5 h-5 flex-shrink-0" />
          <h3 class="text-sm font-bold text-[#F1F5F9]">Xác Nhận Xóa Thư Mục</h3>
        </div>

        <p class="text-xs text-[#94A3B8]">
          Bạn có chắc chắn muốn xóa thư mục <strong class="text-[#F1F5F9]">"{{ deletingFolder.name }}"</strong>?
        </p>
        <p class="text-[11px] text-[#64748B]">
          * Lưu ý: Các nhóm thuộc thư mục này sẽ không bị xóa mà sẽ chuyển về trạng thái <em>Chưa phân loại</em>.
        </p>

        <div class="flex items-center justify-end space-x-2 pt-1">
          <button
            class="px-3 py-1.5 rounded-lg text-xs text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] transition-colors"
            @click="showDeleteFolderModal = false"
          >
            Hủy
          </button>
          <button
            class="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
            @click="handleDeleteFolder"
          >
            Xóa Thư Mục
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  FolderPlus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  User,
  Users,
  Folder,
  Database,
  Pencil,
  Trash2,
  Search,
  CheckSquare
} from 'lucide-vue-next'
import { useTargetsStore } from '../stores/targets'
import { useAccountStore } from '../stores/account'
import type { FolderDTO } from '../../../preload/types'

const targetsStore = useTargetsStore()
const accountStore = useAccountStore()

const isConnected = computed(() => accountStore.account?.status === 'connected')
const searchInputRef = ref<HTMLInputElement | null>(null)

// Checkbox selection state
const selectedTargetIds = ref<string[]>([])
const bulkFolderTargetId = ref<string>('')

// Modal states
const showCreateFolderModal = ref<boolean>(false)
const newFolderName = ref<string>('')
const folderError = ref<string | null>(null)

const showEditFolderModal = ref<boolean>(false)
const editingFolder = ref<FolderDTO | null>(null)
const editFolderName = ref<string>('')

const showDeleteFolderModal = ref<boolean>(false)
const deletingFolder = ref<FolderDTO | null>(null)

// Check if all group targets in filtered view are selected
const isAllSelected = computed(() => {
  const groupIds = targetsStore.filteredTargets
    .filter((t) => t.type === 'group')
    .map((t) => t.id)
  return groupIds.length > 0 && groupIds.every((id) => selectedTargetIds.value.includes(id))
})

// Check if all group targets in current folder view are selected
const isAllInFolderSelected = computed(() => {
  const groupIds = targetsStore.currentFolderGroups.map((t) => t.id)
  return groupIds.length > 0 && groupIds.every((id) => selectedTargetIds.value.includes(id))
})

onMounted(async () => {
  await targetsStore.fetchTargets()
  await targetsStore.fetchFolders()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

function handleGlobalKeydown(e: KeyboardEvent): void {
  // Focus search input on ⌘F / Ctrl+F or '/'
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

async function handleSync(): Promise<void> {
  await targetsStore.syncTargets()
}

function getFolderName(folderId: string | null): string | null {
  if (!folderId) return null
  const folder = targetsStore.folders.find((f) => f.id === folderId)
  return folder ? folder.name : null
}

function toggleSelectTarget(id: string): void {
  const index = selectedTargetIds.value.indexOf(id)
  if (index > -1) {
    selectedTargetIds.value.splice(index, 1)
  } else {
    selectedTargetIds.value.push(id)
  }
}

function toggleSelectAll(): void {
  const groupIds = targetsStore.filteredTargets
    .filter((t) => t.type === 'group')
    .map((t) => t.id)

  if (isAllSelected.value) {
    selectedTargetIds.value = selectedTargetIds.value.filter((id) => !groupIds.includes(id))
  } else {
    const newSelected = new Set([...selectedTargetIds.value, ...groupIds])
    selectedTargetIds.value = Array.from(newSelected)
  }
}

function toggleSelectAllInFolder(): void {
  const groupIds = targetsStore.currentFolderGroups.map((t) => t.id)
  if (groupIds.length === 0) return

  if (isAllInFolderSelected.value) {
    selectedTargetIds.value = selectedTargetIds.value.filter((id) => !groupIds.includes(id))
  } else {
    const newSelected = new Set([...selectedTargetIds.value, ...groupIds])
    selectedTargetIds.value = Array.from(newSelected)
  }
}

async function handleBulkAssign(): Promise<void> {
  if (!bulkFolderTargetId.value || selectedTargetIds.value.length === 0) return

  const targetFolderId = bulkFolderTargetId.value === '__unassign__' ? null : bulkFolderTargetId.value
  await targetsStore.batchAssignToFolder(selectedTargetIds.value, targetFolderId)
  selectedTargetIds.value = []
  bulkFolderTargetId.value = ''
}

function openCreateFolderModal(): void {
  newFolderName.value = ''
  folderError.value = null
  showCreateFolderModal.value = true
}

async function handleCreateFolder(): Promise<void> {
  const trimmed = newFolderName.value.trim()
  if (!trimmed) {
    folderError.value = 'Tên thư mục không được để trống'
    return
  }

  const created = await targetsStore.createFolder(trimmed)
  if (created) {
    showCreateFolderModal.value = false
    newFolderName.value = ''
    folderError.value = null
  } else {
    folderError.value = 'Không thể tạo thư mục, vui lòng thử lại'
  }
}

function openEditFolderModal(folder: FolderDTO): void {
  editingFolder.value = folder
  editFolderName.value = folder.name
  folderError.value = null
  showEditFolderModal.value = true
}

async function handleUpdateFolder(): Promise<void> {
  if (!editingFolder.value) return
  const trimmed = editFolderName.value.trim()
  if (!trimmed) {
    folderError.value = 'Tên thư mục không được để trống'
    return
  }

  const updated = await targetsStore.updateFolder(editingFolder.value.id, trimmed)
  if (updated) {
    showEditFolderModal.value = false
    editingFolder.value = null
    editFolderName.value = ''
    folderError.value = null
  } else {
    folderError.value = 'Không thể đổi tên thư mục, vui lòng thử lại'
  }
}

function openDeleteFolderModal(folder: FolderDTO): void {
  deletingFolder.value = folder
  showDeleteFolderModal.value = true
}

async function handleDeleteFolder(): Promise<void> {
  if (!deletingFolder.value) return
  await targetsStore.deleteFolder(deletingFolder.value.id)
  showDeleteFolderModal.value = false
  deletingFolder.value = null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN')
  } catch {
    return dateStr
  }
}
</script>
