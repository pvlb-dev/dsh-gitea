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
const text = (name, value, args) => formatToolResult(name, value, args)[0].text

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
  const out = text('gitea_unknown_tool', ok({ title: 'Onboarding', content: 'x'.repeat(400) }))
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

// #4 — wiki get used to collapse to the page title / a bare OK with no body.
test('wiki get renders title, slug, URL and last commit (#4)', () => {
  const out = text('gitea_wiki', ok({
    title: 'DSH Bootcamp',
    sub_url: 'DSH-Bootcamp',
    html_url: 'https://git.pvlb.dev/pvlb-infra/t14-deeps/wiki/DSH-Bootcamp',
    last_commit: { sha: 'abcdef1234567890', message: 'docs: bootcamp\n\nlong body' },
  }))
  assert.match(out, /^Wiki page: DSH Bootcamp$/m)
  assert.match(out, /^Slug: DSH-Bootcamp$/m)
  assert.match(out, /^URL: https:\/\/git\.pvlb\.dev\/pvlb-infra\/t14-deeps\/wiki\/DSH-Bootcamp$/m)
  assert.match(out, /^Last commit: abcdef12 docs: bootcamp$/m)
  assert.match(out, /not available from the REST API/)
  assert.match(out, /\.wiki\.git/)
})

test('wiki metadata survives slimRecord and never becomes a bare OK (#4)', () => {
  const slim = slimRecord({
    title: 'Home',
    sub_url: 'Home',
    html_url: 'https://git.pvlb.dev/pvlb-infra/vps-setup/wiki/Home',
    last_commit: { sha: 'abcdef1234567890', message: 'init' },
  })
  assert.equal(slim.sub_url, 'Home')
  assert.deepEqual(slim.last_commit, { sha: 'abcdef1234567890', message: 'init' })
  assert.notEqual(text('gitea_wiki', ok(slim)).trim(), 'OK')
})

test('failed calls still report the failure (#5 sanity)', () => {
  assert.equal(text('gitea_issue_list', { ok: false, error: 'boom' }), 'gitea_issue_list failed: boom')
})

// #66 — the dispatcher's schema fetcher fell through describeUnknownObject().
test('gitea_help renders the operation schema, not clipped JSON (#66)', () => {
  const help = 'gitea_pr_get\n\nGet a PR.\n\nParameters (JSON Schema):\n{"type":"object"}'
  const out = text('gitea_help', ok({ operation: 'gitea_pr_get', help }))
  assert.equal(out, help)
  assert.doesNotMatch(out, /Unrecognised response/)
  assert.equal(text('gitea_help', { ok: false, error: 'unknown operation "nope"' }), 'gitea_help failed: unknown operation "nope"')
  // The formatter branches on the literal tool name; keep it equal to HELP_NAME.
  assert.match(formatterSource, /name === 'gitea_help'/)
})

// #65 — both PR comment tools fell through describeUnknownObject(): the API
// payload is an issue comment (gitea_pr_comment) or a review carrying one
// comment (gitea_pr_line_comment), and the PR number only exists in the call
// arguments, which the render never forwarded.
test('gitea_pr_comment renders the posted comment (#65)', () => {
  const out = text('gitea_pr_comment', ok({ id: 1046, body: 'hi', user: { login: 'dsh' } }), { number: 64, body: 'hi' })
  assert.equal(out, 'Comment posted on PR #64 (comment #1046) by @dsh.')
  assert.doesNotMatch(out, /Unrecognised response/)
})

test('gitea_pr_line_comment renders the review and its line comment (#65)', () => {
  const value = ok({
    id: 77,
    state: 'COMMENT',
    body: '',
    user: { login: 'dsh' },
    comments: [{ id: 78, path: 'lib/x.js', new_position: 12, body: 'nit' }],
  })
  const out = text('gitea_pr_line_comment', value, { number: 64, path: 'lib/x.js', line: 12 })
  assert.equal(out, 'Line comment posted on PR #64 (review #77, comment #78) by @dsh.\nPath: lib/x.js:12')
})

test('PR comment renders stay truthful without ids, author or number (#65)', () => {
  assert.equal(text('gitea_pr_comment', ok({ body: 'x' }), {}), 'Comment posted on the pull request.')
  // The review's own path wins over the call argument when both are present.
  const value = ok({ id: 9, comments: [{ id: 9, path: 'a/b.js' }] })
  const out = text('gitea_pr_line_comment', value, { number: 3, path: 'ignored.js' })
  assert.equal(out, 'Line comment posted on PR #3 (comment #9).\nPath: a/b.js')
})

test('the dispatcher shape of the call arguments still yields the PR number (#65)', () => {
  // On the default surface the render receives `{ operation, args }`; the PR
  // number lives one level down in `args.args`.
  const out = text('gitea_pr_comment', ok({ id: 1056, user: { login: 'dsh' } }), {
    operation: 'gitea_pr_comment',
    args: { number: 64, body: 'hi' },
  })
  assert.equal(out, 'Comment posted on PR #64 (comment #1056) by @dsh.')
})
