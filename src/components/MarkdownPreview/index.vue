<script lang="tsx" setup>
import { computed } from 'vue'
import { renderMarkdownText } from './plugins/markdown'
import { defaultModelName } from './models'

interface Props {
  // 不再接收 reader 流，直接接收累加好的纯文本字符串
  text?: string
  model?: string | null | undefined
  loading?: boolean // 用于控制是否显示 "等待/排队中" 的状态
}

const props = withDefaults(
  defineProps<Props>(),
  {
    text: '',
    model: '',
    loading: false
  }
)

// 将传入的实时纯文本转为 Markdown 格式的 HTML
const renderedContent = computed(() => {
  return renderMarkdownText(props.text)
})

// 空白占位符提示
const emptyPlaceholder = computed(() => {
  return defaultModelName === props.model
    ? '当前为模拟环境\n随便问一个问题，我才会消失 ~'
    : '问一个问题，我才会消失 ~'
})
</script>

<template>
  <div class="w-full h-full">
    <!-- 如果没有文本，且不是正在 loading 等待接口返回 -->
    <template v-if="!text && !loading">
      <div class="w-full h-full flex items-center justify-center">
        <n-empty
          size="large"
          class="font-bold"
        >
          <div
            whitespace-break-spaces
            text-center
            v-html="emptyPlaceholder"
          ></div>
          <template #icon>
            <n-icon>
              <div class="i-hugeicons:ai-chat-02"></div>
            </n-icon>
          </template>
        </n-empty>
      </div>
    </template>

    <!-- 如果有文本正在生成，渲染 Markdown -->
    <template v-else>
      <div class="w-full">
        <!-- 核心：实时渲染从父组件传入的累加好的 Markdown 文本 -->
        <div
          class="markdown-wrapper"
          v-html="renderedContent"
        ></div>

        <!-- 文字输出末尾的脉冲动画，表示正在加载中 -->
        <div
          v-if="loading"
          class="mt-10 mb-10 flex items-center"
        >
          <div
            size-24
            class="i-svg-spinners:pulse-3 text-primary opacity-70"
          ></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss">
.markdown-wrapper {

  h1 {
    font-size: 2em;
  }

  h2 {
    font-size: 1.5em;
  }

  h3 {
    font-size: 1.25em;
  }

  h4 {
    font-size: 1em;
  }

  h5 {
    font-size: 0.875em;
  }

  h6 {
    font-size: 0.85em;
  }

  h1,h2,h3,h4,h5,h6 {
    margin: 0 auto;
    line-height: 1.25;
  }

  & ul,ol {
    padding-left: 1.5em;
    line-height: 0.8;
  }

  & ul,li,ol {
    list-style-position: outside;
    white-space: normal;
  }

  li {
    line-height: 1.7;

    & > code {
      --at-apply: 'bg-#e5e5e5';
      --at-apply: whitespace-pre m-2px px-6px py-2px rounded-5px;
    }
  }

  ol ol {
    padding-left: 20px;
  }

  ul ul {
    padding-left: 20px;
  }

  hr {
    margin: 16px 0;
  }

  a {
    color: $color-default;
    font-weight: bolder;
    text-decoration: underline;
    padding: 0 3px;
  }

  p {
    line-height: 1.4;

    & > code {
      --at-apply: 'bg-#e5e5e5';
      --at-apply: whitespace-pre mx-4px px-6px py-3px rounded-5px;
    }


    img {
      display: inline-block;
    }
  }

  li > p {
    line-height: 2
  }

  blockquote {
    padding: 10px;
    margin: 20px 0;
    border-left: 5px solid #ccc;
    background-color: #f9f9f9;
    color: #555;

    & > p {
      margin: 0;
    }
  }

  .katex {
    --at-apply: c-primary;
  }

  kbd {
    --at-apply: inline-block align-middle p-0.1em p-0.3em;
    --at-apply: bg-#fcfcfc text-#555;
    --at-apply: border border-solid border-#ccc border-b-#bbb;
    --at-apply: rounded-0.2em shadow-[inset_0_-1px_0_#bbb] text-0.9em;
  }

  table {
    --at-apply: w-fit border-collapse my-16;
  }

  th, td {
    --at-apply: p-7 text-left border border-solid border-#ccc;
  }

  th {
    --at-apply: bg-#f2f2f2 font-bold;
  }

  tr:nth-child(even) {
    --at-apply: bg-#f9f9f9;
  }

  tr:hover {
    --at-apply: bg-#f1f1f1;
  }

  // Deepseek 深度思考 Wrapper

  .think-wrapper {
    --at-apply: pl-13 text-14 c-#8b8b8b;
    --at-apply: b-l-2 b-l-solid b-#e5e5e5;

    p {
      --at-apply: line-height-26;
    }
  }
}
</style>
