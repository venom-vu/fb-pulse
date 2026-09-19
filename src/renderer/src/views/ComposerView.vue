<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Soạn Thảo Chiến Dịch</h1>
        <p class="text-xs text-[#94A3B8] mt-1">Tạo bài viết với Spintax đa cấp, đính kèm media và lập lịch đăng tự động.</p>
      </div>
      <div class="flex items-center space-x-2">
        <button
          class="px-3 py-2 rounded-md bg-[#131B26] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] font-medium text-xs border border-[#1E293B] transition-all flex items-center space-x-1.5 cursor-pointer"
          @click="showImportModal = true"
        >
          <span>📥 Import Cookie JSON</span>
        </button>
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
    </div>

    <!-- Modal Import Cookie JSON -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-[#1E293B] pb-3">
          <h3 class="text-sm font-bold text-[#F1F5F9]">Nhập Cookie / Session JSON Facebook</h3>
          <button
            class="text-[#64748B] hover:text-[#F1F5F9] text-sm cursor-pointer"
            @click="closeModal"
          >
            ✕
          </button>
        </div>
        <p class="text-xs text-[#94A3B8]">
          Dán mảng Cookie JSON hoặc đối tượng storageState. Yêu cầu chứa cookie xác thực
          <code class="text-[#10B981]">c_user</code> và <code class="text-[#10B981]">xs</code>.
        </p>
        <textarea
          v-model="modalJsonInput"
          rows="5"
          class="w-full rounded-lg bg-[#0B111A] border border-[#1E293B] focus:border-[#10B981] p-3 text-xs font-mono text-[#F1F5F9] placeholder-[#64748B] outline-none"
          placeholder='[{"name":"c_user","value":"..."},{"name":"xs","value":"..."}]'
        ></textarea>
        <div
          v-if="modalError"
          class="text-xs p-2.5 rounded bg-[#EF4444]/15 border border-[#EF4444]/30 text-[#EF4444]"
        >
          {{ modalError }}
        </div>
        <div class="flex items-center justify-end space-x-2 pt-2">
          <button
            class="px-3 py-1.5 rounded bg-[#0B111A] hover:bg-[#1E293B] text-[#94A3B8] text-xs font-medium border border-[#1E293B] cursor-pointer"
            @click="closeModal"
          >
            Hủy bỏ
          </button>
          <button
            class="px-4 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-[#042419] text-xs font-bold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] disabled:opacity-50 cursor-pointer"
            :disabled="!modalJsonInput.trim() || isImporting"
            @click="submitModalImport"
          >
            <span v-if="isImporting">Đang xử lý...</span>
            <span v-else>Xác nhận Import</span>
          </button>
        </div>
      </div>
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
import { ref } from 'vue'
import { useAccountStore } from '../stores/account'

const accountStore = useAccountStore()
const showImportModal = ref(false)
const modalJsonInput = ref('')
const isImporting = ref(false)
const modalError = ref('')

function closeModal(): void {
  showImportModal.value = false
  modalJsonInput.value = ''
  modalError.value = ''
}

async function submitModalImport(): Promise<void> {
  if (!modalJsonInput.value.trim()) return
  isImporting.value = true
  modalError.value = ''

  try {
    const res = await accountStore.importSessionJson(modalJsonInput.value)
    if (res.success) {
      closeModal()
    } else {
      modalError.value = res.error || 'Lỗi khi nhập Cookie JSON'
    }
  } catch (err: any) {
    modalError.value = err?.message || 'Có lỗi xảy ra'
  } finally {
    isImporting.value = false
  }
}

async function connectFacebook(): Promise<void> {
  await accountStore.loginFacebook()
}
</script>
