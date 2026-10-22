#!/usr/bin/env node
/**
 * Make a `link:` install of this checkout importable.
 *
 * The DSH Plugin Manager installs an absolute local path with pnpm's `link:`
 * protocol. pnpm does not resolve a linked package's own dependencies or peer
 * dependencies from the target's node_modules, so the Loader fails with
 * "failed to import" (typically `Cannot find package '@deepseek-ai/schemastery'`)
 * even though the package is listed and enabled. A published install from the
 * registry does not have this problem.
 *
 * This script symlinks the peer/dependency packages this plugin imports from the
 * running DSH installation into `./node_modules`, which makes the Host half of a
 * linked checkout resolvable. It only touches `node_modules` (gitignored) and
 * never the DSH installation.
 *
 * Usage:
 *   node scripts/dev-link-dsh.mjs [path-to-@deepseek-ai/dsh-package]
 *
 * Resolution order for the DSH package:
 *   1. the optional argument
 *   2. $DSH_PACKAGE_DIR
 *   3. the `dsh` executable on $PATH (its real path, two levels up)
 *   4. a `dsh` executable beside the running node binary
 *
 * Run it after cloning, then reload/restart the Profile (or toggle the plugin
 * off and on in the Plugins page).
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

function isDshPackage(dir) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return manifest?.name === '@deepseek-ai/dsh'
  } catch {
    return false
  }
}

function fromExecutable(file) {
  if (!file || !existsSync(file)) return undefined
  let real
  try { real = realpathSync(file) } catch { return undefined }
  // <dsh>/lib/bin.js -> <dsh>
  const candidate = dirname(dirname(real))
  return isDshPackage(candidate) ? candidate : undefined
}

function findOnPath() {
  const names = process.platform === 'win32' ? ['dsh.cmd', 'dsh.exe', 'dsh'] : ['dsh']
  for (const dir of String(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue
    for (const name of names) {
      const found = fromExecutable(join(dir, name))
      if (found) return found
    }
  }
  return undefined
}

function locateDsh() {
  const explicit = process.argv[2] || process.env.DSH_PACKAGE_DIR
  if (explicit) {
    const candidate = resolve(explicit)
    if (!isDshPackage(candidate)) {
      throw new Error(`Not a @deepseek-ai/dsh package directory: ${candidate}`)
    }
    return candidate
  }
  const fromPath = findOnPath()
  if (fromPath) return fromPath
  const fromNode = fromExecutable(join(dirname(process.execPath), 'dsh'))
  if (fromNode) return fromNode
  throw new Error(
    'Could not locate the @deepseek-ai/dsh installation.\n' +
    'Pass it explicitly: node scripts/dev-link-dsh.mjs /path/to/node_modules/@deepseek-ai/dsh',
  )
}

const dshRoot = locateDsh()
const dshNodeModules = join(dshRoot, 'node_modules')
const wanted = [...new Set([
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.dependencies || {}),
])]

const targetNodeModules = join(repoRoot, 'node_modules')
mkdirSync(targetNodeModules, { recursive: true })

let linked = 0
const skipped = []
const missing = []
for (const name of wanted) {
  const source = join(dshNodeModules, name)
  if (!existsSync(source)) {
    missing.push(name)
    continue
  }
  const destination = join(targetNodeModules, name)
  mkdirSync(dirname(destination), { recursive: true })
  let stat
  try { stat = lstatSync(destination) } catch { /* absent */ }
  if (stat && !stat.isSymbolicLink()) {
    skipped.push(`${name} (real directory kept)`)
    continue
  }
  if (stat) rmSync(destination, { force: true })
  symlinkSync(source, destination, process.platform === 'win32' ? 'junction' : 'dir')
  linked += 1
}

console.log(`[dsh-gitea] DSH package: ${dshRoot}`)
console.log(`[dsh-gitea] linked ${linked} package(s) into ${targetNodeModules}`)
if (skipped.length) console.log(`[dsh-gitea] kept existing: ${skipped.join(', ')}`)
if (missing.length) {
  console.warn(`[dsh-gitea] not found in the DSH installation: ${missing.join(', ')}`)
  console.warn('[dsh-gitea] install them with pnpm if the plugin cannot import: pnpm install')
  process.exitCode = 1
}
