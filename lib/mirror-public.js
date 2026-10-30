/**
 * mirror-public: preparation for mirroring to public GitHub repository.
 * Sanitizes private paths/names/IP/tokens generically without shipping
 * internal infrastructure literals or hardcoded developer names.
 */

const PRIVATE_SCOPE = '@goodandready-private/dsh-gitea'
const PUBLIC_SCOPE = 'dsh-gitea'

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function sanitizeForPublic(text = '', options = {}) {
  let res = String(text).split(PRIVATE_SCOPE).join(PUBLIC_SCOPE)

  // Generic home directory and mount path sanitization
  res = res.replace(/\/home\/[A-Za-z0-9._-]+(?=[/\s'"`]|$|\b)/g, '/home/user')
  res = res.replace(/\/mnt\/[A-Za-z0-9._-]+(?=[/\s'"`]|$|\b)/g, '/path/to')
  res = res.replace(/(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}/g, '127.0.0.1')

  // Usernames to scrub: explicit options only (#46). `process.env.USER` used to
  // be scrubbed as a bare word too, which corrupts the public product identity
  // whenever the login is a product word: on this host `USER=dsh`, so every
  // `dsh-gitea` became `user-gitea`, and a login like `git` would rewrite prose.
  // The home-path rewrite above already covers the real disclosure vector; a
  // caller that wants a name scrubbed passes `username`/`usernames` explicitly.
  const explicitUsers = [options.username, options.usernames].flat().filter(Boolean)
  const allUsers = [...new Set(explicitUsers)]

  for (const u of allUsers) {
    if (u && typeof u === 'string' && u !== 'user') {
      res = res.replace(new RegExp(`\\b${escapeRegExp(u)}\\b`, 'g'), 'user')
    }
  }

  // Tokens or secrets to redact
  const tokens = [options.tokens, options.secrets].flat().filter(Boolean)
  for (const t of tokens) {
    if (t && typeof t === 'string' && t.length >= 8) {
      res = res.split(t).join('0'.repeat(t.length))
    }
  }

  return res
}

export async function prepareMirror(args = {}, deps = {}) {
  const source = args.source || 'gitea'
  const target = args.target || 'github'
  return {
    ok: true,
    data: {
      dryRun: true,
      source,
      target,
      steps: [
        '1. fetch clean gitea main',
        '2. sanitize history (paths/names/token/scope) via sanitizeForPublic',
        `3. push to ${target} as main`,
        '4. verify: clone audit (no personal data)',
      ],
      note: 'Dry-run plan. Actual push is executed as an external step (outside plugin).',
    },
  }
}
