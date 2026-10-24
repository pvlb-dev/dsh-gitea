import assert from 'node:assert/strict'
import test from 'node:test'

import { GiteaClient } from '../lib/gitea-client.js'
import { handleRepoTool } from '../lib/handlers/repos.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'application/json' : null
      },
    },
    async text() {
      return body === undefined ? '' : JSON.stringify(body)
    },
  }
}

function makeClient(handler) {
  return new GiteaClient({
    baseUrl: 'https://git.example',
    token: 'test-token',
    fetchImpl: async (url, init) => handler(String(url), init),
    retries: 0,
    retryDelayMs: 0,
    cacheTtlMs: 0,
  })
}

const text = (name, value) => formatToolResult(name, value)[0].text

// #9 — an enabled-but-empty wiki answers 404; that is an empty list, not an error.
test('listWikiPages maps an empty-wiki 404 to a successful empty list (#9)', async () => {
  let seenUrl = ''
  const client = makeClient((url) => {
    seenUrl = url
    return mockResponse(404, { message: "The target couldn't be found." })
  })
  const res = await client.listWikiPages('ml-lab', 'tardits')
  assert.equal(res.ok, true)
  assert.equal(res.status, 404)
  assert.deepEqual(res.data, [])
  assert.match(seenUrl, /\/api\/v1\/repos\/ml-lab\/tardits\/wiki\/pages$/)
  assert.equal(text('gitea_wiki', res), 'No wiki pages.')
})

test('listWikiPages still fails on 401/403/5xx (#9 acceptance)', async () => {
  for (const [status, message] of [[401, 'unauthorized'], [403, 'forbidden'], [500, 'boom']]) {
    const client = makeClient(() => mockResponse(status, { message }))
    const res = await client.listWikiPages('ml-lab', 'tardits')
    assert.equal(res.ok, false, `status ${status} must stay an error`)
    assert.equal(res.status, status)
    assert.equal(res.error, message)
  }
})

test('listWikiPages returns pages unchanged for a non-empty wiki (#9 acceptance)', async () => {
  const pages = [{ title: 'Home' }, { title: 'DSH Bootcamp' }]
  const client = makeClient(() => mockResponse(200, pages))
  const res = await client.listWikiPages('pvlb-infra', 't14-deeps')
  assert.equal(res.ok, true)
  assert.deepEqual(res.data, pages)
  assert.match(text('gitea_wiki', res), /Home/)
})

// #10 — create/update/delete were missing although Forgejo exposes the API.
test('createWikiPage POSTs base64 content to /wiki/new (#10)', async () => {
  const seen = []
  const client = makeClient((url, init) => {
    seen.push({ url, init })
    return mockResponse(201, { title: 'Home', html_url: 'https://git.example/acme/docs/wiki/Home' })
  })
  const res = await client.createWikiPage('acme', 'docs', { title: 'Home', content: '# Héllo\n', message: 'create home' })
  assert.equal(res.ok, true)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].init.method, 'POST')
  assert.match(seen[0].url, /\/api\/v1\/repos\/acme\/docs\/wiki\/new$/)
  const body = JSON.parse(seen[0].init.body)
  assert.equal(body.title, 'Home')
  assert.equal(body.content_base64, Buffer.from('# Héllo\n', 'utf8').toString('base64'))
  assert.equal(body.message, 'create home')
})

test('updateWikiPage PATCHes the page segment and sends full content (#10)', async () => {
  const seen = []
  const client = makeClient((url, init) => {
    seen.push({ url, init })
    return mockResponse(200, { title: 'DSH Bootcamp', html_url: 'https://git.example/acme/docs/wiki/DSH-Bootcamp' })
  })
  const res = await client.updateWikiPage('acme', 'docs', 'DSH Bootcamp', { content: 'new body', message: 'edit' })
  assert.equal(res.ok, true)
  assert.equal(seen[0].init.method, 'PATCH')
  assert.match(seen[0].url, /\/wiki\/page\/DSH%20Bootcamp$/)
  const body = JSON.parse(seen[0].init.body)
  assert.equal(body.content_base64, Buffer.from('new body', 'utf8').toString('base64'))
  assert.equal(body.title, undefined)
})

test('deleteWikiPage DELETEs the page segment (#10)', async () => {
  const seen = []
  const client = makeClient((url, init) => {
    seen.push({ url, init })
    return mockResponse(204)
  })
  const res = await client.deleteWikiPage('acme', 'docs', 'Home')
  assert.equal(res.ok, true)
  assert.equal(seen[0].init.method, 'DELETE')
  assert.match(seen[0].url, /\/wiki\/page\/Home$/)
  assert.equal(seen[0].init.body, undefined)
})

test('wiki writes still fail on 401/403 (#10 acceptance)', async () => {
  for (const status of [401, 403]) {
    const client = makeClient(() => mockResponse(status, { message: 'denied' }))
    const created = await client.createWikiPage('acme', 'docs', { title: 'Home', content: 'x' })
    assert.equal(created.ok, false)
    assert.equal(created.status, status)
    const updated = await client.updateWikiPage('acme', 'docs', 'Home', { content: 'x' })
    assert.equal(updated.ok, false)
    const deleted = await client.deleteWikiPage('acme', 'docs', 'Home')
    assert.equal(deleted.ok, false)
  }
})

test('wiki list shows the canonical pageName slug (#10)', () => {
  const out = text('gitea_wiki', {
    ok: true,
    data: [
      { title: 'Probe-Page', sub_url: 'Probe-Page.-' },
      { title: 'Home', sub_url: 'Home' },
    ],
  })
  assert.match(out, /^Probe-Page \(pageName: Probe-Page\.-\)$/m)
  assert.match(out, /^Home \(pageName: Home\)$/m)
})

function fakeClient(overrides = {}) {
  return {
    async getWikiPage() { return { ok: true, data: { title: 'Home' } } },
    async createWikiPage() { return { ok: true, data: { title: 'Home', html_url: 'https://git.example/acme/docs/wiki/Home' } } },
    async updateWikiPage() { return { ok: true, data: { title: 'Home', html_url: 'https://git.example/acme/docs/wiki/Home' } } },
    async deleteWikiPage() { return { ok: true } },
    ...overrides,
  }
}

const wikiCtx = (client) => ({ client, owner: 'acme', repo: 'docs' })
const callWiki = (args, client = fakeClient()) => handleRepoTool('gitea_wiki', args, {}, wikiCtx(client))

test('wiki create requires a title and echoes the created page (#10)', async () => {
  const missing = await callWiki({ action: 'create', content: 'x' })
  assert.equal(missing.ok, false)
  assert.match(missing.error, /title/)
  const created = await callWiki({ action: 'create', title: 'Home', content: '# Hi' })
  assert.equal(created.ok, true)
  assert.equal(created.data.action, 'wiki_created')
  assert.match(text('gitea_wiki', created), /^Wiki page created: Home/)
})

test('wiki update requires content and echoes the update (#10)', async () => {
  const missing = await callWiki({ action: 'update', pageName: 'Home' })
  assert.equal(missing.ok, false)
  assert.match(missing.error, /content/)
  const updated = await callWiki({ action: 'update', pageName: 'Home', content: 'new body' })
  assert.equal(updated.ok, true)
  assert.equal(updated.data.action, 'wiki_updated')
  assert.match(text('gitea_wiki', updated), /^Wiki page updated: Home/)
})

test('wiki delete requires confirm: true (#10)', async () => {
  const denied = await callWiki({ action: 'delete', pageName: 'Home' })
  assert.equal(denied.ok, false)
  assert.match(denied.error, /confirm/)
  const deleted = await callWiki({ action: 'delete', pageName: 'Home', confirm: true })
  assert.equal(deleted.ok, true)
  assert.equal(deleted.data.deleted, true)
  assert.equal(text('gitea_wiki', deleted), 'Wiki page deleted: Home')
})

test('wiki writes surface API failures instead of succeeding silently (#10)', async () => {
  const failing = fakeClient({ async createWikiPage() { return { ok: false, status: 403, error: 'denied' } } })
  const res = await callWiki({ action: 'create', title: 'Home', content: 'x' }, failing)
  assert.equal(res.ok, false)
  assert.equal(res.error, 'denied')
})

// #55 — Forgejo renames a wiki page to "unnamed" when the PATCH carries no
// title, so an update that is not a rename must send the current title back.
test('wiki update keeps the current title when none is given (#55)', async () => {
  const seen = []
  const client = fakeClient({
    async getWikiPage() { return { ok: true, data: { title: 'Smoke Test Drift' } } },
    async updateWikiPage(owner, repo, pageName, body) {
      seen.push(body)
      return { ok: true, data: { title: body.title } }
    },
  })
  const res = await callWiki({ action: 'update', pageName: 'Smoke-Test-Drift', content: 'new body' }, client)
  assert.equal(res.ok, true)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].title, 'Smoke Test Drift', 'the PATCH body always carries a non-empty title')
  assert.equal(text('gitea_wiki', res), 'Wiki page updated: Smoke Test Drift')
})

test('wiki update still renames when a title is given (#55)', async () => {
  const seen = []
  const client = fakeClient({
    async getWikiPage() { throw new Error('should not be read when a title is given') },
    async updateWikiPage(owner, repo, pageName, body) {
      seen.push(body)
      return { ok: true, data: { title: body.title } }
    },
  })
  const res = await callWiki({ action: 'update', pageName: 'Old-Name', title: 'New Name', content: 'x' }, client)
  assert.equal(res.ok, true)
  assert.equal(seen[0].title, 'New Name')
})

test('wiki update falls back to pageName when the current title is unreadable (#55)', async () => {
  const seen = []
  const client = fakeClient({
    async getWikiPage() { return { ok: false, status: 404, error: 'not found' } },
    async updateWikiPage(owner, repo, pageName, body) {
      seen.push(body)
      return { ok: true, data: { title: body.title } }
    },
  })
  const res = await callWiki({ action: 'update', pageName: 'Plain-Name', content: 'x' }, client)
  assert.equal(res.ok, true)
  assert.equal(seen[0].title, 'Plain-Name')
})

test('wiki update on a missing page still surfaces the failure (#55)', async () => {
  const client = fakeClient({
    async getWikiPage() { return { ok: false, status: 404, error: 'not found' } },
    async updateWikiPage() { return { ok: false, status: 404, error: 'wiki page not found' } },
  })
  const res = await callWiki({ action: 'update', pageName: 'Ghost', content: 'x' }, client)
  assert.equal(res.ok, false)
  assert.match(text('gitea_wiki', res), /not found/)
})
