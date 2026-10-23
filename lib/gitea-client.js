import { retryWithBackoff } from './retry.js'

function buildAttemptSignal(timeoutMs, callerSignal) {
  if (callerSignal?.aborted) return callerSignal
  const timeoutSignal = (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
    ? AbortSignal.timeout(timeoutMs)
    : null

  if (callerSignal && timeoutSignal) {
    if (typeof AbortSignal.any === 'function') {
      return AbortSignal.any([callerSignal, timeoutSignal])
    }
    const ac = new AbortController()
    callerSignal.addEventListener('abort', () => ac.abort(callerSignal.reason), { once: true })
    timeoutSignal.addEventListener('abort', () => ac.abort(timeoutSignal.reason), { once: true })
    return ac.signal
  }
  return callerSignal || timeoutSignal || undefined
}

export function normalizeBaseUrl(url) {
  const s = String(url || '').trim()
  if (!s) return ''
  return s.replace(/\/+$/, '')
}

function enc(segment) {
  const s = String(segment ?? '')
  if (!s || s === '.' || s === '..' || /[\\/\0]/.test(s) || !/^[A-Za-z0-9._-]+$/.test(s)) {
    return null
  }
  return encodeURIComponent(s)
}

function reposPath(owner, repo, suffix = '') {
  const o = enc(owner)
  const r = enc(repo)
  if (!o || !r) return null
  return `/repos/${o}/${r}${suffix}`
}

// #10: wiki page names are free-form (spaces are legal), so they cannot go
// through enc(); encode them as a single path segment instead.
function wikiPageSegment(pageName) {
  const s = String(pageName ?? '').trim()
  if (!s || s.includes('\0')) return null
  return encodeURIComponent(s)
}

// Forgejo's create/update wiki API takes the body base64-encoded.
function wikiPagePayload({ title, content, message } = {}) {
  const payload = {
    content_base64: Buffer.from(String(content ?? ''), 'utf8').toString('base64'),
  }
  if (title !== undefined && title !== null && String(title).trim()) payload.title = String(title)
  if (message) payload.message = String(message)
  return payload
}

function issuePath(owner, repo, number, suffix = '') {
  const base = reposPath(owner, repo)
  const n = enc(number)
  if (!base || !n) return null
  return `${base}/issues/${n}${suffix}`
}

function pullPath(owner, repo, number, suffix = '') {
  const base = reposPath(owner, repo)
  const n = enc(number)
  if (!base || !n) return null
  return `${base}/pulls/${n}${suffix}`
}

function badSegment(error = 'invalid owner, repo, or number') {
  return Promise.resolve({ ok: false, status: 0, error })
}

export class GiteaClient {
  constructor({ baseUrl, token, fetchImpl = fetch, timeoutMs = 30_000, retries = 1, retryDelayMs = 300, cacheTtlMs = 15_000, maxCacheEntries = 150 } = {}) {
    this.maxCacheEntries = Number(maxCacheEntries) > 0 ? Number(maxCacheEntries) : 150
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.apiRoot = this.baseUrl ? `${this.baseUrl}/api/v1` : ''
    this.token = token
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.retries = retries
    this.retryDelayMs = retryDelayMs
    this.rateLimitRemaining = null
    this.lastRequestMs = 0
    this.cacheTtlMs = cacheTtlMs
    this.cache = new Map()
  }

  clearCache() {
    this.cache.clear()
  }

  async request(method, path, options = {}) {
    const { query, body, bypassCache = false, accept, signal: callerSignal, allowNonIdempotentRetry = false } = options || {}
    const isGet = String(method || '').toUpperCase() === 'GET'
    const cacheKey = isGet ? path + '?' + (query ? JSON.stringify(query) : '') : null
    const now = Date.now()
    let cachedEntry = null

    if (isGet && this.cacheTtlMs > 0 && this.cache.has(cacheKey)) {
      cachedEntry = this.cache.get(cacheKey)
      if (!bypassCache && now - cachedEntry.at < this.cacheTtlMs) {
        this.cache.delete(cacheKey)
        this.cache.set(cacheKey, cachedEntry)
        return typeof structuredClone === 'function' ? structuredClone(cachedEntry.res) : JSON.parse(JSON.stringify(cachedEntry.res))
      }
      if (now - cachedEntry.at >= this.cacheTtlMs && !cachedEntry.etag) {
        this.cache.delete(cacheKey)
        cachedEntry = null
      }
    }

    if (!isGet && this.cacheTtlMs > 0) {
      this.cache.clear()
    }
    const headers = {
      Accept: accept || (arguments[2] && arguments[2].accept) || 'application/json',
      Authorization: `token ${this.token}`,
    }
    if (isGet && cachedEntry && cachedEntry.etag) {
      headers['If-None-Match'] = cachedEntry.etag
    }
    const init = { method, headers }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    // Signal is created per-attempt inside attempt() (#266)

    const attempt = async () => {
      try {
        const url = new URL(`${this.apiRoot}${path}`)
        if (query) {
          for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null) {
              url.searchParams.set(key, String(value))
            }
          }
        }

        const attemptInit = { ...init }
        const sig = buildAttemptSignal(this.timeoutMs, callerSignal)
        if (sig) attemptInit.signal = sig

        const startedAt = Date.now()
        const response = await this.fetchImpl(url.toString(), attemptInit)
        this.lastRequestMs = Date.now() - startedAt
        const rlHeader = response.headers && (response.headers.get ? response.headers.get('x-ratelimit-remaining') : null)
        if (rlHeader != null) this.rateLimitRemaining = Number(rlHeader)

        // Handle 304 Not Modified: return cached data and refresh TTL
        if (response.status === 304 && cachedEntry) {
          cachedEntry.at = Date.now()
          this.cache.delete(cacheKey)
          this.cache.set(cacheKey, cachedEntry)
          return typeof structuredClone === 'function' ? structuredClone(cachedEntry.res) : JSON.parse(JSON.stringify(cachedEntry.res))
        }

        let data
        const contentType = (response.headers && response.headers.get ? response.headers.get('content-type') : '') || ''
        const contentLength = response.headers && response.headers.get ? response.headers.get('content-length') : null
        const emptyBody = response.status === 204 || response.status === 205 || contentLength === '0'

        // #297: Support plaintext logs, diffs, octet-stream, or caller requested text accept
        const isTextResponse = (accept && (accept.includes('text/') || accept.includes('diff') || accept.includes('raw'))) ||
                               contentType.includes('text/plain') ||
                               contentType.includes('text/x-diff') ||
                               contentType.includes('application/octet-stream')

        if (emptyBody) {
          data = undefined
        } else if (isTextResponse) {
          if (typeof response.text === 'function') {
            data = await response.text()
          } else if (typeof response.json === 'function') {
            data = await response.json()
          } else {
            data = ''
          }
        } else {
          let rawText = ''
          if (typeof response.text === 'function') {
            try {
              rawText = await response.text()
            } catch (err) {
              return { ok: false, status: response.status, error: `Failed to read response body: ${err.message}` }
            }
            if (!rawText || rawText.trim().length === 0) {
              data = undefined
            } else {
              try {
                data = JSON.parse(rawText)
              } catch (parseErr) {
                // If not application/json or response is error status, allow fallback
                if (contentType.includes('text/plain') || (!contentType.includes('application/json') && !response.ok)) {
                  data = rawText
                } else if (response.ok) {
                  return {
                    ok: false,
                    status: response.status,
                    error: `Failed to parse JSON response: ${parseErr.message}`,
                  }
                } else {
                  data = { message: rawText }
                }
              }
            }
          } else if (typeof response.json === 'function') {
            try {
              data = await response.json()
            } catch (parseErr) {
              if (response.ok) {
                return {
                  ok: false,
                  status: response.status,
                  error: `Failed to parse JSON response: ${parseErr.message}`,
                }
              }
              data = undefined
            }
          }
        }
        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            data,
            error: data?.message || data?.error || (typeof data === 'string' && data ? data : `HTTP ${response.status}`),
          }
        }
        const totalCountHeader = response.headers && response.headers.get ? response.headers.get('x-total-count') : null
        const linkHeader = response.headers && response.headers.get ? response.headers.get('link') : null
        const res = {
          ok: true,
          status: response.status,
          data,
          totalCount: totalCountHeader ? Number(totalCountHeader) : null,
          hasMore: Boolean(linkHeader && linkHeader.includes('rel="next"')),
        }
        if (isGet && this.cacheTtlMs > 0 && cacheKey) {
          const etagHeader = response.headers && (response.headers.get ? response.headers.get('etag') : null)
          if (this.cache.has(cacheKey)) {
            this.cache.delete(cacheKey)
          } else if (this.cache.size >= this.maxCacheEntries) {
            const curTime = Date.now()
            for (const [k, v] of this.cache.entries()) {
              if (curTime - v.at >= this.cacheTtlMs) {
                this.cache.delete(k)
              }
              if (this.cache.size < this.maxCacheEntries) break
            }
            if (this.cache.size >= this.maxCacheEntries) {
              const oldestKey = this.cache.keys().next().value
              if (oldestKey !== undefined) {
                this.cache.delete(oldestKey)
              }
            }
          }
          this.cache.set(cacheKey, { at: Date.now(), res, etag: etagHeader || undefined })
        }
        return res
      } catch (err) {
        return {
          ok: false,
          status: 0,
          error: err?.message || String(err),
        }
      }
    }

    // #282: Only retry idempotent HTTP methods unless caller explicitly opts in
    const upperMethod = String(method || 'GET').toUpperCase()
    const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(upperMethod)
    const effectiveRetries = (isIdempotent || allowNonIdempotentRetry) ? this.retries : 0

    return retryWithBackoff(attempt, {
      retries: effectiveRetries,
      baseDelayMs: this.retryDelayMs,
    })
  }

  createIssue(owner, repo, body) {
    const path = reposPath(owner, repo, '/issues')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  listIssues(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/issues')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getIssue(owner, repo, number) {
    const path = issuePath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  commentIssue(owner, repo, number, body) {
    const path = issuePath(owner, repo, number, '/comments')
    if (!path) return badSegment()
    return this.request('POST', path, { body: { body } })
  }

  listIssueComments(owner, repo, number, query = {}) {
    const path = issuePath(owner, repo, number, '/comments')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getIssueComment(owner, repo, id) {
    const path = reposPath(owner, repo, `/issues/comments/${encodeURIComponent(id)}`)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  updateIssueComment(owner, repo, id, body) {
    const path = reposPath(owner, repo, `/issues/comments/${encodeURIComponent(id)}`)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body: { body } })
  }

  deleteIssueComment(owner, repo, id) {
    const path = reposPath(owner, repo, `/issues/comments/${encodeURIComponent(id)}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  closeIssue(owner, repo, number) {
    const path = issuePath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body: { state: 'closed' } })
  }

    editIssue(owner, repo, number, body) {
    return this.updateIssue(owner, repo, number, body)
  }

updateIssue(owner, repo, number, body) {
    const path = issuePath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body })
  }

  searchIssues(query = {}) {
    // #290: Gitea REST API provides /repos/issues/search (not /search/issues).
    // If query.repo is provided, filter client-side since endpoint searches globally.
    const { repo, ...restQuery } = query || {}
    const p = this.request('GET', '/repos/issues/search', { query: restQuery })
    if (!repo) return p
    return p.then(res => {
      if (res.ok && Array.isArray(res.data)) {
        const lowerRepo = String(repo).toLowerCase()
        const filtered = res.data.filter(item => {
          const rName = item?.repository?.name?.toLowerCase()
          const rFull = item?.repository?.full_name?.toLowerCase()
          return rName === lowerRepo || rFull === lowerRepo || (rFull && rFull.endsWith('/' + lowerRepo))
        })
        return { ...res, data: filtered }
      }
      return res
    })
  }

  listLabels(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/labels')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  createLabel(owner, repo, body) {
    const path = reposPath(owner, repo, '/labels')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  deleteLabel(owner, repo, labelId) {
    const path = reposPath(owner, repo, `/labels/${enc(labelId)}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  setIssueLabels(owner, repo, number, labelIds) {
    const path = issuePath(owner, repo, number, '/labels')
    if (!path) return badSegment()
    return this.request('PUT', path, { body: { labels: labelIds } })
  }

  addIssueLabels(owner, repo, number, labelIds) {
    const path = issuePath(owner, repo, number, '/labels')
    if (!path) return badSegment()
    return this.request('POST', path, { body: { labels: labelIds } })
  }

  listMilestones(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/milestones')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  createMilestone(owner, repo, body) {
    const path = reposPath(owner, repo, '/milestones')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  setIssueAssignee(owner, repo, number, assignee) {
    const path = issuePath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body: { assignee } })
  }

  createPull(owner, repo, body) {
    const path = reposPath(owner, repo, '/pulls')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  listPulls(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/pulls')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getPull(owner, repo, number) {
    const path = pullPath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  mergePull(owner, repo, number, body) {
    const path = pullPath(owner, repo, number, '/merge')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  listPullFiles(owner, repo, number, query = {}) {
    const path = pullPath(owner, repo, number, '/files')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  listPullReviews(owner, repo, number, query = {}) {
    const path = pullPath(owner, repo, number, '/reviews')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  submitPullReview(owner, repo, number, body) {
    const path = pullPath(owner, repo, number, '/reviews')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  createPullComment(owner, repo, number, body = {}) {
    // #291: In Gitea REST API, line comments are submitted as PR reviews
    // POST /repos/{owner}/{repo}/pulls/{number}/reviews with event: 'COMMENT'
    const path = pullPath(owner, repo, number, '/reviews')
    if (!path) return badSegment()
    const reviewBody = body.review_body || ''
    const commentItem = {
      path: body.path,
      new_position: Number(body.line || body.new_position) || 0,
      old_position: Number(body.old_line || body.old_position) || 0,
      body: body.body || '',
    }
    const payload = {
      event: 'COMMENT',
      body: reviewBody,
      comments: [commentItem],
    }
    if (body.commit_id) payload.commit_id = body.commit_id
    return this.request('POST', path, { body: payload })
  }

  getPullMergeStatus(owner, repo, number) {
    // #296: GET /repos/{owner}/{repo}/pulls/{number}/merge returns 204 if merged, 404 if not merged.
    const path = pullPath(owner, repo, number, '/merge')
    if (!path) return badSegment()
    return this.request('GET', path).then(res => {
      if (res.status === 204) {
        return { ok: true, status: 204, data: { merged: true } }
      }
      if (res.status === 404) {
        return { ok: true, status: 404, data: { merged: false } }
      }
      return res
    })
  }

  searchRepos(query = {}) {
    return this.request('GET', '/repos/search', { query })
  }

  searchCode(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/search/code')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getContents(owner, repo, filePath, query = {}) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    const raw = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!raw || raw.includes('\0')) return badSegment('invalid owner, repo, or filePath')
    const segments = raw.split('/')
    if (segments.some(s => s === '..' || s === '.')) {
      return badSegment('invalid owner, repo, or filePath')
    }
    const p = segments.map(encodeURIComponent).join('/')
    return this.request('GET', `/repos/${o}/${r}/contents/${p}`, { query })
  }

  createFile(owner, repo, filePath, body = {}) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    const raw = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!raw || raw.includes('\0')) return badSegment('invalid owner, repo, or filePath')
    const segments = raw.split('/')
    if (segments.some((s) => s === '..' || s === '.')) {
      return badSegment('invalid owner, repo, or filePath')
    }
    const p = segments.map(encodeURIComponent).join('/')
    return this.request('POST', `/repos/${o}/${r}/contents/${p}`, { body })
  }

  updateFile(owner, repo, filePath, body = {}) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    const raw = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!raw || raw.includes('\0')) return badSegment('invalid owner, repo, or filePath')
    const segments = raw.split('/')
    if (segments.some((s) => s === '..' || s === '.')) {
      return badSegment('invalid owner, repo, or filePath')
    }
    const p = segments.map(encodeURIComponent).join('/')
    return this.request('PUT', `/repos/${o}/${r}/contents/${p}`, { body })
  }


  listBranches(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/branches')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  listCommits(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/commits')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getCombinedCommitStatus(owner, repo, ref) {
    const rf = enc(ref)
    const path = reposPath(owner, repo, `/commits/${rf}/status`)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  compareCommits(owner, repo, range) {
    const o = enc(owner)
    const r = enc(repo)
    const rg = String(range || '').trim()
    if (!o || !r || !rg) return badSegment()
    // keep slashes in the range (branch names can contain them); encode the rest
    const encoded = rg.split('/').map(encodeURIComponent).join('/')
    return this.request('GET', `/repos/${o}/${r}/compare/${encoded}`)
  }

  listTags(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/tags')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  listReleases(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/releases')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  createRelease(owner, repo, body) {
    const path = reposPath(owner, repo, '/releases')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  deleteRelease(owner, repo, releaseId) {
    const path = reposPath(owner, repo, `/releases/${enc(releaseId)}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  updateRelease(owner, repo, releaseId, body) {
    const path = reposPath(owner, repo, `/releases/${enc(releaseId)}`)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body })
  }

  listWebhooks(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/hooks')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  createWebhook(owner, repo, body) {
    const path = reposPath(owner, repo, '/hooks')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  deleteWebhook(owner, repo, hookId) {
    const path = reposPath(owner, repo, `/hooks/${enc(hookId)}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  listWikiPages(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/wiki/pages')
    if (!path) return badSegment()
    // #9: Forgejo answers 404 for an enabled-but-empty wiki (the API has no
    // empty page list to return). Treat only that 404 as an empty wiki; auth,
    // permission and server failures keep failing as before.
    return this.request('GET', path, { query }).then(res => {
      if (res.status === 404) {
        return { ok: true, status: 404, data: [] }
      }
      return res
    })
  }

  getWikiPage(owner, repo, pageName) {
    const path = reposPath(owner, repo, `/wiki/page/${encodeURIComponent(String(pageName))}`)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  // #10: POST /wiki/new, PATCH|DELETE /wiki/page/{pageName}. The body is
  // base64 (`content_base64`) because wiki pages are markdown files.
  createWikiPage(owner, repo, body = {}) {
    const path = reposPath(owner, repo, '/wiki/new')
    if (!path) return badSegment()
    return this.request('POST', path, { body: wikiPagePayload(body) })
  }

  updateWikiPage(owner, repo, pageName, body = {}) {
    const segment = wikiPageSegment(pageName)
    if (!segment) return badSegment('invalid pageName')
    const path = reposPath(owner, repo, `/wiki/page/${segment}`)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body: wikiPagePayload(body) })
  }

  deleteWikiPage(owner, repo, pageName) {
    const segment = wikiPageSegment(pageName)
    if (!segment) return badSegment('invalid pageName')
    const path = reposPath(owner, repo, `/wiki/page/${segment}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  updateMilestone(owner, repo, milestoneId, body) {
    const path = reposPath(owner, repo, `/milestones/${enc(milestoneId)}`)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body })
  }

  deleteMilestone(owner, repo, milestoneId) {
    const path = reposPath(owner, repo, `/milestones/${enc(milestoneId)}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  listOrgRepos(org, query = {}) {
    const o = enc(org)
    if (!o) return badSegment()
    return this.request('GET', `/orgs/${o}/repos`, { query })
  }

  listOrgMembers(org, query = {}) {
    const o = enc(org)
    if (!o) return badSegment()
    return this.request('GET', `/orgs/${o}/members`, { query })
  }

  listNotifications(query = {}) {
    return this.request('GET', '/notifications', { query })
  }

  markNotificationsRead(query = {}) {
    // #293: Gitea REST API endpoint is PUT /notifications (not /notifications/mark-read)
    return this.request('PUT', '/notifications', { query })
  }

  listActionsRuns(owner, repo, query = {}) {
    const path = reposPath(owner, repo, '/actions/runs')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getActionsRun(owner, repo, runId) {
    const path = reposPath(owner, repo, `/actions/runs/${enc(runId)}`)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  listRunJobs(owner, repo, runId, query = {}) {
    const path = reposPath(owner, repo, `/actions/runs/${enc(runId)}/jobs`)
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  getJobLogs(owner, repo, jobId) {
    // #297: Job logs are plain text from Gitea Actions
    const path = reposPath(owner, repo, `/actions/jobs/${enc(jobId)}/logs`)
    if (!path) return badSegment()
    return this.request('GET', path, { accept: 'text/plain' })
  }

  getActionsJob(owner, repo, jobId) {
    const path = reposPath(owner, repo, `/actions/jobs/${enc(jobId)}`)
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  async rerunActionsJob(owner, repo, runIdOrJobId, maybeJobId) {
    // #294: Gitea requires /actions/runs/{run}/jobs/{job_id}/rerun
    let runId = runIdOrJobId
    let jobId = maybeJobId
    if (jobId === undefined) {
      jobId = runIdOrJobId
      runId = undefined
    }
    if (!runId && jobId) {
      const jobRes = await this.getActionsJob(owner, repo, jobId)
      if (jobRes?.ok && jobRes.data?.run_id) {
        runId = jobRes.data.run_id
      }
    }
    if (!runId) {
      return { ok: false, status: 400, error: `Rerunning job ${jobId} requires a valid run_id.` }
    }
    const path = reposPath(owner, repo, `/actions/runs/${enc(runId)}/jobs/${enc(jobId)}/rerun`)
    if (!path) return badSegment()
    return this.request('POST', path)
  }

  rerunActionsRun(owner, repo, runId) {
    // #294: Rerun entire workflow run
    const path = reposPath(owner, repo, `/actions/runs/${enc(runId)}/rerun`)
    if (!path) return badSegment()
    return this.request('POST', path)
  }

  searchUsers(query = {}) {
    return this.request('GET', '/users/search', { query })
  }

  listUserOrgs(query = {}) {
    return this.request('GET', '/user/orgs', { query })
  }

  listOrgTeams(org, query = {}) {
    const o = enc(org)
    if (!o) return badSegment()
    return this.request('GET', `/orgs/${o}/teams`, { query })
  }

  getRepo(owner, repo) {
    const path = reposPath(owner, repo, '')
    if (!path) return badSegment()
    return this.request('GET', path)
  }

  createRepo(body) {
    return this.request('POST', '/user/repos', { body })
  }

  createOrgRepo(org, body) {
    const o = enc(org)
    if (!o) return badSegment()
    return this.request('POST', `/orgs/${o}/repos`, { body })
  }

  createBranch(owner, repo, body = {}) {
    // #295: Gitea CreateBranchRepoOption requires { new_branch_name, old_ref_name }
    const path = reposPath(owner, repo, '/branches')
    if (!path) return badSegment()
    const payload = {
      new_branch_name: body.new_branch_name || body.branch_name || body.name,
      old_ref_name: body.old_ref_name || body.old_branch_name || body.ref,
    }
    return this.request('POST', path, { body: payload })
  }

  deleteBranch(owner, repo, branch) {
    const path = reposPath(owner, repo, `/branches/${encodeURIComponent(String(branch))}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  createTag(owner, repo, body) {
    const path = reposPath(owner, repo, '/tags')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  deleteTag(owner, repo, tag) {
    const path = reposPath(owner, repo, `/tags/${encodeURIComponent(String(tag))}`)
    if (!path) return badSegment()
    return this.request('DELETE', path)
  }

  getVersion() {
    return this.request('GET', '/version')
  }

  getUser() {
    return this.request('GET', '/user')
  }
  getPullDiff(owner, repo, number) {
    const path = pullPath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('GET', `${path}.diff`, { accept: 'application/vnd.gitea.diff' })
  }

  listIssueReactions(owner, repo, number, query = {}) {
    const path = issuePath(owner, repo, number, '/reactions')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }

  addIssueReaction(owner, repo, number, content) {
    const path = issuePath(owner, repo, number, '/reactions')
    if (!path) return badSegment()
    return this.request('POST', path, { body: { content: String(content || '') } })
  }

  deleteIssueReaction(owner, repo, number, content) {
    const path = issuePath(owner, repo, number, '/reactions')
    if (!path) return badSegment()
    return this.request('DELETE', path, { body: { content: String(content || '') } })
  }

  listCommentReactions(owner, repo, commentId, query = {}) {
    const o = enc(owner)
    const r = enc(repo)
    const cid = enc(commentId)
    if (!o || !r || !cid) return badSegment()
    return this.request('GET', `/repos/${o}/${r}/issues/comments/${cid}/reactions`, { query })
  }

  addCommentReaction(owner, repo, commentId, content) {
    const o = enc(owner)
    const r = enc(repo)
    const cid = enc(commentId)
    if (!o || !r || !cid) return badSegment()
    return this.request('POST', `/repos/${o}/${r}/issues/comments/${cid}/reactions`, { body: { content: String(content || '') } })
  }

  deleteCommentReaction(owner, repo, commentId, content) {
    const o = enc(owner)
    const r = enc(repo)
    const cid = enc(commentId)
    if (!o || !r || !cid) return badSegment()
    return this.request('DELETE', `/repos/${o}/${r}/issues/comments/${cid}/reactions`, { body: { content: String(content || '') } })
  }

  getIssueTimeline(owner, repo, number, query = {}) {
    const path = issuePath(owner, repo, number, '/timeline')
    if (!path) return badSegment()
    return this.request('GET', path, { query })
  }


  createPullReview(owner, repo, number, body = {}) {
    const path = pullPath(owner, repo, number, '/reviews')
    if (!path) return badSegment()
    return this.request('POST', path, { body })
  }

  submitPullReview(owner, repo, number, body = {}) {
    return this.createPullReview(owner, repo, number, body)
  }

  editPull(owner, repo, number, body = {}) {
    const path = pullPath(owner, repo, number)
    if (!path) return badSegment()
    return this.request('PATCH', path, { body })
  }

  listRunners(owner, repo) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request('GET', '/repos/' + o + '/' + r + '/actions/runners')
  }
  listPackages(owner, query = {}) {
    const o = enc(owner)
    if (!o) return badSegment()
    return this.request("GET", "/packages/" + o, { query })
  }

  getPackage(owner, type, name) {
    const o = enc(owner)
    const t = enc(type)
    const n = enc(name)
    if (!o || !t || !n) return badSegment()
    return this.request("GET", "/packages/" + o + "/" + t + "/" + n)
  }

  deletePackageVersion(owner, type, name, version) {
    const o = enc(owner)
    const t = enc(type)
    const n = enc(name)
    const v = enc(version)
    if (!o || !t || !n || !v) return badSegment()
    return this.request("DELETE", "/packages/" + o + "/" + t + "/" + n + "/" + v)
  }
  listBranchProtections(owner, repo) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("GET", `/repos/${o}/${r}/branch_protections`)
  }

  getBranchProtection(owner, repo, name) {
    const o = enc(owner)
    const r = enc(repo)
    const n = enc(name)
    if (!o || !r || !n) return badSegment()
    return this.request("GET", `/repos/${o}/${r}/branch_protections/${n}`)
  }

  createBranchProtection(owner, repo, body = {}) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("POST", `/repos/${o}/${r}/branch_protections`, { body })
  }

  editBranchProtection(owner, repo, name, body = {}) {
    const o = enc(owner)
    const r = enc(repo)
    const n = enc(name)
    if (!o || !r || !n) return badSegment()
    return this.request("PATCH", `/repos/${o}/${r}/branch_protections/${n}`, { body })
  }

  deleteBranchProtection(owner, repo, name) {
    const o = enc(owner)
    const r = enc(repo)
    const n = enc(name)
    if (!o || !r || !n) return badSegment()
    return this.request("DELETE", `/repos/${o}/${r}/branch_protections/${n}`)
  }

  listDeployKeys(owner, repo, query = {}) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("GET", `/repos/${o}/${r}/keys`, { query })
  }

  addDeployKey(owner, repo, body = {}) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("POST", `/repos/${o}/${r}/keys`, { body })
  }

  deleteDeployKey(owner, repo, keyId) {
    const o = enc(owner)
    const r = enc(repo)
    const id = enc(keyId)
    if (!o || !r || !id) return badSegment()
    return this.request("DELETE", `/repos/${o}/${r}/keys/${id}`)
  }

  listPushMirrors(owner, repo) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("GET", `/repos/${o}/${r}/push_mirrors`)
  }

  syncPushMirrors(owner, repo) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("POST", `/repos/${o}/${r}/push_mirrors-sync`)
  }

  syncPullMirror(owner, repo) {
    const o = enc(owner)
    const r = enc(repo)
    if (!o || !r) return badSegment()
    return this.request("POST", `/repos/${o}/${r}/mirror-sync`)
  }
}
