import assert from 'node:assert/strict'
import test from 'node:test'
import { deploymentConfigItems } from './configCheck.js'

const item = (field, source = 'startup') => ({ field, source, kind: 'default' })

test('legacy server notices exclude internal fields and database settings', () => {
  const items = deploymentConfigItems({
    component: 'server',
    items: [
      item('server.max_body_size'),
      item('scanner_diagnostics.directory'),
      item('elasticsearch.projection_page_size'),
      item('requests.enabled', 'database_seed'),
    ],
  })
  assert.deepEqual(items.map(({ field }) => field), ['server.max_body_size'])
})

test('legacy scanner notices keep public local switches and exclude internal fields', () => {
  const items = deploymentConfigItems({
    component: 'scanner',
    items: [
      item('scanner.connect_timeout_seconds'),
      item('service_detection.enabled', 'local_limit'),
      item('scanner.heartbeat_interval_seconds'),
      item('scanner.masscan_wait_seconds'),
      item('dns.record_types', 'remote_override'),
    ],
  })
  assert.deepEqual(items.map(({ field }) => field), [
    'scanner.connect_timeout_seconds', 'service_detection.enabled',
  ])
})

test('new reports use their own public schema, including future public fields', () => {
  const report = {
    component: 'server',
    public_fields: ['server.new_public_option', 'requests.enabled'],
    items: [
      item('server.new_public_option'),
      item('server.max_body_size'),
      item('requests.enabled', 'database_seed'),
    ],
  }
  assert.deepEqual(deploymentConfigItems(report).map(({ field }) => field), ['server.new_public_option'])
  report.public_fields = []
  assert.deepEqual(deploymentConfigItems(report), [])
})

test('passed and unknown reports have no configuration indicator items', () => {
  assert.deepEqual(deploymentConfigItems({ component: 'server', items: [] }), [])
  assert.deepEqual(deploymentConfigItems(null), [])
  assert.deepEqual(deploymentConfigItems({ items: [item('server.max_body_size')] }), [])
})
