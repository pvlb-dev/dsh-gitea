import { resolveRepo } from '../repo.js'
import { credentialRefStatus } from '../secrets.js'
import { runWorktreeAction } from '../git-local.js'

export const schedulerStore = { jobs: new Map() }

export function guardMerge(args = {}) {
  if (args.confirm === true) return { ok: true }
  return { ok: false, error: 'Merge requires confirm: true (boolean).' }
}

export const LOCAL_TOOLS = new Set([
  'gitea_worktree_list',
  'gitea_worktree_add',
  'gitea_worktree_use',
  'gitea_worktree_remove',
  'gitea_worktree_gc',
  'gitea_git_graph',
])

export const NO_REPO = new Set([
  'gitea_repo_search',
  'gitea_flavor',
  'gitea_whoami',
  'gitea_issue_search',
  'gitea_issue_lint',
  'gitea_user_search',
  'gitea_notifications',
  'gitea_notifications_mark_read',
  'gitea_mirror_public',
  'gitea_repo_bootstrap',
  'gitea_issue_templates',
  'gitea_release_assistant',
  'gitea_memory_brain_sync',
  'gitea_ci_logs_analyze',
  'gitea_action_card',
  "gitea_packages_list",
  "gitea_package_get",
  "gitea_package_delete",
  "gitea_package_config",
  "gitea_release_plan",
  "gitea_webhook_sandbox",
  ...LOCAL_TOOLS,
])

export function configuredError(deps) {
  const cred = credentialRefStatus(deps.settings?.tokenEnv || 'GITEA_TOKEN')
  if (!cred.ok) return { ok: false, error: cred.error }
  if (!deps.configured?.baseUrl) {
    return { ok: false, error: 'Configure the Gitea instance URL in Settings.' }
  }
  if (!deps.configured?.token) {
    return { ok: false, error: `Set the credential named ${cred.name} in DSH credentials.` }
  }
  return null
}

export const RECORD_KEYS = [
  'number', 'title', 'name', 'merged', 'mergeable', 'has_issues', 'has_conflicts', 'state', 'id',
  'body', 'html_url', 'full_name', 'created_at', 'updated_at', 'closed_at', 'merged_at',
  'sub_url', 'last_commit',
  'login', 'path', 'line', 'text', 'branch', 'dirty', 'head', 'base', 'ref', 'current', 'repoDir',
  'comments', 'content', 'type', 'mine',
  'labels', 'assignees', 'assignee', 'milestone', 'repository', 'pull_request', 'state_reason',
  'comments_count', 'workflow_runs', 'workflow_jobs', 'jobs', 'total_count', 'sha', 'size', 'download_url', 'encoding',
  'target', 'commit', 'commits', 'author', 'committer', 'parents', 'stats', 'files', 'tag_name', 'metrics',
  'summary', 'healthScore', 'issues', 'pulls', 'runs', 'truncated', 'sampleSize', 'inspectedCount',
  'diff', 'stat', 'filesCount', 'dryRun', 'deleted', 'preview', 'reactions', 'checks', 'ready',
  'needConfirm', 'notes', 'raw', 'items', 'entries', 'additions', 'deletions', 'conclusion', 'status',
  'filename', 'changes', 'patch',
  'packages', 'version', 'versions', 'creator', 'changelog', 'nextVersion',
  'currentVersion', 'bump', 'securitySafe', 'securityWarnings', 'snippet',
  'instructions', 'count',
  'reviewers', 'confidence', 'recommendations', 'score', 'rule', 'keyFingerprint',
  'branch_name', 'required_approvals', 'block_force_push', 'enable_push', 'enable_push_whitelist',
  'push_whitelist_usernames', 'require_review', 'enable_status_check', 'status_check_contexts',
  'fingerprint', 'read_only', 'key_id', 'protected', 'branchProtection',
  'lag', 'mirror_remote', 'mirrorRemote', 'mirror_sha', 'mirrorSha', 'local_sha', 'localSha',
  'push_mirrors', 'pull_mirror', 'last_sync', 'lastSync', 'last_error', 'lastError',
  'sync_triggered', 'syncTriggered', 'warning',
  'raw_size', 'rawSize', 'signature_status', 'signatureStatus', 'source_ip', 'sourceIp',
  'replayed', 'event_id', 'eventId', 'cleared', 'event', 'action', 'receivedAt',
  // QA sweep 2026-10-24: fields the new formatters need to survive slimRecord.
  'subject', 'reason', 'unread', 'label', 'old_title', 'new_title', 'removed_label', 'removed_assignee', 'reaction',
  'limit', 'total', 'head_branch', 'head_sha', 'run_number', 'workflow_id', 'ahead_by', 'behind_by',
  'areas', 'testFiles', 'risks', 'totalAdditions', 'totalDeletions', 'approvedBy', 'missing',
  'verdict', 'questions', 'hasTests', 'mergeStatus', 'headBranch', 'baseBranch',
  'steps', 'note', 'present', 'policy', 'validation', 'violations', 'template', 'riskChecklistNeeded', 'readOnly',
]

export function slimRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const out = {}
  for (const key of RECORD_KEYS) {
    if (value[key] !== undefined && value[key] !== null) out[key] = value[key]
  }
  // #7: label objects returned directly by `gitea_labels list` are not nested
  // under an issue, so the generic key list drops their colour/description.
  // Keep them for label-shaped records so the formatter can show both.
  if (value.id != null && value.name != null && value.color != null) {
    out.color = value.color
    if (value.description != null) out.description = value.description
  }
  if (value.user?.login) out.user_login = value.user.login
  if (value.mine !== undefined) out.mine = Boolean(value.mine)
  if (Array.isArray(value.labels)) {
    out.labels = value.labels.map((l) => (l && typeof l === 'object' ? {
      id: l.id,
      name: l.name,
      color: l.color,
      description: l.description,
    } : l))
  }
  if (value.milestone && typeof value.milestone === 'object') {
    out.milestone = {
      id: value.milestone.id,
      title: value.milestone.title || value.milestone.name,
      state: value.milestone.state,
      due_on: value.milestone.due_on,
    }
  }
  if (Array.isArray(value.assignees)) {
    out.assignees = value.assignees.map((a) => (a && typeof a === 'object' ? (a.login || a.username || a.name || a) : a))
  }
  if (Array.isArray(value.comments)) {
    out.comments = value.comments.map((c) => ({
      id: c.id,
      user: c.user?.login || c.user_login || c.login || 'unknown',
      body: c.body || '',
      created_at: c.created_at,
      updated_at: c.updated_at,
      ...(c.mine !== undefined ? { mine: Boolean(c.mine) } : {}),
    }))
  }
  return out
}

export function getLoggerWarn(logger) {
  if (logger && typeof logger.warn === 'function') {
    return (...args) => logger.warn(...args)
  }
  return (...args) => console.warn(...args)
}

export async function annotateCommentsWithMine(comments, client, logger) {
  if (!Array.isArray(comments) || comments.length === 0 || !client?.getUser) return comments
  let meLogin = ''
  const warn = getLoggerWarn(logger)
  try {
    const meRes = await client.getUser()
    if (meRes?.ok && meRes.data?.login) {
      meLogin = String(meRes.data.login).toLowerCase()
    } else if (meRes && !meRes.ok) {
      /* bestEffort: mine is not critical for reading comments */
      warn('[dsh-gitea] getUser returned non-ok response:', meRes.error || meRes.status)
    }
  } catch (err) {
    /* bestEffort: mine is not critical for reading comments */
    warn('[dsh-gitea] getUser failed while annotating comments:', err?.message || String(err))
  }
  if (!meLogin) {
    return comments
  }
  for (const c of comments) {
    if (c && typeof c === 'object') {
      const authorLogin = String(c.user?.login || c.user?.username || c.user_login || c.login || '').toLowerCase()
      c.mine = Boolean(authorLogin && authorLogin === meLogin)
    }
  }
  return comments
}

export function unwrapPayload(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.data)) {
    return raw.data
  }
  return raw
}

export function wrap(apiResult) {
  if (!apiResult?.ok) {
    return { ok: false, error: apiResult?.error || `HTTP ${apiResult?.status || 0}` }
  }
  const raw = unwrapPayload(apiResult.data)
  // #231: an endpoint that answers with an empty body (Gitea's merge does) leaves
  // `data` undefined. Returning `{ ok: true, data: undefined }` breaks the harness
  // contract — JSON drops the key, so the tool result is rejected as "not lossless
  // JSON" even though the call succeeded. Omit the field when there is no payload.
  if (raw === undefined) return { ok: true }
  if (Array.isArray(raw)) {
    return { ok: true, data: raw.map(slimRecord) }
  }
  return { ok: true, data: slimRecord(raw) }
}

/**
 * #231: make any tool result survive JSON round-tripping. `undefined` object keys,
 * non-finite numbers, `Date` and `BigInt` values all lose information on
 * serialization, which the harness rejects as "not lossless JSON".
 */
export function toLossless(value, stack = new Set()) {
  if (value === undefined || value === null) return value === undefined ? undefined : null
  const type = typeof value
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (type === 'bigint') return value.toString()
  if (type === 'function' || type === 'symbol') return undefined
  if (type !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (stack.has(value)) return undefined
  stack.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const clean = toLossless(item, stack)
        return clean === undefined ? null : clean
      })
    }
    const out = {}
    for (const key of Object.keys(value)) {
      const clean = toLossless(value[key], stack)
      if (clean !== undefined) out[key] = clean
    }
    return out
  } finally {
    stack.delete(value)
  }
}

export function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

export function pickQuery(args, keys) {
  const query = {}
  for (const key of keys) {
    const value = args[key]
    if (value !== undefined && value !== null && value !== '') query[key] = value
  }
  return query
}

export const LEGACY_MAP = {
  gitea_label_list: ['gitea_labels', 'list'],
  gitea_label_create: ['gitea_labels', 'create'],
  gitea_label_delete: ['gitea_labels', 'delete'],
  gitea_issue_set_labels: ['gitea_labels', 'set'],
  gitea_milestone_list: ['gitea_milestones', 'list'],
  gitea_milestone_create: ['gitea_milestones', 'create'],
  gitea_milestone_update: ['gitea_milestones', 'update'],
  gitea_milestone_delete: ['gitea_milestones', 'delete'],
  gitea_reaction_add: ['gitea_reactions', 'add'],
  gitea_reaction_delete: ['gitea_reactions', 'delete'],
  gitea_reaction_list: ['gitea_reactions', 'list'],
  gitea_release_list: ['gitea_releases', 'list'],
  gitea_release_create: ['gitea_releases', 'create'],
  gitea_release_update: ['gitea_releases', 'update'],
  gitea_release_delete: ['gitea_releases', 'delete'],
  gitea_release_now: ['gitea_releases', 'plan'],
  gitea_release_notes: ['gitea_releases', 'notes'],
  gitea_ci_status: ['gitea_ci', 'status'],
  gitea_ci_jobs: ['gitea_ci', 'jobs'],
  gitea_ci_rerun: ['gitea_ci', 'rerun'],
  gitea_ci_explain: ['gitea_ci', 'explain'],
  gitea_repo_branches: ['gitea_branches', 'list'],
  gitea_repo_branch_create: ['gitea_branches', 'create'],
  gitea_repo_branch_delete: ['gitea_branches', 'delete'],
  gitea_repo_tags: ['gitea_tags', 'list'],
  gitea_repo_tag_create: ['gitea_tags', 'create'],
  gitea_repo_tag_delete: ['gitea_tags', 'delete'],
  gitea_webhook_list: ['gitea_webhooks', 'list'],
  gitea_webhook_create: ['gitea_webhooks', 'create'],
  gitea_webhook_delete: ['gitea_webhooks', 'delete'],
  gitea_org_list: ['gitea_org', 'list'],
  gitea_org_repos: ['gitea_org', 'repos'],
  gitea_org_members: ['gitea_org', 'members'],
  gitea_org_teams: ['gitea_org', 'teams'],
  gitea_repo_create_org: ['gitea_org', 'create_repo'],
  gitea_wiki_pages: ['gitea_wiki', 'list'],
  gitea_wiki_page: ['gitea_wiki', 'get'],
}
