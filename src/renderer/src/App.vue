<template>
  <div class="h-screen w-screen flex flex-col overflow-hidden bg-[#0B111A] text-[#F1F5F9] font-sans">
    <!-- Top Titlebar: 38px -->
    <Titlebar />

    <!-- Main Workspace Container -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Fixed Sidebar: 220px -->
      <Sidebar />

      <!-- View Content Area -->
      <main class="flex-1 h-full overflow-hidden bg-[#0B111A] relative">
        <ComposerView v-if="activeTab === 'composer'" />
        <QueueView v-else-if="activeTab === 'queue'" />
        <TargetsView v-else-if="activeTab === 'targets'" />
        <SettingsView v-else-if="activeTab === 'settings'" />
      </main>
    </div>

    <!-- Global Security Alert Modal (Emergency Pause) -->
    <SecurityAlertModal />

    <!-- Global Toast Container -->
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import Titlebar from './components/layout/Titlebar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import ComposerView from './views/ComposerView.vue'
import QueueView from './views/QueueView.vue'
import TargetsView from './views/TargetsView.vue'
import SettingsView from './views/SettingsView.vue'
import SecurityAlertModal from './components/common/SecurityAlertModal.vue'
import ToastContainer from './components/common/ToastContainer.vue'
import { useNavigationStore } from './stores/navigation'
import { useAccountStore } from './stores/account'
import { useQueueStore } from './stores/queue'

const navStore = useNavigationStore()
const accountStore = useAccountStore()
const queueStore = useQueueStore()

const activeTab = computed(() => navStore.activeTab)

let cleanupSessionListener: (() => void) | undefined
let cleanupQueueListener: (() => void) | undefined

onMounted(async () => {
  await accountStore.fetchProfile()
  await queueStore.fetchQueueStatus()
  cleanupSessionListener = accountStore.initListeners()
  cleanupQueueListener = queueStore.initListeners()
})

onUnmounted(() => {
  if (cleanupSessionListener) {
    cleanupSessionListener()
  }
  if (cleanupQueueListener) {
    cleanupQueueListener()
  }
})
</script>
