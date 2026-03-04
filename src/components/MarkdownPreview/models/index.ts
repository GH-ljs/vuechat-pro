import { mockEventStreamText } from '@/data'
import { sleep } from '@/utils/request'
import { useConfigStore } from '@/store/config'

/**
 * 转义处理响应值为 data: 的 json 字符串
 * 如: 科大讯飞星火、Kimi Moonshot 等大模型的 response
 */
export const createParser = () => {
  let keepAliveShown = false

  const resetKeepAliveParser = () => {
    keepAliveShown = false
  }

  const parseJsonLikeData = (content) => {

    // 若是终止信号，则直接结束
    if (content === '[DONE]') {
      // 重置 keepAlive 标志
      keepAliveShown = false
      return {
        done: true
      }
    }

    if (content.startsWith('data: ')) {
      keepAliveShown = false
      const dataString = content.substring(6).trim()
      if (dataString === '[DONE]') {
        return {
          done: true
        }
      }
      try {
        return JSON.parse(dataString)
      } catch (error) {
        console.error('JSON 解析错误：', error)
      }
    }

    // 尝试直接解析 JSON 字符串
    try {
      const trimmedContent = content.trim()

      if (trimmedContent === ': keep-alive') {
        // 如果还没有显示过 keep-alive 提示，则显示
        if (!keepAliveShown) {
          keepAliveShown = true
          return {
            isWaitQueuing: true
          }
        } else {
          return null
        }
      }

      if (!trimmedContent) {
        return null
      }

      if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
        return JSON.parse(trimmedContent)
      }
      if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
        return JSON.parse(trimmedContent)
      }
    } catch (error) {
      console.error('尝试直接解析 JSON 失败：', error)
    }

    return null
  }
  return {
    resetKeepAliveParser,
    parseJsonLikeData
  }
}

export const createStreamThinkTransformer = () => {
  let isThinking = false

  const resetThinkTransformer = () => {
    isThinking = false
  }

  const transformStreamThinkData = (content) => {
    const stream = parseJsonLikeData(content)

    if (stream && stream.done) {
      return {
        done: true
      }
    }

    // DeepSeek 存在限速问题，这里做一个简单处理
    // https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit
    if (stream && stream.isWaitQueuing) {
      return {
        isWaitQueuing: stream.isWaitQueuing
      }
    }

    if (!stream || !stream.choices || stream.choices.length === 0) {
      return {
        content: ''
      }
    }

    const delta = stream.choices[0].delta
    const contentText = delta.content || ''
    const reasoningText = delta.reasoning_content || ''

    let transformedContent = ''

    // 开始处理推理过程
    if (delta.content === null && delta.reasoning_content !== null) {
      if (!isThinking) {
        transformedContent += '<think>'
        isThinking = true
      }
      transformedContent += reasoningText
    }
    // 当 content 出现时，说明推理结束
    else if (delta.content !== null && delta.reasoning_content === null) {
      if (isThinking) {
        transformedContent += '</think>\n\n'
        isThinking = false
      }
      transformedContent += contentText
    }
    // 当为普通模型，即不包含推理字段时，直接追加 content
    else if (delta.content !== null && delta.reasoning_content === undefined) {
      isThinking = false
      transformedContent += contentText
    }

    return {
      content: transformedContent
    }
  }

  return {
    resetThinkTransformer,
    transformStreamThinkData
  }
}

const { resetKeepAliveParser, parseJsonLikeData } = createParser()
const { resetThinkTransformer, transformStreamThinkData } = createStreamThinkTransformer()


/**
 * 处理大模型调用暂停、异常或结束后触发的操作
 */
export const triggerModelTermination = () => {
  resetKeepAliveParser()
  resetThinkTransformer()
}

type ContentResult = {
  content: any
} | {
  done: boolean
}

type DoneResult = {
  content: any
  isWaitQueuing?: any
} & {
  done: boolean
}

export type CrossTransformFunction = (readValue: Uint8Array | string, textDecoder: TextDecoder) => DoneResult

export type TransformFunction = (readValue: Uint8Array | string, textDecoder: TextDecoder) => ContentResult

// 新增 Message 接口
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface TypesModelLLM {
  // 模型昵称
  label: string
  // 模型标识符
  modelName: string
  // Stream 结果转换器
  transformStreamValue: TransformFunction
  // 每个大模型调用的 API 请求// 将 text: string 改为 context: ChatMessage[]
  chatFetch: (context: ChatMessage[]) => Promise<Response>
}


/** ---------------- 大模型映射列表 & Response Transform 用于处理不同类型流的值转换器 ---------------- */

/**
 * Mock 模拟模型的 name
 */
export const defaultMockModelName = 'standard'

/**
 * 项目默认使用模型，按需修改此字段即可
 */

export const defaultModelName = 'siliconflow'
//export const defaultModelName = defaultMockModelName

export const modelMappingList: TypesModelLLM[] = [
  {
    label: '🐋 DeepSeek-V3',
    modelName: 'deepseek-v3',
    transformStreamValue(readValue) {
      const stream = transformStreamThinkData(readValue)
      if (stream.done) {
        return {
          done: true
        }
      }
      if (stream.isWaitQueuing) {
        return {
          isWaitQueuing: stream.isWaitQueuing
        }
      }
      return {
        content: stream.content
      }
    },
    // Event Stream 调用大模型接口 DeepSeek 深度求索 (Fetch 调用)
    chatFetch(context) {
      const configStore = useConfigStore()
      // 用户自定义 Key 优先，否则兜底使用环境变量
      const apiKey = configStore.apiKeys.deepseek || import.meta.env.VITE_DEEPSEEK_KEY
      const url = new URL(`${ location.origin }/deepseek/chat/completions`)
      const req = new Request(url, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          // 普通模型 V3
          'model': 'deepseek-chat',
          'temperature': configStore.temperature, // 接入动态温度
          stream: true,
          messages: context
        })
      })
      return fetch(req)
    }
  },
  {
    label: '🐋 DeepSeek-R1 (推理模型)',
    modelName: 'deepseek-deep',
    transformStreamValue(readValue) {
      const stream = transformStreamThinkData(readValue)
      if (stream.done) {
        return {
          done: true
        }
      }
      if (stream.isWaitQueuing) {
        return {
          isWaitQueuing: stream.isWaitQueuing
        }
      }
      return {
        content: stream.content
      }
    },
    // Event Stream 调用大模型接口 DeepSeek 深度求索 (Fetch 调用)
    chatFetch(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.deepseek || import.meta.env.VITE_DEEPSEEK_KEY
      const url = new URL(`${ location.origin }/deepseek/chat/completions`)
      const req = new Request(url, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          // 推理模型
          'model': 'deepseek-reasoner',
          'temperature': configStore.temperature,
          stream: true,
          messages: context
        })
      })
      return fetch(req)
    }
  },
  {
    label: '🦙 Ollama 3 大模型',
    modelName: 'ollama3',
    transformStreamValue(readValue) {
      const stream = parseJsonLikeData(readValue)
      if (stream.done) {
        return {
          done: true
        }
      }
      return {
        content: stream.message.content
      }
    },
    // Event Stream 调用大模型接口 Ollama3 (Fetch 调用)
    chatFetch(context) {
      const url = new URL(`http://localhost:11434/api/chat`)
      const req = new Request(url, {
        mode: 'cors',
        method: 'post',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // 'model': 'deepseek-r1', // 内置深度思考响应
          'model': 'llama3',
          stream: true,
          messages: [
            {
              role: 'system',
              content: '你的名字叫做小O, 全程使用中文回答我的问题。'
            },
            ...context
          ]
        })
      })
      return fetch(req)
    }
  },
  {
    label: '⚡ Spark 星火大模型',
    modelName: 'spark',
    transformStreamValue(readValue) {
      const stream = parseJsonLikeData(readValue)
      if (stream.done) {
        return {
          done: true
        }
      }
      return {
        content: stream.choices[0].delta.content || ''
      }
    },
    // Event Stream 调用大模型接口 Spark 星火认知大模型 (Fetch 调用)
    chatFetch(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.spark || import.meta.env.VITE_SPARK_KEY

      const url = new URL(`${ location.origin }/spark/v1/chat/completions`)

      const req = new Request(url, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          'model': '4.0Ultra',
          'temperature': configStore.temperature,
          stream: true,
          messages: [
            {
              role: 'system',
              content: '你叫小明同学，喜欢探索新的知识。'
            },
            ...context
          ]
        })
      })
      return fetch(req)
    }
  },
  {
    label: '⚡ SiliconFlow 硅基流动大模型',
    modelName: 'siliconflow',
    transformStreamValue(readValue) {
      const stream = parseJsonLikeData(readValue)
      if (stream.done) {
        return {
          done: true
        }
      }
      return {
        content: stream.choices[0].delta.content || ''
      }
    },
    // Event Stream 调用大模型接口 SiliconFlow 硅基流动大模型 (Fetch 调用)
    chatFetch(context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.siliconflow || import.meta.env.VITE_SILICONFLOW_KEY
      const url = new URL(`${ location.origin }/siliconflow/v1/chat/completions`)
      const req = new Request(url, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          // 集成了大部分模型，可以免费使用
          'model': 'THUDM/glm-4-9b-chat',
          'temperature': configStore.temperature,
          stream: true,
          messages: context
        })
      })
      return fetch(req)
    }
  },
  {
    label: '⚡ Kimi Moonshot 月之暗面大模型',
    modelName: 'moonshot',
    transformStreamValue(readValue) {
      const stream = parseJsonLikeData(readValue)
      if (stream.done) {
        return {
          done: true
        }
      }
      return {
        content: stream.choices[0].delta.content || ''
      }
    },
    // Event Stream 调用大模型接口 Kimi Moonshot 月之暗面大模型 (Fetch 调用)
    chatFetch (context) {
      const configStore = useConfigStore()
      const apiKey = configStore.apiKeys.moonshot || import.meta.env.VITE_MOONSHOT_KEY
      const url = new URL(`${ location.origin }/moonshot/v1/chat/completions`)
      const req = new Request(url, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ apiKey }`
        },
        body: JSON.stringify({
          'model': 'moonshot-v1-8k',
          'temperature': configStore.temperature,
          stream: true,
          messages: [
            {
              role: 'system',
              content: '你是 Kimi，由 Moonshot AI 提供的人工智能助手。'
            },
            ...context
          ]
        })
      })
      return fetch(req)
    }
  }
]
