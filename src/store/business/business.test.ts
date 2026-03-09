import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBusinessStore } from '@/store/business'

describe('businessStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addSession creates a new session', () => {
    const store = useBusinessStore()
    store.addSession()
    expect(store.sessions.length).toBe(1)
    expect(store.sessions[0].title).toBe('新对话')
    expect(store.activeSessionId).toBe(store.sessions[0].id)
  })

  it('deleteSession removes session and creates one if empty', () => {
    const store = useBusinessStore()
    store.addSession()
    const id = store.sessions[0].id
    store.deleteSession(id)
    // Should auto-create a new one
    expect(store.sessions.length).toBe(1)
    expect(store.sessions[0].id).not.toBe(id)
  })

  it('switchSession changes active session', () => {
    const store = useBusinessStore()
    store.addSession()
    const first = store.sessions[0].id
    store.addSession()
    const second = store.sessions[0].id
    expect(store.activeSessionId).toBe(second)
    store.switchSession(first)
    expect(store.activeSessionId).toBe(first)
  })

  it('appendMessage adds message to active session', async () => {
    const store = useBusinessStore()
    store.addSession()
    await store.appendMessage({
      role: 'user',
      content: 'hello world test'
    })
    expect(store.messageList.length).toBe(1)
    expect(store.messageList[0].content).toBe('hello world test')
    // Title should be auto-generated from first message (truncated to 15 chars)
    expect(store.activeSession?.title).toContain('hello world tes')
  })

  it('appendMessage generates truncated title for long messages', async () => {
    const store = useBusinessStore()
    store.addSession()
    await store.appendMessage({
      role: 'user',
      content: '这是一条非常长的消息用来测试标题截断功能是否正常工作'
    })
    expect(store.activeSession?.title?.length).toBeLessThanOrEqual(18) // 15 + "..."
  })

  it('clearHistory resets active session', async () => {
    const store = useBusinessStore()
    store.addSession()
    await store.appendMessage({
      role: 'user',
      content: 'test'
    })
    await store.clearHistory()
    expect(store.messageList.length).toBe(0)
    expect(store.activeSession?.title).toBe('新对话')
  })

  it('importSessions validates structure', async () => {
    const store = useBusinessStore()
    store.addSession()
    const invalidFile = new File(['{}'], 'invalid.json', {
      type: 'application/json'
    })
    await expect(store.importSessions(invalidFile)).rejects.toThrow('无效的导入文件格式')
  })

  it('importSessions merges sessions without duplicates', async () => {
    const store = useBusinessStore()
    store.addSession()
    const existingId = store.sessions[0].id

    const importData = {
      version: 1,
      sessions: [
        {
          id: existingId,
          title: 'dup',
          messages: [],
          createTime: Date.now()
        },
        {
          id: 'new-id-123',
          title: 'imported session',
          messages: [],
          createTime: Date.now()
        }
      ]
    }
    const file = new File([JSON.stringify(importData)], 'export.json', {
      type: 'application/json'
    })
    await store.importSessions(file)

    // Should not duplicate existing, should add new
    expect(store.sessions.filter(s => s.id === existingId).length).toBe(1)
    expect(store.sessions.find(s => s.id === 'new-id-123')).toBeTruthy()
  })
})
