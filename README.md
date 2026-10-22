# 🏴 @goodandready/dsh-gitea — private deployment fork

<div align="center">

**Gitea/Forgejo integration for DeepSeek Harness — our fork, maintained for our server.**

[Upstream project](https://github.com/GooDAnDReaDY/dsh-gitea) · [LICENSE](LICENSE) · [AGENTS.md](AGENTS.md)

</div>

---

This repository is a **private fork** of
[`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea) (MIT),
kept to run the plugin on our own DeepSeek Harness server. It is not a
redistribution: the DSH profile installs this checkout as a `link:` dependency,
and the package is never published to npm under the upstream name.

**The fork is our development trunk. Upstream is watched, not developed
against.** Its public GitHub tree is generated from the author's private source
repo (every commit is `chore(publish): sanitized tree from <sha>`), so a PR
against generated files can be lost on the next publish. We sync deliberately,
keep our patch set small, and tag what is live. The full operational contract —
DSH slot matrix, settings contract, install loop, failure table — lives in
[AGENTS.md](AGENTS.md).

- Fork version: `0.7.40-dsh.1` (see [Versioning](#versioning))
- Base: upstream `abfd952`, checked against DSH `0.2.0-rc.2` and Forgejo
  `17.0.0+gitea-1.22.0`

## What it does

`@goodandready/dsh-gitea` connects the Harness to a self-hosted Gitea or Forgejo
instance and gives the agent structured, safety-railed access to it:

- **20+ agent tools** — issues (create/update/comment/close, timeline,
  duplicates, templates), pull requests (list/get/create/merge/review/line
  comments/conflicts), branches, tags, releases, packages, wiki, milestones,
  labels, CI runs and log analysis, worktrees, repository search.
- **Settings page** under **Settings → Gitea** (and the Plugins row's
  Configure page) — connection, credentials, defaults, webhooks, background
  triage, and the plugin-update switch.
- **Git status chip** in the session header with branch/ahead/behind state, a
  commit graph, and recent events.
- **Event feed and webhooks** — `POST /dsh-gitea/webhook` with HMAC
  verification, an in-memory event store, and an SSE stream.
- **Hub, CI RCA, release assistant, issue-template pack, worktree isolation** and
  the `dshGitea` / `giteaEvents` composition services for other DSH plugins.

## Why this fork exists

The upstream build works, but on DSH 0.2.x its settings page never appeared: it
registered the removed `settings.plugin.item` seat and gated the form on the
browser `configForms` mirror, which reports `unavailable` on non-loopback pages.
There was also an HTTP-guard bug that turned admitted Tailscale/LAN requests into
`403`. This fork carries those fixes plus the deployment glue for a local
`link:` install.

Fork-specific changes (on top of upstream `abfd952`):

| Change | Why |
|:--|:--|
| `settings.section` registration (`Settings → Gitea`) | the removed `settings.plugin.item` seat rendered nowhere on 0.2.x |
| Route-backed settings form (`GET/POST /dsh-gitea/config`) with `writable` + Retry | `configForms` snapshots are memory-only on remote pages and hid every field |
| `lib/http-guard.js`: a mounted DSH Connection fence is authoritative | admitted reverse-proxy/Tailscale requests fell through to the loopback-only fallback and became `403` |
| `scripts/dev-link-dsh.mjs` (`npm run dev:link`) | pnpm `link:` installs do not resolve the plugin's DSH peers |
| `updates` Config off-switch, disabled in this profile | the one-click npm updater would replace this checkout with the upstream tarball and revert every fork patch |
| `test/` + `scripts/leak-scan.mjs` | upstream's public tree ships its test script but not the tests; ours are real and runnable |
| This README set + AGENTS.md, fork version/tags | the fork is a maintained project, not an anonymous snapshot |

## Requirements

- DeepSeek Harness `0.1.7-rc.2` / `0.2.0-rc.x` (see `peerDependencies`)
- Node.js 20+
- `pnpm` (used by Plugin Manager for profile installs)
- Gitea or Forgejo reachable over HTTPS from the DSH server

## Install into a DSH profile

The profile files live **outside** this repository (`<profile>/package.json`,
`<profile>/cordis.patch.yml`). Prefer the Harness tools over hand-editing them.

### 1. Bootstrap the checkout (once)

```bash
cd /path/to/dsh-gitea
node scripts/dev-link-dsh.mjs        # alias: npm run dev:link
```

Plugin Manager installs an absolute path with pnpm's `link:` protocol, and pnpm
does not resolve a linked package's peers/dependencies from the target
directory. Without this step the plugin row shows `failed to import`
(`Cannot find package '@deepseek-ai/schemastery'`). The script only symlinks
packages from the running DSH installation into this checkout's gitignored
`node_modules/`; it never writes to the DSH install. A registry install does not
need it.

### 2. Install the bundle

Preferred, through the Harness tools:

```
plugin_manager action=install_bundle target=/path/to/dsh-gitea enabled=true
```

CLI alternative (needs a profile-capable shell; the workspace file sandbox may
deny it):

```bash
dsh plugin --profile web add /path/to/dsh-gitea
```

If Plugin Manager fails with `spawn pnpm ENOENT`, `pnpm` is not on the DSH
server's `PATH`. Name it explicitly in the profile patch:

```yaml
- id: plugin-manager
  name: "@deepseek-ai/dsh-plugin-manager"
  config:
    pnpmCommand: /opt/node/bin/pnpm    # wherever pnpm lives
```

### 3. Reload after code changes

`link:` installs are served from this checkout, but the Host half is a loaded
module:

- Toggle the bundle off and on (`plugin_manager action=set_bundle ...`), or
- opt the checkout into HMR in the profile patch:

  ```yaml
  - id: hmr
    config:
      root: ["/path/to/dsh-gitea"]
  ```

  With the HMR root, Host edits reload without restarting `dsh web`. The client
  bundle is served per request; hard-refresh the page (`Ctrl+F5`) after changing
  `lib/client.js`.

### 4. Verify

```bash
plugin_manager action=list_bundles                                  # bundle enabled?
curl -s http://127.0.0.1:3080/dsh-gitea/config | head               # 401 without a session = expected
```

In the Web UI: **Settings → Gitea** exists and lists fields, the Plugins row has
**Configure**, the session header shows the Git chip in a git workspace.

## Configure

Open **Settings → Gitea** (or **Plugins → the bundle row → Configure**).

| Field | Default | Meaning |
|:--|:--|:--|
| `baseUrl` | — | Gitea/Forgejo base URL, for example `https://gitea.example.com` (use HTTPS when DSH is HTTPS) |
| `tokenEnv` | `GITEA_TOKEN` | **Name of a DSH credential**, never the token itself |
| `defaultOwner` / `defaultRepo` | — | fallbacks for tool calls that omit owner/repo |
| `updates` | `true` (**`false` here**) | expose the one-click npm updater; keep off on this fork |
| `timeoutMs` | `30000` | REST timeout |
| `forceHttpsUrls` | `false` | rewrite `http://` `html_url`s when behind a TLS proxy |
| `webhookSecretEnv` | — | credential name holding the webhook HMAC secret |
| `notifyWebhook` | — | external URL for PR/CI push notifications |
| `bgScheduler*` | off | background triage/health scheduler |
| `instances` | `[]` | additional Gitea instances (read-only in the UI; set in the config document) |
| `gitWrapper` | — | git wrapper binary for worktree write operations |
| `dodReminder` | `false` | non-blocking Definition-of-Done reminder |

### Credential

Create the API token **in Forgejo/Gitea** (Settings → Applications), then store
it in **DSH credentials** under the name configured in `tokenEnv` (default
`GITEA_TOKEN`). The settings form only ever accepts the credential *name*; a
token-shaped value is rejected. Until the credential exists, the settings page
shows "Token not configured" and tools fail to authenticate.

## Security model

- No token material in this repository, in chat, or in the settings form — only a
  credential reference.
- Custom routes go through `lib/http-guard.js`: when a DSH Connection service is
  mounted it is authoritative (401 unauthenticated / 403 fence); otherwise the
  fallback is loopback-only and fail-closed.
- Webhooks are verified with HMAC-SHA256 via `webhookSecretEnv`; a missing secret
  answers 401 instead of processing the payload.
- The plugin updater is **double-gated**: loopback-only requests with the
  `x-dsh-plugin-update` header *and* the `updates` Config switch. This profile
  keeps it off so an npm install cannot replace the fork checkout.
- `npm run test:leaks` fails the build on private home paths, npm scopes, token
  literals, or Cyrillic in shipped JS.

## Upstream policy and sync

- `origin` — our private Forgejo. The only push target.
- `upstream` — `https://github.com/GooDAnDReaDY/dsh-gitea.git`. Fetch only.

Sync deliberately, when an upstream change matters, not on every publish:

```bash
git fetch upstream
git rebase upstream/main     # or merge when the generated bundle is noisy
npm test && npm run test:leaks
```

Conflict hotspots are `package.json` (version line), the top of `CHANGELOG.md`,
and `lib/client.js` (generated bundle — our largest diff). Never push this tree
or its history to GitHub: it contains internal hostnames. If we ever upstream
something, isolate it into a minimal branch or patch file; `lib/http-guard.js` is
self-contained and is the best PR candidate.

## Versioning

- Format: `<upstream base>-dsh.<n>` — currently `0.7.40-dsh.1`.
- Every live state is tagged `v<version>`. Rollback is
  `git checkout v0.7.40-dsh.1`, then toggle the bundle off/on and hard-refresh.
- `CHANGELOG.md` gets a fork entry per release; upstream entries stay untouched.

## Development and checks

```bash
npm test             # regression suite (settings wiring, guard, updater switch)
npm run test:leaks   # publishable-tree hygiene
node --check lib/client.js
node --check lib/index.js
```

`lib/client.js` is a **generated browser bundle** (single
`window.__ModuleLoader__.load` factory). Hand edits there are intentional source
patches, but the upstream author regenerates that file from private TypeScript —
expect merge conflicts there on sync and re-apply our block. There is no browser
automation in this environment; UI changes need a human check in the Web UI.

## Repository layout

| Path | Role |
|:--|:--|
| `lib/index.js` | Host entry: Config schema, settings integration, tools, routes, services |
| `lib/client.js` | Generated web bundle: settings page, Git chip/drawer, action cards, locales |
| `lib/routes.js`, `lib/routes-hub.js` | HTTP endpoints (`/config`, `/events`, `/git-*`, `/sse`, `/hub`, webhook) |
| `lib/http-guard.js` | Route auth/CSRF fence (DSH Connection first, loopback fallback) |
| `lib/plugin-updater.js` | One-click npm updater behind the `updates` off-switch |
| `lib/gitea-client.js` | Gitea REST client (cache, ETags, retries, timeouts) |
| `lib/handlers*`, `lib/tool-defs*` | Tool implementations and schemas |
| `scripts/dev-link-dsh.mjs`, `scripts/leak-scan.mjs` | `link:` bootstrap and hygiene gate |
| `test/*.test.mjs` | Regression checks for the fork's fixes |
| `AGENTS.md` | Deep operational notes for the next agent: slots, contracts, runbooks |

## License

MIT — original work © [GooDAnDReaDY](https://github.com/GooDAnDReaDY); see
[LICENSE](LICENSE). Fork modifications are maintained in this repository.
