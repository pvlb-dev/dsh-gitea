export function sanitizeIncidentLogs(text = '') {
  return String(text || '')
    .replace(/-----BEGIN (?:[A-Z0-9_\-]+ )?PRIVATE KEY-----[\s\S]+?-----END (?:[A-Z0-9_\-]+ )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/gh[pousr]_[A-Za-z0-9_]{16,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(?:bearer\s+|["']?(?:token|api[_\-]?key|apikey|secret|password|passwd)["']?\s*[:=]\s*)(?:['"][^'"]*['"]|[^\s,;}{]+)/gi, '[REDACTED_CREDENTIAL]')
    .replace(/(?:[0-9a-fA-F]{32,40}|[0-9a-fA-F]{64})/g, (m) => m.slice(0, 4) + '...' + m.slice(-4))
}

export function buildIncidentBody({ service = '', alert = '', errorLogs = '', impact = '', mitigation = '', timeline = '' }) {
  const sService = sanitizeIncidentLogs(service)
  const sAlert = sanitizeIncidentLogs(alert)
  const sLogs = sanitizeIncidentLogs(errorLogs)
  const sImpact = sanitizeIncidentLogs(impact)
  const sMitigation = sanitizeIncidentLogs(mitigation)
  const sTimeline = sanitizeIncidentLogs(timeline)

  const lines = [
    '### Incident Description',
    `**Affected Service**: ${sService || 'Unknown'}`,
    `**Alert Summary**: ${sAlert || 'Production service alert'}`,
    sTimeline ? `**Timeline**: ${sTimeline}` : '',
    sImpact ? `**Impact**: ${sImpact}` : '',
    '',
    '#### Error Logs & Diagnostics',
    '```',
    sLogs || 'No diagnostic logs provided.',
    '```',
    '',
    '### Mitigation & Resolution',
    sMitigation || '- Service investigated; pending diagnostic triage and remediation.',
  ].filter(Boolean)

  return lines.join('\n')
}

export async function runIncidentReport(args = {}, deps = {}) {
  const service = String(args.service || 'System').trim()
  const alert = String(args.alert || args.title || 'Service alert').trim()
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()

  if (!owner || !repo) {
    return { ok: false, error: 'Target owner and repo must be specified or configured.' }
  }

  const rawTitle = `[INCIDENT] ${service}: ${alert}`
  const title = sanitizeIncidentLogs(rawTitle)
  const body = buildIncidentBody({
    service,
    alert,
    errorLogs: args.error_logs || args.logs || '',
    impact: args.impact || '',
    mitigation: args.mitigation || '',
    timeline: args.timeline || '',
  })

  // House labels (the upstream type/incident + priority/critical + status/ready
  // set does not exist on pvlb repos and made real creation fail).
  const labels = ['type/bug', 'priority/now']

  if (args.dry_run === true) {
    return {
      ok: true,
      data: {
        dryRun: true,
        title,
        body,
        labels,
        sanitizedLogs: sanitizeIncidentLogs(args.error_logs || args.logs || ''),
      },
    }
  }

  if (!deps.client || typeof deps.client.createIssue !== 'function') {
    return { ok: false, error: 'Gitea client createIssue not available.' }
  }

  // Resolve label IDs if client supports listLabels. Never send label *names*
  // to Forgejo (the API expects ids); if none resolve, create unlabeled rather
  // than failing the incident report.
  let resolvedLabels = []
  if (typeof deps.client.listLabels === 'function') {
    const listRes = await deps.client.listLabels(owner, repo, { limit: 100 }).catch(() => null)
    if (listRes?.ok && Array.isArray(listRes.data)) {
      const existing = listRes.data
      for (const name of labels) {
        const found = existing.find((l) => String(l.name).toLowerCase() === name.toLowerCase())
        if (found?.id) resolvedLabels.push(found.id)
      }
    }
  }

  const payload = { title, body }
  if (resolvedLabels.length > 0) payload.labels = resolvedLabels
  const res = await deps.client.createIssue(owner, repo, payload)

  if (!res?.ok) {
    return { ok: false, error: res?.error || 'Failed to create incident issue', status: res?.status ?? 0 }
  }

  return {
    ok: true,
    data: {
      issue: res.data,
      title,
      sanitized: true,
    },
  }
}
