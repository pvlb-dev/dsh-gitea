import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { getWriteRejectionStatus, isLoopbackAddress, isTrustedHost } from '../lib/http-guard.js'
import { credentialRefStatus, unwrapVolatile } from '../lib/secrets.js'
import { normalizeExternalUrl } from '../lib/url-safety.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
const routes = readFileSync(join(root, 'lib/routes.js'), 'utf8')
const hostEntry = readFileSync(join(root, 'lib/index.js'), 'utf8')
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

test('client manifest and bundle exports are present', () => {
  assert.equal(pkg.dsh?.client?.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.match(pkg.exports['./cordis.patch.yml'], /cordis\.patch\.yml$/)
  assert.ok(pkg.peerDependencies['@deepseek-ai/dsh-tools'].includes('0.2.0-rc.1'))
})

test('client registers the DSH 0.2.x settings and row configuration seats', () => {
  assert.match(client, /slotsSvc\.inject\('settings\.section'/)
  assert.match(client, /name: 'settings\.section'/)
  assert.match(client, /slotsSvc\.inject\('plugins\.row\.config'/)
  assert.match(client, /name: 'plugins\.row\.config'/)
  // Row key is `<package name>#<row id>` as declared by the bundle patch.
  assert.match(client, /const ROW_CONFIG_KEY = PKG \+ '#' \+ ROW_ID/)
  const rowId = patch.match(/-\s*insert:\s*\n\s*-\s*id:\s*([A-Za-z0-9._-]+)/)
  assert.ok(rowId, 'cordis.patch.yml declares an inserted row id')
  assert.match(client, new RegExp(`const ROW_ID = '${rowId[1]}'`))
})

test('configuration form does not depend on the browser configForms mirror', () => {
  // On non-loopback pages the mirror is memory-only and reports `unavailable`,
  // which used to hide the entire form behind one message.
  assert.doesNotMatch(client, /getService\(ctx, 'configForms'\)/)
  assert.doesNotMatch(client, /scope\.set\(/)
  assert.match(client, /inject: \['slots', 'locale'\]\)?/)
})

test('configuration form reads and saves through the Host route', () => {
  assert.match(client, /clientFetch\('\/dsh-gitea\/config'/)
  assert.match(client, /method: 'POST'/)
  assert.match(client, /settingsUnavailable/)
  // Only a failing GET may show the unavailable state.
  assert.match(client, /setStatus\('unavailable'\)/)
})

test('Host reports settings writability and refuses non-persistent writes', () => {
  assert.match(routes, /writable: settingsWritable\(\)/)
  assert.match(routes, /Host Settings service is unavailable/)
  assert.match(routes, /isSettingsReady/)
  assert.match(hostEntry, /const isSettingsReady = \(\) =>/)
  assert.match(hostEntry, /settings\/document-updated', applySettingsEvent/)
})

test('http guard keeps loopback-only fallbacks and same-origin writes', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('203.0.113.9'), false)
  assert.equal(isTrustedHost('localhost:3080'), true)
  assert.equal(isTrustedHost('gitea.example.com:443'), false)

  const baseRequest = (headers, remoteAddress = '127.0.0.1') => ({
    headers,
    socket: { remoteAddress },
  })
  assert.equal(getWriteRejectionStatus(baseRequest({ host: '127.0.0.1:3080' })), undefined)
  assert.equal(getWriteRejectionStatus(baseRequest({})), 403)
  assert.equal(getWriteRejectionStatus(baseRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' })), 403)
  assert.equal(getWriteRejectionStatus(baseRequest({ host: '127.0.0.1:3080', origin: 'http://evil.example' })), 403)
  assert.equal(getWriteRejectionStatus(baseRequest({ host: '127.0.0.1:3080' }, '203.0.113.9')), 403)
})

test('credential references reject token-shaped input', () => {
  assert.equal(credentialRefStatus('GITEA_TOKEN').ok, true)
  assert.equal(credentialRefStatus('0123456789abcdef0123456789abcdef').ok, false)
  assert.equal(credentialRefStatus('not a ref').ok, false)
})

test('volatile wrappers unwrap recursively', () => {
  const wrapper = (value) => ({ get: () => value })
  assert.deepEqual(unwrapVolatile({ baseUrl: wrapper('https://git.example'), nested: wrapper(wrapper(3)) }), {
    baseUrl: 'https://git.example',
    nested: 3,
  })
})

test('https URL rewriting only upgrades matching Gitea hosts', () => {
  assert.equal(
    normalizeExternalUrl('http://git.example/owner/repo', { baseUrl: 'https://git.example', dshProtocol: 'https:' }),
    'https://git.example/owner/repo',
  )
  assert.equal(
    normalizeExternalUrl('http://other.example/x', { baseUrl: 'https://git.example', dshProtocol: 'https:' }),
    'http://other.example/x',
  )
})
