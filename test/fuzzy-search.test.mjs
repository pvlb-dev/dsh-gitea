import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDispatcherDescription } from '../lib/dispatcher.js'
import {
  buildFuzzyDescription,
  candidateList,
  rankOperations,
  resolveQuery,
  summarizeDef,
} from '../lib/fuzzy-search.js'
import { TOOL_DEFS } from '../lib/tool-defs.js'
import { HOLDOUT, TASKS } from '../scripts/fuzzy-tasks.mjs'

// `apply` needs the DSH peer packages, which a clean CI install does not have
// (see AGENTS.md). The matcher tests below never need it; only the boot-level
// assertions do.
let apply = null
let skipReason = false
try {
  ({ apply } = await import('../lib/index.js'))
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err
  skipReason = `DSH peer packages are not installed here (${err.message.split('\n')[0]})`
}
const bootTest = (name, fn) => test(name, { skip: skipReason }, fn)

function fakeContext() {
  const definitions = []
  const ctx = {
    tools: {
      register(definition) {
        definitions.push(definition)
        return () => {
          const index = definitions.indexOf(definition)
          if (index >= 0) definitions.splice(index, 1)
        }
      },
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    on() { return () => {} },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    get() { return undefined },
    inject(_deps, fn) { fn(ctx) },
    provide() {},
    webServer: { register() { return () => {} } },
    credentials: { describe: async () => ({ configured: false }) },
    execFile: async () => ({ stdout: '', stderr: '' }),
  }
  return { ctx, definitions }
}

const boot = (config = {}) => {
  const { ctx, definitions } = fakeContext()
  apply(ctx, { baseUrl: 'https://example.test', tokenEnv: 'GITEA_TOKEN', ...config })
  return definitions
}

test('the fuzzy description drops the 96-line catalog (#77)', () => {
  const fuzzy = buildFuzzyDescription(TOOL_DEFS)
  const catalog = buildDispatcherDescription(TOOL_DEFS)
  assert.ok(Buffer.byteLength(fuzzy) < 1500, `fuzzy description ${Buffer.byteLength(fuzzy)} B`)
  assert.ok(Buffer.byteLength(fuzzy) < Buffer.byteLength(catalog) / 10)
  for (const def of TOOL_DEFS) assert.ok(!fuzzy.includes(def.name), `fuzzy description must not list ${def.name}`)
  assert.match(fuzzy, /own words/)
})

test('exact operation names still resolve first', () => {
  const resolution = resolveQuery(TOOL_DEFS, 'gitea_pr_get')
  assert.equal(resolution.kind, 'exact')
  assert.equal(resolution.def.name, 'gitea_pr_get')
})

test('free text resolves to one operation', () => {
  const cases = [
    ['close issue 42 in acme/web', 'gitea_issue_close'],
    ['list open pull requests', 'gitea_pr_list'],
    ['is PR 9 mergeable', 'gitea_pr_merge_status'],
    ['why did CI fail', 'gitea_ci_logs_analyze'],
    ['show README.md', 'gitea_repo_contents'],
  ]
  for (const [ask, expected] of cases) {
    const resolution = resolveQuery(TOOL_DEFS, ask)
    assert.equal(resolution.kind, 'confident', `${ask} should be confident`)
    assert.equal(resolution.def.name, expected, ask)
  }
})

test('ambiguous asks return candidates instead of a guess', () => {
  const resolution = resolveQuery(TOOL_DEFS, 'merge')
  assert.notEqual(resolution.kind, 'confident')
  const names = resolution.ranked.map(({ def }) => def.name)
  assert.ok(names.includes('gitea_pr_merge'), `candidates: ${names.join(', ')}`)
  const list = candidateList(resolution.ranked)
  assert.match(list, /gitea_pr_merge \(/)
})

test('unrelated asks do not resolve confidently', () => {
  for (const ask of ['book a flight to Rome', 'write a haiku about the sea', 'what is the weather']) {
    const resolution = resolveQuery(TOOL_DEFS, ask)
    assert.notEqual(resolution.kind, 'confident', ask)
  }
})

test('an empty or non-string operation resolves to nothing', () => {
  for (const value of ['', '   ', null, undefined, 42]) {
    assert.equal(resolveQuery(TOOL_DEFS, value).kind, 'none')
  }
})

test('ranking is deterministic and capped', () => {
  const first = rankOperations(TOOL_DEFS, 'list pull requests', { limit: 4 })
  const second = rankOperations(TOOL_DEFS, 'list pull requests', { limit: 4 })
  assert.deepEqual(first.map((row) => row.def.name), second.map((row) => row.def.name))
  assert.equal(first.length, 4)
  assert.equal(first[0].def.name, 'gitea_pr_list')
})

test('summaries stay short enough for a candidate list', () => {
  const def = TOOL_DEFS.find((entry) => entry.name === 'gitea_pr_merge')
  const summary = summarizeDef(def)
  assert.ok(summary.length <= 65)
  assert.ok(!summary.includes('\n'))
})

test('golden set: dev and holdout recall stay high (#77)', () => {
  const evaluate = (tasks) => {
    let top1 = 0
    let top3 = 0
    let negatives = 0
    let negativesOk = 0
    for (const task of tasks) {
      const resolution = resolveQuery(TOOL_DEFS, task.ask)
      const names = resolution.ranked.slice(0, 3).map(({ def }) => def.name)
      if (task.expect) {
        if (names[0] === task.expect) top1 += 1
        if (names.includes(task.expect)) top3 += 1
      } else {
        negatives += 1
        if (resolution.kind !== 'confident') negativesOk += 1
      }
    }
    const expected = tasks.length - negatives
    return { top1: top1 / expected, top3: top3 / expected, negativesOk: negatives ? negativesOk / negatives : 1 }
  }
  const dev = evaluate(TASKS)
  const held = evaluate(HOLDOUT)
  assert.ok(dev.top1 >= 0.9, `dev recall@1 ${dev.top1}`)
  assert.ok(dev.top3 >= 0.95, `dev recall@3 ${dev.top3}`)
  assert.equal(dev.negativesOk, 1)
  assert.ok(held.top1 >= 0.9, `holdout recall@1 ${held.top1}`)
  assert.ok(held.top3 >= 0.95, `holdout recall@3 ${held.top3}`)
})

bootTest('fuzzyDispatcher swaps the catalog for the fuzzy description (#77)', () => {
  const normal = boot({ preset: 'dispatcher' }).find((def) => def.name === 'gitea')
  const fuzzy = boot({ preset: 'dispatcher', fuzzyDispatcher: true }).find((def) => def.name === 'gitea')
  assert.ok(normal, 'the dispatcher registers')
  assert.ok(fuzzy, 'the fuzzy dispatcher registers')
  assert.ok(Buffer.byteLength(normal.description) > 8000)
  assert.ok(Buffer.byteLength(fuzzy.description) < 1500)
  assert.ok(!fuzzy.description.includes('gitea_issue_list'))
})

bootTest('the fuzzy render resolves a free-text operation for the formatter (#77)', () => {
  const definition = boot({ preset: 'dispatcher', fuzzyDispatcher: true }).find((def) => def.name === 'gitea')
  assert.ok(definition)
  const out = definition.output.render(
    { operation: 'comment on PR 64', args: { number: 64, body: 'hi' } },
    { ok: true, data: { id: 7, user: { login: 'dsh' } } },
  )
  assert.equal(out[0].text, 'Comment posted on PR #64 (comment #7) by @dsh.')
})
