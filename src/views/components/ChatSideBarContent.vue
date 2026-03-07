<script lang="ts" setup>
import { useBusinessStore } from '@/store/business'
import { useAppStore } from '@/store/hooks/useAppStore'

const businessStore = useBusinessStore()
const appStore = useAppStore()

const emits = defineEmits<{
  (e: 'show-settings'): void
}>()

const handleDeleteSession = (id: string) => {
  window.$ModalDialog.warning({
    title: '删除对话',
    content: '确定要删除这条对话记录吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => businessStore.deleteSession(id)
  })
}

const switchSession = (id: string) => {
  businessStore.switchSession(id)
  if (appStore.showMobileDrawer) {
    appStore.showMobileDrawer = false
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col h-full bg-[#fafbfc]">
    <div class="p-16 border-b border-[#e5e5e5]">
      <n-button
        dashed
        block
        type="primary"
        size="large"
        @click="businessStore.addSession(); appStore.showMobileDrawer = false"
      >
        <template #icon><div class="i-ic:round-add text-20"></div></template>新建对话
      </n-button>
    </div>
    <div class="flex-1 overflow-y-auto p-12">
      <div
        v-for="session in businessStore.sessions"
        :key="session.id"
        class="px-12 py-14 mb-8 rounded-8 cursor-pointer transition-colors flex items-center justify-between group border border-transparent"
        :class="businessStore.activeSessionId === session.id ? 'bg-[#e6f1fc] border-[#bae0ff] text-[#18a058] font-bold' : 'hover:bg-[#f0f2f5] text-[#333]'"
        @click="switchSession(session.id)"
      >
        <div class="i-hugeicons:chat-01 text-16 mr-8 opacity-70"></div>
        <div class="truncate text-14 flex-1 mr-4">{{ session.title }}</div>
        <div
          class="opacity-0 group-hover:opacity-100 transition-opacity p-4 rounded-4 hover:bg-white"
          @click.stop="handleDeleteSession(session.id)"
        >
          <div class="i-ic:round-delete text-18 text-red-500 hover:text-red-700"></div>
        </div>
      </div>
    </div>
    <div class="p-12 border-t border-[#e5e5e5]">
      <div
        class="px-12 py-12 rounded-8 cursor-pointer transition-colors hover:bg-[#f0f2f5] text-[#333] flex items-center"
        @click="emits('show-settings'); appStore.showMobileDrawer = false"
      >
        <div class="i-hugeicons:settings-01 text-18 mr-8"></div><div class="text-14 font-medium">全局设置</div>
      </div>
    </div>
  </div>
</template>
