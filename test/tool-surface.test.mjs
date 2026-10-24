import assert from 'node:assert/strict'
import test from 'node:test'

import { PRESETS } from '../lib/selection.js'
import { TOOL_DEFS } from '../lib/tool-defs.js'

// lib/index.js imports DSH peer packages (`@deepseek-ai/schemastery`, ...) at
// module load. A clean CI install has no profile, so those peers are absent and
// the boot-level assertions cannot run there — skip them (the resolver-level
// checks in test/selection.test.mjs still gate the preset table). The profile
// provides the peers locally, where this file does exercise `apply()`.
let apply = null
let skipReason = false
try {
  ({ apply } = await import('../lib/index.js'))
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err
  skipReason = `DSH peer packages are not installed here (${err.message.split('\n')[0]})`
}
if (skipReason) {
  test('boot-level tool surface checks need the DSH peer packages', { skip: skipReason }, () => {})
}
const bootTest = (name, fn) => test(name, { skip: skipReason }, fn)

// Minimal Cordis-shaped context. `apply()` only needs the services it injects
// plus a tools registry; the routes and scheduler are registered behind
// ctx.effect, so a recording stub is enough to observe the advertised surface.
function fakeContext() {
  const registered = []
  const ctx = {
    tools: {
      register(definition) {
        registered.push(definition.name)
        return () => {
          const index = registered.indexOf(definition.name)
          if (index >= 0) registered.splice(index, 1)
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
  return { ctx, registered }
}

const boot = (config = {}) => {
  const { ctx, registered } = fakeContext()
  apply(ctx, { baseUrl: 'https://example.test', tokenEnv: 'GITEA_TOKEN', ...config })
  return registered
}

const canonical = TOOL_DEFS.map((def) => def.name)

bootTest('default boot advertises the canonical surface and no aliases (#48)', () => {
  const names = boot()
  assert.equal(names.length, 96)
  assert.deepEqual(names, canonical, 'full preset keeps TOOL_DEFS order')
  assert.ok(!names.includes('gitea_issue_set_labels'), 'deprecated alias not advertised')
  assert.ok(!names.includes('gitea_repo_branches'))
  assert.equal(new Set(names).size, names.length, 'no duplicate registration')
})

bootTest('legacyAliases: true restores the 0.8.4 name set (#48)', () => {
  const names = boot({ legacyAliases: true })
  assert.equal(names.length, 133)
  assert.ok(names.includes('gitea_issue_set_labels'))
  assert.ok(names.includes('gitea_repo_branches'))
  assert.ok(names.includes('gitea_label_list'))
})

bootTest('presets narrow the registered surface (#49)', () => {
  const core = boot({ preset: 'core' })
  assert.equal(core.length, 15)
  assert.deepEqual([...core].sort(), [...PRESETS.core].sort())

  const issues = boot({ preset: 'issues' })
  assert.equal(issues.length, 22)
  assert.ok(issues.includes('gitea_issue_create'))
  assert.ok(!issues.includes('gitea_pr_create'))
})

bootTest('none registers nothing at all (#49)', () => {
  assert.deepEqual(boot({ preset: 'none' }), [])
})

bootTest('aliases follow the narrowed surface (#48 + #49)', () => {
  const names = boot({ preset: 'core', legacyAliases: true })
  assert.ok(names.length > 15)
  assert.ok(names.length < 133, 'only aliases of selected tools are advertised')
  // core has no gitea_milestones, so its aliases must not appear.
  assert.ok(!names.includes('gitea_milestone_list'))
  // gitea_issue_set_labels targets gitea_labels, which is in core.
  assert.ok(names.includes('gitea_issue_set_labels'))
})

bootTest('excludeTools subtracts and unmatched patterns are ignored (#49)', () => {
  const names = boot({ preset: 'core', excludeTools: ['gitea_wiki', 'gitea_nope_*'] })
  assert.equal(names.length, 14)
  assert.ok(!names.includes('gitea_wiki'))
})

bootTest('an unknown preset fails at mount with a clear message (#49)', () => {
  assert.throws(() => boot({ preset: 'nope' }), /unknown tool preset "nope"/)
})
