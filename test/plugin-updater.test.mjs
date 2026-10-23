import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  clearLatestCache,
  createRegistryUserconfig,
  getStatus,
  isNewerVersion,
  latestVersion,
  packumentLatest,
  registryAuthKey,
} from '../lib/plugin-updater.js'

const REGISTRY = 'https://git.pvlb.dev/api/packages/dsh-plugins/npm/'
const PACKAGE = '@goodandready/dsh-gitea'
const MANIFEST = new URL('../package.json', import.meta.url)

async function withMockFetch(handler, fn) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return handler(String(url), options)
  }
  try {
    return await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

test('packumentLatest prefers dist-tags.latest', () => {
  assert.equal(
    packumentLatest({ 'dist-tags': { latest: '0.7.40-dsh.3' }, versions: { '0.7.40-dsh.2': {} } }),
    '0.7.40-dsh.3',
  )
})

test('packumentLatest falls back to the highest published version', () => {
  assert.equal(
    packumentLatest({ versions: { '0.7.40-dsh.2': {}, '0.7.40-dsh.10': {}, '0.7.40-dsh.3': {} } }),
    '0.7.40-dsh.10',
  )
})

test('fork version ordering is numeric as well as lexical', () => {
  assert.equal(isNewerVersion('0.7.40-dsh.2', '0.7.40-dsh.10'), true)
  assert.equal(isNewerVersion('0.7.40-dsh.10', '0.7.40-dsh.2'), false)
  assert.equal(isNewerVersion('0.7.40-dsh.3', '0.7.40-dsh.3'), false)
})

test('latestVersion reads the Forgejo packument, not the npmjs /latest alias', async () => {
  clearLatestCache()
  await withMockFetch(async () => ({
    ok: true,
    json: async () => ({ 'dist-tags': { latest: '0.7.40-dsh.3' }, versions: {} }),
  }), async (calls) => {
    const latest = await latestVersion(PACKAGE, REGISTRY, 'tok')
    assert.equal(latest, '0.7.40-dsh.3')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, `${REGISTRY}${encodeURIComponent(PACKAGE)}`)
    assert.equal(calls[0].options.headers.authorization, 'token tok')
    assert.doesNotMatch(calls[0].url, /\/latest$/)
  })
})

test('latestVersion caches per package and registry', async () => {
  clearLatestCache()
  let requests = 0
  await withMockFetch(async () => {
    requests += 1
    return { ok: true, json: async () => ({ 'dist-tags': { latest: '0.7.40-dsh.3' } }) }
  }, async () => {
    await latestVersion(PACKAGE, REGISTRY)
    await latestVersion(PACKAGE, REGISTRY)
    assert.equal(requests, 1)
  })
})

test('latestVersion tolerates an unreachable registry', async () => {
  clearLatestCache()
  await withMockFetch(() => { throw new Error('offline') }, async () => {
    assert.equal(await latestVersion(PACKAGE, REGISTRY), undefined)
  })
})

test('registryAuthKey is the npm URI-fragment form', () => {
  assert.equal(
    registryAuthKey(REGISTRY),
    '//git.pvlb.dev/api/packages/dsh-plugins/npm/:_authToken',
  )
  assert.equal(
    registryAuthKey('https://git.example.com/api/packages/owner/npm'),
    '//git.example.com/api/packages/owner/npm/:_authToken',
  )
})

test('createRegistryUserconfig scopes only our package to Forgejo', async () => {
  const config = await createRegistryUserconfig(REGISTRY, PACKAGE, 'tok', '/nonexistent/.npmrc')
  try {
    const content = await readFile(config.file, 'utf8')
    assert.match(content, /^@goodandready:registry=https:\/\/git\.pvlb\.dev\/api\/packages\/dsh-plugins\/npm\/$/m)
    assert.match(content, /^\/\/git\.pvlb\.dev\/api\/packages\/dsh-plugins\/npm\/:_authToken=tok$/m)
  } finally {
    await config.cleanup()
  }
  await assert.rejects(readFile(config.file, 'utf8'))
})

test('createRegistryUserconfig omits auth when no token is available', async () => {
  const config = await createRegistryUserconfig(REGISTRY, PACKAGE, undefined, '/nonexistent/.npmrc')
  try {
    const content = await readFile(config.file, 'utf8')
    assert.doesNotMatch(content, /_authToken/)
  } finally {
    await config.cleanup()
  }
})

test('createRegistryUserconfig carries the user config forward', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-gitea-npmrc-'))
  const base = join(dir, '.npmrc')
  await writeFile(base, 'minimum-release-age=1440\n', 'utf8')
  const config = await createRegistryUserconfig(REGISTRY, PACKAGE, undefined, base)
  try {
    const content = await readFile(config.file, 'utf8')
    assert.match(content, /^minimum-release-age=1440$/m)
    assert.match(content, /^@goodandready:registry=/m)
  } finally {
    await config.cleanup()
    await rm(dir, { recursive: true, force: true })
  }
})

test('getStatus compares the manifest against the registry packument', async () => {
  clearLatestCache()
  await withMockFetch(async () => ({
    ok: true,
    json: async () => ({ 'dist-tags': { latest: '0.7.40-dsh.99' }, versions: {} }),
  }), async () => {
    const status = await getStatus({ packageName: PACKAGE, registry: REGISTRY, manifestUrl: MANIFEST }, { profileName: 'web' })
    assert.equal(status.registry, REGISTRY)
    assert.equal(status.latestVersion, '0.7.40-dsh.99')
    assert.equal(status.latestCheckFailed, false)
    assert.equal(status.updateAvailable, true)
  })
})
