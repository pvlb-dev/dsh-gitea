import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildRepoLink, parseRemoteWebUrl } from '../lib/repo-link.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
const routes = readFileSync(join(root, 'lib/routes.js'), 'utf8')
const hostEntry = readFileSync(join(root, 'lib/index.js'), 'utf8')
const gitLocal = readFileSync(join(root, 'lib/git-local.js'), 'utf8')

test('#63: git remotes map to browsable repository URLs', () => {
  const canonical = 'https://git.pvlb.dev/dsh-plugins/dsh-gitea'
  for (const remote of [
    'ssh://git@git.pvlb.dev/dsh-plugins/dsh-gitea.git',
    'git@git.pvlb.dev:dsh-plugins/dsh-gitea.git',
    'https://git.pvlb.dev/dsh-plugins/dsh-gitea.git',
    'https://git.pvlb.dev/dsh-plugins/dsh-gitea/',
  ]) {
    assert.equal(parseRemoteWebUrl(remote), canonical, remote)
  }
  // A non-default SSH port must not leak into the web URL; :22 is the default.
  assert.equal(
    parseRemoteWebUrl('ssh://git@github.com:22/GooDAnDReaDY/dsh-gitea.git'),
    'https://github.com/GooDAnDReaDY/dsh-gitea',
  )
  // Paths below owner/repo are ignored.
  assert.equal(
    parseRemoteWebUrl('https://git.example/owner/repo/src/branch/main'),
    'https://git.example/owner/repo',
  )
})

test('#63: the configured instance decides the scheme for its own host', () => {
  assert.equal(
    parseRemoteWebUrl('http://git.lan:3000/owner/repo.git', { baseUrl: 'http://git.lan:3000' }),
    'http://git.lan:3000/owner/repo',
  )
  assert.equal(
    parseRemoteWebUrl('http://git.lan:3000/owner/repo.git', { baseUrl: 'https://git.lan:3000', forceHttps: true }),
    'https://git.lan:3000/owner/repo',
  )
  // Localhost defaults to http, not https.
  assert.equal(parseRemoteWebUrl('http://localhost:3000/owner/repo'), 'http://localhost:3000/owner/repo')
})

test('#63: local paths and unusable remotes produce no link', () => {
  for (const remote of ['', '/home/dsh/repos/foo', 'file:///home/dsh/repos/foo', 'https://git.example']) {
    assert.equal(parseRemoteWebUrl(remote), '', remote)
  }
})

test('#63: buildRepoLink honors the icon setting and the config fallback', () => {
  const remote = 'ssh://git@git.pvlb.dev/dsh-plugins/dsh-gitea.git'
  assert.deepEqual(buildRepoLink({ remoteUrl: remote }), {
    url: 'https://git.pvlb.dev/dsh-plugins/dsh-gitea',
    icon: 'forgejo',
  })
  assert.equal(buildRepoLink({ remoteUrl: remote, icon: 'gitea' }).icon, 'gitea')
  // Unknown values (Host/client skew) fall back to the default instead of a broken header.
  assert.equal(buildRepoLink({ remoteUrl: remote, icon: 'github' }).icon, 'forgejo')
  assert.equal(buildRepoLink({ remoteUrl: remote, icon: 'none' }), null)

  // No origin remote: the configured owner/repo is the fallback.
  assert.deepEqual(
    buildRepoLink({ baseUrl: 'https://git.pvlb.dev', defaultOwner: 'dsh-plugins', defaultRepo: 'dsh-gitea' }),
    { url: 'https://git.pvlb.dev/dsh-plugins/dsh-gitea', icon: 'forgejo' },
  )
  assert.deepEqual(
    buildRepoLink({ baseUrl: 'https://git.pvlb.dev', defaultOwner: 'dsh-plugins', repoName: 'dsh-gitea' }),
    { url: 'https://git.pvlb.dev/dsh-plugins/dsh-gitea', icon: 'forgejo' },
  )
  assert.equal(buildRepoLink({}), null)
})

test('#63: the Host sends the repo link with the git snapshot', () => {
  // The status route is the only producer; the client must not invent a URL.
  assert.match(routes, /buildRepoLink\(\{/)
  assert.match(routes, /remoteUrl: snap\.remoteUrl \|\| ''/)
  assert.match(routes, /icon: cfg\.repoLinkIcon/)
  assert.match(routes, /snap\.repoLink = buildRepoLink/)
  // The origin remote is captured by the snapshot builder.
  assert.match(gitLocal, /remoteUrl,/)
})

test('#63: the client renders the link in the drawer header with both logos', () => {
  assert.match(client, /const REPO_LOGOS = \{/)
  assert.equal((client.match(/data:image\/svg\+xml;base64,/g) || []).length >= 2, true)
  assert.match(client, /forgejo: 'data:image\/svg\+xml;base64,/)
  assert.match(client, /gitea: 'data:image\/svg\+xml;base64,/)
  assert.match(client, /className: 'dgt-repo-link'/)
  assert.match(client, /rel: 'noopener noreferrer'/)
  assert.match(client, /const repoHref = snap && snap\.repoLink && snap\.repoLink\.url/)
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/)

  // Operator layout (turn 2): the logo and the repository name are ONE link,
  // first in the header row — [logo repo-name][branch] — not an icon parked
  // after the branch badge.
  const anchor = client.indexOf("className: 'dgt-repo-link'")
  const logo = client.indexOf("React.createElement('img', { src: repoIcon", anchor)
  const titleNode = client.indexOf("React.createElement('h3', { className: 'dgt-drawer-title' }", logo)
  const branch = client.indexOf("dgt-drawer-branch-badge' }", titleNode)
  assert.ok(anchor > 0, 'repo link anchor is rendered')
  assert.ok(logo > anchor, 'logo is inside the anchor')
  assert.ok(titleNode > logo, 'repo name follows the logo inside the anchor')
  assert.ok(branch > titleNode, 'branch badge follows the [logo repo-name] link')
  // Without a usable remote the title still renders as a plain heading.
  assert.match(client, /: React\.createElement\('h3', \{ className: 'dgt-drawer-title' \}/)
})

test('#63: the icon is a volatile, saved setting with a Forgejo default', () => {
  assert.match(hostEntry, /repoLinkIcon: z\.string\(\)\.default\('forgejo'\)/)
  assert.match(hostEntry, /repoLinkIcon: z\.string\(\)\.default\('forgejo'\)[\s\S]{0,200}?\.volatile\(\)/)
  assert.match(client, /repoLinkIcon: cfg\.repoLinkIcon === 'gitea' \|\| cfg\.repoLinkIcon === 'none' \? cfg\.repoLinkIcon : 'forgejo'/)
  assert.match(client, /'plugin-config-dsh-gitea-repo-link-icon'/)
  assert.match(client, /repoLink: 'Open repository'/)
  assert.match(client, /repoLink: '打开仓库'/)
})
