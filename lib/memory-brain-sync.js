export function formatReleaseMemory({ repo, tag, releaseNotes, version }) {
  const content = [
    `Release ${tag || version} for ${repo} completed.`,
    releaseNotes ? `\n\nRelease notes:\n${releaseNotes}` : '',
  ].join('').trim()

  return {
    content,
    category: 'release',
    action_type: 'commit',
    action_outcome: 'success',
    project: repo || 'dsh-gitea',
    importance: 0.95,
    permanent: true,
    source: 'dsh-gitea',
    reason: `Automated release memory for ${tag || version}`,
  }
}

export function formatPullRequestMemory({ repo, pr, summary }) {
  const prNum = pr?.number ?? pr?.index ?? 'unknown'
  const title = pr?.title || ''
  const content = [
    `Pull Request #${prNum} (${title}) merged into ${repo}.`,
    summary ? `\n\nSummary:\n${summary}` : '',
  ].join('').trim()

  return {
    content,
    category: 'feature',
    action_type: 'review',
    action_outcome: 'success',
    project: repo || 'dsh-gitea',
    importance: 0.8,
    permanent: false,
    source: 'dsh-gitea',
    reason: `Merged pull request #${prNum}`,
  }
}

export async function runMemoryBrainSync(args = {}, deps = {}) {
  const action = args.action || 'format'
  const repo = String(args.repo || deps.settings?.defaultRepo || 'dsh-gitea').trim()

  // #22: `format` is advertised and is the default action. It formats an
  // auto-detected fact without persisting anything.
  if (action === 'format') {
    const memory = (args.type === 'pr' || args.pr || args.pr_number)
      ? formatPullRequestMemory({ repo, pr: args.pr || { number: args.pr_number, title: args.title }, summary: args.summary })
      : formatReleaseMemory({ repo, tag: args.tag, version: args.version, releaseNotes: args.release_notes || args.notes })
    return { ok: true, data: { ...memory, persisted: false, synced: false } }
  }

  if (action === 'release_fact') {
    const memory = formatReleaseMemory({
      repo,
      tag: args.tag,
      version: args.version,
      releaseNotes: args.release_notes || args.notes,
    })
    return { ok: true, data: memory }
  }

  if (action === 'pr_fact') {
    const memory = formatPullRequestMemory({
      repo,
      pr: args.pr || { number: args.pr_number, title: args.title },
      summary: args.summary,
    })
    return { ok: true, data: memory }
  }

  if (action === 'remember' || action === 'sync' || args.sync === true) {
    const memory = (args.type === 'pr' || args.pr || args.pr_number)
      ? formatPullRequestMemory({ repo, pr: args.pr || { number: args.pr_number, title: args.title }, summary: args.summary })
      : formatReleaseMemory({ repo, tag: args.tag, version: args.version, releaseNotes: args.release_notes || args.notes })
    const mb = deps.memoryBrain || deps.services?.['memory-brain']
    if (!mb || typeof mb.remember !== 'function') {
      return { ok: false, error: 'Memory Brain service not connected or available in environment', data: { ...memory, persisted: false, synced: false } }
    }
    try {
      const memRes = await mb.remember(memory)
      if (memRes && memRes.ok === false) {
        return { ok: false, error: memRes.error || 'Failed to persist memory fact', data: { ...memory, persisted: false, synced: false } }
      }
      return { ok: true, data: { ...memory, persisted: true, synced: true } }
    } catch (err) {
      return { ok: false, error: String(err?.message || err), data: { ...memory, persisted: false, synced: false } }
    }
  }

  return { ok: false, error: `Unknown memory brain action: ${action}` }
}
