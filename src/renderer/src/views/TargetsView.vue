<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Quản Lý Đích Đăng</h1>
        <p class="text-xs text-[#94A3B8] mt-1">Danh sách Trang cá nhân và toàn bộ Nhóm Facebook đã tham gia.</p>
      </div>
      <button
        class="px-3 py-1.5 rounded-md bg-[#131B26] hover:bg-[#162130] border border-[#1E293B] text-[#F1F5F9] text-xs font-medium transition-colors"
      >
        Làm mới danh sách
      </button>
    </div>

    <!-- Empty State -->
    <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-8 text-center space-y-3">
      <div class="w-12 h-12 rounded-full bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h3 class="text-sm font-semibold text-[#F1F5F9]">Chưa đồng bộ nhóm</h3>
      <p class="text-xs text-[#94A3B8] max-w-sm mx-auto">
        Kết nối tài khoản Facebook để tự động đồng bộ danh sách nhóm đã tham gia vào hệ thống.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
