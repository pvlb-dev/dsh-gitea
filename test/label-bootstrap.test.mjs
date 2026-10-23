import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HOUSE_LABELS,
  UPSTREAM_LABELS,
  taxonomyLabels,
  buildLabelPlan,
  applyLabelPlan,
} from '../lib/label-bootstrap.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const text = (value) => formatToolResult('gitea_label_bootstrap', value)[0].text

function makeClient(existingNames = [], { failCreate = [] } = {}) {
  const calls = { create: [] }
  return {
    calls,
    async listLabels() {
      return { ok: true, data: existingNames.map((name, i) => ({ id: i + 1, name })) }
    },
    async createLabel(owner, repo, label) {
      calls.create.push(label.name)
      if (failCreate.includes(label.name)) return { ok: false, error: 'create failed' }
      return { ok: true, data: { id: 100 + calls.create.length, name: label.name } }
    },
  }
}

const args = (extra = {}) => ({ owner: 'ml-lab', repo: 'tardits', ...extra })

// #8 — the house set is the default; the upstream set is opt-in.
test('house taxonomy is exactly the pvlb.dev set (#8)', () => {
  const names = HOUSE_LABELS.map((label) => label.name).sort()
  assert.deepEqual(names, [
    'area/backup', 'area/dsh', 'area/forgejo', 'area/host', 'area/security',
    'needs-operator', 'priority/later', 'priority/next', 'priority/now',
    'type/bug', 'type/task',
  ].sort())
  assert.equal(names.some((name) => /^(status|scope|risk|signal)\//.test(name)), false)
  assert.equal(UPSTREAM_LABELS.length, 34)
  assert.equal(taxonomyLabels('house'), HOUSE_LABELS)
  assert.equal(taxonomyLabels('upstream'), UPSTREAM_LABELS)
  assert.equal(taxonomyLabels('nope'), null)
})

test('dry run lists every missing house label and reports a non-zero count (#8 acceptance)', async () => {
  const plan = await buildLabelPlan(args(), { client: makeClient(['type/bug']) })
  assert.equal(plan.ok, true)
  assert.equal(plan.data.taxonomy, 'house')
  assert.equal(plan.data.dryRun, true)
  assert.equal(plan.data.total, 11)
  assert.equal(plan.data.missingCount, 10)
  assert.deepEqual(plan.data.missing.map((label) => label.name).sort(), HOUSE_LABELS
    .filter((label) => label.name !== 'type/bug')
    .map((label) => label.name)
    .sort())
  const out = text(plan)
  assert.match(out, /Label Bootstrap \(dry-run, house\): 10 of 11 label\(s\) missing:/)
  assert.match(out, /^  - type\/task$/m)
  assert.doesNotMatch(out, /^  - type\/bug$/m)
})

test('dry run reports 0 only when the repository already has the set (#8 acceptance)', async () => {
  const plan = await buildLabelPlan(args(), { client: makeClient(HOUSE_LABELS.map((label) => label.name)) })
  assert.equal(plan.data.missingCount, 0)
  assert.match(text(plan), /: 0 label\(s\) missing — repository already has all 11 labels\./)
})

test('apply creates exactly the missing house labels and nothing else (#8 acceptance)', async () => {
  const client = makeClient(['type/bug', 'area/dsh'])
  const result = await applyLabelPlan(args({ confirm: true }), { client })
  assert.equal(result.ok, true)
  assert.equal(result.data.dryRun, false)
  assert.equal(result.data.created.length, 9)
  assert.equal(client.calls.create.length, 9)
  assert.equal(client.calls.create.includes('type/bug'), false)
  assert.equal(client.calls.create.includes('area/dsh'), false)
  assert.equal(client.calls.create.some((name) => /^(status|scope|risk|signal)\//.test(name)), false)
  assert.match(text(result), /Label Bootstrap \(house\): 9 label\(s\) created:/)
})

test('upstream taxonomy is reachable only by explicit opt-in (#8)', async () => {
  const plan = await buildLabelPlan(args({ taxonomy: 'upstream' }), { client: makeClient([]) })
  assert.equal(plan.data.total, 34)
  assert.equal(plan.data.missingCount, 34)
  assert.match(text(plan), /dry-run, upstream/)
})

test('an unknown taxonomy fails instead of silently picking one (#8)', async () => {
  const plan = await buildLabelPlan(args({ taxonomy: 'nope' }), { client: makeClient([]) })
  assert.equal(plan.ok, false)
  assert.match(plan.error, /unknown taxonomy: nope/)
  const applied = await applyLabelPlan(args({ taxonomy: 'nope' }), { client: makeClient([]) })
  assert.equal(applied.ok, false)
})

test('apply reports labels that fail to create (#8)', async () => {
  const client = makeClient(['type/bug'], { failCreate: ['priority/now'] })
  const result = await applyLabelPlan(args({}), { client })
  assert.equal(result.ok, true)
  assert.equal(result.data.created.length, 9)
  assert.deepEqual(result.data.failed, [{ name: 'priority/now', error: 'create failed' }])
  assert.match(text(result), /Failed \(1\):\n  - priority\/now: create failed/)
})
