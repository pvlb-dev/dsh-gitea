import assert from 'node:assert/strict'
import test from 'node:test'

import { GiteaClient } from '../lib/gitea-client.js'
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
