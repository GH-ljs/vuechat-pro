<script lang="tsx" setup>
import { type ContentPart, modelMappingList } from '@/components/MarkdownPreview/models'
import { renderMarkdownText } from '@/components/MarkdownPreview/plugins/markdown'
import { type InputInst } from 'naive-ui'
import type { SelectBaseOption } from 'naive-ui/es/select/src/interface'
import { UAParser } from 'ua-parser-js'
import { useConfigStore } from '@/store/config'
import MarkdownPreview from '@/components/MarkdownPreview/index.vue'

const route = useRoute()
const router = useRouter()
const businessStore = useBusinessStore()
const configStore = useConfigStore()

// 设置弹窗状态
const showSettings = ref(false)

onMounted(() => {
  if (businessStore.loadHistory) {
    businessStore.loadHistory()
  }
})

// 模型列表下拉框
const modelListSelections = computed(() => {
  return modelMappingList.map<SelectBaseOption>((modelItem) => {
    return {
      label: modelItem.label,
      value: modelItem.modelName,
      disabled: false
    }
  })
})

// === 判断当前选中的模型是否支持识图 ===
const isVisionModel = computed(() => {
  const current = businessStore.currentModelItem
  return current?.supportVision === true
})

const loading = ref(true)
setTimeout(() => { loading.value = false }, 700)

const stylizingLoading = ref(false)
const inputTextString = ref('')
const refInputTextString = ref<InputInst | null>()

const aiReplyingText = ref('')
const messageContainer = ref<HTMLElement>()

// ================= 多模态：图片压缩与预览核心逻辑 =================
const selectedImageBase64 = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 触发隐藏的文件选择器
const triggerFileUpload = () => {
  if (!isVisionModel.value) {
    window.$ModalMessage.warning('当前选中的模型不支持识图，请先在右上角切换至支持识图的模型 (如 Qwen-VL)')
    return
  }
  fileInputRef.value?.click()
}

/**
 * 核心技术点：纯前端 Canvas 图片压缩算法
 * 将用户的高清大图等比缩放并压缩质量，防止 Base64 字符串过长撑爆 Token 或导致请求 413 错误
 */
const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = () => {
        // 计算缩放比例
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        // 绘制到 Canvas 上
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)

        // 导出压缩后的 Base64 (转为 JPEG 格式以支持质量压缩)
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality)
        resolve(compressedBase64)
      }
      img.onerror = (e) => reject(e)
    }
    reader.onerror = (e) => reject(e)
  })
}

// 处理图片选择并执行压缩
const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    window.$ModalMessage.error('请上传图片文件')
    target.value = ''
    return
  }

  try {
    // 限制单张原图大小 10MB
    if (file.size > 10 * 1024 * 1024) {
      window.$ModalMessage.warning('图片过大，正在为您进行高强度压缩...')
    }

    // 执行压缩：最大宽度 1000px，质量 0.6
    const compressedBase64 = await compressImage(file, 1000, 0.6)
    selectedImageBase64.value = compressedBase64

  } catch (error) {
    console.error('图片压缩失败:', error)
    window.$ModalMessage.error('图片处理失败，请重试')
  } finally {
    // 清空 input，允许重复选择同一张图
    target.value = ''
  }
}

const clearSelectedImage = () => {
  selectedImageBase64.value = null
}

// 辅助函数
const isArrayContent = (content: any): content is ContentPart[] => Array.isArray(content)
const extractTextFromParts = (parts: ContentPart[]) => parts.find(p => p.type === 'text')?.text || ''
const extractImageFromParts = (parts: ContentPart[]) => {
  const imgPart = parts.find(p => p.type === 'image_url') as { image_url: { url: string; }; } | undefined
  return imgPart?.image_url.url || ''
}
// ================================================================

const scrollToBottom = async () => {
  await nextTick()
  if (messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  }
}

const handleCreateStylized = async () => {
  if (stylizingLoading.value) {
    businessStore.abortRequest()
    stylizingLoading.value = false
    if (aiReplyingText.value) {
      await businessStore.appendMessage({
        role: 'assistant',
        content: aiReplyingText.value
      })
      aiReplyingText.value = ''
    }
    return
  }

  const textTrimmed = inputTextString.value.trim()
  if (!textTrimmed && !selectedImageBase64.value) {
    refInputTextString.value?.focus()
    return
  }

  let payloadContent: string | ContentPart[] = textTrimmed

  // 如果包含图片，组装成多模态结构
  if (selectedImageBase64.value) {
    payloadContent = [
      {
        type: 'image_url',
        image_url: {
          url: selectedImageBase64.value
        }
      }
    ]
    if (textTrimmed) {
      payloadContent.push({
        type: 'text',
        text: textTrimmed
      })
    }
  }

  inputTextString.value = ''
  clearSelectedImage()

  await businessStore.appendMessage({
    role: 'user',
    content: payloadContent
  })
  scrollToBottom()

  stylizingLoading.value = true
  aiReplyingText.value = ''

  await businessStore.streamAssistantReply({
    onMessage: (textChunk) => {
      aiReplyingText.value += textChunk
      scrollToBottom()
    },
    onClose: async () => {
      stylizingLoading.value = false
      if (aiReplyingText.value) {
        await businessStore.appendMessage({
          role: 'assistant',
          content: aiReplyingText.value
        })
      }
      aiReplyingText.value = ''
      setTimeout(() => refInputTextString.value?.focus())
    },
    onError: (err) => {
      stylizingLoading.value = false
      aiReplyingText.value = ''
      window.$ModalMessage.error(err.message || '网络连接或 API Key 异常')
    }
  })
}

const handleDeleteSession = (id: string) => {
  window.$ModalDialog.warning({
    title: '删除对话',
    content: '确定要删除这条对话记录吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => businessStore.deleteSession(id)
  })
}

watch(() => businessStore.activeSessionId, () => {
  if (stylizingLoading.value) {
    businessStore.abortRequest()
    stylizingLoading.value = false
    aiReplyingText.value = ''
  }
  clearSelectedImage()
  setTimeout(scrollToBottom, 100)
})

const keys = useMagicKeys()
const enterCommand = keys['Meta+Enter']
const enterCtrl = keys['Ctrl+Enter']
const activeElement = useActiveElement()
const notUsingInput = computed(() => activeElement.value?.tagName !== 'TEXTAREA')
const parser = new UAParser()
const isMacos = computed(() => (parser.getOS().name ?? '').toLowerCase().includes('macos'))

const placeholder = computed(() => {
  if (stylizingLoading.value) return `AI 思考中...`
  return `输入问题，或点击左侧上传图片...`
})

watch(() => enterCommand.value, () => {
  if (!isMacos.value || notUsingInput.value || stylizingLoading.value) return
  if (!enterCommand.value) handleCreateStylized()
}, {
  deep: true
})

watch(() => enterCtrl.value, () => {
  if (isMacos.value || notUsingInput.value || stylizingLoading.value) return
  if (!enterCtrl.value) handleCreateStylized()
}, {
  deep: true
})

const PromptTag = defineComponent({
  props: {
    text: {
      type: String,
      default: ''
    }
  },
  setup(props) {
    return {
      handleClick: () => {
        inputTextString.value = props.text
        nextTick(() => refInputTextString.value?.focus())
      }
    }
  },
  render() {
    return (
      <div
        b="~ solid transparent"
        hover="shadow-[--shadow] b-primary bg-#e8e8e8"
        class="px-10 py-2 rounded-7 text-12 max-w-230 transition-all-300 select-none cursor-pointer c-#525252 bg-#ededed"
        style={{
          '--shadow': '3px 3px 3px -1px rgba(0,0,0,0.1)'
        }}
        onClick={this.handleClick}
      >
        <n-ellipsis tooltip={{
          contentClass: 'wrapper-tooltip-scroller',
          keepAliveOnHover: true
        }}>
          {{
            tooltip: () => this.text,
            default: () => this.text
          }}
        </n-ellipsis>
      </div>
    )
  }
})

const promptTextList = ref(['写一段自我介绍', '请用 Vue3 写一个倒计时组件'])
</script>

<template>
  <div class="w-full h-100vh flex bg-[#f4f6f8]">
    <!-- 左侧侧边栏 -->
    <div class="w-260px bg-[#fafbfc] border-r border-[#e5e5e5] flex flex-col hidden sm:flex">
      <div class="p-16 border-b border-[#e5e5e5]">
        <n-button
          dashed
          block
          type="primary"
          size="large"
          @click="businessStore.addSession()"
        >
          <template #icon><div class="i-ic:round-add text-20"></div></template>
          新建对话
        </n-button>
      </div>
      <div class="flex-1 overflow-y-auto p-12">
        <div
          v-for="session in businessStore.sessions"
          :key="session.id"
          class="px-12 py-14 mb-8 rounded-8 cursor-pointer transition-colors flex items-center justify-between group border border-transparent"
          :class="businessStore.activeSessionId === session.id ? 'bg-[#e6f1fc] border-[#bae0ff] text-[#18a058] font-bold' : 'hover:bg-[#f0f2f5] text-[#333]'"
          @click="businessStore.switchSession(session.id)"
        >
          <div class="i-hugeicons:chat-01 text-16 mr-8 opacity-70"></div>
          <div class="truncate text-14 flex-1 mr-4">{{ session.title }}</div>
          <div
            class="opacity-0 group-hover:opacity-100 transition-opacity p-4 rounded-4 hover:bg-white"
            @click.stop="handleDeleteSession(session.id)"
          >
            <div class="i-ic:round-delete text-18 text-red-500 hover:text-red-700"></div>
          </div>
        </div>
      </div>
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

    <!-- 右侧聊天区域 -->
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
                  <n-select
                    v-model:value="businessStore.systemModelName"
                    class="w-180 lt-xs:w-160 font-bold"
                    placeholder="请选择"
                    :disabled="stylizingLoading"
                    :options="modelListSelections"
                  />
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
              <!-- 渲染历史记录 -->
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
                  class="max-w-[85%] rounded-12 p-16 shadow-sm overflow-hidden"
                  :class="msg.role === 'user' ? 'bg-[#e5e5e5] text-[#333] rounded-tr-4' : 'bg-[#fff] border border-[#eee] text-[#333] markdown-wrapper rounded-tl-4'"
                >
                  <template v-if="msg.role === 'user'">
                    <!-- 多模态渲染 -->
                    <template v-if="isArrayContent(msg.content)">
                      <div class="flex flex-col items-end gap-2">
                        <img
                          v-if="extractImageFromParts(msg.content)"
                          :src="extractImageFromParts(msg.content)"
                          class="max-w-200px max-h-200px rounded-8 object-cover border border-[#ddd]"
                        >
                        <div class="whitespace-pre-wrap">{{ extractTextFromParts(msg.content) }}</div>
                      </div>
                    </template>
                    <template v-else><div class="whitespace-pre-wrap">{{ msg.content }}</div></template>
                  </template>
                  <template v-else><div v-html="renderMarkdownText(msg.content as string)"></div></template>
                </div>

                <div
                  v-if="msg.role === 'user'"
                  class="w-36 h-36 rounded-full bg-gray-300 flex items-center justify-center ml-12 shrink-0 mt-4"
                >
                  <div class="i-hugeicons:user text-white text-20"></div>
                </div>
              </div>

              <!-- 打字机 -->
              <div
                v-show="stylizingLoading"
                class="flex justify-start mb-24"
              >
                <div class="w-36 h-36 rounded-full bg-primary flex items-center justify-center mr-12 shrink-0 mt-4">
                  <div class="i-hugeicons:ai-chat-02 text-white text-20"></div>
                </div>
                <div class="max-w-[85%] rounded-12 rounded-tl-4 border border-[#eee] bg-[#fff] p-16 shadow-sm min-w-100">
                  <MarkdownPreview
                    :text="aiReplyingText"
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
              />
            </template>
          </div>

          <!-- 底部输入操作区 -->
          <div class="flex flex-col items-center px-16 pb-20 pt-10 sm:px-40 bg-white/80 backdrop-blur-md border-t border-[#f0f0f0]">
            <!-- Prompt快捷语 -->
            <div class="w-full flex justify-start pb-10">
              <n-space>
                <PromptTag
                  v-for="(textItem, idx) in promptTextList"
                  :key="idx"
                  :text="textItem"
                />
              </n-space>
            </div>

            <!-- 图片预览区 -->
            <div
              v-if="selectedImageBase64"
              class="w-full flex justify-start mb-10"
            >
              <div class="relative inline-block">
                <img
                  :src="selectedImageBase64"
                  class="h-60px rounded-8 border border-gray-200 shadow-sm"
                  alt="preview"
                >
                <div
                  class="absolute -top-6 -right-6 w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white cursor-pointer shadow-md hover:bg-red-600"
                  @click="clearSelectedImage"
                >
                  <div class="i-ic:round-close text-14"></div>
                </div>
              </div>
            </div>

            <!-- 【修改核心】修复了这里的 Flex 布局，保证 Input 高度正常 -->
            <div class="relative flex w-full items-end gap-10">
              <!-- 隐藏上传 -->
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleFileChange"
              >

              <!-- 上传按钮 -->
              <n-button
                circle
                size="large"
                class="mb-2 shrink-0 shadow-sm transition-all duration-300"
                :type="isVisionModel ? 'default' : 'tertiary'"
                @click="triggerFileUpload"
              >
                <template #icon>
                  <div
                    class="i-hugeicons:image-02 text-20"
                    :class="isVisionModel ? 'text-primary' : 'text-gray-400'"
                  ></div>
                </template>
              </n-button>

              <!-- 输入框 -->
              <div class="relative flex-1">
                <n-input
                  ref="refInputTextString"
                  v-model:value="inputTextString"
                  type="textarea"
                  autofocus
                  :autosize="{ minRows: 1, maxRows: 5 }"
                  class="text-15 shadow-sm rounded-16"
                  :style="{'--n-padding-left': '16px', '--n-padding-right': '60px', '--n-padding-vertical': '12px'}"
                  :placeholder="placeholder"
                />
                <n-float-button
                  position="absolute"
                  :right="8"
                  bottom="6"
                  :width="36"
                  :height="36"
                  :type="stylizingLoading ? 'default' : ((inputTextString.trim() || selectedImageBase64) ? 'primary' : 'default')"
                  @click.stop="handleCreateStylized()"
                >
                  <div
                    v-if="stylizingLoading"
                    class="i-ic:round-stop c-#fff text-20"
                  ></div>
                  <div
                    v-else
                    class="text-20"
                    :class="(inputTextString.trim() || selectedImageBase64) ? 'c-#fff i-hugeicons:sent' : 'c-#999 i-hugeicons:start-up-02'"
                  ></div>
                </n-float-button>
              </div>
            </div>
          </div>
        </div>
      </LayoutCenterPanel>
    </div>

    <!-- 全局设置弹窗 -->
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
        <n-tab-pane
          name="api"
          tab="模型接口配置"
        >
          <n-alert
            title="数据隐私安全"
            type="info"
            class="mb-20"
          >
            配置仅保存在本地（LocalStorage）。
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

            <!-- 【新增】添加了 Qwen 的配置入口
            <n-form-item label="Qwen (通义千问)">
              <n-input
                v-model:value="configStore.apiKeys.qwen"
                placeholder="填写通义千问或硅基流动 Key"
                type="password"
                show-password-on="click"
              />
            </n-form-item> -->

            <n-form-item label="Moonshot">
              <n-input
                v-model:value="configStore.apiKeys.moonshot"
                placeholder="sk-..."
                type="password"
                show-password-on="click"
              />
            </n-form-item>
          </n-form>
        </n-tab-pane>
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
            <div class="text-12 text-gray-400 mt-[-10px] mb-20">值越大，回复随机性越高；值越小，回复越严谨确切。</div>
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
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background-color: rgb(0 0 0 / 15%);
}

::-webkit-scrollbar-thumb {
  border-radius: 10px;
}
</style>
