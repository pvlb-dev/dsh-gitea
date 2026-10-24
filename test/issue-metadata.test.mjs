import assert from 'node:assert/strict'
import test from 'node:test'

import { formatToolResult } from '../lib/handlers/formatters.js'

const text = (name, data) => formatToolResult(name, { ok: true, data }).map((part) => part.text).join('\n')

const label = (name, id = 1) => ({ id, name, color: 'ff0000' })

test('issue_get renders labels, assignee and milestone (#52)', () => {
  const out = text('gitea_issue_get', {
    number: 4,
    title: 'docs: document the inbox preset',
    state: 'open',
    labels: [label('type/task'), label('area/dsh'), label('priority/next')],
    assignee: { login: 'dsh' },
    milestone: { id: 1, number: 3, title: '0.9' },
    body: '## Context\n…',
  })
  assert.match(out, /^#4 "docs: document the inbox preset" \[open\]/)
  assert.match(out, /labels: type\/task, area\/dsh, priority\/next · assignee: @dsh · milestone: 0\.9/)
  assert.match(out, /\*\*Description:\*\*/)
})

test('issue_get omits the metadata line when nothing is set (#52)', () => {
  const out = text('gitea_issue_get', { number: 7, title: 'bare', state: 'open', labels: [], assignee: null, milestone: null, body: 'x' })
  const lines = out.split('\n')
  assert.equal(lines[0], '#7 "bare" [open]')
  assert.equal(lines[1], '') // blank before the description, no stray separators
  assert.ok(!out.includes('labels:'), 'no empty labels field')
  assert.ok(!out.includes(' · '), 'no dangling separator')
  assert.ok(!out.includes('assignee:'))
})

test('issue_get handles string labels, assignee arrays and a bare milestone', () => {
  const out = text('gitea_issue_get', {
    number: 8,
    state: 'closed',
    labels: ['type/bug', 'area/dsh'],
    assignees: [{ login: 'dsh' }, { login: 'pvl' }],
    milestone: '0.9.0',
  })
  assert.match(out, /labels: type\/bug, area\/dsh · assignee: @dsh, @pvl · milestone: 0\.9\.0/)
})

test('issue_list rows carry label names and the assignee (#52)', () => {
  const out = text('gitea_issue_list', [
    { number: 8, title: 'Submit the plugin listing', state: 'open', labels: [label('type/task'), label('needs-operator')], assignee: { login: 'dsh' } },
    { number: 5, title: 'verify the install path', state: 'open', labels: [], assignee: null },
  ])
  assert.equal(
    out,
    '#8 Submit the plugin listing [type/task, needs-operator · @dsh]\n#5 verify the install path',
  )
})

test('issue_search rows use the same row format', () => {
  const out = text('gitea_issue_search', [
    { number: 4, title: 'docs', state: 'open', labels: [label('area/dsh')] },
  ])
  assert.equal(out, '#4 docs [area/dsh]')
})

test('empty issue lists still answer per-tool (#5 behaviour preserved)', () => {
  assert.equal(text('gitea_issue_list', []), 'No issues.')
})
