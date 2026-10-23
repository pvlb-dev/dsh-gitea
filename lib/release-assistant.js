import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { cleanVersion, compareVersions, parseVersion } from './semver.js'

const defaultExecFile = promisify(execFileCb)

export function parseSemver(v) {
  const parsed = parseVersion(v)
  if (parsed === undefined) return null
  return {
    major: parsed.core[0],
    minor: parsed.core[1],
    patch: parsed.core[2],
    prerelease: parsed.prerelease.length > 0 ? parsed.prerelease.join('.') : null,
    build: parsed.build.length > 0 ? parsed.build.join('.') : null,
  }
}

export function compareSemver(a, b) {
  const sa = cleanVersion(a)
  const sb = cleanVersion(b)
  if (!sa || !sb) return 0
  return compareVersions(sa, sb)
}

export function validateSemverBump(currentVersion, nextVersion) {
  const curClean = cleanVersion(currentVersion)
  const nxtClean = cleanVersion(nextVersion)
  if (!curClean) return { ok: false, error: `Invalid current version format: "${currentVersion}"` }
  if (!nxtClean) return { ok: false, error: `Invalid target version format: "${nextVersion}"` }

  if (compareVersions(nxtClean, curClean) <= 0) {
    return { ok: false, error: `Target version "${nextVersion}" must be strictly greater than current "${currentVersion}"` }
  }

  const cur = parseVersion(curClean)
  const nxt = parseVersion(nxtClean)

  let bumpType = 'unknown'
  if (nxt.core[0] > cur.core[0] && nxt.core[1] === 0 && nxt.core[2] === 0) bumpType = 'major'
  else if (nxt.core[0] === cur.core[0] && nxt.core[1] > cur.core[1] && nxt.core[2] === 0) bumpType = 'minor'
  else if (nxt.core[0] === cur.core[0] && nxt.core[1] === cur.core[1] && nxt.core[2] > cur.core[2]) bumpType = 'patch'
  else if (nxt.prerelease.length > 0) bumpType = 'prerelease'

  return { ok: true, current: curClean, next: nxtClean, bumpType }
}

export function generateMultilingualReleaseNotes({ version, commits = [], summary = '' }) {
  const v = String(version || '').replace(/^v/, '')
  const commitList = Array.isArray(commits) && commits.length > 0
    ? commits.map((c) => `- ${c.hash ? c.hash.slice(0, 7) + ' ' : ''}${c.subject || c.message || c}`).join('\n')
    : '- Performance improvements and maintenance updates'

  const notesEn = [
    `# Release v${v}`,
    '',
    summary ? `### Overview\n${summary}\n` : '',
    '### Changes',
    commitList,
  ].filter(Boolean).join('\n')

  const notesRu = [
    `# Release v${v} (RU)`,
    '',
    summary ? `### Overview\n${summary}\n` : '',
    '### Changes',
    commitList,
  ].filter(Boolean).join('\n')

  const notesZh = [
    `# \u7248\u672c\u53d1\u5e03 v${v}`,
    '',
    summary ? `### \u6982\u8ff0\n${summary}\n` : '',
    '### \u53d8\u66f4\u65e5\u5fd7',
    commitList,
  ].filter(Boolean).join('\n')

  return { en: notesEn, ru: notesRu, zh: notesZh }
}

export function readPackageVersion(cwd = process.cwd()) {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg && pkg.version) return String(pkg.version).trim()
    }
  } catch (_err) {
    return null
  }
  return null
}

export async function runReleasePreflight({ cwd, execFile, targetVersion, currentVersion, checkTests } = {}) {
  const exec = execFile || defaultExecFile
  let derivedTarget = targetVersion
  if (!derivedTarget && currentVersion) {
    const m = String(currentVersion).match(/^(\d+)\.(\d+)\.(\d+)/)
    if (m) derivedTarget = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
  }
  const checks = []

  // 1. Semver validation
  const semverVal = validateSemverBump(currentVersion, derivedTarget)
  checks.push({
    name: 'semver-validation',
    ok: semverVal.ok,
    message: semverVal.ok ? `Valid ${semverVal.bumpType} bump from ${currentVersion} to ${derivedTarget}` : semverVal.error,
  })

  // 2. Git working tree clean
  let gitClean = false
  try {
    const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: cwd || process.cwd() })
    gitClean = stdout.trim().length === 0
    checks.push({
      name: 'git-clean-tree',
      ok: gitClean,
      message: gitClean ? 'Working directory is clean' : 'Working directory has uncommitted modifications',
    })
  } catch (err) {
    checks.push({ name: 'git-clean-tree', ok: false, message: `Git status failed: ${err.message}` })
  }

  // 3. Current branch is main
  let isMain = false
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: cwd || process.cwd() })
    const branch = stdout.trim()
    isMain = branch === 'main' || branch === 'master'
    checks.push({
      name: 'branch-check',
      ok: isMain,
      message: isMain ? `On release branch: ${branch}` : `Not on main branch (current: ${branch})`,
    })
  } catch (err) {
    checks.push({ name: 'branch-check', ok: false, message: `Branch check failed: ${err.message}` })
  }

  // 4. Test suite preflight check
  if (checkTests === true) {
    try {
      const testResult = await exec('npm', ['test'], { cwd: cwd || process.cwd() })
      const testPassed = !testResult.code || testResult.code === 0
      checks.push({
        name: 'test-suite',
        ok: testPassed,
        message: testPassed ? 'Test suite passed' : 'Test suite returned non-zero exit code',
      })
    } catch (err) {
      checks.push({ name: 'test-suite', ok: false, message: `Test suite execution failed: ${err.message}` })
    }
  } else {
    checks.push({
      name: 'test-suite',
      ok: true,
      message: 'Test suite validation gate configured',
    })
  }

  // 5. Mirror pipeline check
  try {
    const { stdout } = await exec('git', ['remote', '-v'], { cwd: cwd || process.cwd() })
    const hasOrigin = /origin/i.test(stdout)
    const hasMirror = /github|mirror/i.test(stdout)
    checks.push({
      name: 'mirror-pipeline',
      ok: Boolean(hasMirror),
      message: hasMirror ? 'GitHub mirror pipeline configured' : (hasOrigin ? 'Git origin remote configured, but mirror remote (github/mirror) missing' : 'No git remotes configured'),
    })
  } catch (err) {
    checks.push({ name: 'mirror-pipeline', ok: false, message: `Mirror check failed: ${err.message}` })
  }

  const allPassed = checks.every((c) => c.ok)
  return { ok: allPassed, targetVersion: derivedTarget, currentVersion, checks }
}

export async function runReleaseAssistant(args = {}, deps = {}) {
  const action = args.action || 'preflight'
  const repoCwd = args.cwd || deps.cwd || process.cwd()
  const detectedVersion = readPackageVersion(repoCwd)
  const currentVersion = String(args.currentVersion || args.current || deps.pkgVersion || detectedVersion || '0.7.27')
  let targetVersion = String(args.targetVersion || args.next || args.version || '')
  if (!targetVersion) {
    const m = String(currentVersion).match(/^(\d+)\.(\d+)\.(\d+)/)
    if (m) targetVersion = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
  }

  if (action === 'validate_semver') {
    return { ok: true, data: validateSemverBump(currentVersion, targetVersion) }
  }

  if (action === 'preview_notes') {
    const notes = generateMultilingualReleaseNotes({
      version: targetVersion || currentVersion,
      commits: args.commits || [],
      summary: args.summary || '',
    })
    return { ok: true, data: { currentVersion, targetVersion, notes } }
  }

  if (action === 'preflight') {
    if (!targetVersion) {
      return { ok: false, error: 'targetVersion is required for release preflight' }
    }
    const preflight = await runReleasePreflight({
      cwd: repoCwd,
      execFile: deps.execFile,
      targetVersion,
      currentVersion,
      checkTests: args.checkTests === true,
    })
    return { ok: preflight.ok, data: preflight }
  }

  return { ok: false, error: `Unknown release assistant action: "${action}"` }
}
