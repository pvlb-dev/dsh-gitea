/**
 * gitea_merge_readiness: checks PR readiness for merge.
 * Read-only report: pass/fail/unknown.
 */

const CHECK_NAMES = ['description', 'conflicts', 'approval', 'ci', 'tests', 'migrations']

export async function checkMergeReadiness(args = {}, deps = {}) {
  const client = deps.client
  const owner = args.owner
  const repo = args.repo
  const number = Number(args.number)

  const [prRes, reviewsRes, filesRes] = await Promise.all([
    client.getPull(owner, repo, number).catch((e) => ({ ok: false, error: String(e) })),
    client.listPullReviews(owner, repo, number, {}).catch((e) => ({ ok: false, error: String(e) })),
    client.listPullFiles(owner, repo, number, {}).catch((e) => ({ ok: false, error: String(e) })),
  ])

  const pr = prRes?.ok ? prRes.data : null
  const checks = []
  const notes = []

  // #38: a merged PR is done, not blocked. Skip the open-PR merge checks and
  // report the merge state so callers cannot mistake it for "not ready".
  if (pr && (pr.merged === true || pr.merged_at)) {
    return {
      ok: true,
      data: {
        number,
        merged: true,
        alreadyMerged: true,
        mergedAt: pr.merged_at || null,
        url: pr.html_url || null,
        ready: false,
        checks: [],
        notes: ['Pull request is already merged; merge checks skipped.'],
      },
    }
  }

  // description
  if (!pr) {
    checks.push({ name: 'description', status: 'unknown', detail: 'PR not accessible' })
  } else if (pr.body && String(pr.body).trim().length >= 10) {
    checks.push({ name: 'description', status: 'pass', detail: 'Description provided' })
  } else {
    checks.push({ name: 'description', status: 'fail', detail: 'Description empty or too short' })
  }

  // conflicts
  if (!pr) {
    checks.push({ name: 'conflicts', status: 'unknown', detail: 'n/a' })
  } else if (pr.mergeable === true) {
    checks.push({ name: 'conflicts', status: 'pass', detail: 'No merge conflicts' })
  } else if (pr.mergeable === false) {
    checks.push({ name: 'conflicts', status: 'fail', detail: 'Merge conflicts present' })
  } else {
    checks.push({ name: 'conflicts', status: 'unknown', detail: 'Mergeable status unknown' })
  }

  // approval (#284: inspect latest non-dismissed review per author; REQUEST_CHANGES blocks; stale/commit_id blocks)
  const reviews = reviewsRes?.ok && Array.isArray(reviewsRes.data) ? reviewsRes.data : []
  if (!reviewsRes?.ok) {
    checks.push({ name: 'approval', status: 'unknown', detail: 'Reviews not accessible' })
  } else {
    // Sort reviews chronologically ascending so that later events overwrite earlier ones deterministically
    const sortedReviews = [...reviews].sort((a, b) => {
      const ta = new Date(a?.submitted_at || a?.created_at || a?.updated_at || 0).getTime()
      const tb = new Date(b?.submitted_at || b?.created_at || b?.updated_at || 0).getTime()
      return ta - tb
    })

    const latestByAuthor = new Map()
    for (const r of sortedReviews) {
      if (!r) continue
      const author = String(r.user?.login || r.user?.username || r.user_login || r.user?.id || 'reviewer')
      if (r.state === 'DISMISSED' || r.dismissed === true) {
        latestByAuthor.set(author, { state: 'DISMISSED', dismissed: true })
        continue
      }
      const isStale = r.stale === true || Boolean(r.commit_id && pr?.head?.sha && r.commit_id !== pr.head.sha)
      latestByAuthor.set(author, { ...r, isStale })
    }

    const latestDecisions = Array.from(latestByAuthor.values())
    const hasChangesRequested = latestDecisions.some((r) => r.state === 'REQUEST_CHANGES')
    const hasApproved = latestDecisions.some((r) => r.state === 'APPROVED' && !r.isStale && !r.dismissed)

    if (hasChangesRequested) {
      checks.push({ name: 'approval', status: 'fail', detail: 'Changes requested by reviewer(s)' })
    } else if (hasApproved) {
      checks.push({ name: 'approval', status: 'pass', detail: 'Approved review present' })
    } else {
      const hasStaleApproval = latestDecisions.some((r) => r.state === 'APPROVED' && r.isStale)
      checks.push({
        name: 'approval',
        status: 'fail',
        detail: hasStaleApproval ? 'Approval is stale for current commit' : 'No approved review',
      })
    }
  }

  // CI checks (#283: check commit status and actions runs for head SHA; fail-closed on API errors)
  const headSha = pr?.head?.sha
  let ciStatus = 'pass'
  let ciDetail = 'No CI checks reported'

  if (pr && headSha && client) {
    try {
      const [statusRes, runsRes] = await Promise.all([
        typeof client.getCombinedCommitStatus === 'function'
          ? client.getCombinedCommitStatus(owner, repo, headSha).catch(() => ({ ok: false, error: 'request_failed' }))
          : Promise.resolve({ ok: false, notSupported: true }),
        typeof client.listActionsRuns === 'function'
          ? client.listActionsRuns(owner, repo, { limit: 20 }).catch(() => ({ ok: false, error: 'request_failed' }))
          : Promise.resolve({ ok: false, notSupported: true }),
      ])

      const statusApiAvailable = statusRes?.ok === true
      const runsApiAvailable = runsRes?.ok === true
      const statusApiFailed = !statusApiAvailable && !statusRes?.notSupported
      const runsApiFailed = !runsApiAvailable && !runsRes?.notSupported

      if (statusApiFailed || runsApiFailed) {
        ciStatus = 'unknown'
        ciDetail = 'CI check status could not be verified (API error on CI source)'
      } else {
        const combined = statusApiAvailable && statusRes.data ? statusRes.data : null
        const runsData = runsApiAvailable && runsRes.data
          ? (runsRes.data.workflow_runs || (Array.isArray(runsRes.data) ? runsRes.data : []))
          : []
        const relevantRuns = runsData.filter((r) => r.head_sha === headSha)

        let hasFailure = false
        let hasPending = false
        let hasSuccess = false

        if (combined) {
          if (combined.state === 'failure' || combined.state === 'error') hasFailure = true
          else if (combined.state === 'pending') hasPending = true
          else if (combined.state === 'success') hasSuccess = true
        }

        if (relevantRuns.length > 0) {
          for (const run of relevantRuns) {
            const st = String(run.status || '').toLowerCase()
            const conc = String(run.conclusion || '').toLowerCase()
            if (st === 'failure' || conc === 'failure' || conc === 'cancelled' || conc === 'timed_out') {
              hasFailure = true
            } else if (st === 'running' || st === 'queued' || st === 'waiting' || st === 'in_progress') {
              hasPending = true
            } else if (st === 'success' || conc === 'success') {
              hasSuccess = true
            }
          }
        }

        if (hasFailure) {
          ciStatus = 'fail'
          ciDetail = 'CI checks failed'
        } else if (hasPending) {
          ciStatus = 'pending'
          ciDetail = 'CI checks in progress'
        } else if (hasSuccess) {
          ciStatus = 'pass'
          ciDetail = 'CI checks passed'
        } else {
          ciStatus = 'pass'
          ciDetail = 'No CI checks reported'
        }
      }
    } catch {
      ciStatus = 'unknown'
      ciDetail = 'Failed to inspect CI status'
    }
  } else if (!pr) {
    ciStatus = 'unknown'
    ciDetail = 'PR not accessible'
  }

  checks.push({ name: 'ci', status: ciStatus, detail: ciDetail })

  // tests & migrations from files
  const files = filesRes?.ok && Array.isArray(filesRes.data) ? filesRes.data : []
  if (!filesRes?.ok) {
    checks.push({ name: 'tests', status: 'unknown', detail: 'Changed files not accessible' })
    checks.push({ name: 'migrations', status: 'unknown', detail: 'Changed files not accessible' })
  } else {
    const hasTests = files.some((f) => /test|spec|\.test\./i.test(String(f.filename || '')))
    const isCode = files.some((f) => /\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|c|cpp|h|java|php|rb)$/i.test(String(f.filename || '')))
    const testStatus = hasTests || !isCode ? 'pass' : 'unknown'
    const testDetail = hasTests ? 'Tests updated' : (!isCode ? 'No executable code changed' : 'No test files modified')
    const hasMigrations = files.some((f) => /migration|schema|\.sql$/i.test(String(f.filename || '')))
    checks.push({ name: 'tests', status: testStatus, detail: testDetail })
    const rollbackApproved = args.allowMigrations === true || args.hasRollbackPlan === true || Boolean(pr?.body && /rollback plan/i.test(pr.body))
    const migrationStatus = !hasMigrations ? 'pass' : (rollbackApproved ? 'pass' : 'fail')
    const migrationDetail = !hasMigrations
      ? 'No database migrations'
      : (rollbackApproved ? 'Database migrations detected with rollback plan' : 'Database migrations detected — rollback plan required')
    checks.push({ name: 'migrations', status: migrationStatus, detail: migrationDetail })
  }

  const ready = checks.every((c) => c.status === 'pass')
  return { ok: true, data: { number, ready, checks, notes } }
}

/**
 * gitea_auto_merge: merges PR if merge-gate is green AND confirm: true.
 * Without confirm: returns ready/needConfirm report. Never merges silently.
 */
export async function autoMergeIfReady(args = {}, deps = {}) {
  const client = deps.client
  const owner = args.owner
  const repo = args.repo
  const number = Number(args.number)

  const gate = await checkMergeReadiness({ owner, repo, number }, deps)
  if (!gate.ok) return gate

  // #38: never run the merge path for an already-merged PR.
  if (gate.data.merged) {
    return {
      ok: true,
      data: {
        number,
        ready: false,
        merged: true,
        alreadyMerged: true,
        mergedAt: gate.data.mergedAt,
        url: gate.data.url,
        checks: [],
        notes: gate.data.notes,
      },
    }
  }

  const checks = Array.isArray(gate.data.checks) ? gate.data.checks : []
  const allPass = checks.every((c) => c.status === 'pass')
  const confirm = args.confirm === true

  if (!allPass) {
    return { ok: true, data: { number, ready: false, merged: false, checks: gate.data.checks, notes: gate.data.notes } }
  }
  if (!confirm) {
    return { ok: true, data: { number, ready: true, merged: false, needConfirm: true, checks: gate.data.checks, notes: gate.data.notes } }
  }

  const merged = await client.mergePull(owner, repo, number, { Do: 'merge' }).catch((e) => ({ ok: false, error: String(e) }))
  if (!merged?.ok) return { ok: false, error: merged?.error || 'merge failed' }
  return { ok: true, data: { number, ready: true, merged: true, checks: gate.data.checks, notes: gate.data.notes } }
}
