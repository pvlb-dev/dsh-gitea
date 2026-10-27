# Architecture — what the plugin is and how DSH loads it

Part of the dsh-gitea manual. The map is [`../AGENTS.md`](../AGENTS.md).
Install and reload live in [`deploy.md`](deploy.md); the tool surface in
[`tools.md`](tools.md); releases in [`releases.md`](releases.md).

The hard rules behind the sections below:

- **Do not reorder or rename the bundle patch row id** (`dsh-gitea`). Both the
  settings namespace and the `plugins.row.config` key depend on it.
- **Keep the client bundle dependency-light.** It may `require('react')` (the
  platform seed). Anything else must be a Cordis service reached through
  `ctx.get(...)`; do not import `@deepseek-ai/dsh-client-ui-*` packages into the
  bundle or the browser module graph will fail to resolve it.

## What this repository is

- A DSH **profile bundle + plugin** that connects the Harness to a self-hosted
  Gitea/Forgejo instance: 96 first-class agent tools, a preset-switchable tool
  surface (`preset`/`tools`/`excludeTools`, #49) whose **default since 0.8.9 is
  the two-tool `dispatcher`** (#51 — `preset: full` gets the 96 typed tools
  back), 37 compatibility aliases that are opt-in since
  0.8.5 (`legacyAliases`, #48), HTTP routes, a Git status chip in the session
  header, and a settings page.
- This checkout is our **deployment fork** of the upstream public repo
  [`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea) (MIT).
  `origin` is our Forgejo, `upstream` is the GitHub project. The policy is
  **watch upstream, never develop against it** — see [`upstream.md`](upstream.md).
  The Forgejo repository is public and mirrors to GitHub as a push mirror; both
  registries publish the same tag.
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
  Runtime peer range:
  `>=0.1.7-rc.2 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-0 <0.3.0-0`
  (`peerDependencies`) — widened on 2026-10-24 so the running `0.2.1-rc.2`
  Harness satisfies it, because `^0.2.0-rc.1` excludes prereleases of a
  different patch line.
- Remotes:
  - `origin` = `ssh://git@git.pvlb.dev/dsh-plugins/dsh-gitea.git` — our private
    Forgejo, the **only** push target.
  - `upstream` = `https://github.com/GooDAnDReaDY/dsh-gitea.git` — fetch only.
- `cordis.patch.yml` is the bundle patch: it inserts the `dsh-gitea` row with
  empty config. `lib/gitea-client.js` is the REST client (cache, ETags, retry,
  timeouts); `lib/routes-hub.js` dispatches the Interactive Hub actions behind
  `POST /dsh-gitea/hub`.
- Assets: `assets/logos/` holds the Gitea/Forgejo logo sources embedded in the
  client bundle (#63; attribution in its README), `assets/illustrations/` holds
  the README hero illustration, `assets/screenshots/` holds the Git drawer
  screenshot (#63), and `assets/issue-templates/` holds the issue forms the
  plugin can install. All ship in the tarball; images are downscaled before
  they are committed (see [`workflow.md`](workflow.md)).

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
  deployment keeps it `false` (the updater rule is in [`releases.md`](releases.md)).

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

