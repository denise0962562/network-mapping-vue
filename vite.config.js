import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from "@tailwindcss/vite";

// 证书路径（基于当前配置文件所在目录解析，避免相对路径受执行位置影响）
const keyPath = fileURLToPath(new URL('../ssl/key.pem', import.meta.url))
const certPath = fileURLToPath(new URL('../ssl/cert.pem', import.meta.url))
const hasSSL = fs.existsSync(keyPath) && fs.existsSync(certPath)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss({
      config: './tailwindcss.config.js'
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // This is a client-only app. Keep vue3-apexcharts/core on the browser
      // build and avoid emitting the default wrapper's full SSR fallback.
      'apexcharts/core': 'apexcharts'
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        search: 'search.html',
        asset: 'asset.html',
        login: 'login.html'
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')

          if (
            normalizedId.includes('/node_modules/@codemirror/state/') ||
            normalizedId.includes('/node_modules/@codemirror/view/') ||
            normalizedId.includes('/node_modules/@lezer/common/') ||
            normalizedId.includes('/node_modules/@marijn/find-cluster-break/') ||
            normalizedId.includes('/node_modules/crelt/') ||
            normalizedId.includes('/node_modules/style-mod/') ||
            normalizedId.includes('/node_modules/w3c-keyname/')
          ) {
            return 'codemirror-core'
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/') ||
            normalizedId.includes('/node_modules/@lezer/')
          ) {
            return 'codemirror-language'
          }
        }
      }
    }
  },
  server: {
    https: hasSSL
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : undefined,
    proxy: {
      '/api': {
        target: 'https://localhost:9999',
        changeOrigin: true,
        secure: false,
      },
      '/logout': {
        target: 'https://localhost:9999',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
