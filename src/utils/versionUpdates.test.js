import test from 'node:test'
import assert from 'node:assert/strict'
import http from './http.js'
import { checkLatestVersion, isNewerVersion, latestStableTag } from './versionUpdates.js'

test('compares version numbers, prefixes, build metadata and prereleases', () => {
  assert.equal(isNewerVersion('v0.1.20', '0.1.9'), true)
  assert.equal(isNewerVersion('1.0.0', '0.99.99'), true)
  assert.equal(isNewerVersion('1.0.0', '1.0.0-rc.1'), true)
  assert.equal(isNewerVersion('1.0.0-rc.10', '1.0.0-rc.2'), true)
  assert.equal(isNewerVersion('1.0.0+build.2', 'v1.0.0+build.1'), false)
  assert.equal(isNewerVersion('1.0.0-rc.1', '1.0.0'), false)
  assert.equal(isNewerVersion('0.1.19', '0.1.20'), false)
  for (const invalid of ['', '-', 'unknown', '01.2.3', '1.2', '1.2.3-01', null]) {
    assert.equal(isNewerVersion('1.2.3', invalid), false)
    assert.equal(isNewerVersion(invalid, '1.2.3'), false)
  }
})

test('selects the highest stable tag regardless of ordering', () => {
  assert.equal(latestStableTag([
    { name: 'v0.1.9' }, { name: 'v2.0.0-beta.1' }, { name: 'archive' },
    { name: 'v0.1.20' }, { name: '0.1.19' }, null,
  ]), 'v0.1.20')
  assert.equal(latestStableTag([]), '')
  assert.equal(latestStableTag([{ name: 'v1.0.0-rc.1' }]), '')
  assert.throws(() => latestStableTag({ message: 'rate limited' }))
})

test('checks tags only in the browser, shares requests, paginates, and caches failures', async () => {
  assert.equal(await checkLatestVersion('frontend'), '')
  const originalGet = http.get
  globalThis.window = { setTimeout, clearTimeout }
  const requests = []
  http.get = async (url, config) => {
    requests.push({ url, config })
    return config.params.page === 1
      ? { data: [{ name: 'v0.1.9' }], headers: { link: '<https://api.github.com/next>; rel="next"' } }
      : { data: [{ name: 'v0.1.20' }], headers: {} }
  }
  try {
    const first = checkLatestVersion('frontend')
    assert.equal(checkLatestVersion('frontend'), first)
    assert.deepEqual(await Promise.all([first, checkLatestVersion('frontend')]), ['v0.1.20', 'v0.1.20'])
    assert.equal(await checkLatestVersion('frontend'), 'v0.1.20')
    assert.equal(requests.length, 2)
    assert.equal(requests[0].config.withCredentials, false)
    assert.equal(requests[0].config.withXSRFToken, false)
    assert.equal(requests[1].config.params.page, 2)
    assert.ok(requests[0].url.startsWith('https://api.github.com/repos/'))
    let failedRequests = 0
    http.get = async () => { failedRequests++; throw new Error('offline') }
    assert.equal(await checkLatestVersion('scanner'), '')
    assert.equal(await checkLatestVersion('scanner'), '')
    assert.equal(failedRequests, 1)
  } finally {
    http.get = originalGet
    delete globalThis.window
  }
})
