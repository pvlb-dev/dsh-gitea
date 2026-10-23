/**
 * gitea_label_bootstrap: idempotent synchronization of a canonical label set
 * into a repository. Dry-run by default; existing foreign labels are preserved.
 *
 * #8: the pvlb.dev house set is the default. The upstream project's taxonomy is
 * available as an explicit opt-in (`taxonomy: "upstream"`) so this fork does not
 * sprinkle foreign labels on every repo it touches.
 */

export const HOUSE_LABELS = [
  { name: 'type/task', color: '1d76db', description: 'Task or chore' },
  { name: 'type/bug', color: 'd73a4a', description: 'Defect: wrong, missing or misleading behaviour' },
  { name: 'area/host', color: '0e8a16', description: 'Host/server configuration' },
  { name: 'area/backup', color: 'fbca04', description: 'Backup and restore' },
  { name: 'area/forgejo', color: '1d76db', description: 'Forgejo/Gitea service' },
  { name: 'area/dsh', color: '5319e7', description: 'DeepSeek Harness' },
  { name: 'area/security', color: 'b60205', description: 'Security' },
  { name: 'priority/now', color: 'b60205', description: 'Act now' },
  { name: 'priority/next', color: 'fbca04', description: 'Next up' },
  { name: 'priority/later', color: '0e8a16', description: 'Later' },
  { name: 'needs-operator', color: '5319e7', description: 'Operator action or decision required' },
]

// The upstream project's 34-label taxonomy, kept only for explicit opt-in.
export const UPSTREAM_LABELS = [
  { name: 'type/feature', color: '1d76db', description: 'New feature' },
  { name: 'type/bug', color: 'd73a4a', description: 'Defect or bug' },
  { name: 'type/tech-debt', color: 'fbca04', description: 'Technical debt' },
  { name: 'type/refactor', color: '0e8a16', description: 'Refactoring' },
  { name: 'type/docs', color: '0e8a16', description: 'Documentation update' },
  { name: 'type/research', color: '5319e7', description: 'Research spike' },
  { name: 'type/security', color: 'b60205', description: 'Security audit or vulnerability' },
  { name: 'type/incident', color: 'b60205', description: 'Incident or outage' },
  { name: 'priority/critical', color: 'b60205', description: 'Critical priority' },
  { name: 'priority/high', color: 'd93f0b', description: 'High priority' },
  { name: 'priority/medium', color: 'fbca04', description: 'Medium priority' },
  { name: 'priority/low', color: '0e8a16', description: 'Low priority' },
  { name: 'status/confirmed', color: '1d76db', description: 'Confirmed by team' },
  { name: 'status/needs-info', color: 'fbca04', description: 'Needs additional info' },
  { name: 'status/blocked', color: 'b60205', description: 'Blocked by dependency' },
  { name: 'status/ready', color: '0e8a16', description: 'Ready for implementation' },
  { name: 'status/in-progress', color: '1d9bf0', description: 'Work in progress' },
  { name: 'status/verification', color: '5319e7', description: 'Under verification' },
  { name: 'scope/agent-tools', color: '1d76db', description: 'Agent tools' },
  { name: 'scope/webui', color: '6f42c1', description: 'Web UI' },
  { name: 'scope/settings', color: '5319e7', description: 'Settings' },
  { name: 'scope/ci', color: '008672', description: 'CI' },
  { name: 'scope/release', color: 'd73a4a', description: 'Releases' },
  { name: 'scope/worktree', color: '0052cc', description: 'Worktree' },
  { name: 'scope/security', color: 'b60205', description: 'Security' },
  { name: 'scope/docs', color: '0e8a16', description: 'Documentation update' },
  { name: 'risk/breaking', color: 'd93f0b', description: 'Breaking change' },
  { name: 'risk/data-loss', color: 'b60205', description: 'Risk of data loss' },
  { name: 'risk/external-api', color: 'fbca04', description: 'External API' },
  { name: 'risk/migration', color: 'e99695', description: 'Requires migration' },
  { name: 'signal/stale', color: 'd4c5f9', description: 'No activity' },
  { name: 'signal/ci-failed', color: 'ee0701', description: 'CI build failed' },
  { name: 'signal/duplicate', color: 'fef2c0', description: 'Probable duplicate' },
  { name: 'signal/needs-reproduction', color: 'f9d0c4', description: 'Needs reproduction' },
]

export const TAXONOMIES = {
  house: HOUSE_LABELS,
  upstream: UPSTREAM_LABELS,
}

export function taxonomyLabels(name = 'house') {
  return TAXONOMIES[name] || null
}

function selectTaxonomy(args = {}) {
  const taxonomy = args.taxonomy || 'house'
  const labels = taxonomyLabels(taxonomy)
  if (!labels) return { ok: false, error: `unknown taxonomy: ${taxonomy}. Use "house" or "upstream".` }
  return { ok: true, taxonomy, labels }
}

async function listExisting(client, owner, repo) {
  const res = await client.listLabels(owner, repo, { limit: 100 }).catch((e) => ({ ok: false, error: String(e) }))
  if (!res?.ok) return { ok: false, error: res?.error || 'listLabels failed' }
  return { ok: true, existing: new Set((Array.isArray(res.data) ? res.data : []).map((l) => l.name)) }
}

export async function buildLabelPlan(args = {}, deps = {}) {
  const selected = selectTaxonomy(args)
  if (!selected.ok) return selected
  const { ok, existing, error } = await listExisting(deps.client, args.owner, args.repo)
  if (!ok) return { ok: false, error }
  const missing = selected.labels.filter((l) => !existing.has(l.name))
  return {
    ok: true,
    data: {
      owner: args.owner,
      repo: args.repo,
      taxonomy: selected.taxonomy,
      dryRun: true,
      missing,
      missingCount: missing.length,
      existingCount: existing.size,
      total: selected.labels.length,
    },
  }
}

export async function applyLabelPlan(args = {}, deps = {}) {
  const selected = selectTaxonomy(args)
  if (!selected.ok) return selected
  const { ok, existing, error } = await listExisting(deps.client, args.owner, args.repo)
  if (!ok) return { ok: false, error }
  const created = []
  const failed = []
  for (const label of selected.labels) {
    if (existing.has(label.name)) continue
    const res = await deps.client.createLabel(args.owner, args.repo, label).catch((e) => ({ ok: false, error: String(e) }))
    if (res?.ok) created.push(label.name)
    else failed.push({ name: label.name, error: res?.error || 'unknown' })
  }
  return {
    ok: true,
    data: {
      owner: args.owner,
      repo: args.repo,
      taxonomy: selected.taxonomy,
      dryRun: false,
      created,
      failed,
      existingCount: existing.size,
      total: selected.labels.length,
    },
  }
}
