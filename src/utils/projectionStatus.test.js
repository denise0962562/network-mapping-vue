import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isProjectionPending, projectionMessage } from './projectionStatus.js'

test('saved results keep refreshing while assets are pending, including retries', () => {
  for (const status of ['pending', 'running', 'retrying']) {
    assert.equal(isProjectionPending(status), true)
    assert.ok(projectionMessage(status).includes('扫描结果已保存'))
  }
  assert.ok(projectionMessage('retrying').includes('自动重试'))
})

test('ready, DNS-only, unfinished and older servers do not show pending assets', () => {
  for (const status of ['ready', 'not_applicable', 'not_started', undefined, null, 'unknown']) {
    assert.equal(isProjectionPending(status), false)
    assert.equal(projectionMessage(status), '')
  }
})
