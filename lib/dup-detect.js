/**
 * gitea_issue_duplicates: finds probable duplicate issues before creation.
 * Ranks candidates by title/body token similarity against threshold.
 * Never creates or closes issues automatically.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'with', 'is', 'are', 'it', 'this', 'that', 'add', 'fix', 'feat', '\u0438', '\u0432', '\u043d\u0430', '\u0434\u043b\u044f', '\u0441', '\u043f\u043e', '\u0438\u0437', '\u043d\u0435', '\u043a\u0430\u043a'])

export function normalizeText(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function tokenSet(text = '') {
  return new Set(normalizeText(text).filter((w) => !STOPWORDS.has(w) && w.length > 2))
}

/**
 * Jaccard similarity of two texts (0..1).
 */
export function similarity(a = '', b = '') {
  const sa = tokenSet(a)
  const sb = tokenSet(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter += 1
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * @param {{owner: string, repo: string, title?: string, body?: string, threshold?: number}} args
 * @param {{client: object}} deps
 */
export async function findDuplicates(args = {}, deps = {}) {
  const client = deps.client
  const owner = args.owner
  const repo = args.repo
  const title = String(args.title || '')
  const body = String(args.body || '')
  const threshold = Number(args.threshold || 0.3)

  const query = title || body
  const res = await client.searchIssues({ q: query, repo: `${owner}/${repo}`, state: 'all', limit: 50 }).catch((e) => ({ ok: false, error: String(e) }))
  if (!res?.ok) {
    return { ok: false, error: res?.error || 'search failed' }
  }
  const issues = Array.isArray(res.data) ? res.data : (res.data && Array.isArray(res.data.data) ? res.data.data : [])

  const candidates = issues
    .map((issue) => {
      // #30: score title and body separately. A long existing body must not
      // dilute an exact title match below the threshold.
      const titleSim = title ? similarity(title, issue.title || '') : 0
      const bodySim = body ? similarity(body, issue.body || '') : 0
      const score = title
        ? Math.max(titleSim, 0.7 * titleSim + 0.3 * bodySim)
        : bodySim
      const reason = score >= threshold
        ? `title ${titleSim.toFixed(2)}, body ${bodySim.toFixed(2)}`
        : ''
      return { number: issue.number, title: issue.title || '', score, reason }
    })
    .filter((c) => c.score >= threshold && c.number !== undefined)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return { ok: true, data: { candidates, threshold, total: issues.length } }
}
