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
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        search: 'search.html',
        login: 'login.html'
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
        target: 'https://127.0.0.1:9999',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})