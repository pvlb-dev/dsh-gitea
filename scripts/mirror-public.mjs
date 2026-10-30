#!/usr/bin/env node
/**
 * mirror-public.mjs — build a sanitized, push-ready snapshot of this checkout.
 *
 *   node scripts/mirror-public.mjs --out /tmp/dsh-gitea-mirror [--remote <url>]
 *
 * Why: this tree is a private deployment fork that carries host-specific
 * context (internal runbooks, a host path in the QA brief, private scope
 * literals). The GitHub mirror must be a *snapshot*, never this working tree,
 * and it must never be pushed by tooling: a human reviews the snapshot, then
 * runs the printed commands.
 *
 * Pipeline (all local, no network, no writes inside the source repo):
 *   1. read the committed tree — HEAD blobs via `git ls-tree` + `git cat-file`,
 *      so a dirty working tree cannot leak uncommitted edits into the mirror;
 *   2. drop internal paths (`.planning/`, `TESTER-BRIEF.md`, extra `--exclude`
 *      paths) and any file whose home paths cannot be rewritten safely;
 *   3. sanitize text: absolute home paths → `<home>/user`, then `sanitizeForPublic()`
 *      (which scrubs explicit usernames and secrets; env `USER` is ignored, #46)
 *      from `lib/mirror-public.js` (private scope, mount paths, RFC1918 IPs),
 *      and redact secret literals (tokens, private key blocks);
 *   4. re-run the `scripts/leak-scan.mjs` rule set over the snapshot;
 *   5. `git init` + a single commit on `main` with a neutral identity;
 *   6. print the `git remote add` / `git push` commands. Never execute them.
 *
 * Exit codes: 0 = clean snapshot, 1 = findings (not safe to push), 2 = usage or
 * safety error. A *redacted secret* is a finding too: a committed credential
 * must be investigated and rotated, not quietly mirrored away.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { sanitizeForPublic } from '../lib/mirror-public.js'

const SCRIPT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** Paths that must never reach a public mirror. */
export const DEFAULT_EXCLUDES = [
  { exact: 'TESTER-BRIEF.md', reason: 'internal QA brief (internal QA process)' },
  { prefix: '.planning/', reason: 'internal planning (gitignored here)' },
  { prefix: 'node_modules/', reason: 'dependencies' },
  { prefix: '.worktrees/', reason: 'git worktrees' },
]

/** Same text extensions as scripts/leak-scan.mjs, plus extensionless files. */
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.txt', '.css'])
const TOKEN_REDACTION = '[REDACTED]'
const NEUTRAL_IDENTITY = { name: 'dsh-mirror', email: 'mirror@localhost' }

// Assembled from fragments on purpose: this file is itself mirrored, and the
// leak rules below must not flag their own source (or be rewritten by
// sanitizeForPublic, which replaces this exact scope string).
const PRIVATE_SCOPE_LITERAL = '@goodandready' + '-private'
const SCOPE_PATTERN = new RegExp(PRIVATE_SCOPE_LITERAL)

/**
 * The leak rules, kept in parity with `scripts/leak-scan.mjs` (the test suite
 * asserts every rule name still exists there). Patterns are deliberately
 * non-global for `.test()` reuse.
 */
export const RULES = [
  {
    name: 'Cyrillic in shipped JavaScript',
    pattern: /[\u0400-\u04FF]/,
    only: (file) => extname(file) === '.js',
  },
  { name: 'developer home path', pattern: /\/home\/(?!user\b)[A-Za-z0-9._-]+\// },
  { name: 'private package scope', pattern: SCOPE_PATTERN },
  { name: 'GitHub token literal', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'GitLab token literal', pattern: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key literal', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

/** Secret literals are defanged in the snapshot and reported as findings. */
const SECRET_REDACTIONS = [
  {
    name: 'private key block',
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/g,
    replacement: '[REDACTED PRIVATE KEY]',
  },
  { name: 'GitHub token literal', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g, replacement: TOKEN_REDACTION },
  { name: 'GitLab token literal', pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g, replacement: TOKEN_REDACTION },
  { name: 'AWS access key literal', pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: TOKEN_REDACTION },
]

/**
 * Stricter home-path rewrite than sanitizeForPublic's ASCII-only rule:
 * it also catches non-ASCII usernames, so no partial/mangled path survives.
 * (SanitizeForPublic then has nothing left to do for home paths.)
 */
const HOME_PATH_REWRITE = /\/home\/(?!user(?:\/|\b))[^/\s'"`]+/g
const rulePattern = (name) => RULES.find((rule) => rule.name === name).pattern
const HOME_PATH_LEAK = rulePattern('developer home path')
const MOUNT_PATH = /\/mnt\/[A-Za-z0-9._-]+/
const PRIVATE_IPV4 = /(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}/

class UsageError extends Error {}

function git(cwd, args, options = {}) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function gitBuffer(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function isTextPath(filePath) {
  const extension = extname(filePath).toLowerCase()
  return extension === '' || TEXT_EXTENSIONS.has(extension)
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

/**
 * Sanitize one file's text. Returns the rewritten text plus the secret
 * findings that were defanged (each one is fatal for the snapshot).
 */
export function sanitizeText(raw) {
  const source = String(raw ?? '')
  const secrets = []

  // Find hits against the untouched source so reported line numbers are real.
  for (const rule of SECRET_REDACTIONS) {
    const matcher = new RegExp(rule.pattern.source, rule.pattern.flags)
    let match
    while ((match = matcher.exec(source)) !== null) {
      secrets.push({ rule: rule.name, line: lineOf(source, match.index) })
      if (match[0].length === 0) break
    }
  }

  let text = source
  for (const rule of SECRET_REDACTIONS) {
    text = text.replace(new RegExp(rule.pattern.source, rule.pattern.flags), rule.replacement)
  }

  text = text.replace(HOME_PATH_REWRITE, '/home/user')
  text = sanitizeForPublic(text, {})
  return { text, secrets }
}

function kindsChanged(raw, sanitized) {
  const kinds = []
  if (HOME_PATH_LEAK.test(raw) && !HOME_PATH_LEAK.test(sanitized)) kinds.push('home path')
  if (MOUNT_PATH.test(raw) && !MOUNT_PATH.test(sanitized)) kinds.push('mount path')
  if (PRIVATE_IPV4.test(raw) && !PRIVATE_IPV4.test(sanitized)) kinds.push('private ip')
  if (SCOPE_PATTERN.test(raw) && !SCOPE_PATTERN.test(sanitized)) kinds.push('private scope')
  return kinds
}

function normalizeExtraExcludes(values = []) {
  return values
    .flat(Infinity)
    .filter(Boolean)
    .map((value) => String(value).trim().replace(/^\.\//, ''))
    .filter(Boolean)
}

/** Return a human reason if `path` must be dropped, otherwise `null`. */
export function exclusionReason(path, extraExcludes = []) {
  for (const rule of DEFAULT_EXCLUDES) {
    if (rule.exact && path === rule.exact) return rule.reason
    if (rule.prefix && path.startsWith(rule.prefix)) return rule.reason
  }
  for (const excluded of normalizeExtraExcludes(extraExcludes)) {
    if (path === excluded || path.startsWith(excluded.endsWith('/') ? excluded : `${excluded}/`)) {
      return `--exclude ${excluded}`
    }
  }
  return null
}

function assertSafePaths(repo, out) {
  const fromRepo = relative(repo, out)
  if (fromRepo === '' || (!fromRepo.startsWith('..') && !isAbsolute(fromRepo))) {
    throw new UsageError(`--out must be outside the repository (${out} is inside ${repo})`)
  }
  const fromOut = relative(out, repo)
  if (fromOut === '' || (!fromOut.startsWith('..') && !isAbsolute(fromOut))) {
    throw new UsageError(`--out must not contain the repository (${out} contains ${repo})`)
  }
}

function prepareOut(out) {
  if (existsSync(out)) {
    if (!statSync(out).isDirectory()) throw new UsageError(`--out exists and is not a directory: ${out}`)
    if (readdirSync(out).length > 0) {
      throw new UsageError(
        `--out must be empty or absent: ${out} already has content.\n` +
          `Pick a fresh path, e.g. --out /tmp/dsh-gitea-mirror-$$`,
      )
    }
  } else {
    mkdirSync(out, { recursive: true })
  }
}

function listHeadEntries(repo) {
  const raw = git(repo, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'])
  return raw
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t')
      const [mode, type, sha] = entry.slice(0, tab).split(' ')
      return { mode, type, sha, path: entry.slice(tab + 1) }
    })
}

function headSummary(repo) {
  try {
    return git(repo, ['log', '-1', '--format=%h %s']).trim()
  } catch {
    throw new UsageError(`not a git repository (or no commits): ${repo}`)
  }
}

/**
 * Files copied verbatim (no text rewriting). Upstream already publishes
 * `lib/mirror-public.js`, whose PRIVATE_SCOPE constant is the sanitizer's own
 * declaration — rewriting it would ship a broken sanitizer and add a spurious
 * diff against upstream. Anything leak-shaped inside it still fails the scan.
 */
const KEEP_VERBATIM = new Set(['lib/mirror-public.js'])

/**
 * Reviewed exceptions: the only lines allowed to contain a rule's own marker.
 * Each entry names one file and one rule, and must match a line that *declares*
 * the marker rather than using it. Keep this list tiny; everything else fails.
 */
const REVIEWED_EXEMPTIONS = [
  {
    // Same documented exception as scripts/leak-scan.mjs: the sanitizer declares
    // the private scope precisely so it can strip it from mirrored content.
    path: 'lib/mirror-public.js',
    rule: 'private package scope',
    reason: 'sanitizer declares PRIVATE_SCOPE',
    allow: (line) => line.includes('PRIVATE_SCOPE'),
  },
  {
    path: 'scripts/leak-scan.mjs',
    rule: 'private package scope',
    reason: 'the scanner declares its own scope rule',
    allow: (line) => line.includes("name: 'private package scope'"),
  },
]

/**
 * Walk a directory and apply the leak rules to every text file.
 * Mirrors scripts/leak-scan.mjs; `options.stats.exempt` counts reviewed
 * exceptions so they are visible instead of silent.
 */
export function scanDirectory(dir, options = {}) {
  const rules = options.rules || RULES
  const stats = options.stats || { exempt: 0 }
  const findings = []
  const walk = (target) => {
    let entries
    try {
      entries = readdirSync(target, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const absolute = join(target, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (!entry.isFile() || !isTextPath(absolute)) continue
      const relativePath = relative(dir, absolute).split(sep).join('/')
      const lines = readFileSync(absolute, 'utf8').split('\n')
      lines.forEach((line, index) => {
        for (const rule of rules) {
          if (rule.only && !rule.only(absolute)) continue
          rule.pattern.lastIndex = 0
          const matched = rule.pattern.test(line)
          rule.pattern.lastIndex = 0
          if (!matched) continue
          const exemption = REVIEWED_EXEMPTIONS.find(
            (exception) => exception.path === relativePath && exception.rule === rule.name,
          )
          if (exemption && exemption.allow(line)) {
            stats.exempt += 1
            continue
          }
          findings.push({ path: relativePath, line: index + 1, rule: rule.name })
        }
      })
    }
  }
  walk(dir)
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
}

function scanSnapshot(dir) {
  const stats = { exempt: 0 }
  const findings = scanDirectory(dir, { stats })
  return { findings, exempt: stats.exempt }
}

function commitSnapshot(out) {
  git(out, ['init', '-q'])
  git(out, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  git(out, ['add', '-A'])
  git(out, [
    '-c',
    `user.name=${NEUTRAL_IDENTITY.name}`,
    '-c',
    `user.email=${NEUTRAL_IDENTITY.email}`,
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
    'commit',
    '-q',
    '--no-verify',
    '-m',
    'chore(fork): sanitized fork snapshot',
  ])
  return git(out, ['rev-parse', '--short', 'HEAD']).trim()
}

/** The only network commands this tool emits — printed, never executed. */
export function pushCommands(out, remote) {
  const target = remote || '<your-github-fork-url>'
  return [
    `git -C ${out} remote add origin ${target}`,
    `git -C ${out} push -u origin main`,
  ]
}

/**
 * The recommended, PR-able variant: graft the snapshot tree onto
 * upstream/main so the fork keeps a common ancestor with upstream.
 */
export function recommendedCommands(out, remote) {
  const target = remote || '<your-github-fork-url>'
  return [
    `git -C ${out} remote add upstream https://github.com/GooDAnDReaDY/dsh-gitea.git`,
    `git -C ${out} fetch upstream main`,
    `git -C ${out} checkout -B sanitized/main "$(git -C ${out} commit-tree 'HEAD^{tree}' -p upstream/main -m 'chore(fork): sanitized fork tree')"`,
    `git -C ${out} remote add fork ${target}`,
    `git -C ${out} push -u fork sanitized/main`,
  ]
}

/**
 * Build the sanitized snapshot. Pure local work: reads blobs from `repo`'s
 * HEAD, writes only inside `out`, never touches remotes or the working tree.
 */
export function buildSnapshot(options = {}) {
  const repo = resolve(options.repo || SCRIPT_ROOT)
  if (!options.out) throw new UsageError('--out <dir> is required')
  const out = resolve(options.out)
  const remote = options.remote ? String(options.remote) : ''
  const extraExcludes = normalizeExtraExcludes(options.exclude || [])

  assertSafePaths(repo, out)
  const sourceHead = headSummary(repo)
  const entries = listHeadEntries(repo)
  prepareOut(out)

  const report = {
    ok: false,
    repo,
    out,
    sourceHead,
    remote,
    kept: 0,
    excluded: [],
    sanitized: [],
    findings: [],
    leakScan: [],
    exempt: 0,
    commit: null,
    commands: [],
    recommended: [],
  }

  for (const entry of entries) {
    const reason = exclusionReason(entry.path, extraExcludes)
    if (reason) {
      report.excluded.push({ path: entry.path, reason })
      continue
    }
    if (entry.type !== 'blob') {
      report.excluded.push({ path: entry.path, reason: `gitlink (${entry.type})` })
      continue
    }

    const destination = join(out, entry.path)
    mkdirSync(dirname(destination), { recursive: true })
    const blob = gitBuffer(repo, ['cat-file', 'blob', entry.sha])

    if (entry.mode === '120000') {
      const target = blob.toString('utf8')
      if (HOME_PATH_LEAK.test(target) || SCOPE_PATTERN.test(target)) {
        report.excluded.push({ path: entry.path, reason: 'symlink points at internal context' })
        continue
      }
      symlinkSync(target, destination)
      report.kept += 1
      continue
    }

    if (!isTextPath(entry.path)) {
      const latin = blob.toString('latin1')
      const secret = SECRET_REDACTIONS.find((rule) => {
        rule.pattern.lastIndex = 0
        return rule.pattern.test(latin)
      })
      if (secret) {
        report.findings.push({ path: entry.path, rule: `${secret.name} in binary file`, action: 'excluded' })
        report.excluded.push({ path: entry.path, reason: `binary file contains a ${secret.name}` })
        continue
      }
      if (HOME_PATH_LEAK.test(latin)) {
        report.excluded.push({ path: entry.path, reason: 'binary file contains a home path' })
        continue
      }
      writeFileSync(destination, blob)
      if (entry.mode === '100755') chmodSync(destination, 0o755)
      report.kept += 1
      continue
    }

    const raw = blob.toString('utf8')
    if (KEEP_VERBATIM.has(entry.path)) {
      writeFileSync(destination, raw, 'utf8')
      if (entry.mode === '100755') chmodSync(destination, 0o755)
      report.kept += 1
      continue
    }
    const { text, secrets } = sanitizeText(raw)
    for (const hit of secrets) {
      report.findings.push({ path: entry.path, line: hit.line, rule: hit.rule, action: 'redacted' })
    }
    if (HOME_PATH_LEAK.test(text)) {
      report.excluded.push({ path: entry.path, reason: 'home path could not be rewritten safely' })
      continue
    }
    const kinds = kindsChanged(raw, text)
    if (kinds.length > 0) report.sanitized.push({ path: entry.path, kinds })
    writeFileSync(destination, text, 'utf8')
    if (entry.mode === '100755') chmodSync(destination, 0o755)
    report.kept += 1
  }

  if (report.kept === 0) throw new UsageError('nothing left to mirror after exclusions')

  const scan = scanSnapshot(out)
  report.leakScan = scan.findings
  report.exempt = scan.exempt
  report.commit = commitSnapshot(out)
  report.ok = report.findings.length === 0 && report.leakScan.length === 0
  report.commands = pushCommands(out, remote)
  report.recommended = recommendedCommands(out, remote)
  return report
}

function describeList(items, render, limit = 8) {
  if (items.length === 0) return '(none)'
  const shown = items.slice(0, limit).map(render).join(', ')
  return items.length > limit ? `${shown}, +${items.length - limit} more` : shown
}

export function formatReport(report) {
  const lines = []
  lines.push(`mirror-public: snapshot ${report.ok ? 'ready' : 'NOT SAFE TO PUSH'}`)
  lines.push(`  source repo : ${report.repo}`)
  lines.push(`  source HEAD : ${report.sourceHead}`)
  lines.push(`  output dir  : ${report.out}`)
  lines.push(`  kept        : ${report.kept} files`)
  lines.push(
    `  excluded    : ${describeList(report.excluded, (item) => `${item.path} (${item.reason})`)}`,
  )
  lines.push(
    `  sanitized   : ${describeList(report.sanitized, (item) => `${item.path} [${item.kinds.join(', ')}]`)}`,
  )
  lines.push(
    `  leak scan   : ${
      report.leakScan.length === 0
        ? `clean (${RULES.length} rules, ${report.exempt} reviewed exception${report.exempt === 1 ? '' : 's'})`
        : describeList(report.leakScan, (item) => `${item.path}:${item.line} ${item.rule}`)
    }`,
  )

  if (report.findings.length > 0) {
    lines.push(`  findings    : ${report.findings.length}`)
    for (const finding of report.findings) {
      const location = finding.line ? `:${finding.line}` : ''
      lines.push(`    ${finding.path}${location}  ${finding.rule} (${finding.action})`)
    }
    lines.push('')
    lines.push('A committed secret was found and defanged. Remove it from the source')
    lines.push('history and rotate the credential; this snapshot must not be pushed.')
    lines.push(`The snapshot was left at ${report.out} for inspection.`)
    return lines.join('\n')
  }

  lines.push(`  commit      : ${report.commit} on main, author ${NEUTRAL_IDENTITY.name} <${NEUTRAL_IDENTITY.email}>`)
  lines.push('')
  lines.push('next steps (printed only — this script never runs them):')
  lines.push(`  ${report.commands[0]}`)
  lines.push(`  ${report.commands[1]}`)
  lines.push('')
  lines.push('  recommended instead (PR-able branch on top of upstream/main; see')
  lines.push('  .planning/mirror-plan.md §4.3):')
  for (const command of report.recommended) lines.push(`  ${command}`)
  lines.push('')
  lines.push('  never use git push --force, and never push this working checkout.')
  return lines.join('\n')
}

export const USAGE = `usage: node scripts/mirror-public.mjs --out <dir> [options]

Build a sanitized snapshot of this repository's HEAD for a public GitHub mirror.
The snapshot gets one commit on branch "main" with a neutral identity; push
commands are printed, never executed.

options:
  --out <dir>        target directory (required; empty or absent, outside the repo)
  --remote <url>     GitHub fork URL printed in the push commands
  --repo <dir>       source repository (default: this checkout)
  --exclude <paths>  extra comma-separated paths/prefixes to drop (repeatable)
  --json             print a machine-readable report instead of prose
  -h, --help         show this help

exit codes: 0 clean, 1 findings (not safe to push), 2 usage/safety error.`

export function parseArgs(argv = []) {
  const options = { out: undefined, remote: '', repo: SCRIPT_ROOT, exclude: [], json: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length) throw new UsageError(`${arg} needs a value`)
      return argv[index]
    }
    switch (arg) {
      case '--out':
        options.out = next()
        break
      case '--remote':
        options.remote = next()
        break
      case '--repo':
        options.repo = next()
        break
      case '--exclude':
        options.exclude.push(...next().split(','))
        break
      case '--json':
        options.json = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        if (arg.startsWith('-')) throw new UsageError(`unknown option: ${arg}`)
        throw new UsageError(`unexpected argument: ${arg}`)
    }
  }
  if (options.help) return options
  if (!options.out) throw new UsageError('--out <dir> is required')
  if (options.remote && !/^(https?:\/\/|ssh:\/\/|git@)/.test(options.remote)) {
    throw new UsageError(`--remote must be an http(s)/ssh/git URL: ${options.remote}`)
  }
  return options
}

export function main(argv = process.argv.slice(2), streams = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      streams.stdout.write(`${USAGE}\n`)
      return 0
    }
    const report = buildSnapshot(options)
    if (options.json) streams.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    else streams.stdout.write(`${formatReport(report)}\n`)
    return report.ok ? 0 : 1
  } catch (error) {
    if (error instanceof UsageError) {
      streams.stderr.write(`mirror-public: ${error.message}\n\n${USAGE}\n`)
      return 2
    }
    streams.stderr.write(`mirror-public: ${error?.stack || error}\n`)
    return 2
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main()
}
