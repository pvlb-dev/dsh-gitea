import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { LEGACY_MAP } from '../lib/handlers.js'
import {
  PRESETS,
  PRESET_NAMES,
  aliasesForSelection,
  describeSelection,
  matchPattern,
  resolveSelection,
} from '../lib/selection.js'
import { TOOL_DEFS } from '../lib/tool-defs.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hostEntry = readFileSync(join(root, 'lib/index.js'), 'utf8')
const routes = readFileSync(join(root, 'lib/routes.js'), 'utf8')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

const available = TOOL_DEFS.map((def) => def.name)

// #49: a preset must be a real subset of the registered surface. This is the
// drift guard the issue asks for — renaming or dropping a tool breaks the suite
// instead of silently shrinking a preset.
test('every preset lists only canonical tools (#49)', () => {
  const known = new Set(available)
  for (const name of PRESET_NAMES) {
    if (name === 'custom') continue
    for (const tool of PRESETS[name]) {
      if (tool === '*') continue
      assert.ok(known.has(tool), `preset "${name}" names unknown tool ${tool}`)
    }
  }
})

test('domain presets are disjoint and cover all canonical tools', () => {
  const domains = ['issues', 'prs', 'repos', 'ops']
  const seen = new Map()
  for (const domain of domains) {
    for (const tool of PRESETS[domain]) {
      assert.ok(!seen.has(tool), `${tool} appears in both ${seen.get(tool)} and ${domain}`)
      seen.set(tool, domain)
    }
  }
  assert.deepEqual([...seen.keys()].sort(), [...available].sort())
  assert.equal(available.length, 96)
})

test('core is the measured hot path', () => {
  assert.equal(PRESETS.core.length, 15)
  for (const tool of PRESETS.core) assert.ok(available.includes(tool), `${tool} exists`)
  // The fifteen hot tools from the #49 measurement, minus the alias
  // gitea_issue_set_labels (covered by gitea_labels).
  for (const tool of ['gitea_issue_create', 'gitea_labels', 'gitea_issue_comment', 'gitea_ci']) {
    assert.ok(PRESETS.core.includes(tool))
  }
  assert.ok(!PRESETS.core.includes('gitea_package_delete'))
})

test('full resolves to every canonical tool in definition order', () => {
  const { selected } = resolveSelection({ preset: 'full', available })
  assert.deepEqual(selected, available)
})

test('none registers nothing and needs no patterns', () => {
  const { selected, missingPatterns } = resolveSelection({ preset: 'none', available })
  assert.deepEqual(selected, [])
  assert.deepEqual(missingPatterns, [])
})

test('presets resolve to their declared membership', () => {
  for (const name of ['core', 'issues', 'prs', 'repos', 'ops']) {
    const { selected } = resolveSelection({ preset: name, available })
    // Membership is a set; registration order is the TOOL_DEFS order.
    assert.deepEqual([...selected].sort(), [...PRESETS[name]].sort(), `preset ${name}`)
  }
})

test('a non-empty tools list replaces the preset', () => {
  const { selected, preset } = resolveSelection({
    preset: 'none',
    tools: ['gitea_pr_get', 'gitea_ci'],
    available,
  })
  assert.equal(preset, 'none')
  assert.deepEqual(selected, ['gitea_pr_get', 'gitea_ci'])
})

test('excludeTools subtracts after the preset', () => {
  const { selected } = resolveSelection({
    preset: 'core',
    excludeTools: ['gitea_repo_*', 'gitea_wiki'],
    available,
  })
  assert.ok(!selected.includes('gitea_repo_contents'))
  assert.ok(!selected.includes('gitea_wiki'))
  assert.ok(selected.includes('gitea_issue_create'))
  assert.equal(selected.length, PRESETS.core.length - 2)
})

test('glob matching and unmatched patterns are reported, not fatal', () => {
  const { selected, missingPatterns, missingExcludePatterns } = resolveSelection({
    preset: 'none',
    tools: ['gitea_issue_*', 'gitea_nope_*'],
    excludeTools: ['gitea_issue_create', 'gitea_missing_*'],
    available,
  })
  assert.ok(selected.length > 1)
  assert.ok(selected.every((name) => name.startsWith('gitea_issue_')))
  assert.ok(!selected.includes('gitea_issue_create'))
  assert.deepEqual(missingPatterns, ['gitea_nope_*'])
  assert.deepEqual(missingExcludePatterns, ['gitea_missing_*'])
  assert.ok(matchPattern('gitea_pr_get', 'gitea_pr_*'))
  assert.ok(!matchPattern('gitea_pr_get', 'gitea_issue_*'))
})

test('unknown presets and an empty custom preset are rejected', () => {
  assert.throws(() => resolveSelection({ preset: 'nope', available }), /unknown Gitea tool preset "nope"/)
  assert.throws(() => resolveSelection({ preset: 'custom', available }), /requires a non-empty `tools` list/)
  assert.doesNotThrow(() => resolveSelection({ preset: 'custom', tools: ['gitea_whoami'], available }))
  assert.throws(() => matchPattern('x', ''), /non-empty strings/)
})

test('deprecated aliases follow the selected canonical set (#48)', () => {
  const all = aliasesForSelection(available, LEGACY_MAP)
  assert.equal(all.length, 37)
  // A narrowed surface only advertises aliases whose canonical tool survives.
  const core = aliasesForSelection(PRESETS.core, LEGACY_MAP)
  assert.ok(core.length > 0)
  for (const alias of core) {
    assert.ok(PRESETS.core.includes(LEGACY_MAP[alias][0]), `${alias} targets a selected tool`)
  }
  assert.ok(!core.includes('gitea_milestone_list'), 'milestones are outside core')
  assert.deepEqual(aliasesForSelection([], LEGACY_MAP), [])
  assert.deepEqual(aliasesForSelection(PRESETS.none, LEGACY_MAP), [])
})

test('describeSelection renders a one-line summary', () => {
  const line = describeSelection({ preset: 'core', selected: PRESETS.core, availableCount: 96 })
  assert.equal(line, 'core — 15 of 96 canonical tools')
  assert.match(describeSelection({ preset: 'full', selected: available, availableCount: 96, legacyAliases: true, aliasCount: 37 }), /37 deprecated aliases/)
})

// Wiring: the Host must actually use the resolver, and the Config fields must
// stay volatile so they reach the settings form (see AGENTS.md).
test('host entry wires the tool surface to the config schema', () => {
  assert.match(hostEntry, /import \{ resolveSelection, aliasesForSelection, PRESET_NAMES \} from '\.\/selection\.js'/)
  assert.match(hostEntry, /preset: z\.string\(\)\.default\('full'\)[\s\S]{0,200}\.volatile\(\)/)
  assert.match(hostEntry, /tools: z\.array\(z\.string\(\)\)\.default\(\[\]\)/)
  assert.match(hostEntry, /excludeTools: z\.array\(z\.string\(\)\)\.default\(\[\]\)/)
  assert.match(hostEntry, /legacyAliases: z\.boolean\(\)\.default\(false\)/)
  assert.match(hostEntry, /unknown tool preset/)
  // Registration is selection-driven, and a config change re-registers.
  assert.match(hostEntry, /function applyToolSelection\(\)/)
  assert.match(hostEntry, /ctx\.tools\.register\(definition\)/)
  assert.match(hostEntry, /refreshToolSurface\(\)/)
  assert.match(hostEntry, /toolSurface: \(\) => \(\{ \.\.\.toolState/)
  assert.match(routes, /toolSurface: typeof options\.toolSurface === 'function' \? options\.toolSurface\(\) : undefined/)
})

test('the settings dropdown offers exactly the presets the Host accepts (#51)', () => {
  const match = client.match(/const PRESET_OPTIONS = \[([^\]]+)\]/)
  assert.ok(match, 'lib/client.js declares PRESET_OPTIONS')
  const options = match[1]
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  assert.deepEqual([...options].sort(), [...PRESET_NAMES].sort(), 'UI list must match PRESET_NAMES')
  assert.ok(options.includes('dispatcher'), 'dispatcher is selectable in the settings form')
})

test('settings form exposes the surface in both locales', () => {
  for (const key of [
    'sectionTools', 'preset', 'presetHint', 'tools', 'toolsHint',
    'excludeTools', 'excludeToolsHint', 'legacyAliases', 'legacyAliasesHint',
    'surfaceActive', 'surfaceMissing',
  ]) {
    const occurrences = (client.match(new RegExp(`\\n      ${key}: `, 'g')) || []).length
    assert.equal(occurrences, 2, `${key} must exist in the en and zh dictionaries`)
  }
  assert.match(client, /selectField\(\s*'plugin-config-dsh-gitea-preset'/)
  assert.match(client, /setField\('tools', parsePatternList\(v\)\)/)
  assert.match(client, /setField\('excludeTools', parsePatternList\(v\)\)/)
  assert.match(client, /checkboxField\('plugin-config-dsh-gitea-legacy-aliases'/)
  assert.match(client, /function parsePatternList/)
})
