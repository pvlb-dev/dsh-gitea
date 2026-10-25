import { execFile as execFileCb } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const defaultExecFile = promisify(execFileCb)
const DIFF_LIMIT = 24_000

export function parseWorktreePorcelain(text) {
  const trees = []
  let current = null
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) trees.push(current)
      current = { path: line.slice('worktree '.length).trim(), head: '', branch: '', bare: false }
      continue
    }
    if (!current) continue
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length).trim()
    else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim()
      current.branch = ref.replace(/^refs\/heads\//, '')
    } else if (line === 'bare') current.bare = true
    else if (line.startsWith('detached')) current.branch = 'detached'
  }
  if (current) trees.push(current)
  return trees
}

export function resolveRepoDir(settings = {}, args = {}, fallbackCwd = '') {
  const repoDir = String(args.path || args.repoDir || args.repoCwd || fallbackCwd || settings.repoDir || '').trim()
  if (!repoDir) {
    return { ok: false, error: 'Pass path or run inside a git workspace.' }
  }
  return { ok: true, repoDir }
}

async function readGit(execFile, cwd, args) {
  const exec = execFile || defaultExecFile
  const { stdout, stderr } = await exec('git', args, { cwd, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 })
  return { stdout: String(stdout || ''), stderr: String(stderr || '') }
}

function writeGitBinary(settings = {}) {
  return String(settings.gitWrapper || '').trim()
}

async function writeGit(execFile, cwd, args, settings = {}) {
  const binary = writeGitBinary(settings)
  if (!binary) {
    const err = new Error('git wrapper not configured: set gitWrapper in Settings for write operations')
    err.stderr = err.message
    throw err
  }
  const exec = execFile || defaultExecFile
  const { stdout, stderr } = await exec(binary, args, { cwd, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })
  clearSnapshotCache(cwd)
  return { stdout: String(stdout || ''), stderr: String(stderr || '') }
}

export async function isGitDir(dir, execFile) {
  const cwd = String(dir || '').trim()
  if (!cwd) return false
  try {
    await readGit(execFile, cwd, ['rev-parse', '--show-toplevel'])
    return true
  } catch {
    return false
  }
}

export async function runWorktreeAction(action, args = {}, deps = {}) {
  const execFile = deps.execFile
  const settings = deps.settings || {}
  if (action === 'use') {
    const worktreePath = String(args.worktreePath || args.path || '').trim()
    if (!worktreePath) return { ok: false, error: 'Pass worktreePath to make it current.' }
    if (!(await isGitDir(worktreePath, execFile))) {
      return { ok: false, error: `Path is not a valid git repository or worktree: ${worktreePath}` }
    }
    if (typeof deps.pinGitFromExec === 'function') {
      try { await deps.pinGitFromExec(deps.exec || { arguments: args }, { path: worktreePath, repoDir: worktreePath }) } catch { /* ignore */ }
    }
    return { ok: true, data: { path: worktreePath, repoDir: worktreePath } }
  }

  const resolved = resolveRepoDir(settings, args, deps.cwd || '')
  if (!resolved.ok) return resolved
  const cwd = resolved.repoDir

  try {
    if (action === 'list') {
      const { stdout } = await readGit(execFile, cwd, ['worktree', 'list', '--porcelain'])
      const trees = parseWorktreePorcelain(stdout).map((tree) => ({
        ...tree,
        current: tree.path === cwd,
      }))
      return { ok: true, data: trees }
    }
    if (action === 'add') {
      const worktreePath = String(args.worktreePath || '').trim()
      if (!worktreePath) return { ok: false, error: 'Pass worktreePath for the new worktree.' }
      const gitArgs = ['worktree', 'add']
      if (args.createBranch) gitArgs.push('-b', String(args.createBranch))
      gitArgs.push(worktreePath)
      if (args.branch) gitArgs.push(String(args.branch))
      await writeGit(execFile, cwd, gitArgs, settings)
      return { ok: true, data: { path: worktreePath, branch: args.branch || args.createBranch || '' } }
    }
    if (action === 'remove') {
      if (args.confirm !== true) {
        return { ok: false, error: 'Removing a worktree requires confirm: true (boolean).' }
      }
      const worktreePath = String(args.worktreePath || '').trim()
      if (!worktreePath) return { ok: false, error: 'Pass worktreePath to remove.' }
      await writeGit(execFile, cwd, ['worktree', 'remove', worktreePath], settings)
      return { ok: true, data: { path: worktreePath } }
    }
    return { ok: false, error: `Unknown worktree action: ${action}` }
  } catch (err) {
    return { ok: false, error: err?.stderr || err?.message || String(err) }
  }
}

export function displayRepoName({ worktree = '', remoteUrl = '' } = {}) {
  const remote = String(remoteUrl || '').trim().replace(/\.git$/i, '')
  const scp = remote.match(/:([^/]+\/)?([^/]+)$/)
  if (scp && scp[2]) return scp[2]
  const parts = remote.split('/').filter(Boolean)
  const last = parts[parts.length - 1] || ''
  if (last && last !== remote && !last.includes(':')) return last
  const wt = String(worktree || '').replace(/\\/g, '/')
  const marker = '/.worktrees/'
  const at = wt.indexOf(marker)
  if (at > 0) {
    const parent = wt.slice(0, at).split('/').filter(Boolean).pop()
    if (parent) return parent
  }
  return wt.split('/').filter(Boolean).pop() || ''
}

export const MAX_SNAPSHOT_ENTRIES = 50
const snapshotCache = new Map()
export const SNAPSHOT_CACHE_TTL_MS = 2500

export function getSnapshotCacheSize() {
  return snapshotCache.size
}

export function clearSnapshotCache(repoDir) {
  if (repoDir) {
    snapshotCache.delete(repoDir)
  } else {
    snapshotCache.clear()
  }
}

export async function buildGitSnapshot({ repoDir, execFile, maxAgeMs = 0 } = {}) {
  const dir = String(repoDir || '').trim()
  if (!dir) return { ok: false, error: 'No git workspace cwd.' }
  const now = Date.now()
  if (maxAgeMs > 0 && snapshotCache.has(dir)) {
    const entry = snapshotCache.get(dir)
    if (now - entry.at < maxAgeMs) {
      snapshotCache.delete(dir)
      snapshotCache.set(dir, entry)
      return JSON.parse(JSON.stringify(entry.snapshot))
    }
  }
  try {
    // Parallelize independent git inspection commands for maximum performance
    const [branchRes, headRes, toplevelRes, porcelainRes, graphRes, remoteUrlRes] = await Promise.allSettled([
      readGit(execFile, dir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() =>
        readGit(execFile, dir, ['symbolic-ref', '--short', 'HEAD'])
      ),
      readGit(execFile, dir, ['rev-parse', 'HEAD']),
      readGit(execFile, dir, ['rev-parse', '--show-toplevel']),
      readGit(execFile, dir, ['status', '--porcelain']),
      readGit(execFile, dir, ['log', '--oneline', '-8']),
      readGit(execFile, dir, ['remote', 'get-url', 'origin']),
    ])

    const branchVal = (branchRes.status === 'fulfilled' && branchRes.value?.stdout ? branchRes.value.stdout.trim() : '')
    const head = (headRes.status === 'fulfilled' && headRes.value?.stdout ? headRes.value.stdout.trim() : '')
    const toplevel = (toplevelRes.status === 'fulfilled' && toplevelRes.value?.stdout ? toplevelRes.value.stdout.trim() : '')

    // #304: If git commands failed to resolve toplevel, HEAD, and branch, directory is not a git repository
    if (!toplevel && !head && !branchVal) {
      return { ok: false, error: 'Not a git repository (or git command failed).' }
    }
    const branch = branchVal || 'main'
    const porcelain = (porcelainRes.status === 'fulfilled' && porcelainRes.value?.stdout ? porcelainRes.value.stdout : '')
    const graph = (graphRes.status === 'fulfilled' && graphRes.value?.stdout ? graphRes.value.stdout.trim() : '')
    const remoteUrl = (remoteUrlRes.status === 'fulfilled' && remoteUrlRes.value?.stdout ? remoteUrlRes.value.stdout.trim() : '')

    const statusLines = porcelain.trim().split('\n').filter(Boolean)
    const dirty = statusLines.length > 0
    const dirtyFiles = statusLines.length
    let ahead = 0
    let behind = 0
    let upstream = null

    // Parallelize ahead/behind checks and diff when dirty
    const secondaryTasks = []

    if (head) {
      secondaryTasks.push(
        readGit(execFile, dir, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
          .then((r) => {
            const [a, b] = (r.stdout || '').trim().split(/\s+/)
            ahead = parseInt(a, 10) || 0
            behind = parseInt(b, 10) || 0
            upstream = '@{upstream}'
          })
          .catch(async () => {
            if (branch && branch !== 'HEAD') {
              try {
                const r = await readGit(execFile, dir, ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`])
                const [a, b] = (r.stdout || '').trim().split(/\s+/)
                ahead = parseInt(a, 10) || 0
                behind = parseInt(b, 10) || 0
                upstream = `origin/${branch}`
              } catch { /* no remote branch */ }
            }
          })
      )
    }

    let diff = ''
    if (dirty) {
      secondaryTasks.push(
        readGit(execFile, dir, head ? ['diff', 'HEAD'] : ['diff'])
          .then((r) => {
            diff = r.stdout || ''
            if (diff.length > DIFF_LIMIT) diff = `${diff.slice(0, DIFF_LIMIT)}\n…truncated`
          })
          .catch(() => {
            diff = porcelain
          })
      )
    }

    if (secondaryTasks.length > 0) {
      await Promise.allSettled(secondaryTasks)
    }

    const result = {
      ok: true,
      repoDir: dir,
      worktree: toplevel || dir,
      repoName: displayRepoName({ worktree: toplevel || dir, remoteUrl }),
      // #63: keep the raw origin remote so the Host can build the repo link.
      remoteUrl,
      branch,
      head,
      dirty,
      dirtyFiles,
      ahead,
      behind,
      upstream,
      graph,
      diff,
    }
    if (maxAgeMs > 0) {
      if (snapshotCache.has(dir)) {
        snapshotCache.delete(dir)
      } else if (snapshotCache.size >= MAX_SNAPSHOT_ENTRIES) {
        const oldestKey = snapshotCache.keys().next().value
        if (oldestKey !== undefined) {
          snapshotCache.delete(oldestKey)
        }
      }
      snapshotCache.set(dir, { at: now, snapshot: result })
    }
    return result
  } catch (err) {
    return { ok: false, error: err?.stderr || err?.message || String(err) }
  }
}

export async function runGitCommit({ cwd, message = 'chore: quick commit via Gitea action card' } = {}, deps = {}) {
  const dir = String(cwd || deps.cwd || '').trim() || process.cwd()
  const settings = deps.settings || {}
  const execFile = deps.execFile
  try {
    await writeGit(execFile, dir, ['add', '-A'], settings)
    const { stdout } = await writeGit(execFile, dir, ['commit', '-m', String(message)], settings)
    clearSnapshotCache(dir)
    return { ok: true, data: { stdout: stdout.trim(), message } }
  } catch (err) {
    return { ok: false, error: err?.stderr || err?.message || String(err) }
  }
}

export async function runGitPush({ cwd, branch } = {}, deps = {}) {
  const dir = String(cwd || deps.cwd || '').trim() || process.cwd()
  const settings = deps.settings || {}
  const execFile = deps.execFile
  try {
    const gitArgs = ['push', 'origin']
    if (branch) gitArgs.push(String(branch))
    const { stdout, stderr } = await writeGit(execFile, dir, gitArgs, settings)
    clearSnapshotCache(dir)
    return { ok: true, data: { stdout: (stdout || stderr || '').trim() } }
  } catch (err) {
    return { ok: false, error: err?.stderr || err?.message || String(err) }
  }
}
