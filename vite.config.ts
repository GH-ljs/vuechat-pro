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
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB，规避因体积过大导致 PWA 无法缓存
          runtimeCaching: [
            {
              // 匹配外部的图片资源，解决跨域不透明响应（Opaque Response）问题
              urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'external-image-cache',
                expiration: {
                  maxEntries: 100, // 最多缓存 100 张
                  maxAgeSeconds: 30 * 24 * 60 * 60 // 30天有效
                },
                cacheableResponse: {
                  statuses: [0, 200] // 核心：允许缓存状态码为 0 的"不透明响应"
                }
              }
            },
            {
              // 匹配外部字体库（如 Google Fonts）跨域缓存
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 365 * 24 * 60 * 60 // 1年有效
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              // 匹配外部 API 的跨域请求缓存（需视业务情况开启），网络优先，并排除状态码为 0 避免缓存失败导致持续前端白屏
              urlPattern: /^https:\/\/api\.(siliconflow\.cn|deepseek\.com|moonshot\.cn)\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'external-api-cache',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 24 * 60 * 60 // 1天有效
                },
                cacheableResponse: {
                  statuses: [200] // API 数据只缓存成功的(200)状态，不缓存 0 状态
                }
              }
            }
          ]
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
