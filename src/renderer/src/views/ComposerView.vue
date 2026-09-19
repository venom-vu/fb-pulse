<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Soạn Thảo Chiến Dịch</h1>
        <p class="text-xs text-[#94A3B8] mt-1">Tạo bài viết với Spintax đa cấp, đính kèm media và lập lịch đăng tự động.</p>
      </div>
      <button
        class="px-4 py-2 rounded-md bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 disabled:cursor-not-allowed text-[#042419] font-bold text-xs shadow-[0_4px_14px_rgba(16,185,129,0.35)] transition-all flex items-center space-x-2 cursor-pointer"
        :disabled="accountStore.isLoggingIn"
        @click="connectFacebook"
      >
        <svg
          v-if="accountStore.isLoggingIn"
          class="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-[#042419]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span v-if="accountStore.isLoggingIn">Đang mở trình duyệt...</span>
        <span v-else-if="accountStore.account">⚡ Đổi tài khoản Facebook</span>
        <span v-else>⚡ Kết nối Facebook</span>
      </button>
    </div>

    <!-- 2-Panel Preview Placeholder Card -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Panel Scaffold -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-[#1E293B]/60 pb-3">
          <span class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Khung Soạn Thảo</span>
          <span class="text-[11px] text-[#64748B] font-mono">Spintax Ready</span>
        </div>
        <div class="h-44 rounded-lg bg-[#0B111A] border border-[#1E293B] p-4 text-xs text-[#64748B] flex items-center justify-center text-center">
          <div>
            <p class="font-medium text-[#94A3B8]">Trình soạn thảo Spintax (Epic 3)</p>
            <p class="text-[11px] text-[#64748B] mt-1">Hỗ trợ cú pháp {tùy chọn 1|tùy chọn 2} và đính kèm tối đa 4 ảnh.</p>
          </div>
        </div>
      </div>

      <!-- Right Panel Scaffold -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-[#1E293B]/60 pb-3">
          <span class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Facebook Live Preview</span>
          <span class="text-[11px] text-[#10B981] font-mono font-medium">Interactive Mockup</span>
        </div>
        <div class="h-44 rounded-lg bg-[#0B111A] border border-[#1E293B] p-4 text-xs text-[#64748B] flex items-center justify-center text-center">
          <div>
            <p class="font-medium text-[#94A3B8]">Khung xem trước bài viết trực quan</p>
            <p class="text-[11px] text-[#64748B] mt-1">Mô phỏng chính xác giao diện hiển thị trên Nhóm và Trang cá nhân.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAccountStore } from '../stores/account'

const accountStore = useAccountStore()

async function connectFacebook(): Promise<void> {
  await accountStore.loginFacebook()
}
</script>
