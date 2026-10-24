/**
 * mirror-public.mjs — hermetic tests.
 *
 * Every fixture is a throwaway git repository under `mkdtemp`, never this
 * checkout. Leak-shaped strings are assembled from fragments on purpose: this
 * file is itself mirrored, so it must not plant the very literals the scanner
 * rejects (nor be rewritten by the sanitizer).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,

  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { RULES, buildSnapshot, sanitizeText } from '../scripts/mirror-public.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const SCRIPT = join(REPO_ROOT, 'scripts', 'mirror-public.mjs')

// Leak-shaped fixtures, split so they are not contiguous in this source file.
const FAKE_HOME = '/home/' + 'alice' + '/work/project'
const FAKE_TOKEN = 'gh' + 'p_' + 'a1b2c3d4'.repeat(5)
const FAKE_SCOPE = '@goodandready' + '-private/dsh-gitea'
const FAKE_IP = ['10', '1', '2', '3'].join('.')
const FAKE_MOUNT = '/mnt/' + 'external/Project'

function runGit(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    }
  }
}

function tempBase(t, prefix) {
  const base = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  return base
}

/** Fresh `--out` path inside the test's own temp area. */
function freshOut(t) {
  return join(tempBase(t, 'dsh-mirror-dst-'), 'snapshot')
}

function makeRepo(t, files = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'dsh-mirror-src-'))
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  runGit(repo, ['init', '-q'])
  runGit(repo, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  for (const [path, content] of Object.entries(files)) {
    const destination = join(repo, ...path.split('/'))
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, content)
  }
  runGit(repo, ['add', '-A'])
  runGit(repo, [
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@localhost',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    'fixture',
  ])
  return repo
}

function listFiles(dir, base = dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listFiles(absolute, base))
    else found.push(relative(base, absolute).split(sep).join('/'))
  }
  return found.sort()
}

test('builds one commit on main, drops internal paths and adds no remote', (t) => {
  const repo = makeRepo(t, {
    'README.md': '# demo\n',
    'AGENTS.md': 'internal runbook\n',
    'TESTER-BRIEF.md': 'QA brief\n',
    '.planning/notes.md': 'internal plan\n',
    'lib/a.js': 'export const answer = 42\n',
  })
  const out = freshOut(t)
  const report = buildSnapshot({ repo, out })

  assert.equal(report.ok, true)
  assert.equal(report.kept, 3)
  assert.deepEqual(
    report.excluded.map((item) => item.path).sort(),
    ['.planning/notes.md', 'TESTER-BRIEF.md'],
  )
  assert.equal(existsSync(join(out, 'README.md')), true)
  assert.equal(existsSync(join(out, 'lib/a.js')), true)
  assert.equal(existsSync(join(out, 'TESTER-BRIEF.md')), false)
  assert.equal(existsSync(join(out, '.planning')), false)

  assert.equal(runGit(out, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main')
  assert.equal(runGit(out, ['rev-list', '--count', 'HEAD']).trim(), '1')
  assert.equal(runGit(out, ['log', '-1', '--format=%an|%ae']).trim(), 'dsh-mirror|mirror@localhost')
  assert.equal(runGit(out, ['remote']).trim(), '')
  assert.deepEqual(report.findings, [])
  assert.deepEqual(report.leakScan, [])
})

test('sanitizes host paths, mount paths, private IPs and the private scope', (t) => {
  const repo = makeRepo(t, {
    'lib/internals.js': [
      `const home = '${FAKE_HOME}'`,
      `const mount = '${FAKE_MOUNT}'`,
      `const host = '${FAKE_IP}'`,
      `const scope = '${FAKE_SCOPE}'`,
      '',
    ].join('\n'),
  })
  const out = freshOut(t)
  const report = buildSnapshot({ repo, out })

  assert.equal(report.ok, true)
  const text = readFileSync(join(out, 'lib/internals.js'), 'utf8')
  assert.match(text, /const home = '\/home\/user\/work\/project'/)
  assert.match(text, /const mount = '\/path\/to\/Project'/)
  assert.match(text, /const host = '127\.0\.0\.1'/)
  assert.ok(!text.includes(FAKE_SCOPE))
  assert.match(text, /const scope = 'dsh-gitea'/)
  assert.deepEqual(report.sanitized, [
    { path: 'lib/internals.js', kinds: ['home path', 'mount path', 'private ip', 'private scope'] },
  ])
})

test('sanitizes non-ASCII home paths without mangling the rest of the line', () => {
  const input = ["cd /home/", "anaïs", "/dev/project && echo ok\n"].join("")
  const { text } = sanitizeText(input)
  assert.equal(text, 'cd /home/user/dev/project && echo ok\n')
})

test('does not rewrite ordinary words that equal the host username', (t) => {
  const savedUser = process.env.USER
  const savedUsername = process.env.USERNAME
  t.after(() => {
    if (savedUser === undefined) delete process.env.USER
    else process.env.USER = savedUser
    if (savedUsername === undefined) delete process.env.USERNAME
    else process.env.USERNAME = savedUsername
  })
  process.env.USER = 'fixture'

  // sanitizeForPublic() would turn `\bfixture\b` into `user` if the guard
  // regressed (on this host USER=dsh, which would corrupt `dsh-gitea`).
  assert.equal(sanitizeText('package: fixture-dsh-gitea\n').text, 'package: fixture-dsh-gitea\n')
})

test('fails and defangs a planted secret', (t) => {
  const repo = makeRepo(t, { 'lib/leak.js': `const token = '${FAKE_TOKEN}'\n` })
  const out = freshOut(t)
  const report = buildSnapshot({ repo, out })

  assert.equal(report.ok, false)
  assert.equal(report.findings.length, 1)
  assert.match(report.findings[0].rule, /GitHub token/)
  assert.equal(report.findings[0].line, 1)

  const text = readFileSync(join(out, 'lib/leak.js'), 'utf8')
  assert.ok(!text.includes(FAKE_TOKEN))
  assert.match(text, /const token = '\[REDACTED\]'/)

  // The CLI contract: exit 1 and say clearly that the snapshot is not safe.
  const cli = runCli(['--repo', repo, '--out', freshOut(t)])
  assert.equal(cli.status, 1)
  assert.match(cli.stdout, /NOT SAFE TO PUSH/)
  assert.match(cli.stdout, /GitHub token/)
})

test('prints the push commands and never creates a remote', (t) => {
  const repo = makeRepo(t, { 'README.md': '# demo\n' })
  const out = freshOut(t)
  const cli = runCli([
    '--repo',
    repo,
    '--out',
    out,
    '--remote',
    'git@github.com:example/dsh-gitea.git',
  ])

  assert.equal(cli.status, 0)
  assert.match(cli.stdout, /snapshot ready/)
  assert.match(cli.stdout, /git -C .+ remote add origin git@github\.com:example\/dsh-gitea\.git/)
  assert.match(cli.stdout, /git -C .+ push -u origin main/)
  assert.match(cli.stdout, /never use git push --force/)

  assert.equal(runGit(out, ['remote']).trim(), '')
  assert.ok(!readFileSync(join(out, '.git', 'config'), 'utf8').includes('[remote'))
})

test('refuses unsafe --out targets and missing arguments', (t) => {
  const repo = makeRepo(t, { 'README.md': '# demo\n' })

  const inside = join(repo, 'snapshot')
  const insideRun = runCli(['--repo', repo, '--out', inside])
  assert.equal(insideRun.status, 2)
  assert.match(insideRun.stderr, /outside the repository/)
  assert.equal(existsSync(inside), false)

  const busy = tempBase(t, 'dsh-mirror-busy-')
  writeFileSync(join(busy, 'keep.txt'), 'x\n')
  const busyRun = runCli(['--repo', repo, '--out', busy])
  assert.equal(busyRun.status, 2)
  assert.match(busyRun.stderr, /empty or absent/)

  const missingOut = runCli(['--repo', repo])
  assert.equal(missingOut.status, 2)
  assert.match(missingOut.stderr, /--out <dir> is required/)

  const badRemote = runCli(['--repo', repo, '--out', freshOut(t), '--remote', 'ftp://example/x'])
  assert.equal(badRemote.status, 2)
  assert.match(badRemote.stderr, /--remote must be/)
})

test('never modifies the source repository', (t) => {
  const repo = makeRepo(t, {
    'README.md': '# demo\n',
    'lib/x.js': 'export const x = 1\n',
    'TESTER-BRIEF.md': 'QA brief\n',
  })
  const before = {
    head: runGit(repo, ['rev-parse', 'HEAD']).trim(),
    status: runGit(repo, ['status', '--porcelain']).trim(),
    files: listFiles(repo),
  }

  buildSnapshot({ repo, out: freshOut(t) })

  assert.equal(runGit(repo, ['rev-parse', 'HEAD']).trim(), before.head)
  assert.equal(runGit(repo, ['status', '--porcelain']).trim(), before.status)
  assert.deepEqual(listFiles(repo), before.files)
})

test('drops binary files that embed a home path', (t) => {
  const repo = makeRepo(t, { 'README.md': '# demo\n' })
  const blob = Buffer.concat([Buffer.from([0, 0, 1]), Buffer.from(FAKE_HOME), Buffer.from([0])])
  const binaryPath = join(repo, 'assets', 'blob.bin')
  mkdirSync(dirname(binaryPath), { recursive: true })
  writeFileSync(binaryPath, blob)
  runGit(repo, ['add', '-A'])
  runGit(repo, [
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@localhost',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    'binary',
  ])

  const out = freshOut(t)
  const report = buildSnapshot({ repo, out })

  assert.equal(report.ok, true)
  const excluded = report.excluded.find((item) => item.path === 'assets/blob.bin')
  assert.ok(excluded, 'binary file should be excluded')
  assert.match(excluded.reason, /home path/)
  assert.equal(existsSync(join(out, 'assets', 'blob.bin')), false)
})

test('honors extra --exclude paths', (t) => {
  const repo = makeRepo(t, {
    'README.md': '# demo\n',
    'AGENTS.md': 'internal\n',
    '.forgejo/ci.yml': 'on: push\n',
    'lib/a.js': 'export const a = 1\n',
  })
  const report = buildSnapshot({
    repo,
    out: freshOut(t),
    exclude: ['AGENTS.md', '.forgejo/'],
  })

  assert.deepEqual(
    report.excluded.map((item) => item.path).sort(),
    ['.forgejo/ci.yml', 'AGENTS.md'],
  )
  assert.equal(existsSync(join(report.out, 'AGENTS.md')), false)
  assert.equal(existsSync(join(report.out, '.forgejo')), false)
})

test('leak rules stay in parity with scripts/leak-scan.mjs', () => {
  const source = readFileSync(join(REPO_ROOT, 'scripts', 'leak-scan.mjs'), 'utf8')
  const declared = [...source.matchAll(/name: '([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(
    declared.slice().sort(),
    RULES.map((rule) => rule.name).sort(),
    'mirror-public RULES and leak-scan checks have drifted',
  )
  for (const rule of RULES) {
    assert.equal(typeof rule.pattern?.test, 'function', `${rule.name} needs a RegExp pattern`)
  }
})
