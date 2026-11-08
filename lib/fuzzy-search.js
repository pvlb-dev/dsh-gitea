/**
 * #77 spike: a keyword matcher for the dispatcher's free-text operation.
 *
 * The dispatcher's cost is not the call, it is the 96-line catalog that rides
 * in the tool description on every turn (~9 KB). For a 2B-4B local model that
 * is a large slice of the context, and `gitea_help` does not help: the model
 * must already know a name to ask for help. This module answers "which
 * operation did the model mean?" from plain words, so the description can
 * shrink to a few lines and `gitea` can resolve the operation server-side.
 *
 * Pure module: no DSH imports, no network. `TOOL_DEFS` is the only input, and
 * every score is derived from a name, a description and a small curated
 * synonym/keyword map, so the matcher works for any plugin's defs and stays
 * unit-testable without a model.
 *
 * Design notes:
 * - Query-side expansion only. `pull request` becomes `pr`; the tool names are
 *   never rewritten, so an exact name always resolves first.
 * - Rare words weigh more (idf over the def set): "issue" is cheap, "rebase"
 *   is expensive, which is what separates `gitea_pr_rebase` from
 *   `gitea_pr_merge`.
 * - Coverage matters: a def matching every query token beats one matching the
 *   loudest token twice.
 * - Confidence is a threshold plus a margin. Below it the caller returns the
 *   closest names instead of guessing, because a wrong `gitea_pr_merge` is
 *   worse than one extra turn.
 *
 * @module dsh-gitea/fuzzy-search
 */

/** Weight of a token that appears in the operation name. */
const NAME_WEIGHT = 4
/** Weight of a curated keyword. */
const KEYWORD_WEIGHT = 3
/** Weight of a token that appears only in the description. */
const DESC_WEIGHT = 1
/** A confident match must clear this score. */
const MIN_SCORE = 3
/** ...and beat the runner-up by this factor (a tie is ambiguous). */
const CONFIDENCE_MARGIN = 1.25

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by',
  'with', 'from', 'about', 'into', 'over', 'after', 'before', 'this', 'that',
  'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'do', 'does', 'did', 'can', 'could', 'would', 'should', 'please',
  'me', 'my', 'our', 'us', 'i', 'we', 'you', 'your', 'he', 'she', 'they',
  'them', 'there', 'here', 'what', 'which', 'who', 'whom', 'when', 'where',
  'why', 'how', 'all', 'any', 'some', 'one', 'two', 'again', 'also', 'just',
  'now', 'then', 'so', 'if', 'not', 'no', 'yes', 'ok', 'okay', 'go', 'get',
  'make', 'use', 'using', 'give', 'need', 'want', 'let', 'lets', 'has', 'have',
  'had', 'very', 'much', 'more', 'most', 'other', 'same', 'such', 'than',
])

/** Multi-word phrases, applied before tokenizing. */
const PHRASES = [
  ['open a pr', 'create'],
  ['open a pull request', 'create'],
  ['pull request', 'pr'],
  ['pull requests', 'pr'],
  ['merge request', 'pr'],
  ['merge requests', 'pr'],
  ['who am i', 'whoami'],
  ['ci pipeline', 'ci'],
  ['git graph', 'graph'],
  ['branch protection', 'protection'],
  ['deploy key', 'deploy'],
  ['deploy keys', 'deploy'],
  ['auto merge', 'auto_merge'],
  ['merge readiness', 'readiness'],
  ['release notes', 'release'],
  ['security audit', 'security'],
  ['project health', 'health'],
  ['duty report', 'duty'],
  ['scheduled check', 'scheduled'],
  ['scheduled checks', 'scheduled'],
  ['issue templates', 'template'],
  ['issue template', 'template'],
]

/**
 * Query token -> canonical tokens. Keep this small and obvious: every entry
 * is a word a model might actually emit for this domain. Adding noise here
 * hurts precision more than it helps recall.
 */
const SYNONYMS = {
  pull: ['pr'],
  prs: ['pr'],
  mr: ['pr'],
  mrs: ['pr'],
  ticket: ['issue'],
  tickets: ['issue'],
  bug: ['issue'],
  bugs: ['issue'],
  repository: ['repo'],
  repositories: ['repo'],
  pipeline: ['ci'],
  pipelines: ['ci'],
  build: ['ci'],
  builds: ['ci'],
  actions: ['ci'],
  checks: ['ci'],
  approve: ['submit'],
  approved: ['submit'],
  approval: ['submit'],
  publish: ['release'],
  version: ['release'],
  changelog: ['release'],
  inbox: ['notification'],
  unread: ['notification'],
  docs: ['wiki'],
  documentation: ['wiki'],
  registry: ['package'],
  npm: ['package'],
  pypi: ['package'],
  oci: ['package'],
  docker: ['package'],
  organization: ['org'],
  team: ['org'],
  teams: ['org'],
  hook: ['webhook'],
  hooks: ['webhook'],
  checkout: ['worktree'],
  sha: ['commit'],
  log: ['commit'],
  history: ['commit'],
  changes: ['diff'],
  patch: ['diff'],
  delta: ['diff'],
  healthcheck: ['health'],
  digest: ['triage'],
  assign: ['assignee'],
  assigned: ['assignee'],
  emoji: ['reaction'],
  reactions: ['reaction'],
  duplicates: ['duplicate'],
  crash: ['incident'],
  crashers: ['incident'],
  worktrees: ['worktree'],
  milestones: ['milestone'],
  labels: ['label'],
  tags: ['tag'],
  branches: ['branch'],
  releases: ['release'],
  packages: ['package'],
  users: ['user'],
  wikis: ['wiki'],
  notifications: ['notification'],
  commits: ['commit'],
  issues: ['issue'],
  pr: ['pr'],
  ci: ['ci'],
  rebase: ['rebase'],
  stack: ['stack'],
  conflict: ['conflict'],
  conflicts: ['conflict'],
}

/**
 * Curated keywords for operations whose name/description are too terse for a
 * plain word match. Keep them short; the description already carries the prose.
 */
const KEYWORDS = {
  gitea_issue_close: ['close', 'resolve', 'done', 'finish'],
  gitea_issue_create: ['file', 'report', 'new', 'open'],
  gitea_issue_get: ['show', 'view', 'read'],
  gitea_issue_list: ['list', 'open', 'all'],
  gitea_issue_search: ['find', 'search', 'lookup'],
  gitea_issue_update: ['edit', 'change', 'retitle'],
  gitea_issue_set_assignee: ['assign', 'hand', 'owner'],
  gitea_issue_comment: ['comment', 'reply', 'note'],
  gitea_issue_timeline: ['history', 'events', 'timeline'],
  gitea_issue_lint: ['lint', 'check', 'definition'],
  gitea_issue_duplicates: ['duplicate', 'similar'],
  gitea_batch_issue_ops: ['bulk', 'batch', 'many'],
  gitea_issue_flow: ['flow', 'plan', 'branch', 'workflow'],
  gitea_issue_to_pr: ['convert', 'pull', 'flow'],
  gitea_labels: ['label', 'tag', 'color', 'colour'],
  gitea_label_bootstrap: ['bootstrap', 'house', 'taxonomy'],
  gitea_label_auto: ['automation', 'auto', 'rule'],
  gitea_milestones: ['milestone', 'due', 'deadline'],
  gitea_reactions: ['emoji', 'reaction', 'react'],
  gitea_pr_list: ['list', 'open', 'closed'],
  gitea_pr_get: ['show', 'view', 'read'],
  gitea_pr_create: ['open', 'new', 'create'],
  gitea_pr_diff: ['diff', 'changes', 'patch'],
  gitea_pr_files: ['files', 'changed'],
  gitea_pr_comment: ['comment', 'reply'],
  gitea_pr_line_comment: ['inline', 'line', 'suggestion'],
  gitea_pr_merge: ['merge', 'land', 'squash', 'rebase'],
  gitea_auto_merge: ['auto', 'automatic', 'green'],
  gitea_pr_merge_status: ['mergeable', 'status', 'conflict'],
  gitea_merge_readiness: ['ready', 'readiness', 'gate', 'checklist'],
  gitea_pr_review: ['review', 'risk', 'summary'],
  gitea_ai_review: ['ai', 'review', 'diff'],
  gitea_pr_reviews: ['reviews', 'history', 'approvals'],
  gitea_pr_submit_review: ['approve', 'request', 'changes', 'review'],
  gitea_review_inbox: ['inbox', 'triage', 'waiting'],
  gitea_review_escalate: ['escalate', 'stale', 'ping'],
  gitea_suggest_reviewers: ['reviewers', 'suggest', 'codeowners'],
  gitea_pr_rebase: ['rebase', 'onto', 'fresh'],
  gitea_pr_stack_status: ['stack', 'chain', 'dependency'],
  gitea_pr_stack_rebase: ['stack', 'rebase', 'child'],
  gitea_conflict_analyze: ['conflict', 'merge', 'hunk'],
  gitea_pr_conflict_resolve: ['conflict', 'resolve', 'apply'],
  gitea_repo_contents: ['file', 'readme', 'md', 'contents', 'show', 'browse', 'view'],
  gitea_repo_commits: ['commits', 'log', 'history'],
  gitea_repo_compare: ['compare', 'diff', 'between'],
  gitea_repo_search: ['search', 'find', 'repos'],
  gitea_code_search: ['find', 'search', 'grep', 'code', 'read'],
  gitea_repo_bootstrap: ['scaffold', 'template', 'new'],
  gitea_repo_analytics: ['analytics', 'metrics', 'stats'],
  gitea_branches: ['branch', 'branches', 'create', 'delete'],
  gitea_tags: ['tag', 'tags', 'version'],
  gitea_mirror_public: ['mirror', 'public', 'sanitize'],
  gitea_mirror_sync_status: ['mirror', 'sync', 'lag'],
  gitea_project_health: ['health', 'status', 'stale'],
  gitea_triage_digest: ['triage', 'digest', 'daily'],
  gitea_duty_report: ['duty', 'report', 'snapshot'],
  gitea_scheduled_checks: ['scheduled', 'cron', 'recurring'],
  gitea_branch_protection_get: ['protection', 'rules'],
  gitea_branch_protection_set: ['protection', 'protect', 'require', 'reviews'],
  gitea_security_audit: ['security', 'audit', 'force', 'push'],
  gitea_deploy_keys: ['deploy', 'key', 'keys', 'ssh'],
  gitea_webhooks: ['webhook', 'hook', 'event'],
  gitea_webhook_sandbox: ['webhook', 'replay', 'buffer'],
  gitea_org: ['org', 'organization', 'members', 'teams'],
  gitea_wiki: ['wiki', 'page', 'docs', 'markdown'],
  gitea_notifications: ['notification', 'inbox', 'unread'],
  gitea_notifications_mark_read: ['read', 'notification', 'clear'],
  gitea_user_search: ['user', 'people', 'find'],
  gitea_whoami: ['whoami', 'identity', 'token', 'me'],
  gitea_flavor: ['flavor', 'gitea', 'forgejo', 'version'],
  gitea_worktree_list: ['worktree', 'list', 'checkouts'],
  gitea_worktree_add: ['worktree', 'add', 'create', 'checkout'],
  gitea_worktree_use: ['worktree', 'switch', 'pin'],
  gitea_worktree_remove: ['worktree', 'remove', 'delete'],
  gitea_worktree_gc: ['worktree', 'garbage', 'prune', 'cleanup'],
  gitea_git_graph: ['graph', 'log', 'commits', 'lanes'],
  gitea_action_card: ['card', 'ui', 'button'],
  gitea_releases: ['release', 'tag', 'publish', 'cut', 'new', 'version'],
  gitea_release_plan: ['release', 'semver', 'changelog', 'bump'],
  gitea_release_assistant: ['release', 'semver', 'notes', 'preflight'],
  gitea_ci: ['ci', 'runs', 'jobs', 'pipeline', 'rerun'],
  gitea_ci_logs_analyze: ['ci', 'logs', 'failure', 'root', 'cause'],
  gitea_packages_list: ['package', 'registry', 'versions'],
  gitea_package_get: ['package', 'version', 'metadata'],
  gitea_package_delete: ['package', 'delete', 'remove'],
  gitea_package_config: ['package', 'registry', 'npmrc', 'pip', 'docker'],
  gitea_task_tracker_sync: ['task', 'tracker', 'sync', 'board'],
  gitea_memory_brain_sync: ['memory', 'brain', 'index', 'facts'],
  gitea_incident_report: ['incident', 'crash', 'alert', 'report'],
}

/** Lower-case, split on non-alphanumerics. */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Very light singular/verb stem. Only the suffix families this domain uses:
 * `issues`/`issue`, `merges`/`merge`/`merged`/`merging`, `releases`/`release`.
 */
function stem(token) {
  let s = String(token || '')
  if (s.length <= 2) return s
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`
  else if (s.endsWith('es') && s.length > 3) s = s.slice(0, -2)
  else if (s.endsWith('s') && s.length > 2) s = s.slice(0, -1)
  if (s.endsWith('ing') && s.length > 4) s = s.slice(0, -3)
  else if (s.endsWith('ed') && s.length > 3) s = s.slice(0, -2)
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1)
  return s
}

/** Expand a raw query into canonical, stemmed tokens. */
export function queryTokens(query) {
  let text = ` ${String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  for (const [phrase, canonical] of PHRASES) text = text.split(` ${phrase} `).join(` ${canonical} `)
  const out = []
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    if (STOPWORDS.has(raw)) continue
    for (const token of SYNONYMS[raw] || [raw]) {
      const s = stem(token)
      if (s && !STOPWORDS.has(s)) out.push(s)
    }
  }
  return [...new Set(out)]
}

/**
 * Build the inverted index for a def list. `df`/`idf` are computed from the
 * docs themselves, so a plugin with a different corpus needs no tuning.
 */
export function buildSearchIndex(defs) {
  const docs = (Array.isArray(defs) ? defs : []).map((def) => {
    const terms = new Map()
    const add = (token, weight) => {
      const t = stem(token)
      if (!t || STOPWORDS.has(t)) return
      terms.set(t, Math.max(terms.get(t) || 0, weight))
    }
    for (const token of tokenize(String(def.name || '').replace(/^gitea_/, ''))) add(token, NAME_WEIGHT)
    for (const token of KEYWORDS[def.name] || []) add(token, KEYWORD_WEIGHT)
    for (const token of tokenize(def.description)) add(token, DESC_WEIGHT)
    return { def, terms }
  })
  const documentFrequency = new Map()
  for (const { terms } of docs) {
    for (const term of terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
  }
  const total = docs.length
  const idf = (term) => Math.log((total + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1
  return { docs, idf }
}

/**
 * Rank operations for a free-text query.
 *
 * @param {Array<object>} defs - tool defs (name, description, parameters).
 * @param {string} query - what the model said.
 * @param {{limit?: number, index?: object}} [options] - limit, prebuilt index.
 * @returns {Array<{def: object, score: number, matched: number, coverage: number}>}
 */
export function rankOperations(defs, query, options = {}) {
  const { limit = 8 } = options
  const index = options.index || buildSearchIndex(defs)
  const tokens = queryTokens(query)
  if (!tokens.length) return []
  const ranked = []
  for (const { def, terms } of index.docs) {
    let score = 0
    let matched = 0
    for (const token of tokens) {
      let best = 0
      for (const [term, weight] of terms) {
        if (term === token) best = Math.max(best, weight)
        else if (term.length >= 4 && token.length >= 4 && (term.startsWith(token) || token.startsWith(term))) {
          best = Math.max(best, weight * 0.4)
        }
      }
      if (best > 0) {
        score += best * index.idf(token)
        matched += 1
      }
    }
    if (score <= 0) continue
    const coverage = matched / tokens.length
    ranked.push({ def, score: score * (0.7 + 0.3 * coverage), matched, coverage })
  }
  // On a tie, the shorter name is the more general operation (labels over
  // label_auto, pr_review over pr_reviews); after that, definition order.
  ranked.sort((a, b) => b.score - a.score || a.def.name.length - b.def.name.length)
  return ranked.slice(0, limit)
}

/**
 * Resolve one free-text operation.
 *
 * @param {Array<object>} defs - tool defs.
 * @param {string} query - requested operation (exact name or free text).
 * @param {{limit?: number, index?: object}} [options] - ranking options.
 * @returns {{kind: 'exact'|'confident'|'ambiguous'|'none', def?: object,
 *   ranked: Array<{def: object, score: number}>}}
 */
export function resolveQuery(defs, query, options = {}) {
  const text = String(query || '').trim()
  const exact = (Array.isArray(defs) ? defs : []).find((def) => def.name === text)
  if (exact) return { kind: 'exact', def: exact, ranked: [{ def: exact, score: Number.POSITIVE_INFINITY }] }
  const ranked = rankOperations(defs, text, options)
  if (!ranked.length) return { kind: 'none', ranked: [] }
  const [top, second] = ranked
  const confident = top.score >= MIN_SCORE && (!second || top.score >= second.score * CONFIDENCE_MARGIN)
  return confident
    ? { kind: 'confident', def: top.def, ranked }
    : { kind: 'ambiguous', ranked }
}

/** One-line summary of a def, capped so a candidate list stays small. */
export function summarizeDef(def, max = 64) {
  const flat = String(def?.description || '').replace(/\s+/g, ' ').trim()
  const cut = flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')}…` : flat
  return cut || def?.name || ''
}

/** Render the closest candidates as a compact sentence for the model. */
export function candidateList(ranked, limit = 3) {
  return ranked
    .slice(0, limit)
    .map(({ def }) => `${def.name} (${summarizeDef(def)})`)
    .join('; ')
}

/**
 * The fuzzy dispatcher description: a few lines instead of the 96-line
 * catalog. Two examples carry more signal for a small model than prose.
 */
export function buildFuzzyDescription(defs) {
  const count = Array.isArray(defs) ? defs.length : 0
  return [
    `Gitea/Forgejo for software-development work: issues, pull requests, reviews,`,
    `branches, tags, releases, CI, packages, webhooks, worktrees — ${count} operations,`,
    'all through this tool.',
    '',
    'Say what to do in your own words as `operation`; put the arguments in `args`:',
    '  gitea { operation: "close the flaky-test issue", args: { owner: "acme", repo: "web", number: 42 } }',
    '  gitea { operation: "list open pull requests", args: { owner: "acme", repo: "web" } }',
    '',
    'If the words clearly name one operation it runs; otherwise the answer lists the',
    'closest operations with their exact names. Call the help tool for a JSON Schema.',
  ].join('\n')
}
