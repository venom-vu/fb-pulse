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
        <div
          v-if="account"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[11px] transition-all"
        >
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]"></span>
          </span>
          <span class="font-medium max-w-[140px] truncate">Connected: {{ account.name }}</span>
          <span class="text-[9px] px-1 py-0.2 rounded bg-[#10B981]/20 font-bold uppercase">Active</span>
        </div>
        <div
          v-else
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#131B26] border border-[#1E293B] text-[#94A3B8] text-[11px] shadow-sm"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#64748B]"></span>
          <span>Chưa kết nối tài khoản Facebook</span>
        </div>
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

const accountStore = useAccountStore()
const account = computed(() => accountStore.account)
const platform = ref<'darwin' | 'win32' | 'linux'>('darwin')

const isMac = computed(() => platform.value === 'darwin')

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
</script>
