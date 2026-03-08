import 'virtual:uno.css'

import { setupRouter } from '@/router'
import { setupStore } from '@/store'
import { registerSW } from 'virtual:pwa-register'

import App from '@/App.vue'

import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const app = createApp(App)

// 注册 PWA 并开启自动更新检查
registerSW({
  immediate: true,
  onNeedRefresh() {
    // 检测到有新版本并处于 waiting 状态时，你也可以在这里加个 UI 提示框
    // 但配合 vite.config.ts 中的 `registerType: 'autoUpdate'` 
    // it will automatically skip waiting and activate.
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  }
})

function setupPlugins() {
  app.use(VueVirtualScroller)
}

async function setupApp() {
  setupStore(app)
  await setupRouter(app)
  app.mount('#app')
}

setupPlugins()
setupApp()

export default app
