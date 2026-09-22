<template>
  <header
    class="h-[38px] bg-[#0B111A] border-b border-[#1E293B] flex items-center justify-between px-3 text-xs font-medium select-none titlebar-drag-region shrink-0 z-50"
  >
    <!-- Left Section: macOS Traffic Light Spacer & Logo -->
    <div class="flex items-center space-x-2">
      <div v-if="isMac && !isFullScreen" class="w-[68px] h-full" aria-hidden="true"></div>
      <span class="font-bold tracking-wider text-[#F1F5F9] uppercase text-[11px]">fb-pulse</span>
    </div>

    <!-- Center Section: Empty Drag Region -->
    <div class="flex-1 h-full titlebar-drag-region"></div>

    <!-- Right Section: Account Status & Window Controls -->
    <div class="flex items-center space-x-3">
      <div class="titlebar-no-drag">
        <!-- Connected State: Avatar + Name only -->
        <div
          v-if="account && account.status === 'connected'"
          class="flex items-center space-x-2 text-xs py-0.5 px-1"
        >
          <img
            v-if="account.avatar_url"
            :src="account.avatar_url"
            alt="Avatar"
            class="w-5 h-5 rounded-full object-cover border border-[#10B981]/50"
          />
          <div
            v-else
            class="w-5 h-5 rounded-full bg-[#10B981] text-[#042419] font-bold text-[10px] flex items-center justify-center"
          >
            {{ account.name?.charAt(0).toUpperCase() || 'F' }}
          </div>
          <span class="font-medium text-[#F1F5F9] max-w-[160px] truncate" :title="account.name">
            {{ account.name }}
          </span>
        </div>

        <!-- Checkpoint Required / Auth Warning State -->
        <div
          v-else-if="account && account.status === 'checkpoint_required'"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#EF4444]/15 border border-[#EF4444]/60 text-[#EF4444] text-[11px] cursor-pointer"
          title="Yêu cầu xác thực tài khoản Facebook"
          @click="handleCheckpointClick"
        >
          <AlertTriangle class="w-3.5 h-3.5 text-[#EF4444]" />
          <span class="font-medium max-w-[120px] truncate">{{ account.name }}</span>
          <span class="text-[10px] font-bold underline">Xác thực lại</span>
        </div>

        <!-- Disconnected State: Square button with "Kết nối" -->
        <button
          v-else
          id="btn-connect-facebook"
          class="px-3 py-1 rounded-md bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center space-x-1.5"
          :disabled="accountStore.isLoggingIn"
          title="Chưa kết nối tài khoản Facebook"
          @click="connectFacebook"
        >
          <LogIn v-if="!accountStore.isLoggingIn" class="w-3.5 h-3.5" />
          <RefreshCw v-else class="w-3.5 h-3.5 animate-spin" />
          <span>{{ accountStore.isLoggingIn ? 'Đang mở...' : 'Kết nối' }}</span>
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { LogIn, RefreshCw, AlertTriangle } from 'lucide-vue-next'
import { useAccountStore } from '../../stores/account'
import { useQueueStore } from '../../stores/queue'

const accountStore = useAccountStore()
const queueStore = useQueueStore()
const account = computed(() => accountStore.account)
const platform = ref<'darwin' | 'win32' | 'linux'>('darwin')
const isFullScreen = ref(false)

const isMac = computed(() => platform.value === 'darwin')

function handleCheckpointClick(): void {
  queueStore.openSecurityModal()
}

async function updateFullScreen(): Promise<void> {
  if (window.fbPulseAPI?.window?.isFullScreen) {
    try {
      isFullScreen.value = await window.fbPulseAPI.window.isFullScreen()
      return
    } catch {
      // fallback below
    }
  }
  isFullScreen.value = !!(
    document.fullscreenElement ||
    (window.innerHeight === screen.height && window.innerWidth === screen.width)
  )
}

let unsubscribeFs: (() => void) | undefined

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

  await updateFullScreen()

  if (window.fbPulseAPI?.window?.onFullScreenChange) {
    unsubscribeFs = window.fbPulseAPI.window.onFullScreenChange((fs) => {
      isFullScreen.value = fs
    })
  }

  window.addEventListener('resize', updateFullScreen)
})

onUnmounted(() => {
  unsubscribeFs?.()
  window.removeEventListener('resize', updateFullScreen)
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
</script>
