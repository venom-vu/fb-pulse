<template>
  <div class="bg-[#131B26] border border-[#1E293B] rounded-xl p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#1E293B]/60 pb-2.5">
      <div class="flex items-center space-x-2">
        <span class="text-xs font-bold text-[#F1F5F9] uppercase tracking-wider">Facebook Live Preview</span>
        <span class="text-[11px] text-[#10B981] font-mono font-medium">Mô Phỏng Trực Quan</span>
      </div>
      <div class="flex items-center space-x-2">
        <button
          id="btn-preview-test-spintax"
          type="button"
          class="px-2.5 py-1 rounded bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] font-semibold text-xs border border-[#10B981]/40 transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="composerStore.isTestingVariant || !composerStore.content.trim()"
          title="Thử nghiệm ngẫu nhiên một biến thể mới (⌘R hoặc Ctrl+R)"
          @click="handleTestVariant"
        >
          <span :class="{ 'animate-spin': composerStore.isTestingVariant }">🎲</span>
          <span>Thử Spintax</span>
          <span class="text-[10px] text-[#10B981]/70 font-mono hidden sm:inline">(⌘R)</span>
        </button>
      </div>
    </div>

    <!-- Live Post Card Frame -->
    <div
      id="facebook-card-preview"
      class="bg-[#182230] border border-[#2B3A4F] rounded-lg overflow-hidden transition-all shadow-lg"
    >
      <!-- Post Header: Avatar, Name, Target, Timestamp -->
      <div class="p-3.5 flex items-center space-x-3">
        <!-- Avatar -->
        <div class="relative shrink-0">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="Avatar"
            class="w-9 h-9 rounded-full object-cover border border-[#10B981]/40"
          />
          <div
            v-else
            class="w-9 h-9 rounded-full bg-[#10B981] text-[#042419] font-bold text-sm flex items-center justify-center shadow-inner"
          >
            {{ authorInitial }}
          </div>
          <div
            class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981] border-2 border-[#182230]"
            title="Đang hoạt động"
          ></div>
        </div>

        <!-- User Info & Target -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-1.5">
            <span class="font-bold text-xs text-[#F1F5F9] truncate">{{ authorName }}</span>
            <span
              v-if="accountStore.account"
              class="text-[10px] text-[#10B981] font-semibold px-1 rounded bg-[#10B981]/15"
            >
              ✓
            </span>
          </div>
          <div class="text-[11px] text-[#94A3B8] flex items-center space-x-1 truncate mt-0.5">
            <span>Vừa xong</span>
            <span>·</span>
            <span class="text-[#38BDF8] font-medium truncate" :title="targetDisplayName">
              {{ targetDisplayName }}
            </span>
            <span>·</span>
            <span class="text-xs" title="Công khai">🌐</span>
          </div>
        </div>
      </div>

      <!-- Post Content (Text / Spintax Variant) -->
      <div class="px-3.5 pb-3">
        <!-- Khi có Spintax Error -->
        <div
          v-if="composerStore.spintaxError"
          class="p-2.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-xs flex items-center space-x-2"
        >
          <span>⚠️</span>
          <span>Cú pháp Spintax chưa hợp lệ. Vui lòng kiểm tra lại khung soạn thảo.</span>
        </div>

        <!-- Khi có nội dung bài viết -->
        <div
          v-else-if="previewContent"
          id="facebook-post-text"
          class="text-xs text-[#E2E8F0] whitespace-pre-wrap leading-relaxed select-text font-sans transition-opacity duration-200"
          :class="{ 'opacity-60': composerStore.isTestingVariant }"
        >
          {{ previewContent }}
        </div>

        <!-- Khi trống nội dung -->
        <div
          v-else
          class="text-xs text-[#64748B] italic py-2"
        >
          Chưa có nội dung bài viết. Hãy nhập văn bản ở khung soạn thảo bên trái...
        </div>
      </div>

      <!-- Post Media (Collage Grid) -->
      <div v-if="mediaCount > 0" id="facebook-media-preview-container" class="border-t border-[#2B3A4F]/60">
        <!-- 1 Image: Full Width -->
        <div v-if="mediaCount === 1" class="w-full h-60 bg-[#0B111A] overflow-hidden">
          <img
            :src="mediaItems[0].previewUrl"
            :alt="mediaItems[0].name"
            class="w-full h-full object-cover"
          />
        </div>

        <!-- 2 Images: 50% - 50% Two Columns -->
        <div v-else-if="mediaCount === 2" class="grid grid-cols-2 gap-0.5 h-60 bg-[#0B111A] overflow-hidden">
          <div class="h-full overflow-hidden">
            <img
              :src="mediaItems[0].previewUrl"
              :alt="mediaItems[0].name"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="h-full overflow-hidden">
            <img
              :src="mediaItems[1].previewUrl"
              :alt="mediaItems[1].name"
              class="w-full h-full object-cover"
            />
          </div>
        </div>

        <!-- 3 Images: 2/3 Main Left + 2 Rows Right -->
        <div v-else-if="mediaCount === 3" class="grid grid-cols-3 gap-0.5 h-60 bg-[#0B111A] overflow-hidden">
          <div class="col-span-2 h-full overflow-hidden">
            <img
              :src="mediaItems[0].previewUrl"
              :alt="mediaItems[0].name"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="col-span-1 grid grid-rows-2 gap-0.5 h-full overflow-hidden">
            <div class="h-full overflow-hidden">
              <img
                :src="mediaItems[1].previewUrl"
                :alt="mediaItems[1].name"
                class="w-full h-full object-cover"
              />
            </div>
            <div class="h-full overflow-hidden">
              <img
                :src="mediaItems[2].previewUrl"
                :alt="mediaItems[2].name"
                class="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        <!-- 4 Images: Collage with 2/3 Main Left + 2 Rows Right with +1 Overlay -->
        <div v-else-if="mediaCount === 4" class="grid grid-cols-3 gap-0.5 h-60 bg-[#0B111A] overflow-hidden">
          <div class="col-span-2 h-full overflow-hidden">
            <img
              :src="mediaItems[0].previewUrl"
              :alt="mediaItems[0].name"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="col-span-1 grid grid-rows-2 gap-0.5 h-full overflow-hidden">
            <div class="h-full overflow-hidden">
              <img
                :src="mediaItems[1].previewUrl"
                :alt="mediaItems[1].name"
                class="w-full h-full object-cover"
              />
            </div>
            <div class="relative h-full overflow-hidden">
              <img
                :src="mediaItems[2].previewUrl"
                :alt="mediaItems[2].name"
                class="w-full h-full object-cover"
              />
              <!-- +1 Overlay for the 4th image -->
              <div
                class="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center text-white font-bold text-sm tracking-wide"
              >
                +1 ảnh
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Post Footer: Mock Facebook Interactions (Like, Comment, Share) -->
      <div class="px-3.5 py-2.5 border-t border-[#2B3A4F]/60 flex items-center justify-between text-xs text-[#94A3B8]">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-1.5 hover:text-[#10B981] transition-colors cursor-default">
            <span>👍</span>
            <span class="font-medium">Thích</span>
          </div>
          <div class="flex items-center space-x-1.5 hover:text-[#10B981] transition-colors cursor-default">
            <span>💬</span>
            <span class="font-medium">Bình luận</span>
          </div>
          <div class="flex items-center space-x-1.5 hover:text-[#10B981] transition-colors cursor-default">
            <span>↗️</span>
            <span class="font-medium">Chia sẻ</span>
          </div>
        </div>
        <span class="text-[10px] text-[#64748B] font-mono">Facebook Card Mockup</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAccountStore } from '../../stores/account'
import { useComposerStore } from '../../stores/composer'
import { useTargetsStore } from '../../stores/targets'

const accountStore = useAccountStore()
const composerStore = useComposerStore()
const targetsStore = useTargetsStore()

const authorName = computed(() => {
  return accountStore.account?.name || 'Tài khoản Facebook'
})

const avatarUrl = computed(() => {
  return accountStore.account?.avatar_url || null
})

const authorInitial = computed(() => {
  const name = authorName.value.trim()
  return name ? name.charAt(0).toUpperCase() : 'U'
})

const targetDisplayName = computed(() => {
  const selectedIds = composerStore.selectedTargetIds
  if (selectedIds.length === 0) {
    return 'Chưa chọn nhóm đích'
  }

  const firstId = selectedIds[0]

  // Check if profile
  if (targetsStore.profileTarget && targetsStore.profileTarget.id === firstId) {
    const extra = selectedIds.length > 1 ? ` (+${selectedIds.length - 1} nhóm)` : ''
    return `Trang cá nhân${extra}`
  }

  // Check group
  const group = targetsStore.groupTargets.find((g) => g.id === firstId)
  if (group) {
    const extra = selectedIds.length > 1 ? ` (+${selectedIds.length - 1} nhóm)` : ''
    return `${group.name}${extra}`
  }

  return `Đích đăng #${firstId}`
})

const previewContent = computed(() => {
  if (composerStore.currentVariant) {
    return composerStore.currentVariant
  }
  return composerStore.content
})

const mediaCount = computed(() => composerStore.mediaFiles.length)
const mediaItems = computed(() => composerStore.mediaFiles)

async function handleTestVariant(): Promise<void> {
  await composerStore.testSpintaxVariant()
}
</script>
