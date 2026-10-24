// #2: the API result is already bounded by the caller's `limit`/`page`; the
// formatter must not drop rows silently. A deliberately visible cap is fine.
const MAX_LIST_ROWS = 100

// #5: an empty array must say what was empty instead of collapsing to one
// generic string, so "nothing there" is distinguishable per tool.
const EMPTY_LIST_MESSAGES = {
  gitea_issue_list: 'No issues.',
  gitea_issue_search: 'No issues.',
  gitea_labels: 'No labels.',
  gitea_pr_list: 'No pull requests.',
  gitea_pr_files: 'No files.',
  gitea_pr_reviews: 'No reviews.',
  gitea_milestones: 'No milestones.',
  gitea_branches: 'No branches.',
  gitea_tags: 'No tags.',
  gitea_releases: 'No releases.',
  gitea_wiki: 'No wiki pages.',
  gitea_notifications: 'No notifications.',
  gitea_repo_commits: 'No commits.',
  gitea_repo_search: 'No repositories.',
  gitea_user_search: 'No users.',
  gitea_webhooks: 'No webhooks.',
  gitea_code_search: 'No matches.',
  gitea_ci: 'No CI runs.',
  gitea_issue_comments: 'No comments found.',
  gitea_issue_get_comments: 'No comments found.',
  gitea_reactions: 'No reactions.',
  gitea_issue_timeline: 'Timeline is empty.',
}

function clipSnippet(value, max = 300) {
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (typeof text !== 'string') text = String(text)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function describeUnknownObject(data) {
  const parts = []
  for (const key of ['name', 'title', 'login', 'number', 'path']) {
    const value = data?.[key]
    if (value !== undefined && value !== null && value !== '') parts.push(`${key}: ${value}`)
  }
  const head = parts.length > 0 ? parts.join(', ') : 'Unrecognised response'
  return `${head}\n${clipSnippet(data)}`
}

// #7: labels carry the numeric id that `action: "set"` needs, plus the colour
// and description that make the list readable.
function formatLabelLine(label) {
  const labelName = label?.name ?? '(unnamed label)'
  const meta = []
  if (label?.id != null) meta.push(`id: ${label.id}`)
  if (label?.color) {
    const color = String(label.color)
    meta.push(color.startsWith('#') ? color : `#${color}`)
  }
  const suffix = meta.length > 0 ? ` (${meta.join(', ')})` : ''
  const description = label?.description ? ` — ${label.description}` : ''
  return `${labelName}${suffix}${description}`
}

function listFooter(total) {
  if (total <= MAX_LIST_ROWS) return ''
  return `\n… and ${total - MAX_LIST_ROWS} more — narrow the filter or page through.`
}

export function formatToolResult(name, value) {
  if (!value?.ok) {
    const err = value?.error || 'unknown error'
    return [{ type: 'text', text: `${name} failed: ${err}` }]
  }

  const data = value.data
  if (data && typeof data === 'object') {
    if (name === 'gitea_worktree_gc') {
      const mode = data.dryRun ? 'Dry-run inspection' : 'Garbage collection'
      const cands = Array.isArray(data.candidates) ? data.candidates.length : 0
      const pruned = Array.isArray(data.pruned) ? data.pruned.length : 0
      return [{ type: 'text', text: `Worktree GC (${mode}): ${data.checked} trees checked, ${cands} candidate(s), ${pruned} pruned.` }]
    }
    if (name === 'gitea_issue_to_pr') {
      return [{ type: 'text', text: `Issue-to-PR: Branch "${data.branch}" prepared for issue #${data.issue?.number} (${data.issue?.title || ''}). PR draft created.` }]
    }
    if (name === 'gitea_ai_review') {
      return [{ type: 'text', text: data.reviewBody || `AI Review PR #${data.prNumber}: ${data.status}` }]
    }
    if (name === 'gitea_ci_logs_analyze') {
      const step = data.failedStep ? ` (step: ${data.failedStep})` : ''
      const rec = data.recommendation ? `\nRecommendation: ${data.recommendation}` : ''
      return [{ type: 'text', text: `CI Analysis [${data.status}]: ${data.errorSummary || 'No errors found'}${step}${rec}` }]
    }
    if (name === 'gitea_ci') {
      // #26: status/jobs/run all arrive as different shapes.
      const sha = (value) => String(value || '').slice(0, 8)
      const flag = (status, conclusion) => `[${status || '?'}${conclusion ? `/${conclusion}` : ''}]`
      if (Array.isArray(data)) {
        // Forgejo's jobs endpoint returns a bare array (ActionRunJob[]).
        const isJobs = data.every((item) => item && item.name != null && item.head_sha == null)
        if (isJobs) {
          const lines = data.slice(0, 50).map((job) => `#${job.id} ${job.name || '(unnamed)'} ${flag(job.status, job.conclusion)}${job.runner_name ? ` on ${job.runner_name}` : ''}`)
          return [{ type: 'text', text: `CI Jobs (${data.length}):\n${lines.join('\n')}` }]
        }
        const lines = data.slice(0, 50).map((run) => `#${run.id} ${run.title || run.name || ''} ${flag(run.status, run.conclusion)} ${run.head_branch || ''} ${sha(run.head_sha)}`)
        return [{ type: 'text', text: `CI Runs (${data.length}):\n${lines.join('\n')}` }]
      }
      const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : []
      if (runs.length > 0) {
        const lines = runs.slice(0, 50).map((run) => `#${run.id} ${run.title || run.name || ''} ${flag(run.status, run.conclusion)} ${run.head_branch || ''} ${sha(run.head_sha)}${run.html_url ? `\n  ${run.html_url}` : ''}`)
        return [{ type: 'text', text: `CI Runs (${runs.length}):\n${lines.join('\n')}` }]
      }
      const jobs = Array.isArray(data.jobs) ? data.jobs : (Array.isArray(data.workflow_jobs) ? data.workflow_jobs : [])
      if (data.id != null) {
        const when = data.updated_at || data.created_at || ''
        const lines = [`CI Run #${data.id}: ${data.title || data.name || ''} ${flag(data.status, data.conclusion)}`]
        if (data.head_branch || data.head_sha) lines.push(`Branch: ${data.head_branch || '?'} @ ${sha(data.head_sha)}`)
        if (when) lines.push(`Updated: ${when}`)
        if (data.html_url) lines.push(`URL: ${data.html_url}`)
        if (jobs.length > 0) {
          lines.push(`Jobs: ${jobs.map((job) => `${job.name || job.id}:${job.conclusion || job.status || '?'}`).join(', ')}`)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      }
      if (jobs.length > 0) {
        const lines = jobs.slice(0, 50).map((job) => `#${job.id} ${job.name || '(unnamed)'} ${flag(job.status, job.conclusion)}${job.runner_name ? ` on ${job.runner_name}` : ''}`)
        return [{ type: 'text', text: `CI Jobs (${jobs.length}):\n${lines.join('\n')}` }]
      }
      return [{ type: 'text', text: 'No CI runs.' }]
    }
    if (name === 'gitea_action_card') {
      return [{ type: 'text', text: `Gitea Action Card (${data.type}): ${data.summary || data.title || ''}\n\nInteractive actions ready via DSH Hub.` }]
    }
    if (name === 'gitea_pr_stack_status') {
      return [{ type: 'text', text: `Stacked PR Status: ${data.summary || (data.stack ? `${data.stack.length} PR(s) in stack` : 'No stack information returned.')}` }]
    }
    if (name === 'gitea_pr_summary') {
      const risks = Array.isArray(data.risks) ? data.risks : []
      const areas = Array.isArray(data.areas) ? data.areas : []
      const tests = Array.isArray(data.testFiles) ? data.testFiles : []
      const approved = Array.isArray(data.approvedBy) ? data.approvedBy.filter(Boolean) : []
      const lines = [
        `PR #${data.number}${data.title ? ` "${data.title}"` : ''} [${data.state || '?'}]${data.author ? ` by @${data.author}` : ''}`,
        `Files: ${Array.isArray(data.files) ? data.files.length : 0} (+${data.totalAdditions ?? 0}/-${data.totalDeletions ?? 0}), areas: ${areas.join(', ') || '(none)'}`,
        `Tests: ${tests.length > 0 ? tests.join(', ') : 'none'}`,
        `Risks: ${risks.length > 0 ? risks.map((r) => `${r.type}:${r.file}`).join('; ') : 'none'}`,
        `Approvals: ${approved.length > 0 ? approved.map((a) => `@${a}`).join(', ') : 'none'}`,
        `Mergeable: ${data.mergeable ?? 'unknown'}${Array.isArray(data.missing) && data.missing.length > 0 ? ` | missing: ${data.missing.join(', ')}` : ''}`,
      ]
      return [{ type: 'text', text: lines.join('\n') }]
    }
    if (name === 'gitea_pr_review') {
      const risks = Array.isArray(data.risks) ? data.risks : []
      const questions = Array.isArray(data.questions) ? data.questions : []
      const lines = [`PR #${data.number} Review: ${data.verdict || 'unknown'}`, data.summary || '']
      lines.push(`Risks: ${risks.length > 0 ? risks.map((r) => `${r.severity || '?'} ${r.type}:${r.file}`).join('; ') : 'none'}`)
      if (questions.length > 0) lines.push(`Questions:\n${questions.map((q) => `  - ${q}`).join('\n')}`)
      return [{ type: 'text', text: lines.filter(Boolean).join('\n') }]
    }
    if (name === 'gitea_pr_rebase') {
      if (data.dryRun) {
        const steps = Array.isArray(data.steps) ? data.steps.map((step) => `  ${step}`).join('\n') : ''
        return [{ type: 'text', text: `PR #${data.number} Rebase Plan: ${data.headBranch || '?'} → ${data.baseBranch || '?'}\n${steps}\nNote: ${data.note || 'Pass confirm: true to apply.'}` }]
      }
      return [{ type: 'text', text: `PR #${data.number} rebased${data.summary ? `: ${data.summary}` : '.'}` }]
    }
    if (name === 'gitea_pr_policy') {
      if (!data.present) return [{ type: 'text', text: `PR Policy: not configured${data.note ? ` (${data.note})` : ''}.` }]
      const violations = Array.isArray(data.violations) ? data.violations : []
      if (violations.length === 0) return [{ type: 'text', text: 'PR Policy: no violations.' }]
      return [{ type: 'text', text: `PR Policy: ${violations.length} violation(s):\n${violations.map((v) => `  - ${typeof v === 'string' ? v : (v.message || v.rule || JSON.stringify(v))}`).join('\n')}` }]
    }
    if (name === 'gitea_pr_template_check') {
      const template = data.template || {}
      const missing = Array.isArray(template.missing) ? template.missing : []
      const risk = data.riskChecklistNeeded ? ' Risk checklist required.' : ''
      return [{ type: 'text', text: template.ok ? `PR Template: complete.${risk}` : `PR Template: missing section(s): ${missing.join(', ')}.${risk}` }]
    }
    if (name === 'gitea_conflict_analyze') {
      if (data.clean || data.conflictsCount === 0) {
        return [{ type: 'text', text: 'Conflict Analysis: Clean. ' + (data.summary || 'Branches merge cleanly with no conflicts.') }]
      }
      const filesSummary = Array.isArray(data.files)
        ? data.files.map((f) => '  - ' + f.file + ': ' + (f.hunksCount || 0) + ' conflict hunk(s) [' + (f.conflictType || 'content') + ']').join('\n')
        : ''
      return [{ type: 'text', text: 'Conflict Analysis: ' + (data.conflictsCount || 0) + ' conflicting file(s) found between ' + data.headBranch + ' and ' + data.baseBranch + '.\n' + filesSummary + '\n\nUse gitea_pr_conflict_resolve to preview diff and resolve.' }]
    }
    if (name === 'gitea_pr_conflict_resolve' || name === 'gitea_conflict_resolve') {
      if (data.clean && !data.applied) {
        // #24: no conflict + no confirm is a preview/no-op, never "Applied".
        const dry = data.dryRun === false ? '' : ' (dry-run)'
        return [{ type: 'text', text: `Conflict Resolution${dry}: no conflicts to resolve; nothing to apply.` }]
      }
      if (data.dryRun) {
        const previewLines = Array.isArray(data.previews)
          ? data.previews.map((p) => '--- File: ' + p.file + ' (strategy: ' + p.strategy + ') ---\n' + (p.previewDiff || '(no diff)')).join('\n\n')
          : ''
        return [{ type: 'text', text: 'Conflict Resolution Preview (' + (data.filesCount || 0) + ' file(s)):\n\n' + previewLines + '\n\nNote: ' + (data.note || 'Pass confirm: true to apply resolutions and commit.') }]
      }
      return [{ type: 'text', text: 'Conflict Resolution Applied: ' + (data.summary || ('Resolved ' + (data.filesResolved?.length || 0) + ' file(s) in commit ' + (data.commitSha ? data.commitSha.slice(0, 8) : 'HEAD') + '.')) }]
    }
    if (name === "gitea_release_plan") {
      const secCount = data.sections ? Object.entries(data.sections).filter(([, v]) => v > 0).length : 0
      const warn = data.securityWarnings?.length ? "\nSecurity warnings: " + data.securityWarnings.join("; ") : ""
      return [{ type: "text", text: "Release Plan: v" + data.nextVersion + " (" + data.bump + " bump from v" + data.currentVersion + ")\nChanges: " + data.changesCount + " across " + secCount + " section(s)." + warn + "\n\n" + (data.changelog || "") }]
    }
    if (name === "gitea_packages_list") {
      const count = data.count ?? (Array.isArray(data.packages) ? data.packages.length : 0)
      const sample = Array.isArray(data.packages) ? data.packages.slice(0, 10).map((p) => "  - [" + p.type + "] " + p.name + "@" + (p.version || "latest")).join("\n") : ""
      return [{ type: "text", text: "Package Registry (" + data.owner + "): " + count + " package(s) found.\n" + sample }]
    }
    if (name === "gitea_package_get") {
      // #36: a name-only lookup lists versions; a version lookup shows one.
      const versions = Array.isArray(data.versions) ? data.versions : []
      if (versions.length > 0) {
        const label = versions.length === 1 ? 'version' : 'versions'
        const lines = versions.slice(0, 20).map((entry) => `  - ${entry.version}${entry.created_at ? ` (${entry.created_at})` : ''}${entry.html_url ? `\n    ${entry.html_url}` : ''}`)
        return [{ type: "text", text: `Package: ${data.name || ''} [${data.type || ''}] — ${versions.length} ${label}\n${lines.join('\n')}${data.html_url && versions.length > 1 ? `\nURL: ${data.html_url}` : ''}` }]
      }
      return [{ type: "text", text: "Package: " + (data.name || "") + " [" + (data.type || "") + "]\nVersion: " + (data.version || "") + "\nURL: " + (data.html_url || data.htmlUrl || "") }]
    }
    if (name === "gitea_package_delete") {
      if (data.dryRun) {
        return [{ type: "text", text: "[DRY-RUN] Package Delete: " + data.name + "@" + data.version + " (" + data.type + "). Pass confirm: true to apply." }]
      }
      return [{ type: "text", text: "Package Deleted: " + data.name + "@" + data.version + " (" + data.type + ") removed from registry." }]
    }
    if (name === "gitea_package_config") {
      return [{ type: "text", text: "Package Config [" + data.type + "] (" + data.filename + "):\n\n```\n" + data.snippet + "\n```\n\n" + data.instructions }]
    }
    if (name === "gitea_suggest_reviewers") {
      const revs = Array.isArray(data.reviewers) && data.reviewers.length > 0
        ? data.reviewers.map((r) => `  - @${r.user} (${r.confidence} confidence): ${r.reasons?.join("; ") || ""}`).join("\n")
        : "  (none determined)"
      return [{ type: "text", text: `Suggested Reviewers (${data.filesChecked} file(s) checked):\n${revs}` }]
    }
    if (name === "gitea_branch_protection_get") {
      if (!data.protected && data.summary) return [{ type: "text", text: data.summary }]
      return [{ type: "text", text: `Branch Protection [${data.branch_name || data.branch}]: approvals=${data.required_approvals ?? 1}, force_push_blocked=${data.block_force_push ?? true}` }]
    }
    if (name === "gitea_branch_protection_set") {
      if (data.dryRun) {
        return [{ type: "text", text: `[DRY-RUN] Branch Protection for "${data.branch}":\nApprovals: ${data.settings?.required_approvals}, Block Force-Push: ${data.settings?.block_force_push}\nPass confirm: true to apply.` }]
      }
      return [{ type: "text", text: data.summary || `Branch protection applied for "${data.branch}".` }]
    }
    if (name === "gitea_deploy_keys") {
      if (Array.isArray(data)) {
        const list = data.map((k) => `  - #${k.id}: "${k.title}" [${k.read_only ? "readonly" : "write"}] (${k.fingerprint || ""})`).join("\n")
        return [{ type: "text", text: `Deploy Keys (${data.length}):\n${list || "  (none configured)"}` }]
      }
      if (data.dryRun) {
        return [{ type: "text", text: `[DRY-RUN] Deploy Key action: ${data.action} (${data.title || data.key_id}). Pass confirm: true to execute.` }]
      }
      return [{ type: "text", text: data.summary || "Deploy key updated." }]
    }
    if (name === "gitea_security_audit") {
      const issues = Array.isArray(data.issues) && data.issues.length > 0
        ? "\nIssues:\n" + data.issues.map((i) => `  - ⚠️ ${i}`).join("\n")
        : "\nNo critical issues detected."
      return [{ type: "text", text: `${data.summary}${issues}` }]
    }
    if (name === 'gitea_pr_stack_rebase') {
      if (data.dryRun) {
        return [{ type: 'text', text: `Stacked Rebase Plan (PR #${data.pr_number}): ${data.head} -> ${data.targetBase} (old: ${data.oldBase})\n${(data.steps || []).join("\n")}\n\nNote: Dry-run preview. Pass confirm: true to apply.` }]
      }
      return [{ type: 'text', text: `Stacked Rebase Completed (PR #${data.pr_number}): ${data.head} rebased onto ${data.targetBase} and pushed to origin.` }]
    }
    if (name === 'gitea_task_tracker_sync') {
      // #35: only export_cards/sync_card process cards; read-only actions must
      // not claim "1 card(s) processed".
      if (data.contract && data.mapping) {
        const mapping = Object.entries(data.mapping).map(([card, gitea]) => `  ${card} → ${gitea}`).join('\n')
        return [{ type: 'text', text: `Task Tracker Sync: contract ${data.contract}\nStatus mapping:\n${mapping}` }]
      }
      if (data.count != null && Array.isArray(data.cards)) {
        return [{ type: 'text', text: `Task Tracker Sync: ${data.count} card(s) exported.` }]
      }
      if (data.card && data.giteaResult !== undefined) {
        return [{ type: 'text', text: `Task Tracker Sync: card ${data.card.id || data.card.number || ''} synced${data.synced ? '' : ' (not persisted)'}.` }]
      }
      if (data.state !== undefined && data.targetLabel !== undefined) {
        const label = data.targetLabel ? `, target label ${data.targetLabel}` : ''
        return [{ type: 'text', text: `Task Tracker Convert: #${data.number ?? '?'} "${data.title || ''}" → state ${data.state}${label}${data.externalRef ? `, ref ${data.externalRef}` : ''}` }]
      }
      return [{ type: 'text', text: 'Task Tracker Sync: no cards processed.' }]
    }
    if (name === 'gitea_memory_brain_sync') {
      return [{ type: 'text', text: `Memory Brain Sync: Fact prepared for ${data.category} in project ${data.project}.` }]
    }
    if (name === 'gitea_incident_report') {
      // #29: a dry run is a preview, never "Created".
      const labels = Array.isArray(data.labels) && data.labels.length > 0 ? ` with labels [${data.labels.join(', ')}]` : ''
      if (data.dryRun) {
        const body = data.body ? `\n\n${String(data.body).slice(0, 1500)}` : ''
        return [{ type: 'text', text: `Incident Ticket (dry-run): would create "${data.title}"${labels} — pass dry_run:false to file it.${body}` }]
      }
      const issue = data.issue || {}
      const number = issue.number
      const url = issue.html_url ? `\n${issue.html_url}` : ''
      return [{ type: 'text', text: `Incident Ticket: Created${number ? ` #${number}` : ''} "${data.title}" (sanitized).${url}` }]
    }
    if (name === 'gitea_release_assistant') {
      // #31: validate_semver / preview_notes return different payloads than
      // preflight; do not answer every action with "Preflight complete".
      if (Array.isArray(data.checks)) {
        const passed = data.checks.filter((c) => c.ok).length + '/' + data.checks.length
        return [{ type: 'text', text: `Release Assistant: Preflight ${passed} passed.` }]
      }
      if (data.notes && typeof data.notes === 'object') {
        const langs = [['en', 'English'], ['ru', 'Russian'], ['zh', 'Chinese']]
        const blocks = langs
          .filter(([key]) => data.notes[key])
          .map(([key, label]) => `--- ${label} ---\n${String(data.notes[key]).slice(0, 1500)}`)
        return [{ type: 'text', text: `Release Assistant: Notes for v${data.targetVersion} (${data.currentVersion} → ${data.targetVersion})\n\n${blocks.join('\n\n')}` }]
      }
      if (data.current !== undefined || data.next !== undefined || data.ok === false) {
        if (data.ok === false) {
          return [{ type: 'text', text: `Release Assistant: invalid version — ${data.error || 'validation failed'}` }]
        }
        return [{ type: 'text', text: `Release Assistant: valid ${data.bumpType || 'version'} bump from ${data.current} to ${data.next}.` }]
      }
      return [{ type: 'text', text: 'Release Assistant: no result returned for this action.' }]
    }
    if (name === 'gitea_merge_readiness' || name === 'gitea_auto_merge') {
      if (data.merged) {
        // #38: a merged PR is done, not "NOT ready".
        const when = data.mergedAt ? ` at ${data.mergedAt}` : ''
        const link = data.url ? ` (${data.url})` : ''
        return [{ type: 'text', text: data.alreadyMerged
          ? `PR #${data.number} is already merged${when}; no merge needed.${link}`
          : `PR #${data.number} merged${when}.${link}` }]
      }
      const readyStr = data.ready ? 'READY to merge' : 'NOT ready to merge'
      const mergedStr = data.needConfirm ? ' (Awaiting confirmation)' : ''
      const checkLines = Array.isArray(data.checks)
        ? data.checks.map((c) => `  - [${c.status === 'pass' ? 'x' : ' '}] ${c.name}: ${c.detail || c.status}`).join('\n')
        : ''
      return [{ type: 'text', text: `PR #${data.number} Merge Readiness: ${readyStr}${mergedStr}${checkLines ? '\nChecks:\n' + checkLines : ''}` }]
    }
    if (name === 'gitea_project_health') {
      const score = data.healthScore != null ? `Health Score: ${data.healthScore}/100` : 'Repository Health Report'
      // #19: errors are prefixed by source (`issues:`, `pulls:`, `security:`).
      // Do not let "unprotected" match /pr/.
      const hasIssueErr = Array.isArray(data.errors) && data.errors.some((e) => /^issues?:/i.test(String(e)))
      const hasPullErr = Array.isArray(data.errors) && data.errors.some((e) => /^pulls?:/i.test(String(e)))
      const openIssues = hasIssueErr ? 'unknown (API error)' : (data.openIssues ?? data.issues?.open ?? 0)
      const openPRs = hasPullErr ? 'unknown (API error)' : (data.openPRs ?? data.pulls?.open ?? 0)
      const staleIssues = Array.isArray(data.staleIssues) ? data.staleIssues.length : 0
      const trunc = data.truncated ? ' (sample truncated)' : ''
      const errNote = Array.isArray(data.errors) && data.errors.length ? `\nErrors: ${data.errors.join('; ')}` : ''
      return [{ type: 'text', text: `${score}${trunc}\nOpen Issues: ${openIssues} (${staleIssues} stale), Open PRs: ${openPRs}${errNote}` }]
    }
    if (name === 'gitea_triage_digest') {
      const stale = Array.isArray(data.staleIssues) ? data.staleIssues.length : (data.staleCount ?? 0)
      const noReview = Array.isArray(data.pullRequestsNoReview) ? data.pullRequestsNoReview.length : 0
      const trunc = data.truncated ? ' (sample truncated)' : ''
      const action = data.priorityAction ? `\nPriority: ${data.priorityAction}` : ''
      return [{ type: 'text', text: `Triage Digest${trunc}: ${noReview} PRs awaiting review, ${stale} stale issues.${action}` }]
    }
    if (name === 'gitea_review_inbox') {
      const count = Array.isArray(data.reviews || data.pulls || data.items) ? (data.reviews || data.pulls || data.items).length : (data.count ?? 0)
      return [{ type: 'text', text: `Review Inbox: ${count} pending item(s).` }]
    }
    if (name === 'gitea_repo_analytics') {
      const issuesCount = data.issues?.total ?? (data.totalIssues ?? 0)
      const pullsCount = data.pulls?.total ?? (data.totalPulls ?? 0)
      const trunc = data.truncated ? ' (sample truncated)' : ''
      return [{ type: 'text', text: `Repo Analytics${trunc}: ${issuesCount} issues, ${pullsCount} pull requests analyzed.` }]
    }
    if (name === 'gitea_pr_impact') {
      const files = data.filesCount ?? (Array.isArray(data.files) ? data.files.length : 0)
      const risk = data.riskLevel || data.risk || 'standard'
      return [{ type: 'text', text: `PR #${data.number || ''} Impact Analysis: risk=${risk}, ${files} file(s) affected.` }]
    }
    if (name === 'gitea_label_bootstrap') {
      // #8: a dry run returns `missing` (nothing is `created` yet); the old
      // formatter counted `created`, so the preview always said 0.
      const taxonomy = data.taxonomy || 'house'
      if (data.dryRun) {
        const missing = Array.isArray(data.missing) ? data.missing : []
        if (missing.length === 0) {
          return [{ type: 'text', text: `Label Bootstrap (dry-run, ${taxonomy}): 0 label(s) missing — repository already has all ${data.total ?? ''} labels.` }]
        }
        const lines = missing.map((label) => `  - ${label.name}`)
        return [{ type: 'text', text: `Label Bootstrap (dry-run, ${taxonomy}): ${missing.length} of ${data.total ?? '?'} label(s) missing:\n${lines.join('\n')}` }]
      }
      const created = Array.isArray(data.created) ? data.created : []
      const failed = Array.isArray(data.failed) ? data.failed : []
      let out = `Label Bootstrap (${taxonomy}): ${created.length} label(s) created`
      if (created.length > 0) out += `:\n${created.map((name) => `  - ${name}`).join('\n')}`
      if (failed.length > 0) out += `\nFailed (${failed.length}):\n${failed.map((f) => `  - ${f.name}: ${f.error}`).join('\n')}`
      return [{ type: 'text', text: out }]
    }
    if (name === 'gitea_reactions') {
      if (Array.isArray(data)) {
        if (data.length === 0) return [{ type: 'text', text: 'No reactions.' }]
        const counts = {}
        for (const r of data) {
          const c = r.content || 'heart'
          counts[c] = (counts[c] || 0) + 1
        }
        const summary = Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join(', ')
        return [{ type: 'text', text: summary }]
      }
      return [{ type: 'text', text: data.content ? `Reaction ${data.content}.` : 'Reaction updated.' }]
    }
    if (name === 'gitea_issue_timeline' && Array.isArray(data)) {
      if (data.length === 0) return [{ type: 'text', text: 'Timeline is empty.' }]
      // #34: timeline rows carry a per-type payload; body alone loses it.
      const summary = data.map((ev) => {
        const who = ev.user_login || ev.user?.login || 'system'
        const when = ev.created_at ? ` (${ev.created_at})` : ''
        let what = ev.body || ev.comment?.body || ''
        switch (ev.type) {
          case 'label':
            what = ev.label?.name ? `${ev.removed_label ? 'removed' : 'added'} ${ev.label.name}` : what
            break
          case 'change_title':
            what = `${ev.old_title || '?'} → ${ev.new_title || '?'}`
            break
          case 'milestone':
            what = ev.milestone?.title || what
            break
          case 'assignees':
            what = ev.assignee?.login ? `${ev.removed_assignee ? 'removed' : 'added'} @${ev.assignee.login}` : what
            break
          case 'reaction':
            what = ev.reaction || what
            break
          default:
            break
        }
        const suffix = what ? `: ${what}` : ''
        return `[${ev.type || 'event'}] by ${who}${when}${suffix}`.trim()
      }).join('\n')
      return [{ type: 'text', text: summary }]
    }
    if (name === 'gitea_code_search' && Array.isArray(data.items)) {
      if (data.items.length === 0) return [{ type: 'text', text: 'No matches.' }]
      const rows = data.items.slice(0, MAX_LIST_ROWS).map((match) => match.raw
        ? String(match.raw)
        : `${match.path}:${match.line ?? '?'}: ${String(match.text || '').trim().slice(0, 200)}`)
      const footer = data.truncated ? `\n… showing ${data.items.length} of ${data.total_count ?? '?'} matches` : ''
      return [{ type: 'text', text: rows.join('\n') + footer }]
    }
    if (name === 'gitea_repo_compare') {
      const files = Array.isArray(data.files) ? data.files : []
      const commits = Array.isArray(data.commits) ? data.commits : []
      if (files.length === 0 && commits.length === 0) {
        return [{ type: 'text', text: 'Compare: No changes.' }]
      }
      const lines = [`Compare: ${commits.length} commit(s), ${files.length} file(s) (ahead ${data.ahead_by ?? '?'}, behind ${data.behind_by ?? '?'})`]
      for (const file of files.slice(0, MAX_LIST_ROWS)) {
        const name = file.filename || file.previous_filename || '?'
        const stat = file.additions != null || file.deletions != null ? ` (+${file.additions ?? 0}/-${file.deletions ?? 0})` : ''
        lines.push(`  ${name}${stat}`)
      }
      return [{ type: 'text', text: lines.join('\n') }]
    }
    if (name === 'gitea_issue_duplicates') {
      const candidates = Array.isArray(data.candidates) ? data.candidates : []
      if (candidates.length === 0) {
        return [{ type: 'text', text: `No likely duplicates (${data.total ?? 0} issue(s) searched, threshold ${data.threshold ?? 0.3}).` }]
      }
      const lines = candidates.map((c) => {
        const score = Number(c.score)
        const reason = c.reason ? `; ${c.reason}` : ''
        return `  - #${c.number} "${c.title}" (score ${Number.isFinite(score) ? score.toFixed(2) : c.score}${reason})`
      })
      return [{ type: 'text', text: `Likely duplicates (${data.total ?? 0} issue(s) searched, threshold ${data.threshold ?? 0.3}):\n${lines.join('\n')}` }]
    }
    if (name === 'gitea_pr_diff') {
      if (data.stat || data.filesCount !== undefined) {
        return [{ type: 'text', text: `PR #${data.number}: ${data.filesCount} files changed (+${data.additions}, -${data.deletions})` }]
      }
      return [{ type: 'text', text: data.diff || 'Empty diff' }]
    }
    // #7: the label list must expose the numeric id that `action: "set"`
    // consumes; a created label echoes its id as well.
    if (name === 'gitea_labels') {
      if (Array.isArray(data)) {
        if (data.length === 0) return [{ type: 'text', text: 'No labels.' }]
        const lines = data.slice(0, MAX_LIST_ROWS).map(formatLabelLine)
        return [{ type: 'text', text: lines.join('\n') + listFooter(data.length) }]
      }
      if (data?.id != null && data?.name != null) {
        return [{ type: 'text', text: `Label "${data.name}" created (id ${data.id}).` }]
      }
    }
    if (Array.isArray(data)) {
      if (name === 'gitea_issue_comments' || name === 'gitea_issue_get_comments') {
        if (data.length === 0) return [{ type: 'text', text: 'No comments found.' }]
        const comments = data.map((c) => {
          const author = c?.user?.login || c?.user_login || c?.user || c?.login || 'unknown'
          const mineTag = c?.mine ? ' (you)' : ''
          const body = c?.body || ''
          const created = c?.created_at ? ` (${c.created_at})` : ''
          return `**${author}**${mineTag}${created}:\n${body}`
        }).join('\n\n---\n\n')
        return [{ type: 'text', text: comments }]
      }
      if (data.length === 0) {
        return [{ type: 'text', text: EMPTY_LIST_MESSAGES[name] || 'No results.' }]
      }
      if (name === 'gitea_wiki') {
        // #10: get/update/delete address a page by its slug (`sub_url`), which
        // Forgejo may derive differently from the display title (e.g. `.-`).
        const pages = data.slice(0, MAX_LIST_ROWS).map((page) => {
          const title = page?.title || page?.sub_url || '(untitled)'
          return page?.sub_url ? `${title} (pageName: ${page.sub_url})` : title
        })
        return [{ type: 'text', text: pages.join('\n') + listFooter(data.length) }]
      }
      if (name === 'gitea_webhooks') {
        const hooks = data.slice(0, MAX_LIST_ROWS).map((hook) => `#${hook.id} [${hook.type || 'gitea'}] ${hook.active === false ? 'inactive' : 'active'}`)
        return [{ type: 'text', text: `Webhooks (${data.length}):\n  ${hooks.join('\n  ')}${listFooter(data.length)}` }]
      }
      if (name === 'gitea_repo_commits') {
        const commits = data.slice(0, MAX_LIST_ROWS).map((commit) => {
          const sha = String(commit.sha || '').slice(0, 8)
          const message = String(commit.commit?.message || '').split('\n')[0]
          const author = commit.commit?.author?.name || commit.author?.login || '?'
          const date = String(commit.commit?.author?.date || '').slice(0, 10)
          return `${sha} ${message} (${author}${date ? `, ${date}` : ''})`.trim()
        })
        return [{ type: 'text', text: commits.join('\n') + listFooter(data.length) }]
      }
      if (name === 'gitea_pr_files') {
        const files = data.slice(0, MAX_LIST_ROWS).map((file) => `${file.filename} (+${file.additions ?? 0}/-${file.deletions ?? 0})${file.status ? ` [${file.status}]` : ''}`)
        return [{ type: 'text', text: files.join('\n') + listFooter(data.length) }]
      }
      if (name === 'gitea_code_search') {
        const rows = data.slice(0, MAX_LIST_ROWS).map((match) => match.raw
          ? String(match.raw)
          : `${match.path}:${match.line ?? '?'}: ${String(match.text || '').trim().slice(0, 200)}`)
        return [{ type: 'text', text: rows.join('\n') + listFooter(data.length) }]
      }
      if (name === 'gitea_ci') {
        const runs = data.slice(0, MAX_LIST_ROWS).map((run) => `#${run.id} ${run.title || run.name || ''} [${run.status || '?'}${run.conclusion ? `/${run.conclusion}` : ''}] ${run.head_branch || ''} ${String(run.head_sha || '').slice(0, 8)}`)
        return [{ type: 'text', text: `CI Runs (${data.length}):\n${runs.join('\n')}${listFooter(data.length)}` }]
      }
      if (name === 'gitea_notifications') {
        const rows = data.slice(0, MAX_LIST_ROWS).map((notification) => {
          const repo = notification.repository?.full_name || notification.repository?.name || 'repo'
          const subject = notification.subject?.title || '(no subject)'
          const kind = notification.subject?.type || '?'
          const reason = notification.reason ? `, ${notification.reason}` : ''
          const when = notification.updated_at ? ` (${notification.updated_at})` : ''
          return `${notification.unread ? '• ' : '  '}${repo} — ${subject} [${kind}${reason}]${when}`
        })
        return [{ type: 'text', text: rows.join('\n') + listFooter(data.length) }]
      }
      if (name === 'gitea_user_search' || (name === 'gitea_org' && data.every((item) => item?.login))) {
        const users = data.slice(0, MAX_LIST_ROWS).map((user) => `${user.login}${user.full_name ? ` (${user.full_name})` : ''}${user.html_url ? ` — ${user.html_url}` : ''}`)
        return [{ type: 'text', text: users.join('\n') + listFooter(data.length) }]
      }
      const lines = data.slice(0, MAX_LIST_ROWS).map((item) => {
        if (item?.number != null) return `#${item.number} ${item.title || ''}`.trim()
        if (item?.path != null) return `${item.branch || ''} ${item.path}`.trim()
        if (item?.name != null) return item.name
        return clipSnippet(item)
      })
      return [{ type: 'text', text: lines.join('\n') + listFooter(data.length) }]
    }
    if (name === 'gitea_wiki') {
      // #10: create/update/delete echo what changed; get stays metadata-only.
      const title = data.title || data.pageName || 'untitled page'
      if (data.action === 'wiki_created') {
        return [{ type: 'text', text: `Wiki page created: ${title}${data.html_url ? `\nURL: ${data.html_url}` : ''}` }]
      }
      if (data.action === 'wiki_updated') {
        return [{ type: 'text', text: `Wiki page updated: ${title}${data.html_url ? `\nURL: ${data.html_url}` : ''}` }]
      }
      if (data.deleted) {
        return [{ type: 'text', text: `Wiki page deleted: ${data.pageName || title}` }]
      }
      // #4: the REST API returns page metadata only. Never answer with a bare
      // identifier: name the page, link it, and say plainly where the body is.
      const lines = [`Wiki page: ${title}`]
      if (data.sub_url) lines.push(`Slug: ${data.sub_url}`)
      if (data.html_url) lines.push(`URL: ${data.html_url}`)
      if (data.last_commit) {
        const sha = data.last_commit.sha ? String(data.last_commit.sha).slice(0, 8) : ''
        const message = data.last_commit.message ? String(data.last_commit.message).split('\n')[0] : ''
        const summary = [sha, message].filter(Boolean).join(' ')
        if (summary) lines.push(`Last commit: ${summary}`)
      }
      lines.push('Content: not available from the REST API; clone <owner>/<repo>.wiki.git to read the body.')
      return [{ type: 'text', text: lines.join('\n') }]
    }
    if (name === 'gitea_issue_comment_update') return [{ type: 'text', text: 'Comment updated.' }]
    if (name === 'gitea_issue_comment_delete') {
      if (data?.dryRun) {
        return [{
          type: 'text',
          text: `[DRY-RUN] Comment #${data.commentId} in ${data.owner}/${data.repo} by @${data.author} (${data.createdAt}): "${data.preview}"\nPass confirm: true to permanently delete.`,
        }]
      }
      if (data?.deleted) {
        return [{
          type: 'text',
          text: `Deleted comment #${data.commentId} by @${data.author} (${data.createdAt}): "${data.preview}"`,
        }]
      }
      return [{ type: 'text', text: 'Comment deleted.' }]
    }
    if (name === 'gitea_repo_contents') {
      // #3: the API returns base64 content for files (an array for directories,
      // handled above). Render the body — not the path — and cap it so a huge
      // file cannot flood the tool response.
      const path = data.path || '(root)'
      const meta = []
      if (data.size != null) meta.push(`${data.size} bytes`)
      if (data.encoding) meta.push(`encoding: ${data.encoding}`)
      const links = []
      if (data.html_url) links.push(`URL: ${data.html_url}`)
      if (data.download_url) links.push(`Download: ${data.download_url}`)
      const hasContent = typeof data.content === 'string'
      let body = ''
      if (hasContent && data.content.length > 0) {
        if (data.encoding === 'base64') {
          try {
            body = Buffer.from(data.content.replace(/\s+/g, ''), 'base64').toString('utf8')
          } catch {
            body = ''
          }
        } else {
          body = data.content
        }
      }
      const MAX_FILE_CHARS = 20_000
      const truncated = body.length > MAX_FILE_CHARS
      if (truncated) body = body.slice(0, MAX_FILE_CHARS)
      let out = `File: ${path}${meta.length ? ` (${meta.join(', ')})` : ''}`
      if (links.length > 0) out += `\n${links.join('\n')}`
      if (body) out += `\n\n${body}`
      if (truncated) {
        out += `\n\n… [truncated: showing the first ${MAX_FILE_CHARS} characters; download the full file${data.download_url ? ` at ${data.download_url}` : ''}]`
      } else if (!hasContent) {
        out += '\n\n(no content returned by the API)'
      } else if (!body) {
        out += '\n\n(empty file)'
      }
      return [{ type: 'text', text: out }]
    }
    if (data.login) return [{ type: 'text', text: data.login }]
    if (data.path) return [{ type: 'text', text: data.path }]
    if (name === 'gitea_issue_get' && data.number != null) {
      const title = data.title ? ` "${data.title}"` : ''
      let out = `#${data.number}${title}`
      if (data.state) out += ` [${data.state}]`
      if (data.body) out += `\n\n**Description:**\n${data.body}`
      if (Array.isArray(data.comments) && data.comments.length > 0) {
        const comments = data.comments.map((c) => {
          const author = c?.user?.login || c?.user || c?.login || 'unknown'
          const text = c?.body || ''
          return `**${author}:** ${text}`
        }).join('\n\n')
        out += `\n\n**Comments (${data.comments.length}):**\n${comments}`
      }
      return [{ type: 'text', text: out }]
    }
    if (name === 'gitea_issue_comment') {
      const issueRef = data?.issue_number ? ` on #${data.issue_number}` : ''
      const commentId = data?.id ? ` (comment #${data.id})` : ''
      const author = data?.user?.login ? ` by @${data.user.login}` : ''
      return [{ type: 'text', text: `Comment posted${issueRef}${commentId}${author}.` }]
    }
    if (name === 'gitea_pr_get' && data.number != null) {
      // #23: a merged PR is still a PR; do not collapse it to a merge notice.
      const title = data.title ? ` "${data.title}"` : ''
      const state = data.merged ? 'merged' : (data.state || 'open')
      let out = `#${data.number}${title} [${state}]`
      const author = data.user_login || data.user?.login || data.author?.login
      if (author) out += ` by @${author}`
      const head = data.head?.ref || (typeof data.head === 'string' ? data.head : '')
      const base = data.base?.ref || (typeof data.base === 'string' ? data.base : '')
      if (head || base) out += `\n${head || '?'} → ${base || '?'}`
      if (data.html_url) out += `\nURL: ${data.html_url}`
      if (data.merged_at) out += `\nMerged at: ${data.merged_at}`
      if (data.body) {
        const body = String(data.body)
        out += `\n\n${body.length > 2000 ? body.slice(0, 2000) + '…' : body}`
      }
      return [{ type: 'text', text: out }]
    }
    if (name === 'gitea_pr_merge_status') {
      const prNum = data.number != null ? `PR #${data.number}` : 'PR'
      if (data.merged) {
        return [{ type: 'text', text: `${prNum} is already merged.` }]
      }
      if (data.mergeable) {
        return [{ type: 'text', text: `${prNum} is open and ready to merge (no conflicts detected).` }]
      }
      return [{ type: 'text', text: `${prNum} cannot be merged automatically (conflicts or checks pending).` }]
    }
    if (name === 'gitea_pr_merge' || name === 'gitea_auto_merge') {
      const prNum = data?.number != null ? ` #${data.number}` : ''
      return [{ type: 'text', text: `Pull request${prNum} merged.` }]
    }
    if (name === 'gitea_issue_create' && data.number != null) {
      // #6: echo what was actually attached, so a dropped label is visible.
      const labels = Array.isArray(data.labels)
        ? data.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean)
        : []
      const bits = [`#${data.number}${data.title ? ` "${data.title}"` : ''} opened`]
      if (labels.length > 0) bits.push(`with labels [${labels.join(', ')}]`)
      const assignee = typeof data.assignee === 'string' ? data.assignee : data.assignee?.login
      if (assignee) bits.push(`assigned to @${assignee}`)
      const milestone = data.milestone
      if (milestone) {
        const id = typeof milestone === 'object' ? (milestone.number ?? milestone.id) : milestone
        const title = typeof milestone === 'object' && milestone.title ? ` (${milestone.title})` : ''
        bits.push(`milestone #${id}${title}`)
      }
      return [{ type: 'text', text: bits.join(' ') }]
    }
    if (name === 'gitea_webhooks' && data.id != null) {
      return [{ type: 'text', text: `Webhook #${data.id} created (type ${data.type || 'gitea'}).` }]
    }
    if (data.number != null) {
      const title = data.title ? ` "${data.title}"` : ''
      return [{ type: 'text', text: `#${data.number}${title}` }]
    }
    if (name === 'gitea_mirror_sync_status') {
      const msg = data.message || `Mirror status: ${data.status}`
      const lagText = data.lag > 0 ? ` (lag: ${data.lag} commit(s))` : ''
      return [{ type: 'text', text: `🪞 ${msg}${lagText}` }]
    }
    if (name === 'gitea_webhook_sandbox') {
      if (data.replayed) {
        return [{ type: 'text', text: `Webhook replayed: event ${data.eventType || 'unknown'}` }]
      }
      if (data.entries) {
        return [{ type: 'text', text: `Webhook Sandbox (${data.entries.length} events buffered)` }]
      }
      return [{ type: 'text', text: 'Webhook sandbox operation completed.' }]
    }
  }

  // #5: never answer a bare `OK`. An empty successful response is `Done.`;
  // anything else is described, so "nothing happened" cannot be mistaken for
  // "the call did something".
  if (data === undefined || data === null) {
    return [{ type: 'text', text: 'Done.' }]
  }
  if (typeof data === 'string') {
    return [{ type: 'text', text: data || 'Done.' }]
  }
  if (typeof data === 'object') {
    return [{ type: 'text', text: describeUnknownObject(data) }]
  }
  return [{ type: 'text', text: String(data) }]
}
