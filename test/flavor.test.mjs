import assert from 'node:assert/strict'
import test from 'node:test'

import { detectFlavor, probeWebTitle } from '../lib/forgejo-detect.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const FORGEJO_TITLE = '<!doctype html><html><head><title>Forgejo: Beyond coding. We forge.</title></head></html>'
const GITEA_TITLE = '<!doctype html><html><head><title>Gitea: Git with a cup of tea</title></head></html>'

const client = (version) => ({
  baseUrl: 'https://git.example',
  async getVersion() {
    return { ok: true, data: { version } }
  },
})

const htmlFetch = (html) => async () => ({ ok: true, async text() { return html } })

const text = (name, value) => formatToolResult(name, value)[0].text

// #57 — Forgejo advertises `17.0.0+gitea-1.22.0`; asking the version alone
// answered "gitea" on every Forgejo.
test('a +gitea- compatibility version is disambiguated by the web UI title (#57)', async () => {
  const res = await detectFlavor({}, { client: client('17.0.0+gitea-1.22.0'), fetchImpl: htmlFetch(FORGEJO_TITLE) })
  assert.equal(res.data.flavor, 'forgejo')
  assert.equal(res.data.detectedFrom, 'web-title')
  assert.ok(res.data.notes.some((note) => /X-Forgejo/.test(note)))
})

test('the same version on a real Gitea instance still reports gitea (#57)', async () => {
  const res = await detectFlavor({}, { client: client('1.22.0+gitea-1.22.0'), fetchImpl: htmlFetch(GITEA_TITLE) })
  assert.equal(res.data.flavor, 'gitea')
  assert.equal(res.data.detectedFrom, 'web-title')
})

test('an unreadable title never yields a confident gitea (#57)', async () => {
  const throwing = async () => { throw new Error('ECONNREFUSED') }
  const res = await detectFlavor({}, { client: client('17.0.0+gitea-1.22.0'), fetchImpl: throwing })
  assert.equal(res.data.flavor, 'unknown')
  assert.match(res.data.reason, /compatibility suffix/)
  assert.match(text('gitea_flavor', res), /^Instance flavor: could not determine/)
})

test('a plain version resolves without any probe (#57)', async () => {
  let probed = false
  const res = await detectFlavor({}, {
    client: client('1.22.0'),
    fetchImpl: async () => { probed = true; return { ok: true, async text() { return GITEA_TITLE } } },
  })
  assert.equal(res.data.flavor, 'gitea')
  assert.equal(probed, false, 'no probe needed when the version is unambiguous')
})

test('a version naming forgejo wins outright', async () => {
  const res = await detectFlavor({}, { client: client('9.0.0+forgejo'), fetchImpl: htmlFetch(GITEA_TITLE) })
  assert.equal(res.data.flavor, 'forgejo')
  assert.equal(res.data.detectedFrom, 'version')
})

test('an empty version reports unknown with a reason (#57)', async () => {
  const res = await detectFlavor({}, { client: client('') })
  assert.equal(res.data.flavor, 'unknown')
  assert.match(res.data.reason, /no version/)
})

test('probeWebTitle is safe without a baseUrl or fetch', async () => {
  assert.equal(await probeWebTitle('', htmlFetch(FORGEJO_TITLE)), '')
  assert.equal(await probeWebTitle('https://git.example', null), '')
})

// #56 — the formatter had no flavor branch, so a successful call rendered
// "Unrecognised response" + clipped JSON.
test('gitea_flavor renders flavor, version and notes (#56)', () => {
  const out = text('gitea_flavor', {
    ok: true,
    data: {
      flavor: 'forgejo',
      version: '17.0.0+gitea-1.22.0',
      notes: ['Gitea Actions may be absent or differ — CI tools may not work.', 'Webhook format and headers may differ.'],
    },
  })
  assert.equal(out.split('\n')[0], 'Flavor: forgejo · version 17.0.0+gitea-1.22.0')
  assert.match(out, /\n- Gitea Actions may be absent/)
  assert.match(out, /\n- Webhook format/)
  assert.ok(!out.includes('Unrecognised response'))
})

test('gitea_flavor omits an empty version and explains unknown (#56)', () => {
  const out = text('gitea_flavor', { ok: true, data: { flavor: 'gitea', version: '', notes: ['Full support for Gitea Actions.'] } })
  assert.equal(out.split('\n')[0], 'Flavor: gitea')
  const unknown = text('gitea_flavor', { ok: true, data: { flavor: 'unknown', version: '', notes: ['Could not detect instance flavor.'] } })
  assert.match(unknown, /^Instance flavor: could not determine/)
  assert.ok(!unknown.includes('Unrecognised response'))
})
