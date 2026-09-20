<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6 select-none">
    <!-- Header & Controls -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#1E293B] pb-4">
      <div>
        <div class="flex items-center space-x-3">
          <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Điều Phối Hàng Đợi</h1>
          <span
            v-if="queueStore.isQueuePaused"
            class="px-2 py-0.5 rounded text-[11px] font-bold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40"
          >
            ⏸ Đang Tạm Dừng
          </span>
          <span
            v-else-if="queueStore.isQueueRunning"
            class="px-2 py-0.5 rounded text-[11px] font-bold bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40 animate-pulse"
          >
            ⚡ Đang Thực Thi
          </span>
          <span
            v-else-if="queueStore.isJitterWaiting"
            class="px-2 py-0.5 rounded text-[11px] font-bold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 animate-pulse"
          >
            ⏳ Nghỉ Jitter
          </span>
          <span
            v-else
            class="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
          >
            ● Sẵn Sàng
          </span>
        </div>
        <p class="text-xs text-[#94A3B8] mt-1">
          Giám sát tiến độ phát hành, máy trạng thái đơn luồng FIFO và kiểm soát an toàn tài khoản.
        </p>
      </div>

      <!-- Action Buttons & Quick Stats -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Pause / Resume Toggle Button -->
        <button
          v-if="queueStore.isQueuePaused"
          id="btn-resume-queue"
          class="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#042419] font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          :disabled="queueStore.isResumingQueue"
          @click="handleTogglePauseQueue"
        >
          <Play class="w-3.5 h-3.5 fill-current" />
          <span>{{ queueStore.isResumingQueue ? 'Đang kích hoạt...' : 'Tiếp tục hàng đợi (Resume)' }}</span>
        </button>

        <button
          v-else
          id="btn-pause-queue"
          class="px-4 py-2 rounded-lg bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 text-[#F59E0B] border border-[#F59E0B]/40 font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          :disabled="queueStore.isPausingQueue"
          @click="handleTogglePauseQueue"
        >
          <Pause class="w-3.5 h-3.5 fill-current" />
          <span>{{ queueStore.isPausingQueue ? 'Đang tạm dừng...' : 'Tạm dừng hàng đợi (Pause)' }}</span>
        </button>

        <!-- Refresh Button -->
        <button
          class="p-2 rounded-lg bg-[#131B26] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E293B] transition-all cursor-pointer"
          title="Làm mới danh sách"
          @click="refreshData"
        >
          <RotateCcw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
        </button>

        <!-- Quick Stats Pill -->
        <div class="hidden sm:flex items-center space-x-2 text-xs">
          <div class="px-3 py-1.5 rounded-lg bg-[#131B26] border border-[#1E293B] flex items-center space-x-1.5">
            <span class="text-[#94A3B8]">Chờ:</span>
            <strong class="text-[#3B82F6] font-mono">{{ queueStore.scheduledCount }}</strong>
          </div>
          <div
            v-if="queueStore.authPausedCount > 0"
            class="px-3 py-1.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 flex items-center space-x-1.5"
          >
            <span class="text-[#EF4444]">Tạm dừng Auth:</span>
            <strong class="text-[#EF4444] font-mono">{{ queueStore.authPausedCount }}</strong>
          </div>
          <div class="px-3 py-1.5 rounded-lg bg-[#131B26] border border-[#1E293B] flex items-center space-x-1.5">
            <span class="text-[#94A3B8]">Tổng:</span>
            <strong class="text-[#F1F5F9] font-mono">{{ queueStore.totalCount }}</strong>
          </div>
          <div
            v-if="settingsStore.isPowerSaveBlocked"
            id="badge-power-save-active"
            class="px-3 py-1.5 rounded-lg bg-[#10B981]/15 border border-[#10B981]/40 flex items-center space-x-1.5"
            title="Đang bật Electron powerSaveBlocker giữ máy luôn thức"
          >
            <span class="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
            <span class="text-[#10B981] font-semibold">Chống ngủ: Bật</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Wake-up Recovery Banner (Story 4.4) -->
    <div
      v-if="queueStore.isWakeupRecovering"
      id="queue-wakeup-recovery-banner"
      class="bg-[#131B26] border-2 border-[#3B82F6] rounded-xl p-5 shadow-[0_0_25px_rgba(59,130,246,0.25)] space-y-3 animate-fade-in"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div
            class="w-9 h-9 rounded-full bg-[#3B82F6]/20 border border-[#3B82F6]/50 text-[#3B82F6] flex items-center justify-center text-lg shrink-0 animate-pulse"
          >
            🔄
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#3B82F6] text-white">
                Khôi Phục Sau Khi Máy Thức Dậy
              </span>
              <span class="text-xs text-[#94A3B8]">Bảo vệ an toàn tài khoản — Tránh bắn dồn dập</span>
            </div>
            <h3 class="text-sm font-bold text-[#F1F5F9] mt-0.5">
              Phát hiện {{ queueStore.wakeupRecovery.overdueCount }} bài bị hoãn do máy ngủ — Bắt đầu phát hành an toàn sau {{ queueStore.wakeupRecovery.remainingSeconds }}s
            </h3>
          </div>
        </div>

        <div class="text-right">
          <div class="text-[10px] text-[#94A3B8] uppercase tracking-wider font-semibold">Thời gian ổn định mạng</div>
          <div id="queue-wakeup-countdown-timer" class="text-2xl font-black font-mono text-[#3B82F6] tracking-tight">
            00:{{ String(queueStore.wakeupRecovery.remainingSeconds).padStart(2, '0') }}
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="w-full bg-[#0B111A] h-2 rounded-full overflow-hidden border border-[#1E293B]">
        <div
          class="bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] h-full transition-all duration-1000 ease-linear rounded-full"
          :style="{
            width: `${
              queueStore.wakeupRecovery.totalSeconds > 0
                ? Math.round(
                    ((queueStore.wakeupRecovery.totalSeconds - queueStore.wakeupRecovery.remainingSeconds) /
                      queueStore.wakeupRecovery.totalSeconds) *
                      100
                  )
                : 0
            }%`
          }"
        ></div>
      </div>
    </div>

    <!-- Jitter Countdown Card (Story 4.2 & 4.3) -->
    <div
      v-if="queueStore.isJitterWaiting || (queueStore.isQueuePaused && queueStore.queueTick.remainingSeconds > 0)"
      id="queue-jitter-countdown-banner"
      class="bg-[#131B26] border-2 rounded-xl p-5 shadow-[0_0_25px_rgba(245,158,11,0.15)] space-y-3 animate-fade-in"
      :class="queueStore.isQueuePaused ? 'border-[#F59E0B]/60 bg-[#131B26]/80' : 'border-[#F59E0B]'"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div
            class="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
            :class="
              queueStore.isQueuePaused
                ? 'bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B]'
                : 'bg-[#F59E0B]/20 border border-[#F59E0B]/50 text-[#F59E0B]'
            "
          >
            ⏳
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                :class="queueStore.isQueuePaused ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 'bg-[#F59E0B] text-[#0B111A]'"
              >
                {{ queueStore.isQueuePaused ? 'Jitter Đang Tạm Dừng' : 'Anti-ban Jitter Đang Kích Hoạt' }}
              </span>
              <span class="text-xs text-[#94A3B8]">Giãn cách an toàn giữa 2 bài đăng</span>
            </div>
            <h3 class="text-sm font-bold text-[#F1F5F9] mt-0.5">
              {{
                queueStore.isQueuePaused
                  ? 'Hàng đợi đang tạm dừng. Bộ đếm thời gian nghỉ Jitter được bảo lưu, bấm "Tiếp tục" để đếm tiếp.'
                  : 'Hệ thống đang nghỉ ngơi ngẫu nhiên để bảo vệ tài khoản khỏi thuật toán chống bot'
              }}
            </h3>
          </div>
        </div>

        <div class="text-right">
          <div class="text-[10px] text-[#94A3B8] uppercase tracking-wider font-semibold">Thời gian còn lại</div>
          <div id="queue-countdown-timer" class="text-2xl font-black font-mono text-[#F59E0B] tracking-tight">
            {{ queueStore.queueTick.formattedCountdown }}
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="w-full bg-[#0B111A] h-2 rounded-full overflow-hidden border border-[#1E293B]">
        <div
          class="bg-gradient-to-r from-[#F59E0B] to-[#10B981] h-full transition-all duration-1000 ease-linear rounded-full"
          :style="{
            width: `${
              queueStore.queueTick.totalSeconds > 0
                ? Math.round(
                    ((queueStore.queueTick.totalSeconds - queueStore.queueTick.remainingSeconds) /
                      queueStore.queueTick.totalSeconds) *
                      100
                  )
                : 0
            }%`
          }"
        ></div>
      </div>
    </div>

    <!-- Emergency Pause Warning Box (Story 1.4 & Story 5.3) -->
    <div
      v-if="queueStore.isEmergencyPaused || queueStore.authPausedCount > 0"
      class="bg-[#131B26] border-4 border-double border-[#EF4444] rounded-xl p-5 shadow-[0_0_25px_rgba(239,68,68,0.25)] space-y-4 animate-fade-in"
      role="alert"
      aria-live="polite"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-start space-x-3.5">
          <div class="w-9 h-9 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/50 flex items-center justify-center text-[#EF4444] shrink-0 mt-0.5">
            <AlertTriangle class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#EF4444] text-[#0B111A]">
                Phòng vệ khẩn cấp (Emergency Pause)
              </span>
              <span class="text-xs text-[#94A3B8]">
                {{ queueStore.emergencyPauseTimestamp ? new Date(queueStore.emergencyPauseTimestamp).toLocaleTimeString('vi-VN') : '' }}
              </span>
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
              @click="handleResumeAuthPaused"
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

      <!-- Ảnh chụp màn hình sự cố Checkpoint minh chứng (Story 5.3) -->
      <div v-if="screenshotDataUrl" class="mt-2 pt-3 border-t border-[#EF4444]/20 flex items-center justify-between">
        <div class="flex items-center space-x-3.5">
          <div
            class="relative group cursor-pointer shrink-0 rounded-lg overflow-hidden border border-[#EF4444]/40 hover:border-[#EF4444] transition-all shadow-sm"
            title="Nhấp để xem ảnh chụp màn hình kích thước lớn"
            @click="showScreenshotModal = true"
          >
            <img
              :src="screenshotDataUrl"
              alt="Ảnh chụp màn hình Checkpoint"
              class="w-24 h-16 object-cover group-hover:scale-105 transition-transform"
            />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 class="w-4 h-4 text-white" />
            </div>
          </div>
          <div>
            <div class="flex items-center space-x-1.5 text-xs font-semibold text-[#F1F5F9]">
              <Camera class="w-3.5 h-3.5 text-[#EF4444]" />
              <span>Ảnh chụp màn hình sự cố Playwright</span>
            </div>
            <p class="text-[11px] text-[#94A3B8] mt-0.5 leading-relaxed">
              Bằng chứng xác thực tại thời điểm phát hiện Checkpoint. Bấm vào ảnh để xem chi tiết chẩn đoán lỗi.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-1 overflow-x-auto">
      <div class="flex items-center space-x-1">
        <button
          v-for="tab in filterTabs"
          :key="tab.id"
          :class="[
            'px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 cursor-pointer',
            queueStore.filterStatus === tab.id
              ? 'bg-[#1E293B] text-[#F1F5F9] shadow-sm'
              : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-[#131B26]'
          ]"
          @click="queueStore.filterStatus = tab.id"
        >
          <span>{{ tab.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px] font-mono"
            :class="
              queueStore.filterStatus === tab.id
                ? 'bg-[#0B111A] text-[#10B981]'
                : 'bg-[#1E293B]/60 text-[#64748B]'
            "
          >
            {{ getTabCount(tab.id) }}
          </span>
        </button>
      </div>

      <!-- Action helper -->
      <span class="text-[11px] text-[#64748B] hidden md:inline">
        Máy trạng thái đơn luồng FIFO • Tự động áp dụng Jitter giữa các bài
      </span>
    </div>

    <!-- Empty State -->
    <div
      v-if="queueStore.filteredTasks.length === 0"
      class="bg-[#131B26] border border-[#1E293B] rounded-xl p-10 text-center space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-[#1E293B] text-[#64748B] flex items-center justify-center mx-auto">
        <Clock class="w-6 h-6" />
      </div>
      <h3 class="text-sm font-semibold text-[#F1F5F9]">
        {{ queueStore.filterStatus === 'all' ? 'Hàng đợi đang trống' : 'Không có tác vụ nào khớp bộ lọc' }}
      </h3>
      <p class="text-xs text-[#94A3B8] max-w-sm mx-auto">
        {{
          queueStore.filterStatus === 'all'
            ? 'Chưa có chiến dịch nào được lên lịch. Hãy chuyển sang tab Soạn Thảo để bắt đầu tạo chiến dịch đầu tiên.'
            : 'Vui lòng chọn bộ lọc khác hoặc kiểm tra lại danh sách tác vụ.'
        }}
      </p>
    </div>

    <!-- Task List Table -->
    <div
      v-else
      class="bg-[#131B26] border border-[#1E293B] rounded-xl overflow-hidden shadow-lg"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-[#CBD5E1]">
          <thead class="bg-[#0B111A] text-[#94A3B8] text-[11px] uppercase tracking-wider border-b border-[#1E293B]">
            <tr>
              <th scope="col" class="py-3 px-4 font-semibold">Tác vụ / Chiến dịch</th>
              <th scope="col" class="py-3 px-4 font-semibold">Nhóm đích</th>
              <th scope="col" class="py-3 px-4 font-semibold">Nội dung</th>
              <th scope="col" class="py-3 px-4 font-semibold">Lên lịch</th>
              <th scope="col" class="py-3 px-4 font-semibold text-center">Trạng thái</th>
              <th scope="col" class="py-3 px-4 font-semibold text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#1E293B]">
            <tr
              v-for="task in queueStore.filteredTasks"
              :key="task.id"
              class="hover:bg-[#1A2333] transition-colors"
            >
              <!-- Campaign & Task Info -->
              <td class="py-3.5 px-4 font-medium text-[#F1F5F9] max-w-[180px]">
                <div class="truncate font-semibold text-sm text-[#F1F5F9]">
                  {{ task.campaign_title || 'Chiến dịch không tên' }}
                </div>
                <div class="text-[10px] text-[#64748B] font-mono mt-0.5 truncate">
                  ID: {{ task.id.slice(0, 8) }}...
                </div>
              </td>

              <!-- Target Info -->
              <td class="py-3.5 px-4 max-w-[160px]">
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
                    <div class="truncate text-xs text-[#F1F5F9] font-medium">
                      {{ task.target_name || 'Đích đăng #' + task.target_id.slice(0, 6) }}
                    </div>
                    <span class="text-[10px] text-[#64748B]">
                      {{ task.target_type === 'group' ? 'Nhóm Facebook' : 'Trang cá nhân' }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Content Excerpt & Media -->
              <td class="py-3.5 px-4 max-w-[240px]">
                <div class="line-clamp-2 text-xs text-[#CBD5E1] leading-relaxed">
                  {{ task.resolved_spintax_text }}
                </div>
                <div v-if="task.media_paths && task.media_paths.length > 0" class="flex items-center space-x-1 mt-1">
                  <span class="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] bg-[#0B111A] text-[#94A3B8] border border-[#1E293B]">
                    <ImageIcon class="w-2.5 h-2.5" />
                    <span>{{ task.media_paths.length }} ảnh</span>
                  </span>
                </div>
              </td>

              <!-- Scheduled At -->
              <td class="py-3.5 px-4 whitespace-nowrap text-xs text-[#94A3B8]">
                <div>{{ formatTime(task.scheduled_at) }}</div>
                <div class="text-[10px] text-[#64748B]">{{ formatDate(task.scheduled_at) }}</div>
              </td>

              <!-- Status Badge -->
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

              <!-- Action Buttons -->
              <td class="py-3.5 px-4 text-right whitespace-nowrap">
                <div class="flex items-center justify-end space-x-1.5">
                  <!-- Cancel Task Button (only for cancellable statuses) -->
                  <button
                    v-if="['scheduled', 'paused', 'retrying', 'jitter_waiting'].includes(task.status)"
                    class="px-2.5 py-1 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 font-medium text-[11px] transition-all cursor-pointer flex items-center space-x-1"
                    title="Hủy bài đăng này"
                    @click="handleCancelTask(task.id)"
                  >
                    <XCircle class="w-3 h-3" />
                    <span>Hủy</span>
                  </button>

                  <!-- Retry Task Button (only for failed status) -->
                  <button
                    v-if="task.status === 'failed'"
                    class="px-2.5 py-1 rounded bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] border border-[#3B82F6]/30 font-medium text-[11px] transition-all cursor-pointer flex items-center space-x-1"
                    title="Thử lại bài đăng này"
                    @click="handleRetryTask(task.id)"
                  >
                    <RotateCcw class="w-3 h-3" />
                    <span>Thử lại</span>
                  </button>

                  <!-- Open Permalink if success -->
                  <a
                    v-if="task.status === 'success' && task.permalink"
                    :href="task.permalink"
                    target="_blank"
                    class="px-2.5 py-1 rounded bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/30 font-medium text-[11px] transition-all flex items-center space-x-1"
                    title="Xem bài viết trên Facebook"
                  >
                    <ExternalLink class="w-3 h-3" />
                    <span>Xem bài</span>
                  </a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Xem Chi Tiết Ảnh Chụp Màn Hình Sự Cố (Story 5.3) -->
    <div
      v-if="showScreenshotModal && screenshotDataUrl"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fade-in"
      @click.self="showScreenshotModal = false"
    >
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div class="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between bg-[#0B111A]">
          <div class="flex items-center space-x-2">
            <Camera class="w-4 h-4 text-[#EF4444]" />
            <span class="text-sm font-semibold text-[#F1F5F9]">Bằng chứng sự cố Facebook Checkpoint</span>
          </div>
          <button
            class="text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            title="Đóng"
            @click="showScreenshotModal = false"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 overflow-auto flex items-center justify-center bg-[#0B111A]/50">
          <img
            :src="screenshotDataUrl"
            alt="Chi tiết ảnh chụp màn hình sự cố"
            class="max-w-full max-h-[75vh] rounded-lg border border-[#1E293B] object-contain shadow-lg"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Camera,
  Maximize2,
  X
} from 'lucide-vue-next'
import { useAccountStore } from '../stores/account'
import { useQueueStore } from '../stores/queue'
import { useSettingsStore } from '../stores/settings'

const accountStore = useAccountStore()
const queueStore = useQueueStore()
const settingsStore = useSettingsStore()
const isRefreshing = ref(false)
const showScreenshotModal = ref(false)
const screenshotDataUrl = ref<string | null>(null)

const emergencyScreenshotPath = computed(() => {
  if (queueStore.emergencyPauseScreenshot) return queueStore.emergencyPauseScreenshot
  const checkpointTask = queueStore.tasks.find(
    (t) => t.error_code === 'CHECKPOINT_DETECTED' && t.screenshot_path
  )
  return checkpointTask?.screenshot_path || null
})

watch(
  emergencyScreenshotPath,
  async (newPath) => {
    if (newPath && window.fbPulseAPI?.app?.getImageDataUrl) {
      try {
        const res = await window.fbPulseAPI.app.getImageDataUrl(newPath)
        if (res.success && res.data) {
          screenshotDataUrl.value = res.data
          return
        }
      } catch (err) {
        console.warn('[QueueView] Lỗi khi tải ảnh data URL:', err)
      }
    }
    screenshotDataUrl.value = null
  },
  { immediate: true }
)

const filterTabs = [
  { id: 'all', label: 'Tất cả' },
  { id: 'scheduled', label: 'Đang chờ' },
  { id: 'running', label: 'Đang chạy' },
  { id: 'paused', label: 'Tạm dừng' },
  { id: 'success', label: 'Thành công' },
  { id: 'failed', label: 'Thất bại' },
  { id: 'cancelled', label: 'Đã hủy' }
]

onMounted(async () => {
  await refreshData()
})

async function refreshData(): Promise<void> {
  isRefreshing.value = true
  try {
    await queueStore.fetchQueueStatus()
    await queueStore.fetchJitterStatus()
    await queueStore.fetchWakeupStatus()
    await queueStore.fetchTasks()
    await settingsStore.fetchSettings()
  } finally {
    isRefreshing.value = false
  }
}

async function handleTogglePauseQueue(): Promise<void> {
  if (queueStore.isQueuePaused) {
    await queueStore.resumeGeneralQueue()
  } else {
    await queueStore.pauseQueue()
  }
}

async function handleCancelTask(taskId: string): Promise<void> {
  if (confirm('Bạn có chắc chắn muốn hủy bài đăng này khỏi hàng đợi?')) {
    await queueStore.cancelTask(taskId)
  }
}

async function handleRetryTask(taskId: string): Promise<void> {
  await queueStore.retryTask(taskId)
}

async function handleReLogin(): Promise<void> {
  await accountStore.loginFacebook()
  await refreshData()
}

async function handleResumeAuthPaused(): Promise<void> {
  await queueStore.resumeAuthPaused()
}

function getTabCount(tabId: string): number {
  if (tabId === 'all') return queueStore.tasks.length
  return queueStore.tasks.filter((t) => t.status === tabId).length
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

function formatTime(isoString: string): string {
  if (!isoString) return '--:--'
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return isoString
  }
}

function formatDate(isoString: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}
</script>
