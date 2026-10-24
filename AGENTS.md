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
- Environment: DSH `0.2.1-rc.2`, profile `web`, Forgejo 17.0.0; the box has
  1.9 GiB RAM and `workspace-write` forbids `sudo` — ask the operator.

## Issues and labels

Labels are per repository. Every issue gets three axes when it is opened:

| Axis | Values |
|---|---|
| type | `type/task`, `type/bug` |
| area | `area/forgejo` for tool/API/CI work; `area/dsh` for the Harness plugin surface; others only if they fit better |
| priority | `priority/now`, `priority/next`, `priority/later` |

- `needs-operator` only for operator actions/decisions.
- `gitea_issue_create` accepts `labels` (names or numeric ids), `assignee` and
  `milestone` since #6. `gitea_labels {action: "set"}` still takes **numeric
  ids**; `gitea_labels list` shows them since `4d77e9f`. On an older plugin
  build, read ids from `GET /api/v1/repos/<owner>/<repo>/labels?limit=100` with
  `GITEA_TOKEN`.
- `gitea_label_bootstrap` defaults to the pvlb house set and is idempotent
  (#8); `taxonomy: "upstream"` opts into the legacy 34-label set. Its dry run
  now lists exactly what it would create. Still prefer it over hand-creating the
  house labels.
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
| `gitea_repo_contents` returns the path | `formatters.js` `data.path` branch | clone, or REST `/contents/<path>` | #3 | fixed in `077ffc6` (body, 20 KB cap, root listing) |
| `gitea_wiki get` returns no content | API is metadata-only; body lives in `<repo>.wiki.git` | metadata formatter + body caveat; clone the wiki repo for text | #4 | metadata fixed in `30ce29d`; body still needs clone |
| `gitea_issue_create` drops labels/assignee/milestone | `issues.js` create handler + tool def | create, then `gitea_labels set` | #6 | fixed in `6941048` (names or ids) |
| `gitea_label_bootstrap` uses the upstream taxonomy | `label-bootstrap.js` | create house labels by hand | #8 | fixed in `178a99f` (house default, upstream opt-in, truthful dry run) |
| `gitea_wiki list` errors on an empty wiki | `listWikiPages` surfaced the API's 404 | none | #9 | fixed in `913013a` |
| `gitea_wiki` has no create/update/delete | handler/defs/client implemented only list/get | clone the wiki repo, commit, push | #10 | fixed in `fbca62a` |
| Plugin Auto-Updater fails on global installs | `findDshCliEntry` walked the `dsh` symlink path, so `cliEntry` was undefined | manual `dsh plugin add <tarball>` | #44 | fixed in `e43e4ca` (0.8.1) |
| `sanitizeForPublic` rewrites `dsh-gitea` to `user-gitea` when `USER=dsh` | env user scrubbed as a bare word | `scripts/mirror-public.mjs` clears `USER` around the call; direct `gitea_mirror_public` callers still hit it | #46 | open |
| `gitea_issue_templates` says it reads `.gitea/ISSUE_TEMPLATE/` | tool-def text is stale; the handler prefers the bundled `assets/issue-templates/` | describe the bundled pack in docs | #47 | open |

Fixing a tool bug = one issue, one PR, a formatter test, and a row update in
this table — same sitting.

### QA sweep index (2026-10-24)

A tester session exercised 95 distinct tool implementations; its 20 findings
(#19–#38) are fixed and closed. Grouped index:

| Domain | Issues | Fix commit |
|---|---|---|
| PR/merge semantics | #23, #24, #37, #38 | `234cbd4` |
| Defaults and integrations | #19, #20, #21, #22, #29, #30, #35 | `281eade` |
| Output formatters | #25, #26, #27, #32, #33, #34 | `56f41de`, `fbcef26` |
| Release and packages | #28, #31, #36 | `b74ca23` |

The tracker holds the repros and acceptance notes; this table is the index.

## What this repository is

- A DSH **profile bundle + plugin** that connects the Harness to a self-hosted
  Gitea/Forgejo instance: 96 first-class agent tools plus 37 compatibility
  aliases (133 registered `gitea_*` names), HTTP routes, a Git status chip in
  the session header, and a settings page.
- This checkout is our **deployment fork** of the upstream public repo
  [`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea) (MIT).
  `origin` is our Forgejo, `upstream` is the GitHub project. The policy is
  **watch upstream, never develop against it** — see "Fork status and upstream
  sync" below. The Forgejo repository is public and mirrors to GitHub as a
  push mirror; both registries publish the same tag.
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
  Fork version: `0.8.4` (see "Versioning and tags"). Runtime peer range:
  `>=0.1.7-rc.2 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-0 <0.3.0-0`
  (`peerDependencies`) — widened on 2026-10-24 so the running `0.2.1-rc.2`
  Harness satisfies it, because `^0.2.0-rc.1` excludes prereleases of a
  different patch line.
- Remotes:
  - `origin` = `ssh://git@git.pvlb.dev/dsh-plugins/dsh-gitea.git` — our private
    Forgejo, the **only** push target.
  - `upstream` = `https://github.com/GooDAnDReaDY/dsh-gitea.git` — fetch only.

## This deployment (facts checked on 2026-10-22)

- Harness: `dsh 0.2.1-rc.2`; the installed package is the `@deepseek-ai/dsh`
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
- The GitHub presence is a **push mirror of this tree**, not a contribution
  branch: the operator mirrors `GooDAnDReaDY/dsh-gitea` on GitHub (branch
  `main`) and force-pushes our `master` over it from the Forgejo UI, so the
  mirror ends up with `main` (upstream) and `master` (ours). Nothing is
  sanitized: the repo is public here and `AGENTS.md` is deliberately part of
  the value (an agent cloning the repo reads it first). Do not add GitHub as a
  remote in this checkout; upstream stays a fetch-only remote and is re-synced
  by rebase every month or two. `scripts/mirror-public.mjs` remains the
  alternative if a sanitized snapshot is ever wanted.
- Two registries publish the same tag: `publish.yml` to our Forgejo registry
  (`NPM_TOKEN`) and `publish-npmjs.yml` to npmjs (`NPMJS_TOKEN`, skipped when
  absent). This deployment's dev checkout installs by local path (`link:`), and
  the published package (Forgejo tarball or npmjs) is what the updater
  consumes.

### Versioning and tags

- Fork version: `0.8.4` (staged npmjs publishing; 0.8.3 was publish config,
  0.8.2 README + peer-range). Earlier builds used `<upstream base>-dsh.<n>`;
  hotfixes can use `0.8.4-dsh.<n>` if needed.
- Tag every state that is live on the server as `v<version>` (for example
  `v0.8.1`). Rollback = `git checkout <tag>`, toggle the bundle off/on,
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
  `write:package` scope.
- `.forgejo/workflows/publish-npmjs.yml` runs on the same tag, re-runs the same
  checks and **stages** the tarball on the public npm registry with
  `npm stage publish` (npm 12 on Node 24; the runner needs npm >= 11.15). The
  repo secret `NPMJS_TOKEN` is a granular token with *read and write (stage
  only)*: npm rejects a direct `npm publish` from CI with `EOTP`, so a
  maintainer approves the staged version with 2FA — `npm stage approve
  <stage-id>` or the package page on npmjs.com. The job skips silently when the
  secret is absent. The first approval creates and claims the unscoped
  `dsh-gitea` package; upstream `@goodandready/dsh-gitea` stays retired.
- The package is public: no `private` field, `publishConfig.access: public`,
  `files` = `lib/`, `assets/`, `cordis.patch.yml`, `README.md`, `LICENSE`. The
  Forgejo job publishes it, the npmjs job stages it.
- Release ritual: bump `package.json` + `CHANGELOG.md`, commit, push `master`,
  then `git tag -a v<version> -m "…" && git push origin v<version>`.
- Install a published build from its tarball (dependencies resolve from npmjs):
  ```bash
  dsh plugin --profile web add \
    https://git.pvlb.dev/api/packages/dsh-plugins/npm/dsh-gitea/-/<version>/dsh-gitea-<version>.tgz
  ```
  The in-UI updater instead installs the exact tarball URL with a temporary
  `.npmrc` that leaves the default registry (npmjs) alone, so other profile
  packages still resolve normally.

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
   `https://git.pvlb.dev/api/packages/dsh-plugins/npm/` and installs the exact
   tarball URL with a throwaway `.npmrc` that leaves the default registry
   (normally npmjs) alone. The `updates` Config flag gates both the UI and
   `/api/dsh-gitea/update` (`isEnabled` in `lib/index.js`); this profile keeps it
   `false` for the `link:` dev checkout. Enabling it lets the next update replace
   that checkout with the published package — deliberate, not an accident.
7. **Fork identity:** keep the package name and bundle row id. A tag publishes
   to Forgejo (`NPM_TOKEN`) and stages on npmjs (`NPMJS_TOKEN`, stage-only); a
   maintainer then approves the staged npmjs version with 2FA. The npmjs name
   `dsh-gitea` is ours. Do not add GitHub as a push remote — the GitHub presence
   is a Forgejo push mirror or a manual force push.

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
| `.forgejo/workflows/` | `ci.yml` (push checks), `publish.yml` (tag → Forgejo registry), `publish-npmjs.yml` (tag → npmjs) |
| `scripts/dev-link-dsh.mjs` | Links DSH peer packages into this checkout for `link:` installs |
| `scripts/leak-scan.mjs` | Fails on private paths/scopes/tokens/Cyrillic in the publishable tree |
| `scripts/mirror-public.mjs` | Builds a sanitized, push-ready snapshot for a GitHub fork; never pushes |
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
installs the same explicit tarball URL with a temporary `.npmrc` that leaves the
default registry alone, so other profile packages still resolve normally.

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
| A `link:` checkout was replaced by the published package | the updater (or a manual `dsh plugin add`) installed the registry tarball | `git checkout v0.8.2`, toggle the bundle off/on, keep `updates: false` for dev |
| Plugin update fails with `Plugin update failed: …` | `dsh plugin` cannot find pnpm on the DSH unit's PATH, or pnpm itself failed | check `<profile>/.plugin-manager/logs/operation-*/pnpm.log`; 0.7.40-dsh.6+ prepends the Node bin dir and `PNPM_HOME` to the updater PATH |
| pnpm 404s on `dsh-cost-meter`/other npmjs packages during add/remove | the default npm registry was set to the Forgejo registry | restore `registry=https://registry.npmjs.org/` in `~/.npmrc`; install `dsh-gitea` from its tarball URL (0.7.40-dsh.7 leaves the default registry alone) |
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

## Session log — tarball installs and default-registry safety (2026-10-24)

1. A local profile had `registry=https://git.pvlb.dev/.../npm/` as the default;
   pnpm then looked up `dsh-cost-meter` there, failed with
   `ERR_PNPM_META_FETCH_FAIL`, and both `add` and `remove` broke.
2. The updater now installs the exact version's tarball URL; its temporary
   `.npmrc` only adds our auth entry and leaves the default registry (npmjs)
   alone. `createRegistryUserconfig` no longer writes a default `registry=` for
   the unscoped package.
3. Released `0.7.40-dsh.7`. An installed dsh.6 updater still overrides the
   registry; restore npmjs and update once via the tarball URL, then the UI
   updater works.

## Session log — wiki read/write fixes (2026-10-24)

Triage of the six open issues found all six real, with one stale symptom: #4's
bare `OK` had already been fixed by #5 (`4d77e9f`), but `get` still returned no
body. The operator asked for the wiki trio first; #3, #6 and #8 remain open.

1. #9 (`913013a`, PR #13): `listWikiPages()` maps the API's 404 for an
   enabled-but-empty wiki to `{ ok: true, status: 404, data: [] }`; 401/403/5xx
   still fail. `test/wiki.test.mjs` covers the 404, a non-empty list and the
   failure statuses.
2. #4 (`30ce29d`, PR #14): a `gitea_wiki` formatter renders title, slug, URL and
   last-commit summary; `sub_url`/`last_commit` were added to `RECORD_KEYS`
   because `slimRecord` stripped them before the formatter. The description and
   output say the body is metadata-only and lives in `<repo>.wiki.git`.
3. #10 (`fbca62a`, PR #15): `gitea_wiki` gained `create`/`update`/`delete`
   (`POST /wiki/new`, `PATCH|DELETE /wiki/page/{pageName}`) with base64 bodies
   and `confirm: true` for delete. Live CRUD on `ml-lab/tardits` showed Forgejo
   derives the slug itself: title `Probe-Page` became slug `Probe-Page.-`, so
   `list` now prints `Title (pageName: <slug>)` and the description says to use
   that slug. The probe page was deleted afterwards (wiki empty again).
4. `npm test` 60/60, leak scan clean, `node --check` clean. Host edits were
   picked up by HMR; no bundle toggle was needed.

## Session log — closing the remaining tool bugs (2026-10-24)

The operator asked to clear the remaining open issues before bumping to 0.8.

1. #3 (`077ffc6`, PR #16): `gitea_repo_contents` decoded nothing because
   `formatters.js` hit `data.path` first; `getContents()` also rejected `""`.
   Added a content formatter (base64 decode, 20 000-char visible cap, `html_url`
   + `download_url`, empty/missing-content wording) and a `/contents` root
   request. `test/repo-contents.test.mjs`.
2. #6 (`6941048`, PR #17): declared and forwarded `labels`/`assignee`/`milestone`
   on `gitea_issue_create`; label names resolve case-insensitively against
   `listLabels`, order is preserved, duplicates collapse and an unknown name
   fails before creating. `test/issue-create.test.mjs`.
3. #8 (`178a99f`, PR #18): `gitea_label_bootstrap` now defaults to the 11-label
   pvlb house set; `taxonomy: "upstream"` keeps the legacy 34. The dry run
   returns `missing`/`missingCount` and lists them (the old formatter counted
   `created`, so it always said 0). `test/label-bootstrap.test.mjs`.
4. Live checks: repo contents body/root/truncation; issue create with
   `TYPE/BUG` + assignee + milestone on `ml-lab/tardits` (probe issue closed,
   milestone deleted); label bootstrap dry run 10 → apply 10 → dry run 0 with
   exactly the 11 house labels left on the lab repo.
5. `npm test` 81/81, leak scan clean, `node --check` clean. Next: the
   tester-Deeps sweep, then the 0.8 bump.

## Session log — QA sweep fixes and 0.8.0 (2026-10-24)

The tester session filed 20 issues (#19–#38) across 95 distinct tool
implementations; the operator asked to fix all of them before the 0.8 bump.

1. Batch A (`234cbd4`, PR #39): merged-PR `pr_get`, conflict-resolve dry-run,
   invalid conflict refs, merged merge-readiness.
2. Batch B (`281eade`, PR #40): health error matching, repo-default branch,
   webhook `content_type`, memory `format`, incident dry-run + house labels,
   exact-title duplicates, task-tracker wording.
3. Batch C (`56f41de`, PR #41; `fbcef26`, PR #42): commit/PR-file/compare,
   CI status/jobs/run (including Forgejo's bare `ActionRunJob[]`), code search,
   PR analysis, notifications/users/org, timeline. `RECORD_KEYS` gained the
   fields these formatters need.
4. Batch D (`b74ca23`, PR #43): release range from `v<current_version>`,
   assistant validate/notes output, package_get via the working package list.
5. Live-checked every batch through HMR (including a fresh CI run for the
   jobs array). Closed all 20 issues with the fix commits.
6. Released `0.8.0`: milestone version, `[0.8.0]` changelog, AGENTS/README
   version updates, tag `v0.8.0` → publish workflow. Test suite 141, leak scan
   and syntax clean.

## Session log — updater symlink fix and 0.8.1 (2026-10-24)

1. A local operator's 0.7.40-dsh.7 panel saw 0.8.0 but the install failed with
   "Plugin update failed; see server logs." and no `operation-*` dir was created.
2. #44 root cause: `findDshCliEntry()` used `resolve(process.argv[1])` without
   following symlinks. Global installs run
   `/usr/local/bin/dsh -> …/@deepseek-ai/dsh/lib/bin.js`, so the walk found no
   manifest, `cliEntry` was undefined, and `installExact` failed before spawning
   `dsh plugin`. The status already returned `canAutoUpdate: false`, but the UI
   ignored it.
3. `e43e4ca` (PR #45): realpath the entry and candidate bin; export
   `findDshCliEntry` for tests; missing-CLI error includes the manual
   `dsh plugin --profile <name> add <tarball>` command; the UI hides the Update
   button and shows a manual hint when `canAutoUpdate` is false. Tests 143/143.
4. Released `0.8.1`. An installed 0.7.40-dsh.7 updater cannot fix itself, so
   0.8.1 needs one manual tarball bootstrap; subsequent UI updates work.

## Session log — public README, 0.8.2 and the GitHub mirror path (2026-10-24)

The operator asked for a README that sells the plugin to newcomers (what it is,
what it enables, one-line install) instead of a fork runbook.

1. Rebuilt `README.md` around the product: the 96 first-class tools (+37
   compatibility aliases) grouped into six domains, the settings page/Git chip
   and the non-tool surface, then one-line install, a short configure section
   (credential name in `~/.dsh/.credentials.yaml`), verification, a 6-row
   troubleshooting table and a safety section. Development, CI and upstream
   attribution moved below the user-facing parts.
2. Verified the install path end-to-end in throwaway pnpm projects: a bare
   `https://…/dsh-gitea` URL is fetched as a tarball and 404s; the `.git` suffix
   (or `#tag`) is treated as a git dependency, and `dsh plugin add` appends the
   package to `dsh.profile.bundles` on success (`reconcile()`), so no Plugin
   Manager step is needed on the happy path. The registry tarball is
   world-readable anonymously.
3. Widened the `@deepseek-ai/dsh-*` peers to accept the `0.2.1` prerelease line:
   `^0.2.0-rc.1` does not match the running `0.2.1-rc.2`, so a fresh install
   would have been incompatible.
4. Added `scripts/mirror-public.mjs` + `test/mirror-public.test.mjs` (11 tests):
   sanitized snapshot → single commit → printed (never executed) push commands,
   plus the PR-able `sanitized/main` graft on `upstream/main` documented in
   `.planning/mirror-plan.md`. Never push this tree to GitHub.
5. Pre-flight for the visibility flip: no token or private key was ever
   committed (all 459 commits scanned). History keeps a home path in
   `TESTER-BRIEF.md` (commit `2ee4c3b`) and internal `docs/superpowers/**`;
   accepted rather than rewriting history. `TESTER-BRIEF.md` itself was cleaned
   to relative paths and current versions.
6. Released `0.8.2` and made the Forgejo repository public. npmjs stays
   untouched: the unscoped `dsh-gitea` name is unclaimed, but publishing is
   deployment-specific and would squat a name upstream may want.

## Session log — public npmjs release (0.8.3, 2026-10-24)

The operator asked to claim the unscoped `dsh-gitea` name on npmjs and publish a
first public version, keeping the Forgejo registry as the second target.

1. `package.json` is public: `private` removed, `publishConfig.access: public`,
   `engines.node: ">=20"`, version `0.8.3`. `files` is unchanged, so the npm
   tarball is `lib/`, `assets/`, `cordis.patch.yml`, `README.md`, `LICENSE`.
2. Added `.forgejo/workflows/publish-npmjs.yml` (same tag guard and `npm run
   check` as `publish.yml`) publishing to npmjs with `NPMJS_TOKEN`; it skips
   silently while the secret is absent. `publish.yml` no longer deletes
   `private`, since the package is public now.
3. The README install section leads with `dsh plugin --profile web add
   dsh-gitea`; the git URL, a tag pin and the Forgejo tarball stay as fallbacks.
4. Removed `TESTER-BRIEF.md` (the tool QA sweep it described is finished;
   history keeps it, which is fine for a public repo).
5. Mirroring decision: no sanitized snapshot. The GitHub presence is a push
   mirror of `master` over the upstream fork, so GitHub shows upstream `main`
   and our `master`; upstream stays fetch-only and is rebased every month or
   two. `scripts/mirror-public.mjs` stays available but is not the chosen path.

## Session log — staged npmjs publishing (0.8.4, 2026-10-24)

The first npmjs run of v0.8.3 failed with `EOTP`: npm's current granular
tokens are *stage only*, so a direct `npm publish` can never work from CI.

1. `publish-npmjs.yml` now installs npm 12 on Node 24 (npm `stage` needs
   >= 11.15 and Node >= 22.14) and runs `npm stage publish`; the same tag
   guard, `npm run check` and duplicate-version skip stay in front.
2. Approval is a maintainer step with 2FA: `npm stage approve <stage-id>` or
   the package page on npmjs.com. The first approval creates and claims the
   unscoped `dsh-gitea` package; the job prints the stage id.
3. 0.8.4 is the first version staged this way; 0.8.3 stays published on the
   Forgejo registry only.
