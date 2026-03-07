import { defineStore } from 'pinia'
import { store } from '@/store'
import { ref } from 'vue'

export const useAppStore = defineStore('app-store', () => {
  const showMobileDrawer = ref(false)

  return {
    showMobileDrawer
  }
})

export function useAppStoreWithOut() {
  return useAppStore(store)
}
