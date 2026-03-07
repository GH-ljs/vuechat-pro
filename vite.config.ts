import { defineConfig } from 'vite'
import path from 'path'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import raw from 'vite-raw-plugin'

import UnoCSS from 'unocss/vite'

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'

import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const enableVisualizer = env.VITE_VISUALIZER === 'true'
  const visualizerPlugins = enableVisualizer ? [visualizer({
    filename: 'dist/stats.html',
    open: false
  })] : []

  return {
    base: env.VITE_ROUTER_MODE === 'hash'
      ? './'
      : '/',
    server: {
      port: 2048,
      strictPort: true,
      proxy: {
        '/spark': {
          target: 'https://spark-api-open.xf-yun.com',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/spark/, '')
        },
        '/siliconflow': {
          target: 'https://api.siliconflow.cn',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/siliconflow/, '')
        },
        '/moonshot': {
          target: 'https://api.moonshot.cn',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/moonshot/, '')
        },
        '/deepseek': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/deepseek/, '')
        }
      }
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'VueChat Pro',
          short_name: 'VueChat',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10MB，规避因体积过大导致 PWA 无法缓存
        },
        devOptions: {
          enabled: true
        }
      }),
      UnoCSS(),
      vue(),
      raw({
        fileRegex: /\.md$/
      }),
      vueJsx(),
      AutoImport({
        include: [
          /\.[tj]sx?$/,
          /\.vue\??/
        ],
        imports: [
          'vue',
          'vue-router',
          '@vueuse/core',
          {
            'vue': [
              'createVNode',
              'render'
            ],
            'vue-router': [
              'createRouter',
              'createWebHistory',
              'useRouter',
              'useRoute'
            ],
            'uuid': [['v4', 'uuidv4']],
            'lodash-es': [
              ['*', '_']
            ],
            'naive-ui': [
              'useDialog',
              'useMessage',
              'useNotification',
              'useLoadingBar'
            ]
          },
          {
            from: 'vue',
            imports: [
              'App',
              'VNode',
              'ComponentInternalInstance',
              'GlobalComponents',
              'SetupContext',
              'PropType'
            ],
            type: true
          },
          {
            from: 'vue-router',
            imports: [
              'RouteRecordRaw',
              'RouteLocationRaw'
            ],
            type: true
          }
        ],
        resolvers:
          mode === 'development'
            ? []
            : [NaiveUiResolver()],
        dirs: [
          './src/hooks',
          './src/store/business',
          './src/store/transform'
        ],
        dts: './auto-imports.d.ts',
        eslintrc: {
          enabled: true
        },
        vueTemplate: true
      }),
      Components({
        directoryAsNamespace: true,
        collapseSamePrefixes: true,
        resolvers: [
          IconsResolver({
            prefix: 'auto-icon'
          }),
          NaiveUiResolver()
        ]
      }),
      // Auto use Iconify icon
      Icons({
        autoInstall: true,
        compiler: 'vue3',
        scale: 1.2,
        defaultStyle: '',
        defaultClass: 'unplugin-icon',
        jsx: 'react'
      }),
      ...visualizerPlugins
    ],
    resolve: {
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.less', '.css'],
      alias: [
        {
          find: '@',
          replacement: path.resolve(__dirname, 'src')
        }
      ]
    },
    define: {
      'process.env.VITE_ROUTER_MODE': JSON.stringify(env.VITE_ROUTER_MODE)
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          additionalData: `@use '@/styles/naive-variables.scss' as *;`
        }
      }
    }
  }
})
