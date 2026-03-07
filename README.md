# VueChat Pro

## 项目简介

VueChat Pro 是一个基于 Vue 3 + Vite 构建的前端 AI 对话平台，目标是用纯前端方案快速搭建一个可部署、可安装、可扩展的多模型智能对话客户端。

它不是单一模型的聊天页面，而是一个面向真实使用场景的 AI 聚合入口，支持多轮对话、多会话管理、多模型切换、图片理解、文档解析增强、Markdown 富文本渲染和 PWA 安装。

注！！！：项目基础框架来源https://github.com/pdsuwwz/chatgpt-vue3-light-mvp

## 为什么做这个项目

这个项目解决的是三个很实际的问题：

1. 把多个大模型厂商的接口统一到一个交互界面里，降低切换成本。
2. 用纯前端方式快速交付一个可运行的 AI 应用，减少后端依赖和部署复杂度。
3. 在“聊天”之外加入图片理解、文档问答和本地历史记录，让它更接近真实生产工具，而不是 Demo。

## 功能层总结

### 1. 智能对话

- 支持多轮对话和连续上下文问答。
- 支持多会话创建、切换、删除与标题自动生成。
- 支持流式输出，响应过程逐字呈现。
- 支持手动中断生成中的请求。

### 2. 多模型聚合

- 支持 DeepSeek-V3。
- 支持 DeepSeek-R1 推理模型。
- 支持 SiliconFlow。
- 支持 Moonshot Kimi。
- 支持 Qwen-VL 视觉模型。
- 支持在前端界面中切换模型。

### 3. 多模态输入

- 支持图片上传。
- 支持图片压缩后再发送，降低请求体积和带宽开销。
- 支持视觉模型识图分析。

### 4. 文档增强问答

- 支持上传 PDF、TXT、Word(.docx) 文档。
- 支持在浏览器端解析文档文本。
- 支持将解析结果作为隐藏上下文注入模型请求，形成轻量级本地 RAG 体验。

### 5. 富文本输出

- 支持 Markdown 渲染。
- 支持代码高亮。
- 支持 KaTeX 数学公式。
- 支持 Mermaid 图表渲染。
- 支持特殊 think 内容块渲染，兼容推理模型输出。

### 6. 跨端体验

- 支持移动端抽屉式侧边栏。
- 支持 PWA 安装为桌面或移动端独立应用。
- 支持长对话滚动浏览与消息虚拟列表优化。

## 系统层总结

### 1. 模块划分

项目整体可以拆成 6 个核心层次：

1. 表现层：以 [src/views/chat.vue](src/views/chat.vue) 为核心，负责聊天页交互、输入区、附件预览、消息列表和设置面板。
2. 组件层：封装 Markdown 渲染、导航、布局、侧边栏等通用 UI 组件，降低页面复杂度。
3. 状态层：基于 Pinia，将业务状态和全局配置拆分管理。
4. 模型适配层：在 [src/components/MarkdownPreview/models/index.ts](src/components/MarkdownPreview/models/index.ts) 中统一不同厂商模型的请求格式和响应解析方式。
5. 数据持久层：通过 localforage 将会话历史持久化到 IndexedDB，通过 useStorage 将配置持久化到 LocalStorage。
6. 异步计算层：通过 [src/workers/docParser.worker.ts](src/workers/docParser.worker.ts) 在 Worker 中解析文档，避免阻塞主线程。

### 2. 状态设计

- 业务状态由 [src/store/business/index.ts](src/store/business/index.ts) 管理，聚焦会话、消息、当前模型和请求中断控制。
- 配置状态由 [src/store/config/index.ts](src/store/config/index.ts) 管理，聚焦 API Key 和温度参数。
- 轻量 UI 状态由 [src/store/hooks/useAppStore.ts](src/store/hooks/useAppStore.ts) 管理，聚焦移动端抽屉开关。

这样拆分的好处是：

1. 聊天业务和全局配置解耦，避免单一 store 过重。
2. 会话状态更容易持久化和演进。
3. 页面组件可以直接复用，不依赖复杂业务细节。

### 3. 交互链路

一次完整消息发送的主链路如下：

1. 用户在聊天页输入文本、上传图片或上传文档。
2. 图片在主线程压缩，文档在 Worker 中解析。
3. 页面将用户消息追加到当前会话。
4. Store 根据当前模型构造标准化请求参数。
5. 通过 fetch-event-source 发起 SSE 流式请求。
6. 模型返回的流式片段被持续追加到界面中。
7. 响应完成后，最终结果被写回会话历史并持久化。

### 4. 为什么这样设计

- 选择前端直连模型 API，而不是先做后端代理，是为了降低项目启动成本、缩短验证路径，更适合个人项目和演示场景。
- 选择“模型适配表”而不是为每个模型单独写一套页面逻辑，是为了让新增模型只需要补请求构造和返回提取逻辑，扩展成本更低。
- 选择 localforage 而不是只用 LocalStorage 存会话，是因为聊天记录可能较长，IndexedDB 更适合承载会话历史。
- 选择 Worker 解析文档而不是在主线程同步解析，是为了避免大文件解析时界面卡顿。
- 选择虚拟滚动而不是简单 v-for 渲染，是为了让长消息列表场景下仍保持可用性能。

## 工程层总结

### 1. 性能

- 使用 Vite 进行开发与构建，启动快、热更新快。
- 使用 UnoCSS 原子化生成样式，减少样式体积与重复书写。
- 使用 vue-virtual-scroller 优化长对话列表渲染性能。
- 使用 Web Worker 处理 PDF、Word、TXT 文档解析，降低主线程阻塞。
- 图片上传前做压缩，降低视觉模型请求体积。

### 2. 稳定性

- 路由切换接入 NProgress，保证页面状态反馈。
- SSE 请求支持 AbortController 中断，避免切换会话时流错误串写。
- 文档解析做了类型、大小和异常兜底。
- 请求层对常见 HTTP 状态码做了统一错误处理。

### 3. 成本

- 架构以前端为主，不依赖自建后端即可运行。
- PWA 可直接作为轻量客户端分发，降低桌面端和移动端封装成本。
- 模型聚合能力让同一套前端可以复用多家 API，降低平台绑定风险。

### 4. 上线部署

- 默认使用 Vite 构建。
- 支持通过 [vite.config.ts](vite.config.ts) 中的 VITE_ROUTER_MODE 切换 history/hash 路由模式。
- 提供 build:gh-pages 脚本，可用于 GitHub Pages 一类静态托管环境。
- 通过 vite-plugin-pwa 生成 manifest 和离线缓存资源。

### 5. 故障与风险预案

- 文档解析体积过大时会进行文本截断，避免上下文过长导致性能下降。
- 接口调用失败会给出错误提示，不会静默失败。
- 切换会话时主动终止旧请求，避免错误回复进入新会话。
- 当前 API Key 存储在浏览器本地，适合个人使用和演示，不适合高安全场景共享终端。
- 当前项目以前端直连第三方模型为主，如生产环境存在 CORS、密钥暴露或调用审计要求，建议补服务端网关层。

## 技术栈

### 前端框架

- Vue 3
- TypeScript
- Vite 7
- Vue Router 5
- Pinia

### UI 与样式

- Naive UI
- UnoCSS
- Sass
- Iconify

### AI 与数据处理

- @microsoft/fetch-event-source
- localforage
- pdfjs-dist
- mammoth
- marked / markdown-it 生态
- KaTeX
- Mermaid

### 工程化

- pnpm
- ESLint Flat Config
- Stylelint
- Vitest
- Playwright
- vite-plugin-pwa
- rollup-plugin-visualizer

## 项目结构

```text
src/
	api/                 通用接口封装
	components/          通用组件与 Markdown 渲染组件
	hooks/               组合式逻辑
	router/              路由与导航守卫
	store/               Pinia 状态管理
	styles/              全局样式与主题变量
	utils/               请求、位置、数字等工具
	views/               页面级视图
	workers/             文档解析 Worker
```

## 快速开始

### 安装依赖

```bash
pnpm i
```

### 启动开发环境

```bash
pnpm dev
```

### 构建生产版本

```bash
pnpm build
```

### GitHub Pages 构建

```bash
pnpm build:gh-pages
```

### 代码检查

```bash
pnpm lint
pnpm stylelint
```

## 配置方式

项目支持两种模型密钥配置方式：

1. 在界面“全局设置”中填写 API Key，配置保存在浏览器本地。
2. 通过环境变量注入默认 Key，例如 DeepSeek、SiliconFlow、Moonshot 等。

当前已使用到的环境变量包括：

- VITE_ROUTER_MODE
- VITE_DEEPSEEK_KEY
- VITE_SILICONFLOW_KEY
- VITE_MOONSHOT_KEY

## 适用场景

- 个人 AI 客户端
- 多模型聚合入口
- 课程或毕业设计项目
- 纯前端 AI 产品原型
- 文档问答和识图对话 Demo

## README 可直接复用的项目亮点

- 多模型统一接入：DeepSeek、Kimi、SiliconFlow、Qwen-VL 一站式切换。
- 支持图片理解和文档增强问答，不只是纯文本聊天。
- 前端直连模型 API，部署简单，适合个人项目快速落地。
- 基于 IndexedDB 持久化多会话记录，刷新页面后历史仍可恢复。
- 支持 Markdown、代码高亮、数学公式、Mermaid 图表等富文本输出。
- 支持 PWA 安装，可作为桌面端和移动端轻量应用使用。

## 当前边界

- 当前主要是前端单体架构，未包含服务端账号体系、统一鉴权、审计与配额控制。
- 若要用于团队或商业化场景，建议补充后端代理层、密钥托管、日志监控和错误告警。
