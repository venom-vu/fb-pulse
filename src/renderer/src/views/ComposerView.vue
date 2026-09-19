<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Soạn Thảo Chiến Dịch</h1>
        <p class="text-xs text-[#94A3B8] mt-1">Tạo bài viết với Spintax đa cấp, đính kèm media và lập lịch đăng tự động.</p>
      </div>
      <div class="flex items-center space-x-2">
        <button
          class="px-3 py-2 rounded-md bg-[#131B26] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] font-medium text-xs border border-[#1E293B] transition-all flex items-center space-x-1.5 cursor-pointer"
          @click="showImportModal = true"
        >
          <span>📥 Import Cookie JSON</span>
        </button>
        <button
          class="px-4 py-2 rounded-md bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 disabled:cursor-not-allowed text-[#042419] font-bold text-xs shadow-[0_4px_14px_rgba(16,185,129,0.35)] transition-all flex items-center space-x-2 cursor-pointer"
          :disabled="accountStore.isLoggingIn"
          @click="connectFacebook"
        >
          <svg
            v-if="accountStore.isLoggingIn"
            class="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-[#042419]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span v-if="accountStore.isLoggingIn">Đang mở trình duyệt...</span>
          <span v-else-if="accountStore.account">⚡ Đổi tài khoản Facebook</span>
          <span v-else>⚡ Kết nối Facebook</span>
        </button>
      </div>
    </div>

    <!-- Modal Import Cookie JSON -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-[#1E293B] pb-3">
          <h3 class="text-sm font-bold text-[#F1F5F9]">Nhập Cookie / Session JSON Facebook</h3>
          <button
            class="text-[#64748B] hover:text-[#F1F5F9] text-sm cursor-pointer"
            @click="closeModal"
          >
            ✕
          </button>
        </div>
        <p class="text-xs text-[#94A3B8]">
          Dán mảng Cookie JSON hoặc đối tượng storageState. Yêu cầu chứa cookie xác thực
          <code class="text-[#10B981]">c_user</code> và <code class="text-[#10B981]">xs</code>.
        </p>
        <textarea
          v-model="modalJsonInput"
          rows="5"
          class="w-full rounded-lg bg-[#0B111A] border border-[#1E293B] focus:border-[#10B981] p-3 text-xs font-mono text-[#F1F5F9] placeholder-[#64748B] outline-none"
          placeholder='[{"name":"c_user","value":"..."},{"name":"xs","value":"..."}]'
        ></textarea>
        <div
          v-if="modalError"
          class="text-xs p-2.5 rounded bg-[#EF4444]/15 border border-[#EF4444]/30 text-[#EF4444]"
        >
          {{ modalError }}
        </div>
        <div class="flex items-center justify-end space-x-2 pt-2">
          <button
            class="px-3 py-1.5 rounded bg-[#0B111A] hover:bg-[#1E293B] text-[#94A3B8] text-xs font-medium border border-[#1E293B] cursor-pointer"
            @click="closeModal"
          >
            Hủy bỏ
          </button>
          <button
            class="px-4 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-[#042419] text-xs font-bold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] disabled:opacity-50 cursor-pointer"
            :disabled="!modalJsonInput.trim() || isImporting"
            @click="submitModalImport"
          >
            <span v-if="isImporting">Đang xử lý...</span>
            <span v-else>Xác nhận Import</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Cảnh Báo Ngưỡng An Toàn 30 Bài/Ngày (Story 4.2) -->
    <div
      v-if="composerStore.showDailyLimitModal"
      id="daily-limit-warning-modal"
      class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-labelledby="daily-limit-modal-title"
    >
      <div class="bg-[#131B26] border-2 border-[#F59E0B] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.25)]">
        <div class="flex items-start space-x-3.5 border-b border-[#1E293B] pb-4">
          <div class="w-10 h-10 rounded-full bg-[#F59E0B]/20 border border-[#F59E0B]/50 flex items-center justify-center text-[#F59E0B] text-xl shrink-0">
            ⚠️
          </div>
          <div class="flex-1">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#F59E0B] text-[#0B111A]">
                Cảnh báo tư vấn an toàn
              </span>
              <span class="text-xs text-[#94A3B8]">Ngưỡng khuyến nghị Meta: 30 bài / 24h</span>
            </div>
            <h3 id="daily-limit-modal-title" class="text-sm font-bold text-[#F1F5F9] mt-1">
              Tổng số bài đăng trong 24 giờ sẽ vượt quá 30 bài!
            </h3>
          </div>
        </div>

        <div class="text-xs space-y-2.5 text-[#CBD5E1] bg-[#0B111A] p-3.5 rounded-lg border border-[#1E293B]">
          <div class="flex items-center justify-between">
            <span class="text-[#94A3B8]">Số bài đã lên lịch / đăng trong 24h qua:</span>
            <strong class="font-mono text-[#F1F5F9]">{{ composerStore.dailyLimitData?.currentCount ?? 0 }} bài</strong>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[#94A3B8]">Số bài trong chiến dịch sắp tạo:</span>
            <strong class="font-mono text-[#10B981]">+{{ composerStore.dailyLimitData?.incomingCount ?? composerStore.selectedTargetsCount }} bài</strong>
          </div>
          <div class="flex items-center justify-between border-t border-[#1E293B] pt-2 text-[#F59E0B]">
            <span class="font-semibold">Tổng số bài dự kiến trong 24 giờ:</span>
            <strong class="font-mono text-sm">{{ composerStore.dailyLimitData?.totalCount ?? 0 }} / 30 bài</strong>
          </div>
        </div>

        <p class="text-xs text-[#94A3B8] leading-relaxed">
          Việc đăng quá 30 bài trong vòng 24 giờ có thể kích hoạt cơ chế kiểm duyệt tự động của Facebook, làm tăng rủi ro tài khoản bị yêu cầu checkpoint hoặc tạm khóa tính năng đăng bài nhóm.
        </p>

        <div class="flex items-center space-x-2 pt-1 select-none">
          <input
            id="dont-remind-checkbox"
            v-model="composerStore.dontRemindToday"
            type="checkbox"
            class="accent-[#F59E0B] w-4 h-4 cursor-pointer"
          />
          <label for="dont-remind-checkbox" class="text-xs text-[#CBD5E1] cursor-pointer">
            Không nhắc lại cảnh báo này trong ngày hôm nay
          </label>
        </div>

        <div class="flex items-center justify-end space-x-3 pt-2">
          <button
            id="btn-cancel-daily-warning"
            class="px-4 py-2 rounded-lg bg-[#0B111A] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] text-xs font-medium border border-[#1E293B] transition-all cursor-pointer"
            @click="composerStore.closeDailyLimitModal()"
          >
            Hủy bỏ & Điều chỉnh
          </button>
          <button
            id="btn-confirm-risk-and-proceed"
            class="px-4 py-2 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-[#0B111A] text-xs font-bold transition-all shadow-[0_2px_10px_rgba(245,158,11,0.3)] cursor-pointer"
            @click="handleConfirmRiskAndProceed"
          >
            Tôi đã hiểu rủi ro & Tiếp tục
          </button>
        </div>
      </div>
    </div>

    <!-- 2-Panel Split Studio Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Panel: Khung Soạn Thảo Spintax -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-[#1E293B]/60 pb-3">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Khung Soạn Thảo</span>
            <span
              v-if="composerStore.spintaxError"
              class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40"
            >
              Lỗi Cú Pháp
            </span>
            <span
              v-else-if="composerStore.content.trim()"
              class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
            >
              Cú Pháp Hợp Lệ
            </span>
          </div>
          <span class="text-[11px] text-[#64748B] font-mono">Spintax Ready</span>
        </div>

        <!-- Spintax Toolbar -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <button
              id="btn-insert-spintax"
              class="px-3 py-1.5 rounded-md bg-[#0B111A] hover:bg-[#1E293B] text-[#CBD5E1] hover:text-[#F1F5F9] font-medium text-xs border border-[#1E293B] transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
              title="Chèn mẫu {lựa chọn 1|lựa chọn 2} tại vị trí con trỏ"
              @click="handleInsertSpintax"
            >
              <span class="text-[#10B981] font-bold text-sm leading-none">＋</span>
              <span>Chèn Spintax</span>
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <button
              id="btn-test-spintax"
              class="px-3 py-1.5 rounded-md bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] font-semibold text-xs border border-[#10B981]/40 transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="composerStore.isTestingVariant || !composerStore.content.trim()"
              title="Thử nghiệm ngẫu nhiên một biến thể mới (Phím tắt: ⌘R hoặc Ctrl+R)"
              @click="handleTestSpintax"
            >
              <span :class="{ 'animate-spin': composerStore.isTestingVariant }">🎲</span>
              <span>Thử nghiệm Spintax</span>
              <span class="text-[10px] text-[#10B981]/70 font-mono hidden sm:inline">(⌘R)</span>
            </button>
          </div>
        </div>

        <!-- Textarea Editor with Monospace Font -->
        <div class="space-y-2">
          <textarea
            id="composer-textarea"
            ref="textareaRef"
            :value="composerStore.content"
            rows="8"
            class="w-full rounded-lg bg-[#0B111A] p-3.5 text-xs font-mono text-[#F1F5F9] placeholder-[#64748B] outline-none transition-all resize-y min-h-[160px] leading-relaxed"
            :class="[
              composerStore.spintaxError
                ? 'border-2 border-[#F59E0B] focus:border-[#F59E0B] ring-1 ring-[#F59E0B]/30'
                : 'border border-[#1E293B] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]/30'
            ]"
            placeholder="Nhập nội dung bài viết. Sử dụng cú pháp {lựa chọn 1|lựa chọn 2|...} để xáo trộn biến thể ngẫu nhiên cho từng nhóm..."
            @input="onTextareaInput"
          ></textarea>

          <!-- Spintax Error Alert Badge -->
          <div
            v-if="composerStore.spintaxError"
            id="spintax-error-badge"
            class="flex items-center space-x-2 text-xs p-2.5 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] animate-fadeIn"
          >
            <span class="text-sm">⚠️</span>
            <div class="flex-1 font-medium">
              <span class="font-bold">Cảnh báo cú pháp Spintax:</span> {{ composerStore.spintaxError }}
            </div>
          </div>

          <!-- Bottom Editor Meta Info -->
          <div class="flex items-center justify-between text-[11px] text-[#64748B] pt-1">
            <span>{{ composerStore.content.length }} ký tự</span>
            <span class="font-mono">Phím tắt: <kbd class="px-1 py-0.5 rounded bg-[#0B111A] border border-[#1E293B] text-[#94A3B8]">⌘R</kbd> thử biến thể</span>
          </div>
        </div>

        <!-- Media Dropzone (Story 3.2) -->
        <MediaDropzone />

        <!-- Khung Điều Khiển Lên Lịch & Launch CTA (Story 4.1) -->
        <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-4 shadow-sm">
          <div class="flex items-center justify-between border-b border-[#1E293B]/60 pb-2.5">
            <span class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Thời Điểm Phát Hành</span>
            <span class="text-[11px] text-[#10B981] font-mono font-medium">Tự động thu xuống Tray</span>
          </div>

          <!-- Schedule Options: Chạy ngay vs Hẹn giờ -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              class="flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-xs select-none"
              :class="[
                composerStore.scheduleMode === 'immediate'
                  ? 'bg-[#10B981]/10 border-[#10B981] text-[#F1F5F9]'
                  : 'bg-[#0B111A] border-[#1E293B] text-[#94A3B8] hover:border-[#334155]'
              ]"
            >
              <input
                type="radio"
                name="scheduleMode"
                value="immediate"
                :checked="composerStore.scheduleMode === 'immediate'"
                class="accent-[#10B981] cursor-pointer"
                @change="composerStore.scheduleMode = 'immediate'"
              />
              <div class="flex flex-col">
                <span class="font-semibold">⚡ Chạy ngay (Immediate)</span>
                <span class="text-[10px] text-[#64748B]">Bắt đầu đưa vào hàng đợi ngay</span>
              </div>
            </label>

            <label
              class="flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-xs select-none"
              :class="[
                composerStore.scheduleMode === 'scheduled'
                  ? 'bg-[#10B981]/10 border-[#10B981] text-[#F1F5F9]'
                  : 'bg-[#0B111A] border-[#1E293B] text-[#94A3B8] hover:border-[#334155]'
              ]"
            >
              <input
                type="radio"
                name="scheduleMode"
                value="scheduled"
                :checked="composerStore.scheduleMode === 'scheduled'"
                class="accent-[#10B981] cursor-pointer"
                @change="composerStore.scheduleMode = 'scheduled'"
              />
              <div class="flex flex-col">
                <span class="font-semibold">⏰ Hẹn giờ phát hành</span>
                <span class="text-[10px] text-[#64748B]">Chọn ngày giờ bắt đầu chạy</span>
              </div>
            </label>
          </div>

          <!-- Datetime picker if scheduled -->
          <div v-if="composerStore.scheduleMode === 'scheduled'" class="animate-fadeIn space-y-1.5">
            <label class="block text-[11px] font-medium text-[#94A3B8]">
              Thời gian bắt đầu phát hành (Tương lai):
            </label>
            <input
              id="schedule-datetime-input"
              v-model="composerStore.scheduledAt"
              type="datetime-local"
              :min="minScheduledDateTime"
              class="w-full rounded-lg bg-[#0B111A] border border-[#1E293B] focus:border-[#10B981] px-3 py-2 text-xs font-mono text-[#F1F5F9] outline-none transition-all"
            />
          </div>

          <!-- Anti-ban Jitter Configuration (Story 4.2) -->
          <div class="p-3.5 rounded-lg bg-[#0B111A] border border-[#1E293B] space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-semibold text-[#F1F5F9]">🛡️ Động Cơ Anti-ban Jitter</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#10B981]/20 text-[#10B981]">
                  {{ composerStore.minJitterSec }}s – {{ composerStore.maxJitterSec }}s
                </span>
              </div>
              <span class="text-[10px] text-[#64748B] font-mono">Tối thiểu 60s</span>
            </div>

            <p class="text-[11px] text-[#94A3B8] leading-relaxed">
              Tự động áp dụng khoảng nghỉ ngẫu nhiên an toàn giữa các bài đăng liên tiếp để bảo vệ tài khoản khỏi thuật toán chống bot của Facebook.
            </p>

            <div class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block text-[10px] font-medium text-[#94A3B8] mb-1">
                  Nghỉ tối thiểu (giây):
                </label>
                <input
                  id="min-jitter-input"
                  type="number"
                  min="60"
                  step="10"
                  :value="composerStore.minJitterSec"
                  @input="handleMinJitterChange"
                  class="w-full rounded-md bg-[#131B26] border border-[#1E293B] focus:border-[#10B981] px-2.5 py-1.5 text-xs font-mono text-[#F1F5F9] outline-none"
                />
              </div>
              <div>
                <label class="block text-[10px] font-medium text-[#94A3B8] mb-1">
                  Nghỉ tối đa (giây):
                </label>
                <input
                  id="max-jitter-input"
                  type="number"
                  :min="composerStore.minJitterSec"
                  step="10"
                  :value="composerStore.maxJitterSec"
                  @input="handleMaxJitterChange"
                  class="w-full rounded-md bg-[#131B26] border border-[#1E293B] focus:border-[#10B981] px-2.5 py-1.5 text-xs font-mono text-[#F1F5F9] outline-none"
                />
              </div>
            </div>
          </div>

          <!-- CTA Button: ⚡ Lên lịch chiến dịch -->
          <button
            id="btn-launch-campaign"
            class="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed text-[#042419] font-bold text-sm shadow-[0_4px_16px_rgba(16,185,129,0.35)] transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
            :disabled="
              composerStore.isSubmitting ||
              !composerStore.content.trim() ||
              !!composerStore.spintaxError ||
              composerStore.selectedTargetIds.length === 0
            "
            @click="handleLaunchCampaign"
          >
            <svg
              v-if="composerStore.isSubmitting"
              class="animate-spin -ml-1 mr-2 h-4 w-4 text-[#042419]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span v-if="composerStore.isSubmitting">Đang lưu chiến dịch & phân rã hàng đợi...</span>
            <span v-else>⚡ Lên lịch chiến dịch (Tự động thu xuống Tray)</span>
            <span class="text-[11px] opacity-75 font-mono hidden sm:inline">(⌘Enter)</span>
          </button>
        </div>
      </div>

      <!-- Right Panel: Target Selector & Facebook Live Preview (Story 3.3) -->
      <div class="space-y-6">
        <!-- Target Groups Selector (Compact) -->
        <TargetSelectorCompact />

        <!-- Facebook Live Preview Card -->
        <FacebookLivePreview />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAccountStore } from '../stores/account'
import { useComposerStore } from '../stores/composer'
import MediaDropzone from '../components/composer/MediaDropzone.vue'
import TargetSelectorCompact from '../components/composer/TargetSelectorCompact.vue'
import FacebookLivePreview from '../components/composer/FacebookLivePreview.vue'

const accountStore = useAccountStore()
const composerStore = useComposerStore()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showImportModal = ref(false)
const modalJsonInput = ref('')
const isImporting = ref(false)
const modalError = ref('')

const minScheduledDateTime = computed(() => {
  const now = new Date(Date.now() + 60000) // Tối thiểu sau 1 phút
  return now.toISOString().slice(0, 16)
})

function closeModal(): void {
  showImportModal.value = false
  modalJsonInput.value = ''
  modalError.value = ''
}

async function submitModalImport(): Promise<void> {
  if (!modalJsonInput.value.trim()) return
  isImporting.value = true
  modalError.value = ''

  try {
    const res = await accountStore.importSessionJson(modalJsonInput.value)
    if (res.success) {
      closeModal()
    } else {
      modalError.value = res.error || 'Lỗi khi nhập Cookie JSON'
    }
  } catch (err: any) {
    modalError.value = err?.message || 'Có lỗi xảy ra'
  } finally {
    isImporting.value = false
  }
}

async function connectFacebook(): Promise<void> {
  await accountStore.loginFacebook()
}

function onTextareaInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  composerStore.setContent(target.value)
}

function handleInsertSpintax(): void {
  composerStore.insertSpintaxPattern(textareaRef.value)
}

async function handleTestSpintax(): Promise<void> {
  await composerStore.testSpintaxVariant()
}

function handleMinJitterChange(event: Event): void {
  const target = event.target as HTMLInputElement
  composerStore.setMinJitter(Number(target.value))
}

function handleMaxJitterChange(event: Event): void {
  const target = event.target as HTMLInputElement
  composerStore.setMaxJitter(Number(target.value))
}

async function handleConfirmRiskAndProceed(): Promise<void> {
  if (composerStore.dontRemindToday) {
    composerStore.suppressDailyWarning()
  }
  composerStore.closeDailyLimitModal()
  await composerStore.createCampaign(true)
}

async function handleLaunchCampaign(): Promise<void> {
  await composerStore.createCampaign()
}

function handleGlobalKeydown(e: KeyboardEvent): void {
  // Lắng nghe ⌘R (macOS) hoặc Ctrl+R (Windows/Linux) thử biến thể
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    handleTestSpintax()
  }

  // Lắng nghe ⌘Enter (macOS) hoặc Ctrl+Enter (Windows/Linux) lên lịch chiến dịch
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleLaunchCampaign()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>
