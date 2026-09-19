import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NavTab = 'composer' | 'queue' | 'targets' | 'settings'

export const useNavigationStore = defineStore('navigation', () => {
  const activeTab = ref<NavTab>('composer')

  function setActiveTab(tab: NavTab): void {
    activeTab.value = tab
  }

  return {
    activeTab,
    setActiveTab
  }
})
