import assert from 'node:assert/strict'
import test from 'node:test'

import { auditBranchSecurity, getBranchProtectionRule } from '../lib/branch-protection.js'
import { findDuplicates } from '../lib/dup-detect.js'
import { formatToolResult } from '../lib/handlers/formatters.js'
import { handleRepoTool } from '../lib/handlers/repos.js'
import { runIncidentReport } from '../lib/incident-report.js'
import { runMemoryBrainSync } from '../lib/memory-brain-sync.js'
import { runTaskTrackerSync } from '../lib/task-tracker-sync.js'

const text = (name, value) => formatToolResult(name, value)[0].text
const ok = (data) => ({ ok: true, data })

// #19 — "unprotected" must not be read as a pulls failure.
test('project health keeps the PR count when only the security check failed (#19)', () => {
  const out = text('gitea_project_health', ok({
    openIssues: 0,
    openPRs: 0,
    errors: ['security: default branch "master" is unprotected'],
  }))
  assert.match(out, /Open PRs: 0/)
  assert.doesNotMatch(out, /unknown \(API error\)/)
  assert.doesNotMatch(out, /Open Issues: unknown/)
})

test('project health still marks a real pulls failure as unknown (#19)', () => {
  const out = text('gitea_project_health', ok({
    openIssues: 3,
    openPRs: 0,
    errors: ['pulls: HTTP 500'],
  }))
  assert.match(out, /Open PRs: unknown \(API error\)/)
  assert.match(out, /Open Issues: 3/)
})

// #20 — branch defaults come from the repository, not a hard-coded "main".
function branchClient({ defaultBranch = 'master', branches = ['master'], protection = null } = {}) {
  const calls = []
  return {
    calls,
    async getRepo() { return ok({ default_branch: defaultBranch }) },
    async listBranches() { return ok(branches.map((name) => ({ name }))) },
    async getBranchProtection(owner, repo, branch) {
      calls.push(branch)
      return protection ? ok(protection) : { ok: false, status: 404 }
    },
  }
}

test('security audit defaults to the repository default branch (#20)', async () => {
  const client = branchClient()
  const res = await auditBranchSecurity({ owner: 'o', repo: 'r' }, { client })
  assert.equal(res.ok, true)
  assert.equal(res.data.branch, 'master')
  assert.match(res.data.summary, /@master:/)
  assert.deepEqual(client.calls, ['master'])
})

test('branch protection get defaults to the repository default branch (#20)', async () => {
  const client = branchClient()
  const res = await getBranchProtectionRule({ owner: 'o', repo: 'r' }, { client })
  assert.equal(res.ok, true)
  assert.equal(res.data.branch, 'master')
  assert.match(res.data.summary, /"master" has no protection rule/)
})

test('an explicit missing branch is a clear error (#20 acceptance)', async () => {
  const res = await auditBranchSecurity({ owner: 'o', repo: 'r', branch: 'no-such-branch' }, { client: branchClient() })
  assert.equal(res.ok, false)
  assert.match(res.error, /branch not found: no-such-branch/)
})

test('an explicit existing branch is honoured (#20)', async () => {
  const client = branchClient({ branches: ['master', 'release'] })
  const res = await auditBranchSecurity({ owner: 'o', repo: 'r', branch: 'release' }, { client })
  assert.equal(res.ok, true)
  assert.equal(res.data.branch, 'release')
  assert.deepEqual(client.calls, ['release'])
})

// #21 — webhook create must send config.content_type.
function webhookHarness() {
  const calls = []
  const client = {
    async createWebhook(owner, repo, body) {
      calls.push({ owner, repo, body })
      return ok({ id: 12, type: body.type, config: body.config })
    },
  }
  const ctx = { client, owner: 'o', repo: 'r' }
  return { calls, ctx }
}

test('webhook create defaults config.content_type to json (#21)', async () => {
  const { calls, ctx } = webhookHarness()
  const res = await handleRepoTool('gitea_webhooks', { action: 'create', url: 'https://example.invalid/h', events: ['push'] }, {}, ctx)
  assert.equal(res.ok, true)
  assert.equal(calls[0].body.config.content_type, 'json')
  assert.equal(calls[0].body.config.url, 'https://example.invalid/h')
})

test('webhook create accepts an explicit content_type and rejects an invalid one (#21)', async () => {
  const { calls, ctx } = webhookHarness()
  const res = await handleRepoTool('gitea_webhooks', { action: 'create', url: 'https://example.invalid/h', content_type: 'multipart' }, {}, ctx)
  assert.equal(res.ok, true)
  assert.equal(calls[0].body.config.content_type, 'multipart')

  const bad = await handleRepoTool('gitea_webhooks', { action: 'create', url: 'https://example.invalid/h', content_type: 'xml' }, {}, ctx)
  assert.equal(bad.ok, false)
  assert.match(bad.error, /content_type must be/)
})

test('webhook create requires a url (#21)', async () => {
  const { ctx } = webhookHarness()
  const res = await handleRepoTool('gitea_webhooks', { action: 'create', events: ['push'] }, {}, ctx)
  assert.equal(res.ok, false)
  assert.match(res.error, /url is required/)
})

test('webhook results render the id instead of raw JSON (#21)', () => {
  assert.equal(text('gitea_webhooks', ok({ id: 1, type: 'gitea' })), 'Webhook #1 created (type gitea).')
  assert.match(text('gitea_webhooks', ok([{ id: 1, type: 'gitea', active: true }])), /^Webhooks \(1\):\n  #1 \[gitea\] active$/)
})

// #22 — every advertised memory action (and the default) must work.
test('memory brain sync format action works and does not persist (#22)', async () => {
  const res = await runMemoryBrainSync({ action: 'format', repo: 'dsh-gitea', tag: 'v0.8.0', version: '0.8.0' }, {})
  assert.equal(res.ok, true)
  assert.equal(res.data.category, 'release')
  assert.equal(res.data.persisted, false)
  assert.equal(res.data.synced, false)
})

test('memory brain sync defaults to format instead of erroring (#22)', async () => {
  const res = await runMemoryBrainSync({}, {})
  assert.equal(res.ok, true)
  assert.equal(res.data.category, 'release')
})

test('memory brain sync pr_fact still works (#22)', async () => {
  const res = await runMemoryBrainSync({ action: 'pr_fact', repo: 'dsh-gitea', pr_number: 18, title: 'fix' }, {})
  assert.equal(res.ok, true)
  assert.equal(res.data.category, 'feature')
})

// #29 — dry run must not claim creation.
test('incident dry run reports a preview, never Created (#29)', () => {
  const out = text('gitea_incident_report', ok({
    dryRun: true,
    title: '[INCIDENT] dsh-gitea: QA probe',
    labels: ['type/incident', 'priority/critical'],
    body: '### Incident Description',
  }))
  assert.match(out, /^Incident Ticket \(dry-run\): would create "\[INCIDENT\] dsh-gitea: QA probe" with labels \[type\/incident, priority\/critical\]/)
  assert.match(out, /pass dry_run:false to file it/)
  assert.doesNotMatch(out, /Created/)
})

test('incident real creation reports the issue number (#29)', () => {
  const out = text('gitea_incident_report', ok({
    title: '[INCIDENT] dsh-gitea: QA probe',
    issue: { number: 7, html_url: 'https://git.example/issues/7' },
  }))
  assert.match(out, /^Incident Ticket: Created #7 "\[INCIDENT\] dsh-gitea: QA probe" \(sanitized\)\./)
  assert.match(out, /https:\/\/git\.example\/issues\/7/)
})

test('incident creation uses the house labels and resolved ids (#29)', async () => {
  const created = []
  const client = {
    async listLabels() {
      return ok([
        { id: 39, name: 'type/bug' },
        { id: 46, name: 'priority/now' },
      ])
    },
    async createIssue(owner, repo, body) {
      created.push(body)
      return ok({ number: 8, html_url: 'https://git.example/issues/8' })
    },
  }
  const res = await runIncidentReport({ service: 'dsh-gitea', alert: 'probe', owner: 'o', repo: 'r' }, { client })
  assert.equal(res.ok, true)
  assert.deepEqual(created[0].labels, [39, 46])
  assert.match(text('gitea_incident_report', res), /^Incident Ticket: Created #8 /)
})

test('incident creation does not send label names when none resolve (#29)', async () => {
  const created = []
  const client = {
    async listLabels() { return ok([]) },
    async createIssue(owner, repo, body) { created.push(body); return ok({ number: 9 }) },
  }
  const res = await runIncidentReport({ service: 's', alert: 'a', owner: 'o', repo: 'r' }, { client })
  assert.equal(res.ok, true)
  assert.equal('labels' in created[0], false)
})

// #30 — an exact title is a duplicate even when the existing body is long.
test('duplicate detection keeps an exact-title match with a long body (#30)', async () => {
  const client = {
    async searchIssues() {
      return ok([{
        number: 5,
        title: 'fix(tools): empty and unrecognised results render as a bare OK',
        body: 'A very long body. '.repeat(200),
      }])
    },
  }
  const res = await findDuplicates({
    owner: 'dsh-plugins',
    repo: 'dsh-gitea',
    title: 'fix(tools): empty and unrecognised results render as a bare OK',
  }, { client })
  assert.equal(res.ok, true)
  assert.equal(res.data.candidates.length, 1)
  assert.equal(res.data.candidates[0].number, 5)
  assert.match(res.data.candidates[0].reason, /title 1\.00/)
})

test('duplicate detection still rejects an unrelated title (#30)', async () => {
  const client = {
    async searchIssues() {
      return ok([{ number: 5, title: 'fix(tools): empty results', body: 'A very long body. '.repeat(200) }])
    },
  }
  const res = await findDuplicates({ owner: 'o', repo: 'r', title: 'completely unrelated subject matter' }, { client })
  assert.equal(res.data.candidates.length, 0)
})

test('duplicate results render as a readable list (#30)', () => {
  const out = text('gitea_issue_duplicates', ok({
    candidates: [{ number: 5, title: 'bare OK', score: 1, reason: 'title 1.00, body 0.00' }],
    threshold: 0.3,
    total: 2,
  }))
  assert.match(out, /^Likely duplicates \(2 issue\(s\) searched, threshold 0\.3\):/)
  assert.match(out, /  - #5 "bare OK" \(score 1\.00; title 1\.00, body 0\.00\)/)
  assert.doesNotMatch(out, /Unrecognised response/)
})

// #35 — read-only task-tracker actions must not claim processing.
test('task tracker status_map prints the mapping (#35)', async () => {
  const res = await runTaskTrackerSync({ action: 'status_map' }, {})
  const out = text('gitea_task_tracker_sync', res)
  assert.match(out, /Status mapping:/)
  assert.match(out, /todo → status\/ready/)
  assert.doesNotMatch(out, /processed/)
})

test('task tracker convert_card prints the converted fields (#35)', async () => {
  const res = await runTaskTrackerSync({ action: 'convert_card', card: { id: 'gitea-2', title: 'QA', status: 'in_progress', number: 2 } }, {})
  const out = text('gitea_task_tracker_sync', res)
  assert.match(out, /Task Tracker Convert: #2 "QA" → state open, target label status\/in-progress/)
  assert.doesNotMatch(out, /processed/)
})

test('task tracker export_cards keeps an accurate count (#35)', async () => {
  const client = {
    async listIssues() { return ok([{ number: 1, title: 'one' }, { number: 2, title: 'two' }]) },
  }
  const res = await runTaskTrackerSync({ action: 'export_cards', owner: 'o', repo: 'r' }, { client })
  assert.match(text('gitea_task_tracker_sync', res), /^Task Tracker Sync: 2 card\(s\) exported\./)
})
