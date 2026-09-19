<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <div class="border-b border-[#1E293B] pb-4">
      <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Cài Đặt Hệ Thống</h1>
      <p class="text-xs text-[#94A3B8] mt-1">Cấu hình an toàn, giới hạn tài nguyên và bảo vệ chống checkpoint.</p>
    </div>

    <div class="max-w-2xl space-y-4">
      <!-- Setting Group 0: Account Management -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Tài Khoản Facebook</h3>
        <div v-if="accountStore.account" class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div class="flex items-center space-x-3">
            <img
              v-if="accountStore.account.avatar_url"
              :src="accountStore.account.avatar_url"
              alt="Avatar"
              class="w-9 h-9 rounded-full object-cover border border-[#10B981]"
            />
            <div
              v-else
              class="w-9 h-9 rounded-full bg-[#10B981] text-[#042419] font-bold text-sm flex items-center justify-center"
            >
              {{ accountStore.account.name?.charAt(0).toUpperCase() || 'F' }}
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-xs font-semibold text-[#F1F5F9]">{{ accountStore.account.name }}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981] font-bold uppercase">Connected</span>
              </div>
              <p class="text-[11px] text-[#64748B] font-mono mt-0.5">UID: {{ accountStore.account.fb_user_id || 'N/A' }}</p>
            </div>
          </div>
          <button
            class="px-3 py-1.5 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 text-xs font-medium transition-colors cursor-pointer"
            @click="handleLogout"
          >
            Đăng xuất
          </button>
        </div>
        <div v-else class="py-2 border-t border-[#1E293B]/60 flex items-center justify-between">
          <div>
            <span class="text-xs font-medium text-[#94A3B8]">Chưa có tài khoản nào được kết nối</span>
            <p class="text-[11px] text-[#64748B]">Đăng nhập bằng In-App Browser hoặc dán Cookie JSON bên dưới.</p>
          </div>
          <button
            class="px-3 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-[0_2px_8px_rgba(16,185,129,0.25)] transition-colors cursor-pointer"
            @click="accountStore.loginFacebook"
          >
            ⚡ Kết nối Facebook
          </button>
        </div>
      </div>

      <!-- Setting Group 1: Import Cookie / Session JSON -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Import Cookie / Session JSON</h3>
          <span class="text-[10px] text-[#64748B]">Hỗ trợ mảng cookie hoặc storageState</span>
        </div>
        <div class="pt-1">
          <textarea
            v-model="sessionJsonInput"
            rows="4"
            class="w-full rounded-lg bg-[#0B111A] border border-[#1E293B] focus:border-[#10B981] p-3 text-xs font-mono text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors"
            placeholder='Dán chuỗi JSON cookie tại đây (yêu cầu chứa "c_user" và "xs")... Ví dụ: [{"name":"c_user","value":"1000..."},{"name":"xs","value":"..."}]'
          ></textarea>
        </div>
        <div v-if="importMessage" :class="['text-xs p-2.5 rounded-lg border flex items-center space-x-2', importSuccess ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]' : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]']">
          <span>{{ importMessage }}</span>
        </div>
        <div class="flex items-center justify-end space-x-2 pt-1">
          <button
            class="px-3 py-1.5 rounded bg-[#0B111A] hover:bg-[#1E293B] text-[#94A3B8] text-xs font-medium border border-[#1E293B] transition-colors cursor-pointer"
            :disabled="!sessionJsonInput.trim() || isSubmitting"
            @click="sessionJsonInput = ''; importMessage = ''"
          >
            Xóa nội dung
          </button>
          <button
            class="px-4 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-[#042419] text-xs font-bold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] cursor-pointer flex items-center space-x-1.5"
            :disabled="!sessionJsonInput.trim() || isSubmitting"
            @click="handleImportSession"
          >
            <span v-if="isSubmitting">Đang mã hóa & lưu...</span>
            <span v-else>Xác nhận Nhập Session</span>
          </button>
        </div>
      </div>

      <!-- Setting Group 2: Security & Storage -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Lưu Trữ & Bảo Mật</h3>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Mã hóa phần cứng safeStorage</span>
            <p class="text-[11px] text-[#64748B]">Bảo vệ Cookies & LocalStorage bằng DPAPI/Keychain.</p>
          </div>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/20 text-[#10B981]">
            Đã bật (AES Hardware)
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Cơ sở dữ liệu SQLite cục bộ</span>
            <p class="text-[11px] text-[#64748B]">Chế độ Write-Ahead Logging (WAL) đảm bảo toàn vẹn dữ liệu.</p>
          </div>
          <span class="text-[11px] font-mono text-[#94A3B8]">fb_pulse.db</span>
        </div>
      </div>

      <!-- Setting Group 3: Anti-ban -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Cấu Hình An Toàn Anti-ban</h3>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Khoảng trễ Jitter ngẫu nhiên</span>
            <p class="text-[11px] text-[#64748B]">Mặc định 180s - 300s giữa các bài đăng liên tiếp.</p>
          </div>
          <span class="text-xs font-mono font-medium text-[#10B981] px-2 py-1 rounded bg-[#10B981]/15">180s - 300s</span>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Giới hạn tối đa bài đăng/ngày</span>
            <p class="text-[11px] text-[#64748B]">Cảnh báo an toàn khi vượt ngưỡng 30 bài/ngày.</p>
          </div>
          <span class="text-xs font-mono font-medium text-[#F1F5F9] px-2 py-1 rounded bg-[#0B111A] border border-[#1E293B]">30 bài</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAccountStore } from '../stores/account'

const accountStore = useAccountStore()
const sessionJsonInput = ref('')
const isSubmitting = ref(false)
const importMessage = ref('')
const importSuccess = ref(false)

async function handleImportSession(): Promise<void> {
  if (!sessionJsonInput.value.trim()) return
  isSubmitting.value = true
  importMessage.value = ''

  try {
    const res = await accountStore.importSessionJson(sessionJsonInput.value)
    if (res.success) {
      importSuccess.value = true
      importMessage.value = 'Nhập và mã hóa phiên đăng nhập thành công! Tài khoản đã được kích hoạt an toàn.'
      sessionJsonInput.value = ''
    } else {
      importSuccess.value = false
      importMessage.value = res.error || 'Nhập Cookie JSON thất bại. Vui lòng kiểm tra định dạng.'
    }
  } catch (err: any) {
    importSuccess.value = false
    importMessage.value = err?.message || 'Có lỗi xảy ra khi nhập phiên.'
  } finally {
    isSubmitting.value = false
  }
}

async function handleLogout(): Promise<void> {
  if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản này không?')) {
    await accountStore.logout()
  }
}
</script>
