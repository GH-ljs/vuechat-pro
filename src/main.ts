import 'virtual:uno.css'

import { setupRouter } from '@/router'
import { setupStore } from '@/store'

import App from '@/App.vue'

import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const app = createApp(App)

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
