<template>
  <div class="h-full flex flex-col p-6 overflow-y-auto space-y-6">
    <div class="border-b border-[#1E293B] pb-4">
      <h1 class="text-xl font-bold text-[#F1F5F9] tracking-tight">Cài Đặt Hệ Thống</h1>
      <p class="text-xs text-[#94A3B8] mt-1">Cấu hình an toàn, giới hạn tài nguyên và bảo vệ chống checkpoint.</p>
    </div>

    <div class="max-w-2xl space-y-4">
      <!-- Setting Group 1 -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Cấu Hình An Toàn Anti-ban</h3>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Khoảng trễ Jitter ngẫu nhiên</span>
            <p class="text-[11px] text-[#64748B]">Mặc định 180s - 300s giữa các bài đăng liên tiếp.</p>
          </div>
          <span class="text-xs font-mono font-medium text-[#10B981] px-2 py-1 rounded bg-[#10B981]/15">180s - 300s</span>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Giới hạn tối đa bài đăng/ngày</span>
            <p class="text-[11px] text-[#64748B]">Cảnh báo an toàn khi vượt ngưỡng 30 bài/ngày.</p>
          </div>
          <span class="text-xs font-mono font-medium text-[#F1F5F9] px-2 py-1 rounded bg-[#0B111A] border border-[#1E293B]">30 bài</span>
        </div>
      </div>

      <!-- Setting Group 2 -->
      <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <h3 class="text-xs font-semibold text-[#F1F5F9] uppercase tracking-wider">Lưu Trữ & Bảo Mật</h3>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Mã hóa phần cứng safeStorage</span>
            <p class="text-[11px] text-[#64748B]">Bảo vệ Cookies & LocalStorage bằng DPAPI/Keychain.</p>
          </div>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/20 text-[#10B981]">
            Đã bật
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-t border-[#1E293B]/60">
          <div>
            <span class="text-xs font-medium text-[#F1F5F9]">Cơ sở dữ liệu SQLite cục bộ</span>
            <p class="text-[11px] text-[#64748B]">Chế độ Write-Ahead Logging (WAL) đảm bảo toàn vẹn dữ liệu.</p>
          </div>
          <span class="text-[11px] font-mono text-[#94A3B8]">fb_pulse.db</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
