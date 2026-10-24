import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReleasePlan } from '../lib/release-generator.js'
import { getRegistryPackage } from '../lib/package-registry.js'
import { formatToolResult } from '../lib/handlers/formatters.js'

const ok = (data) => ({ ok: true, data })
const text = (name, value) => formatToolResult(name, value)[0].text

function planClient({ commits = [], compareOk = true } = {}) {
  const calls = { compare: [], list: 0 }
  return {
    calls,
    async getRepo() { return ok({ default_branch: 'master' }) },
    async compareCommits(owner, repo, range) {
      calls.compare.push(range)
      if (!compareOk) return { ok: false, status: 404, error: 'Not Found' }
      return ok({ commits })
    },
    async listCommits() {
      calls.list += 1
      return ok([])
    },
  }
}

// #28 — release plan must start at current_version's tag.
test('release plan derives v<current_version>...default-branch and bumps minor (#28)', async () => {
  const client = planClient({
    commits: [
      { sha: 'a', commit: { message: 'feat(api): add thing', author: { name: 'dsh' } } },
      { sha: 'b', commit: { message: 'fix: bug', author: { name: 'dsh' } } },
    ],
  })
  const plan = await buildReleasePlan({ owner: 'dsh-plugins', repo: 'dsh-gitea', current_version: '0.7.40-dsh.7' }, { client })
  assert.equal(plan.ok, true)
  assert.deepEqual(client.calls.compare, ['v0.7.40-dsh.7...master'])
  assert.equal(client.calls.list, 0)
  assert.equal(plan.data.fromTag, 'v0.7.40-dsh.7')
  assert.equal(plan.data.toTag, 'master')
  assert.equal(plan.data.bump, 'minor')
  assert.equal(plan.data.nextVersion, '0.8.0')
  assert.equal(plan.data.changesCount, 2)
  assert.doesNotMatch(plan.data.changelog, /rename the package/)
})

test('release plan fails clearly when the current_version tag is missing (#28)', async () => {
  const client = planClient({ compareOk: false })
  const plan = await buildReleasePlan({ owner: 'o', repo: 'r', current_version: '9.9.9' }, { client })
  assert.equal(plan.ok, false)
  assert.match(plan.error, /cannot resolve release range v9\.9\.9\.\.\.master/)
})

test('release plan honours an explicit from_tag/to_tag range (#28)', async () => {
  const client = planClient({ commits: [{ sha: 'a', commit: { message: 'docs: notes', author: { name: 'dsh' } } }] })
  const plan = await buildReleasePlan({ owner: 'o', repo: 'r', from_tag: 'v1.0.0', to_tag: 'v1.1.0' }, { client })
  assert.equal(plan.ok, true)
  assert.deepEqual(client.calls.compare, ['v1.0.0...v1.1.0'])
})

// #31 — release assistant actions must render their own payloads.
test('release assistant validate_semver prints the bump (#31)', () => {
  const out = text('gitea_release_assistant', ok({ ok: true, current: '0.7.40-dsh.7', next: '0.8.0', bumpType: 'minor' }))
  assert.equal(out, 'Release Assistant: valid minor bump from 0.7.40-dsh.7 to 0.8.0.')
  assert.doesNotMatch(out, /Preflight/)
})

test('release assistant validate_semver prints the validation error (#31)', () => {
  const out = text('gitea_release_assistant', ok({ ok: false, error: 'Target version "0.7.40-dsh.7" must be strictly greater' }))
  assert.match(out, /^Release Assistant: invalid version — Target version/)
})

test('release assistant preview_notes prints the per-language notes (#31)', () => {
  const out = text('gitea_release_assistant', ok({
    currentVersion: '0.7.40-dsh.7',
    targetVersion: '0.8.0',
    notes: { en: '# Release v0.8.0', ru: '# Release v0.8.0 (RU)', zh: '# 版本发布 v0.8.0' },
  }))
  assert.match(out, /^Release Assistant: Notes for v0\.8\.0/)
  assert.match(out, /--- English ---\n# Release v0\.8\.0/)
  assert.match(out, /--- Russian ---/)
  assert.match(out, /--- Chinese ---/)
})

test('release assistant preflight still reports the checks (#31)', () => {
  const out = text('gitea_release_assistant', ok({ checks: [{ ok: true }, { ok: true }] }))
  assert.equal(out, 'Release Assistant: Preflight 2/2 passed.')
})

// #36 — package_get must find packages that packages_list shows.
function packageClient(rows) {
  const calls = []
  return {
    calls,
    async listPackages(owner, query) {
      calls.push({ owner, query })
      return ok(rows)
    },
  }
}

const PKG_ROWS = [
  { id: 11, name: 'dsh-gitea', type: 'npm', version: '0.7.40-dsh.7', html_url: 'https://git.example/packages/11', created_at: '2026-10-24T00:00:00Z' },
  { id: 10, name: 'dsh-gitea', type: 'npm', version: '0.7.40-dsh.6', html_url: 'https://git.example/packages/10' },
  { id: 9, name: 'dsh-resend-mcp', type: 'npm', version: '0.1.2', html_url: 'https://git.example/packages/9' },
]

test('package_get finds a listed package and its versions (#36)', async () => {
  const client = packageClient(PKG_ROWS)
  const res = await getRegistryPackage({ owner: 'dsh-plugins', type: 'npm', name: 'dsh-gitea' }, { client })
  assert.equal(res.ok, true)
  assert.equal(res.data.count, 2)
  assert.deepEqual(res.data.versions.map((v) => v.version), ['0.7.40-dsh.7', '0.7.40-dsh.6'])
  assert.equal(client.calls[0].query.type, 'npm')
  assert.match(text('gitea_package_get', res), /^Package: dsh-gitea \[npm\] — 2 versions/)
})

test('package_get filters an explicit version (#36)', async () => {
  const res = await getRegistryPackage({ owner: 'dsh-plugins', type: 'npm', name: 'dsh-gitea', version: '0.7.40-dsh.6' }, { client: packageClient(PKG_ROWS) })
  assert.equal(res.ok, true)
  assert.equal(res.data.count, 1)
  assert.equal(res.data.version, '0.7.40-dsh.6')
})

test('package_get returns a clear not-found for a missing package or version (#36)', async () => {
  const missing = await getRegistryPackage({ owner: 'o', type: 'npm', name: 'nope' }, { client: packageClient(PKG_ROWS) })
  assert.equal(missing.ok, false)
  assert.match(missing.error, /package not found: npm\/nope/)
  const missingVersion = await getRegistryPackage({ owner: 'o', type: 'npm', name: 'dsh-gitea', version: '9.9.9' }, { client: packageClient(PKG_ROWS) })
  assert.equal(missingVersion.ok, false)
  assert.match(missingVersion.error, /package version not found: npm\/dsh-gitea@9\.9\.9/)
})
