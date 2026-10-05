<script setup>
import { formatDateTime as formatSystemDateTime } from '@/utils/systemTime'
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { autocompletion } from '@codemirror/autocomplete'
import { html } from '@codemirror/lang-html'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView } from 'codemirror'
import DOMPurify from 'dompurify'
import { Codemirror } from 'vue-codemirror'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()

const alerts = ref([])
const templates = ref([])
const currentTemplate = ref(null)
const source = ref(emptySource())
const savedSource = ref(emptySource())
const versions = ref([])
const editorTab = ref('html')
const previewTab = ref('html')
const preview = ref(null)
const previewError = ref('')
const testRecipient = ref('')
const activeField = ref('html')
const subjectInput = ref(null)
const htmlEditorView = shallowRef(null)
const textEditorView = shallowRef(null)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const previewing = ref(false)
const testing = ref(false)
const restoringVersion = ref(null)

function emptySource() {
  return {
    subjectTemplate: '',
    htmlTemplate: '',
    textTemplate: ''
  }
}

function cloneSource(value) {
  return {
    subjectTemplate: value?.subjectTemplate || '',
    htmlTemplate: value?.htmlTemplate || '',
    textTemplate: value?.textTemplate || ''
  }
}

const hasUnsavedChanges = computed(
  () => JSON.stringify(source.value) !== JSON.stringify(savedSource.value)
)

const canPublish = computed(() => currentTemplate.value?.status === 'draft' || hasUnsavedChanges.value)

const statusLabel = computed(() => {
  switch (currentTemplate.value?.status) {
    case 'draft': return '草稿'
    case 'published': return '已发布'
    default: return '内置默认'
  }
})

const statusClass = computed(() => {
  switch (currentTemplate.value?.status) {
    case 'draft': return 'badge-warning'
    case 'published': return 'badge-success'
    default: return 'badge-info'
  }
})

function completionSource(context) {
  const word = context.matchBefore(/[A-Za-z_][\w.]*/)
  if (!word && !context.explicit) return null
  return {
    from: word?.from ?? context.pos,
    options: (currentTemplate.value?.variables || []).map((variable) => ({
      label: variable.key,
      type: 'variable',
      detail: `${variable.label} · ${variable.example}`,
      apply: variable.key
    }))
  }
}

const variableAutocomplete = autocompletion({ override: [completionSource] })
const htmlExtension = html()
const editorTheme = computed(() => [
  EditorView.theme({
    '&': { backgroundColor: 'var(--color-base-100)', color: 'var(--color-base-content)' },
    '.cm-gutters': { backgroundColor: 'var(--color-base-200)', color: 'var(--color-base-content)', borderColor: 'var(--color-base-300)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--color-base-200)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-base-content)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in oklab, var(--color-primary) 25%, transparent)' },
    '.cm-tooltip, .cm-panels': { backgroundColor: 'var(--color-base-100)', color: 'var(--color-base-content)', borderColor: 'var(--color-base-300)' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--color-base-300)', color: 'var(--color-base-content)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--color-base-300)' }
  }, { dark: isDark.value }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: tags.tagName, color: isDark.value ? '#93c5fd' : '#0550ae' },
    { tag: tags.attributeName, color: isDark.value ? '#c4b5fd' : '#8250df' },
    { tag: [tags.string, tags.attributeValue], color: isDark.value ? '#86efac' : '#116329' },
    { tag: tags.comment, color: isDark.value ? '#94a3b8' : '#6b7280' },
    { tag: [tags.angleBracket, tags.punctuation], color: isDark.value ? '#cbd5e1' : '#475569' }
  ]))
])
const htmlEditorExtensions = computed(() => [htmlExtension, variableAutocomplete, ...editorTheme.value])
const textEditorExtensions = computed(() => [variableAutocomplete, ...editorTheme.value])

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function applyTemplateDetail(detail) {
  currentTemplate.value = detail
  source.value = cloneSource(detail?.source)
  savedSource.value = cloneSource(detail?.source)
  preview.value = null
  previewError.value = ''
}

async function loadTemplateList() {
  const response = await http.get('/api/mail/templates')
  if (response.data?.success !== true) throw new Error('邮件模板列表无效')
  templates.value = response.data.data || []
}

async function loadTemplate(templateKey) {
  if (!templateKey) return
  loading.value = true
  try {
    const [detailResponse, versionsResponse] = await Promise.all([
      http.get(`/api/mail/templates/${templateKey}`),
      http.get(`/api/mail/templates/${templateKey}/versions`)
    ])
    if (detailResponse.data?.success !== true || !detailResponse.data?.data) {
      throw new Error('邮件模板内容无效')
    }
    applyTemplateDetail(detailResponse.data.data)
    versions.value = versionsResponse.data?.data || []
  } catch (error) {
    console.error('load mail template failed', error)
    pushAlert(
      'error',
      '邮件模板加载失败',
      error?.response?.data?.message || '请稍后刷新页面重试。'
    )
  } finally {
    loading.value = false
  }
}

async function initialize() {
  loading.value = true
  try {
    const [templateResponse, mailResponse] = await Promise.all([
      http.get('/api/mail/templates'),
      http.get('/api/config/mail')
    ])
    templates.value = templateResponse.data?.data || []
    testRecipient.value = mailResponse.data?.data?.recipient || ''
    const firstKey = templates.value[0]?.templateKey
    if (firstKey) await loadTemplate(firstKey)
  } catch (error) {
    console.error('initialize mail template editor failed', error)
    pushAlert(
      'error',
      '邮件模板编辑器加载失败',
      error?.response?.status === 403 ? '仅管理员可以使用邮件模板编辑器。' : '请稍后刷新页面重试。'
    )
  } finally {
    loading.value = false
  }
}

async function selectTemplate(templateKey) {
  if (templateKey === currentTemplate.value?.templateKey) return
  if (hasUnsavedChanges.value) {
    const shouldContinue = window.confirm('当前模板有未保存修改，确定切换模板吗？')
    if (!shouldContinue) return
  }
  await loadTemplate(templateKey)
}

async function saveDraft({ silent = false } = {}) {
  if (!currentTemplate.value || saving.value) return false
  saving.value = true
  try {
    const response = await http.put(
      `/api/mail/templates/${currentTemplate.value.templateKey}/draft`,
      source.value
    )
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未确认草稿保存成功')
    }
    applyTemplateDetail(response.data.data)
    await Promise.all([loadTemplateList(), loadVersions()])
    if (!silent) pushAlert('success', '模板草稿已保存', '草稿尚未影响正在发送的邮件。', 5000)
    return true
  } catch (error) {
    console.error('save mail template draft failed', error)
    pushAlert(
      'error',
      '模板草稿保存失败',
      error?.response?.data?.message || '请检查模板语法后重试。'
    )
    return false
  } finally {
    saving.value = false
  }
}

async function loadVersions() {
  if (!currentTemplate.value) return
  const response = await http.get(
    `/api/mail/templates/${currentTemplate.value.templateKey}/versions`
  )
  versions.value = response.data?.data || []
}

async function validateAndPreview({ showSuccess = false } = {}) {
  if (!currentTemplate.value || previewing.value) return false
  previewing.value = true
  previewError.value = ''
  try {
    const response = await http.post(
      `/api/mail/templates/${currentTemplate.value.templateKey}/preview`,
      source.value
    )
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未返回有效预览')
    }
    preview.value = response.data.data
    if (showSuccess) pushAlert('success', '模板校验通过', '预览已使用示例变量重新渲染。', 4000)
    return true
  } catch (error) {
    console.error('preview mail template failed', error)
    preview.value = null
    previewError.value = error?.response?.data?.message || '模板校验失败'
    pushAlert('error', '模板校验失败', previewError.value)
    return false
  } finally {
    previewing.value = false
  }
}

async function publishTemplate() {
  if (!currentTemplate.value || publishing.value) return
  const confirmed = window.confirm('确定发布当前模板吗？发布后，后续登录通知将立即使用这个版本。')
  if (!confirmed) return
  if (hasUnsavedChanges.value) {
    const saved = await saveDraft({ silent: true })
    if (!saved) return
  }
  publishing.value = true
  try {
    const response = await http.post(
      `/api/mail/templates/${currentTemplate.value.templateKey}/publish`
    )
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未确认模板发布成功')
    }
    applyTemplateDetail(response.data.data)
    await Promise.all([loadTemplateList(), loadVersions(), validateAndPreview()])
    pushAlert('success', '邮件模板已发布', '后续登录通知将使用这个版本。', 5000)
  } catch (error) {
    console.error('publish mail template failed', error)
    pushAlert(
      'error',
      '邮件模板发布失败',
      error?.response?.data?.message || '请检查模板语法后重试。'
    )
  } finally {
    publishing.value = false
  }
}

async function restoreVersion(version) {
  if (!currentTemplate.value || restoringVersion.value !== null) return
  const warning = hasUnsavedChanges.value ? '当前未保存修改将被覆盖。' : ''
  const confirmed = window.confirm(`${warning}确定将版本 ${version} 恢复为新草稿吗？`)
  if (!confirmed) return
  restoringVersion.value = version
  try {
    const response = await http.post(
      `/api/mail/templates/${currentTemplate.value.templateKey}/versions/${version}/restore`
    )
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未确认版本恢复成功')
    }
    applyTemplateDetail(response.data.data)
    await Promise.all([loadTemplateList(), loadVersions()])
    pushAlert('success', '历史版本已恢复', '恢复内容已保存为草稿，需要再次发布才会生效。', 5000)
  } catch (error) {
    console.error('restore mail template version failed', error)
    pushAlert('error', '历史版本恢复失败', error?.response?.data?.message || '请稍后重试。')
  } finally {
    restoringVersion.value = null
  }
}

async function sendTestMail() {
  if (!currentTemplate.value || testing.value) return
  if (!testRecipient.value.trim()) {
    pushAlert('warning', '请输入测试收件人', '测试邮件不会自动发布当前模板。')
    return
  }
  testing.value = true
  try {
    const response = await http.post(
      `/api/mail/templates/${currentTemplate.value.templateKey}/test`,
      {
        recipient: testRecipient.value.trim(),
        source: source.value
      }
    )
    pushAlert('success', '模板测试邮件已发送', response.data?.message || '请检查收件箱。', 5000)
  } catch (error) {
    console.error('send template test failed', error)
    pushAlert(
      'error',
      '模板测试邮件发送失败',
      error?.response?.data?.message || '请检查 SMTP 配置和模板内容。'
    )
  } finally {
    testing.value = false
  }
}

function setEditorReady(field, payload) {
  if (field === 'html') htmlEditorView.value = payload.view
  if (field === 'text') textEditorView.value = payload.view
}

function insertVariable(variableKey) {
  const token = `{{ ${variableKey} }}`
  if (activeField.value === 'subject') {
    const input = subjectInput.value
    const start = input?.selectionStart ?? source.value.subjectTemplate.length
    const end = input?.selectionEnd ?? start
    source.value.subjectTemplate = `${source.value.subjectTemplate.slice(0, start)}${token}${source.value.subjectTemplate.slice(end)}`
    nextTick(() => {
      input?.focus()
      input?.setSelectionRange(start + token.length, start + token.length)
    })
    return
  }

  const view = activeField.value === 'text' ? textEditorView.value : htmlEditorView.value
  if (!view) return
  const selection = view.state.selection.main
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: token },
    selection: { anchor: selection.from + token.length }
  })
  view.focus()
}

function formatVariable(variableKey) {
  return `{{ ${variableKey} }}`
}

function useDefaultTemplate() {
  if (!currentTemplate.value?.defaultSource) return
  if (hasUnsavedChanges.value && !window.confirm('载入默认模板将替换当前未保存的编辑内容，是否继续？')) return
  source.value = cloneSource(currentTemplate.value.defaultSource)
  preview.value = null
  pushAlert('info', '已载入默认模板', '请校验预览，再保存草稿并发布。现有归档报告不会改变。')
}

function safePreviewDocument(htmlBody) {
  const clean = DOMPurify.sanitize(htmlBody || '', {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['srcdoc']
  })
  const documentValue = new DOMParser().parseFromString(clean, 'text/html')
  documentValue.querySelectorAll('link, base').forEach((element) => element.remove())
  documentValue.querySelectorAll('[src]').forEach((element) => {
    const value = element.getAttribute('src') || ''
    const sampleUrl = new URL('/mail/report-images/sample/trend.png', window.location.origin).href
    if (value === '/mail/report-images/sample/trend.png' || value === sampleUrl) element.setAttribute('src', sampleUrl)
    else if (!value.startsWith('data:image/')) element.removeAttribute('src')
    element.removeAttribute('srcset')
  })
  documentValue.querySelectorAll('a').forEach((element) => element.removeAttribute('href'))
  const policy = documentValue.createElement('meta')
  policy.setAttribute('http-equiv', 'Content-Security-Policy')
  policy.setAttribute('content', `default-src 'none'; style-src 'unsafe-inline'; img-src data: ${window.location.origin}/mail/report-images/sample/trend.png`)
  documentValue.head.prepend(policy)
  return `<!DOCTYPE html>${documentValue.documentElement.outerHTML}`
}

const previewDocument = computed(() => safePreviewDocument(preview.value?.htmlBody))

function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return formatSystemDateTime(date)
}

useUnsavedChanges(hasUnsavedChanges, saveDraft)
onMounted(initialize)
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlert(alert.id)"
    />
  </div>

  <div class="p-5">
    <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h2 class="text-lg font-semibold">邮件模板编辑器</h2>
        <p class="text-xs opacity-60">使用 Tera 语法编辑邮件；草稿发布后才会影响实际通知。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline btn-sm" :disabled="loading || !currentTemplate?.defaultSource || saving || publishing" @click="useDefaultTemplate">载入默认模板</button>
        <button class="btn btn-outline btn-sm" :disabled="loading || previewing" @click="validateAndPreview({ showSuccess: true })">
          <span v-if="previewing" class="loading loading-spinner loading-xs"></span>
          校验并预览
        </button>
        <button class="btn btn-outline btn-sm" :disabled="!hasUnsavedChanges || saving" @click="saveDraft()">
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          保存草稿
        </button>
        <button class="btn btn-neutral btn-sm" :disabled="!canPublish || publishing" @click="publishTemplate">
          <span v-if="publishing" class="loading loading-spinner loading-xs"></span>
          发布模板
        </button>
      </div>
    </div>

    <div v-if="loading && !currentTemplate" class="grid min-h-80 place-items-center rounded-lg bg-base-100 border border-base-300">
      <span class="loading loading-spinner loading-md"></span>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 2xl:grid-cols-[220px_minmax(0,1fr)_420px]">
      <aside class="card bg-base-100 card-border border-base-300 p-3">
        <h3 class="px-2 pb-2 text-sm font-semibold">模板</h3>
        <ul class="menu w-full p-0">
          <li v-for="item in templates" :key="item.templateKey">
            <button
              class="flex items-center justify-between"
              :class="{ active: item.templateKey === currentTemplate?.templateKey }"
              @click="selectTemplate(item.templateKey)"
            >
              <span>{{ item.displayName }}</span>
              <span v-if="item.hasDraft" class="badge badge-warning badge-xs">草稿</span>
            </button>
          </li>
        </ul>

        <div class="divider my-3"></div>
        <h3 class="px-2 pb-2 text-sm font-semibold">历史版本</h3>
        <div v-if="versions.length" class="flex max-h-72 flex-col gap-2 overflow-auto px-1">
          <div v-for="version in versions" :key="version.version" class="rounded-lg border border-base-300 p-2 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">版本 {{ version.version }}</span>
              <span class="badge badge-xs" :class="version.status === 'published' ? 'badge-success' : version.status === 'draft' ? 'badge-warning' : ''">
                {{ version.status === 'published' ? '已发布' : version.status === 'draft' ? '草稿' : '历史' }}
              </span>
            </div>
            <div class="mt-1 opacity-60">{{ formatTime(version.updateAt || version.createAt) }}</div>
            <button
              v-if="version.status !== 'draft'"
              class="btn btn-ghost btn-xs mt-2 w-full"
              :disabled="restoringVersion !== null"
              @click="restoreVersion(version.version)"
            >
              <span v-if="restoringVersion === version.version" class="loading loading-spinner loading-xs"></span>
              恢复为草稿
            </button>
          </div>
        </div>
        <p v-else class="px-2 text-xs opacity-50">暂无数据库版本，当前使用内置模板。</p>
      </aside>

      <main class="min-w-0 space-y-4">
        <section class="card bg-base-100 card-border border-base-300 p-4">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold">{{ currentTemplate?.displayName || '邮件模板' }}</h3>
              <span class="badge badge-sm" :class="statusClass">{{ statusLabel }}</span>
              <span v-if="currentTemplate?.activeVersion" class="text-xs opacity-60">已发布版本 {{ currentTemplate.activeVersion }}</span>
            </div>
            <span v-if="hasUnsavedChanges" class="text-xs text-warning">存在未保存修改</span>
          </div>

          <label class="form-control w-full">
            <span class="label-text mb-1">邮件主题</span>
            <input
              ref="subjectInput"
              v-model="source.subjectTemplate"
              type="text"
              maxlength="500"
              class="input input-bordered w-full font-mono"
              placeholder="例如：{{ system_name }} 登录成功提醒"
              @focus="activeField = 'subject'"
            />
          </label>

          <div class="mt-4 tabs tabs-box w-fit">
            <button class="tab" :class="{ 'tab-active': editorTab === 'html' }" @click="editorTab = 'html'; activeField = 'html'">HTML</button>
            <button class="tab" :class="{ 'tab-active': editorTab === 'text' }" @click="editorTab = 'text'; activeField = 'text'">纯文本</button>
          </div>

          <div class="mt-3 overflow-hidden rounded-lg border border-base-300 bg-base-100">
            <Codemirror
              v-if="editorTab === 'html'"
              v-model="source.htmlTemplate"
              :extensions="htmlEditorExtensions"
              :style="{ height: '560px' }"
              :indent-with-tab="true"
              :tab-size="2"
              placeholder="输入 HTML 和 Tera 模板语法"
              @ready="setEditorReady('html', $event)"
              @focus="activeField = 'html'"
            />
            <Codemirror
              v-else
              v-model="source.textTemplate"
              :extensions="textEditorExtensions"
              :style="{ height: '560px' }"
              :indent-with-tab="true"
              :tab-size="2"
              placeholder="输入纯文本备用正文"
              @ready="setEditorReady('text', $event)"
              @focus="activeField = 'text'"
            />
          </div>
        </section>

        <section class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold">测试发送</h3>
          <p class="mt-1 text-xs opacity-60">使用当前编辑内容和系统设置中的 SMTP 配置发送，不会自动保存或发布。</p>
          <div class="mt-3 flex flex-col gap-2 sm:flex-row">
            <input v-model="testRecipient" type="email" class="input input-bordered grow" placeholder="测试收件人邮箱" />
            <button class="btn btn-neutral" :disabled="testing" @click="sendTestMail">
              <span v-if="testing" class="loading loading-spinner loading-sm"></span>
              发送测试邮件
            </button>
          </div>
        </section>
      </main>

      <aside class="min-w-0 space-y-4">
        <section class="card bg-base-100 card-border border-base-300 p-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold">模板变量</h3>
            <span class="text-xs opacity-60">点击插入当前编辑位置</span>
          </div>
          <div class="mt-3 flex flex-col gap-2">
            <button
              v-for="variable in currentTemplate?.variables || []"
              :key="variable.key"
              class="rounded-lg border border-base-300 p-3 text-left transition hover:bg-base-200"
              @click="insertVariable(variable.key)"
            >
              <code class="text-xs text-primary" v-text="formatVariable(variable.key)"></code>
              <span class="mt-1 block text-xs">{{ variable.label }}</span>
              <span class="block text-xs opacity-50">示例：{{ variable.example }}</span>
            </button>
          </div>
        </section>

        <section class="card bg-base-100 card-border border-base-300 p-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold">渲染预览</h3>
            <div class="tabs tabs-box tabs-xs">
              <button class="tab" :class="{ 'tab-active': previewTab === 'html' }" @click="previewTab = 'html'">HTML</button>
              <button class="tab" :class="{ 'tab-active': previewTab === 'text' }" @click="previewTab = 'text'">纯文本</button>
            </div>
          </div>
          <div v-if="preview" class="mt-3">
            <div class="mb-2 rounded-lg bg-base-200 px-3 py-2 text-xs">
              <span class="opacity-60">主题：</span>{{ preview.subject }}
            </div>
            <iframe
              v-if="previewTab === 'html'"
              title="邮件模板安全预览"
              sandbox=""
              :srcdoc="previewDocument"
              class="h-[520px] w-full rounded-lg border border-base-300 bg-white"
            ></iframe>
            <pre v-else class="h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-base-300 bg-base-200 p-3 text-xs">{{ preview.textBody }}</pre>
          </div>
          <div v-else class="mt-3 grid h-72 place-items-center rounded-lg border border-dashed border-base-300 text-center text-xs opacity-60">
            <div>
              <p>{{ previewError || '点击“校验并预览”生成安全预览。' }}</p>
              <p class="mt-1">预览使用固定示例数据，不包含真实用户信息。</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
:deep(.cm-editor) {
  height: 100%;
  font-size: 13px;
}

:deep(.cm-scroller) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

:deep(.cm-focused) {
  outline: none;
}
</style>
