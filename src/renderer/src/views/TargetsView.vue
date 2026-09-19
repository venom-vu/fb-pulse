<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6 bg-[#0B111A]">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Quản Lý Đích Đăng</h1>
        <p class="text-xs text-[#94A3B8] mt-1">
          Danh sách Trang cá nhân và toàn bộ Nhóm Facebook đã tham gia để phân phối bài viết.
        </p>
      </div>

      <div class="flex items-center space-x-3">
        <button
          id="btn-create-folder"
          class="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#F1F5F9] text-xs font-semibold border border-[#334155] transition-all duration-150"
          @click="openCreateFolderModal"
        >
          <svg class="w-3.5 h-3.5 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Tạo Thư Mục</span>
        </button>

        <button
          id="btn-sync-targets"
          :disabled="targetsStore.isSyncing || !isConnected"
          class="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-[#10B981]/20 transition-all duration-150"
          @click="handleSync"
        >
          <svg
            v-if="targetsStore.isSyncing"
            class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg
            v-else
            class="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{{ targetsStore.isSyncing ? 'Đang đồng bộ...' : 'Làm mới danh sách nhóm' }}</span>
        </button>
      </div>
    </div>

    <!-- Alert Banners -->
    <!-- Not connected warning -->
    <div
      v-if="!isConnected"
      class="bg-[#1E1B18] border border-[#F59E0B]/30 rounded-xl p-4 flex items-center justify-between text-xs text-[#FDE68A]"
    >
      <div class="flex items-center space-x-3">
        <svg class="w-5 h-5 text-[#F59E0B] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Tài khoản Facebook chưa được kết nối. Vui lòng kết nối tài khoản để đồng bộ danh sách nhóm.</span>
      </div>
      <button
        class="px-3 py-1 bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] font-medium rounded-md transition-colors"
        @click="accountStore.loginFacebook"
      >
        Kết nối ngay
      </button>
    </div>

    <!-- Sync Success Banner -->
    <div
      v-if="targetsStore.syncSuccessMessage"
      class="bg-[#0D2818] border border-[#10B981]/40 rounded-xl p-3.5 flex items-center justify-between text-xs text-[#A7F3D0] transition-all"
    >
      <div class="flex items-center space-x-2.5">
        <svg class="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>{{ targetsStore.syncSuccessMessage }}</span>
      </div>
      <button
        class="text-[#6EE7B7] hover:text-white transition-colors"
        @click="targetsStore.syncSuccessMessage = null"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Sync Error Banner -->
    <div
      v-if="targetsStore.syncError"
      class="bg-[#2D1515] border border-[#EF4444]/40 rounded-xl p-3.5 flex items-center justify-between text-xs text-[#FECACA] transition-all"
    >
      <div class="flex items-center space-x-2.5">
        <svg class="w-4 h-4 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{{ targetsStore.syncError }}</span>
      </div>
      <button
        class="text-[#FCA5A5] hover:text-white transition-colors"
        @click="targetsStore.syncError = null"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Stats & Quick Overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <div class="text-[11px] font-medium text-[#94A3B8]">Trang cá nhân</div>
          <div class="text-base font-bold text-[#F1F5F9]">
            {{ targetsStore.profileTarget ? targetsStore.profileTarget.name : 'Chưa đồng bộ' }}
          </div>
        </div>
      </div>

      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#3B82F6]">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <div class="text-[11px] font-medium text-[#94A3B8]">Tổng số nhóm</div>
          <div class="text-base font-bold text-[#F1F5F9]">
            {{ targetsStore.totalGroupsCount }} <span class="text-xs font-normal text-[#94A3B8]">nhóm</span>
          </div>
        </div>
      </div>

      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B]">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <div>
          <div class="text-[11px] font-medium text-[#94A3B8]">Thư mục phân loại</div>
          <div class="text-base font-bold text-[#F1F5F9]">
            {{ targetsStore.folders.length }} <span class="text-xs font-normal text-[#94A3B8]">thư mục</span>
          </div>
        </div>
      </div>

      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-lg bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6]">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <div class="text-[11px] font-medium text-[#94A3B8]">Cơ sở dữ liệu cục bộ</div>
          <div class="text-base font-bold text-[#F1F5F9] flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-[#10B981]"></span>
            <span>SQLite WAL</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Folder Tabs Bar -->
    <div class="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
      <!-- All Tab -->
      <button
        class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
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
        class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
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
          class="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium"
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
            class="p-1 hover:bg-black/20 rounded transition-colors"
            title="Đổi tên thư mục"
            @click.stop="openEditFolderModal(folder)"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            class="p-1 hover:bg-black/20 rounded transition-colors text-red-400 hover:text-red-300"
            title="Xóa thư mục"
            @click.stop="openDeleteFolderModal(folder)"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="flex items-center space-x-3">
      <div class="relative flex-1">
        <svg
          class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="targetsStore.searchQuery"
          type="text"
          placeholder="Tìm kiếm theo tên nhóm hoặc ID..."
          class="w-full pl-9 pr-8 py-2 rounded-lg bg-[#131B26] border border-[#1E293B] text-xs text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#10B981] transition-colors"
        />
        <button
          v-if="targetsStore.searchQuery"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8]"
          @click="targetsStore.searchQuery = ''"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="text-xs text-[#94A3B8] whitespace-nowrap">
        Hiển thị: <strong class="text-[#F1F5F9]">{{ targetsStore.filteredTargets.length }}</strong> đích
      </div>
    </div>

    <!-- Bulk Action Bar (Floating / Prominent when targets selected) -->
    <div
      v-if="selectedTargetIds.length > 0"
      class="bg-[#162130] border border-[#3B82F6]/40 rounded-xl p-3 px-4 flex items-center justify-between shadow-lg shadow-[#0B111A]/50 transition-all duration-200"
    >
      <div class="flex items-center space-x-3">
        <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#3B82F6] text-white text-xs font-bold">
          {{ selectedTargetIds.length }}
        </span>
        <span class="text-xs font-medium text-[#F1F5F9]">
          Đã chọn {{ selectedTargetIds.length }} nhóm mục tiêu
        </span>
      </div>

      <div class="flex items-center space-x-3">
        <div class="flex items-center space-x-2">
          <label class="text-xs text-[#94A3B8]">Gán vào:</label>
          <select
            v-model="bulkFolderTargetId"
            class="bg-[#0E1520] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#10B981]"
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
            class="px-3 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
            @click="handleBulkAssign"
          >
            Áp dụng
          </button>
        </div>

        <div class="h-4 w-[1px] bg-[#1E293B]"></div>

        <button
          class="text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
          @click="selectedTargetIds = []"
        >
          Bỏ chọn
        </button>
      </div>
    </div>

    <!-- Targets List / Table -->
    <div class="bg-[#131B26] border border-[#1E293B] rounded-xl overflow-hidden flex-1">
      <!-- Loading State -->
      <div v-if="targetsStore.isLoading && targetsStore.targets.length === 0" class="p-8 text-center text-xs text-[#94A3B8]">
        <svg class="animate-spin h-6 w-6 text-[#10B981] mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Đang tải danh sách đích đăng...
      </div>

      <!-- Empty State -->
      <div
        v-else-if="targetsStore.targets.length === 0"
        class="p-12 text-center space-y-3"
      >
        <div class="w-12 h-12 rounded-full bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 class="text-sm font-semibold text-[#F1F5F9]">Chưa có dữ liệu nhóm</h3>
        <p class="text-xs text-[#94A3B8] max-w-sm mx-auto">
          Nhấn nút "Làm mới danh sách nhóm" ở góc trên để tự động trích xuất các nhóm Facebook bạn đã tham gia vào hệ thống.
        </p>
      </div>

      <!-- No Search Results -->
      <div
        v-else-if="targetsStore.filteredTargets.length === 0"
        class="p-8 text-center text-xs text-[#94A3B8]"
      >
        Không tìm thấy nhóm nào khớp với bộ lọc hiện tại.
      </div>

      <!-- Compact Target Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[#1E293B] bg-[#0E1520]/60 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
              <th class="py-2.5 px-4 w-10">
                <input
                  type="checkbox"
                  class="rounded bg-[#1E293B] border-[#334155] text-[#10B981] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  :checked="isAllSelected"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="py-2.5 px-4">Đích đăng</th>
              <th class="py-2.5 px-4">Thư mục</th>
              <th class="py-2.5 px-4">Loại hình</th>
              <th class="py-2.5 px-4">Quyền riêng tư</th>
              <th class="py-2.5 px-4">Facebook ID</th>
              <th class="py-2.5 px-4 text-right">Lần đồng bộ cuối</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#1E293B]/60 text-xs">
            <tr
              v-for="target in targetsStore.filteredTargets"
              :key="target.id"
              class="hover:bg-[#162130]/60 transition-colors"
              :class="{
                'bg-[#10B981]/5': target.type === 'profile',
                'bg-[#3B82F6]/5': selectedTargetIds.includes(target.id)
              }"
            >
              <!-- Checkbox -->
              <td class="py-2.5 px-4">
                <input
                  v-if="target.type === 'group'"
                  type="checkbox"
                  class="rounded bg-[#1E293B] border-[#334155] text-[#10B981] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  :checked="selectedTargetIds.includes(target.id)"
                  @change="toggleSelectTarget(target.id)"
                />
              </td>

              <!-- Name & Avatar -->
              <td class="py-2.5 px-4">
                <div class="flex items-center space-x-3">
                  <img
                    v-if="target.avatar_url"
                    :src="target.avatar_url"
                    alt=""
                    class="w-7 h-7 rounded-md object-cover bg-[#1E293B] flex-shrink-0"
                    @error="target.avatar_url = null"
                  />
                  <div
                    v-else
                    class="w-7 h-7 rounded-md bg-[#1E293B] flex items-center justify-center text-[#94A3B8] flex-shrink-0 text-xs font-bold"
                  >
                    {{ target.name ? target.name.charAt(0).toUpperCase() : '?' }}
                  </div>
                  <div class="min-w-0">
                    <div class="font-medium text-[#F1F5F9] truncate max-w-xs md:max-w-md">
                      {{ target.name }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Folder Badge -->
              <td class="py-2.5 px-4 whitespace-nowrap">
                <span
                  v-if="getFolderName(target.folder_id)"
                  class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30"
                >
                  <svg class="w-3 h-3 text-[#8B5CF6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span>{{ getFolderName(target.folder_id) }}</span>
                </span>
                <span v-else-if="target.type === 'group'" class="text-[11px] text-[#64748B]">
                  Chưa phân loại
                </span>
                <span v-else class="text-[11px] text-[#64748B]">-</span>
              </td>

              <!-- Type Badge -->
              <td class="py-2.5 px-4 whitespace-nowrap">
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
              <td class="py-2.5 px-4 whitespace-nowrap">
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
              <td class="py-2.5 px-4 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                {{ target.fb_id }}
              </td>

              <!-- Last Synced At -->
              <td class="py-2.5 px-4 text-right text-[11px] text-[#64748B] whitespace-nowrap">
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
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4">
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

        <div class="flex items-center justify-end space-x-2 pt-2">
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
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4">
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

        <div class="flex items-center justify-end space-x-2 pt-2">
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
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4">
        <div class="flex items-center space-x-3 text-red-400">
          <svg class="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 class="text-sm font-bold text-[#F1F5F9]">Xác Nhận Xóa Thư Mục</h3>
        </div>

        <p class="text-xs text-[#94A3B8]">
          Bạn có chắc chắn muốn xóa thư mục <strong class="text-[#F1F5F9]">"{{ deletingFolder.name }}"</strong>?
        </p>
        <p class="text-[11px] text-[#64748B]">
          * Lưu ý: Các nhóm thuộc thư mục này sẽ không bị xóa mà sẽ chuyển về trạng thái <em>Chưa phân loại</em>.
        </p>

        <div class="flex items-center justify-end space-x-2 pt-2">
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
import { ref, onMounted, computed } from 'vue'
import { useTargetsStore } from '../stores/targets'
import { useAccountStore } from '../stores/account'
import type { FolderDTO } from '../../../preload/types'

const targetsStore = useTargetsStore()
const accountStore = useAccountStore()

const isConnected = computed(() => accountStore.account?.status === 'connected')

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

onMounted(async () => {
  await targetsStore.fetchTargets()
  await targetsStore.fetchFolders()
})

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
