import assert from 'node:assert/strict'
import test from 'node:test'

import { validateSemverBump } from '../lib/release-assistant.js'
import { cleanVersion, compareVersions, isNewerVersion, parseVersion } from '../lib/semver.js'

test('parses the fork version scheme', () => {
  assert.deepEqual(parseVersion('v0.7.40-dsh.3'), {
    core: [0, 7, 40],
    prerelease: ['dsh', '3'],
    build: [],
  })
  assert.equal(parseVersion('not-a-version'), undefined)
})

test('cleans whitespace and the v prefix', () => {
  assert.equal(cleanVersion('  v0.7.40-dsh.3  '), '0.7.40-dsh.3')
  assert.equal(cleanVersion('0.7.40+build.1'), '0.7.40+build.1')
  assert.equal(cleanVersion('nope'), undefined)
})

test('orders fork prereleases numerically', () => {
  assert.equal(compareVersions('0.7.40-dsh.2', '0.7.40-dsh.10'), -1)
  assert.equal(compareVersions('0.7.40-dsh.10', '0.7.40-dsh.2'), 1)
  assert.equal(compareVersions('0.7.40-dsh.3', '0.7.40-dsh.3'), 0)
  assert.equal(isNewerVersion('0.7.40-dsh.3', '0.7.40-dsh.4'), true)
  assert.equal(isNewerVersion('0.7.40-dsh.4', '0.7.40-dsh.3'), false)
})

test('stable releases outrank their prereleases', () => {
  assert.equal(compareVersions('0.7.40', '0.7.40-dsh.9'), 1)
  assert.equal(compareVersions('0.7.41-dsh.1', '0.7.40-dsh.9'), 1)
})

test('release assistant bump validation still works', () => {
  assert.deepEqual(validateSemverBump('0.7.40-dsh.3', '0.7.40-dsh.4'), {
    ok: true,
    current: '0.7.40-dsh.3',
    next: '0.7.40-dsh.4',
    bumpType: 'prerelease',
  })
  assert.equal(validateSemverBump('0.7.40', '0.7.41').bumpType, 'patch')
  assert.equal(validateSemverBump('0.7.40', '0.8.0').bumpType, 'minor')
  assert.equal(validateSemverBump('0.7.40', '1.0.0').bumpType, 'major')
  assert.equal(validateSemverBump('0.7.40', '0.7.40').ok, false)
  assert.equal(validateSemverBump('nope', '0.7.41').ok, false)
})
