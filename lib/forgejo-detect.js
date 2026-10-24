/**
 * forgejo-detect: detects instance flavor (gitea/forgejo).
 *
 * `GET /api/v1/version` alone is not enough: Forgejo advertises a **Gitea
 * compatible** version string (`17.0.0+gitea-1.22.0`), so a version-only
 * heuristic answers "gitea" on every Forgejo (#57). When the version carries
 * that compatibility suffix the flavor is ambiguous, and the web UI `<title>`
 * is the cheap tie-breaker — both products ship a distinct one.
 */

/** Forgejo reports its API compatibility this way: `17.0.0+gitea-1.22.0`. */
const GITEA_COMPAT_SUFFIX = /\+gitea-\d/i

/** How long the optional title probe may take. */
const PROBE_TIMEOUT_MS = 5000

/**
 * Read the instance's HTML `<title>`; empty string when it is not reachable.
 *
 * Never throws: a failed probe must degrade to "could not determine", not to a
 * confident wrong answer.
 *
 * @param {string} baseUrl - instance root, e.g. https://git.pvlb.dev
 * @param {typeof fetch} fetchImpl - fetch implementation (injectable for tests).
 * @returns {Promise<string>} title text, or ''.
 */
export async function probeWebTitle(baseUrl, fetchImpl) {
  if (!baseUrl || typeof fetchImpl !== 'function') return ''
  try {
    const url = new URL('/', baseUrl)
    const init = {
      redirect: 'follow',
      headers: { Accept: 'text/html' },
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(PROBE_TIMEOUT_MS)
        : undefined,
    }
    const res = await fetchImpl(url, init)
    if (!res?.ok || typeof res.text !== 'function') return ''
    const html = await res.text()
    const match = /<title[^>]*>([^<]*)<\/title>/i.exec(String(html || ''))
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

/**
 * Detect the instance flavor and return compatibility notes.
 *
 * Precedence:
 * 1. the version names Forgejo explicitly — trust it;
 * 2. the version carries the `+gitea-<ver>` compatibility suffix — ambiguous,
 *    so probe the web UI title (Forgejo vs Gitea) and fall back to `unknown`
 *    rather than to a confident `gitea`;
 * 3. otherwise a plain version string is Gitea.
 *
 * @param {object} [args] - legacy call shape (`{ client }`).
 * @param {object} [deps] - `{ client, fetchImpl?, baseUrl? }`.
 * @returns {Promise<{ok: true, data: {flavor: string, version: string, notes: string[], reason?: string, detectedFrom?: string}}>}
 */
export async function detectFlavor(args = {}, deps = {}) {
  const client = deps?.client || args?.client || (args?.getVersion ? args : null)
  const fetchImpl = deps?.fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!client || !client.getVersion) {
    return {
      ok: true,
      data: { flavor: 'unknown', version: '', notes: ['Could not detect instance flavor.'], reason: 'no version endpoint' },
    }
  }
  const res = await client.getVersion().catch((e) => ({ ok: false, error: String(e) }))
  const version = String(res?.ok ? res.data?.version || '' : '')
  const lower = version.toLowerCase()

  let flavor = 'unknown'
  let reason = ''
  let detectedFrom = ''
  if (!version) {
    reason = 'version endpoint returned no version'
  } else if (lower.includes('forgejo')) {
    flavor = 'forgejo'
    detectedFrom = 'version'
  } else if (GITEA_COMPAT_SUFFIX.test(version)) {
    // Ambiguous: probe the web UI before answering.
    const baseUrl = client.baseUrl || deps?.baseUrl || ''
    const title = await probeWebTitle(baseUrl, fetchImpl)
    const t = title.toLowerCase()
    if (t.includes('forgejo')) {
      flavor = 'forgejo'
      detectedFrom = 'web-title'
    } else if (t.includes('gitea')) {
      flavor = 'gitea'
      detectedFrom = 'web-title'
    } else {
      reason = 'version carries a Forgejo/Gitea compatibility suffix and the web UI title was not readable'
    }
  } else {
    flavor = 'gitea'
    detectedFrom = 'version'
  }

  const notes = []
  if (flavor === 'forgejo') {
    notes.push('Gitea Actions may be absent or differ — CI tools may not work.')
    notes.push('Webhook format and headers may differ (X-Forgejo-* instead of X-Gitea-*).')
  } else if (flavor === 'gitea') {
    notes.push('Full support for Gitea Actions and X-Gitea-* webhooks.')
  } else {
    notes.push('Could not detect instance flavor.')
  }
  if (detectedFrom === 'web-title') {
    notes.push(`Version "${version}" is a Gitea-compatible string; the flavor was confirmed from the instance web UI.`)
  }

  const data = { flavor, version, notes }
  if (reason) data.reason = reason
  if (detectedFrom) data.detectedFrom = detectedFrom
  return { ok: true, data }
}
