import assert from 'node:assert/strict'
import test from 'node:test'

import { handleIssueTool } from '../lib/handlers/issues.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const REPO_LABELS = [
  { id: 39, name: 'type/bug', color: 'd73a4a' },
  { id: 40, name: 'priority/now', color: 'b60205' },
  { id: 7, name: 'area/forgejo', color: '1d76db' },
]

function makeClient(overrides = {}) {
  const calls = []
  const client = {
    calls,
    async listLabels(owner, repo, query) {
      calls.push({ op: 'listLabels', owner, repo, query })
      return { ok: true, data: REPO_LABELS }
    },
    async createIssue(owner, repo, body) {
      calls.push({ op: 'createIssue', owner, repo, body })
      const labels = (body.labels || []).map((id) => REPO_LABELS.find((label) => label.id === id) || { id, name: `label-${id}` })
      return {
        ok: true,
        data: {
          number: 42,
          title: body.title,
          labels,
          assignee: body.assignee ? { login: body.assignee } : undefined,
          milestone: body.milestone ? { id: body.milestone, title: 'Sprint' } : undefined,
        },
      }
    },
    ...overrides,
  }
  return client
}

const ctx = (client) => ({ client, owner: 'dsh-plugins', repo: 'dsh-gitea' })
const create = (args, client = makeClient()) => handleIssueTool('gitea_issue_create', args, {}, ctx(client))
const text = (value) => formatToolResult('gitea_issue_create', value)[0].text

// #6 — labels, assignee and milestone were dropped by the tool definition/handler.
test('issue create resolves label names case-insensitively and keeps numeric ids (#6)', async () => {
  const client = makeClient()
  const res = await create({ title: 'Bug', labels: ['Type/Bug', 40] }, client)
  assert.equal(res.ok, true)
  const createCall = client.calls.find((call) => call.op === 'createIssue')
  assert.deepEqual(createCall.body.labels, [39, 40])
  assert.equal(client.calls.filter((call) => call.op === 'listLabels').length, 1)
})

test('issue create deduplicates labels supplied by name and id (#6)', async () => {
  const client = makeClient()
  const res = await create({ title: 'Bug', labels: ['type/bug', 39, ' TYPE/BUG '] }, client)
  assert.equal(res.ok, true)
  assert.deepEqual(client.calls.find((call) => call.op === 'createIssue').body.labels, [39])
})

test('issue create fails loudly on an unknown label name (#6 acceptance)', async () => {
  const client = makeClient()
  const res = await create({ title: 'Bug', labels: ['type/bug', 'mystery'] }, client)
  assert.equal(res.ok, false)
  assert.match(res.error, /unknown label name\(s\): mystery/)
  assert.equal(client.calls.some((call) => call.op === 'createIssue'), false)
})

test('issue create rejects a non-array labels value (#6)', async () => {
  const res = await create({ title: 'Bug', labels: 'type/bug' })
  assert.equal(res.ok, false)
  assert.match(res.error, /labels must be an array/)
})

test('issue create forwards assignee and milestone (#6 acceptance)', async () => {
  const client = makeClient()
  const res = await create({ title: 'Bug', assignee: 'dsh', milestone: '3' }, client)
  assert.equal(res.ok, true)
  const body = client.calls.find((call) => call.op === 'createIssue').body
  assert.equal(body.assignee, 'dsh')
  assert.equal(body.milestone, 3)
  assert.equal(body.labels, undefined)
  assert.equal(client.calls.some((call) => call.op === 'listLabels'), false)
})

test('issue create rejects a non-numeric milestone (#6)', async () => {
  const res = await create({ title: 'Bug', milestone: 'sprint' })
  assert.equal(res.ok, false)
  assert.match(res.error, /milestone must be a number/)
})

test('issue create echoes the attached labels, assignee and milestone (#6 acceptance)', async () => {
  const client = makeClient()
  const res = await create({ title: 'Bug', labels: ['type/bug', 'priority/now'], assignee: 'dsh', milestone: 3 }, client)
  assert.equal(res.ok, true)
  const out = text(res)
  assert.match(out, /^#42 "Bug" opened with labels \[type\/bug, priority\/now\] assigned to @dsh milestone #3 \(Sprint\)$/)
})

test('issue create without labels keeps the plain echo (#6)', async () => {
  const client = makeClient()
  const res = await create({ title: 'Plain bug' }, client)
  assert.equal(res.ok, true)
  assert.equal(text(res), '#42 "Plain bug" opened')
})
