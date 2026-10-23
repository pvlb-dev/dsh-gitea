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

const ok = (data) => ({ ok: true, data })
const text = (name, value) => formatToolResult(name, value)[0].text

// #3 — the formatter returned data.path instead of the file body.
test('repo contents renders the decoded body plus both links (#3)', () => {
  const out = text('gitea_repo_contents', ok({
    path: 'AGENTS.md',
    encoding: 'base64',
    size: 24,
    content: Buffer.from('# AGENTS\n\nhello\n', 'utf8').toString('base64'),
    html_url: 'https://git.example/acme/docs/src/branch/main/AGENTS.md',
    download_url: 'https://git.example/acme/docs/raw/branch/main/AGENTS.md',
  }))
  assert.match(out, /^File: AGENTS\.md \(24 bytes, encoding: base64\)$/m)
  assert.match(out, /^URL: https:\/\/git\.example\/acme\/docs\/src\/branch\/main\/AGENTS\.md$/m)
  assert.match(out, /^Download: https:\/\/git\.example\/acme\/docs\/raw\/branch\/main\/AGENTS\.md$/m)
  assert.match(out, /# AGENTS/)
  assert.match(out, /hello/)
})

test('repo contents decodes unicode correctly (#3)', () => {
  const out = text('gitea_repo_contents', ok({
    path: 'README.md',
    encoding: 'base64',
    content: Buffer.from('héllo — 世界\n', 'utf8').toString('base64'),
  }))
  assert.match(out, /héllo — 世界/)
})

test('repo contents truncates a large file visibly (#3 acceptance)', () => {
  const body = 'a'.repeat(25_000)
  const out = text('gitea_repo_contents', ok({
    path: 'big.txt',
    encoding: 'base64',
    content: Buffer.from(body, 'utf8').toString('base64'),
    download_url: 'https://git.example/acme/docs/raw/big.txt',
  }))
  assert.match(out, /truncated: showing the first 20000 characters/)
  assert.match(out, /https:\/\/git\.example\/acme\/docs\/raw\/big\.txt/)
  assert.ok(out.length < 21_000, `result is ${out.length} chars`)
  assert.ok(out.split('\n').at(-1).startsWith('… [truncated'), 'truncation note is the last line')
})

test('repo contents distinguishes empty files and missing content (#3)', () => {
  const empty = text('gitea_repo_contents', ok({ path: 'empty.txt', encoding: 'base64', content: '' }))
  assert.match(empty, /\(empty file\)/)
  const missing = text('gitea_repo_contents', ok({ path: 'submodule', size: 0 }))
  assert.match(missing, /no content returned by the API/)
})

test('repo contents root path requests /contents and renders the listing (#3)', async () => {
  let seenUrl = ''
  const client = makeClient((url) => {
    seenUrl = url
    return mockResponse(200, [
      { name: 'AGENTS.md', path: 'AGENTS.md', type: 'file' },
      { name: 'lib', path: 'lib', type: 'dir' },
    ])
  })
  const res = await client.getContents('acme', 'docs', '')
  assert.equal(res.ok, true)
  assert.match(seenUrl, /\/api\/v1\/repos\/acme\/docs\/contents$/)
  const out = text('gitea_repo_contents', res)
  assert.match(out, /^AGENTS\.md$/m)
  assert.match(out, /^lib$/m)
})

test('repo contents still encodes file paths and rejects traversal (#3)', async () => {
  const seen = []
  const client = makeClient((url) => {
    seen.push(url)
    return mockResponse(200, { path: 'src/a b.js', encoding: 'base64', content: '' })
  })
  const res = await client.getContents('acme', 'docs', 'src/a b.js')
  assert.equal(res.ok, true)
  assert.match(seen[0], /\/contents\/src\/a%20b\.js$/)
  const bad = await client.getContents('acme', 'docs', '../secret')
  assert.equal(bad.ok, false)
  assert.match(bad.error, /invalid owner, repo, or filePath/)
})
