<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <div class="flex items-center justify-between border-b border-[#1E293B] pb-4">
      <div>
        <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Điều Phối Hàng Đợi</h1>
        <p class="text-xs text-[#94A3B8] mt-1">Giám sát tiến độ phát hành, bộ đếm Anti-ban Jitter và lịch sử xuất bản.</p>
      </div>
    </div>

    <!-- Empty State / Placeholder -->
    <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-8 text-center space-y-3">
      <div class="w-12 h-12 rounded-full bg-[#10B981]/15 text-[#10B981] flex items-center justify-center mx-auto">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 class="text-sm font-semibold text-[#F1F5F9]">Hàng đợi đang trống</h3>
      <p class="text-xs text-[#94A3B8] max-w-sm mx-auto">
        Chưa có chiến dịch nào được lên lịch. Hãy chuyển sang tab Soạn Thảo để bắt đầu tạo chiến dịch đầu tiên.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
