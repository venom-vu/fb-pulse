<template>
  <div class="space-y-6">
    <!-- Filter Tabs History -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-1 overflow-x-auto">
      <div class="flex items-center space-x-1">
        <button
          v-for="tab in historyFilterTabs"
          :key="tab.id"
          :class="[
            'px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 cursor-pointer',
            filterStatusHistory === tab.id
              ? 'bg-[#1E293B] text-[#F1F5F9] shadow-sm'
              : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-[#131B26]'
          ]"
          @click="filterStatusHistory = tab.id"
        >
          <span>{{ tab.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px] font-mono"
            :class="
              filterStatusHistory === tab.id
                ? 'bg-[#0B111A] text-[#3B82F6]'
                : 'bg-[#1E293B]/60 text-[#64748B]'
            "
          >
            {{ getHistoryTabCount(tab.id) }}
          </span>
        </button>
      </div>

      <span class="text-[11px] text-[#64748B] hidden md:inline">
        Lưu trữ toàn bộ kết quả phát hành • Mở bài trực tiếp & chẩn đoán lỗi minh bạch
      </span>
    </div>

    <!-- Empty State History -->
    <div
      v-if="currentHistoryTasks.length === 0"
      class="bg-[#131B26] border border-[#1E293B] rounded-xl p-10 text-center space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-[#1E293B] text-[#64748B] flex items-center justify-center mx-auto">
        <History class="w-6 h-6" />
      </div>
      <h3 class="text-sm font-semibold text-[#F1F5F9]">
        {{ filterStatusHistory === 'all' ? 'Chưa có lịch sử bài đăng nào' : 'Không có bài đăng nào khớp bộ lọc lịch sử' }}
      </h3>
      <p class="text-xs text-[#94A3B8] max-w-sm mx-auto">
        {{
          filterStatusHistory === 'all'
            ? 'Khi các bài viết được xử lý (thành công, chờ admin duyệt hoặc thất bại), lịch sử chi tiết sẽ hiển thị tại đây.'
            : 'Vui lòng chọn bộ lọc khác để xem thêm bài viết.'
        }}
      </p>
    </div>

    <!-- History Compact Table (Story 5.4) -->
    <div
      v-else
      class="bg-[#131B26] border border-[#1E293B] rounded-xl overflow-hidden shadow-lg"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-[#CBD5E1]">
          <thead class="bg-[#0B111A] text-[#94A3B8] text-[11px] uppercase tracking-wider border-b border-[#1E293B]">
            <tr>
              <th scope="col" class="py-3 px-4 font-semibold">Thời gian đăng</th>
              <th scope="col" class="py-3 px-4 font-semibold">Tên đích đăng</th>
              <th scope="col" class="py-3 px-4 font-semibold">Nội dung tóm tắt</th>
              <th scope="col" class="py-3 px-4 font-semibold text-center">Số lượng ảnh</th>
              <th scope="col" class="py-3 px-4 font-semibold text-center">Trạng thái</th>
              <th scope="col" class="py-3 px-4 font-semibold text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#1E293B]">
            <tr
              v-for="task in currentHistoryTasks"
              :key="task.id"
              class="hover:bg-[#1A2333] transition-colors"
            >
              <!-- Cột 1: Thời gian đăng -->
              <td class="py-3.5 px-4 whitespace-nowrap text-xs text-[#CBD5E1]">
                <div class="font-medium text-[#F1F5F9]">{{ formatTime(task.executed_at || task.updated_at || task.scheduled_at) }}</div>
                <div class="text-[10px] text-[#64748B]">{{ formatDate(task.executed_at || task.updated_at || task.scheduled_at) }}</div>
              </td>

              <!-- Cột 2: Tên đích đăng -->
              <td class="py-3.5 px-4 max-w-[170px]">
                <div class="flex items-center space-x-2">
                  <div class="w-6 h-6 rounded-full bg-[#1E293B] flex items-center justify-center text-[10px] text-[#94A3B8] shrink-0 overflow-hidden border border-[#334155]">
                    <img
                      v-if="task.target_avatar_url"
                      :src="task.target_avatar_url"
                      alt=""
                      class="w-full h-full object-cover"
                    />
                    <span v-else>{{ task.target_type === 'group' ? '👥' : '👤' }}</span>
                  </div>
                  <div class="truncate">
                    <div class="truncate text-xs text-[#F1F5F9] font-medium" :title="task.target_name">
                      {{ task.target_name || 'Đích đăng #' + task.target_id.slice(0, 6) }}
                    </div>
                    <span class="text-[10px] text-[#64748B]">
                      {{ task.target_type === 'group' ? 'Nhóm Facebook' : 'Trang cá nhân' }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Cột 3: Nội dung tóm tắt -->
              <td class="py-3.5 px-4 max-w-[260px]">
                <div class="line-clamp-2 text-xs text-[#CBD5E1] leading-relaxed" :title="task.resolved_spintax_text">
                  {{ task.resolved_spintax_text }}
                </div>
                <div class="text-[10px] text-[#64748B] mt-0.5 truncate">
                  {{ task.campaign_title || 'Chiến dịch không tên' }}
                </div>
              </td>

              <!-- Cột 4: Số lượng ảnh -->
              <td class="py-3.5 px-4 text-center whitespace-nowrap">
                <span
                  v-if="task.media_paths && task.media_paths.length > 0"
                  class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-[#0B111A] text-[#38BDF8] border border-[#0284C7]/30"
                >
                  <ImageIcon class="w-3 h-3 text-[#38BDF8]" />
                  <span>{{ task.media_paths.length }} ảnh</span>
                </span>
                <span v-else class="text-[#64748B] text-xs font-mono">-</span>
              </td>

              <!-- Cột 5: Badge trạng thái rõ ràng -->
              <td class="py-3.5 px-4 text-center whitespace-nowrap">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-help"
                  :class="getStatusBadgeClass(task.status)"
                  :title="getStatusTooltip(task)"
                >
                  <span class="w-1.5 h-1.5 rounded-full mr-1.5" :class="getStatusDotClass(task.status)"></span>
                  {{ getStatusLabel(task.status, task.retry_count) }}
                </span>
                <div v-if="task.error_message" class="text-[10px] text-[#EF4444] mt-1 max-w-[150px] truncate mx-auto" :title="task.error_message">
                  {{ task.error_message }}
                </div>
              </td>

              <!-- Cột 6: Thao tác -->
              <td class="py-3.5 px-4 text-right whitespace-nowrap">
                <div class="flex items-center justify-end space-x-1.5">
                  <!-- Nút Xem bài ↗ (Thành công / có permalink) -->
                  <button
                    v-if="(task.status === 'success' || task.status === 'admin_pending') && task.permalink"
                    :id="`btn-view-post-${task.id}`"
                    class="px-2.5 py-1 rounded bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/30 font-medium text-[11px] transition-all flex items-center space-x-1 cursor-pointer"
                    title="Mở bài viết trực tiếp trên trình duyệt mặc định"
                    @click="$emit('openPermalink', task.permalink)"
                  >
                    <ExternalLink class="w-3 h-3" />
                    <span>Xem bài ↗</span>
                  </button>

                  <!-- Biểu tượng Camera chẩn đoán lỗi (Thất bại) -->
                  <button
                    v-if="task.status === 'failed'"
                    :id="`btn-diagnostic-${task.id}`"
                    class="px-2.5 py-1 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 font-medium text-[11px] transition-all flex items-center space-x-1 cursor-pointer"
                    title="Xem chẩn đoán lỗi và ảnh chụp sự cố Playwright"
                    @click="$emit('openDiagnostic', task)"
                  >
                    <Camera class="w-3 h-3" />
                    <span>Chẩn đoán</span>
                  </button>

                  <!-- Nút Thử lại bài viết (Thất bại) -->
                  <button
                    v-if="task.status === 'failed'"
                    :id="`btn-retry-history-${task.id}`"
                    class="px-2.5 py-1 rounded bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] border border-[#3B82F6]/30 font-medium text-[11px] transition-all cursor-pointer flex items-center space-x-1"
                    title="Thử lại bài đăng này"
                    @click="$emit('retryTask', task.id)"
                  >
                    <RotateCcw class="w-3 h-3" />
                    <span>Thử lại</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  RotateCcw,
  ExternalLink,
  Image as ImageIcon,
  Camera,
  History
} from 'lucide-vue-next'
import type { TaskDTO } from '../../../../preload/types'

interface Props {
  tasks: TaskDTO[]
}

const props = defineProps<Props>()

defineEmits<{
  (e: 'openPermalink', url: string): void
  (e: 'openDiagnostic', task: TaskDTO): void
  (e: 'retryTask', taskId: string): void
}>()

const filterStatusHistory = ref<string>('all')

const historyFilterTabs = [
  { id: 'all', label: 'Tất cả lịch sử' },
  { id: 'success', label: 'Thành công' },
  { id: 'admin_pending', label: 'Chờ admin duyệt' },
  { id: 'failed', label: 'Thất bại' },
  { id: 'cancelled', label: 'Đã hủy' }
]

const currentHistoryTasks = computed(() => {
  const list = props.tasks
  const filtered = filterStatusHistory.value === 'all' ? list : list.filter((t) => t.status === filterStatusHistory.value)
  return [...filtered].sort((a, b) => {
    const timeA = new Date(a.executed_at || a.updated_at || a.scheduled_at).getTime()
    const timeB = new Date(b.executed_at || b.updated_at || b.scheduled_at).getTime()
    return timeB - timeA
  })
})

function getHistoryTabCount(tabId: string): number {
  if (tabId === 'all') return props.tasks.length
  return props.tasks.filter((t) => t.status === tabId).length
}

function getStatusLabel(status: string, retryCount = 0): string {
  switch (status) {
    case 'scheduled':
      return 'Chờ phát hành'
    case 'jitter_waiting':
      return 'Nghỉ Jitter'
    case 'running':
      return 'Đang đăng bài'
    case 'paused':
      return 'Tạm dừng'
    case 'success':
      return 'Thành công'
    case 'admin_pending':
      return 'Chờ admin duyệt'
    case 'retrying':
      return retryCount > 0 ? `Thử lại (${retryCount}/2)` : 'Đang thử lại'
    case 'failed':
      return 'Thất bại'
    case 'cancelled':
      return 'Đã hủy'
    case 'auth_paused':
      return 'Tạm dừng Auth'
    default:
      return status
  }
}

function getStatusTooltip(task: any): string {
  if (!task) return ''
  switch (task.status) {
    case 'admin_pending':
      return 'Bài viết đã được gửi và đang chờ Quản trị viên nhóm phê duyệt. Hệ thống không coi đây là lỗi và tiếp tục xử lý các bài khác bình thường.'
    case 'retrying':
      return `Đang chờ thử lại lần ${task.retry_count || 1}/2 do sự cố gián đoạn tạm thời.`
    case 'success':
      return task.permalink ? `Đăng bài thành công. Permalink: ${task.permalink}` : 'Đăng bài thành công'
    case 'failed':
      return task.error_message || 'Bài đăng thất bại'
    case 'scheduled':
      return 'Tác vụ đang chờ tới thời điểm phát hành'
    case 'running':
      return 'Tiến trình Worker đang thực thi đăng bài'
    case 'jitter_waiting':
      return 'Hệ thống đang nghỉ ngơi Anti-ban Jitter giữa 2 bài đăng'
    case 'paused':
      return 'Hàng đợi đang tạm dừng'
    case 'auth_paused':
      return 'Tạm dừng do cần xác thực tài khoản Facebook'
    default:
      return ''
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-[#3B82F6]/15 text-[#60A5FA] border border-[#3B82F6]/30'
    case 'jitter_waiting':
      return 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
    case 'running':
      return 'bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30 animate-pulse'
    case 'paused':
      return 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
    case 'success':
      return 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
    case 'admin_pending':
      return 'bg-[#F59E0B]/20 text-[#FBBF24] border border-[#F59E0B]/40'
    case 'retrying':
      return 'bg-[#3B82F6]/20 text-[#93C5FD] border border-[#3B82F6]/40'
    case 'failed':
    case 'auth_paused':
      return 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30'
    case 'cancelled':
      return 'bg-[#64748B]/15 text-[#94A3B8] border border-[#64748B]/30'
    default:
      return 'bg-[#1E293B] text-[#94A3B8]'
  }
}

function getStatusDotClass(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-[#3B82F6]'
    case 'jitter_waiting':
      return 'bg-[#F59E0B]'
    case 'running':
      return 'bg-[#8B5CF6] animate-ping'
    case 'paused':
      return 'bg-[#F59E0B]'
    case 'success':
      return 'bg-[#10B981]'
    case 'admin_pending':
      return 'bg-[#FBBF24]'
    case 'retrying':
      return 'bg-[#3B82F6]'
    case 'failed':
    case 'auth_paused':
      return 'bg-[#EF4444]'
    case 'cancelled':
      return 'bg-[#64748B]'
    default:
      return 'bg-[#94A3B8]'
  }
}

function formatTime(isoString?: string | null): string {
  if (!isoString) return '--:--'
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return isoString
  }
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}
</script>
