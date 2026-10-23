import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { comparePrerelease, isNewerVersion, parseVersion } from './semver.js'

/**
 * Host-side one-click updater for DSH Web plugins.
 * Canonical implementation per dsh-plugin-authoring standard.
 *
 * This fork publishes `dsh-gitea` to the pvlb.dev Forgejo npm registry and
 * updates from there; the upstream npmjs package is never used.
 */

export const DEFAULT_REGISTRY = 'https://git.pvlb.dev/api/packages/dsh-plugins/npm/'

const UPDATE_HEADER = 'x-dsh-plugin-update'
const UPDATE_TIMEOUT_MS = 10 * 60_000
const VERSION_CACHE_MS = 5 * 60_000
let latestCache

function isLoopback(value) {
  if (!value || typeof value !== "string") return false
  const address = value.toLowerCase().replace(/^\[|\]$/g, "")
  return address === "localhost" || address === "localhost." || address === "::1"
    || address.startsWith("127.")
    || address.startsWith("::ffff:127.")
}

function header(request, name) {
  const value = request.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function isTrustedUpdateRequest(request) {
  if (header(request, UPDATE_HEADER) !== '1') return false
  if (!isLoopback(request.socket?.remoteAddress)) return false
  const site = header(request, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin') return false
  const origin = header(request, 'origin')
  const host = header(request, 'host')
  if (origin === undefined || host === undefined) return false
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && isLoopback(url.hostname) && url.host === host
  } catch {
    return false
  }
}

function validProfileName(value) {
  return typeof value === 'string' && value !== '' && value !== '.' && value !== '..'
    && !value.includes('/') && !value.includes('\\') && !/[\0-\x1f\x7f]/.test(value)
}

function profileNameFromArgv(argv) {
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--profile') return argv[index + 1]
    if (argv[index]?.startsWith('--profile=')) return argv[index].slice('--profile='.length)
  }
  return argv[2] === 'web' ? 'web' : undefined
}

function findDshCliEntry() {
  const value = process.argv[1]
  if (value === undefined || value === '') return undefined
  const entry = value.startsWith('file:') ? fileURLToPath(value) : resolve(process.cwd(), value)
  if (!existsSync(entry)) return undefined
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifestPath = resolve(directory, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const bin = typeof manifest.bin === 'string'
          ? manifest.bin
          : typeof manifest.bin === 'object' && manifest.bin !== null
            ? manifest.bin.dsh
            : undefined
        if (manifest.name === '@deepseek-ai/dsh' && typeof bin === 'string'
          && !isAbsolute(bin) && resolve(directory, bin) === resolve(entry)) return entry
      } catch {
        // Continue searching parent package directories.
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
  }
}

export function runtime() {
  const profileDir = resolve(process.env.DSH_PROFILE_DIR
    ?? resolve(homedir(), '.dsh', 'profiles', 'web'))
  const selected = profileNameFromArgv(process.argv)
  const profileName = validProfileName(selected)
    ? selected
    : validProfileName(basename(profileDir)) ? basename(profileDir) : 'web'
  const cliEntry = findDshCliEntry()
  return cliEntry === undefined ? { profileName, profileDir } : { profileName, profileDir, cliEntry }
}

// Kept as exports because existing callers/tests import them from here; the
// implementation lives in lib/semver.js so the package stays dependency-free.
export function parseSemver(value) {
  return parseVersion(value)
}

export { comparePrerelease, isNewerVersion }

// The npm registry protocol exposes a packument with `dist-tags`. Forgejo 17
// serves that document but not npmjs's `/latest` alias (it answers 404), so the
// updater reads the tag and falls back to the highest published version.
export function packumentLatest(document) {
  const tagged = document?.['dist-tags']?.latest
  if (typeof tagged === 'string' && tagged !== '') return tagged
  const versions = document?.versions && typeof document.versions === 'object'
    ? Object.keys(document.versions)
    : []
  let best
  for (const version of versions) {
    if (parseSemver(version) === undefined) continue
    if (best === undefined || isNewerVersion(best, version)) best = version
  }
  return best
}

export async function latestVersion(packageName, registry, token) {
  const endpoint = registry || DEFAULT_REGISTRY
  if (latestCache?.packageName === packageName && latestCache.registry === endpoint && Date.now() < latestCache.expiresAt) {
    return latestCache.version
  }
  try {
    const headers = {}
    if (token) headers.authorization = `token ${token}`
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return undefined
    const value = await response.json()
    const version = packumentLatest(value)
    if (version === undefined) return undefined
    latestCache = { packageName, registry: endpoint, version, expiresAt: Date.now() + VERSION_CACHE_MS }
    return version
  } catch {
    return undefined
  }
}

export function clearLatestCache() {
  latestCache = undefined
}

export async function currentVersion(manifestUrl) {
  const value = JSON.parse(await readFile(manifestUrl, 'utf8'))
  if (typeof value.version !== 'string' || value.version === '') throw new Error('Cannot read current plugin version.')
  return value.version
}

async function resolveRegistryToken(options) {
  if (typeof options.resolveRegistryToken === 'function') {
    try {
      return await options.resolveRegistryToken()
    } catch {
      return undefined
    }
  }
  return typeof options.registryToken === 'string' && options.registryToken !== ''
    ? options.registryToken
    : undefined
}

// npm mirrors an auth entry per registry *URI*, not the bare host:
// `//host/path/:_authToken=<token>`.
export function registryAuthKey(registry) {
  const url = new URL(registry)
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return `//${url.host}${path}:_authToken`
}

// The fork's package is unscoped, so the install uses our registry as the
// default for the package itself; the DSH peer scope stays on npmjs. (For a
// scoped package, only that scope is redirected instead.) The user's own
// ~/.npmrc is carried over so settings such as a minimum-release-age policy
// still apply. Returns a throwaway userconfig plus its cleanup.
export async function createRegistryUserconfig(registry, packageName, token, baseUserconfig = join(homedir(), '.npmrc')) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-gitea-update-'))
  const file = join(directory, '.npmrc')
  const scope = packageName.startsWith('@') ? packageName.split('/')[0] : ''
  const lines = []
  if (scope) {
    lines.push(`${scope}:registry=${registry}`)
  } else {
    lines.push(`registry=${registry}`)
    lines.push('@deepseek-ai:registry=https://registry.npmjs.org/')
  }
  if (token) lines.push(`${registryAuthKey(registry)}=${token}`)
  let base = ''
  try {
    base = await readFile(baseUserconfig, 'utf8')
  } catch {
    // No user config is fine; only the scoped registry entry is required.
  }
  const content = [base.trim(), ...lines].filter(Boolean).join('\n')
  await writeFile(file, `${content}\n`, { mode: 0o600 })
  return {
    file,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}

export async function getStatus(options, target) {
  const current = await currentVersion(options.manifestUrl)
  const token = await resolveRegistryToken(options)
  const latest = await latestVersion(options.packageName, options.registry ?? DEFAULT_REGISTRY, token)
  return {
    packageName: options.packageName,
    registry: options.registry ?? DEFAULT_REGISTRY,
    currentVersion: current,
    ...(latest === undefined ? {} : { latestVersion: latest }),
    latestCheckFailed: latest === undefined,
    updateAvailable: latest !== undefined && isNewerVersion(current, latest),
    profileName: target.profileName,
    canAutoUpdate: target.cliEntry !== undefined,
  }
}

export async function installExact(target, packageSpec, options) {
  if (target.cliEntry === undefined) throw new Error('Automatic update is unavailable in this runtime.')
  const registry = options.registry ?? DEFAULT_REGISTRY
  const userconfig = await createRegistryUserconfig(registry, options.packageName, options.registryToken)
  try {
    await new Promise((resolvePromise, reject) => {
      // Note: Do NOT add --config.minimumReleaseAge=0 per issue #214
      const args = [
        target.cliEntry, 'plugin', '--profile', target.profileName, 'add',
        packageSpec,
      ]
      const child = spawn(process.execPath, args, {
        cwd: target.profileDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NO_COLOR: '1',
          NPM_CONFIG_USERCONFIG: userconfig.file,
          npm_config_userconfig: userconfig.file,
        },
      })
      let detail = ''
      child.stdout?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4_000) })
      child.stderr?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4_000) })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('Update timed out; use the normal DSH update flow.'))
      }, UPDATE_TIMEOUT_MS)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolvePromise()
        else reject(new Error(detail.trim() || `Update exited with code ${String(code)}.`))
      })
    })
  } finally {
    await userconfig.cleanup()
  }
}

function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

export function registerPluginUpdater(ctx, options) {
  let installing = false
  const webServer = (ctx && typeof ctx.get === 'function' ? ctx.get('webServer') : (ctx && ctx.webServer)) || ctx?.webServer

  return webServer.register({
    kind: 'exact',
    path: options.endpoint,
    handler: async (request, response) => {
      try {
        // Fork safety switch: when disabled the route stays registered only so
        // callers can tell why it is off; every request is refused. The updater
        // installs this fork's published package from the Forgejo registry and
        // would replace a linked checkout, so an off-switch must be enforced
        // server-side, not only in the UI.
        if (typeof options.isEnabled === 'function' && !options.isEnabled()) {
          json(response, 403, {
            ok: false,
            code: 'disabled',
            error: 'Plugin updater is disabled (updates: false). Refusing to replace this install from the configured registry.',
          })
          return
        }
        const target = runtime()
        if (request.method === 'GET' || request.method === 'HEAD') {
          const payload = await getStatus(options, target)
          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(payload))
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, HEAD, POST' })
          response.end()
          return
        }
        if (!isTrustedUpdateRequest(request)) {
          json(response, 403, { error: 'Rejected non-local or cross-origin update request.' })
          return
        }
        if (installing) {
          json(response, 409, { error: 'This plugin is already updating.' })
          return
        }
        installing = true
        try {
          const registryToken = await resolveRegistryToken(options)
          const requestOptions = { ...options, registryToken }
          const before = await getStatus(requestOptions, target)
          if (before.latestVersion === undefined) {
            json(response, 503, { error: 'The latest version is temporarily unavailable.' })
            return
          }
          if (!before.updateAvailable) {
            json(response, 200, {
              ...before,
              updated: false,
            })
            return
          }
          await installExact(target, `${options.packageName}@${before.latestVersion}`, requestOptions)
          json(response, 200, {
            ...before,
            updated: true,
            updatedVersion: before.latestVersion,
            restartRequired: true,
          })
        } finally {
          installing = false
        }
      } catch (error) {
        if (ctx?.logger?.warn) {
          ctx.logger.warn(`plugin updater failed: ${String(error)}`)
        }
        json(response, 503, { error: 'Plugin update failed; see server logs.' })
      }
    },
  })
}
