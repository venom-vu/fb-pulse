<template>
  <header
    class="h-[38px] bg-[#0B111A] border-b border-[#1E293B] flex items-center justify-between px-3 text-xs font-medium select-none titlebar-drag-region shrink-0 z-50"
  >
    <!-- Left Section: macOS Traffic Light Spacer or Logo -->
    <div class="flex items-center space-x-2">
      <div v-if="isMac" class="w-[68px] h-full" aria-hidden="true"></div>
      <div class="flex items-center space-x-2 text-[#94A3B8]">
        <div class="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
        <span class="font-bold tracking-wider text-[#F1F5F9] uppercase text-[11px]">fb-pulse</span>
      </div>
    </div>

    <!-- Center Section: Title & Subtle Info -->
    <div class="hidden md:flex items-center text-[#64748B] text-[11px] font-mono">
      <span>Desktop Safe Automation Engine</span>
    </div>

    <!-- Right Section: Account Status Pill & Window Controls -->
    <div class="flex items-center space-x-3">
      <!-- Status Pill -->
      <div class="titlebar-no-drag">
        <!-- Checkpoint Required / Auth Warning State -->
        <div
          v-if="account && account.status === 'checkpoint_required'"
          class="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-[#EF4444]/15 border border-[#EF4444]/60 text-[#EF4444] text-[11px] transition-all group cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.2)]"
          title="Phiên đăng nhập đã bị thu hồi hoặc yêu cầu xác thực. Nhấp để xem chi tiết và đăng nhập lại."
          @click="handleCheckpointClick"
        >
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]"></span>
          </span>
          <span class="font-medium max-w-[140px] truncate">{{ account.name }}</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded bg-[#EF4444]/25 font-bold uppercase tracking-tight text-[#EF4444]">
            Auth Required
          </span>
          <span class="text-[9px] bg-[#EF4444] text-[#0B111A] font-bold px-1.5 py-0.5 rounded ml-1 group-hover:bg-white transition-colors">
            Xác thực lại
          </span>
        </div>

        <!-- Connected State -->
        <div
          v-else-if="account && account.status === 'connected'"
          class="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[11px] transition-all group cursor-pointer"
          title="Tài khoản đang kết nối. Nhấp để đăng xuất."
          @click="handleLogout"
        >
          <img
            v-if="account.avatar_url"
            :src="account.avatar_url"
            alt="Avatar"
            class="w-4 h-4 rounded-full object-cover border border-[#10B981]"
          />
          <span
            v-else
            class="w-4 h-4 rounded-full bg-[#10B981] text-[#042419] font-bold text-[9px] flex items-center justify-center"
          >
            {{ account.name?.charAt(0).toUpperCase() || 'F' }}
          </span>

          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]"></span>
          </span>
          <span class="font-medium max-w-[140px] truncate">Connected: {{ account.name }}</span>
          <span class="text-[9px] px-1 py-0.2 rounded bg-[#10B981]/20 font-bold uppercase">Active</span>
          <span class="hidden group-hover:inline-block text-[9px] text-[#EF4444] font-medium ml-1">Đăng xuất</span>
        </div>
        <button
          v-else
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#131B26] hover:bg-[#1E293B] border border-[#1E293B] hover:border-[#10B981]/50 text-[#94A3B8] hover:text-[#F1F5F9] text-[11px] shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          :disabled="accountStore.isLoggingIn"
          title="Nhấp để kết nối tài khoản Facebook"
          @click="connectFacebook"
        >
          <span v-if="accountStore.isLoggingIn" class="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse"></span>
          <span v-else class="w-1.5 h-1.5 rounded-full bg-[#64748B]"></span>
          <span v-if="accountStore.isLoggingIn">Đang mở trình duyệt...</span>
          <span v-else>Chưa kết nối tài khoản Facebook · <strong class="text-[#10B981] font-medium">Kết nối ngay</strong></span>
        </button>
      </div>

      <!-- Windows / Linux Window Controls -->
      <div v-if="!isMac" class="flex items-center titlebar-no-drag ml-2">
        <button
          class="h-[30px] w-[32px] flex items-center justify-center text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] rounded transition-colors"
          title="Thu nhỏ"
          @click="minimizeWindow"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          class="h-[30px] w-[32px] flex items-center justify-center text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B] rounded transition-colors"
          title="Phóng to"
          @click="maximizeWindow"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
        </button>
        <button
          class="h-[30px] w-[32px] flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-[#EF4444] rounded transition-colors"
          title="Đóng"
          @click="closeWindow"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccountStore } from '../../stores/account'
import { useQueueStore } from '../../stores/queue'

const accountStore = useAccountStore()
const queueStore = useQueueStore()
const account = computed(() => accountStore.account)
const platform = ref<'darwin' | 'win32' | 'linux'>('darwin')

const isMac = computed(() => platform.value === 'darwin')

function handleCheckpointClick(): void {
  queueStore.openSecurityModal()
}

onMounted(async () => {
  if (window.fbPulseAPI?.app) {
    try {
      const info = await window.fbPulseAPI.app.getInfo()
      platform.value = info.platform
    } catch {
      platform.value = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'
    }
  } else {
    platform.value = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'
  }
})

function minimizeWindow(): void {
  window.fbPulseAPI?.window?.minimize()
}

function maximizeWindow(): void {
  window.fbPulseAPI?.window?.maximize()
}

function closeWindow(): void {
  window.fbPulseAPI?.window?.close()
}

async function connectFacebook(): Promise<void> {
  await accountStore.loginFacebook()
}

async function handleLogout(): Promise<void> {
  if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản này không?')) {
    await accountStore.logout()
  }
}
</script>
