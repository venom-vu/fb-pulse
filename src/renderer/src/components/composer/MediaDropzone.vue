<template>
  <div class="space-y-2">
    <!-- Header -->
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center space-x-2">
        <span class="font-semibold text-[#F1F5F9] uppercase tracking-wider text-[11px]">
          Hình Ảnh Đính Kèm
        </span>
        <span class="text-[11px] font-mono text-[#94A3B8]">
          ({{ composerStore.mediaFiles.length }}/{{ MAX_MEDIA_COUNT }})
        </span>
        <span
          v-if="composerStore.mediaFiles.length >= MAX_MEDIA_COUNT"
          class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30"
        >
          Đã đạt tối đa
        </span>
      </div>
      <span class="text-[10px] text-[#64748B]">PNG, JPG, WEBP &le; 10MB</span>
    </div>

    <!-- Dropzone Grid Area -->
    <div
      id="media-dropzone"
      class="rounded-xl border p-3 transition-all duration-200"
      :class="[
        isDraggingOverZone
          ? 'border-[#10B981] bg-[#10B981]/5 ring-1 ring-[#10B981]/30'
          : 'border-[#1E293B] bg-[#0B111A]/60'
      ]"
      @dragover.prevent="onZoneDragOver"
      @dragleave.prevent="onZoneDragLeave"
      @drop.prevent="onZoneDrop"
    >
      <!-- Media Grid -->
      <div class="media-grid grid grid-cols-4 gap-3">
        <!-- Uploaded Images Items -->
        <div
          v-for="(media, index) in composerStore.mediaFiles"
          :key="media.id"
          class="media-item group relative aspect-square rounded-lg overflow-hidden border border-[#1E293B] bg-[#0E1622] transition-all cursor-grab active:cursor-grabbing select-none"
          :class="{
            'ring-2 ring-[#10B981] border-[#10B981]': draggedIndex === index,
            'opacity-40 scale-95': draggedIndex === index
          }"
          draggable="true"
          :title="`Kéo để đổi thứ tự ảnh. ${index === 0 ? 'Đây là ảnh bìa ưu tiên.' : ''}`"
          @dragstart="onItemDragStart($event, index)"
          @dragover.prevent="onItemDragOver($event, index)"
          @drop.prevent="onItemDrop($event, index)"
          @dragend="onItemDragEnd"
        >
          <!-- Thumbnail Image -->
          <img
            :src="media.previewUrl"
            :alt="media.name"
            class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 pointer-events-none"
          />

          <!-- Cover Photo Badge (Index 0) -->
          <div
            v-if="index === 0"
            class="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-[#10B981] text-[#042419] font-bold text-[9px] uppercase tracking-wider shadow-[0_2px_6px_rgba(16,185,129,0.5)] flex items-center space-x-1"
          >
            <span>★</span>
            <span>Ảnh bìa</span>
          </div>

          <!-- Position Index Indicator (Index > 0) -->
          <div
            v-else
            class="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[#94A3B8] font-mono text-[9px] border border-[#1E293B]"
          >
            #{{ index + 1 }}
          </div>

          <!-- Hover Gradient Overlay -->
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          ></div>

          <!-- File Name on Hover -->
          <div
            class="absolute bottom-1.5 left-1.5 right-1.5 text-[9px] text-[#F1F5F9] truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-mono"
          >
            {{ media.name }}
          </div>

          <!-- Red Delete Button (Top Right) -->
          <button
            type="button"
            class="media-delete absolute top-1.5 right-1.5 z-20 w-5 h-5 rounded-full bg-black/75 hover:bg-[#EF4444] text-[#EF4444] hover:text-white border border-[#EF4444]/40 hover:border-[#EF4444] flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-md"
            title="Xóa hình ảnh này"
            @click.stop="composerStore.removeMedia(media.id)"
          >
            ✕
          </button>
        </div>

        <!-- Media Upload Placeholder (When < 4 images) -->
        <div
          v-if="composerStore.mediaFiles.length < MAX_MEDIA_COUNT"
          id="btn-upload-placeholder"
          class="media-upload-placeholder aspect-square rounded-lg border-2 border-dashed border-[#2B3A4F] hover:border-[#10B981] hover:bg-[#10B981]/5 flex flex-col items-center justify-center text-center p-2 text-[#64748B] hover:text-[#10B981] transition-all cursor-pointer group select-none"
          title="Bấm để chọn ảnh hoặc kéo thả ảnh vào đây"
          @click="openFilePicker"
        >
          <span class="text-xl font-bold leading-none mb-1 group-hover:scale-110 transition-transform">
            ＋
          </span>
          <span class="text-[11px] font-medium leading-tight">Thêm ảnh</span>
          <span class="text-[9px] text-[#64748B] mt-0.5">Kéo thả hoặc click</span>
        </div>
      </div>

      <!-- Dragging Overlay Feedback for the whole zone -->
      <div
        v-if="isDraggingOverZone && composerStore.mediaFiles.length < MAX_MEDIA_COUNT"
        class="mt-2 text-center text-xs text-[#10B981] font-medium animate-pulse"
      >
        📥 Thả hình ảnh vào đây để tải lên...
      </div>
    </div>

    <!-- Hidden Native File Input -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      accept="image/png,image/jpeg,image/webp"
      multiple
      @change="onFileInputChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useComposerStore } from '../../stores/composer'
import { MAX_MEDIA_COUNT } from '../../types/composer'

const composerStore = useComposerStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDraggingOverZone = ref(false)
const draggedIndex = ref<number | null>(null)

function openFilePicker(): void {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

function onFileInputChange(e: Event): void {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    composerStore.addMediaFiles(target.files)
  }
}

// Drag & Drop external files into dropzone
function onZoneDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('Files')) {
    isDraggingOverZone.value = true
  }
}

function onZoneDragLeave(e: DragEvent): void {
  const currentTarget = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement
  if (!currentTarget.contains(relatedTarget)) {
    isDraggingOverZone.value = false
  }
}

function onZoneDrop(e: DragEvent): void {
  isDraggingOverZone.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    composerStore.addMediaFiles(e.dataTransfer.files)
  }
}

// Drag & Drop reordering items inside grid
function onItemDragStart(e: DragEvent, index: number): void {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }
}

function onItemDragOver(e: DragEvent, _index: number): void {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
}

function onItemDrop(e: DragEvent, targetIndex: number): void {
  if (draggedIndex.value !== null && draggedIndex.value !== targetIndex) {
    composerStore.reorderMedia(draggedIndex.value, targetIndex)
  }
  draggedIndex.value = null
}

function onItemDragEnd(): void {
  draggedIndex.value = null
}
</script>
