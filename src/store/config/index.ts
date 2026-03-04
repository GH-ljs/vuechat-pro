//一个全新的 Pinia 仓库，用来专门管理全局设置
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export const useConfigStore = defineStore('config-store', {
  state: () => ({
    // 使用 useStorage 自动同步到 localStorage，键名为 vuechat-api-keys
    apiKeys: useStorage('vuechat-api-keys', {
      deepseek: '',
      siliconflow: '',
      moonshot: '',
      spark: ''
    }),
    // 预留全局模型参数设置
    temperature: useStorage('vuechat-temperature', 0.7)
  }),
  actions: {
    // 这里可以预留重置配置的方法
    resetConfig() {
      this.apiKeys = {
        deepseek: '',
        siliconflow: '',
        moonshot: '',
        spark: ''
      }
      this.temperature = 0.7
    }
  }
})
