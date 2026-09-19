<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none"
    role="dialog"
    aria-modal="true"
    aria-labelledby="security-alert-title"
  >
    <div
      class="bg-[#131B26] border-2 border-[#EF4444]/60 rounded-xl max-w-lg w-full p-6 shadow-[0_0_30px_rgba(239,68,68,0.25)] text-[#F1F5F9] space-y-5"
    >
      <!-- Header -->
      <div class="flex items-start space-x-3.5">
        <div
          class="w-10 h-10 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/50 flex items-center justify-center text-[#EF4444] shrink-0"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div class="flex-1">
          <div class="flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
              Emergency Pause
            </span>
            <span class="text-xs text-[#94A3B8]">{{ formattedTime }}</span>
          </div>
          <h2 id="security-alert-title" class="text-base font-bold text-[#F1F5F9] mt-1">
            Cảnh Báo Bảo Mật: Phiên Đăng Nhập Bị Thu Hồi
          </h2>
        </div>
        <button
          class="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors p-1 rounded hover:bg-[#1E293B]"
          title="Đóng thông báo"
          @click="closeModal"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Description & Reason Box -->
      <div class="space-y-3 text-xs text-[#94A3B8] leading-relaxed">
        <p>
          Hệ thống phát hiện phiên đăng nhập Facebook của tài khoản đã hết hạn hoặc bị thu hồi (đổi mật khẩu từ thiết bị khác hoặc yêu cầu xác thực Checkpoint).
        </p>

        <div class="bg-[#0B111A] border border-[#EF4444]/30 rounded-lg p-3 space-y-1.5">
          <div class="text-[11px] font-semibold text-[#EF4444] flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>
            <span>Chi tiết lý do từ hệ thống:</span>
          </div>
          <div class="text-xs text-[#CBD5E1] font-mono pl-3">
            {{ displayReason }}
          </div>
        </div>

        <!-- Queue Protection Summary -->
        <div class="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 text-[#CBD5E1] flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <svg class="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Hàng đợi được bảo toàn: <strong class="text-[#10B981]">{{ queueStore.authPausedCount }} bài viết</strong> đang ở trạng thái <code class="text-[11px] text-[#10B981]">[Paused - Auth Required]</code></span>
          </div>
        </div>

        <!-- Success notification if re-authenticated -->
        <div
          v-if="isReauthenticated"
          class="bg-[#10B981]/20 border border-[#10B981]/60 rounded-lg p-3 text-[#10B981] font-medium flex items-center space-x-2 animate-fade-in"
        >
          <svg class="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>Tái xác thực thành công! Phiên kết nối đã hợp lệ. Bạn có thể bấm Tiếp tục để chạy lại hàng đợi.</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-end space-x-3 pt-2 border-t border-[#1E293B]">
        <!-- If not yet re-authenticated -->
        <template v-if="!isReauthenticated">
          <button
            class="px-3 py-1.5 rounded-lg border border-[#1E293B] hover:bg-[#1E293B] text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
            @click="closeModal"
          >
            Đóng tạm thời
          </button>
          <button
            class="px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            :disabled="accountStore.isLoggingIn"
            @click="handleReLogin"
          >
            <span v-if="accountStore.isLoggingIn" class="w-2 h-2 rounded-full bg-[#042419] animate-ping"></span>
            <span>{{ accountStore.isLoggingIn ? 'Đang mở WebView...' : 'Đăng nhập lại ngay' }}</span>
          </button>
        </template>

        <!-- If re-authenticated: manual resume -->
        <template v-else>
          <button
            class="px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            :disabled="queueStore.isResuming"
            @click="handleResumeQueue"
          >
            <span v-if="queueStore.isResuming" class="w-2 h-2 rounded-full bg-[#042419] animate-ping"></span>
            <span>{{ queueStore.isResuming ? 'Đang khôi phục...' : 'Tiếp tục hàng đợi (Resume Queue)' }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAccountStore } from '../../stores/account'
import { useQueueStore } from '../../stores/queue'

const accountStore = useAccountStore()
const queueStore = useQueueStore()

const isOpen = computed(() => queueStore.showSecurityModal || accountStore.isCheckpointRequired)

const isReauthenticated = computed(() => {
  return accountStore.account?.status === 'connected'
})

const displayReason = computed(() => {
  return (
    queueStore.emergencyPauseReason ||
    accountStore.account?.status_reason ||
    'Phiên đăng nhập đã hết hạn cookie hoặc bị Facebook yêu cầu xác minh bảo mật.'
  )
})

const formattedTime = computed(() => {
  const ts = queueStore.emergencyPauseTimestamp
  if (!ts) return new Date().toLocaleTimeString('vi-VN')
  try {
    return new Date(ts).toLocaleTimeString('vi-VN')
  } catch {
    return new Date().toLocaleTimeString('vi-VN')
  }
})

async function handleReLogin(): Promise<void> {
  const result = await accountStore.loginFacebook()
  if (result.success) {
    await queueStore.fetchQueueStatus()
  }
}

async function handleResumeQueue(): Promise<void> {
  const res = await queueStore.resumeQueue()
  if (res.success) {
    queueStore.closeSecurityModal()
  }
}

function closeModal(): void {
  queueStore.closeSecurityModal()
}
</script>
