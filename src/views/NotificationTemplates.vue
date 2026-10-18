<script setup>
import { ref } from 'vue'
import MailTemplateEditor from './MailTemplateEditor.vue'
import BotTemplateEditor from './BotTemplateEditor.vue'

const provider = ref('email')
const editor = ref(null)
function select(value) {
  if (value === provider.value || editor.value?.busy) return
  if (editor.value?.hasUnsavedChanges && !window.confirm('当前模板有未保存修改，确定切换通知渠道吗？')) return
  provider.value = value
}
</script>

<template>
  <div class="px-5 pt-5">
    <h1 class="text-2xl font-semibold">通知模板</h1>
    <p class="mt-2 text-sm opacity-60">分别配置邮件、飞书和 Telegram 的模板。各渠道独立保存和发布，同类渠道共用对应事件的已发布模板。</p>
    <div class="tabs tabs-box mt-4 w-fit" role="tablist" aria-label="通知渠道类型">
      <button v-for="item in [{value:'email',label:'邮件'},{value:'feishu',label:'飞书'},{value:'telegram',label:'Telegram'}]" :key="item.value"
        class="tab" role="tab" :disabled="editor?.busy" :aria-selected="provider === item.value" :class="{'tab-active':provider === item.value}" @click="select(item.value)">{{ item.label }}</button>
    </div>
  </div>
  <MailTemplateEditor v-if="provider === 'email'" ref="editor" />
  <BotTemplateEditor v-else :key="provider" ref="editor" :provider="provider" />
</template>
