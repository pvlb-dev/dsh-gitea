/**
 * Conventional Commits SemVer analyzer & release generator.
 * Implements automated commit parsing, SemVer calculation, structured changelog,
 * and security scanning for release drafts.
 */

const CONVENTIONAL_REGEX = /^([a-zA-Z0-9_-]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/m
const BREAKING_FOOTER_REGEX = /(?:BREAKING CHANGE|BREAKING-CHANGE):\s*([^\n]+)/i
const PR_REF_REGEX = /(?:#(\d+)|\(#(\d+)\)|pull request #(\d+))/i

export const SECTION_TITLES = {
  breaking: '💥 Breaking Changes',
  feat: '🚀 Features',
  fix: '🐛 Bug Fixes',
  perf: '⚡ Performance Improvements',
  security: '🛡️ Security',
  refactor: '♻️ Refactoring',
  docs: '📚 Documentation',
  chore: '🔧 Tooling & Maintenance',
}

export function parseConventionalCommit(rawMessage = '') {
  const text = String(rawMessage || '').trim()
  if (!text) {
    return {
      type: 'other',
      scope: '',
      breaking: false,
      subject: '',
      body: '',
      breakingDescription: '',
      prNumber: null,
      raw: '',
    }
  }

  const lines = text.split('\n').map((l) => l.trim())
  const header = lines[0] || ''
  const body = lines.slice(1).join('\n').trim()

  const match = header.match(CONVENTIONAL_REGEX)
  let type = 'other'
  let scope = ''
  let breaking = false
  let subject = header

  if (match) {
    type = match[1].toLowerCase()
    scope = match[2] || ''
    breaking = Boolean(match[3])
    subject = match[4].trim()
  }

  let breakingDescription = ''
  const footerMatch = text.match(BREAKING_FOOTER_REGEX)
  if (footerMatch) {
    breaking = true
    breakingDescription = footerMatch[1].trim()
  } else if (breaking && !breakingDescription) {
    breakingDescription = subject
  }

  let prNumber = null
  const prMatch = text.match(PR_REF_REGEX)
  if (prMatch) {
    const num = prMatch[1] || prMatch[2] || prMatch[3]
    if (num) prNumber = Number(num)
  }

  return {
    type,
    scope,
    breaking,
    subject,
    body,
    breakingDescription,
    prNumber,
    raw: text,
  }
}

export function calculateSemverBump(commits = []) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return 'patch'
  }

  let hasBreaking = false
  let hasFeat = false

  for (const item of commits) {
    const msg = typeof item === 'string' ? item : (item?.message || item?.title || '')
    const parsed = parseConventionalCommit(msg)
    if (parsed.breaking) {
      hasBreaking = true
      break
    }
    if (parsed.type === 'feat') {
      hasFeat = true
    }
  }

  if (hasBreaking) return 'major'
  if (hasFeat) return 'minor'
  return 'patch'
}

export function bumpVersion(currentVersion = '0.0.0', bumpType = 'patch') {
  const clean = String(currentVersion || '0.0.0').trim().replace(/^v/, '')
  const parts = clean.split('.').map(Number)
  let major = Number.isFinite(parts[0]) ? parts[0] : 0
  let minor = Number.isFinite(parts[1]) ? parts[1] : 0
  let patch = Number.isFinite(parts[2]) ? parts[2] : 0

  if (bumpType === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (bumpType === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }

  return `${major}.${minor}.${patch}`
}

export function scanReleaseTextForSecrets(text = '') {
  const content = String(text || '')
  const warnings = []

  // Check for private IPs (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const ipMatches = content.match(/\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g)
  if (ipMatches) {
    warnings.push(`Internal IP address detected: ${[...new Set(ipMatches)].join(', ')}`)
  }

  // Check for 40-character hex tokens (Gitea / GitHub personal access tokens)
  const tokenMatches = content.match(/\b[a-f0-9]{40}\b/gi)
  if (tokenMatches) {
    warnings.push('Possible secret or access token detected (40-char hex hash)')
  }

  // Check for bearer tokens or key assignments
  const secretPattern = /(?:token|password|secret|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{8,}['"]?/gi
  if (secretPattern.test(content)) {
    warnings.push('Potential credential assignment pattern detected')
  }

  let sanitized = content
  if (ipMatches) {
    for (const ip of ipMatches) {
      sanitized = sanitized.replaceAll(ip, '<internal-ip-redacted>')
    }
  }
  if (tokenMatches) {
    for (const tok of tokenMatches) {
      sanitized = sanitized.replaceAll(tok, '<token-redacted>')
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
    sanitized,
  }
}

export function generateChangelog(commits = [], options = {}) {
  const groups = {
    breaking: [],
    feat: [],
    fix: [],
    perf: [],
    security: [],
    refactor: [],
    docs: [],
    chore: [],
  }

  for (const item of commits) {
    const rawMsg = typeof item === 'string' ? item : (item?.message || item?.title || '')
    const parsed = parseConventionalCommit(rawMsg)
    const author = typeof item === 'object' ? (item.author?.name || item.author?.username || item.author || '') : ''
    const hash = typeof item === 'object' ? (item.sha || item.hash || '') : ''
    const itemData = { ...parsed, author, hash }

    if (parsed.breaking) {
      groups.breaking.push(itemData)
    }

    if (groups[parsed.type]) {
      groups[parsed.type].push(itemData)
    } else if (parsed.type === 'sec' || parsed.type === 'security') {
      groups.security.push(itemData)
    } else if (parsed.type === 'test' || parsed.type === 'ci' || parsed.type === 'build' || parsed.type === 'chore') {
      groups.chore.push(itemData)
    }
  }

  const lines = []
  const order = ['breaking', 'feat', 'fix', 'perf', 'security', 'refactor', 'docs', 'chore']

  for (const key of order) {
    const list = groups[key]
    if (list && list.length > 0) {
      lines.push(`### ${SECTION_TITLES[key]}`)
      for (const entry of list) {
        const scope = entry.scope ? `**${entry.scope}**: ` : ''
        const pr = entry.prNumber ? ` (#${entry.prNumber})` : ''
        const auth = entry.author ? ` by @${entry.author}` : ''
        lines.push(`- ${scope}${entry.subject}${pr}${auth}`)
      }
      lines.push('')
    }
  }

  const markdown = lines.join('\n').trim()
  const sec = scanReleaseTextForSecrets(markdown)

  return {
    markdown: sec.sanitized,
    sections: groups,
    security: sec,
  }
}

export async function buildReleasePlan(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const repo = String(args.repo || deps.settings?.defaultRepo || '').trim()
  const currentVersion = String(args.currentVersion || args.current_version || '0.0.0').trim()
  const fromTag = args.fromTag || args.from_tag || ''
  const toTag = args.toTag || args.to_tag || ''

  let commitList = []
  let usedFromTag = fromTag
  let usedToTag = toTag
  if (Array.isArray(args.commits) && args.commits.length > 0) {
    commitList = args.commits
  } else if (client && client.compareCommits && (fromTag || (currentVersion && currentVersion !== '0.0.0'))) {
    // #28: derive the range from current_version's tag instead of replaying the
    // last 50 commits (which includes already-released work and forces a false
    // major bump). An explicit from_tag still wins; to_tag defaults to the
    // repository default branch.
    const baseTag = fromTag || `v${currentVersion.replace(/^v/, '')}`
    let headRef = toTag
    if (!headRef) {
      const repoRes = await client.getRepo(owner, repo).catch(() => null)
      headRef = repoRes?.ok && repoRes.data?.default_branch ? repoRes.data.default_branch : 'HEAD'
    }
    const cmpRes = await client.compareCommits(owner, repo, `${baseTag}...${headRef}`)
    if (!cmpRes?.ok) {
      return {
        ok: false,
        status: cmpRes?.status ?? 0,
        error: `cannot resolve release range ${baseTag}...${headRef}: ${cmpRes?.error || 'compare failed'}`,
      }
    }
    usedFromTag = baseTag
    usedToTag = headRef
    commitList = Array.isArray(cmpRes.data?.commits)
      ? cmpRes.data.commits.map((c) => ({
        message: c.commit?.message || c.message || '',
        sha: c.sha || '',
        author: c.commit?.author?.name || c.author?.login || '',
      }))
      : []
  } else if (client && client.listCommits) {
    const comRes = await client.listCommits(owner, repo, { limit: 50 })
    if (comRes?.ok && Array.isArray(comRes.data)) {
      commitList = comRes.data.map((c) => ({
        message: c.commit?.message || c.message || '',
        sha: c.sha || '',
        author: c.commit?.author?.name || c.author?.login || '',
      }))
    }
  }

  const bump = calculateSemverBump(commitList)
  const nextVersion = args.target_version || bumpVersion(currentVersion, bump)
  const changelog = generateChangelog(commitList, { owner, repo })

  return {
    ok: true,
    data: {
      owner,
      repo,
      fromTag: usedFromTag,
      toTag: usedToTag,
      currentVersion,
      nextVersion,
      bump,
      changesCount: commitList.length,
      changelog: changelog.markdown,
      sections: Object.fromEntries(Object.entries(changelog.sections).map(([k, v]) => [k, v.length])),
      securitySafe: changelog.security.safe,
      securityWarnings: changelog.security.warnings,
      dryRun: args.dryRun !== false,
      note: 'Release plan generated. Validate version and approve publication according to release workflow.',
    },
  }
}
