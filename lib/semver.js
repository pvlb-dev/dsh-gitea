/**
 * Dependency-free semver helpers shared by the plugin updater and the release
 * assistant. Supports the fork's `vX.Y.Z-dsh.N` scheme plus standard semver
 * prerelease/build metadata. Invalid input parses as `undefined`; comparisons
 * involving invalid input return 0.
 */

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

export function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value ?? '').trim())
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
    build: match[5] === undefined ? [] : match[5].split('.'),
  }
}

export function formatVersion(parsed) {
  if (parsed === undefined) return undefined
  const prerelease = parsed.prerelease.length > 0 ? `-${parsed.prerelease.join('.')}` : ''
  const build = parsed.build.length > 0 ? `+${parsed.build.join('.')}` : ''
  return `${parsed.core.join('.')}${prerelease}${build}`
}

export function cleanVersion(value) {
  const parsed = parseVersion(value)
  return parsed === undefined ? undefined : formatVersion(parsed)
}

// Semver prerelease precedence: numeric identifiers compare numerically, a
// numeric identifier is lower than an alphanumeric one, and a shorter list is
// lower when every preceding identifier is equal.
export function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1
  }
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1
    if (a === b) continue
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a)
      const bNumber = BigInt(b)
      if (aNumber !== bNumber) return aNumber > bNumber ? 1 : -1
      continue
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return a > b ? 1 : -1
  }
  return 0
}

export function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left
  const b = typeof right === 'string' ? parseVersion(right) : right
  if (a === undefined || b === undefined) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

export function isNewerVersion(currentValue, candidateValue) {
  const current = parseVersion(currentValue)
  const candidate = parseVersion(candidateValue)
  if (current === undefined || candidate === undefined) return false
  return compareVersions(current, candidate) < 0
}
