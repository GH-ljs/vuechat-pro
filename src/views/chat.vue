<script lang="tsx" setup>
import { type ContentPart, modelMappingList } from '@/components/MarkdownPreview/models'
import { renderMarkdownText } from '@/components/MarkdownPreview/plugins/markdown'
import { type InputInst } from 'naive-ui'
import type { SelectBaseOption } from 'naive-ui/es/select/src/interface'
import { UAParser } from 'ua-parser-js'
import { useConfigStore } from '@/store/config'
import { useAppStore } from '@/store/hooks/useAppStore'
import MarkdownPreview from '@/components/MarkdownPreview/index.vue'
import ChatSideBarContent from './components/ChatSideBarContent.vue'
import { useWindowSize } from '@vueuse/core'

// 引入文档解析 Worker (Vite 语法)
import DocParserWorker from '@/workers/docParser.worker?worker'

const { width: windowWidth } = useWindowSize()

const route = useRoute()
const router = useRouter()
const businessStore = useBusinessStore()
const configStore = useConfigStore()
const appStore = useAppStore()

const showSettings = ref(false)

onMounted(() => {
  if (businessStore.loadHistory) businessStore.loadHistory()
})

const modelListSelections = computed(() => {
  return modelMappingList.map<SelectBaseOption>((m) => ({
    label: m.label,
    value: m.modelName,
    disabled: false
  }))
})

const isVisionModel = computed(() => businessStore.currentModelItem?.supportVision === true)

const loading = ref(true)
setTimeout(() => { loading.value = false }, 700)

const stylizingLoading = ref(false)
const inputTextString = ref('')
const refInputTextString = ref<InputInst | null>()

const aiReplyingText = ref('')
const messageContainer = ref<HTMLElement>() // keep for any remaining ref if any


// ================= 状态 1：图片上传 =================
const selectedImageBase64 = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 提取为独立的函数，并在 script 里面使用 .value
const triggerFileUpload = () => {
  if (!isVisionModel.value) {
    window.$ModalMessage.warning('需切换至视觉模型')
    return
  }
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}

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
    selectedImageBase64.value = await compressImage(file, 1000, 0.6)
  } catch (error) {
    window.$ModalMessage.error('图片压缩失败')
  } finally {
    target.value = ''
  }
}
const clearSelectedImage = () => { selectedImageBase64.value = null }

// ================= 状态 2：文档 (RAG) 解析 =================
const selectedDocFile = ref<File | null>(null)
const selectedDocType = ref<string>('unknown')
const parsedDocText = ref<string>('')
const isParsingDoc = ref(false)
const docInputRef = ref<HTMLInputElement | null>(null)

// 提取为独立的函数，并在 script 里面使用 .value
const triggerDocUpload = () => {
  if (docInputRef.value) {
    docInputRef.value.click()
  }
}

const handleDocChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  let fileType = 'unknown'
  if (file.type === 'application/pdf') fileType = 'pdf'
  else if (file.type === 'text/plain') fileType = 'txt'
  else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') fileType = 'word'

  if (fileType === 'unknown') {
    window.$ModalMessage.error('仅支持 PDF、TXT 或 Word(.docx) 格式文档')
    target.value = ''
    return
  }

  if (file.size > 15 * 1024 * 1024) {
    window.$ModalMessage.error('文档大小不能超过 15MB')
    target.value = ''
    return
  }

  selectedDocFile.value = file
  isParsingDoc.value = true

  try {
    // 解决方案 2：在主线程提前将 File 转换为 ArrayBuffer，并传递 ArrayBuffer，避免由于 File 对象的特殊性导致的传值异常
    const arrayBuffer = await file.arrayBuffer()

    const worker = new DocParserWorker()

    worker.onmessage = (event) => {
      const { status, text, error, fileType: returnedType } = event.data
      isParsingDoc.value = false

      if (status === 'success') {
        parsedDocText.value = text
        selectedDocType.value = returnedType
        window.$ModalMessage.success(`《${ file.name }》 文本提取完成！`)
      } else {
        window.$ModalMessage.error(`解析失败: ${ error }`)
        clearDoc()
      }
      worker.terminate()
    }

    worker.postMessage({
      type: 'PARSE_DOC',
      arrayBuffer, // 纯净的二进制流
      fileName: file.name,
      fileType
    })

  } catch (err: any) {
    isParsingDoc.value = false
    window.$ModalMessage.error(`读取文件流失败: ${ err.message }`)
    clearDoc()
  } finally {
    target.value = ''
  }
}

const clearDoc = () => {
  selectedDocFile.value = null
  parsedDocText.value = ''
  selectedDocType.value = 'unknown'
}
// =========================================================

// 工具函数
const isArrayContent = (content: any): content is ContentPart[] => Array.isArray(content)
const extractTextFromParts = (parts: ContentPart[]) => parts.find(p => p.type === 'text')?.text || ''
const extractImageFromParts = (parts: ContentPart[]) => {
  const imgPart = parts.find(p => p.type === 'image_url') as { image_url: { url: string; }; } | undefined
  return imgPart?.image_url.url || ''
}

const messageScroller = ref<any>(null)

const scrollToBottom = async () => {
  await nextTick()
  if (messageScroller.value?.$el) {
    messageScroller.value.$el.scrollTop = messageScroller.value.$el.scrollHeight
  }
}

// 核心发送逻辑
const handleCreateStylized = async () => {
  if (stylizingLoading.value || isParsingDoc.value) return

  const textTrimmed = inputTextString.value.trim()
  if (!textTrimmed && !selectedImageBase64.value && !selectedDocFile.value) {
    refInputTextString.value?.focus()
    return
  }

  // 1. 组装可见内容（文本+图片）
  let payloadContent: string | ContentPart[] = textTrimmed || '请分析附加内容。'
  if (selectedImageBase64.value) {
    payloadContent = [
      {
        type: 'image_url',
        image_url: {
          url: selectedImageBase64.value
        }
      }
    ]
    if (textTrimmed) payloadContent.push({
      type: 'text',
      text: textTrimmed
    })
  }

  const newUserMessage: any = {
    role: 'user',
    content: payloadContent
  }

  // 2. 组装隐式 RAG 内容（文档）
  if (selectedDocFile.value && parsedDocText.value) {
    newUserMessage.attachContext = parsedDocText.value
    // 在气泡里增加一个小尾巴，提示发送了文档
    if (typeof newUserMessage.content === 'string') {
      newUserMessage.content = `[📄 已载入文档: ${ selectedDocFile.value.name }]\n\n${ newUserMessage.content }`
    }
  }

  inputTextString.value = ''
  clearSelectedImage()
  clearDoc()

  await businessStore.appendMessage(newUserMessage)
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
      window.$ModalMessage.error(err.message || '请求异常')
    }
  })
}

// ... 快捷键与清除等逻辑保持不变 ...
const keys = useMagicKeys()
const enterCommand = keys['Meta+Enter']
const enterCtrl = keys['Ctrl+Enter']
const activeElement = useActiveElement()
const notUsingInput = computed(() => activeElement.value?.tagName !== 'TEXTAREA')
const parser = new UAParser()
const isMacos = computed(() => (parser.getOS().name ?? '').toLowerCase().includes('macos'))

const placeholder = computed(() => {
  if (stylizingLoading.value) return `AI 思考中...`
  return `输入问题，或拖拽文件...`
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

watch(() => businessStore.activeSessionId, () => {
  if (stylizingLoading.value) { businessStore.abortRequest(); stylizingLoading.value = false; aiReplyingText.value = '' }
  clearSelectedImage()
  clearDoc()
  setTimeout(scrollToBottom, 100)
})

watch(() => windowWidth.value, (newWidth) => {
  if (newWidth >= 640 && appStore.showMobileDrawer) {
    appStore.showMobileDrawer = false
  }
})
</script>

<template>
  <div class="w-full h-100vh flex bg-[#f4f6f8]">
    <!-- 左侧侧边栏 (PC 端) -->
    <div class="w-260px bg-[#fafbfc] border-r border-[#e5e5e5] hidden sm:flex flex-col">
      <ChatSideBarContent @show-settings="showSettings = true" />
    </div>

    <!-- 移动端侧边栏 (Drawer) -->
    <n-drawer
      v-model:show="appStore.showMobileDrawer"
      :width="260"
      placement="left"
    >
      <n-drawer-content body-content-style="padding: 0; display: flex; flex-direction: column;">
        <ChatSideBarContent @show-settings="showSettings = true" />
      </n-drawer-content>
    </n-drawer>

    <!-- 右侧主区域 -->
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
                    class="w-180 font-bold"
                    :options="modelListSelections"
                  />
                </div>
              </template>
            </NavigationNavBar>
          </div>

          <DynamicScroller
            ref="messageScroller"
            :items="businessStore.messageList"
            :min-item-size="60"
            key-field="id"
            class="flex-1 min-h-0 pb-20 overflow-y-auto px-16 pt-20 sm:px-40"
          >
            <!-- 对话气泡渲染 (不变) -->
            <template #default="{ item: msg, index, active }">
              <DynamicScrollerItem
                :item="msg"
                :active="active"
                :size-dependencies="[msg.content]"
                :data-index="index"
              >
                <div
                  class="mb-24 flex"
                  :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <!-- AI 头像 -->
                  <div
                    v-if="msg.role !== 'user'"
                    class="w-36 h-36 rounded-full bg-primary flex items-center justify-center mr-12 shrink-0 mt-4"
                  >
                    <div class="i-hugeicons:ai-chat-02 text-white text-20"></div>
                  </div>
                  <div
                    class="max-w-[85%] rounded-12 p-16 shadow-sm overflow-hidden break-words"
                    :class="msg.role === 'user' ? 'bg-[#e5e5e5] text-[#333] rounded-tr-4' : 'bg-[#fff] border border-[#eee] text-[#333] markdown-wrapper rounded-tl-4'"
                  >
                    <template v-if="msg.role === 'user'">
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
                  <!-- 用户头像 -->
                  <div
                    v-if="msg.role === 'user'"
                    class="w-36 h-36 rounded-full bg-gray-300 flex items-center justify-center ml-12 shrink-0 mt-4"
                  >
                    <div class="i-hugeicons:user text-white text-20"></div>
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
            <template #after>
              <!-- 打字机 -->
              <div
                v-if="stylizingLoading"
                class="flex justify-start mb-24"
              >
                <div class="w-36 h-36 rounded-full bg-primary flex items-center justify-center mr-12 shrink-0 mt-4"><div class="i-hugeicons:ai-chat-02 text-white text-20"></div></div>
                <div class="max-w-[85%] rounded-12 rounded-tl-4 border border-[#eee] bg-[#fff] p-16 shadow-sm min-w-100 overflow-hidden break-words">
                  <MarkdownPreview
                    :text="aiReplyingText"
                    :loading="stylizingLoading"
                  />
                </div>
              </div>
            </template>
          </DynamicScroller>

          <!-- 底部发送区域 -->
          <div
            class="flex flex-col items-center px-16 pt-10 sm:px-40 bg-white/80 backdrop-blur-md border-t border-[#f0f0f0]"
            style="padding-bottom: calc(20px + env(safe-area-inset-bottom));"
          >
            <!-- 新增：附件预览气泡池 -->
            <div
              w-full
              flex="~ justify-start items-center gap-16"
              class="mb-10"
            >
              <!-- 图片预览 -->
              <div
                v-if="selectedImageBase64"
                class="relative inline-block"
              >
                <img
                  :src="selectedImageBase64"
                  class="h-60px rounded-8 border border-gray-200 shadow-sm"
                >
                <div
                  class="absolute -top-6 -right-6 w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white cursor-pointer shadow-md"
                  @click="clearSelectedImage"
                >
                  <div class="i-ic:round-close text-14"></div>
                </div>
              </div>

              <!-- 文档解析预览 -->
              <div
                v-if="selectedDocFile || isParsingDoc"
                class="relative inline-flex items-center gap-8 bg-blue-50 px-12 py-8 rounded-8 border border-blue-200 shadow-sm h-60px"
              >
                <!-- 图标 -->
                <div
                  v-if="isParsingDoc"
                  class="i-svg-spinners:180-ring text-24 text-blue-500"
                ></div>
                <div
                  v-else
                  :class="{
                    'i-hugeicons:pdf-02 text-red-500': selectedDocType === 'pdf',
                    'i-hugeicons:doc-02 text-blue-600': selectedDocType === 'word',
                    'i-hugeicons:text text-gray-500': selectedDocType === 'txt'
                  }"
                  class="text-24"
                ></div>
                <!-- 详情 -->
                <div class="flex flex-col max-w-150px">
                  <span class="text-12 font-bold truncate text-gray-700">{{ selectedDocFile?.name || '加载中...' }}</span>
                  <span class="text-10 text-gray-500">{{ isParsingDoc ? '文本抽取中...' : '提取完成' }}</span>
                </div>
                <!-- 删除按钮 -->
                <div
                  v-if="!isParsingDoc"
                  class="absolute -top-6 -right-6 w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white cursor-pointer shadow-md"
                  @click="clearDoc"
                >
                  <div class="i-ic:round-close text-14"></div>
                </div>
              </div>
            </div>

            <div class="relative flex w-full items-end gap-10">
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleFileChange"
              >
              <!-- 【修改】：支持三种常见文本提取格式 -->
              <input
                ref="docInputRef"
                type="file"
                accept=".pdf,.docx,text/plain"
                class="hidden"
                @change="handleDocChange"
              >

              <!-- 图片上传 -->
              <n-button
                circle
                size="large"
                class="mb-2 shrink-0 shadow-sm"
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

              <!-- 文档长文本解析 -->
              <n-button
                circle
                size="large"
                class="mb-2 shrink-0 shadow-sm"
                :disabled="isParsingDoc"
                @click="triggerDocUpload"
              >
                <template #icon>
                  <div class="i-hugeicons:attachment-01 text-20 text-blue-500"></div>
                </template>
              </n-button>

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
                  :type="stylizingLoading ? 'default' : ((inputTextString.trim() || selectedImageBase64 || selectedDocFile) ? 'primary' : 'default')"
                  @click.stop="handleCreateStylized()"
                >
                  <div
                    v-if="stylizingLoading"
                    class="i-ic:round-stop c-#fff text-20"
                  ></div>
                  <div
                    v-else
                    class="text-20"
                    :class="(inputTextString.trim() || selectedImageBase64 || selectedDocFile) ? 'c-#fff i-hugeicons:sent' : 'c-#999 i-hugeicons:start-up-02'"
                  ></div>
                </n-float-button>
              </div>
            </div>
          </div>
        </div>
      </LayoutCenterPanel>
    </div>

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
            <div class="text-12 text-gray-400 mt-[-10px] mb-20">
              值越大，回复随
              机性越高；值越小，回复越严谨确切。
            </div>                                        -
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
  border-radius: 10px;
}
</style>
