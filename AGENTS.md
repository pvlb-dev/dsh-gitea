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
are private, so read it through an SSH clone, not `web_fetch`. Forgejo masks a
private repo **and its wiki** as `404` (not `401`/`403`) for anonymous callers, so
a `web_fetch` 404 on this forge means "not authenticated", not "page missing":
confirm existence with the `gitea_*` tools, whose token reaches the same URL.
`gitea_wiki get` still returns metadata only (#4) — the body needs
`git clone ssh://git@git.pvlb.dev/<owner>/<repo>.wiki.git`.

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
| `gitea_issue_get`/`_list` hide labels, assignee and milestone | the formatter branches never read them | none needed; both now render the metadata | #52 | fixed in `4848dd7` (0.8.6) |
| `gitea_wiki update` renames the page to `unnamed` | Forgejo applies its empty-title path when the PATCH has no title; the handler passed `title: undefined` | read the current page title back | #55 | fixed in 0.8.7 |
| `gitea_flavor` prints `Unrecognised response` + clipped JSON | no formatter branch for the tool | none | #56 | fixed in 0.8.7 |
| `gitea_flavor` says `gitea` on a Forgejo instance | version-only heuristic; Forgejo advertises `17.0.0+gitea-1.22.0` | none; detection now probes the web UI title | #57 | fixed in 0.8.7 |
| `gitea_issue_templates` says it reads `.gitea/ISSUE_TEMPLATE/` | tool-def text is stale; the handler prefers the bundled `assets/issue-templates/` | describe the bundled pack in docs | #47 | open |
| `gitea_pr_comment`/`gitea_pr_line_comment` print `Unrecognised response` + raw JSON | `formatters.js` has a `gitea_issue_comment` branch but none for the PR-side names, which hit the same comments endpoint; a comment object has no top-level `name`/`title`/`login`/`number`/`path`, so `describeUnknownObject()` matches nothing | the call itself succeeds — read the id/author from the JSON | #65 | open |

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
  Gitea/Forgejo instance: 96 first-class agent tools, a preset-switchable tool
  surface (`preset`/`tools`/`excludeTools`, #49) including the opt-in two-tool
  `dispatcher` surface (#51), 37 compatibility aliases that are opt-in since
  0.8.5 (`legacyAliases`, #48), HTTP routes, a Git status chip in the session
  header, and a settings page.
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
  Fork version: `0.8.8` (see "Versioning and tags"). Runtime peer range:
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

- Fork version: `0.8.8` (Host-authoritative preset list; 0.8.7 was
  dropdown fix + flavor/wiki defects; 0.8.6 was
  dispatcher preset + issue metadata; 0.8.5 was
  tool-surface presets + opt-in aliases, 0.8.4 staged npmjs publishing, 0.8.3
  publish config, 0.8.2 README + peer-range). Earlier builds used
  `<upstream base>-dsh.<n>`; hotfixes can use `0.8.8-dsh.<n>` if needed.
- **Next: `0.8.9`, not cut.** #63 (Git-sidebar repository link) is the first
  entry under `## [Unreleased]`; bundle a few issues before tagging — see
  "Bundled releases and the on-server test phase".
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
  secret is absent. Staging already reserves the unscoped `dsh-gitea` name
  (npm publishes a `0.0.0-stage` placeholder with `latest` pointing at it), so
  until a maintainer approves, `dsh plugin add dsh-gitea` would install that
  placeholder. Approval replaces it with the tagged version. Upstream
  `@goodandready/dsh-gitea` stays retired.
- The package is public: no `private` field, `publishConfig.access: public`,
  `files` = `lib/`, `assets/`, `cordis.patch.yml`, `README.md`, `LICENSE`. The
  Forgejo job publishes it, the npmjs job stages it.
- `.forgejo/workflows/release.yml` runs on the same `v*` tag (manual dispatch
  prints the generated notes instead) and creates the **Forgejo release page**:
  `scripts/release-notes.mjs <version>` turns the `## [<version>]` section of
  `CHANGELOG.md` into `{tag_name, name, body, draft, prerelease}`, appending an
  install snippet and the home/npm links; the workflow POSTs that to
  `/api/v1/repos/<owner>/<repo>/releases`, then uploads the `npm pack` tarball as
  a release asset (`.../releases/download/v<version>/dsh-gitea-<version>.tgz`).
  **Idempotent by design:** an existing release for the tag is left alone, so
  notes edited in the UI survive a re-run and there is no update path in the
  workflow. Auth is the automatic Actions token (`GITHUB_TOKEN`, repository
  write for same-repository tag pushes; the docs say `FORGEJO_TOKEN` is set
  too); a repository secret `RELEASE_TOKEN` overrides it, and an empty token
  only warns and skips. No `write:package` token can create releases — that
  scope is packages-only. Keep the script dependency-free and covered by
  `test/release-notes.test.mjs`, because `npm run check` is the CI gate that
  guards it.
- Release ritual: bump `package.json` + `CHANGELOG.md`, commit, push `master`,
  then `git tag -a v<version> -m "…" && git push origin v<version>`. The tag
  starts three jobs: registry publish, npmjs stage, release page. To backfill a
  tag that predates `release.yml`, dispatch it manually or POST the payload
  from `scripts/release-notes.mjs` with a user token.
- **Major releases compact the history.** Since 0.8.2 the repo is a public
  deployment fork whose `master` is mostly incremental fixes; at **0.9.0** (and
  every minor/major after it) squash the fork commits into a handful of logical
  ones *before* the tag. Rules: the upstream base commit stays untouched; the
  squash happens on a temporary branch and `master` is force-pushed once with
  operator approval (Ground rule 5); `v0.8.*` tags remain, so the old shas that
  issues and this file quote stay resolvable; `CHANGELOG.md` and `LOGS.md` carry
  the narrative, so no information is lost. Tracked as the 0.9.0 dependency.
- Install a published build from its tarball (dependencies resolve from npmjs):
  ```bash
  dsh plugin --profile web add \
    https://git.pvlb.dev/api/packages/dsh-plugins/npm/dsh-gitea/-/<version>/dsh-gitea-<version>.tgz
  ```
  The in-UI updater instead installs the exact tarball URL with a temporary
  `.npmrc` that leaves the default registry (npmjs) alone, so other profile
  packages still resolve normally.

### Bundled releases and the on-server test phase

- **Only a `v*` tag builds.** `publish.yml`, `publish-npmjs.yml` and
  `release.yml` are all tag-only; a push to `master` runs `ci.yml`
  (`npm run check` + `npm pack --dry-run`) and produces no artifact. Branch
  pushes trigger nothing. So "don't bump a release" means "don't tag" — merging
  verified work to `master` is cheap.
- **Do not tag per fix.** Accumulate entries under `## [Unreleased]` in
  `CHANGELOG.md`, merge verified PRs to `master`, and cut a version when a
  bundle is worth shipping (a handful of issues, or one area finished). Reserve
  same-day tags for live breakage.
- **Test phase before a tag, on this server, no build:**
  1. `npm run check` — the full gate (tests, leak scan, `node --check`; 216
     tests, ~15 s on this box). Run it after each change; it is the CI gate and
     it ships no artifact.
  2. Live check in the running GUI. Host-half edits are hot through the `hmr`
     root in the profile patch; the client bundle is served per request, so a
     `lib/client.js` change needs the bundle toggled (or `dsh web` restarted)
     and the page hard-refreshed. There is no browser automation here — say so
     in the report and let the operator look.
  3. Registration evidence without a browser: `cordis_inspect_query` for the
     Config schema, the `gitea_*` tool list and the occupied slots (see "Verify
     without a browser").
  4. If remote CI is wanted mid-bundle, dispatch the existing `ci.yml`
     (`workflow_dispatch` accepts a branch) instead of adding a new workflow or
     pushing to `master` early. No `pull_request` trigger — see the security
     note at the top of `ci.yml`.

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
   push only to `origin/master` (no force push) — with **one sanctioned
   exception**: the history compaction before a major release (0.9.0 onwards)
   rewrites `master` once, with operator approval, and force-pushes it over the
   GitHub mirror. Keep the `v0.8.*` tags: they hold the pre-squash commits that
   issue comments reference.
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
| `lib/selection.js` | Tool-surface presets, glob patterns and alias filtering (#48/#49); pure module shared by `lib/index.js` and the tests |
| `lib/dispatcher.js` | Opt-in `preset: dispatcher` (#51): catalog, per-operation help and argument validation, all derived from `TOOL_DEFS` |
| `lib/gitea-client.js` | Gitea REST client (cache, ETags, retry, timeouts) |
| `lib/plugin-updater.js` | One-click updater: Forgejo registry packument, unscoped install, loopback fence + `updates` switch |
| `lib/handlers.js`, `lib/handlers/*` | Tool implementations; `lib/tool-defs.js`, `lib/tool-defs/*` hold schemas |
| `lib/settings`-related | Settings live in `lib/index.js` (`Config`, `readServedConfig`, `servedScope`); UI in `lib/client.js` |
| `assets/issue-templates/` | Issue form templates the plugin can install |
| `assets/logos/` | Gitea/Forgejo logo sources embedded in the client bundle (#63); attribution in its README |
| `lib/repo-link.js` | Pure #63 helper: origin remote → browsable repository URL, icon/hide policy; tested by `test/repo-link.test.mjs` |
| `cordis.patch.yml` | Bundle patch: inserts the `dsh-gitea` row with empty config |
| `.forgejo/workflows/` | `ci.yml` (push checks), `publish.yml` (tag → Forgejo registry), `publish-npmjs.yml` (tag → npmjs), `release.yml` (tag → Forgejo release page + tarball) |
| `scripts/dev-link-dsh.mjs` | Links DSH peer packages into this checkout for `link:` installs |
| `scripts/leak-scan.mjs` | Fails on private paths/scopes/tokens/Cyrillic in the publishable tree |
| `scripts/release-notes.mjs` | `CHANGELOG.md` section → Forgejo release payload (name, notes, install snippet) |
| `scripts/mirror-public.mjs` | Builds a sanitized, push-ready snapshot for a GitHub fork; never pushes |
| `test/*.test.mjs` | Fork regression checks (`npm test`); upstream ships no tests, so this suite is ours |
| `LOGS.md` | Chronological session history (moved out of `AGENTS.md` on 2026-10-25); read it for provenance |

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
- **A test that imports `lib/index.js` needs the DSH peer packages.** The CI
  runner installs the package without a profile, so `@deepseek-ai/schemastery`
  and friends are absent and the import throws `ERR_MODULE_NOT_FOUND`. Such
  tests must guard the import and `skip` instead of failing the release
  pipeline (`test/tool-surface.test.mjs` does this, and the resolver-level
  `test/selection.test.mjs` still gates the preset table there). `npm run check`
  inside a dev checkout has the peers through `dev:link`, so it does run them.

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

## Session history

Detailed session logs live in **[LOGS.md](LOGS.md)** — read it for the reasoning
and provenance behind any change. One line per session, oldest first.

| Date | Release | Session |
|:--|:--|:--|
| 2026-10-22 | — | Settings UI restored: `settings.section` seat, route-backed form, HTTP-guard 403 fix |
| 2026-10-22 | — | Fork hardening: updater off-switch, fork docs, regression tests |
| 2026-10-23 | — | Tool trust patch (#2/#5/#7), branch renamed to `master`, house taxonomy |
| 2026-10-23 | — | CI, publishing and the own-registry updater |
| 2026-10-23 | — | Package renamed to `dsh-gitea`, runtime dependency dropped |
| 2026-10-23 | 0.7.40-dsh.5 | Event panel locale fix |
| 2026-10-24 | 0.7.40-dsh.6 | Updater PATH and error visibility |
| 2026-10-24 | 0.7.40-dsh.7 | Tarball installs, default-registry safety |
| 2026-10-24 | — | Wiki read/write fixes (#9/#4/#10) |
| 2026-10-24 | — | Remaining tool bugs closed (#3/#6/#8) |
| 2026-10-24 | 0.8.0 | QA sweep: 20 issues (#19–#38) in four batches |
| 2026-10-24 | 0.8.1 | Updater symlink fix (#44) |
| 2026-10-24 | 0.8.2 | Public README, public repo, GitHub mirror path |
| 2026-10-24 | 0.8.3 | First public npmjs release |
| 2026-10-24 | 0.8.4 | Staged npmjs publishing (`npm stage publish`) |
| 2026-10-24 | — | Generated Forgejo release pages + wiki template |
| 2026-10-24 | 0.8.5 | Tool-surface presets + opt-in aliases (#48/#49) |
| 2026-10-25 | — | #51 dispatcher spike measured (real triage runs) |
| 2026-10-25 | 0.8.6 | Dispatcher preset + issue metadata (#51/#52) |
| 2026-10-25 | 0.8.7 | Preset dropdown + wiki rename + flavor render/detection (#55/#56/#57) |
| 2026-10-25 | 0.8.8 | Host-authoritative preset list (stale-Host skew) |
| 2026-10-25 | — (unreleased) | #63 Git-sidebar repository link; bundled-release + on-server test-phase policy |

