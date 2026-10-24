import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeMergeConflicts, resolveMergeConflicts } from '../lib/conflict-assistant.js'
import { checkMergeReadiness, autoMergeIfReady } from '../lib/merge-gate.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const text = (name, value) => formatToolResult(name, value)[0].text
const ok = (data) => ({ ok: true, data })

// #23 — a merged PR is still a PR for gitea_pr_get.
test('pr_get renders title, state, branches, URL and body for a merged PR (#23)', () => {
  const out = text('gitea_pr_get', ok({
    number: 18,
    title: 'fix(labels): default bootstrap to the house taxonomy',
    state: 'closed',
    merged: true,
    merged_at: '2026-10-24T01:00:00Z',
    user_login: 'dsh',
    head: { ref: 'fix/8-label-bootstrap-house' },
    base: { ref: 'master' },
    html_url: 'https://git.pvlb.dev/dsh-plugins/dsh-gitea/pulls/18',
    body: 'Closes #8.',
  }))
  assert.match(out, /^#18 "fix\(labels\): default bootstrap to the house taxonomy" \[merged\] by @dsh$/m)
  assert.match(out, /fix\/8-label-bootstrap-house → master/)
  assert.match(out, /URL: https:\/\/git\.pvlb\.dev\/dsh-plugins\/dsh-gitea\/pulls\/18/)
  assert.match(out, /Merged at: 2026-10-24T01:00:00Z/)
  assert.match(out, /Closes #8\./)
})

test('pr_get keeps the open-PR rendering (#23)', () => {
  const out = text('gitea_pr_get', ok({ number: 19, title: 'open', state: 'open', head: { ref: 'a' }, base: { ref: 'master' } }))
  assert.match(out, /^#19 "open" \[open\]$/m)
  assert.match(out, /a → master/)
})

// #38 — a merged PR is done, not blocked.
const mergedPrClient = () => ({
  async getPull() {
    return { ok: true, data: { number: 18, merged: true, merged_at: '2026-10-24T01:00:00Z', html_url: 'https://git.example/pulls/18' } }
  },
  async listPullReviews() { return { ok: true, data: [] } },
  async listPullFiles() { return { ok: true, data: [] } },
  async mergePull() { throw new Error('mergePull must not be called for a merged PR') },
})

test('merge readiness short-circuits for a merged PR (#38)', async () => {
  const res = await checkMergeReadiness({ owner: 'o', repo: 'r', number: 18 }, { client: mergedPrClient() })
  assert.equal(res.ok, true)
  assert.equal(res.data.merged, true)
  assert.equal(res.data.alreadyMerged, true)
  assert.equal(res.data.mergedAt, '2026-10-24T01:00:00Z')
  assert.deepEqual(res.data.checks, [])
  const out = text('gitea_merge_readiness', res)
  assert.match(out, /^PR #18 is already merged at 2026-10-24T01:00:00Z; no merge needed\./)
  assert.doesNotMatch(out, /NOT ready/)
})

test('auto_merge never merges an already-merged PR (#38)', async () => {
  const res = await autoMergeIfReady({ owner: 'o', repo: 'r', number: 18, confirm: true }, { client: mergedPrClient() })
  assert.equal(res.ok, true)
  assert.equal(res.data.merged, true)
  assert.equal(res.data.alreadyMerged, true)
  assert.match(text('gitea_auto_merge', res), /is already merged/)
})

// #24 — no confirm + clean is a dry run, not "Applied".
test('conflict resolve without confirm reports a dry-run no-op (#24)', async () => {
  const res = await resolveMergeConflicts({ head_branch: 'master', base_branch: 'master' }, {
    execFile: async (cmd, args) => {
      if (args.includes('rev-parse')) return { stdout: 'sha', stderr: '' }
      return { stdout: '', stderr: '' }
    },
  })
  assert.equal(res.ok, true)
  assert.equal(res.data.clean, true)
  assert.equal(res.data.applied, false)
  assert.equal(res.data.dryRun, true)
  assert.match(text('gitea_pr_conflict_resolve', res), /^Conflict Resolution \(dry-run\): no conflicts to resolve; nothing to apply\.$/)
})

// #37 — unresolved refs are errors, never zero-conflict success.
test('conflict analyze fails clearly on a nonexistent base branch (#37)', async () => {
  const res = await analyzeMergeConflicts({ head_branch: 'master', base_branch: 'no-such-base-branch' }, {
    execFile: async (cmd, args) => {
      if (args.includes('rev-parse')) {
        const ref = args[args.length - 1]
        if (ref.includes('no-such-base-branch')) {
          const err = new Error('unknown revision')
          err.code = 128
          err.stderr = 'fatal: ambiguous argument'
          throw err
        }
        return { stdout: 'sha', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    },
  })
  assert.equal(res.ok, false)
  assert.match(res.error, /base branch not found: no-such-base-branch/)
})

test('conflict analyze reports a genuinely clean pair as Clean (#37)', async () => {
  const res = await analyzeMergeConflicts({ head_branch: 'master', base_branch: 'master' }, {
    execFile: async (cmd, args) => {
      if (args.includes('rev-parse')) return { stdout: 'sha', stderr: '' }
      return { stdout: '', stderr: '' }
    },
  })
  assert.equal(res.ok, true)
  assert.equal(res.data.clean, true)
  assert.equal(res.data.conflictsCount, 0)
  assert.match(text('gitea_conflict_analyze', res), /^Conflict Analysis: Clean\./)
})
