<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6 bg-[#0B111A]">
    <div class="border-b border-[#1E293B] pb-4">
      <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Cài Đặt Hệ Thống</h1>
      <p class="text-xs text-[#94A3B8] mt-1">Cấu hình an toàn, phiên đăng nhập và chế độ bảo vệ chống checkpoint.</p>
    </div>

    <div class="max-w-2xl space-y-4">
      <!-- Setting Group 0: Account Management -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div class="flex items-center space-x-2">
          <UserCheck class="w-4 h-4 text-[#10B981]" />
          <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Tài Khoản Facebook</h3>
        </div>
        <div v-if="accountStore.account" class="flex items-center justify-between py-2.5 border-t border-[#1E293B]/60">
          <div class="flex items-center space-x-3.5">
            <img
              v-if="accountStore.account.avatar_url"
              :src="accountStore.account.avatar_url"
              alt="Avatar"
              class="w-10 h-10 rounded-full object-cover border border-[#10B981]"
            />
            <div
              v-else
              class="w-10 h-10 rounded-full bg-[#10B981] text-[#042419] font-bold text-sm flex items-center justify-center"
            >
              {{ accountStore.account.name?.charAt(0).toUpperCase() || 'F' }}
            </div>
            <div class="space-y-1">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-bold text-[#F1F5F9]">{{ accountStore.account.name }}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981] font-bold uppercase">Connected</span>
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono">
                <span class="text-[#94A3B8]">
                  <span class="text-[#64748B]">Facebook UID:</span> {{ accountStore.account.fb_user_id || 'N/A' }}
                </span>
                <span class="text-[#334155]">•</span>
                <span class="text-[#94A3B8]">
                  <span class="text-[#64748B]">ID Hệ Thống:</span> {{ accountStore.account.id }}
                </span>
              </div>
            </div>
          </div>
          <button
            id="btn-logout"
            class="px-3.5 py-1.5 rounded-lg bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1.5"
            @click="handleLogout"
          >
            <LogOut class="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
        <div v-else class="py-2 border-t border-[#1E293B]/60 flex items-center justify-between">
          <div>
            <span class="text-xs font-medium text-[#94A3B8]">Chưa có tài khoản nào được kết nối</span>
            <p class="text-[11px] text-[#64748B]">Đăng nhập trực tiếp hoặc dán Cookie JSON bên dưới.</p>
          </div>
          <button
            class="px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-[0_2px_8px_rgba(16,185,129,0.25)] transition-colors cursor-pointer flex items-center space-x-1.5"
            @click="accountStore.loginFacebook"
          >
            <LogIn class="w-3.5 h-3.5" />
            <span>Kết nối Facebook</span>
          </button>
        </div>
      </div>

      <!-- Setting Group 1: Import Cookie / Session JSON -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <KeyRound class="w-4 h-4 text-[#10B981]" />
            <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Nhập Cookie / Session JSON</h3>
          </div>
          <span class="text-[10px] text-[#64748B]">Hỗ trợ Cookie JSON hoặc storageState</span>
        </div>
        <div class="pt-1">
          <textarea
            v-model="sessionJsonInput"
            rows="4"
            class="w-full rounded-lg bg-[#0B111A] border border-[#1E293B] focus:border-[#10B981] p-3 text-xs font-mono text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors"
            placeholder='Dán chuỗi Cookie JSON (cần chứa "c_user" và "xs")... Ví dụ: [{"name":"c_user","value":"1000..."},{"name":"xs","value":"..."}]'
          ></textarea>
        </div>
        <div v-if="importMessage" :class="['text-xs p-2.5 rounded-lg border flex items-center space-x-2', importSuccess ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]' : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]']">
          <CheckCircle2 v-if="importSuccess" class="w-4 h-4 flex-shrink-0" />
          <AlertCircle v-else class="w-4 h-4 flex-shrink-0" />
          <span>{{ importMessage }}</span>
        </div>
        <div class="flex items-center justify-end space-x-2 pt-1">
          <button
            class="px-3 py-1.5 rounded-lg bg-[#0B111A] hover:bg-[#1E293B] text-[#94A3B8] text-xs font-medium border border-[#1E293B] transition-colors cursor-pointer"
            :disabled="!sessionJsonInput.trim() || isSubmitting"
            @click="sessionJsonInput = ''; importMessage = ''"
          >
            Xóa nội dung
          </button>
          <button
            class="px-4 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-[#042419] text-xs font-bold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] cursor-pointer flex items-center space-x-1.5"
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
        <div class="flex items-center space-x-2">
          <ShieldCheck class="w-4 h-4 text-[#10B981]" />
          <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Lưu Trữ & Bảo Mật</h3>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Mã hóa an toàn safeStorage</span>
            <p class="text-[11px] text-[#64748B]">Bảo vệ Cookies và LocalStorage qua DPAPI/Keychain hệ thống.</p>
          </div>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/20 text-[#10B981]">
            Đã kích hoạt (AES Hardware)
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Cơ sở dữ liệu SQLite cục bộ</span>
            <p class="text-[11px] text-[#64748B]">Chế độ Write-Ahead Logging (WAL) đảm bảo an toàn và toàn vẹn dữ liệu.</p>
          </div>
          <span class="text-[11px] font-mono text-[#94A3B8]">fb_pulse.db</span>
        </div>
      </div>

      <!-- Setting Group 3: Anti-ban -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div class="flex items-center space-x-2">
          <Sliders class="w-4 h-4 text-[#10B981]" />
          <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Cấu Hình An Toàn Anti-Ban</h3>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Khoảng trễ Jitter ngẫu nhiên</span>
            <p class="text-[11px] text-[#64748B]">Độ trễ ngẫu nhiên từ 180s đến 300s giữa các bài đăng liên tiếp.</p>
          </div>
          <span class="text-xs font-mono font-medium text-[#10B981] px-2 py-1 rounded bg-[#10B981]/15">180s - 300s</span>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Giới hạn tối đa bài đăng/ngày</span>
            <p class="text-[11px] text-[#64748B]">Ngưỡng khuyến nghị tối đa để giữ an toàn cho tài khoản.</p>
          </div>
          <span class="text-xs font-mono font-medium text-[#F1F5F9] px-2 py-1 rounded bg-[#0B111A] border border-[#1E293B]">30 bài</span>
        </div>
      </div>

      <!-- Setting Group 4: Power Management (Story 4.4) -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <Zap class="w-4 h-4 text-[#10B981]" />
            <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">
              Kiểm Soát Nguồn Điện & Chống Ngủ
            </h3>
          </div>
          <span
            v-if="settingsStore.isPowerSaveBlocked"
            class="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#10B981]/20 text-[#10B981] flex items-center space-x-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
            <span>Đang giữ máy thức</span>
          </span>
        </div>

        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div class="max-w-md">
            <span class="text-xs font-medium text-[#F1F5F9]">
              Ngăn máy tính đi ngủ khi có bài đăng đang chạy
            </span>
            <p class="text-[11px] text-[#64748B] mt-0.5">
              Tự động giữ máy tính luôn thức khi hàng đợi còn bài đăng để tránh gián đoạn chiến dịch, tự giải phóng khi hoàn tất.
            </p>
          </div>
          <button
            id="toggle-prevent-sleep"
            type="button"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
            :class="settingsStore.preventSleepWhenActive ? 'bg-[#10B981]' : 'bg-[#1E293B]'"
            :disabled="settingsStore.isLoading"
            @click="handleTogglePreventSleep"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
              :class="settingsStore.preventSleepWhenActive ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  UserCheck,
  KeyRound,
  ShieldCheck,
  Sliders,
  Zap,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertCircle
} from 'lucide-vue-next'
import { useAccountStore } from '../stores/account'
import { useSettingsStore } from '../stores/settings'

const accountStore = useAccountStore()
const settingsStore = useSettingsStore()
const sessionJsonInput = ref('')
const isSubmitting = ref(false)
const importMessage = ref('')
const importSuccess = ref(false)

onMounted(async () => {
  await settingsStore.fetchSettings()
})

async function handleTogglePreventSleep(): Promise<void> {
  await settingsStore.togglePreventSleep()
}

async function handleImportSession(): Promise<void> {
  if (!sessionJsonInput.value.trim()) return
  isSubmitting.value = true
  importMessage.value = ''

  try {
    const res = await accountStore.importSessionJson(sessionJsonInput.value)
    if (res.success) {
      importSuccess.value = true
      importMessage.value = 'Nhập phiên đăng nhập thành công. Tài khoản đã sẵn sàng hoạt động.'
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
