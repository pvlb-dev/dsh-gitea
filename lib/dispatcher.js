/**
 * #51 spike: two-tool dispatcher surface (`gitea` + `gitea_help`).
 *
 * EXPERIMENT BRANCH ONLY — never released from here until the spike gate in
 * issue #51 is met: measured per-step prompt tokens and first-try argument
 * accuracy on the top-15 operations, versus `core` and `full`.
 *
 * The design bet is that a **stable** registry plus schema delivery as an
 * append-only tool *result* keeps the KV-cache prefix reusable, unlike #50's
 * dynamic registration. `TOOL_DEFS` stays the single source of truth: the
 * catalog, the help text and the argument validation all derive from it, so
 * there is no second schema corpus that can drift.
 *
 * Pure module: no DSH imports, no network — the Host entry bakes its output
 * into the two `defineTool()` definitions, and the tests exercise it directly.
 *
 * @module dsh-gitea/dispatcher
 */

/** Name of the single transport tool. */
export const DISPATCHER_NAME = 'gitea'

/** Name of the schema fetcher. */
export const HELP_NAME = 'gitea_help'

/** Per-operation help ceiling from the issue's acceptance criteria (~1.5 KB). */
export const HELP_MAX_BYTES = 1536

/** Maximum length of one catalog line's summary. */
const SUMMARY_MAX = 72

/** Collapse whitespace and cut one description down to a catalog summary. */
function summarize(description, max = SUMMARY_MAX) {
  const flat = String(description || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Build the one-line-per-operation catalog that the dispatcher description
 * carries. The model has to know which operations exist, so this is the
 * realistic shape (the bare skeleton measured 183 B but is unusable).
 *
 * @param {Array<{name: string, description?: string}>} defs - `TOOL_DEFS`.
 * @returns {string[]} catalog lines, one per operation, in definition order.
 */
export function buildCatalog(defs) {
  return defs.map((def) => `${def.name} — ${summarize(def.description)}`)
}

/**
 * Build the dispatcher description: instructions + operation catalog.
 *
 * @param {Array<{name: string, description?: string}>} defs - `TOOL_DEFS`.
 * @returns {string} tool description.
 */
export function buildDispatcherDescription(defs) {
  return [
    'Run one Gitea/Forgejo operation. Pass the canonical operation name and its',
    'arguments; the call is validated against that operation\'s schema. Call',
    `\`${HELP_NAME}\` with an operation name first if you need its JSON Schema.`,
    '',
    'Operations:',
    ...buildCatalog(defs),
  ].join('\n')
}

/**
 * Strip prose from a JSON Schema so the help payload stays small. Property
 * descriptions are the bulk of the schema and the least useful part at call
 * time; keep names, types, enums and required lists.
 *
 * @param {unknown} node - schema node.
 * @returns {unknown} compacted copy.
 */
export function compactSchema(node) {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(compactSchema)
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' || key === 'title' || key === 'examples') continue
    out[key] = compactSchema(value)
  }
  return out
}

/**
 * Required argument names of one tool def.
 *
 * `TOOL_DEFS.parameters` is a DSH **property map** (one entry per argument,
 * `required: true` on the entry), not a JSON Schema object — see `defineTool`.
 *
 * @param {object} parameters - property map.
 * @returns {string[]} required keys, in declaration order.
 */
export function requiredArguments(parameters) {
  if (!parameters || typeof parameters !== 'object') return []
  return Object.keys(parameters).filter((key) => parameters[key]?.required === true)
}

/**
 * Render the help payload for one operation, capped at `HELP_MAX_BYTES`.
 *
 * The schema is presented as a JSON Schema so it reads like what the typed
 * surface would have given the model. When even the compact form overflows, the
 * property set is abbreviated — a shorter truthful schema beats a payload cut
 * mid-JSON.
 *
 * @param {{name: string, description?: string, parameters?: object}} def - one tool def.
 * @param {number} [maxBytes=HELP_MAX_BYTES] - ceiling.
 * @returns {string} help text.
 */
export function buildOperationHelp(def, maxBytes = HELP_MAX_BYTES) {
  const parameters = def.parameters && typeof def.parameters === 'object' ? def.parameters : {}
  const required = requiredArguments(parameters)
  const asSchema = (props) => ({
    type: 'object',
    properties: props,
    ...(required.length ? { required } : {}),
  })
  const render = (schema, label) => `${def.name}\n\n${String(def.description || '').trim()}\n\nParameters (${label}):\n${JSON.stringify(schema, null, 2)}`

  const pretty = render(asSchema(compactSchema(parameters)), 'JSON Schema')
  if (Buffer.byteLength(pretty, 'utf8') <= maxBytes) return pretty

  const compact = `${def.name}\n\n${String(def.description || '').trim()}\n\nParameters (compact JSON Schema):\n${JSON.stringify(asSchema(compactSchema(parameters)))}`
  if (Buffer.byteLength(compact, 'utf8') <= maxBytes) return compact

  // Last resort: names and types only.
  const slimProps = {}
  for (const [key, value] of Object.entries(parameters)) {
    slimProps[key] = value && typeof value === 'object' && value.type ? { type: value.type } : {}
  }
  return `${def.name}\n\n${String(def.description || '').trim()}\n\nParameters (names and types only):\n${JSON.stringify(asSchema(slimProps))}`
}

/**
 * Minimal argument validation against one tool def's property map.
 *
 * Deliberately small: required, type and enum. That covers the mistakes a
 * dispatcher introduces (missing argument, typo, wrong shape) without pulling a
 * schema library into the plugin. Unknown arguments are reported too: the
 * dispatcher has no per-argument UI, so a silently ignored typo is the worst
 * failure mode.
 *
 * @param {{name: string, parameters?: object}} def - target tool def.
 * @param {Record<string, unknown>} args - candidate arguments.
 * @returns {{ok: boolean, errors: string[]}} validation result.
 */
export function validateOperationArgs(def, args) {
  const errors = []
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, errors: ['args must be an object'] }
  }
  const parameters = def?.parameters && typeof def.parameters === 'object' ? def.parameters : {}
  for (const key of requiredArguments(parameters)) {
    if (args[key] === undefined || args[key] === null) errors.push(`missing required argument "${key}"`)
  }
  for (const key of Object.keys(parameters)) {
    if (!(key in args)) continue
    const value = args[key]
    if (value === undefined || value === null) continue
    const prop = parameters[key]
    const expected = prop && typeof prop === 'object' ? prop.type : undefined
    if (!expected) continue
    const actual = Array.isArray(value) ? 'array' : typeof value === 'number' ? 'number' : typeof value
    if (expected === 'integer' ? !Number.isInteger(value) : expected !== actual) {
      errors.push(`argument "${key}" must be ${expected}, got ${actual}`)
      continue
    }
    if (Array.isArray(prop.enum) && prop.enum.length > 0 && !prop.enum.includes(value)) {
      errors.push(`argument "${key}" must be one of: ${prop.enum.join(', ')}`)
    }
  }
  // Unknown arguments: the typed surface would have rejected them outright.
  const known = new Set([...Object.keys(parameters), 'instance'])
  for (const key of Object.keys(args)) {
    if (!known.has(key)) errors.push(`unknown argument "${key}" (accepted: ${[...known].join(', ')})`)
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Find one operation definition by canonical name.
 *
 * @param {Array<{name: string}>} defs - `TOOL_DEFS`.
 * @param {string} operation - requested name.
 * @returns {object|undefined} the def, if it exists.
 */
export function findOperation(defs, operation) {
  if (typeof operation !== 'string') return undefined
  return defs.find((def) => def.name === operation)
}
