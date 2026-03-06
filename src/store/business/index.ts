import { defineStore } from 'pinia'
import * as TransformUtils from '@/components/MarkdownPreview/transform'
import { defaultModelName, modelMappingList } from '@/components/MarkdownPreview/models'
import type { ChatMessage } from '@/components/MarkdownPreview/models'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import { fetchEventSource } from '@microsoft/fetch-event-source'

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
  ctrl: AbortController | null // 用于控制中止请求
}

// 配置 IndexedDB
localforage.config({
  name: 'VueChatPro_DB',
  storeName: 'chat_sessions'
})

//典型的 Pinia Store 实现，用于管理一个聊天应用的状态
export const useBusinessStore = defineStore('business-store', {
  // 选项式 API 定义 Store，包含 state、getters 和 actions
  // 1. State（状态）
  // 2. Getters（计算属性）
  // 3. Actions（动作）
  state: (): BusinessState => ({
    systemModelName: defaultModelName,
    sessions: [],
    activeSessionId: '',
    ctrl: null
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
    // 将 sessions 和 activeSessionId 保存到 IndexedDB 中
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

    // 强行中止当前请求
    abortRequest() {
      if (this.ctrl) {
        this.ctrl.abort()
        this.ctrl = null
      }
    },

    /**
     * 重构后：使用 fetchEventSource 发起 SSE 请求
     */
    async streamAssistantReply(callbacks: {
      onMessage: (text: string) => void
      onClose: () => void
      onError: (err: any) => void
    }) {
      const modelItem = this.currentModelItem
      if (!modelItem) {
        callbacks.onError(new Error('未找到模型配置'))
        return
      }

      // 截取最近的 10 条对话
      const contextPayload = this.messageList.slice(-10)

      // 获取配置
      const options = modelItem.getFetchOptions(contextPayload)

      this.ctrl = new AbortController()

      try {
        await fetchEventSource(options.url, {
          method: 'POST',
          headers: options.headers,
          body: options.body,
          signal: this.ctrl.signal,
          async onopen(response) {
            if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
              // 一切正常
            } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              // 客户端报错（如 Token 错误）直接抛出，不重试
              throw new Error(`API 请求失败: ${ response.status } ${ response.statusText }`)
            }
          },
          onmessage(msg) {
            // 完美的完整数据块，自带事件名校验
            if (msg.event === 'FatalError') {
              throw new Error(msg.data)
            }
            if (!msg.data || msg.data === '[DONE]') {
              return // 结束标志
            }
            try {
              const json = JSON.parse(msg.data)
              const textChunk = modelItem.extractContent(json)
              if (textChunk) {
                callbacks.onMessage(textChunk)
              }
            } catch (err) {
              console.warn('忽略不可解析的块:', msg.data)
            }
          },
          onclose() {
            callbacks.onClose()
          },
          onerror(err) {
            callbacks.onError(err)
            throw err // 阻止底层自动重试
          }
        })
      } catch (err) {
        // 如果是被主动取消的，不算是 Error
        if (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string; }).name === 'AbortError') {
          callbacks.onClose()
        } else {
          callbacks.onError(err)
        }
      }
    }
  }
})
