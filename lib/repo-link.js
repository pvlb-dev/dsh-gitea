/**
 * repo-link: the clickable repository link the Git sidebar shows next to the
 * branch badge (#63).
 *
 * The URL comes from the **origin** remote, not from `defaultOwner` /
 * `defaultRepo`: those configure the Gitea tools for a repository this session
 * may not be in, while the sidebar describes the working copy. The configured
 * owner/repo are only a fallback when the checkout has no usable origin.
 */

/** `git@host:owner/repo.git` — scp-like syntax, not a URL. */
const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+)$/

const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i

function parseBaseUrl(baseUrl) {
  try {
    const parsed = new URL(String(baseUrl || ''))
    return { host: parsed.host, protocol: parsed.protocol.replace(':', '') }
  } catch {
    return { host: '', protocol: '' }
  }
}

/**
 * Turn a git remote into the repository's browsable web URL.
 *
 * Handles `ssh://`, scp-like `git@host:owner/repo.git`, and `http(s)://`
 * remotes; drops a trailing `.git`, the default SSH port, and any path below
 * `owner/repo`. Returns `''` for anything that cannot yield a web URL (local
 * paths, `file://`, a bare host).
 *
 * @param {string} remoteUrl - output of `git remote get-url origin`.
 * @param {{ baseUrl?: string, forceHttps?: boolean }} [options] - the configured
 *   instance URL decides the scheme when it names the same host.
 * @returns {string}
 */
export function parseRemoteWebUrl(remoteUrl = '', { baseUrl = '', forceHttps = false } = {}) {
  const raw = String(remoteUrl || '').trim().replace(/^git\+/, '')
  if (!raw) return ''

  let host = ''
  let pathname = ''
  const scp = raw.match(SCP_LIKE)
  if (scp) {
    host = scp[1]
    pathname = scp[2]
  } else {
    let parsed
    try {
      parsed = new URL(raw)
    } catch {
      return ''
    }
    if (parsed.protocol === 'file:') return ''
    const keepPort = parsed.port && !(parsed.protocol === 'ssh:' && parsed.port === '22')
    host = parsed.hostname + (keepPort ? ':' + parsed.port : '')
    pathname = parsed.pathname
  }

  // Forgejo/Gitea are owner/repo; ignore anything deeper (branch, blob paths).
  const parts = String(pathname || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean)
  if (!host || parts.length < 2) return ''

  let scheme = LOOPBACK.test(host) ? 'http' : 'https'
  const base = parseBaseUrl(baseUrl)
  if (base.host && base.host === host && (base.protocol === 'http' || base.protocol === 'https')) {
    scheme = base.protocol
  }
  if (forceHttps && scheme === 'http') scheme = 'https'

  return `${scheme}://${host}/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`
}

/**
 * Build the Git-sidebar link payload: `{ url, icon }` or `null`.
 *
 * `icon` is `forgejo` (default), `gitea`, or `none` to hide the link. An
 * unknown value falls back to `forgejo` so a newer client/Host skew never
 * produces a broken header.
 *
 * @param {object} args
 * @param {string} [args.remoteUrl]
 * @param {string} [args.baseUrl]
 * @param {string} [args.defaultOwner]
 * @param {string} [args.defaultRepo]
 * @param {string} [args.repoName]
 * @param {string} [args.icon]
 * @param {boolean} [args.forceHttps]
 * @returns {{ url: string, icon: 'gitea' | 'forgejo' } | null}
 */
export function buildRepoLink({
  remoteUrl = '',
  baseUrl = '',
  defaultOwner = '',
  defaultRepo = '',
  repoName = '',
  icon = 'forgejo',
  forceHttps = false,
} = {}) {
  const mode = icon === 'gitea' || icon === 'forgejo' || icon === 'none' ? icon : 'forgejo'
  if (mode === 'none') return null

  let url = parseRemoteWebUrl(remoteUrl, { baseUrl, forceHttps })
  if (!url && baseUrl && defaultOwner) {
    const repo = defaultRepo || repoName
    if (repo) {
      url = String(baseUrl).replace(/\/+$/, '') + '/' + encodeURIComponent(defaultOwner) + '/' + encodeURIComponent(repo)
    }
  }
  if (!url) return null
  return { url, icon: mode }
}
