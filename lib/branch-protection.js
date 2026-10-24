/**
 * Branch Protection audit, enforcement and Deploy Key management for Gitea repositories.
 */

import { wrap, asNumber } from './handlers/common.js'

// #20: default to the repository's actual default branch (master here), not a
// hard-coded "main"; an explicit branch that does not exist is an error.
async function resolveTargetBranch(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()
  const explicit = String(args.branch || '').trim()

  if (explicit) {
    if (client && typeof client.listBranches === 'function') {
      const res = await client.listBranches(owner, repo, { limit: 100 }).catch(() => null)
      if (res?.ok && Array.isArray(res.data)) {
        const exists = res.data.some((b) => String(b?.name || '') === explicit)
        if (!exists) return { ok: false, error: `branch not found: ${explicit}` }
      }
    }
    return { ok: true, branch: explicit }
  }

  if (client && typeof client.getRepo === 'function') {
    const repoRes = await client.getRepo(owner, repo).catch(() => null)
    if (repoRes?.ok && repoRes.data?.default_branch) {
      return { ok: true, branch: String(repoRes.data.default_branch) }
    }
  }
  return { ok: true, branch: 'main' }
}

export async function getBranchProtectionRule(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()

  if (!owner || !repo) {
    return { ok: false, error: 'owner and repo are required.' }
  }
  const target = await resolveTargetBranch(args, deps)
  if (!target.ok) return target
  const branch = target.branch

  const res = await client.getBranchProtection(owner, repo, branch)
  if (!res?.ok && res?.status === 404) {
    return {
      ok: true,
      data: {
        branch,
        protected: false,
        summary: `Branch "${branch}" has no protection rule configured.`,
      },
    }
  }

  return wrap(res)
}

export async function setBranchProtectionRule(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()

  if (!owner || !repo) {
    return { ok: false, error: 'owner, repo, and branch are required.' }
  }
  const target = await resolveTargetBranch(args, deps)
  if (!target.ok) return target
  const branch = target.branch

  const payload = {
    branch_name: branch,
    enable_push: args.enable_push ?? true,
    enable_push_whitelist: args.enable_push_whitelist ?? false,
    push_whitelist_usernames: args.push_whitelist_usernames || [],
    require_review: args.require_review ?? true,
    required_approvals: asNumber(args.required_approvals ?? 1),
    block_on_rejected_reviews: args.block_on_rejected_reviews ?? true,
    block_on_official_review_requests: args.block_on_official_review_requests ?? true,
    dismiss_stale_approvals: args.dismiss_stale_approvals ?? true,
    require_code_owner_approval: args.require_code_owner_approval ?? false,
    enable_status_check: args.enable_status_check ?? true,
    status_check_contexts: args.status_check_contexts || [],
    block_force_push: args.block_force_push ?? true,
  }

  if (args.confirm !== true) {
    return {
      ok: true,
      data: {
        dryRun: true,
        action: 'set_branch_protection',
        branch,
        settings: payload,
        note: `Dry-run preview. To apply protection rule for "${branch}", pass confirm: true.`,
      },
    }
  }

  // Check if protection rule exists
  const existRes = await client.getBranchProtection(owner, repo, branch).catch(() => null)
  let res
  if (existRes?.ok) {
    res = await client.editBranchProtection(owner, repo, branch, payload)
  } else {
    res = await client.createBranchProtection(owner, repo, payload)
  }

  if (!res?.ok) {
    return wrap(res)
  }

  return {
    ok: true,
    data: {
      applied: true,
      branch,
      rule: payload,
      summary: `Branch protection applied for "${branch}" (approvals: ${payload.required_approvals}, block force-push: ${payload.block_force_push}).`,
    },
  }
}

export async function listDeployKeys(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()

  if (!owner || !repo) {
    return { ok: false, error: 'owner and repo are required.' }
  }

  const res = await client.listDeployKeys(owner, repo)
  return wrap(res)
}

export async function addDeployKey(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()
  const title = String(args.title || '').trim()
  const key = String(args.key || '').trim()
  const readOnly = args.read_only !== false

  if (!owner || !repo || !title || !key) {
    return { ok: false, error: 'owner, repo, title, and key are required.' }
  }

  if (args.confirm !== true) {
    return {
      ok: true,
      data: {
        dryRun: true,
        action: 'add_deploy_key',
        title,
        read_only: readOnly,
        keyFingerprint: key.slice(0, 30) + '...',
        note: 'Dry-run preview. To register deploy key, pass confirm: true.',
      },
    }
  }

  const res = await client.addDeployKey(owner, repo, { title, key, read_only: readOnly })
  return wrap(res)
}

export async function deleteDeployKey(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()
  const keyId = asNumber(args.key_id || args.id)

  if (!owner || !repo || !keyId) {
    return { ok: false, error: 'owner, repo, and key_id are required.' }
  }

  if (args.confirm !== true) {
    return {
      ok: true,
      data: {
        dryRun: true,
        action: 'delete_deploy_key',
        key_id: keyId,
        note: `Dry-run preview. To remove deploy key #${keyId}, pass confirm: true.`,
      },
    }
  }

  const res = await client.deleteDeployKey(owner, repo, keyId)
  if (!res?.ok) return wrap(res)

  return {
    ok: true,
    data: {
      deleted: true,
      key_id: keyId,
      summary: `Deleted deploy key #${keyId} from ${owner}/${repo}.`,
    },
  }
}

export async function auditBranchSecurity(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()

  if (!owner || !repo) {
    return { ok: false, error: 'owner and repo are required for branch security audit.' }
  }
  const target = await resolveTargetBranch(args, deps)
  if (!target.ok) return target
  const branch = target.branch

  const issues = []
  const recommendations = []
  let protectedStatus = false
  let score = 100

  const protRes = await client.getBranchProtection(owner, repo, branch).catch(() => null)
  if (!protRes?.ok || !protRes.data) {
    issues.push(`Branch "${branch}" has NO branch protection rule. Direct push or force push is possible.`)
    recommendations.push(`Configure branch protection for "${branch}" using gitea_branch_protection_set.`)
    score -= 40
  } else {
    protectedStatus = true
    const rule = protRes.data
    if (rule.block_force_push === false) {
      issues.push(`Force push is ALLOWED on "${branch}".`)
      recommendations.push('Set block_force_push: true to prevent history rewrites.')
      score -= 20
    }
    if (!rule.require_review || rule.required_approvals < 1) {
      issues.push(`Pull Request reviews not strictly enforced on "${branch}".`)
      recommendations.push('Set require_review: true and required_approvals >= 1.')
      score -= 20
    }
    if (!rule.enable_status_check) {
      issues.push(`CI status checks are not mandatory before merging into "${branch}".`)
      recommendations.push('Enable mandatory status checks for critical CI workflows.')
      score -= 10
    }
  }

  return {
    ok: true,
    data: {
      owner,
      repo,
      branch,
      protected: protectedStatus,
      score: Math.max(0, score),
      status: score >= 80 ? 'secure' : (score >= 60 ? 'warning' : 'critical'),
      issues,
      recommendations,
      summary: `Security Audit for ${owner}/${repo}@${branch}: score ${score}/100 [${score >= 80 ? 'SECURE' : 'ACTION REQUIRED'}]. ${issues.length} issue(s) detected.`,
    },
  }
}
