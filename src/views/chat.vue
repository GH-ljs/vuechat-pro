<script lang="tsx" setup>
import { modelMappingList } from '@/components/MarkdownPreview/models'
import { renderMarkdownText } from '@/components/MarkdownPreview/plugins/markdown'
import { type InputInst } from 'naive-ui'
import type { SelectBaseOption } from 'naive-ui/es/select/src/interface'
import { UAParser } from 'ua-parser-js'
import { useConfigStore } from '@/store/config'

const route = useRoute()
const router = useRouter()
const businessStore = useBusinessStore()
const configStore = useConfigStore()

// 设置弹窗状态
const showSettings = ref(false)

onMounted(() => {
  // 组件挂载时，加载历史记录
  if (businessStore.loadHistory) {
    businessStore.loadHistory()
  }
})

// 将模型列表转换为 Select 组件的选项格式
const modelListSelections = computed(() => {
  return modelMappingList.map<SelectBaseOption>((modelItem) => {
    return {
      label: modelItem.label,
      value: modelItem.modelName,
      disabled: false
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

// 滚动容器的 ref
const messageContainer = ref<HTMLElement>()

const scrollToBottom = async () => {
  await nextTick()
  if (messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  }
}

// ============== 核心改动：新的流式接收逻辑 ==============

// 存放当前正在打字的 AI 回复的响应式变量
const aiReplyingText = ref('')

// 处理发送消息的逻辑
const handleCreateStylized = async () => {
  // 如果正在加载（打字机进行中），点击按钮则强行中止生成
  if (stylizingLoading.value) {
    businessStore.abortRequest()
    stylizingLoading.value = false
    // 中止后，如果已经输出了一部分文字，把这部分文字保存为历史记录
    if (aiReplyingText.value) {
      await businessStore.appendMessage({
        role: 'assistant',
        content: aiReplyingText.value
      })
      aiReplyingText.value = ''
    }
    return
  }

  // 校验空输入
  if (refInputTextString.value && !inputTextString.value.trim()) {
    inputTextString.value = ''
    refInputTextString.value.focus()
    return
  }

  // 1. 将用户的输入存入历史记录
  const textContent = inputTextString.value
  inputTextString.value = ''
  await businessStore.appendMessage({
    role: 'user',
    content: textContent
  })

  scrollToBottom()

  // 2. 准备接收流式输出
  stylizingLoading.value = true
  aiReplyingText.value = '' // 清空上一次的打字机内容

  // 3. 调用 Store 中封装好的 SSE 方法
  await businessStore.streamAssistantReply({
    onMessage: (textChunk) => {
      // 接收到增量文本块，累加到响应式变量中
      aiReplyingText.value += textChunk
      scrollToBottom() // 保证滚动条一直跟随最新文字
    },
    onClose: async () => {
      // 流式接收正常结束
      stylizingLoading.value = false
      if (aiReplyingText.value) {
        // 将完整的 AI 回复存入上下文
        await businessStore.appendMessage({
          role: 'assistant',
          content: aiReplyingText.value
        })
      }
      aiReplyingText.value = '' // 清空打字状态
      setTimeout(() => refInputTextString.value?.focus())
    },
    onError: (err) => {
      // 发生网络或配置错误
      stylizingLoading.value = false
      aiReplyingText.value = ''
      window.$ModalMessage.error(err.message || '网络连接或 API Key 异常，请检查设置。')
      setTimeout(() => refInputTextString.value?.focus())
    }
  })
}

// ======================================================

// 删除单个会话
const handleDeleteSession = (id: string) => {
  window.$ModalDialog.warning({
    title: '删除对话',
    content: '确定要删除这条对话记录吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      businessStore.deleteSession(id)
      window.$ModalMessage.success('对话已删除')
    }
  })
}

// 监听会话切换：如果正在输出时切换了会话，强制中断请求
watch(() => businessStore.activeSessionId, () => {
  if (stylizingLoading.value) {
    businessStore.abortRequest()
    stylizingLoading.value = false
    aiReplyingText.value = ''
  }
  setTimeout(scrollToBottom, 100)
})

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
    return `AI 思考中，点击右侧按钮可终止...`
  }
  return `输入任意问题, 按 ${ isMacos.value ? 'Command' : 'Ctrl' } + Enter 键快捷开始...`
})

// 监听快捷键：Meta/Ctrl + Enter 触发发送
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

// 监听 Ctrl+Enter 快捷键（Windows/Linux）
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

// 初始化状态
const handleResetState = () => {
  inputTextString.value = ''
  stylizingLoading.value = false
  aiReplyingText.value = ''
  nextTick(() => {
    refInputTextString.value?.focus()
  })
}
handleResetState()

// 定义一个可复用的 PromptTag 组件，用于展示预设提示语并支持点击快速填充输入框
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
  '写一段自我介绍',
  '请用 Vue3 写一个倒计时组件'
])
</script>

<template>
  <div class="w-full h-100vh flex bg-[#f4f6f8]">
    <!-- 左侧会话列表侧边栏 -->
    <div class="w-260px bg-[#fafbfc] border-r border-[#e5e5e5] flex flex-col hidden sm:flex">
      <div class="p-16 border-b border-[#e5e5e5]">
        <n-button
          dashed
          block
          type="primary"
          size="large"
          @click="businessStore.addSession()"
        >
          <template #icon>
            <div class="i-ic:round-add text-20"></div>
          </template>
          新建对话
        </n-button>
      </div>

      <!-- 会话列表滚动区 -->
      <div class="flex-1 overflow-y-auto p-12">
        <div
          v-for="session in businessStore.sessions"
          :key="session.id"
          class="px-12 py-14 mb-8 rounded-8 cursor-pointer transition-colors flex items-center justify-between group border border-transparent"
          :class="businessStore.activeSessionId === session.id
            ? 'bg-[#e6f1fc] border-[#bae0ff] text-[#18a058] font-bold'
            : 'hover:bg-[#f0f2f5] text-[#333]'"
          @click="businessStore.switchSession(session.id)"
        >
          <div class="i-hugeicons:chat-01 text-16 mr-8 opacity-70"></div>
          <div class="truncate text-14 flex-1 mr-4">
            {{ session.title }}
          </div>
          <div
            class="opacity-0 group-hover:opacity-100 transition-opacity p-4 rounded-4 hover:bg-white"
            @click.stop="handleDeleteSession(session.id)"
          >
            <div class="i-ic:round-delete text-18 text-red-500 hover:text-red-700"></div>
          </div>
        </div>
      </div>

      <!-- 侧边栏底部添加设置按钮 -->
      <div class="p-12 border-t border-[#e5e5e5]">
        <div
          class="px-12 py-12 rounded-8 cursor-pointer transition-colors hover:bg-[#f0f2f5] text-[#333] flex items-center"
          @click="showSettings = true"
        >
          <div class="i-hugeicons:settings-01 text-18 mr-8"></div>
          <div class="text-14 font-medium">全局设置</div>
        </div>
      </div>
    </div>

    <!-- 右侧聊天主区域 -->
    <div class="flex-1 h-full min-w-0 relative">
      <LayoutCenterPanel
        :loading="loading"
        class="h-full !rounded-none"
      >
        <div
          flex="~ col"
          h-full
        >
          <div
            flex="~ justify-between items-center"
            class="border-b border-[#eee] py-8"
          >
            <NavigationNavBar>
              <template #right>
                <div
                  flex="~ justify-center items-center wrap"
                  class="text-16 line-height-16 pr-10"
                >
                  <span class="lt-xs:hidden text-14 c-gray-500 mr-10">模型驱动：</span>
                  <div flex="~ justify-center items-center">
                    <n-select
                      v-model:value="businessStore.systemModelName"
                      class="w-180 lt-xs:w-160 font-bold"
                      placeholder="请选择模型"
                      :disabled="stylizingLoading"
                      :options="modelListSelections"
                    />
                  </div>
                </div>
              </template>
            </NavigationNavBar>
          </div>

          <div
            ref="messageContainer"
            flex="1 ~ col"
            min-h-0
            pb-20
            class="overflow-y-auto px-16 pt-20 sm:px-40"
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
                  v-if="msg.role !== 'user'"
                  class="w-36 h-36 rounded-full bg-primary flex items-center justify-center mr-12 shrink-0 mt-4"
                >
                  <div class="i-hugeicons:ai-chat-02 text-white text-20"></div>
                </div>

                <div
                  class="max-w-[85%] rounded-12 p-16 shadow-sm"
                  :class="msg.role === 'user'
                    ? 'bg-[#e5e5e5] text-[#333] rounded-tr-4'
                    : 'bg-[#fff] border border-[#eee] text-[#333] markdown-wrapper rounded-tl-4'"
                >
                  <template v-if="msg.role === 'user'">
                    <div class="whitespace-pre-wrap">{{ msg.content }}</div>
                  </template>
                  <template v-else>
                    <div v-html="renderMarkdownText(msg.content)"></div>
                  </template>
                </div>

                <div
                  v-if="msg.role === 'user'"
                  class="w-36 h-36 rounded-full bg-gray-300 flex items-center justify-center ml-12 shrink-0 mt-4"
                >
                  <div class="i-hugeicons:user text-white text-20"></div>
                </div>
              </div>

              <!-- 正在输出的流式打字机占位 -->
              <div
                v-show="stylizingLoading"
                class="flex justify-start mb-24"
              >
                <div class="w-36 h-36 rounded-full bg-primary flex items-center justify-center mr-12 shrink-0 mt-4">
                  <div class="i-hugeicons:ai-chat-02 text-white text-20"></div>
                </div>
                <div class="max-w-[85%] rounded-12 rounded-tl-4 border border-[#eee] bg-[#fff] p-16 shadow-sm min-w-100">
                  <!-- 调用改造后的瘦身版 MarkdownPreview -->
                  <MarkdownPreview
                    :text="aiReplyingText"
                    :model="businessStore.currentModelItem?.modelName"
                    :loading="stylizingLoading"
                  />
                </div>
              </div>
            </template>

            <template v-else>
              <n-empty
                size="large"
                class="font-bold h-full flex items-center justify-center mt-[-10%]"
                description="VueChat Pro"
              >
                <template #icon>
                  <n-icon class="text-primary opacity-60 text-60">
                    <div class="i-hugeicons:ai-chat-02"></div>
                  </n-icon>
                </template>
                <div class="text-14 font-normal text-gray-400 mt-10">随时开始一段新的对话</div>
              </n-empty>
            </template>
          </div>

          <!-- 底部输入区域 -->
          <div
            flex="~ col items-center"
            class="px-16 pb-20 pt-10 sm:px-40 bg-white/80 backdrop-blur-md border-t border-[#f0f0f0]"
          >
            <div
              w-full
              flex="~ justify-start"
              class="pb-10"
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
            >
              <n-input
                ref="refInputTextString"
                v-model:value="inputTextString"
                type="textarea"
                autofocus
                h-full
                class="textarea-resize-none text-15 shadow-sm"
                :style="{
                  '--n-border-radius': '16px',
                  '--n-padding-left': '20px',
                  '--n-padding-right': '60px',
                  '--n-padding-vertical': '14px',
                  '--n-border': '1px solid #e0e0e0',
                  '--n-border-focus': '1px solid #18a058',
                  '--n-box-shadow-focus': '0 0 0 2px rgba(24, 160, 88, 0.2)'
                }"
                :placeholder="placeholder"
              />
              <n-float-button
                position="absolute"
                :right="12"
                bottom="12"
                :width="40"
                :height="40"
                :type="stylizingLoading ? 'default' : (inputTextString.trim() ? 'primary' : 'default')"
                color
                :class="[stylizingLoading && 'opacity-90']"
                @click.stop="handleCreateStylized()"
              >
                <!-- 如果正在加载，按钮变为停止图标（方形） -->
                <div
                  v-if="stylizingLoading"
                  class="i-ic:round-stop c-#fff text-20"
                ></div>
                <!-- 否则显示发送图标 -->
                <div
                  v-else
                  class="text-20"
                  :class="inputTextString.trim() ? 'c-#fff i-hugeicons:sent' : 'c-#999 i-hugeicons:start-up-02'"
                ></div>
              </n-float-button>
            </div>
          </div>
        </div>
      </LayoutCenterPanel>
    </div>

    <!-- 新增设置弹窗 (Settings Modal) -->
    <n-modal
      v-model:show="showSettings"
      preset="card"
      title="全局设置"
      class="w-500px max-w-90vw"
      :bordered="false"
      size="huge"
    >
      <n-tabs
        type="line"
        animated
      >
        <!-- API 配置面板 -->
        <n-tab-pane
          name="api"
          tab="模型接口配置"
        >
          <n-alert
            title="数据隐私安全"
            type="info"
            class="mb-20"
          >
            您的 API Key 仅保存在浏览器本地（LocalStorage），不会上传至任何第三方服务器。留空则默认使用系统配置。
          </n-alert>
          <n-form
            label-placement="left"
            label-width="auto"
            require-mark-placement="right-hanging"
          >
            <n-form-item label="DeepSeek">
              <n-input
                v-model:value="configStore.apiKeys.deepseek"
                placeholder="sk-..."
                type="password"
                show-password-on="click"
              />
            </n-form-item>
            <n-form-item label="SiliconFlow">
              <n-input
                v-model:value="configStore.apiKeys.siliconflow"
                placeholder="sk-..."
                type="password"
                show-password-on="click"
              />
            </n-form-item>
            <n-form-item label="Moonshot">
              <n-input
                v-model:value="configStore.apiKeys.moonshot"
                placeholder="sk-..."
                type="password"
                show-password-on="click"
              />
            </n-form-item>
            <n-form-item label="Spark 星火">
              <n-input
                v-model:value="configStore.apiKeys.spark"
                placeholder="key:secret 格式"
                type="password"
                show-password-on="click"
              />
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- 通用参数面板 -->
        <n-tab-pane
          name="general"
          tab="通用参数"
        >
          <n-form>
            <n-form-item label="发散度 (Temperature)">
              <div class="flex-1 w-full flex items-center gap-4">
                <n-slider
                  v-model:value="configStore.temperature"
                  :step="0.1"
                  :min="0"
                  :max="2"
                />
                <span class="w-40px text-right font-mono">{{ configStore.temperature }}</span>
              </div>
            </n-form-item>
            <div class="text-12 text-gray-400 mt-[-10px] mb-20">
              值越大，AI 回复的随机性和创造性越高；值越小，回复越严谨确切。推荐：写代码 0.1，写文章 0.7+
            </div>
          </n-form>
        </n-tab-pane>
      </n-tabs>
      <template #footer>
        <div class="flex justify-end mt-10">
          <n-button
            type="primary"
            @click="showSettings = false"
          >
            完成
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style lang="scss" scoped>
/* 自定义滚动条美化 */

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background-color: rgb(0 0 0 / 15%);
  border-radius: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}
</style>
