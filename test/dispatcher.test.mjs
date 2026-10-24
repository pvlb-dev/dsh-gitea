import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DISPATCHER_NAME,
  HELP_MAX_BYTES,
  HELP_NAME,
  buildCatalog,
  buildDispatcherDescription,
  buildOperationHelp,
  compactSchema,
  findOperation,
  validateOperationArgs,
} from '../lib/dispatcher.js'
import { TOOL_DEFS } from '../lib/tool-defs.js'

// `apply` needs the DSH peer packages, which a clean CI install does not have
// (see AGENTS.md, "Verification limitations"). The pure dispatcher checks below
// never need it; only the boot-level assertions do.
let apply = null
let skipReason = false
try {
  ({ apply } = await import('../lib/index.js'))
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err
  skipReason = `DSH peer packages are not installed here (${err.message.split('\n')[0]})`
}
const bootTest = (name, fn) => test(name, { skip: skipReason }, fn)

// Same minimal Cordis-shaped context as test/tool-surface.test.mjs, but it also
// keeps the definitions so the payload comparison can serialize them.
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

const wireBytes = (definitions) => definitions
  .reduce((sum, def) => sum + JSON.stringify({ name: def.name, description: def.description, parameters: def.parameters }).length, 0)

test('the catalog covers every canonical operation, one line each (#51)', () => {
  const catalog = buildCatalog(TOOL_DEFS)
  assert.equal(catalog.length, 96)
  const names = TOOL_DEFS.map((def) => def.name)
  for (let i = 0; i < names.length; i += 1) {
    assert.ok(catalog[i].startsWith(`${names[i]} — `), catalog[i])
  }
  // One line per operation: no embedded newlines.
  for (const line of catalog) assert.ok(!line.includes('\n'))
})

test('the dispatcher description carries the catalog', () => {
  const description = buildDispatcherDescription(TOOL_DEFS)
  for (const def of TOOL_DEFS) assert.ok(description.includes(def.name), `catalog lists ${def.name}`)
  assert.match(description, /gitea_help/)
})

test('help for every operation stays under the ~1.5 KB ceiling', () => {
  let worst = { name: '', bytes: 0 }
  for (const def of TOOL_DEFS) {
    const text = buildOperationHelp(def)
    const bytes = Buffer.byteLength(text, 'utf8')
    assert.ok(bytes <= HELP_MAX_BYTES, `${def.name} help is ${bytes} B`)
    assert.ok(text.startsWith(def.name))
    assert.match(text, /Parameters/)
    if (bytes > worst.bytes) worst = { name: def.name, bytes }
  }
  assert.ok(worst.bytes > 0)
})

test('compactSchema drops prose but keeps the call contract', () => {
  const schema = {
    type: 'object',
    description: 'top',
    properties: {
      owner: { type: 'string', description: 'who' },
      state: { type: 'string', enum: ['open', 'closed'], description: 'state' },
    },
    required: ['owner'],
  }
  const compact = compactSchema(schema)
  assert.equal(compact.description, undefined)
  assert.equal(compact.properties.owner.description, undefined)
  assert.deepEqual(compact.properties.state.enum, ['open', 'closed'])
  assert.deepEqual(compact.required, ['owner'])
})

test('argument validation catches the dispatcher failure modes', () => {
  const list = findOperation(TOOL_DEFS, 'gitea_issue_list')
  assert.ok(list)
  // owner/repo fall back to defaults, so an empty call is valid here.
  assert.deepEqual(validateOperationArgs(list, {}).ok, true)
  const get = findOperation(TOOL_DEFS, 'gitea_issue_get')
  const missing = validateOperationArgs(get, {})
  assert.equal(missing.ok, false)
  assert.match(missing.errors.join(' '), /missing required argument "number"/)
  assert.equal(validateOperationArgs(get, { number: 51 }).ok, true)
  assert.equal(findOperation(TOOL_DEFS, 'gitea_nope'), undefined)
})

test('validation rejects unknown arguments and wrong types', () => {
  // DSH tool parameters are a property map with `required: true` per entry.
  const def = {
    name: 'gitea_probe',
    parameters: {
      number: { type: 'number', required: true },
      mode: { type: 'string', enum: ['a', 'b'] },
    },
  }
  assert.equal(validateOperationArgs(def, { number: 1, mode: 'a' }).ok, true)
  const unknown = validateOperationArgs(def, { number: 1, nope: true })
  assert.match(unknown.errors.join(' '), /unknown argument "nope"/)
  const wrong = validateOperationArgs(def, { number: 'one' })
  assert.match(wrong.errors.join(' '), /must be number/)
  const badEnum = validateOperationArgs(def, { number: 1, mode: 'c' })
  assert.match(badEnum.errors.join(' '), /must be one of: a, b/)
  assert.equal(validateOperationArgs(def, null).ok, false)
})

bootTest('preset: dispatcher registers exactly the two meta-tools (#51)', () => {
  const definitions = boot({ preset: 'dispatcher' })
  assert.deepEqual(definitions.map((def) => def.name), [DISPATCHER_NAME, HELP_NAME])
})

bootTest('the dispatcher surface is much smaller than full', () => {
  const full = wireBytes(boot())
  const dispatcher = wireBytes(boot({ preset: 'dispatcher' }))
  assert.ok(dispatcher < full / 5, `dispatcher ${dispatcher} B must be well under full ${full} B`)
  // Both are recorded on the issue; print them so a re-run is self-documenting.
  console.log(`#51 surface bytes: full ${full} B, dispatcher ${dispatcher} B (${(full / dispatcher).toFixed(1)}x smaller)`)
})
