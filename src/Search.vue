<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const STORAGE_KEY = 'network_mapping_search_history'
const MAX_HISTORY = 12

const searchInput = ref('')
const searchHistory = ref([])
const showHistory = ref(false)
const searchBoxRef = ref(null)

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    searchHistory.value = Array.isArray(parsed) ? parsed : []
  } catch (error) {
    searchHistory.value = []
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(searchHistory.value))
}

function pushHistory(keyword) {
  const q = keyword.trim()
  if (!q) return
  searchHistory.value = [q, ...searchHistory.value.filter((item) => item !== q)].slice(0, MAX_HISTORY)
  saveHistory()
}

function doSearch() {
  const q = searchInput.value.trim()
  if (!q) return
  pushHistory(q)
  showHistory.value = false
  console.log(`搜索: ${q}`)
}

function pickHistory(item) {
  searchInput.value = item
  showHistory.value = false
}

function clearHistory() {
  searchHistory.value = []
  saveHistory()
}

function onDocumentClick(event) {
  if (!searchBoxRef.value) return
  if (!searchBoxRef.value.contains(event.target)) {
    showHistory.value = false
  }
}

onMounted(() => {
  loadHistory()
  document.addEventListener('mousedown', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
})
</script>

<template>
  <nav class="absolute top-0 right-0 py-5 px-8 flex items-center gap-5">
    <a class="link" target="_blank" href="/">仪表盘</a>
    <a class="link" target="_blank" href="https://github.com/wshijiang/network-mapping/doc">文档</a>
    <a class="link" target="_blank" href="">API</a>
    <a class="link" href="https://github.com/wshijiang/" target="_blank">
      <svg class="w-10 h-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M237.9 461.4C237.9 463.4 235.6 465 232.7 465C229.4 465.3 227.1 463.7 227.1 461.4C227.1 459.4 229.4 457.8 232.3 457.8C235.3 457.5 237.9 459.1 237.9 461.4zM206.8 456.9C206.1 458.9 208.1 461.2 211.1 461.8C213.7 462.8 216.7 461.8 217.3 459.8C217.9 457.8 216 455.5 213 454.6C210.4 453.9 207.5 454.9 206.8 456.9zM251 455.2C248.1 455.9 246.1 457.8 246.4 460.1C246.7 462.1 249.3 463.4 252.3 462.7C255.2 462 257.2 460.1 256.9 458.1C256.6 456.2 253.9 454.9 251 455.2zM316.8 72C178.1 72 72 177.3 72 316C72 426.9 141.8 521.8 241.5 555.2C254.3 557.5 258.8 549.6 258.8 543.1C258.8 536.9 258.5 502.7 258.5 481.7C258.5 481.7 188.5 496.7 173.8 451.9C173.8 451.9 162.4 422.8 146 415.3C146 415.3 123.1 399.6 147.6 399.9C147.6 399.9 172.5 401.9 186.2 425.7C208.1 464.3 244.8 453.2 259.1 446.6C261.4 430.6 267.9 419.5 275.1 412.9C219.2 406.7 162.8 398.6 162.8 302.4C162.8 274.9 170.4 261.1 186.4 243.5C183.8 237 175.3 210.2 189 175.6C209.9 169.1 258 202.6 258 202.6C278 197 299.5 194.1 320.8 194.1C342.1 194.1 363.6 197 383.6 202.6C383.6 202.6 431.7 169 452.6 175.6C466.3 210.3 457.8 237 455.2 243.5C471.2 261.2 481 275 481 302.4C481 398.9 422.1 406.6 366.2 412.9C375.4 420.8 383.2 435.8 383.2 459.3C383.2 493 382.9 534.7 382.9 542.9C382.9 549.4 387.5 557.3 400.2 555C500.2 521.8 568 426.9 568 316C568 177.3 455.5 72 316.8 72zM169.2 416.9C167.9 417.9 168.2 420.2 169.9 422.1C171.5 423.7 173.8 424.4 175.1 423.1C176.4 422.1 176.1 419.8 174.4 417.9C172.8 416.3 170.5 415.6 169.2 416.9zM158.4 408.8C157.7 410.1 158.7 411.7 160.7 412.7C162.3 413.7 164.3 413.4 165 412C165.7 410.7 164.7 409.1 162.7 408.1C160.7 407.5 159.1 407.8 158.4 408.8zM190.8 444.4C189.2 445.7 189.8 448.7 192.1 450.6C194.4 452.9 197.3 453.2 198.6 451.6C199.9 450.3 199.3 447.3 197.3 445.4C195.1 443.1 192.1 442.8 190.8 444.4zM179.4 429.7C177.8 430.7 177.8 433.3 179.4 435.6C181 437.9 183.7 438.9 185 437.9C186.6 436.6 186.6 434 185 431.7C183.6 429.4 181 428.4 179.4 429.7z"/></svg>
    </a>
  </nav>

  <div class="bg-base-200 min-h-screen flex items-center justify-center">
    <div class="w-full max-w-2xl px-4">
      <p class="mb-5 text-3xl md:text-4xl font-semibold text-center">Network-Mapping Search</p>

      <div ref="searchBoxRef" class="relative">
        <div class="join w-full">
          <label class="input validator join-item w-full">
            <svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-3.5-3.5"></path>
              </g>
            </svg>
            <input
              v-model="searchInput"
              type="text"
              class="grow"
              placeholder="输入 IP、域名、端口或服务（例如: port:80）"
              autofocus
              @focus="showHistory = true"
              @keyup.enter="doSearch"
            />
          </label>
          <button class="btn btn-neutral join-item px-6" @click="doSearch">搜索</button>
        </div>

        <transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-1 scale-95"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 -translate-y-1 scale-95"
        >
          <div
            v-if="showHistory"
            class="absolute z-20 mt-2 w-full rounded-xl border border-base-300 bg-base-100 shadow-lg origin-top"
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
              <span class="text-sm font-medium">搜索历史</span>
              <button class="btn btn-ghost btn-xs" @click="clearHistory">清空</button>
            </div>

            <div v-if="searchHistory.length === 0" class="px-4 py-6 text-sm opacity-60 text-center">
              暂无搜索历史
            </div>

            <ul v-else class="max-h-64 overflow-y-auto p-2">
              <li v-for="item in searchHistory" :key="item">
                <button class="btn btn-ghost w-full justify-start rounded-lg" @click="pickHistory(item)">
                  {{ item }}
                </button>
              </li>
            </ul>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>
