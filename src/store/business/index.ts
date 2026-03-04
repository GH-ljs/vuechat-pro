import { defineStore } from 'pinia'

import * as TransformUtils from '@/components/MarkdownPreview/transform'

import { defaultModelName, modelMappingList } from '@/components/MarkdownPreview/models'
import type { ChatMessage } from '@/components/MarkdownPreview/models'

import localforage from 'localforage' // 引入 localforage

// 配置 localforage
localforage.config({
  name: 'VueChatPro_DB',
  storeName: 'chat_store'
})

export interface BusinessState {
  systemModelName: string
  messageList: ChatMessage[] // 新增：保存当前会话的上下文
}

export const useBusinessStore = defineStore('business-store', {
  state: (): BusinessState => {
    return {
      systemModelName: defaultModelName,
      messageList: []
    }
  },
  getters: {
    currentModelItem (state) {
      return modelMappingList.find(v => v.modelName === state.systemModelName)
    }
  },
  actions: {
    // 1. 从 IndexedDB 加载历史记录
    async loadHistory() {
      const history = await localforage.getItem<ChatMessage[]>('current_session')
      if (history) {
        this.messageList = history
      }
    },

    // 2. 保存记录到 IndexedDB
    async saveHistory() {
      await localforage.setItem('current_session', JSON.parse(JSON.stringify(this.messageList)))
    },

    // 3. 追加新消息并持久化
    async appendMessage(message: ChatMessage) {
      this.messageList.push(message)
      await this.saveHistory()
    },

    // 4. 清空对话
    async clearHistory() {
      this.messageList = []
      await localforage.removeItem('current_session')
    },

    /**
     * 发送完整上下文给大模型
     */
    async createAssistantWriterStylized(): Promise<{
      error: number
      reader: ReadableStreamDefaultReader<string> | null
    }> {
      return new Promise((resolve) => {
        if (!this.currentModelItem?.chatFetch) {
          return resolve({
            error: 1,
            reader: null
          })
        }

        // 获取最新的 N 条记录作为上下文（可控制上下文长度，避免 token 超限）
        const contextLimit = 10
        const contextPayload = this.messageList.slice(-contextLimit)

        // 调用接口，传入完整的上下文数组
        this.currentModelItem.chatFetch(contextPayload)
          .then((res) => {
            if (res.body) {
              const reader = res.body
                .pipeThrough(new TextDecoderStream())
                .pipeThrough(TransformUtils.splitStream('\n'))
                .getReader()
              resolve({
                error: 0,
                reader
              })
            } else {
              resolve({
                error: 1,
                reader: null
              })
            }
          })
          .catch(() => resolve({
            error: 1,
            reader: null
          }))
      })
    }
  }
})
