import { useConfigStore } from '@/store/config'

// 【新增】1. 扩充多模态的 Content 类型
export type ContentPart =
  | { type: 'text'
    text: string }
  | { type: 'image_url'
    image_url: { url: string; } }

// Message 接口
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[] // 支持多模态内容
}

// 统一的 API 请求配置结构
export interface FetchOptions {
  url: string
  headers: Record<string, string>
  body: any
}

interface TypesModelLLM {
  label: string
  modelName: string
  // 不再在这里发起 fetch，而是返回给外部统一的 fetch 选项
  getFetchOptions: (context: ChatMessage[]) => FetchOptions
  // 用于从标准的 SSE JSON 返回体中提取真正的文本
  extractContent: (jsonData: any) => string
  supportVision?: boolean // 可选字段，标明是否支持识图
}

export const defaultModelName = 'siliconflow'

export const modelMappingList: TypesModelLLM[] = [
  {
    label: '🐋 DeepSeek-V3',
    modelName: 'deepseek-v3',
    getFetchOptions(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.deepseek || import.meta.env.VITE_DEEPSEEK_KEY

      return {
        url: 'https://api.deepseek.com/chat/completions', // 修正为真实公网 API
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: configStore.temperature,
          stream: true,
          messages: context
        })
      }
    },
    extractContent(jsonData) {
      // 提取正文或深度思考(reasoning_content)
      const delta = jsonData?.choices?.[0]?.delta || {}
      return delta.content || delta.reasoning_content || ''
    }
  },
  {
    label: '🐋 DeepSeek-R1 (推理模型)',
    modelName: 'deepseek-deep',
    getFetchOptions(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.deepseek || import.meta.env.VITE_DEEPSEEK_KEY

      return {
        url: 'https://api.deepseek.com/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          stream: true,
          messages: context
        })
      }
    },
    extractContent(jsonData) {
      const delta = jsonData?.choices?.[0]?.delta || {}
      return delta.content || delta.reasoning_content || ''
    }
  },
  {
    label: '⚡ SiliconFlow 硅基流动',
    modelName: 'siliconflow',
    getFetchOptions(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.siliconflow || import.meta.env.VITE_SILICONFLOW_KEY

      return {
        url: 'https://api.siliconflow.cn/v1/chat/completions', // 修正公网 API
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          model: 'THUDM/glm-4-9b-chat',
          temperature: configStore.temperature,
          stream: true,
          messages: context
        })
      }
    },
    extractContent(jsonData) {
      return jsonData?.choices?.[0]?.delta?.content || ''
    }
  },
  {
    label: '⚡ Kimi Moonshot',
    modelName: 'moonshot',
    getFetchOptions(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.moonshot || import.meta.env.VITE_MOONSHOT_KEY

      return {
        url: 'https://api.moonshot.cn/v1/chat/completions', // 修正公网 API
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          temperature: configStore.temperature,
          stream: true,
          messages: [
            {
              role: 'system',
              content: '你是 Kimi，由 Moonshot AI 提供的人工智能助手。'
            },
            ...context
          ]
        })
      }
    },
    extractContent(jsonData) {
      return jsonData?.choices?.[0]?.delta?.content || ''
    }
  },
  // 【新增】2. 添加一个支持识图的开源视觉模型（基于硅基流动 API）
  {
    label: '👁️ Qwen-VL (视觉识图)',
    modelName: 'qwen-vl',
    supportVision: true, // 开启识图支持标识
    getFetchOptions(context) {
      const configStore = useConfigStore()
      // 复用 siliconflow 的 key
      const apiKey = configStore.apiKeys.siliconflow || import.meta.env.VITE_SILICONFLOW_KEY

      return {
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          model: 'Qwen/Qwen2-VL-72B-Instruct', // 强大的视觉模型
          temperature: configStore.temperature,
          stream: true,
          messages: context
        })
      }
    },
    extractContent(jsonData) {
      return jsonData?.choices?.[0]?.delta?.content || ''
    }
  }
]
