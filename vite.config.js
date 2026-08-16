import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from "@tailwindcss/vite";

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
    https: {
      key: fs.readFileSync('../ssl/key.pem'),
      cert: fs.readFileSync('../ssl/cert.pem'),
    },
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:9999',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})