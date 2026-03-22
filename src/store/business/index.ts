import { defineStore } from 'pinia'
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
        // 给旧消息补充 id，防止虚拟列表渲染报错
        savedSessions.forEach(session => {
          session.messages.forEach(msg => {
            if (!msg.id) msg.id = uuidv4()
          })
        })
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
      if (!message.id) message.id = uuidv4()
      session.messages.push(message)

      // 生成标题逻辑：如果 content 是数组，需要提取出文本部分
      if (session.messages.length === 1 && message.role === 'user') {
        let textForTitle = ''
        if (typeof message.content === 'string') {
          textForTitle = message.content
        } else if (Array.isArray(message.content)) {
          const textPart = message.content.find(p => p.type === 'text')
          textForTitle = textPart ? (textPart as any).text : '图片消息'
        }
        session.title = textForTitle.slice(0, 15) + (textForTitle.length > 15 ? '...' : '')
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

    // 8. 导出所有会话为 JSON 文件
    exportSessions() {
      const data = JSON.parse(JSON.stringify(this.sessions))
      const blob = new Blob([JSON.stringify({
        version: 1,
        sessions: data
      }, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vuechat-export-${ new Date().toISOString().slice(0, 10) }.json`
      a.click()
      URL.revokeObjectURL(url)
    },

    // 9. 从 JSON 文件导入会话（合并模式，不覆盖）
    async importSessions(file: File) {
      const text = await file.text()
      const parsed = JSON.parse(text)

      // 校验基本结构
      if (!parsed || !Array.isArray(parsed.sessions)) {
        throw new Error('无效的导入文件格式')
      }

      const imported = parsed.sessions as ChatSession[]
      const existingIds = new Set(this.sessions.map(s => s.id))

      for (const session of imported) {
        // 校验必要字段
        if (!session.id || !session.title || !Array.isArray(session.messages)) continue
        // 跳过已存在的会话
        if (existingIds.has(session.id)) continue
        // 确保每条消息有 id
        session.messages.forEach(msg => {
          if (!msg.id) msg.id = uuidv4()
        })
        this.sessions.push(session)
      }

      if (this.sessions.length > 0 && !this.activeSessionId) {
        this.activeSessionId = this.sessions[0].id
      }
      await this.saveHistory()
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
    async streamAssistantReply(
      callbacks: {
        onMessage: (text: string) => void
        onClose: (isAborted?: boolean) => void
        onError: (err: any) => void
      },
      customPayload?: ChatMessage[]
    ) {
      const modelItem = this.currentModelItem
      if (!modelItem) {
        callbacks.onError(new Error('未找到模型配置'))
        return
      }

      // 如果有续传上下文则使用续传，否则截取最近 10 条
      const contextPayload = customPayload || this.messageList.slice(-10)

      // 获取配置
      const options = modelItem.getFetchOptions(contextPayload)

      this.ctrl = new AbortController()

      let triggerClosed = false
      const safeClose = (isAborted: boolean) => {
        if (!triggerClosed) {
          triggerClosed = true
          callbacks.onClose(isAborted)
        }
      }

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
            } catch {
              console.warn('忽略不可解析的块:', msg.data)
            }
          },
          onclose() {
            // fetchEventSource 底层会在后端正常结束流时触发 onclose
            safeClose(false)
          },
          onerror(err) {
            callbacks.onError(err)
            throw err // 阻止底层自动重试
          }
        })

        // 【新增修复】fetchEventSource 在收到 AbortController 信号时，会直接静默执行 resolve() 而不走任何回调或抛错！
        // 因此我们要在这里检查如果流被客户端手动掐断（比如切会话），需要强制触发生命周期
        if (this.ctrl.signal.aborted) {
          safeClose(true)
        } else {
          safeClose(false)
        }

      } catch (err: any) {
        // 区分异常 Error(如断网底层异常等)
        if (err?.name === 'AbortError') {
          safeClose(true)
        } else {
          callbacks.onError(err)
        }
      }
    }
  }
})
