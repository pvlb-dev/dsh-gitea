import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { getRejectionStatus, getWriteRejectionStatus, isLoopbackAddress, isTrustedHost } from '../lib/http-guard.js'
import { registerPluginUpdater } from '../lib/plugin-updater.js'
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

test('a mounted Connection fence is authoritative for trusted non-loopback hosts', () => {
  // Regression: an admitted Tailscale/LAN request used to fall through to the
  // loopback-only fallback and become 403 even though Connection admitted it.
  const admitted = { requestRejection: () => undefined }
  const rejected401 = { requestRejection: () => 401 }
  const rejected403 = { requestRejection: () => 403 }
  const throwing = { requestRejection: () => { throw new Error('connection failure') } }
  const trustedTailscaleRequest = {
    headers: {
      host: 'harness.example.ts.net',
      origin: 'https://harness.example.ts.net',
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '100.64.0.8' },
  }

  assert.equal(getRejectionStatus(trustedTailscaleRequest, { connection: admitted }), undefined)
  assert.equal(getWriteRejectionStatus(trustedTailscaleRequest, { connection: admitted }), undefined)
  // Connection is authoritative about same-origin for writes too; the guard must
  // not re-compare a proxy-rewritten Host against the browser Origin.
  assert.equal(getWriteRejectionStatus(
    { ...trustedTailscaleRequest, headers: { ...trustedTailscaleRequest.headers, origin: 'https://proxy.internal' } },
    { connection: admitted },
  ), undefined)
  assert.equal(getRejectionStatus(trustedTailscaleRequest, { connection: rejected401 }), 401)
  assert.equal(getRejectionStatus(trustedTailscaleRequest, { connection: rejected403 }), 403)
  assert.equal(getRejectionStatus(trustedTailscaleRequest, { connection: throwing }), 403)
  // Without Connection the same request stays fail-closed.
  assert.equal(getRejectionStatus(trustedTailscaleRequest), 403)
  assert.equal(getWriteRejectionStatus(trustedTailscaleRequest), 403)
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

test('fork off-switch: config flag gates the in-UI updater everywhere', () => {
  // The updater installs `@goodandready/dsh-gitea@<npm latest>`, which replaces a
  // link:ed fork checkout. The switch must exist in the schema, be wired into
  // the updater, and be reflected in the form (field + hidden panel + no poll).
  assert.match(hostEntry, /updates: z\.boolean\(\)\.default\(true\)/)
  assert.match(hostEntry, /isEnabled: \(\) => live\(\)\.updates !== false/)
  assert.match(client, /updates: cfg\.updates !== false/)
  assert.match(client, /draft\.updates !== false/)
  assert.match(client, /t\('updatesEnabled'\)/)
  assert.doesNotMatch(client, /React\.useEffect\(\(\) => \{\s*checkUpdates\(\)/)
  assert.match(client, /maybeCheckUpdates\(data && data\.config\)/)
})

test('plugin updater refuses every request while the off-switch is off', async () => {
  const registrations = []
  const ctx = {
    get: (name) => (name === 'webServer' ? { register: (options) => { registrations.push(options); return () => {} } } : undefined),
  }
  registerPluginUpdater(ctx, {
    endpoint: '/api/test/update',
    packageName: 'test-package',
    manifestUrl: new URL('../package.json', import.meta.url),
    isEnabled: () => false,
  })
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].path, '/api/test/update')

  const call = (request) => new Promise((resolve, reject) => {
    const response = {
      status: 0,
      writeHead(status) { this.status = status },
      end(chunk) {
        try {
          resolve({ status: this.status, body: JSON.parse(String(chunk || '{}')) })
        } catch (error) {
          reject(error)
        }
      },
    }
    Promise.resolve(registrations[0].handler(request, response)).catch(reject)
  })

  for (const method of ['GET', 'HEAD', 'POST']) {
    const result = await call({ method, headers: {}, socket: { remoteAddress: '127.0.0.1' } })
    assert.equal(result.status, 403)
    assert.equal(result.body.code, 'disabled')
  }
})
