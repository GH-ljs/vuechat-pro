import { defineStore } from 'pinia'
import * as TransformUtils from '@/components/MarkdownPreview/transform'
import { defaultModelName, modelMappingList } from '@/components/MarkdownPreview/models'
import type { ChatMessage } from '@/components/MarkdownPreview/models'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'

// 定义单个会话的数据结构
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createTime: number
}

export interface BusinessState {
  systemModelName: string
  sessions: ChatSession[]
  activeSessionId: string
}

// 配置 IndexedDB
localforage.config({
  name: 'VueChatPro_DB',
  storeName: 'chat_sessions'
})

export const useBusinessStore = defineStore('business-store', {
  state: (): BusinessState => ({
    systemModelName: defaultModelName,
    sessions: [],
    activeSessionId: ''
  }),
  getters: {
    currentModelItem(state) {
      return modelMappingList.find(v => v.modelName === state.systemModelName)
    },
    // 获取当前激活的会话对象
    activeSession(state): ChatSession | undefined {
      return state.sessions.find(s => s.id === state.activeSessionId)
    },
    // 兼容之前的 messageList 读取逻辑
    messageList(): ChatMessage[] {
      return this.activeSession?.messages || []
    }
  },
  actions: {
    // 1. 初始化：加载历史记录
    async loadHistory() {
      const savedSessions = await localforage.getItem<ChatSession[]>('sessions')
      const savedActiveId = await localforage.getItem<string>('activeSessionId')

      if (savedSessions && savedSessions.length > 0) {
        this.sessions = savedSessions
        // 恢复上次激活的会话，或者默认选中第一个
        this.activeSessionId = savedActiveId && savedSessions.some(s => s.id === savedActiveId)
          ? savedActiveId
          : savedSessions[0].id
      } else {
        // 如果没有任何记录，自动创建一个新会话
        this.addSession()
      }
    },

    // 2. 持久化保存
    async saveHistory() {
      await localforage.setItem('sessions', JSON.parse(JSON.stringify(this.sessions)))
      await localforage.setItem('activeSessionId', this.activeSessionId)
    },

    // 3. 新建对话
    addSession() {
      const newSession: ChatSession = {
        id: uuidv4(),
        title: '新对话',
        messages: [],
        createTime: Date.now()
      }
      // 插入到列表最前面
      this.sessions.unshift(newSession)
      this.activeSessionId = newSession.id
      this.saveHistory()
    },

    // 4. 切换对话
    switchSession(id: string) {
      this.activeSessionId = id
      this.saveHistory()
    },

    // 5. 删除对话
    deleteSession(id: string) {
      this.sessions = this.sessions.filter(s => s.id !== id)
      // 如果删空了，自动建一个新的
      if (this.sessions.length === 0) {
        this.addSession()
      } else if (this.activeSessionId === id) {
        // 如果删除了当前激活的，自动选中第一个
        this.activeSessionId = this.sessions[0].id
      }
      this.saveHistory()
    },

    // 6. 追加消息（会自动根据第一句话生成标题）
    async appendMessage(message: ChatMessage) {
      const session = this.activeSession
      if (!session) return

      session.messages.push(message)

      // 如果是当前对话的第一条用户消息，自动提取前15个字作为标题
      if (session.messages.length === 1 && message.role === 'user') {
        session.title = message.content.slice(0, 15) + (message.content.length > 15 ? '...' : '')
      }

      await this.saveHistory()
    },

    // 7. 清空当前对话记录
    async clearHistory() {
      const session = this.activeSession
      if (session) {
        session.messages = []
        session.title = '新对话'
        await this.saveHistory()
      }
    },

    /**
     * 发送大模型请求（使用 activeSession 的消息作为上下文）
     */
    async createAssistantWriterStylized(): Promise<{error: number
      reader: ReadableStreamDefaultReader<string> | null}> {
      return new Promise((resolve) => {
        if (!this.currentModelItem?.chatFetch) {
          return resolve({
            error: 1,
            reader: null
          })
        }

        // 截取最近的 10 条对话避免 Token 超限
        const contextLimit = 10
        const contextPayload = this.messageList.slice(-contextLimit)

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
