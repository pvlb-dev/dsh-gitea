import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GiteaClient, normalizeBaseUrl } from './gitea-client.js'
import { createGiteaTaskService } from './task-service.js'
import { createGiteaEventsService } from './gitea-events.js'
import { registerPluginUpdater } from './plugin-updater.js'

import { runHandler, formatToolResult, toLossless, LEGACY_MAP } from './handlers.js'
import { stripSecretsFromConfig, credentialRefStatus, unwrapVolatile } from './secrets.js'
import { isGitDir } from './git-local.js'
import { registerHttpRoutes, writeJson, readBody } from './routes.js'
import { EventStore } from './events-store.js'
import { BgScheduler } from './bg-scheduler.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { rememberSessionGitDirs, resolveSessionGitDir, sessionIdsFromExec, sessionCwdFromExec, repoCwdFromTool, candidateGitDirsFromExec, candidateGitDirsFromSessionJsonl, selectChipRepoDir } from './session-git.js'
import { addJob, listJobs, runJob } from './scheduler.js'

export const name = 'dsh-gitea'
export const inject = ['tools', 'credentials', 'settings', 'webServer']

const NS = 'dsh-gitea'
const execFileAsync = promisify(execFile)

// #287: Reusable GiteaClient instance cache keyed by baseUrl#token#timeoutMs
const clientCache = new Map()

export function clearClientCache() {
  clientCache.clear()
}

export function getCachedClient({ baseUrl, token, timeoutMs }) {
  const key = `${baseUrl}#${token}#${timeoutMs}`
  let client = clientCache.get(key)
  if (!client) {
    if (clientCache.size >= 50) {
      const oldestKey = clientCache.keys().next().value
      if (oldestKey !== undefined) clientCache.delete(oldestKey)
    }
    client = new GiteaClient({ baseUrl, token, timeoutMs })
    clientCache.set(key, client)
  }
  return client
}

// Schemastery v3.18.4 natively supports .volatile()

export const Config = z.object({
  baseUrl: z.string().default('')
    .description('Gitea or Forgejo instance URL, e.g. https://gitea.example.com')
    .volatile(),
  tokenEnv: z.string().role('credential-ref').default('GITEA_TOKEN')
    .description('DSH credential name holding the API token.')
    .volatile(),
  defaultOwner: z.string().default('')
    .description('Default repository owner when the tool omits owner/repo.')
    .volatile(),
  defaultRepo: z.string().default('')
    .description('Default repository name when the tool omits owner/repo.')
    .volatile(),
  gitWrapper: z.string().default('')
    .description('Git wrapper binary (e.g. git-deepseek-harness) used for write operations. Empty disables worktree add/remove.')
    .volatile(),
  dodReminder: z.boolean().default(false)
    .description('DoD reminder: after a tool run that changed git files, remind if no issue/PR reference was made. Default off, never blocks.')
    .volatile(),
  bgSchedulerEnabled: z.boolean().default(false)
    .description('Background scheduler: periodically runs triage/health and sends digest. Default off.')
    .volatile(),
  bgSchedulerIntervalMin: z.number().default(60)
    .description('Background scheduler interval in minutes (default 60).')
    .volatile(),
  bgSchedulerOwner: z.string().default('')
    .description('Owner for background triage (default from defaultOwner).')
    .volatile(),
  bgSchedulerRepo: z.string().default('')
    .description('Repo for background triage (default from defaultRepo).')
    .volatile(),
  bgSchedulerWebhook: z.string().default('')
    .description('Optional webhook URL to deliver the digest to (external channel). Empty = only in-memory events.')
    .volatile(),
  notifyWebhook: z.string().default('')
    .description('Webhook URL for push notifications (new PR, failed CI). Empty disables push.')
    .volatile(),
  forceHttpsUrls: z.boolean().default(false)
    .description('When DSH is served over HTTPS but Gitea answers with http:// links (reverse proxy), rewrite html_url to https. Default off.')
    .volatile(),
  webhookSecretEnv: z.string().role('credential-ref').default('')
    .description('DSH credential name holding the secret for verifying X-Gitea-Signature on POST /dsh-gitea/webhook.')
    .volatile(),
  instances: z.array(z.object({
    name: z.string(),
    baseUrl: z.string(),
    tokenEnv: z.string().role('credential-ref'),
  })).default([])
    .description('Additional Gitea instances: name, baseUrl, credential name. Tools accept instance param; default is primary (baseUrl/tokenEnv).')
    .volatile(),
  timeoutMs: z.number().default(30000)
    .description('HTTP timeout in milliseconds.')
    .volatile(),
  updates: z.boolean().default(true)
    .description('Expose the one-click plugin updater (pvlb.dev Forgejo npm registry). Disable on a link: dev checkout if you do not want the published package to replace it.')
    .volatile(),
  preset: z.string().default('full')
    .description('Tool surface preset: core, issues, prs, repos, ops, full, none, custom. Applied at mount; a settings change re-registers the tools live.')
    .volatile(),
  tools: z.array(z.string()).default([])
    .description('Explicit tool allowlist (names or globs, e.g. gitea_pr_*). Non-empty replaces the preset.')
    .volatile(),
  excludeTools: z.array(z.string()).default([])
    .description('Tool patterns removed after the preset/allowlist has been applied.')
    .volatile(),
  legacyAliases: z.boolean().default(false)
    .description('Advertise the 37 deprecated alias tools (gitea_issue_set_labels, gitea_repo_branches, ...). Off by default: they duplicate their canonical schemas (~42 KB of tool payload). Aliases still resolve when called.')
    .volatile(),
})

const GITEA_RECORD = {
  type: 'object',
  additionalProperties: false,
  properties: {
    number: { type: 'number' },
    title: { type: 'string' },
    name: { type: 'string' },
    merged: { type: 'boolean' },
    state: { type: 'string' },
    id: { type: 'number' },
    body: { type: 'string' },
    html_url: { type: 'string' },
    full_name: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    user_login: { type: 'string' },
    login: { type: 'string' },
    path: { type: 'string' },
    branch: { type: 'string' },
    dirty: { type: 'boolean' },
    head: { type: 'string' },
    current: { type: 'boolean' },
    repoDir: { type: 'string' },
  },
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    data: { type: 'json' },
  },
}

import { TOOL_DEFS } from './tool-defs.js'
import { resolveSelection, aliasesForSelection, PRESET_NAMES } from './selection.js'
import { DISPATCHER_NAME, HELP_NAME, buildDispatcherDescription, buildOperationHelp, findOperation, validateOperationArgs } from './dispatcher.js'


export { unwrapVolatile }

export function parseConfig(raw) {
  const clean = unwrapVolatile(stripSecretsFromConfig(raw ?? {}))
  // Volatile fields come back wrapped (the settings projection needs the
  // marker), so unwrap before inspecting a value: `Config(...)` alone would
  // hand us a wrapper object where a preset name is expected.
  const validated = unwrapVolatile(Config(clean))
  // #49: reject an unknown preset at the earliest point that has a caller who
  // can report it — the mount fails with this message and the settings route
  // answers 400 instead of silently registering everything.
  if (!PRESET_NAMES.includes(validated.preset)) {
    throw new TypeError(
      `dsh-gitea: unknown tool preset "${validated.preset}" in Config.preset (expected: ${PRESET_NAMES.join(', ')})`,
    )
  }
  return validated
}

async function readGitOrigin(cwd = process.cwd()) {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd })
    return String(stdout || '').trim()
  } catch {
    return ''
  }
}

export function apply(ctx, config) {
  const getService = (c, name) => (c && typeof c.get === 'function' ? c.get(name) : (c && c[name]))

  const baseConfig = parseConfig(config)
  let dynamicConfig = () => parseConfig(config)
  let getConfig = () => dynamicConfig()
  const live = () => parseConfig(getConfig())
  // #48/#49: model-facing surface state. Filled by applyToolSelection() once the
  // definition tables below are built; the settings route reads it.
  const toolState = {
    preset: 'full',
    selected: [],
    availableCount: TOOL_DEFS.length,
    missingPatterns: [],
    missingExcludePatterns: [],
    legacyAliases: false,
    aliasCount: 0,
  }
  let toolDisposers = []
  let toolSignature = ''
  // settings.register exists in neither DSH 0.1.7-rc.2 nor 0.2.0, so a scope built
  // from it never existed and getSettingsScope() always returned this in-memory
  // fallback: writes updated the live config for the process lifetime and were
  // lost on restart. Back it with the real settings service instead, whose
  // describe()/update() are the 0.2 contract and are present in both releases.
  let settingsSvc = null

  const readServedConfig = () => {
    if (typeof settingsSvc?.describe !== 'function') return null
    try {
      const row = settingsSvc.describe().find((r) => r?.ns === NS)
      if (!row || !row.value) return null
      if (row.status && row.status !== 'ready') return null
      return parseConfig(structuredClone(row.value))
    } catch (err) {
      ctx.logger?.warn?.('[dsh-gitea] settings describe failed:', err?.message || err)
      return null
    }
  }

  const servedScope = {
    get: () => getConfig(),
    update: async (patch) => {
      // #301: Transactional update: validate and persist before mutating in-memory dynamicConfig
      const prev = getConfig()
      const merged = { ...prev, ...patch }
      if (prev && ('webhookSecret' in prev) && !('webhookSecret' in patch)) {
        merged.webhookSecret = prev.webhookSecret
      }
      const next = parseConfig(merged)
      const revision = (() => {
        try {
          return settingsSvc?.describe?.().find((r) => r?.ns === NS)?.revision
        } catch {
          return undefined
        }
      })()
      if (typeof settingsSvc?.update === 'function') {
        await settingsSvc.update(NS, structuredClone(unwrapVolatile(next)), revision)
      } else if (typeof settingsSvc?.replace === 'function') {
        await settingsSvc.replace(NS, structuredClone(unwrapVolatile(next)), revision)
      }
      // Mutate in-memory config and invalidate client cache only after successful persistence
      dynamicConfig = () => next
      clearClientCache()
      refreshToolSurface()
      return next
    },
  }

  ctx.inject(['settings'], (sctx) => {
    try {
      settingsSvc = getService(sctx, 'settings') || sctx.settings || null
      const served = readServedConfig()
      if (served) dynamicConfig = () => served
      if (typeof sctx.effect === 'function') {
        sctx.effect(() => () => {
          settingsSvc = null
          dynamicConfig = () => parseConfig(config)
          clearClientCache()
        })
      }
    } catch (err) {
      // The profile may be mounted without the settings service; the static config
      // stays authoritative and the loader/volatile-update handler below still
      // applies later changes.
      ctx.logger?.warn?.('[dsh-gitea] settings service unavailable:', err?.message || err)
    }
  })

  // Listen for volatile updates and config changes in modern DSH loaders
  if (typeof ctx?.on === 'function') {
    const applyPatch = (updated) => {
      if (updated && typeof updated === 'object') {
        const incoming = updated[NS] ?? updated
        if (incoming && typeof incoming === 'object') {
          try {
            const next = parseConfig({ ...getConfig(), ...incoming })
            dynamicConfig = () => next
            refreshToolSurface()
          } catch { /* ignore invalid update */ }
        }
      }
    }
    // Settings emits (namespace, revision): re-project the served document when
    // this plugin's namespace changed, so writes made through any other settings
    // surface become live without a reload.
    const applySettingsEvent = (ns) => {
      if (ns !== NS) return
      try {
        const served = readServedConfig()
        if (served) {
          dynamicConfig = () => served
          refreshToolSurface()
        }
      } catch { /* describe already logs */ }
    }
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => ctx.on('loader/volatile-update', applyPatch))
      ctx.effect(() => ctx.on('config', applyPatch))
      ctx.effect(() => ctx.on('settings/document-updated', applySettingsEvent))
    } else {
      ctx.on('loader/volatile-update', applyPatch)
      ctx.on('config', applyPatch)
      ctx.on('settings/document-updated', applySettingsEvent)
    }
  }

  const isSettingsReady = () => !!settingsSvc && (typeof settingsSvc.update === 'function' || typeof settingsSvc.replace === 'function')

  // Receive Gitea webhook events (for notifications panel)
  const eventsStore = new EventStore(50)
  const giteaEventsService = createGiteaEventsService()


  // Our published package lives in the pvlb.dev Forgejo npm registry; the
  // updater never touches the upstream npmjs tarball. A throwaway .npmrc is
  // generated per install so the package comes from this registry.
  const UPDATE_REGISTRY = 'https://git.pvlb.dev/api/packages/dsh-plugins/npm/'
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: '/api/dsh-gitea/update',
    packageName: 'dsh-gitea',
    registry: UPDATE_REGISTRY,
    manifestUrl: new URL('../package.json', import.meta.url),
    resolveRegistryToken: () => resolveToken(live().tokenEnv),
    isEnabled: () => live().updates !== false,
  }), 'dsh-gitea: /api/dsh-gitea/update')

  async function tokenConfigured(tokenEnv) {
    const status = credentialRefStatus(tokenEnv)
    if (!status.ok) return false
    try {
      const creds = getService(ctx, 'credentials') || ctx.credentials
      if (creds && typeof creds.describe === 'function') {
        const described = await creds.describe(credentialRef(status.name))
        return !!(described && described.configured)
      }
      const resolved = await creds.resolve(credentialRef(status.name))
      return !!(resolved && resolved.value)
    } catch {
      return false
    }
  }

  registerHttpRoutes(ctx, {
    parseConfig,
    live,
    getSettingsScope: () => servedScope,
    isSettingsReady,
    resolveToken,
    tokenConfigured,
    eventsStore,
    giteaEventsService,
    pinGitFromSessionLog,
    execFile: execFileAsync,
    // #49: active tool surface for the settings form and the config response.
    toolSurface: () => ({ ...toolState, selected: [...toolState.selected] }),
    // 0.8.8: the form renders the presets this Host accepts, not its own list.
    presets: [...PRESET_NAMES],
  })

  async function resolveToken(tokenEnv) {
    try {
      const resolved = await ctx.credentials.resolve(credentialRef(tokenEnv))
      if (resolved?.value) return resolved.value
    } catch { /* credential may be unset */ }
    return ''
  }

  const taskService = createGiteaTaskService({
    getConfig: live,
    resolveToken,
  })
  if (typeof ctx.provide === 'function') {
    ctx.provide('dshGitea', taskService)
    ctx.provide('giteaEvents', giteaEventsService)
  }

  async function makeDeps(remoteUrl, instanceName = '') {
    const cfg = live()
    const { resolveInstance } = await import('./instances.js')
    const inst = resolveInstance(cfg, instanceName)
    if (instanceName && !inst.ok) {
      return {
        instanceError: `Instance "${instanceName}" not found in configured instances.`,
        settings: cfg,
        remoteUrl,
      }
    }
    const tokenEnv = inst.ok ? inst.tokenEnv : cfg.tokenEnv
    const baseUrl = normalizeBaseUrl(inst.ok ? inst.baseUrl : cfg.baseUrl)
    const token = await resolveToken(tokenEnv)
    const client = getCachedClient({
      baseUrl,
      token,
      timeoutMs: cfg.timeoutMs,
    })
    return {
      client,
      settings: cfg,
      remoteUrl,
      configured: { baseUrl, token },
      execFile: execFileAsync,
      logger: ctx.logger,
      gitWrapper: cfg.gitWrapper,
    }
  }

  // #51 spike: one shared execution path, so the typed tools and the dispatcher
  // cannot drift in how they resolve a repo, an instance or a git pin.
  async function executeCanonicalTool(toolName, args, exec) {
    const sessionCwd = sessionCwdFromExec(exec)
    const cwd = repoCwdFromTool({ args, sessionCwd })
    const remoteUrl = cwd ? await readGitOrigin(cwd) : ''
    const deps = await makeDeps(remoteUrl, args.instance)
    if (deps.instanceError) {
      return toLossless({ ok: false, error: deps.instanceError })
    }
    deps.cwd = cwd
    deps.instance = args.instance || ''
    const result = await runHandler(toolName, args, deps)
    try { await pinGitFromExec({ ...exec, arguments: args }, result) } catch { /* never break a gitea tool */ }
    // #153: normalize schemes when DSH is on HTTPS and Gitea returns HTTP links
    if (live().forceHttpsUrls && result && typeof result === 'object') {
      try {
        const { normalizeExternalUrl } = await import('./url-safety.js')
        const visit = (node) => {
          if (!node || typeof node !== 'object') return node
          for (const key of Object.keys(node)) {
            const v = node[key]
            if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
              node[key] = normalizeExternalUrl(v, { baseUrl: deps.configured?.baseUrl || '', dshProtocol: 'https:' })
            } else if (v && typeof v === 'object') {
              visit(v)
            }
          }
          return node
        }
        if (result.value && typeof result.value === 'object') visit(result.value)
        else visit(result)
      } catch { /* normalization must not break result */ }
    }
    return toLossless(result)
  }

  // Every definition is built once; which of them are advertised is decided by
  // Config.preset / tools / excludeTools in applyToolSelection() below.
  const toolDefinitions = new Map()
  for (const def of TOOL_DEFS) {
    toolDefinitions.set(def.name, defineTool({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => formatToolResult(def.name, value),
      },
      execute: (args, exec) => executeCanonicalTool(def.name, args, exec),
    }))
  }

  // #305: Register legacy tool aliases (omit 'action' from required for alias schema)
  for (const [legacyName, [canonicalName, defaultAction]] of Object.entries(LEGACY_MAP)) {
    const canonicalDef = TOOL_DEFS.find((d) => d.name === canonicalName)
    const params = canonicalDef ? JSON.parse(JSON.stringify(canonicalDef.parameters || {})) : {}
    if (Array.isArray(params.required)) {
      params.required = params.required.filter((r) => r !== 'action')
    }
    toolDefinitions.set(legacyName, defineTool({
        name: legacyName,
        description: `[Deprecated alias for ${canonicalName} action: ${defaultAction}] ${canonicalDef?.description || ''}`,
        parameters: params,
        output: {
          schema: OUTPUT_SCHEMA,
          render: (_args, value) => formatToolResult(canonicalName, value),
        },
        execute: async (args, exec) => {
          const sessionCwd = sessionCwdFromExec(exec)
          const cwd = repoCwdFromTool({ args, sessionCwd })
          const remoteUrl = cwd ? await readGitOrigin(cwd) : ''
          const deps = await makeDeps(remoteUrl, args.instance)
          if (deps.instanceError) {
            return toLossless({ ok: false, error: deps.instanceError })
          }
          deps.cwd = cwd
          deps.instance = args.instance || ''
          const effectiveArgs = { ...args, action: args.action || defaultAction }
          const result = await runHandler(legacyName, effectiveArgs, deps)
          try { await pinGitFromExec({ ...exec, arguments: effectiveArgs }, result) } catch { /* ignore */ }
          return toLossless(result)
        },
    }))
  }

  // ---------------------------------------------------------------------------
  // #51 spike: the dispatcher surface, registered only by `preset: dispatcher`.
  // Two tools, a stable registry (no dynamic registration), schemas delivered as
  // append-only tool results. Built from TOOL_DEFS, so the catalog and the
  // argument validation cannot drift from the typed surface.
  // ---------------------------------------------------------------------------
  function buildDispatcherTools() {
    const dispatcherDef = defineTool({
      name: DISPATCHER_NAME,
      description: buildDispatcherDescription(TOOL_DEFS),
      // DSH tool parameters are a property map, not a JSON Schema wrapper.
      parameters: {
        operation: { type: 'string', required: true, description: 'Canonical operation name from the catalog.' },
        args: { type: 'json', description: 'Arguments for the operation, validated against its schema.' },
        instance: { type: 'string' },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (args, value) => formatToolResult(args?.operation, value),
      },
      execute: async (args, exec) => {
        const def = findOperation(TOOL_DEFS, args?.operation)
        if (!def) {
          return toLossless({
            ok: false,
            error: `unknown operation "${args?.operation}" — call ${HELP_NAME} with an operation name, or use the catalog in this tool's description`,
          })
        }
        const operationArgs = args?.args && typeof args.args === 'object' && !Array.isArray(args.args) ? args.args : {}
        const check = validateOperationArgs(def, operationArgs)
        if (!check.ok) {
          return toLossless({
            ok: false,
            error: `invalid args for ${def.name}: ${check.errors.join('; ')}. Call ${HELP_NAME} { operation: "${def.name}" } for its schema.`,
          })
        }
        return executeCanonicalTool(def.name, operationArgs, exec)
      },
    })

    const helpDef = defineTool({
      name: HELP_NAME,
      description: 'Return one Gitea operation\'s description and JSON Schema (delivered as a tool result, not as a registered tool). Call it before an operation you have not used yet.',
      parameters: {
        operation: { type: 'string', required: true, description: 'Canonical operation name.' },
      },
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => formatToolResult(DISPATCHER_NAME, value) },
      execute: async (args) => {
        const def = findOperation(TOOL_DEFS, args?.operation)
        if (!def) {
          return toLossless({ ok: false, error: `unknown operation "${args?.operation}"` })
        }
        return toLossless({ ok: true, data: { operation: def.name, help: buildOperationHelp(def) } })
      },
    })

    return [dispatcherDef, helpDef]
  }

  // #48/#49: advertise only the configured subset. The signature keeps
  // unrelated settings writes cheap — no re-registration, so the model-facing
  // tool prefix stays reusable. register() returns the exact disposer, so a
  // surface change is applied live instead of needing a Harness restart.
  function applyToolSelection() {
    const cfg = live()
    const available = TOOL_DEFS.map((d) => d.name)
    const dispatcher = cfg.preset === 'dispatcher'
    const selection = dispatcher
      ? { preset: 'dispatcher', patterns: [], selected: [], missingPatterns: [], missingExcludePatterns: [] }
      : resolveSelection({
        preset: cfg.preset,
        tools: cfg.tools,
        excludeTools: cfg.excludeTools,
        available,
      })
    const aliases = !dispatcher && cfg.legacyAliases === true
    const signature = JSON.stringify([dispatcher, aliases, selection.selected])
    if (signature === toolSignature) return toolState
    for (const dispose of toolDisposers) {
      try { if (typeof dispose === 'function') dispose() } catch { /* already gone */ }
    }
    toolDisposers = []
    let aliasCount = 0
    if (dispatcher) {
      for (const definition of buildDispatcherTools()) toolDisposers.push(ctx.tools.register(definition))
    } else {
      // Registration order follows TOOL_DEFS order, so `full` is byte-identical
      // to the pre-#49 canonical surface.
      for (const name of selection.selected) {
        const definition = toolDefinitions.get(name)
        if (definition) toolDisposers.push(ctx.tools.register(definition))
      }
      if (aliases) {
        for (const legacyName of aliasesForSelection(selection.selected, LEGACY_MAP)) {
          const definition = toolDefinitions.get(legacyName)
          if (!definition) continue
          toolDisposers.push(ctx.tools.register(definition))
          aliasCount += 1
        }
      }
    }
    toolSignature = signature
    Object.assign(toolState, {
      preset: selection.preset,
      selected: dispatcher ? [DISPATCHER_NAME, HELP_NAME] : selection.selected,
      availableCount: available.length,
      missingPatterns: selection.missingPatterns,
      missingExcludePatterns: selection.missingExcludePatterns,
      legacyAliases: aliases,
      aliasCount,
    })
    for (const pattern of [...selection.missingPatterns, ...selection.missingExcludePatterns]) {
      ctx.logger?.warn?.(`[dsh-gitea] tool selection pattern "${pattern}" matched no canonical tool`)
    }
    ctx.logger?.info?.(
      `[dsh-gitea] tool surface: ${selection.preset}, `
      + (dispatcher ? `2 meta-tools (catalog of ${available.length})` : `${selection.selected.length}/${available.length} canonical`)
      + (aliases ? `, ${aliasCount} deprecated aliases` : ''),
    )
    return toolState
  }

  // Called from the config/settings listeners above and from servedScope.update.
  // Failures must never take the plugin down: the previous surface stays live.
  function refreshToolSurface() {
    try {
      applyToolSelection()
    } catch (err) {
      ctx.logger?.warn?.('[dsh-gitea] tool surface not updated:', err?.message || err)
    }
  }

  applyToolSelection()
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      for (const dispose of toolDisposers) {
        try { if (typeof dispose === 'function') dispose() } catch { /* already gone */ }
      }
      toolDisposers = []
      toolSignature = ''
    })
  }


  async function pinFirstGitDir(ids, dirs) {
    if (!ids.length) return
    for (const dir of dirs) {
      if (await isGitDir(dir, execFileAsync)) {
        rememberSessionGitDirs(ids, dir)
        return dir
      }
    }
  }

  async function pinGitFromExec(exec, result) {
    await pinFirstGitDir(sessionIdsFromExec(exec), candidateGitDirsFromExec(exec, result))
  }

  const sessionLogInflight = new Map()
  async function pinGitFromSessionLog(sessionId) {
    const id = String(sessionId || '').trim()
    if (!id) return
    if (resolveSessionGitDir({ sessionId: id })) return
    if (sessionLogInflight.has(id)) return sessionLogInflight.get(id)
    const job = (async () => {
      const file = await findSessionLogFile(id)
      if (!file) return
      const text = await readSessionLogText(file)
      await pinFirstGitDir([id], candidateGitDirsFromSessionJsonl(text))
    })()
    sessionLogInflight.set(id, job)
    try { await job } catch { /* chip poll must never throw */ }
    finally { sessionLogInflight.delete(id) }
  }

  async function findSessionLogFile(sessionId) {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    const root = path.join(home, 'sessions')
    const walk = async (dir, depth) => {
      if (depth > 4) return ''
      let entries = []
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return '' }
      for (const ent of entries) {
        const full = path.join(dir, ent.name)
        if (!ent.isDirectory()) continue
        if (ent.name === sessionId) {
          for (const name of ['session.jsonl.zstd', 'session.jsonl']) {
            const candidate = path.join(full, name)
            try { await fs.access(candidate); return candidate } catch { /* next name */ }
          }
        }
        const nested = await walk(full, depth + 1)
        if (nested) return nested
      }
      return ''
    }
    return walk(root, 0)
  }

  async function readSessionLogText(file) {
    if (String(file).endsWith('.zstd')) {
      try {
        const { stdout } = await execFileAsync('zstdcat', [file], { maxBuffer: 32 * 1024 * 1024 })
        return String(stdout || '')
      } catch {
        const { stdout } = await execFileAsync('zstd', ['-dc', file], { maxBuffer: 32 * 1024 * 1024 })
        return String(stdout || '')
      }
    }
    return String(await fs.readFile(file, 'utf8'))
  }

  const registerMiddleware = () => ctx.on('tools/execute', async (exec, next) => {
    const result = await next()
    try { await pinGitFromExec(exec, result) } catch { /* never break another tool */ }
    // DoD reminder (default off): if git files were modified without issue/PR ref
    if (live().dodReminder) {
      try {
        const { checkDoD } = await import('./dod-reminder.js')
        const text = JSON.stringify(exec?.arguments || {}) + ' ' + JSON.stringify(result?.value || '')
        const reminder = checkDoD({ changedGitFiles: /git|commit|push|worktree|add|rm|mv/i.test(text), references: [], text })
        if (reminder.reminder) {
          const note = { type: 'text', text: reminder.message }
          if (result && Array.isArray(result.value)) result.value.push(note)
          else if (result) result.value = [result.value, note]
        }
      } catch { /* never break another tool */ }
    }
    return result
  })
  if (typeof ctx.effect === 'function') {
    ctx.effect(registerMiddleware)
  } else {
    registerMiddleware()
  }

  // Background scheduler (default off): periodic triage/health + optional delivery
  ctx.effect(() => {
    const scheduler = new BgScheduler({ intervalMs: Math.max(1, live().bgSchedulerIntervalMin) * 60000 })
    if (live().bgSchedulerEnabled) {
      scheduler.onTick(async () => {
        const cfg = live()
        const owner = cfg.bgSchedulerOwner || cfg.defaultOwner
        const repo = cfg.bgSchedulerRepo || cfg.defaultRepo
        if (!cfg.baseUrl || !owner || !repo) return { ok: false, error: 'bg scheduler: owner/repo/baseUrl not configured' }
        const token = await resolveToken(cfg.tokenEnv)
        const client2 = new GiteaClient({ baseUrl: cfg.baseUrl, token, timeoutMs: cfg.timeoutMs })
        const { buildTriageDigest } = await import('./triage-digest.js')
        const digest = await buildTriageDigest({ owner, repo }, { client: client2 })
        if (digest?.ok && cfg.bgSchedulerWebhook) {
          const text = `[Triage Digest] ${owner}/${repo}: ${digest.data?.openIssues || 0} open issues, ${digest.data?.openPulls || 0} open PRs`
          try {
            const schedSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
              ? AbortSignal.timeout(10_000)
              : undefined
            await fetch(cfg.bgSchedulerWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, digest: digest.data }),
              signal: schedSignal,
            })
          } catch { /* delivery failure should not break bg scheduler */ }
        }
        try {
          const { runWorktreeGc } = await import('./worktree-gc.js')
          await runWorktreeGc({ confirm: false, dryRun: true }, {
            cwd: process.cwd(),
            execFile: ctx?.execFile,
            gitWrapper: cfg.gitWrapper,
          })
        } catch { /* ignore optional background GC inspection */ }
        return digest
      })
      scheduler.start()
    }
    return () => { scheduler.stop() }
  }, 'dsh-gitea: bg scheduler')
}
