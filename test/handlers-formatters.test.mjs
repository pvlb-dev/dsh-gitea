import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { slimRecord } from '../lib/handlers/common.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const formatterSource = readFileSync(join(root, 'lib/handlers/formatters.js'), 'utf8')

const ok = (data) => ({ ok: true, data })
const text = (name, value) => formatToolResult(name, value)[0].text

// #2 — gitea_issue_list silently truncated at 20 rows.
test('renders every issue row the API returned (#2)', () => {
  const issues = Array.from({ length: 28 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}` }))
  const out = text('gitea_issue_list', ok(issues))
  const lines = out.split('\n')
  assert.equal(lines.length, 28)
  assert.equal(lines[0], '#1 Issue 1')
  assert.equal(lines[27], '#28 Issue 28')
  assert.doesNotMatch(out, /more/)
})

test('a small page is returned unchanged (#2)', () => {
  const issues = Array.from({ length: 5 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}` }))
  const out = text('gitea_issue_list', ok(issues))
  assert.equal(out.split('\n').length, 5)
  assert.doesNotMatch(out, /more/)
})

test('a >100-row response is capped visibly, never silently (#2)', () => {
  const rows = Array.from({ length: 128 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}` }))
  const out = text('gitea_issue_list', ok(rows))
  const lines = out.split('\n')
  assert.equal(lines.length, 101)
  assert.equal(lines[100], '… and 28 more — narrow the filter or page through.')
  assert.match(out, /#100 Issue 100/)
  assert.doesNotMatch(out, /#101 Issue 101/)
})

// #5 — empty and unrecognised results used to collapse to a bare OK.
test('empty lists get a per-tool message (#5)', () => {
  assert.equal(text('gitea_issue_list', ok([])), 'No issues.')
  assert.equal(text('gitea_issue_search', ok([])), 'No issues.')
  assert.equal(text('gitea_pr_list', ok([])), 'No pull requests.')
  assert.equal(text('gitea_labels', ok([])), 'No labels.')
  assert.equal(text('gitea_milestones', ok([])), 'No milestones.')
  assert.equal(text('gitea_branches', ok([])), 'No branches.')
  assert.equal(text('gitea_tags', ok([])), 'No tags.')
  assert.equal(text('gitea_releases', ok([])), 'No releases.')
  assert.equal(text('gitea_wiki', ok([])), 'No wiki pages.')
  assert.equal(text('gitea_notifications', ok([])), 'No notifications.')
  assert.equal(text('gitea_repo_commits', ok([])), 'No commits.')
  // Unknown list tools still say something specific.
  assert.equal(text('gitea_org', ok([])), 'No results.')
})

test('unknown objects render an identifying line plus a bounded snippet (#5)', () => {
  const out = text('gitea_wiki', ok({ title: 'Onboarding', content: 'x'.repeat(400) }))
  const [head, snippet] = out.split('\n')
  assert.equal(head, 'title: Onboarding')
  assert.ok(snippet.length <= 300, `snippet is ${snippet.length} chars`)
  assert.ok(snippet.endsWith('…'))
})

test('an empty successful response is Done., distinct from an empty list (#5)', () => {
  assert.equal(text('gitea_pr_merge', { ok: true }), 'Done.')
  assert.equal(text('gitea_labels', { ok: true }), 'Done.')
})

test('the formatter never emits a bare OK (#5)', () => {
  const fixtures = [
    ['gitea_issue_list', ok([])],
    ['gitea_wiki', ok({ title: 'Page', content: 'body' })],
    ['gitea_labels', ok({ id: 1, name: 'bug', color: 'e11d48' })],
    ['gitea_pr_stack_status', ok({})],
    ['gitea_release_assistant', ok({})],
    ['gitea_reactions', ok({})],
    ['gitea_unknown_tool', ok({ alpha: 1 })],
    ['gitea_unknown_tool', { ok: true }],
  ]
  for (const [name, value] of fixtures) {
    assert.notEqual(text(name, value).trim(), 'OK', `${name} returned a bare OK`)
  }
})

test('the formatter source has no bare OK fallback (#5 acceptance)', () => {
  // Matches the quoted literal only; the explanatory comment may mention OK.
  assert.doesNotMatch(formatterSource, /(['"])OK\1/)
})

// #7 — gitea_labels list hid the numeric ids that action:set consumes.
test('labels list shows ids, colours and descriptions (#7)', () => {
  const labels = [
    { id: 39, name: 'type/bug', color: 'e11d48', description: 'Defect: wrong, missing or misleading behaviour' },
    { id: 40, name: 'priority/now', color: 'b60205' },
  ]
  const out = text('gitea_labels', ok(labels))
  const lines = out.split('\n')
  assert.equal(lines[0], 'type/bug (id: 39, #e11d48) — Defect: wrong, missing or misleading behaviour')
  assert.equal(lines[1], 'priority/now (id: 40, #b60205)')
})

test('labels list does not silently drop rows past the cap (#7)', () => {
  const labels = Array.from({ length: 105 }, (_, i) => ({ id: i + 1, name: `label/${i + 1}`, color: 'abcdef' }))
  const out = text('gitea_labels', ok(labels))
  const lines = out.split('\n')
  assert.equal(lines.length, 101)
  assert.equal(lines[0], 'label/1 (id: 1, #abcdef)')
  assert.equal(lines[100], '… and 5 more — narrow the filter or page through.')
})

test('label create echoes the new id (#7)', () => {
  assert.equal(
    text('gitea_labels', ok({ id: 39, name: 'type/bug', color: 'e11d48' })),
    'Label "type/bug" created (id 39).',
  )
})

test('slimRecord keeps colour and description on label objects (#7)', () => {
  const slim = slimRecord({
    id: 39,
    name: 'type/bug',
    color: 'e11d48',
    description: 'Defect',
    url: 'https://git.pvlb.dev/labels/39',
  })
  assert.deepEqual(slim, { id: 39, name: 'type/bug', color: 'e11d48', description: 'Defect' })
})

test('failed calls still report the failure (#5 sanity)', () => {
  assert.equal(text('gitea_issue_list', { ok: false, error: 'boom' }), 'gitea_issue_list failed: boom')
})
