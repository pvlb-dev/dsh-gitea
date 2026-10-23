# AGENTS.md — working notes for future agents

This file is for an AI agent (or a human in a hurry) picking up
`dsh-gitea` in this checkout. It records how the plugin is put
together, how it is loaded by the running DeepSeek Harness, what was broken, and
which checks prove a change works. Read it before editing `lib/`.

## Orientation — pvlb.dev

This repo lives on the pvlb.dev forge:
<https://git.pvlb.dev/dsh-plugins/dsh-gitea> and is the **deployment fork** of
the upstream plugin (branch `master`; upstream is watch-only). Before starting,
read the bootcamp page:
<https://git.pvlb.dev/pvlb-infra/vps-setup/wiki/DSH-Bootcamp> — repos and wikis
are private, so read it through an SSH clone, not `web_fetch`.

- Commit as `dsh <dsh@pvlb.dev>` (global, GPG-signed); push when done.
- Every issue is labeled **at creation** with `type/*`, `area/*` and
  `priority/*`; `needs-operator` only when the operator must act. House set:
  `type/task`, `type/bug`; `area/host|backup|forgejo|dsh|security`;
  `priority/now|next|later`.
- This repo owns the `gitea_*` toolset: bugs found by any project agent are
  filed here, one defect per issue, and the table below is the index.
- Environment: DSH `0.2.0-rc.2`, profile `web`, Forgejo 17.0.0; the box has
  1.9 GiB RAM and `workspace-write` forbids `sudo` — ask the operator.

## Issues and labels

Labels are per repository. Every issue gets three axes when it is opened:

| Axis | Values |
|---|---|
| type | `type/task`, `type/bug` |
| area | `area/forgejo` for tool/API/CI work; `area/dsh` for the Harness plugin surface; others only if they fit better |
| priority | `priority/now`, `priority/next`, `priority/later` |

- `needs-operator` only for operator actions/decisions.
- `gitea_issue_create` cannot set labels yet (#6). Create, then
  `gitea_labels {action: "set"}` with **numeric ids**. `gitea_labels list` shows
  the ids since `4d77e9f`; `set` still ignores names until #6. On an older
  plugin build, read ids from
  `GET /api/v1/repos/<owner>/<repo>/labels?limit=100` with `GITEA_TOKEN`.
- Never run `gitea_label_bootstrap`: it hard-codes the upstream taxonomy (#8)
  and would add ~30 foreign labels. Create house labels with
  `gitea_labels {action: "create"}`.
- Triage existing issues by reading them; propose priority changes, do not
  silently rewrite someone else's labels.

## Known tool bugs

One defect = one issue. Add a row when a bug is filed, annotate it with the
fix commit/release when it lands, and close the issue after a live check.
Consumers mirror this table and link here.

| Symptom | Root cause | Workaround | Issue | Status |
|---|---|---|---|---|
| `gitea_issue_list` maxes out at 20 rows | formatter `data.slice(0, 20)` | `limit <= 20`, page through | #2 | fixed in `4d77e9f` |
| empty/unknown results print a bare `OK` | `formatters.js` fallbacks | verify via REST or a second query | #5 | fixed in `4d77e9f` |
| `gitea_labels list` hides numeric ids | generic array formatter | REST `/labels` | #7 | fixed in `4d77e9f` |
| `gitea_repo_contents` returns the path | `formatters.js` `data.path` branch | clone, or REST `/contents/<path>` | #3 | open |
| `gitea_wiki get` returns metadata only | API is metadata-only; no wiki formatter | clone `<repo>.wiki.git` | #4 | open |
| `gitea_issue_create` drops labels/assignee/milestone | `issues.js` create handler + tool def | create, then `gitea_labels set` | #6 | open |
| `gitea_label_bootstrap` uses the upstream taxonomy | `label-bootstrap.js` | create house labels by hand | #8 | open |

Fixing a tool bug = one issue, one PR, a formatter test, and a row update in
this table — same sitting.

## What this repository is

- A DSH **profile bundle + plugin** that connects the Harness to a self-hosted
  Gitea/Forgejo instance: 20+ agent tools, HTTP routes, a Git status chip in the
  session header, and a settings page.
- This checkout is **our private deployment fork** of the upstream public repo
  [`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea) (MIT).
  `origin` is our Forgejo, `upstream` is the GitHub project. The policy is
  **watch upstream, never develop against it** — see "Fork status and upstream
  sync" below.
- Upstream's public GitHub tree is the **sanitized publish output of a private
  development repo**: every upstream commit is `chore(publish): sanitized tree
  from <sha>`. `lib/` is what ships; there is no `src/` and no client build step
  in the public tree, and `lib/client.js` is a **generated browser bundle**
  (single `window.__ModuleLoader__.load` factory). The sanitizer strips upstream
  tests, `.gitea/`, `docs/`, and some scripts, so up there `npm test` points at
  files that do not exist. Consequence: our `lib/*` edits are real source patches
  here, but they only reach upstream if the author ports them into the private
  source. Treat the public tree as a vendored artifact, not as a contribution
  target for generated files.
- Package identity: `dsh-gitea` (renamed from the upstream
  `@goodandready/dsh-gitea`; the old scoped package stays in the registry for
  pinned installs). The bundle row id and Settings namespace stay `dsh-gitea`, so
  the `plugins.row.config` key is now `dsh-gitea#dsh-gitea`.
  Fork version: `0.7.40-dsh.6` (see "Versioning and tags"). Runtime peer line:
  DSH `0.1.7-rc.2` / `0.2.0-rc.x` (`peerDependencies`).
- Remotes:
  - `origin` = `ssh://git@git.pvlb.dev/dsh-plugins/dsh-gitea.git` — our private
    Forgejo, the **only** push target.
  - `upstream` = `https://github.com/GooDAnDReaDY/dsh-gitea.git` — fetch only.

## This deployment (facts checked on 2026-10-22)

- Harness: `dsh 0.2.0-rc.2`; the installed package is the `@deepseek-ai/dsh`
  directory in `node_modules` (resolve it from the running `dsh` binary or
  `$DSH_PACKAGE_DIR`).
- Profile: `web`, directory `$DSH_PROFILE_DIR`; Web GUI on
  `http://127.0.0.1:3080` (also served to the tailnet through a reverse proxy on
  a trusted HTTPS hostname).
- The profile patch is `<profile>/cordis.patch.yml`; profile dependencies are in
  `<profile>/package.json`. Both are **outside this workspace**.
- `pnpm` is installed beside the node binary (for example `/opt/node/bin/pnpm`),
  but that directory is **not on the DSH server's PATH**. Two consequences:
  1. Plugin Manager's install/remove fails with `spawn pnpm ENOENT`.
  2. The profile patch must name it explicitly:
     ```yaml
     - id: plugin-manager
       name: "@deepseek-ai/dsh-plugin-manager"
       config:
         pnpmCommand: /opt/node/bin/pnpm
     ```
     Keep that entry (schema defaults fill the other fields).
- Installed in the profile as a **`link:` dependency** to this checkout (that is
  what Plugin Manager does for an absolute local path). The `dev:link` bootstrap
  below is required for such an install.
- The profile patch also opts this checkout into HMR while developing:
  ```yaml
  - id: hmr
    config:
      root: ["/path/to/dsh-gitea"]
  ```
  With that root, Host-half edits are picked up without restarting `dsh web`.
  Without it (default `root: []`), Host code changes need a restart; the client
  bundle is served per-request and reloads with a page hard-refresh.
- Commit identity for this repo: `dsh <dsh@pvlb.dev>`.
- Logs: the web service writes to journald
  (`journalctl -u dsh-web -n 100 --no-pager`); `dsh plugin`/pnpm install
  diagnostics live in `<profile>/.plugin-manager/logs/operation-*/pnpm.log`.

## Fork status and upstream sync

- **We watch upstream; we do not develop against it.** The GitHub tree is
  generated from the author's private source and has no CI; a PR touching
  generated `lib/client.js` can be dropped on the next `chore(publish)`.
- Current base: upstream `abfd952` (`chore(publish): sanitized tree from
  e30e98ab`). Our commits on top: settings UI/install fixes, the HTTP guard fix,
  the tool trust patch, the fork identity, and the CI/publishing + own-registry
  updater. Keep them small and Conventional so rebases stay cheap.
- Sync deliberately, when an upstream change actually matters — not on every
  publish:
  ```bash
  git fetch upstream
  git rebase upstream/main     # or merge when the generated bundle is noisy
  npm test && npm run test:leaks
  ```
  Conflict hotspots: `package.json` (version line), the top of `CHANGELOG.md`,
  and `lib/client.js` (generated bundle — our largest diff). Keep our functional
  patch, re-run the checks, toggle the bundle off/on, hard-refresh the browser.
- Never push this tree to GitHub: it carries internal hostnames in `AGENTS.md`
  and a fork-specific README. If we ever upstream something, isolate it into a
  minimal branch or a patch file (`lib/http-guard.js` is self-contained) and keep
  internal-context files out of it.
- Publish only to our Forgejo npm registry (via CI); never to the public npm
  registry. This deployment's dev checkout installs by local path (`link:`),
  and the published package is what the updater consumes.

### Versioning and tags

- Version format `<upstream base>-dsh.<n>` (currently `0.7.40-dsh.6`): semver
  valid, visibly a fork, and still comparable to upstream releases.
- Tag every state that is live on the server as `v<version>` (for example
  `v0.7.40-dsh.6`). Rollback = `git checkout <tag>`, toggle the bundle off/on,
  hard-refresh.
- Add a fork entry to `CHANGELOG.md` per release; leave upstream entries intact.

## CI and releases

- `.forgejo/workflows/ci.yml` runs on pushes to `master` (and manual dispatch):
  `npm run check` plus `npm pack --dry-run`. There is no `pull_request` trigger:
  the shared runner gives job containers the host's rootless Docker socket, so
  only maintainer-controlled events may execute a workflow.
- `.forgejo/workflows/publish.yml` runs on `v*` tags (manual dispatch is a dry
  run), re-runs the checks, requires the tag to equal
  `v<package.json version>`, and publishes to
  `https://git.pvlb.dev/api/packages/dsh-plugins/npm/`. It skips a version that
  already exists. The repo secret `NPM_TOKEN` holds a Forgejo token with the
  `write:package` scope; a tag push is the only way a package is published.
- The package is `dsh-gitea` (the upstream `@goodandready/dsh-gitea` name is
  retired here) and is published only to our private Forgejo registry — never to
  npmjs.
- Release ritual: bump `package.json` + `CHANGELOG.md`, commit, push `master`,
  then `git tag -a v<version> -m "…" && git push origin v<version>`.
- Install a published build from its tarball (dependencies resolve from npmjs):
  ```bash
  dsh plugin --profile web add \
    https://git.pvlb.dev/api/packages/dsh-plugins/npm/dsh-gitea/-/<version>/dsh-gitea-<version>.tgz
  ```
  The in-UI updater instead runs `dsh plugin add dsh-gitea@<version>` with a
  temporary `.npmrc` that points the package at our registry and the
  `@deepseek-ai` peer scope at npmjs.

## Ground rules

1. **Use the Harness tools, not shell writes, for the profile.** Changes to the
   profile (`package.json`, `cordis.patch.yml`, `node_modules`) are global to
   every session. Use `plugin_manager` (`install_bundle`, `set_bundle`,
   `remove_bundle`) and `cordis_inspect_query`. Hand-writing profile files needs
   explicit approval and is the exception.
2. **Never put a real Gitea token in this repo, chat, the UI, or a commit.**
   The plugin stores only a *credential reference name* (`GITEA_TOKEN`) and
   resolves the secret through DSH credentials at call time.
3. **Keep the client bundle dependency-light.** It may `require('react')` (the
   platform seed). Anything else must be a Cordis service reached through
   `ctx.get(...)`; do not import `@deepseek-ai/dsh-client-ui-*` packages into the
   bundle or the browser module graph will fail to resolve it.
4. **Do not reorder or rename the bundle patch row id** (`dsh-gitea`). Both the
   settings namespace and the `plugins.row.config` key depend on it.
5. **Commit in Conventional Commits style**, identity `dsh <dsh@pvlb.dev>`, and
   push only to `origin/master` (no force push).
6. **The updater installs our own package, not upstream's.** It reads
   `dist-tags.latest` from
   `https://git.pvlb.dev/api/packages/dsh-plugins/npm/` and runs
   `dsh plugin add dsh-gitea@<version>` with a throwaway `.npmrc`. The `updates`
   Config flag gates both the UI and
   `/api/dsh-gitea/update` (`isEnabled` in `lib/index.js`); this profile keeps it
   `false` for the `link:` dev checkout. Enabling it lets the next update replace
   that checkout with the published package — deliberate, not an accident.
7. **Fork identity:** keep the package name and bundle row id, publish only to
   our Forgejo npm registry through CI (never to the public npm registry), and
   do not add GitHub as a push remote.

## Repository map

| Path | Role |
|:--|:--|
| `lib/index.js` | Host entry: Config schema, Settings integration, tool registration, services (`dshGitea`, `giteaEvents`), HTTP route wiring |
| `lib/client.js` | Generated web bundle: settings form/page, Git chip + drawer, action cards, events panel, locale dictionaries |
| `lib/routes.js` | `/dsh-gitea/config`, `/events`, `/git-status`, `/git-graph`, `/sse`, `/hub`, `/release-assistant`, webhook |
| `lib/routes-hub.js` | Interactive Hub action dispatcher used by `POST /dsh-gitea/hub` |
| `lib/http-guard.js` | Host/Origin/CSRF fence + DSH Connection authentication for custom routes |
| `lib/gitea-client.js` | Gitea REST client (cache, ETags, retry, timeouts) |
| `lib/plugin-updater.js` | One-click updater: Forgejo registry packument, unscoped install, loopback fence + `updates` switch |
| `lib/handlers.js`, `lib/handlers/*` | Tool implementations; `lib/tool-defs.js`, `lib/tool-defs/*` hold schemas |
| `lib/settings`-related | Settings live in `lib/index.js` (`Config`, `readServedConfig`, `servedScope`); UI in `lib/client.js` |
| `assets/issue-templates/` | Issue form templates the plugin can install |
| `cordis.patch.yml` | Bundle patch: inserts the `dsh-gitea` row with empty config |
| `.forgejo/workflows/` | `ci.yml` (push checks) and `publish.yml` (tag → Forgejo npm registry) |
| `scripts/dev-link-dsh.mjs` | Links DSH peer packages into this checkout for `link:` installs |
| `scripts/leak-scan.mjs` | Fails on private paths/scopes/tokens/Cyrillic in the publishable tree |
| `test/*.test.mjs` | Fork regression checks (`npm test`); upstream ships no tests, so this suite is ours |

## How DSH 0.2.x loads this plugin

### Host half

- `package.json → dsh.bundle.patch` points at `cordis.patch.yml`; the patch
  inserts one Loader row with `id: dsh-gitea`.
- `dsh.client` declares the browser half: `platform: web` and `inject` (a
  **module-graph ordering hint**, not imports).
- The Loader entry gets id `include:dsh-gitea` while its patch/row id stays
  `dsh-gitea`. This distinction matters:
  - `cordis_inspect_query Config.listConfigs` shows `patchId: dsh-gitea`,
    `id: include:dsh-gitea`.
  - The Settings namespace is the **patch id** (`entry.options.id`), i.e.
    `dsh-gitea`. `settings.describe()` rows carry `ns: "dsh-gitea"`;
    `settings.update("dsh-gitea", patch, revision)` is the write. Do not switch
    this to the `include:` id.
- `inject: ['tools', 'credentials', 'settings', 'webServer']` is a *hard*
  dependency list: if one is missing the host half does not start.

### Client half and the slot matrix (checked against 0.2.0-rc.2)

| Seat | Status in 0.2.0-rc.2 | Used here |
|:--|:--|:--|
| `settings.section` | exists, list, one settings page per entry | **primary** settings page, `id: dsh-gitea`, label `Gitea` |
| `plugins.row.config` | exists, keyed by `<package>#<row id>` | **canonical config page** on Plugins → bundle → row → Configure; key `dsh-gitea#dsh-gitea` |
| `plugins.item` | exists but is the **official plugins** seat | kept only as a legacy compatibility card |
| `settings.plugin.item` | **does not exist** | inert legacy fallback; registration waits forever, harmless |
| `conversation.session.header.utilities` | exists, session list | Git status chip |

- `ctx.slots.inject(key, () => ctx.slots.register(options, Component))` waits
  for a slot to be declared. An unknown slot therefore never registers and never
  throws; absence of a UI usually means the wrong slot name, not a crash.
- Keyed slots need the exact key; a mismatched key silently renders nowhere.
- The page component receives `view: 'summary' | 'page'` from the Plugins page;
  Settings sections receive their own standard props and `t`-less localization.
  The bundle passes `locale` through `inject: () => ({ ctx })` plus a
  `useActiveLocale(ctx)` hook.

### Settings contract

- Only fields with `.volatile()` (directly or via a volatile ancestor) appear in
  DSH settings forms. All live plugin fields in `lib/index.js` are marked
  `.volatile()` — keep it that way for new fields, otherwise the form projection
  drops them.
- The UI form does **not** use the browser `configForms` service. Reasons:
  - `configForms` snapshots are `unavailable` on non-loopback pages (remote DSH
    sessions keep preferences process-local), which previously hid the entire
    form behind one message on LAN/Tailscale URLs.
  - The plugin already owns a Host route with its own auth fence and validation.
  The form loads `GET /dsh-gitea/config` and saves with a single
  `POST /dsh-gitea/config`; the response reports `writable` so a form can render
  read-only instead of disappearing when the Host Settings service is absent.
- `servedScope.update()` persists through `settings.update(ns, section, revision)`
  and only then updates the in-memory config. Do not make it optimistic.
- `settings/document-updated` is emitted as `(namespace, revision)`; the host
  handler re-reads the served document for `dsh-gitea` so writes from any other
  settings surface become live.
- `updates` (default `true`) is the fork **updater off-switch**. It is a volatile
  Config field, so it renders in the form and persists through the same POST.
  When `false`, the form hides the auto-updater panel and skips the registry
  check, and `lib/index.js` passes `isEnabled: () => live().updates !== false` to
  the updater, which answers 403 `code: "disabled"` on every request. This
  deployment keeps it `false` (see Ground rule 6).

### HTTP routes

- Custom routes are registered through `ctx.webServer.register({ kind: 'exact', path, handler })`.
- They must call `rejectUntrustedRequest`/`rejectUntrustedWrite` from
  `lib/http-guard.js`. That delegates to `ctx.connection.requestRejection` when
  available (401/403 for unauthenticated remote clients) and otherwise falls
  back to loopback-only, same-origin checks.
- When a DSH Connection service is mounted, its fence is **authoritative for both
  reads and writes**: it knows the deployment's trusted authorities and the
  browser session cookie. `getRejectionStatus` must return immediately once
  `requestRejection` returns `undefined`; falling through to the loopback-only
  fallback turned admitted Tailscale/LAN requests into `403`. Do not reintroduce a
  duplicate Host/Origin comparison after the Connection admitted a write.
- Browser `fetch` from the GUI sends the auth cookie; shell `curl` without it
  correctly gets `401 {"code":"unauthorized"}`. That 401 is expected, not a
  route bug. A `403` *with* a valid session over a trusted hostname is the guard,
  not authentication.
- `/api/dsh-gitea/update` is special: it is registered by `lib/plugin-updater.js`
  and enforces its own extra fence — loopback socket, `x-dsh-plugin-update: 1`,
  same-origin Host/Origin — on top of the Config `updates` off-switch. Both
  gates apply before any npm command runs.

## Install / development loop

### 1. Bootstrap a local checkout (once)

```bash
cd /path/to/dsh-gitea
node scripts/dev-link-dsh.mjs     # alias: npm run dev:link
```

Why: Plugin Manager installs an absolute path with pnpm's `link:` protocol, and
pnpm does not resolve a linked package's peers/dependencies from the target
directory. Without this step the row shows `failed to import`
(`Cannot find package '@deepseek-ai/schemastery'`). The script symlinks the
needed packages from the running DSH install into `node_modules/` (gitignored)
and never modifies the DSH install. A registry install does not need it.

### 2. Install / reload in the profile

Preferred (agent tools, approval may be required):

```
plugin_manager action=install_bundle target=/path/to/dsh-gitea enabled=true
```

To pick up code changes in a `link:` install, toggle the bundle off and on:

```
plugin_manager action=set_bundle target=dsh-gitea enabled=false
plugin_manager action=set_bundle target=dsh-gitea enabled=true
```

`application: "applied"` means the change is live. `application: "failed"` plus
an `error.diagnostic` (e.g. `failed to import`) is the failure to read first.
Hard-refresh the browser if the client bundle was not hot-reloaded.

CLI alternative (needs a profile-capable shell; outside this workspace the file
sandbox may deny it): `dsh plugin --profile web add /path/to/checkout`.

Registry install (published package) instead of a checkout:

```bash
dsh plugin --profile web add \
  https://git.pvlb.dev/api/packages/dsh-plugins/npm/dsh-gitea/-/<version>/dsh-gitea-<version>.tgz
```

The tarball install resolves dependencies from npmjs normally. The in-UI updater
uses `dsh plugin add dsh-gitea@<version>` with a temporary `.npmrc` that points
the package at our registry and the `@deepseek-ai` peer scope at npmjs.

A registry install needs no `dev:link`; the DSH peers come from the profile.

### 3. Verify without a browser

```
# Bundle/row inventory and live enablement
plugin_manager action=list_bundles

# The Config schema reached the Loader (status "schema" is healthy)
cordis_inspect_query host Config listConfigs {"name":"dsh-gitea"}

# Agent tools registered (gitea_* show up in the tool list)
cordis_inspect_query host Tool listTools

# Client seats occupied by this plugin
cordis_inspect_query client Slots listSubTree {"root":"settings.section"}
cordis_inspect_query client Slots listSubTree {"root":"plugins.row.config"}
cordis_inspect_query client Slots listSubTree {"root":"conversation.session.header.utilities"}
```

A healthy client registration appears as an occupant with
`"registrant": "mf"` (module federation) in the slot's `selected.occupants`.

### 4. Local checks

```bash
npm run check       # tests + leak scan + node --check (the CI gate)
npm test            # mirror-safe regression suite
npm run test:leaks  # publishable-tree hygiene
node --check lib/client.js
node --check lib/index.js
```

The browser bundle cannot be executed by `node --check` beyond syntax; a
runtime check needs the Web UI (see below). `node --check` is still the cheapest
regression gate for edits to `lib/client.js`.

## Verification limitations and how to cover them

- There is no browser-control tool in this environment. Slot occupancy, the Host
  Config schema, and the tool list prove *registration*, not what a human sees.
  Say so explicitly in reports. If a browser is available, verify: Settings has
  a **Gitea** entry; the form lists fields; values load; Save persists across a
  reload; the **Plugin Updates** switch is off and the auto-updater panel is
  absent; the Plugins page row shows Configure; the session header shows the Git
  chip in a git workspace.
- The settings form talks to `/dsh-gitea/config` with an authenticated cookie;
  an unauthenticated `curl` gets 401 by design and cannot substitute for the
  browser check.
- A `link:` install's client bundle is served by path: changing
  `lib/client.js` and toggling the bundle is the supported reload path.

## Common failures

| Symptom | Likely cause | Fix |
|:--|:--|:--|
| Plugin row `failed to import`, Host tools missing | `link:` install without peer resolution | `npm run dev:link`, then toggle the bundle |
| Install fails with `spawn pnpm ENOENT` | `pnpm` missing from the server's PATH | set `plugin-manager.pnpmCommand` in the profile patch |
| No Gitea entry under Settings | wrong/known-dead slot (`settings.plugin.item`) or client bundle not loaded | register `settings.section`; check slot occupants; hard-refresh |
| Settings page renders only "unavailable" | form gated on browser `configForms` (memory mode on non-loopback) | use the Host route + `writable` response (already implemented) |
| Settings page shows `HTTP 403` over a LAN/Tailscale URL | Connection admitted the request but the guard fell through to the loopback-only fallback (fixed), or the Host-half module is stale | update `lib/http-guard.js`; reload Host code (HMR root or restart `dsh web`); hard-refresh the page |
| Configure page missing on Plugins | row key mismatch | key must be `dsh-gitea#dsh-gitea` |
| Settings fields empty / not projected | Config field without `.volatile()` | mark the field volatile |
| Save appears successful but is lost on restart | write bypassed the Settings service | persist via `servedScope.update`; check `writable` |
| Settings page has no Plugin Auto-Updater panel | `updates: false` — the fork default in this profile | expected; enabling it lets the Forgejo registry package replace the `link:` checkout |
| `/api/dsh-gitea/update` answers 403 `code: "disabled"` | Config `updates: false` | expected on this fork; never remove the gate |
| A `link:` checkout was replaced by the published package | the updater (or a manual `dsh plugin add`) installed the registry tarball | `git checkout v0.7.40-dsh.6`, toggle the bundle off/on, keep `updates: false` for dev |
| Plugin update fails with `Plugin update failed: …` | `dsh plugin` cannot find pnpm on the DSH unit's PATH, or pnpm itself failed | check `<profile>/.plugin-manager/logs/operation-*/pnpm.log`; 0.7.40-dsh.6 prepends the Node bin dir and `PNPM_HOME` to the updater PATH |
| Tools resolve wrong owner/repo | no `defaultOwner`/`defaultRepo` and no git origin in the session cwd | configure defaults or pass owner/repo |
| Plugin silently absent after a DSH upgrade | peer range does not name the new prerelease line | extend the `peerDependencies` range for every `@deepseek-ai/dsh-*` peer |

## Security invariants

- Tokens only via `credentialRef`/DSH credentials; the settings form accepts a
  credential *name*, never a token. `credentialRefStatus` rejects token-shaped
  input.
- Webhook verification uses HMAC-SHA256 through `webhookSecretEnv`; missing
  secret means the route answers 401 instead of processing the payload.
- Custom routes stay behind `rejectUntrusted*`; the loopback fallback is
  fail-closed for unknown remote addresses.
- The leak scanner must stay green: no private home paths, private scopes,
  token literals, or Cyrillic in shipped JS. Add new exceptions only with a
  comment explaining why the literal is publishable.
- The updater is double-gated: loopback-only request fence in
  `lib/plugin-updater.js` **and** the `updates` Config switch. It reads versions
  from our Forgejo registry and installs through a temporary `.npmrc`;
  without the switch it can replace a `link:` checkout with the published
  package.
- Do not add network calls to the settings form path that are not same-origin.

## Known limitations / next steps

- `lib/client.js` is built output; when the private TypeScript source is next
  regenerated, the settings-section registration and the route-backed form must
  be carried over there (or this fix will regress on the next publish).
- The one-click updater points at our Forgejo registry but this profile keeps it
  **disabled** (`updates: false`) for the `link:` dev checkout. Enabling it
  replaces the checkout with the published package; the registry tarball carries
  the fork code, so no patches are lost.
- Additional `instances` are displayed read-only in the UI; they are configured
  through the profile/config document.
- `plugins.item` remains registered for older DSH cores; on 0.2.x it is only a
  legacy compatibility card and may appear in the Plugins page's official group.
- Browser-visible verification still needs a human or a browser-capable agent.

## Session log (2026-10-22)

Diagnosis and changes made while restoring the settings UI:

1. The plugin was absent from the active profile; installing the local checkout
   failed with `failed to import` because the `link:` install could not resolve
   `@deepseek-ai/schemastery` (and other peers). Fixed locally with
   `scripts/dev-link-dsh.mjs`; installs then applied.
2. The client half was loaded and registered `plugins.item`,
   `plugins.row.config`, and the session-header chip, but registered the removed
   `settings.plugin.item` seat, so nothing appeared under Settings on 0.2.x.
   Added `settings.section` (`Settings → Gitea`) and kept the keyed row seat.
3. The form itself gated on the browser `configForms` mirror, which reports
   `unavailable` on non-loopback pages, hiding every field. The form now uses
   the Host `/dsh-gitea/config` route, reports `writable`, and retries on read
   failure.
4. Documented the install/verification loop here and in `README.md`; added
   mirror-safe tests and a leak scan so `npm test` / `npm run test:leaks` work in
   the public tree.
5. The remaining `HTTP 403` on a Tailscale-served page came from
   `lib/http-guard.js`: after `connection.requestRejection()` admitted a request
   it returned `undefined`, but the guard then fell through to its own
   loopback-only fallback and rejected the trusted hostname. The guard now treats
   a mounted Connection as authoritative for reads and writes; regression tests
   cover an admitted non-loopback request. Host code changes need a Host reload
   (HMR root or `dsh web` restart) before they are observable.

## Session log — fork hardening (2026-10-22, later)

After the settings UI worked and the plan to keep this as a living fork was
accepted:

1. Found that the one-click updater would install
   `@goodandready/dsh-gitea@<npm latest>` over the `link:` checkout and silently
   revert every fork patch. Added a volatile `updates` Config boolean (default
   `true`), wired `isEnabled: () => live().updates !== false` into
   `lib/plugin-updater.js` (all requests answer 403 `code: "disabled"` when off),
   hid the updater panel and skipped its registry poll in `lib/client.js`, and
   added a "Plugin Updates" checkbox to the form. This deployment sets
   `updates: false`.
2. Formalized the fork: documented "watch upstream, never develop against it",
   sync ritual, conflict hotspots, version format `0.7.40-dsh.1`, tag convention,
   and the npm/upstream push prohibitions here; rewrote the README set as fork
   documentation with upstream attribution.
3. Added regression tests for the off-switch (text wiring + behavioral 403 from a
   fake web server). `npm test`, `npm run test:leaks`, and `node --check` pass.

## Session log — tool trust patch (2026-10-23)

1. Renamed the repository's default branch from `main` to `master` per operator
   direction: `master` pushed, Forgejo `default_branch` switched, the old `main`
   deleted, and this file's push rule updated.
2. Fixed #2/#5/#7 in one formatter patch (PR #11, rebased to `master` as
   `4d77e9f`): no silent 20-row truncation, no bare `OK`, and `gitea_labels list`
   shows the numeric ids/colours/descriptions that `action: "set"` consumes.
   Added `test/handlers-formatters.test.mjs`; `npm test` (25), `npm run
   test:leaks`, and `node --check` pass.
3. Live-checked through the running plugin (HMR): `vps-setup` listed 28/28
   issues, labels showed ids, an empty PR list answered `No pull requests.`, and
   an idempotent `gitea_labels set` on #8 used ids copied from the list. Closed
   #2/#5/#7 with the commit sha.
4. Adopted the pvlb.dev bootcamp orientation, house label axes and the
   known-tool-bug index. Consumers keep their own gotcha tables; this index is
   canonical.

## Session log — CI, publishing and own updater (2026-10-23, later)

1. Dropped the maintained `README.ru.md` / `README.zh.md` translations (and their
   `package.json#files` and leak-scan entries); `README.md` is the single README.
2. Added `.forgejo/workflows/ci.yml` (push to `master`: `npm run check` +
   `npm pack --dry-run`) and `publish.yml` (tag `v*`: tag/version guard, publish
   to the Forgejo npm registry with `NPM_TOKEN`, duplicate-skip). No PR trigger.
3. Repointed the in-UI updater at
   `https://git.pvlb.dev/api/packages/dsh-plugins/npm/`: it reads the packument's
   `dist-tags.latest` (Forgejo 17 has no `/latest`) and installs through a
   throwaway scoped `.npmrc`, keeping runtime deps on npmjs. The `updates` switch
   stays `false` for this `link:` checkout.
4. Verified the registry path end-to-end: a throwaway `@goodandready/...-probe`
   published and was deleted via the API; the repo has `NPM_TOKEN`; live
   `latestVersion('dsh-resend-mcp')` returned `0.1.2`. Release `0.7.40-dsh.3`
   publishes on its tag.

## Session log — package renamed to dsh-gitea (2026-10-23, later)

1. Renamed the npm package from `@goodandready/dsh-gitea` to the unscoped
   `dsh-gitea` (operator direction: it is ours now). Updated
   `cordis.patch.yml`, the host `name` export, the client bundle id/`PKG`
   constant, the session-header seat id, the updater target, the row config key
   (`dsh-gitea#dsh-gitea`) and the UI copy. The old scoped package stays in the
   registry for pinned installs.
2. Removed the last runtime dependency: `lib/semver.js` replaces the `semver`
   package in the updater and release assistant, so the published package has no
   `dependencies`. The updater's temporary `.npmrc` points the unscoped package
   at our registry and the `@deepseek-ai` peer scope at npmjs.
3. The deployment profile is switched to the `dsh-gitea` dependency/row name
   (package.json, bundles list, cordis.patch.yml row, pnpm lockfiles, symlink);
   **DSH must be restarted** to load the new bundle name. The repo is
   `dsh-gitea` from `0.7.40-dsh.4` onward.

## Session log — event panel locale fix (2026-10-23, later)

1. The settings page printed raw `eventsTitle`/`eventsEmptyHint` keys because
   the component referenced keys missing from both dictionaries. Added en/zh
   entries, taught the local `makeT` fallback to interpolate `{param}`
   placeholders, and made the empty hint show the webhook URL.
2. Released `0.7.40-dsh.5`; the client bundle is served per request, so a hard
   refresh picks it up without restarting DSH.

## Session log — updater PATH and error visibility (2026-10-24)

1. The in-UI update failed with a generic 503: the DSH web unit starts with a
   minimal PATH, so the spawned `dsh plugin add` could not find pnpm. Prepend
   `dirname(process.execPath)` and `PNPM_HOME` to the child PATH.
2. Log the failure and return the detail in the 503 body; the settings panel now
   shows the real cause. Plugin install diagnostics live in
   `<profile>/.plugin-manager/logs/operation-*/pnpm.log`; service logs are in
   `journalctl -u dsh-web`.
3. Released `0.7.40-dsh.6`. An already-installed older updater cannot install
   this fix itself; bootstrap it once with a manual `dsh plugin add <tarball>`
   (pnpm on PATH), then the in-UI updater works.
