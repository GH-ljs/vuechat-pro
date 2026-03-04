<script lang="tsx" setup>
import { defaultMockModelName, modelMappingList, triggerModelTermination } from '@/components/MarkdownPreview/models'
import { renderMarkdownText } from '@/components/MarkdownPreview/plugins/markdown'
import { type InputInst } from 'naive-ui'
import type { SelectBaseOption } from 'naive-ui/es/select/src/interface'
import { isGithubDeployed } from '@/config'

import { UAParser } from 'ua-parser-js'

//const route = useRoute()
//const router = useRouter()
const businessStore = useBusinessStore()

onMounted(() => {
  // 组件挂载时，加载历史记录
  if (businessStore.loadHistory) {
    businessStore.loadHistory()
  }
})

const modelListSelections = computed(() => {
  return modelMappingList.map<SelectBaseOption>((modelItem) => {
    let disabled = false
    if (isGithubDeployed && modelItem.modelName !== defaultMockModelName) {
      disabled = true
    }

    return {
      label: modelItem.label,
      value: modelItem.modelName,
      disabled
    }
  })
})

const loading = ref(true)

setTimeout(() => {
  loading.value = false
}, 700)

const stylizingLoading = ref(false)

/**
 * 输入字符串
 */
const inputTextString = ref('')
const refInputTextString = ref<InputInst | null>()

/**
 * 输出字符串 Reader 流（风格化的）
 */
const outputTextReader = ref<ReadableStreamDefaultReader | null>()

const refReaderMarkdownPreview = ref<any>()
// 滚动容器的 ref
const messageContainer = ref<HTMLElement>()

const scrollToBottom = async () => {
  await nextTick()
  if (messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  }
}

const onFailedReader = () => {
  outputTextReader.value = null
  stylizingLoading.value = false
  if (refReaderMarkdownPreview.value) {
    refReaderMarkdownPreview.value.initializeEnd()
  }
  window.$ModalMessage.error('转换失败，请重试')
  setTimeout(() => {
    if (refInputTextString.value) {
      refInputTextString.value.focus()
    }
  })
  triggerModelTermination()
}

// 接收 MarkdownPreview 内部打字机结束时的完整文本
const onCompletedReader = async () => {
  stylizingLoading.value = false

  // 获取当前 markdown-preview 里的完整内容
  const finalContent = refReaderMarkdownPreview.value?.displayText || ''

  if (finalContent) {
    // 将 AI 的回复存入上下文中
    await businessStore.appendMessage({
      role: 'assistant',
      content: finalContent
    })
  }

  // 重置预览组件的状态，等待下一次输入
  if (refReaderMarkdownPreview.value) {
    refReaderMarkdownPreview.value.resetStatus()
  }

  setTimeout(() => {
    if (refInputTextString.value) {
      refInputTextString.value.focus()
    }
  })
  triggerModelTermination()
  scrollToBottom()
}

const handleCreateStylized = async () => {
  // 若正在加载，则点击后恢复初始状态
  if (stylizingLoading.value) {
    refReaderMarkdownPreview.value.abortReader()
    onCompletedReader()
    return
  }

  if (refInputTextString.value && !inputTextString.value.trim()) {
    inputTextString.value = ''
    refInputTextString.value.focus()
    return
  }

  // 1. 将用户的输入存入 messageList
  const textContent = inputTextString.value
  inputTextString.value = ''
  await businessStore.appendMessage({
    role: 'user',
    content: textContent
  })

  scrollToBottom()

  // 2. 准备接收流式输出
  stylizingLoading.value = true
  if (refReaderMarkdownPreview.value) {
    refReaderMarkdownPreview.value.resetStatus()
    refReaderMarkdownPreview.value.initializeStart()
  }

  // 3. 发起请求（注意：这里 store 内部会去读取 messageList 发送）
  const { error, reader } = await businessStore.createAssistantWriterStylized()

  if (error) {
    onFailedReader()
    return
  }

  if (reader) {
    outputTextReader.value = reader
  }
}

import { useDialog, useMessage } from 'naive-ui'

const dialog = useDialog()
const message = useMessage()

const handleClearHistory = async () => {
  dialog.warning({
    title: '确认清空',
    content: '确定要清空当前的对话记录吗？清空后无法恢复。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (businessStore.clearHistory) {
        await businessStore.clearHistory()
      }
      message.success('已清空对话记录')
    }
  })
}

const keys = useMagicKeys()
const enterCommand = keys['Meta+Enter']
const enterCtrl = keys['Ctrl+Enter']

const activeElement = useActiveElement()
const notUsingInput = computed(() => activeElement.value?.tagName !== 'TEXTAREA')

const parser = new UAParser()
const isMacos = computed(() => {
  const os = parser.getOS()
  if (!os) return

  const osName = os.name ?? ''
  return osName
    .toLocaleLowerCase()
    .includes?.('macos')
})

const placeholder = computed(() => {
  if (stylizingLoading.value) {
    return `输入任意问题...`
  }
  return `输入任意问题, 按 ${ isMacos.value ? 'Command' : 'Ctrl' } + Enter 键快捷开始...`
})

watch(
  () => enterCommand.value,
  () => {
    if (!isMacos.value || notUsingInput.value) return

    if (stylizingLoading.value) return

    if (!enterCommand.value) {
      handleCreateStylized()
    }
  },
  {
    deep: true
  }
)

watch(
  () => enterCtrl.value,
  () => {
    if (isMacos.value || notUsingInput.value) return

    if (stylizingLoading.value) return

    if (!enterCtrl.value) {
      handleCreateStylized()
    }
  },
  {
    deep: true
  }
)

const handleResetState = () => {
  inputTextString.value = ''

  stylizingLoading.value = false
  nextTick(() => {
    refInputTextString.value?.focus()
  })
  refReaderMarkdownPreview.value?.abortReader()
  refReaderMarkdownPreview.value?.resetStatus()
}
handleResetState()

const PromptTag = defineComponent({
  props: {
    text: {
      type: String,
      default: ''
    }
  },
  setup(props) {
    const handleClick = () => {
      inputTextString.value = props.text
      nextTick(() => {
        refInputTextString.value?.focus()
      })
    }
    return {
      handleClick
    }
  },
  render() {
    return (
      <div
        b="~ solid transparent"
        hover="shadow-[--shadow] b-primary bg-#e8e8e8"
        class={[
          'px-10 py-2 rounded-7 text-12',
          'max-w-230 transition-all-300 select-none cursor-pointer',
          'c-#525252 bg-#ededed'
        ]}
        style={{
          '--shadow': '3px 3px 3px -1px rgba(0,0,0,0.1)'
        }}
        onClick={this.handleClick}
      >
        <n-ellipsis
          tooltip={{
            contentClass: 'wrapper-tooltip-scroller',
            keepAliveOnHover: true
          }}
        >
          {{
            tooltip: () => this.text,
            default: () => this.text
          }}
        </n-ellipsis>
      </div>
    )
  }
})

const promptTextList = ref([
  '打个招呼吧，并告诉我你的名字',
  '使用中文，回答以下两个问题，分段表示\n1、你是什么模型？\n2、请分别使用 Vue3 和 React 编写一个 Button 组件，要求在 Vue3 中使用 Setup Composition API 语法糖，在 React 中使用 TSX 语法'
])
</script>

<template>
  <LayoutCenterPanel
    :loading="loading"
  >
    <!-- 内容区域 -->
    <div
      flex="~ col"
      h-full
    >
      <div
        flex="~ justify-between items-center"
      >
        <NavigationNavBar>
          <template #right>
            <div
              flex="~ justify-center items-center wrap"
              class="text-16 line-height-16"
            >
              <n-button
                v-if="businessStore.messageList?.length > 0"
                text
                type="error"
                class="mr-20 font-bold"
                @click="handleClearHistory"
              >
                清空对话
              </n-button>
              <span class="lt-xs:hidden">当前模型：</span>
              <div
                flex="~ justify-center items-center"
              >
                <n-select
                  v-model:value="businessStore.systemModelName"
                  class="w-280 lt-xs:w-260 pr-10 font-italic font-bold"
                  placeholder="请选择模型"
                  :disabled="stylizingLoading"
                  :options="modelListSelections"
                />
                <CustomTooltip
                  :disabled="false"
                >
                  <div>注意：</div>
                  <div>
                    演示环境仅支持 “模拟数据模型”
                  </div>
                  <div>
                    如需测试其他模型请克隆<a
                      href="https://github.com/pdsuwwz/chatgpt-vue3-light-mvp"
                      target="_blank"
                      class="px-2 underline c-warning font-bold"
                    >本仓库</a>到本地运行
                  </div>
                  <template #trigger>
                    <span
                      class="cursor-help font-bold c-primary text-17 i-ic:sharp-help"
                      ml-10
                      mr-24
                    ></span>
                  </template>
                </CustomTooltip>
              </div>
            </div>
          </template>
        </NavigationNavBar>
      </div>

      <!-- 聊天消息列表区域 -->
      <div
        ref="messageContainer"
        flex="1 ~ col"
        min-h-0
        pb-20
        class="overflow-y-auto px-24px pt-20px"
      >
        <template v-if="businessStore.messageList?.length > 0 || stylizingLoading">
          <!-- 历史消息渲染 -->
          <div
            v-for="(msg, index) in businessStore.messageList"
            :key="index"
            class="mb-24 flex"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-85% rounded-12 p-16"
              :class="msg.role === 'user' ? 'bg-[#e5e5e5] text-[#333]' : 'bg-[#f4f6f8] text-[#333] markdown-wrapper'"
            >
              <template v-if="msg.role === 'user'">
                <div class="whitespace-pre-wrap">{{ msg.content }}</div>
              </template>
              <template v-else>
                <div v-html="renderMarkdownText(msg.content)"></div>
              </template>
            </div>
          </div>

          <!-- 正在输出的流式打字机占位 -->
          <div
            v-show="stylizingLoading"
            class="flex justify-start mb-24"
          >
            <div class="max-w-85% rounded-12 bg-[#f4f6f8] p-16">
              <MarkdownPreview
                ref="refReaderMarkdownPreview"
                v-model:reader="outputTextReader"
                :model="businessStore.currentModelItem?.modelName"
                :transform-stream-fn="businessStore.currentModelItem?.transformStreamValue"
                @failed="onFailedReader"
                @completed="onCompletedReader"
              />
            </div>
          </div>
        </template>

        <template v-else>
          <n-empty
            size="large"
            class="font-bold h-full flex items-center justify-center"
            description="VueChat Pro：开始你的对话吧"
          >
            <template #icon>
              <n-icon>
                <div class="i-hugeicons:ai-chat-02"></div>
              </n-icon>
            </template>
          </n-empty>
        </template>
      </div>

      <div
        flex="~ col items-center"
        flex-basis="10%"
        p="14px"
        py="0"
      >
        <div
          w-full
          flex="~ justify-start"
          class="px-1em pb-10"
        >
          <n-space>
            <PromptTag
              v-for="(textItem, idx) in promptTextList"
              :key="idx"
              :text="textItem"
            />
          </n-space>
        </div>
        <div
          relative
          flex="1"
          w-full
          px-1em
        >
          <n-input
            ref="refInputTextString"
            v-model:value="inputTextString"
            type="textarea"
            autofocus
            h-full
            class="textarea-resize-none text-15"
            :style="{
              '--n-border-radius': '20px',
              '--n-padding-left': '20px',
              '--n-padding-right': '20px',
              '--n-padding-vertical': '10px',
            }"
            :placeholder="placeholder"
          />
          <n-float-button
            position="absolute"
            :right="40"
            bottom="50%"
            :type="stylizingLoading ? 'primary' : 'default'"
            color
            :class="[
              stylizingLoading && 'opacity-90',
              'translate-y-50%'
            ]"
            @click.stop="handleCreateStylized()"
          >
            <div
              v-if="stylizingLoading"
              class="i-svg-spinners:pulse-2 c-#fff"
            ></div>
            <div
              v-else
              class="transform-rotate-z--90 text-22 c-#303133/70 i-hugeicons:start-up-02"
            ></div>
          </n-float-button>
        </div>
      </div>
    </div>
  </LayoutCenterPanel>
</template>

<style lang="scss" scoped>

</style>
