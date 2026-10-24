/**
 * Tool selection for the dsh-gitea plugin (#49).
 *
 * Pure module: no DSH imports, no network, no configuration objects. The Host
 * entry and the unit tests both use it, so the preset table can be verified
 * without booting a Harness.
 *
 * Only canonical tool names are listed here. Deprecated aliases are governed by
 * the separate `legacyAliases` flag and are filtered against the selected
 * canonical set in `lib/index.js`, so an alias is never advertised for a tool
 * that is not part of the surface.
 *
 * Matching rules (mirrored from `dsh-resend-mcp/lib/selection.js`, so operators
 * carry one mental model across plugins):
 * - a non-empty `tools` list replaces the preset;
 * - `*` is the only wildcard, every other character is literal;
 * - `excludeTools` subtracts after the base selection;
 * - patterns that match nothing are reported, never fatal.
 *
 * @module dsh-gitea/selection
 */

/**
 * Canonical tool sets. `core` is the hot path measured in #49 (the 15 tools
 * that carry most of the traffic); the domain presets are disjoint and their
 * union is all 96 canonical tools. `none` registers nothing at all.
 */
export const PRESETS = Object.freeze({
  core: Object.freeze([
    'gitea_issue_create',
    'gitea_labels',
    'gitea_issue_comment',
    'gitea_issue_get',
    'gitea_issue_close',
    'gitea_ci',
    'gitea_issue_list',
    'gitea_wiki',
    'gitea_repo_contents',
    'gitea_branches',
    'gitea_org',
    'gitea_releases',
    'gitea_whoami',
    'gitea_issue_search',
    'gitea_pr_get',
  ]),
  issues: Object.freeze([
    'gitea_issue_create',
    'gitea_issue_list',
    'gitea_issue_get',
    'gitea_issue_comments',
    'gitea_issue_comment',
    'gitea_issue_comment_delete',
    'gitea_issue_close',
    'gitea_issue_update',
    'gitea_issue_search',
    'gitea_issue_set_assignee',
    'gitea_issue_lint',
    'gitea_issue_duplicates',
    'gitea_batch_issue_ops',
    'gitea_issue_flow',
    'gitea_issue_templates',
    'gitea_reactions',
    'gitea_issue_timeline',
    'gitea_labels',
    'gitea_label_bootstrap',
    'gitea_label_auto',
    'gitea_milestones',
    'gitea_issue_to_pr',
  ]),
  prs: Object.freeze([
    'gitea_pr_create',
    'gitea_pr_list',
    'gitea_pr_get',
    'gitea_pr_diff',
    'gitea_pr_comment',
    'gitea_pr_merge',
    'gitea_pr_files',
    'gitea_pr_line_comment',
    'gitea_pr_merge_status',
    'gitea_pr_summary',
    'gitea_pr_impact',
    'gitea_pr_template_check',
    'gitea_pr_policy',
    'gitea_auto_merge',
    'gitea_pr_rebase',
    'gitea_merge_readiness',
    'gitea_pr_stack_status',
    'gitea_pr_stack_rebase',
    'gitea_conflict_analyze',
    'gitea_pr_conflict_resolve',
    'gitea_pr_reviews',
    'gitea_pr_submit_review',
    'gitea_pr_review',
    'gitea_ai_review',
    'gitea_review_inbox',
    'gitea_review_escalate',
    'gitea_suggest_reviewers',
  ]),
  repos: Object.freeze([
    'gitea_branches',
    'gitea_tags',
    'gitea_webhooks',
    'gitea_org',
    'gitea_wiki',
    'gitea_project_health',
    'gitea_triage_digest',
    'gitea_duty_report',
    'gitea_scheduled_checks',
    'gitea_repo_bootstrap',
    'gitea_repo_analytics',
    'gitea_mirror_public',
    'gitea_repo_search',
    'gitea_code_search',
    'gitea_repo_contents',
    'gitea_repo_commits',
    'gitea_repo_compare',
  ]),
  ops: Object.freeze([
    'gitea_notifications',
    'gitea_notifications_mark_read',
    'gitea_user_search',
    'gitea_whoami',
    'gitea_flavor',
    'gitea_branch_protection_get',
    'gitea_branch_protection_set',
    'gitea_deploy_keys',
    'gitea_security_audit',
    'gitea_mirror_sync_status',
    'gitea_webhook_sandbox',
    'gitea_worktree_list',
    'gitea_worktree_add',
    'gitea_worktree_use',
    'gitea_worktree_remove',
    'gitea_git_graph',
    'gitea_worktree_gc',
    'gitea_action_card',
    'gitea_releases',
    'gitea_release_plan',
    'gitea_ci',
    'gitea_task_tracker_sync',
    'gitea_memory_brain_sync',
    'gitea_incident_report',
    'gitea_release_assistant',
    'gitea_ci_logs_analyze',
    'gitea_packages_list',
    'gitea_package_get',
    'gitea_package_delete',
    'gitea_package_config',
  ]),
  full: Object.freeze(['*']),
  none: Object.freeze([]),
  // #51 spike: `dispatcher` registers the two meta-tools instead of a set; it
  // resolves to no canonical tools here so the resolver stays total.
  dispatcher: Object.freeze([]),
})

/** Preset names accepted by the Config schema. */
export const PRESET_NAMES = Object.freeze([
  'core',
  'issues',
  'prs',
  'repos',
  'ops',
  'full',
  'none',
  'custom',
  'dispatcher',
])

/**
 * Convert one selection pattern to an anchored regular expression.
 *
 * Only `*` is special; every other character is literal. Tool names are
 * lower-case ASCII, so the pattern stays readable in config comments.
 *
 * @param {string} pattern - tool name or glob such as `gitea_pr_*`.
 * @returns {RegExp} anchored matcher.
 */
export function patternToRegExp(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new TypeError('tool selection patterns must be non-empty strings')
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/**
 * Test one canonical tool name against one pattern.
 *
 * @param {string} name - canonical tool name.
 * @param {string} pattern - selection pattern.
 * @returns {boolean} true on match.
 */
export function matchPattern(name, pattern) {
  return patternToRegExp(pattern).test(name)
}

/**
 * Resolve the configured selection into concrete canonical tool names.
 *
 * The result preserves the order of `available` (the `TOOL_DEFS` order), which
 * keeps the registered tool prefix stable and makes `preset: full` byte-for-byte
 * identical to the 0.8.4 canonical surface.
 *
 * @param {object} options - selection inputs.
 * @param {string} [options.preset='full'] - preset name.
 * @param {string[]} [options.tools=[]] - explicit allowlist patterns.
 * @param {string[]} [options.excludeTools=[]] - subtractive patterns.
 * @param {string[]} [options.available=[]] - all canonical tool names.
 * @returns {{
 *   selected: string[],
 *   patterns: string[],
 *   missingPatterns: string[],
 *   missingExcludePatterns: string[],
 *   preset: string,
 * }} selection result.
 */
export function resolveSelection({
  preset = 'full',
  tools = [],
  excludeTools = [],
  available = [],
} = {}) {
  if (!PRESET_NAMES.includes(preset)) {
    throw new TypeError(`unknown Gitea tool preset "${preset}" (expected: ${PRESET_NAMES.join(', ')})`)
  }
  const names = [...available].filter((name) => typeof name === 'string' && name.length > 0)
  const explicit = Array.isArray(tools) ? tools.filter((t) => typeof t === 'string' && t.length > 0) : []
  if (preset === 'custom' && explicit.length === 0) {
    throw new TypeError('Gitea tool preset "custom" requires a non-empty `tools` list')
  }
  const patterns = explicit.length > 0 ? [...explicit] : [...(PRESETS[preset] ?? PRESETS.full)]
  const allowed = new Set()
  const missingPatterns = []
  for (const pattern of patterns) {
    const matcher = patternToRegExp(pattern)
    let matched = false
    for (const name of names) {
      if (matcher.test(name)) {
        allowed.add(name)
        matched = true
      }
    }
    if (!matched) missingPatterns.push(pattern)
  }
  const excludeList = Array.isArray(excludeTools)
    ? excludeTools.filter((t) => typeof t === 'string' && t.length > 0)
    : []
  const missingExcludePatterns = []
  for (const pattern of excludeList) {
    const matcher = patternToRegExp(pattern)
    let matched = false
    for (const name of names) {
      if (matcher.test(name)) {
        allowed.delete(name)
        matched = true
      }
    }
    if (!matched) missingExcludePatterns.push(pattern)
  }
  // Preserve the definition order (see above): no sort, so `full` is unchanged.
  const selected = names.filter((name) => allowed.has(name))
  return { selected, patterns, missingPatterns, missingExcludePatterns, preset }
}

/**
 * Pick the deprecated aliases that belong to a selected surface.
 *
 * An alias is only advertised when its canonical target is part of the
 * selection, so a narrowed preset never resurrects a capability it excluded.
 * Dispatch is independent of this (see `runHandler`): a stale session that
 * calls an unadvertised alias still resolves.
 *
 * @param {string[]} selected - selected canonical tool names.
 * @param {Record<string, [string, string]>} legacyMap - `LEGACY_MAP`.
 * @returns {string[]} alias names to advertise, in LEGACY_MAP order.
 */
export function aliasesForSelection(selected, legacyMap) {
  const canonical = new Set(Array.isArray(selected) ? selected : [])
  const aliases = []
  for (const [legacyName, entry] of Object.entries(legacyMap || {})) {
    const target = Array.isArray(entry) ? entry[0] : undefined
    if (typeof target === 'string' && canonical.has(target)) aliases.push(legacyName)
  }
  return aliases
}

/**
 * Render the one-line, model-facing summary of an active surface.
 *
 * @param {object} state - selection state from the Host entry.
 * @returns {string} summary such as `core — 15 of 96 canonical tools`.
 */
export function describeSelection(state = {}) {
  const preset = state.preset || 'full'
  const count = Array.isArray(state.selected) ? state.selected.length : 0
  const total = typeof state.availableCount === 'number' ? state.availableCount : 96
  const parts = [`${preset} — ${count} of ${total} canonical tools`]
  if (state.legacyAliases) parts.push(`${state.aliasCount || 0} deprecated aliases`)
  return parts.join(', ')
}
