<template>
  <aside
    class="w-[220px] min-w-[220px] max-w-[220px] bg-[#0B111A] border-r border-[#1E293B] flex flex-col justify-between select-none h-full"
  >
    <!-- Top Nav Menu -->
    <div class="p-3 space-y-1">
      <div class="px-3 py-2 text-[10px] font-bold tracking-wider text-[#64748B] uppercase">
        Modules
      </div>

      <button
        v-for="item in navItems"
        :key="item.id"
        :class="[
          'w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer',
          activeTab === item.id
            ? 'bg-[#10B981]/12 text-[#10B981] border-l-2 border-[#10B981] shadow-sm font-semibold'
            : 'text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#131B26]'
        ]"
        @click="navStore.setActiveTab(item.id)"
      >
        <component :is="item.icon" class="w-4 h-4 shrink-0" />
        <span class="truncate">{{ item.label }}</span>
      </button>
    </div>

    <!-- Bottom Safety & Status Card -->
    <div class="p-3 space-y-2">
      <div class="bg-[#131B26] border border-[#1E293B] rounded-lg p-3 space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-medium text-[#94A3B8]">Anti-ban Guard</span>
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/20 text-[#10B981]">
            Active
          </span>
        </div>
        <p class="text-[10px] text-[#64748B] leading-relaxed">
          Động cơ Jitter ngẫu nhiên 180s–300s & giới hạn 30 bài/ngày bảo vệ tài khoản.
        </p>
      </div>

      <div class="px-2 py-1 flex items-center justify-between text-[10px] text-[#64748B] font-mono">
        <span>v1.0.0</span>
        <span class="flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
          <span>SQLite WAL</span>
        </span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PenSquare,
  ListOrdered,
  Users,
  Settings
} from 'lucide-vue-next'
import { useNavigationStore, NavTab } from '../../stores/navigation'

const navStore = useNavigationStore()
const activeTab = computed(() => navStore.activeTab)

interface NavItem {
  id: NavTab
  label: string
  icon: any
}

const navItems: NavItem[] = [
  { id: 'composer', label: 'Soạn Thảo', icon: PenSquare },
  { id: 'queue', label: 'Hàng Đợi', icon: ListOrdered },
  { id: 'targets', label: 'Đích Đăng', icon: Users },
  { id: 'settings', label: 'Cài Đặt', icon: Settings }
]
</script>
