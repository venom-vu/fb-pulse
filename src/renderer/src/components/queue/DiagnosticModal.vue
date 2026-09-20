<template>
  <div>
    <!-- Modal Chẩn Đoán Lỗi Bài Viết Thất Bại (Story 5.4) -->
    <div
      v-if="show && task"
      id="diagnostic-modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      @click.self="handleClose"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <!-- Header Modal -->
        <div class="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between bg-[#0B111A]">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-lg bg-[#EF4444]/20 border border-[#EF4444]/40 flex items-center justify-center text-[#EF4444]">
              <AlertTriangle class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-[#F1F5F9]">Chẩn Đoán Sự Cố Đăng Bài</h3>
              <p class="text-[11px] text-[#94A3B8]">Chi tiết lỗi và ảnh chụp màn hình Playwright capture tại thời điểm xảy ra sự cố</p>
            </div>
          </div>
          <button
            id="btn-close-diagnostic-modal"
            class="text-[#94A3B8] hover:text-white p-1 rounded-lg hover:bg-[#1E293B] transition-colors cursor-pointer"
            title="Đóng"
            @click="handleClose"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Body Modal -->
        <div class="p-5 overflow-y-auto space-y-4 text-xs">
          <!-- Info Grid -->
          <div class="grid grid-cols-2 gap-3 bg-[#0B111A] p-3.5 rounded-lg border border-[#1E293B]">
            <div>
              <span class="text-[#64748B] text-[11px]">Chiến dịch:</span>
              <p class="text-[#F1F5F9] font-medium truncate">{{ task.campaign_title || 'Chiến dịch không tên' }}</p>
            </div>
            <div>
              <span class="text-[#64748B] text-[11px]">Đích đăng:</span>
              <p class="text-[#F1F5F9] font-medium truncate">{{ task.target_name || task.target_id }}</p>
            </div>
            <div>
              <span class="text-[#64748B] text-[11px]">Thời điểm xảy ra sự cố:</span>
              <p class="text-[#CBD5E1] font-mono">{{ formatDateTime(task.executed_at || task.updated_at) }}</p>
            </div>
            <div>
              <span class="text-[#64748B] text-[11px]">Mã lỗi (Error Code):</span>
              <p id="diagnostic-error-code" class="text-[#EF4444] font-mono font-bold">{{ task.error_code || 'UNKNOWN_ERROR' }}</p>
            </div>
            <div class="col-span-2 pt-2 border-t border-[#1E293B]">
              <span class="text-[#64748B] text-[11px]">Thông báo lỗi chi tiết:</span>
              <p id="diagnostic-error-message" class="text-[#EF4444] font-medium mt-0.5 leading-relaxed bg-[#EF4444]/10 p-2.5 rounded border border-[#EF4444]/20">
                {{ task.error_message || 'Không có thông báo lỗi chi tiết' }}
              </p>
            </div>
          </div>

          <!-- Screenshot Section -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-[#F1F5F9] flex items-center space-x-1.5">
                <Camera class="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Ảnh chụp màn hình sự cố (Playwright Screenshot)</span>
              </span>
              <span v-if="diagnosticScreenshotUrl" class="text-[10px] text-[#64748B]">
                Nhấp vào ảnh để phóng to
              </span>
            </div>

            <div
              v-if="isLoadingDiagnosticScreenshot"
              class="h-44 rounded-lg bg-[#0B111A] border border-[#1E293B] flex items-center justify-center text-[#94A3B8]"
            >
              <RotateCcw class="w-5 h-5 animate-spin mr-2" />
              <span>Đang tải ảnh chụp sự cố...</span>
            </div>

            <div
              v-else-if="diagnosticScreenshotUrl"
              id="diagnostic-screenshot-container"
              class="relative group rounded-lg overflow-hidden border border-[#1E293B] bg-[#0B111A] cursor-pointer"
              @click="showZoomedScreenshot = true"
            >
              <img
                :src="diagnosticScreenshotUrl"
                alt="Ảnh chụp màn hình sự cố"
                class="w-full max-h-64 object-contain bg-black/40"
              />
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <div class="px-3 py-1.5 rounded-lg bg-[#0B111A]/80 text-white text-xs flex items-center space-x-1.5 border border-white/20">
                  <Maximize2 class="w-3.5 h-3.5" />
                  <span>Phóng to toàn màn hình</span>
                </div>
              </div>
            </div>

            <div
              v-else
              id="diagnostic-no-screenshot"
              class="p-6 rounded-lg bg-[#0B111A] border border-[#1E293B] text-center text-[#64748B] space-y-1"
            >
              <Camera class="w-6 h-6 mx-auto text-[#475569]" />
              <p class="text-xs text-[#94A3B8]">Không có ảnh chụp màn hình sự cố</p>
              <p class="text-[10px]">Tác vụ này có thể gặp lỗi trước khi kịp chụp màn hình hoặc file ảnh không còn tồn tại trên máy.</p>
            </div>
          </div>
        </div>

        <!-- Footer Modal -->
        <div class="px-5 py-3 border-t border-[#1E293B] flex items-center justify-between bg-[#0B111A]">
          <button
            class="px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] text-xs font-semibold transition-all cursor-pointer"
            @click="handleClose"
          >
            Đóng
          </button>

          <button
            id="btn-modal-retry-task"
            class="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            @click="handleRetry"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Thử lại bài đăng này</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Phóng To Ảnh Chụp Màn Hình Chẩn Đoán -->
    <div
      v-if="showZoomedScreenshot && diagnosticScreenshotUrl"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-fade-in"
      @click.self="showZoomedScreenshot = false"
    >
      <div class="relative max-w-5xl max-h-[95vh] flex flex-col">
        <button
          class="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/70 text-white hover:bg-black transition-colors cursor-pointer"
          title="Đóng phóng to"
          @click="showZoomedScreenshot = false"
        >
          <X class="w-5 h-5" />
        </button>
        <img
          :src="diagnosticScreenshotUrl"
          alt="Ảnh chụp màn hình phóng to"
          class="max-w-full max-h-[90vh] rounded-lg border border-[#1E293B] object-contain shadow-2xl"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  AlertTriangle,
  Camera,
  RotateCcw,
  Maximize2,
  X
} from 'lucide-vue-next'
import type { TaskDTO } from '../../../../preload/types'

interface Props {
  show: boolean
  task: TaskDTO | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry', taskId: string): void
}>()

const diagnosticScreenshotUrl = ref<string | null>(null)
const isLoadingDiagnosticScreenshot = ref(false)
const showZoomedScreenshot = ref(false)

watch(
  () => [props.show, props.task] as const,
  async ([show, task]) => {
    if (!show || !task) {
      diagnosticScreenshotUrl.value = null
      showZoomedScreenshot.value = false
      return
    }

    diagnosticScreenshotUrl.value = null
    showZoomedScreenshot.value = false

    if (task.screenshot_path && window.fbPulseAPI?.app?.getImageDataUrl) {
      isLoadingDiagnosticScreenshot.value = true
      try {
        const res = await window.fbPulseAPI.app.getImageDataUrl(task.screenshot_path)
        if (res.success && res.data) {
          diagnosticScreenshotUrl.value = res.data
        }
      } catch (err) {
        console.warn('[DiagnosticModal] Không thể tải ảnh chẩn đoán:', err)
      } finally {
        isLoadingDiagnosticScreenshot.value = false
      }
    }
  },
  { immediate: true }
)

function handleClose(): void {
  showZoomedScreenshot.value = false
  emit('close')
}

function handleRetry(): void {
  if (props.task) {
    emit('retry', props.task.id)
    handleClose()
  }
}

function formatDateTime(isoString?: string | null): string {
  if (!isoString) return 'Chưa ghi nhận'
  try {
    const d = new Date(isoString)
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  } catch {
    return isoString
  }
}
</script>
