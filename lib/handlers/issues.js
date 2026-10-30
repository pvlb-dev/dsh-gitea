import { wrap, pickQuery, asNumber, annotateCommentsWithMine } from './common.js'

const ISSUE_TOOLS = new Set([
  'gitea_labels',
  'gitea_milestones',
  'gitea_issue_create',
  'gitea_issue_list',
  'gitea_issue_get',
  'gitea_issue_comments',
  'gitea_issue_get_comments',
  'gitea_issue_comment',
  'gitea_issue_comment_update',
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
  'gitea_label_bootstrap',
  'gitea_label_auto',
  'gitea_issue_to_pr',
])

export function isIssueTool(name) {
  return ISSUE_TOOLS.has(name)
}

// #6: labels accept names or numeric ids. Resolve names case-insensitively and
// fail loudly on an unknown one instead of opening a silently unlabeled issue.
async function resolveIssueLabelIds(client, owner, repo, labels) {
  if (labels === undefined || labels === null) return { ok: true, ids: undefined }
  if (!Array.isArray(labels)) return { ok: false, error: 'labels must be an array of names or numeric ids.' }
  // Keep the caller's order: classify first, resolve names in one lookup, then
  // walk the original entries again.
  const entries = []
  for (const raw of labels) {
    if (raw === undefined || raw === null || String(raw).trim() === '') continue
    if (typeof raw === 'number' || /^\d+$/.test(String(raw).trim())) {
      entries.push({ kind: 'id', id: Number(typeof raw === 'number' ? raw : String(raw).trim()) })
    } else {
      entries.push({ kind: 'name', name: String(raw).trim() })
    }
  }
  if (entries.length === 0) return { ok: true, ids: undefined }
  let byName = null
  if (entries.some((entry) => entry.kind === 'name')) {
    const res = await client.listLabels(owner, repo, { limit: 100 })
    if (!res?.ok) return { ok: false, error: res?.error || 'could not list labels to resolve names' }
    byName = new Map((Array.isArray(res.data) ? res.data : []).map((label) => [String(label.name).toLowerCase(), label]))
  }
  const ids = []
  const unknown = []
  for (const entry of entries) {
    if (entry.kind === 'id') {
      ids.push(entry.id)
      continue
    }
    const label = byName.get(entry.name.toLowerCase())
    if (label && label.id != null) ids.push(label.id)
    else unknown.push(entry.name)
  }
  if (unknown.length > 0) {
    return { ok: false, error: `unknown label name(s): ${unknown.join(', ')}. Create them first or pass numeric ids.` }
  }
  const unique = [...new Set(ids)]
  return { ok: true, ids: unique.length > 0 ? unique : undefined }
}

export async function handleIssueTool(name, args, deps, ctx) {
  const { client, settings, remoteUrl, owner, repo } = ctx

  if (name === 'gitea_issue_to_pr') {
    const { runIssueToPr } = await import('../issue-to-pr.js')
    return runIssueToPr(args, { ...deps, client, settings, remoteUrl })
  }

  if (name === 'gitea_issue_lint') {
    const { lintIssue } = await import('../issue-lint.js')
    const result = lintIssue({ title: args.title, body: args.body }, { preset: args.preset })
    return { ok: true, data: result }
  }

  if (name === 'gitea_issue_templates') {
    const { listIssueTemplates, validateAllTemplates } = await import('../issue-templates.js')
    const templates = listIssueTemplates(args.dir)
    const validation = validateAllTemplates(args.dir)
    return { ok: true, data: { templates, validation } }
  }

  switch (name) {
    case 'gitea_labels': {
      const action = args.action || 'list'
      if (action === 'list') {
        return wrap(await client.listLabels(owner, repo, pickQuery(args, ['limit', 'page'])))
      }
      if (action === 'create') {
        return wrap(await client.createLabel(owner, repo, {
          name: args.name,
          color: args.color,
          description: args.description,
        }))
      }
      if (action === 'delete') {
        return wrap(await client.deleteLabel(owner, repo, asNumber(args.label_id)))
      }
      if (action === 'set') {
        return wrap(await client.setIssueLabels(owner, repo, asNumber(args.number), (args.labels || []).map(Number)))
      }
      if (action === 'add_to_issue') {
        return wrap(await client.addIssueLabels(owner, repo, asNumber(args.number), (args.labels || []).map(Number)))
      }
      return { ok: false, error: `unknown action: ${action}` }
    }

    case 'gitea_milestones': {
      const action = args.action || 'list'
      if (action === 'list') {
        return wrap(await client.listMilestones(owner, repo, pickQuery(args, ['state', 'limit', 'page'])))
      }
      if (action === 'create') {
        return wrap(await client.createMilestone(owner, repo, {
          title: args.title,
          description: args.description,
          due_on: args.due_on,
        }))
      }
      if (action === 'update') {
        return wrap(await client.updateMilestone(owner, repo, asNumber(args.milestone_id), {
          title: args.title, state: args.state, due_on: args.due_on,
        }))
      }
      if (action === 'delete') {
        if (args.confirm !== true) return { ok: false, error: 'Deleting a milestone requires confirm: true (boolean).' }
        return wrap(await client.deleteMilestone(owner, repo, asNumber(args.milestone_id)))
      }
      return { ok: false, error: `unknown action: ${action}` }
    }

    case 'gitea_issue_create': {
      const resolved = await resolveIssueLabelIds(client, owner, repo, args.labels)
      if (!resolved.ok) return resolved
      const payload = { title: args.title, body: args.body }
      if (resolved.ids) payload.labels = resolved.ids
      if (args.assignee !== undefined && args.assignee !== null && String(args.assignee).trim() !== '') {
        payload.assignee = String(args.assignee).trim()
      }
      if (args.milestone !== undefined && args.milestone !== null && args.milestone !== '') {
        const milestone = Number(args.milestone)
        if (!Number.isFinite(milestone)) return { ok: false, error: 'milestone must be a number.' }
        payload.milestone = milestone
      }
      return wrap(await client.createIssue(owner, repo, payload))
    }
    case 'gitea_issue_list': {
      // The issue-list endpoint accepts a `sort` enum and no `direction`
      // (Forgejo 17 swagger); validate here so the classic surface gets the
      // same clear message the dispatcher's schema check gives.
      const sortValues = ['relevance', 'latest', 'oldest', 'recentupdate', 'leastupdate', 'mostcomment', 'leastcomment', 'nearduedate', 'farduedate']
      const sort = args.sort === undefined || args.sort === null || args.sort === '' ? '' : String(args.sort).toLowerCase()
      if (sort && !sortValues.includes(sort)) {
        return { ok: false, error: `unknown sort "${args.sort}" (accepted: ${sortValues.join(', ')})` }
      }
      const query = pickQuery(args, ['state', 'limit', 'page'])
      if (sort) query.sort = sort
      return wrap(await client.listIssues(owner, repo, query))
    }
    case 'gitea_issue_get': {
      const issue = await client.getIssue(owner, repo, asNumber(args.number))
      if (!issue?.ok) return issue
      if (args.include_comments || args.comments) {
        const comments = await client.listIssueComments(owner, repo, asNumber(args.number), pickQuery(args, ['limit', 'page']))
        if (comments?.ok) {
          await annotateCommentsWithMine(comments.data, client, deps.logger)
          issue.data.comments = comments.data || []
        }
      }
      return wrap(issue)
    }
    case 'gitea_issue_comments':
    case 'gitea_issue_get_comments': {
      const res = await client.listIssueComments(owner, repo, asNumber(args.number), pickQuery(args, ['limit', 'page']))
      if (res?.ok && Array.isArray(res.data)) {
        await annotateCommentsWithMine(res.data, client, deps.logger)
      }
      return wrap(res)
    }
    case 'gitea_issue_comment': {
      const res = await client.commentIssue(owner, repo, asNumber(args.number), args.body)
      if (res?.ok && res?.data && typeof res.data === 'object') {
        res.data.issue_number = asNumber(args.number)
      }
      return wrap(res)
    }
    case 'gitea_issue_comment_update':
      return wrap(await client.updateIssueComment(owner, repo, asNumber(args.id || args.comment_id), args.body))
    case 'gitea_issue_comment_delete': {
      const commentId = asNumber(args.comment_id || args.id)
      if (!commentId) {
        return { ok: false, error: 'comment_id is required and must be a number.' }
      }
      const commentRes = await client.getIssueComment(owner, repo, commentId)
      if (!commentRes?.ok) {
        return wrap(commentRes)
      }
      const comment = commentRes.data || {}
      const author = comment.user?.login || comment.user?.username || comment.user_login || comment.login || ''

      let meLogin = ''
      try {
        const meRes = await client.getUser()
        if (meRes?.ok && meRes.data?.login) {
          meLogin = meRes.data.login
        }
      } catch (err) {
        return { ok: false, error: `Failed to fetch authenticated user: ${err?.message || String(err)}` }
      }

      if (!meLogin) {
        return { ok: false, error: 'Could not determine authenticated user for permission verification.' }
      }

      if (String(author).toLowerCase() !== String(meLogin).toLowerCase()) {
        return {
          ok: false,
          error: `Refusing to delete comment #${commentId} by '${author || 'unknown'}': only comments authored by the authenticated user ('${meLogin}') can be deleted.`,
        }
      }

      const preview = String(comment.body || '').slice(0, 80)
      const createdAt = comment.created_at || ''

      if (!args.confirm) {
        return {
          ok: true,
          data: {
            dryRun: true,
            message: 'Dry-run: pass confirm: true to permanently delete this comment.',
            commentId,
            owner,
            repo,
            author,
            createdAt,
            preview,
          },
        }
      }

      const delRes = await client.deleteIssueComment(owner, repo, commentId)
      if (!delRes?.ok) {
        return wrap(delRes)
      }
      return {
        ok: true,
        data: {
          deleted: true,
          commentId,
          owner,
          repo,
          author,
          createdAt,
          preview,
        },
      }
    }
    case 'gitea_issue_close':
      return wrap(await client.closeIssue(owner, repo, asNumber(args.number)))
    case 'gitea_issue_update':
      return wrap(await client.updateIssue(owner, repo, asNumber(args.number), {
        title: args.title,
        body: args.body,
        state: args.state,
      }))
    case 'gitea_issue_search':
      return wrap(await client.searchIssues(pickQuery(args, ['q', 'repo', 'state', 'limit', 'page', 'type', 'labels'])))
    case 'gitea_issue_set_assignee':
      return wrap(await client.setIssueAssignee(owner, repo, asNumber(args.number), args.assignee))
    case 'gitea_issue_timeline':
      return wrap(await client.getIssueTimeline(owner, repo, asNumber(args.number), pickQuery(args, ['since', 'before', 'limit', 'page'])))
    case 'gitea_reactions': {
      const action = args.action || 'list'
      const target = args.target || (args.comment_id != null ? 'comment' : 'issue')
      if (target === 'comment') {
        const cid = asNumber(args.comment_id || args.id)
        if (action === 'list') {
          return wrap(await client.listCommentReactions(owner, repo, cid, pickQuery(args, ['limit', 'page'])))
        }
        if (action === 'add') {
          return wrap(await client.addCommentReaction(owner, repo, cid, args.content))
        }
        if (action === 'delete') {
          return wrap(await client.deleteCommentReaction(owner, repo, cid, args.content))
        }
      } else {
        const num = asNumber(args.number || args.issue)
        if (action === 'list') {
          return wrap(await client.listIssueReactions(owner, repo, num, pickQuery(args, ['limit', 'page'])))
        }
        if (action === 'add') {
          return wrap(await client.addIssueReaction(owner, repo, num, args.content))
        }
        if (action === 'delete') {
          return wrap(await client.deleteIssueReaction(owner, repo, num, args.content))
        }
      }
      return { ok: false, error: `unknown action: ${action}` }
    }
    case 'gitea_issue_duplicates': {
      const { findDuplicates } = await import('../dup-detect.js')
      return findDuplicates({ owner, repo, title: args.title, body: args.body, threshold: args.threshold }, { client })
    }
    case 'gitea_batch_issue_ops': {
      const { planBatch, applyBatch } = await import('../batch-ops.js')
      if (args.confirm === true || args.apply === true) {
        return applyBatch({ owner, repo, numbers: args.numbers, label: args.label, assignee: args.assignee, milestone: args.milestone }, { client })
      }
      return planBatch({ owner, repo, numbers: args.numbers, label: args.label, assignee: args.assignee, milestone: args.milestone }, { client })
    }
    case 'gitea_label_bootstrap': {
      const { buildLabelPlan, applyLabelPlan } = await import('../label-bootstrap.js')
      const planArgs = { owner, repo, taxonomy: args.taxonomy }
      if (args.confirm === true || args.apply === true) return applyLabelPlan(planArgs, { client })
      return buildLabelPlan(planArgs, { client })
    }
    case 'gitea_issue_flow': {
      const { planIssueFlow, createFlowPr } = await import('../issue-flow.js')
      if (args.action === 'plan') return planIssueFlow({ issue: args.issue, title: args.title, type: args.type })
      if (args.action === 'create') return createFlowPr({ owner, repo, head: args.head, base: args.base, issue: args.issue, title: args.title }, { client })
      return { ok: false, error: `unknown action: ${args.action}` }
    }
    case 'gitea_label_auto': {
      const { applyLabelRules } = await import('../label-auto.js')
      return applyLabelRules({ owner, repo, number: args.number }, { client })
    }
    default:
      return { ok: false, error: `Unknown issue tool: ${name}` }
  }
}
