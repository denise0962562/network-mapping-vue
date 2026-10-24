import { tr, i18n } from '../i18n/index.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, reactive, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { normalizeMonitor, policyDiff, scannerHealthDefaults, scannerHealthFields, validateMonitor, validateScannerHealth } from '../utils/monitorRules.js'
import { cacheDefaults, validateCache } from '../utils/statisticsCache.js'

const { descriptor } = parse(readFileSync(new URL('./RuntimeSettings.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'runtime-history-test' })
const source = compiled.scriptSetupAst.filter(node => node.type === 'ImportDeclaration').reverse()
  .reduce((code, node) => code.slice(0, node.start) + code.slice(node.end), descriptor.scriptSetup.content)
function page(post = async () => { throw new Error('unexpected save') }) {
  return localizedVm(`${source}\n;({activeTab,applyDocument,restoreVersion,documentFor,isDirty,saveNamespace,cidrText,revisions,savedDocuments,changeReasons})`, {
    computed, reactive, ref, structuredClone, crypto: globalThis.crypto,
    normalizeMonitor, policyDiff, scannerHealthDefaults, scannerHealthFields, validateMonitor, validateScannerHealth,
    cacheDefaults, validateCache, onMounted: () => {}, useUnsavedChanges: () => {}, http: { post },
  })
}
const plain = value => JSON.parse(JSON.stringify(value))
const current = { enabled: false, authorized_cidrs: ['192.0.2.0/24'], excluded_cidrs: [], excluded_domains: ['current.example.com'], max_targets_per_task: 100 }

test('historical DNS exclusions become a saveable draft without replacing the current revision', async () => {
  const requests = []
  const p = page(async (url, body) => {
    requests.push({ url, body: plain(body) })
    return { data: { data: { document: body.document, revision: 8 } } }
  })
  p.activeTab.value = 'dns_follow_up'; p.applyDocument('dns_follow_up', current, 7)
  const historical = { ...current, excluded_domains: ['*.private.example.org', 'example.net'] }
  p.restoreVersion({ revision: 2, document: historical })
  assert.equal(p.cidrText.dnsExcludedDomains, '*.private.example.org\nexample.net')
  assert.deepEqual(plain(p.documentFor('dns_follow_up')), historical)
  assert.equal(p.isDirty('dns_follow_up'), true); assert.equal(p.revisions.dns_follow_up, 7)
  assert.deepEqual(plain(p.savedDocuments.dns_follow_up), current)
  assert.equal(await p.saveNamespace('dns_follow_up'), true)
  assert.deepEqual(requests, [{ url: '/api/config/runtime/dns_follow_up', body: { expectedRevision: 7, document: historical, changeReason: '恢复历史版本 #2' } }])
  assert.equal(p.isDirty('dns_follow_up'), false); assert.equal(p.revisions.dns_follow_up, 8)
})

test('historical DNS documents predating exclusions clear the current exclusion text', () => {
  const p = page(); p.activeTab.value = 'dns_follow_up'; p.applyDocument('dns_follow_up', current, 7)
  const { excluded_domains, ...legacy } = current
  p.restoreVersion({ revision: 1, document: legacy })
  assert.equal(p.cidrText.dnsExcludedDomains, '')
  assert.deepEqual(plain(p.documentFor('dns_follow_up').excluded_domains), [])
  assert.equal(p.isDirty('dns_follow_up'), true)
})

test('history restoration hydrates every DNS and automatic target range editor', () => {
  for (const [namespace, historical, fields] of [
    ['dns_follow_up', { ...current, authorized_cidrs: ['198.51.100.0/24'], excluded_cidrs: ['198.51.100.5/32'], excluded_domains: [] }, ['authorized_cidrs', 'excluded_cidrs', 'excluded_domains']],
    ['automatic_target', { authorized_cidrs: ['198.51.100.0/24'], excluded_cidrs: ['198.51.100.5/32'], ipv6_authorized_cidrs: ['2001:db8::/32'], ipv6_excluded_cidrs: ['2001:db8:1::/48'] }, ['authorized_cidrs', 'excluded_cidrs', 'ipv6_authorized_cidrs', 'ipv6_excluded_cidrs']],
  ]) {
    const p = page(); p.activeTab.value = namespace; p.applyDocument(namespace, {}, 7)
    p.restoreVersion({ revision: 2, document: historical })
    const draft = p.documentFor(namespace)
    for (const field of fields) assert.deepEqual(plain(draft[field]), historical[field])
    assert.equal(p.revisions[namespace], 7); assert.equal(p.isDirty(namespace), true)
  }
})

// Existing business fixtures select Chinese explicitly; locale behavior has its own tests.
function localizedVm(code, context, options) {
  i18n.global.locale.value = 'zh-CN'
  return vm.runInNewContext(code, { tr, ...context }, options)
}
