/**
 * release-notes.mjs — hermetic tests.
 *
 * The fixtures are inline changelogs, so these run without touching
 * `CHANGELOG.md` and cannot drift with a release bump.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRelease, extractRelease } from '../scripts/release-notes.mjs'

const CHANGELOG = `# Changelog

## [0.8.4] - 2026-10-24

### Publish to npmjs through staged publishing

- Staged with \`npm stage publish\`, approved with 2FA.
- The release stays gated by the tag check.

## [0.8.3] - 2026-10-24

### Public on npmjs

- The package is public now.

## [0.7.40-dsh.7] - 2026-10-23

- No subheading in this section.
`

test('extractRelease returns the section, its date and the first heading', () => {
  const release = extractRelease(CHANGELOG, '0.8.4')
  assert.equal(release.version, '0.8.4')
  assert.equal(release.date, '2026-10-24')
  assert.equal(release.title, 'Publish to npmjs through staged publishing')
  assert.match(release.body, /npm stage publish/)
  assert.ok(!release.body.includes('### Publish to npmjs'), 'title heading is not repeated')
  assert.ok(!release.body.includes('Public on npmjs'), 'section stops at the next release')
})

test('extractRelease handles a section without a subheading', () => {
  const release = extractRelease(CHANGELOG, '0.7.40-dsh.7')
  assert.equal(release.date, '2026-10-23')
  assert.equal(release.title, null)
  assert.match(release.body, /No subheading/)
})

test('extractRelease returns null for an unknown version', () => {
  assert.equal(extractRelease(CHANGELOG, '9.9.9'), null)
  assert.equal(extractRelease('', '0.8.4'), null)
  assert.equal(extractRelease(CHANGELOG, '0.8'), null)
})

test('buildRelease produces the release payload with install instructions', () => {
  const release = buildRelease(CHANGELOG, '0.8.4')
  assert.equal(release.tag_name, 'v0.8.4')
  assert.equal(release.name, 'v0.8.4 — Publish to npmjs through staged publishing')
  assert.match(release.body, /^- Staged with `npm stage publish`/m)
  assert.match(release.body, /### Install/)
  assert.match(release.body, /dsh plugin --profile web add dsh-gitea@0\.8\.4/)
  assert.match(release.body, /Home: https:\/\/git\.pvlb\.dev\/dsh-plugins\/dsh-gitea/)
  assert.equal(release.draft, false)
  assert.equal(release.prerelease, false)
})

test('buildRelease marks semver pre-releases and survives a missing section', () => {
  const preRelease = buildRelease(CHANGELOG, '0.7.40-dsh.7')
  assert.equal(preRelease.tag_name, 'v0.7.40-dsh.7')
  assert.equal(preRelease.name, 'v0.7.40-dsh.7')
  assert.equal(preRelease.prerelease, true)

  const unknown = buildRelease(CHANGELOG, '9.9.9')
  assert.equal(unknown.tag_name, 'v9.9.9')
  assert.equal(unknown.name, 'v9.9.9')
  assert.match(unknown.body, /See CHANGELOG\.md/)
  assert.match(unknown.body, /dsh plugin --profile web add dsh-gitea@9\.9\.9/)
})
