import assert from 'node:assert/strict'
import test from 'node:test'

import { handleIssueTool } from '../lib/handlers/issues.js'
import { TOOL_DEFS } from '../lib/tool-defs.js'

// The operator tried to sort with the first `gitea_issue_list` call and hit
// "unknown argument sort": the endpoint has supported it all along (Forgejo 17
// swagger, enum below), the tool just never exposed it.

const ctx = (client) => ({ client, owner: 'acme', repo: 'docs' })

function recordingClient() {
  const seen = []
  return {
    seen,
    async listIssues(owner, repo, query) {
      seen.push({ owner, repo, query })
      return { ok: true, data: [] }
    },
  }
}

test('gitea_issue_list passes sort to the API', async () => {
  const client = recordingClient()
  const res = await handleIssueTool('gitea_issue_list', { state: 'open', sort: 'recentupdate' }, {}, ctx(client))
  assert.equal(res.ok, true)
  assert.equal(client.seen.length, 1)
  assert.equal(client.seen[0].query.sort, 'recentupdate')
  assert.equal(client.seen[0].query.state, 'open')
})

test('gitea_issue_list normalises the sort case', async () => {
  const client = recordingClient()
  await handleIssueTool('gitea_issue_list', { sort: 'LeastUpdate' }, {}, ctx(client))
  assert.equal(client.seen[0].query.sort, 'leastupdate')
})

test('gitea_issue_list omits sort when not given', async () => {
  const client = recordingClient()
  await handleIssueTool('gitea_issue_list', {}, {}, ctx(client))
  assert.equal('sort' in client.seen[0].query, false, 'the API default stays in charge')
})

test('gitea_issue_list rejects an unknown sort with the accepted list', async () => {
  const client = recordingClient()
  const res = await handleIssueTool('gitea_issue_list', { sort: 'nope' }, {}, ctx(client))
  assert.equal(res.ok, false)
  assert.match(res.error, /unknown sort "nope"/)
  assert.match(res.error, /recentupdate/)
  assert.equal(client.seen.length, 0, 'no request for an invalid sort')
})

test('the tool def exposes the API sort enum', () => {
  const def = TOOL_DEFS.find((d) => d.name === 'gitea_issue_list')
  assert.ok(def, 'gitea_issue_list is declared')
  assert.ok(Array.isArray(def.parameters.sort.enum), 'sort is an enum in the schema')
  for (const value of ['latest', 'oldest', 'recentupdate', 'leastupdate', 'mostcomment', 'leastcomment', 'nearduedate', 'farduedate', 'relevance']) {
    assert.ok(def.parameters.sort.enum.includes(value), value)
  }
})
