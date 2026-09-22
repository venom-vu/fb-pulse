<template>
  <div
    class="fixed top-12 right-6 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full"
    aria-live="polite"
  >
    <transition-group
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-4"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-start p-3 rounded-lg shadow-xl border backdrop-blur-md transition-all"
        :class="getToastClasses(toast.type)"
      >
        <span class="mr-2.5 flex-shrink-0 mt-0.5">
          <CheckCircle2 v-if="toast.type === 'success'" class="w-4 h-4 text-[#10B981]" />
          <AlertTriangle v-else-if="toast.type === 'warning'" class="w-4 h-4 text-[#F59E0B]" />
          <AlertCircle v-else-if="toast.type === 'error'" class="w-4 h-4 text-[#EF4444]" />
          <Info v-else class="w-4 h-4 text-[#38BDF8]" />
        </span>
        <div class="flex-1 text-xs text-[#F1F5F9] font-medium leading-relaxed select-none">
          {{ toast.message }}
        </div>
        <button
          class="ml-3 text-[#64748B] hover:text-[#F1F5F9] p-0.5 transition-colors flex-shrink-0 cursor-pointer"
          title="Đóng thông báo"
          @click="toastStore.removeToast(toast.id)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-vue-next'
import { useToastStore, ToastType } from '../../stores/toast'

const toastStore = useToastStore()

function getToastClasses(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'bg-[#131B26]/95 border-[#10B981]/40 shadow-[0_4px_16px_rgba(16,185,129,0.2)]'
    case 'warning':
      return 'bg-[#131B26]/95 border-[#F59E0B]/50 shadow-[0_4px_16px_rgba(245,158,11,0.2)]'
    case 'error':
      return 'bg-[#131B26]/95 border-[#EF4444]/50 shadow-[0_4px_16px_rgba(239,68,68,0.2)]'
    default:
      return 'bg-[#131B26]/95 border-[#1E293B] shadow-[0_4px_16px_rgba(0,0,0,0.4)]'
  }
}
</script>
