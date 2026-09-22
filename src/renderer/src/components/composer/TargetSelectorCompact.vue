<template>
  <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B]/60 pb-2.5">
      <div class="flex items-center space-x-2">
        <span class="text-xs font-bold text-[#F1F5F9] uppercase tracking-wider">Điểm Đích Tiếp Nhận</span>
        <span class="text-[11px] text-[#64748B] font-normal">(Target Groups)</span>
      </div>
      <div class="flex items-center space-x-2">
        <span
          id="target-selected-count-badge"
          class="text-xs font-semibold px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30"
        >
          Đã chọn {{ composerStore.selectedTargetsCount }}/{{ totalAvailableTargets }}
        </span>
      </div>
    </div>

    <!-- Profile Option Row (if available) -->
    <div
      v-if="targetsStore.profileTarget"
      class="flex items-center justify-between p-2 rounded-lg bg-[#0B111A] border border-[#1E293B] text-xs hover:border-[#1E293B]/80 transition-all cursor-pointer"
      @click="composerStore.toggleTarget(targetsStore.profileTarget.id)"
    >
      <label class="flex items-center space-x-2.5 cursor-pointer select-none" @click.stop>
        <input
          :id="`target-checkbox-${targetsStore.profileTarget.id}`"
          type="checkbox"
          :checked="composerStore.isTargetSelected(targetsStore.profileTarget.id)"
          class="w-3.5 h-3.5 rounded border-[#1E293B] bg-[#131B26] text-[#10B981] accent-[#10B981] cursor-pointer"
          @change="composerStore.toggleTarget(targetsStore.profileTarget.id)"
        />
        <div class="flex items-center space-x-1.5">
          <User class="w-3.5 h-3.5 text-[#10B981]" />
          <span class="font-semibold text-[#F1F5F9]">
            Đăng lên Trang cá nhân ({{ targetsStore.profileTarget.name }})
          </span>
        </div>
      </label>
      <span class="text-[11px] text-[#64748B]">Trang cá nhân</span>
    </div>

    <!-- Groups Compact Table -->
    <div class="border border-[#1E293B] rounded-lg overflow-hidden bg-[#0B111A]">
      <div class="max-h-[180px] overflow-y-auto custom-scrollbar">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="sticky top-0 bg-[#0E1622] border-b border-[#1E293B] z-10">
            <tr>
              <th class="w-8 px-2.5 py-2 text-center">
                <input
                  id="select-all-targets-checkbox"
                  type="checkbox"
                  :checked="isAllSelected"
                  :indeterminate.prop="isIndeterminate"
                  class="w-3.5 h-3.5 rounded border-[#1E293B] bg-[#131B26] text-[#10B981] accent-[#10B981] cursor-pointer"
                  @change="handleToggleSelectAll"
                />
              </th>
              <th class="px-2.5 py-2 text-[11px] font-semibold text-[#64748B]">Tên Nhóm Facebook</th>
              <th class="w-24 px-2.5 py-2 text-[11px] font-semibold text-[#64748B] text-center">Duyệt bài</th>
              <th class="w-24 px-2.5 py-2 text-[11px] font-semibold text-[#64748B] text-right">Quyền riêng tư</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#1E293B]/40">
            <!-- Loading State -->
            <tr v-if="targetsStore.isLoading && targetsStore.groupTargets.length === 0">
              <td colspan="4" class="text-center py-6 text-xs text-[#64748B]">
                Đang tải danh sách nhóm mục tiêu...
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-else-if="targetsStore.groupTargets.length === 0">
              <td colspan="4" class="text-center py-6 text-xs text-[#64748B]">
                Chưa có nhóm mục tiêu nào. Vui lòng đồng bộ tại trang Quản lý Đích Đăng.
              </td>
            </tr>

            <!-- Group Rows -->
            <tr
              v-for="group in targetsStore.groupTargets"
              :key="group.id"
              class="hover:bg-[#131B26]/80 transition-colors cursor-pointer select-none"
              :class="{ 'bg-[#10B981]/5': composerStore.isTargetSelected(group.id) }"
              @click="composerStore.toggleTarget(group.id)"
            >
              <td class="w-8 px-2.5 py-2 text-center" @click.stop>
                <input
                  :id="`target-checkbox-${group.id}`"
                  type="checkbox"
                  :checked="composerStore.isTargetSelected(group.id)"
                  class="w-3.5 h-3.5 rounded border-[#1E293B] bg-[#131B26] text-[#10B981] accent-[#10B981] cursor-pointer"
                  @change="composerStore.toggleTarget(group.id)"
                />
              </td>
              <td class="px-2.5 py-2 font-medium text-[#CBD5E1] max-w-[200px] truncate" :title="group.name">
                {{ group.name }}
              </td>
              <td class="px-2.5 py-2 text-center">
                <span
                  v-if="group.privacy === 'public'"
                  class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/15 text-[#34D399] border border-[#10B981]/30"
                >
                  Đăng tự do
                </span>
                <span
                  v-else
                  class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F59E0B]/15 text-[#FBBF24] border border-[#F59E0B]/30"
                >
                  Cần duyệt
                </span>
              </td>
              <td class="px-2.5 py-2 text-right text-[11px] text-[#94A3B8]">
                <span v-if="group.privacy === 'public'" class="inline-flex items-center space-x-1">
                  <Globe class="w-3 h-3 text-[#10B981]" />
                  <span>Công khai</span>
                </span>
                <span v-else class="inline-flex items-center space-x-1">
                  <Lock class="w-3 h-3 text-[#F59E0B]" />
                  <span>Riêng tư</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Quick Selection Controls -->
    <div class="flex items-center justify-between text-[11px] text-[#64748B] pt-0.5 px-1">
      <div class="space-x-3">
        <button
          type="button"
          class="hover:text-[#10B981] transition-colors cursor-pointer underline"
          @click="selectAllGroups"
        >
          Chọn tất cả nhóm
        </button>
        <button
          type="button"
          class="hover:text-[#EF4444] transition-colors cursor-pointer underline"
          @click="composerStore.clearSelectedTargets()"
        >
          Bỏ chọn tất cả
        </button>
      </div>
      <span class="font-mono text-[#94A3B8]">Tổng số nhóm: {{ targetsStore.groupTargets.length }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { User, Globe, Lock } from 'lucide-vue-next'
import { useTargetsStore } from '../../stores/targets'
import { useComposerStore } from '../../stores/composer'

const targetsStore = useTargetsStore()
const composerStore = useComposerStore()

const allTargetIds = computed(() => {
  const ids: string[] = []
  if (targetsStore.profileTarget) {
    ids.push(targetsStore.profileTarget.id)
  }
  for (const group of targetsStore.groupTargets) {
    ids.push(group.id)
  }
  return ids
})

const totalAvailableTargets = computed(() => allTargetIds.value.length)

const isAllSelected = computed(() => {
  if (allTargetIds.value.length === 0) return false
  return allTargetIds.value.every((id) => composerStore.isTargetSelected(id))
})

const isIndeterminate = computed(() => {
  const selectedCount = composerStore.selectedTargetsCount
  return selectedCount > 0 && selectedCount < allTargetIds.value.length
})

function handleToggleSelectAll(): void {
  if (isAllSelected.value) {
    composerStore.clearSelectedTargets()
  } else {
    composerStore.selectAllTargets(allTargetIds.value)
  }
}

function selectAllGroups(): void {
  const groupIds = targetsStore.groupTargets.map((g) => g.id)
  if (targetsStore.profileTarget && composerStore.isTargetSelected(targetsStore.profileTarget.id)) {
    groupIds.unshift(targetsStore.profileTarget.id)
  }
  composerStore.selectAllTargets(groupIds)
}

onMounted(async () => {
  if (targetsStore.targets.length === 0) {
    await targetsStore.fetchTargets()
    await targetsStore.fetchFolders()
  }
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #0B111A;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #1E293B;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #334155;
}
</style>
