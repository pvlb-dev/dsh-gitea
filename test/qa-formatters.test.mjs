import assert from 'node:assert/strict'
import test from 'node:test'

import { slimRecord } from '../lib/handlers/common.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const text = (name, value) => formatToolResult(name, value)[0].text
const ok = (data) => ({ ok: true, data })

// #25 — commits / PR files / compare were clipped raw JSON.
test('commit list renders sha, subject, author and date (#25)', () => {
  const out = text('gitea_repo_commits', ok([
    { sha: 'ca4117f1234567890', commit: { message: 'Merge pull request #1\n\nlong body', author: { name: 'pvlb-dev', date: '2026-08-06T10:00:00Z' } } },
    { sha: 'abcdef1234567890', commit: { message: 'fix: one line', author: { name: 'dsh', date: '2026-10-24T01:00:00Z' } } },
  ]))
  assert.match(out, /^ca4117f1 Merge pull request #1 \(pvlb-dev, 2026-08-06\)$/m)
  assert.match(out, /^abcdef12 fix: one line \(dsh, 2026-10-24\)$/m)
  assert.doesNotMatch(out, /"sha"/)
})

test('PR file list renders filename and +/- counts (#25)', () => {
  const out = text('gitea_pr_files', ok([
    { filename: 'lib/handlers/formatters.js', additions: 17, deletions: 3, status: 'changed' },
    { filename: 'test/qa.test.mjs', additions: 40, deletions: 0, status: 'added' },
  ]))
  assert.match(out, /^lib\/handlers\/formatters\.js \(\+17\/-3\) \[changed\]$/m)
  assert.match(out, /^test\/qa\.test\.mjs \(\+40\/-0\) \[added\]$/m)
})

test('compare renders a summary and a clear no-change line (#25)', () => {
  assert.equal(text('gitea_repo_compare', ok({ files: [], commits: [] })), 'Compare: No changes.')
  const out = text('gitea_repo_compare', ok({
    ahead_by: 2,
    behind_by: 1,
    commits: [{ sha: 'a' }, { sha: 'b' }],
    files: [{ filename: 'lib/x.js', additions: 4, deletions: 2 }],
  }))
  assert.match(out, /^Compare: 2 commit\(s\), 1 file\(s\) \(ahead 2, behind 1\)/m)
  assert.match(out, /lib\/x\.js \(\+4\/-2\)/)
})

// #26 — CI status/jobs/run were raw JSON or a bare job name.
test('CI status renders run id, title, state and branch (#26)', () => {
  const out = text('gitea_ci', ok({
    workflow_runs: [{ id: 74, title: 'docs: tester brief', status: 'completed', conclusion: 'success', head_branch: 'master', head_sha: 'abcdef1234567890', html_url: 'https://git.example/runs/74' }],
  }))
  assert.match(out, /^CI Runs \(1\):$/m)
  assert.match(out, /#74 docs: tester brief \[completed\/success\] master abcdef12/)
  assert.doesNotMatch(out, /Unrecognised response/)
})

test('CI jobs renders name and conclusion (#26)', () => {
  const out = text('gitea_ci', ok({ jobs: [{ id: 9, name: 'check', status: 'completed', conclusion: 'success' }] }))
  assert.match(out, /^CI Jobs \(1\):$/m)
  assert.match(out, /#9 check \[completed\/success\]/)
})

test('CI jobs accepts the Forgejo workflow_jobs envelope (#26)', () => {
  const out = text('gitea_ci', ok({ total_count: 1, workflow_jobs: [{ id: 9, name: 'check', status: 'completed', conclusion: 'success' }] }))
  assert.match(out, /^CI Jobs \(1\):$/m)
  assert.match(out, /#9 check \[completed\/success\]/)
})

test('CI jobs accepts Forgejo bare array of jobs (#26)', () => {
  const out = text('gitea_ci', ok([{ id: 78, name: 'check', status: 'success', html_url: 'https://git.example/jobs/78' }]))
  assert.match(out, /^CI Jobs \(1\):$/m)
  assert.match(out, /#78 check \[success\]/)
})

test('CI run renders detail and job summary (#26)', () => {
  const out = text('gitea_ci', ok({
    id: 74,
    title: 'docs',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'master',
    head_sha: 'abcdef1234567890',
    html_url: 'https://git.example/runs/74',
    jobs: [{ name: 'check', conclusion: 'success' }],
  }))
  assert.match(out, /^CI Run #74: docs \[completed\/success\]$/m)
  assert.match(out, /Branch: master @ abcdef12/)
  assert.match(out, /Jobs: check:success/)
})

test('empty CI status says No CI runs (#26)', () => {
  assert.equal(text('gitea_ci', ok({ workflow_runs: [] })), 'No CI runs.')
})

// #27 — code search must show path:line and the snippet.
test('code search renders path, line and snippet with a global cap (#27)', () => {
  const out = text('gitea_code_search', ok({
    items: [{ path: 'lib/handlers/formatters.js', line: 71, text: 'export function formatToolResult(name, value) {' }],
    total_count: 42,
    truncated: true,
  }))
  assert.match(out, /^lib\/handlers\/formatters\.js:71: export function formatToolResult/)
  assert.match(out, /showing 1 of 42 matches/)
})

test('legacy code search rows still render (#27)', () => {
  const out = text('gitea_code_search', ok([{ path: 'a.js', line: 3, text: 'const x = 1' }]))
  assert.equal(out, 'a.js:3: const x = 1')
})

// #32 — PR analysis tools must print the analysis, not a bare number.
test('PR summary renders files, areas, risks and approvals (#32)', () => {
  const out = text('gitea_pr_summary', ok({
    number: 18,
    title: 'fix(labels)',
    state: 'closed',
    author: 'dsh',
    files: [{ filename: 'a' }, { filename: 'b' }],
    areas: ['lib', 'test'],
    testFiles: ['test/x.test.mjs'],
    risks: [{ type: 'dependencies', file: 'package.json' }],
    totalAdditions: 10,
    totalDeletions: 2,
    approvedBy: ['dsh'],
    mergeable: true,
    missing: [],
  }))
  assert.match(out, /^PR #18 "fix\(labels\)" \[closed\] by @dsh$/m)
  assert.match(out, /Files: 2 \(\+10\/-2\), areas: lib, test/)
  assert.match(out, /Risks: dependencies:package\.json/)
  assert.match(out, /Approvals: @dsh/)
})

test('PR review renders the verdict, risks and questions (#32)', () => {
  const out = text('gitea_pr_review', ok({
    number: 18,
    verdict: 'approve',
    summary: '2 files, +10/-2, areas: lib',
    risks: [{ severity: 'low', type: 'tests', file: 'test/x' }],
    questions: ['Is this covered?'],
  }))
  assert.match(out, /^PR #18 Review: approve$/m)
  assert.match(out, /low tests:test\/x/)
  assert.match(out, /Questions:\n  - Is this covered\?/)
})

test('PR rebase dry run prints the plan (#32)', () => {
  const out = text('gitea_pr_rebase', ok({
    dryRun: true,
    number: 18,
    headBranch: 'fix/x',
    baseBranch: 'master',
    steps: ['1. fetch origin master', '2. rebase'],
    note: 'Dry-run.',
  }))
  assert.match(out, /^PR #18 Rebase Plan: fix\/x → master$/m)
  assert.match(out, /1\. fetch origin master/)
})

test('PR policy and template check render plain sentences (#32)', () => {
  assert.equal(text('gitea_pr_policy', ok({ present: false, note: 'Policy file not found (.gitea/pr-policy.yml)', violations: [] })), 'PR Policy: not configured (Policy file not found (.gitea/pr-policy.yml)).')
  assert.equal(text('gitea_pr_policy', ok({ present: true, violations: [{ message: 'too many files' }] })), 'PR Policy: 1 violation(s):\n  - too many files')
  assert.equal(text('gitea_pr_template_check', ok({ template: { ok: false, missing: ['Summary', 'User Impact'] }, riskChecklistNeeded: true })), 'PR Template: missing section(s): Summary, User Impact. Risk checklist required.')
})

// #33 — notifications/users/org members were raw JSON.
test('notifications render repo, subject, reason and unread marker (#33)', () => {
  const out = text('gitea_notifications', ok([
    { unread: true, repository: { full_name: 'dsh-plugins/dsh-gitea' }, subject: { title: 'New issue', type: 'Issue' }, reason: 'subscribed', updated_at: '2026-10-24T01:00:00Z' },
  ]))
  assert.match(out, /^• dsh-plugins\/dsh-gitea — New issue \[Issue, subscribed\]/)
})

test('user search renders login and URL (#33)', () => {
  const out = text('gitea_user_search', ok([{ login: 'dsh', html_url: 'https://git.pvlb.dev/dsh', full_name: '' }]))
  assert.equal(out, 'dsh — https://git.pvlb.dev/dsh')
})

test('org members render login lines (#33)', () => {
  const out = text('gitea_org', ok([{ login: 'dsh' }, { login: 'pvl' }]))
  assert.equal(out, 'dsh\npvl')
})

// #34 — timeline must carry the per-type payload.
test('timeline renders label, title, milestone and assignee events (#34)', () => {
  const out = text('gitea_issue_timeline', ok([
    { type: 'label', user_login: 'dsh', label: { name: 'type/task' }, created_at: 't1' },
    { type: 'change_title', user_login: 'dsh', old_title: 'Old', new_title: 'New' },
    { type: 'milestone', user_login: 'dsh', milestone: { title: 'Sprint' } },
    { type: 'assignees', user_login: 'dsh', assignee: { login: 'dsh' } },
    { type: 'comment', user_login: 'dsh', body: 'hello' },
    { type: 'reaction', user_login: 'dsh', reaction: 'rocket' },
  ]))
  assert.match(out, /^\[label\] by dsh \(t1\): added type\/task$/m)
  assert.match(out, /^\[change_title\] by dsh: Old → New$/m)
  assert.match(out, /^\[milestone\] by dsh: Sprint$/m)
  assert.match(out, /^\[assignees\] by dsh: added @dsh$/m)
  assert.match(out, /^\[comment\] by dsh: hello$/m)
  assert.match(out, /^\[reaction\] by dsh: rocket$/m)
})

test('slimRecord keeps the new formatter fields (#25–#34)', () => {
  const slim = slimRecord({
    number: 18,
    risks: [{ type: 'dependencies', file: 'package.json' }],
    areas: ['lib'],
    testFiles: ['test/x'],
    totalAdditions: 3,
    head_branch: 'master',
    subject: { title: 'x' },
    label: { name: 'type/bug' },
    old_title: 'Old',
    new_title: 'New',
    mergedAt: '2026-10-24T01:00:00Z',
  })
  for (const key of ['risks', 'areas', 'testFiles', 'totalAdditions', 'head_branch', 'subject', 'label', 'old_title', 'new_title']) {
    assert.ok(key in slim, `slimRecord dropped ${key}`)
  }
})
