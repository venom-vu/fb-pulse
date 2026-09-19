<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6 select-none">
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Điều Phối Hàng Đợi</h1>
        <p class="text-xs text-[#94A3B8] mt-1">Giám sát tiến độ phát hành, bộ đếm Anti-ban Jitter và lịch sử xuất bản.</p>
      </div>

      <!-- Quick Stats -->
      <div class="flex items-center space-x-3 text-xs">
        <div class="px-3 py-1.5 rounded-lg bg-[#131B26] border border-[#1E293B] flex items-center space-x-2">
          <span class="text-[#94A3B8]">Đang chờ:</span>
          <strong class="text-[#10B981] font-mono">{{ queueStore.scheduledCount }}</strong>
        </div>
        <div
          v-if="queueStore.authPausedCount > 0"
          class="px-3 py-1.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 flex items-center space-x-2"
        >
          <span class="text-[#EF4444]">Tạm dừng Auth:</span>
          <strong class="text-[#EF4444] font-mono">{{ queueStore.authPausedCount }}</strong>
        </div>
        <div class="px-3 py-1.5 rounded-lg bg-[#131B26] border border-[#1E293B] flex items-center space-x-2">
          <span class="text-[#94A3B8]">Tổng tác vụ:</span>
          <strong class="text-[#F1F5F9] font-mono">{{ queueStore.totalCount }}</strong>
        </div>
      </div>
    </div>

    <!-- Emergency Pause Warning Box (UX-DR8 & AD-7 Standard) -->
    <div
      v-if="queueStore.isEmergencyPaused || queueStore.authPausedCount > 0"
      class="bg-[#131B26] border-2 border-[#EF4444] rounded-xl p-5 shadow-[0_0_25px_rgba(239,68,68,0.2)] space-y-4 animate-fade-in"
      role="alert"
      aria-live="polite"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-start space-x-3.5">
          <div class="w-9 h-9 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/50 flex items-center justify-center text-[#EF4444] shrink-0 mt-0.5">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#EF4444] text-[#0B111A]">
                Phòng vệ khẩn cấp (Emergency Pause)
              </span>
              <span class="text-xs text-[#94A3B8]">{{ queueStore.emergencyPauseTimestamp ? new Date(queueStore.emergencyPauseTimestamp).toLocaleTimeString('vi-VN') : '' }}</span>
            </div>
            <h3 class="text-sm font-bold text-[#F1F5F9] mt-1">
              Toàn bộ hàng đợi đã tạm dừng an toàn do Facebook yêu cầu xác minh bảo mật hoặc hết hạn phiên
            </h3>
            <p class="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              Lý do: <span class="text-[#EF4444] font-medium">{{ queueStore.emergencyPauseReason || 'Phát hiện phiên hết hạn hoặc yêu cầu Checkpoint' }}</span>.
              Hiện có <strong class="text-[#F1F5F9]">{{ queueStore.authPausedCount }} bài viết</strong> đang ở trạng thái <code class="text-[#EF4444] font-mono text-[11px] bg-[#EF4444]/10 px-1 py-0.5 rounded">[Paused - Auth Required]</code>.
            </p>
          </div>
        </div>

        <!-- Action Button -->
        <div class="flex items-center space-x-2 shrink-0">
          <template v-if="accountStore.account?.status === 'connected'">
            <button
              class="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              :disabled="queueStore.isResuming"
              @click="handleResumeQueue"
            >
              <span v-if="queueStore.isResuming" class="w-2 h-2 rounded-full bg-[#042419] animate-ping"></span>
              <span>{{ queueStore.isResuming ? 'Đang khôi phục...' : 'Tiếp tục hàng đợi (Resume Queue)' }}</span>
            </button>
          </template>
          <template v-else>
            <button
              class="px-4 py-2 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              :disabled="accountStore.isLoggingIn"
              @click="handleReLogin"
            >
              <span v-if="accountStore.isLoggingIn" class="w-2 h-2 rounded-full bg-white animate-ping"></span>
              <span>{{ accountStore.isLoggingIn ? 'Đang mở WebView...' : 'Mở WebView xử lý ngay' }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty State / Placeholder -->
    <div
      v-if="queueStore.totalCount === 0"
      class="bg-[#131B26] border border-[#1E293B] rounded-xl p-8 text-center space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-[#10B981]/15 text-[#10B981] flex items-center justify-center mx-auto">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 class="text-sm font-semibold text-[#F1F5F9]">Hàng đợi đang trống</h3>
      <p class="text-xs text-[#94A3B8] max-w-sm mx-auto">
        Chưa có chiến dịch nào được lên lịch. Hãy chuyển sang tab Soạn Thảo để bắt đầu tạo chiến dịch đầu tiên.
      </p>
    </div>

    <!-- Active / Preserved Tasks Overview -->
    <div v-else class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 space-y-3">
      <div class="flex items-center justify-between text-xs text-[#94A3B8] border-b border-[#1E293B] pb-2">
        <span>Danh sách tác vụ điều phối</span>
        <span>Bảo toàn 100% khi tái xác thực</span>
      </div>
      <div class="text-xs text-[#CBD5E1] space-y-2">
        <div
          v-if="queueStore.authPausedCount > 0"
          class="flex items-center justify-between p-3 rounded-lg bg-[#0B111A] border border-[#EF4444]/30"
        >
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-[#EF4444]"></span>
            <span class="font-medium text-[#F1F5F9]">Tác vụ bị tạm dừng bảo vệ (Auth Required)</span>
          </div>
          <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-[#EF4444]/20 text-[#EF4444]">
            {{ queueStore.authPausedCount }} bài viết
          </span>
        </div>

        <div
          v-if="queueStore.scheduledCount > 0"
          class="flex items-center justify-between p-3 rounded-lg bg-[#0B111A] border border-[#10B981]/30"
        >
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-[#10B981]"></span>
            <span class="font-medium text-[#F1F5F9]">Tác vụ đã lên lịch sẵn sàng</span>
          </div>
          <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-[#10B981]/20 text-[#10B981]">
            {{ queueStore.scheduledCount }} bài viết
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAccountStore } from '../stores/account'
import { useQueueStore } from '../stores/queue'

const accountStore = useAccountStore()
const queueStore = useQueueStore()

onMounted(async () => {
  await queueStore.fetchQueueStatus()
})

async function handleReLogin(): Promise<void> {
  await accountStore.loginFacebook()
  await queueStore.fetchQueueStatus()
}

async function handleResumeQueue(): Promise<void> {
  await queueStore.resumeQueue()
}
</script>
