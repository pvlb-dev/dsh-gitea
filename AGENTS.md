# AGENTS.md — working notes for future agents

This file is for an AI agent (or a human in a hurry) picking up
`@goodandready/dsh-gitea` in this checkout. It records how the plugin is put
together, how it is loaded by the running DeepSeek Harness, what was broken, and
which checks prove a change works. Read it before editing `lib/`.

## What this repository is

- A DSH **profile bundle + plugin** that connects the Harness to a self-hosted
  Gitea/Forgejo instance: 20+ agent tools, HTTP routes, a Git status chip in the
  session header, and a settings page.
- This tree is the **public/sanitized mirror** of a private development repo.
  `lib/` is what ships; there is no `src/` and no client build step here.
  `lib/client.js` is a **generated browser bundle** (single `window.__ModuleLoader__.load`
  factory). Treat hand edits there as source-of-truth patches that must be
  mirrored back to the private TypeScript source, or they will be lost the next
  time the public tree is regenerated. The sanitizer also strips the private test
  suite, `.gitea/`, `docs/`, and some scripts — do not be surprised that CI files
  and most tests are absent.
- Package identity: `@goodandready/dsh-gitea`, currently `0.7.40`.
  Runtime peer line: DSH `0.1.7-rc.2` / `0.2.0-rc.x` (`peerDependencies`).
- Remote: `ssh://git@git.pvlb.dev/dsh-plugins/dsh-gitea.git` (branch `main`).

## This deployment (facts checked on 2026-10-22)

- Harness: `dsh 0.2.0-rc.2`, installed at
  `/opt/node-v24.22.0-linux-x64/lib/node_modules/@deepseek-ai/dsh`.
- Profile: `web` → `/home/dsh/.dsh/profiles/web`; Web GUI on
  `http://127.0.0.1:3080` (also trusted via a Tailscale hostname).
- The profile patch is `<profile>/cordis.patch.yml`; profile dependencies are in
  `<profile>/package.json`. Both are **outside this workspace**.
- `pnpm` exists at `/opt/node/bin/pnpm`, but that directory is **not on the
  DSH server's PATH**. Two consequences:
  1. Plugin Manager's install/remove used to fail with `spawn pnpm ENOENT`.
  2. The profile patch now names it explicitly:
     ```yaml
     - id: plugin-manager
       name: "@deepseek-ai/dsh-plugin-manager"
       config:
         pnpmCommand: /opt/node-v24.22.0-linux-x64/bin/pnpm
     ```
     Keep this entry (schema defaults fill the other fields).
- Installed in the profile as a **`link:` dependency** to this checkout (that is
  what Plugin Manager does for an absolute local path). The `dev:link` bootstrap
  below is required for such an install.
- Commit identity for this repo: `dsh <dsh@pvlb.dev>`.

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
   push only to `origin/main` (no force push).

## Repository map

| Path | Role |
|:--|:--|
| `lib/index.js` | Host entry: Config schema, Settings integration, tool registration, services (`dshGitea`, `giteaEvents`), HTTP route wiring |
| `lib/client.js` | Generated web bundle: settings form/page, Git chip + drawer, action cards, events panel, locale dictionaries |
| `lib/routes.js` | `/dsh-gitea/config`, `/events`, `/git-status`, `/git-graph`, `/sse`, `/hub`, `/release-assistant`, webhook |
| `lib/routes-hub.js` | Interactive Hub action dispatcher used by `POST /dsh-gitea/hub` |
| `lib/http-guard.js` | Host/Origin/CSRF fence + DSH Connection authentication for custom routes |
| `lib/gitea-client.js` | Gitea REST client (cache, ETags, retry, timeouts) |
| `lib/handlers.js`, `lib/handlers/*` | Tool implementations; `lib/tool-defs.js`, `lib/tool-defs/*` hold schemas |
| `lib/settings`-related | Settings live in `lib/index.js` (`Config`, `readServedConfig`, `servedScope`); UI in `lib/client.js` |
| `assets/issue-templates/` | Issue form templates the plugin can install |
| `cordis.patch.yml` | Bundle patch: inserts the `dsh-gitea` row with empty config |
| `scripts/dev-link-dsh.mjs` | Links DSH peer packages into this checkout for `link:` installs |
| `scripts/leak-scan.mjs` | Fails on private paths/scopes/tokens/Cyrillic in the publishable tree |
| `test/*.test.mjs` | Mirror-safe regression checks (the full private suite is not public) |

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
| `plugins.row.config` | exists, keyed by `<package>#<row id>` | **canonical config page** on Plugins → bundle → row → Configure; key `@goodandready/dsh-gitea#dsh-gitea` |
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

### HTTP routes

- Custom routes are registered through `ctx.webServer.register({ kind: 'exact', path, handler })`.
- They must call `rejectUntrustedRequest`/`rejectUntrustedWrite` from
  `lib/http-guard.js`. That delegates to `ctx.connection.requestRejection` when
  available (401/403 for unauthenticated remote clients) and otherwise falls
  back to loopback-only, same-origin checks.
- Browser `fetch` from the GUI sends the auth cookie; shell `curl` without it
  correctly gets `401 {"code":"unauthorized"}`. That 401 is expected, not a
  route bug.

## Install / development loop

### 1. Bootstrap a local checkout (once)

```bash
cd /home/dsh/Projects/dsh-gitea
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
plugin_manager action=install_bundle target=/home/dsh/Projects/dsh-gitea enabled=true
```

To pick up code changes in a `link:` install, toggle the bundle off and on:

```
plugin_manager action=set_bundle target=@goodandready/dsh-gitea enabled=false
plugin_manager action=set_bundle target=@goodandready/dsh-gitea enabled=true
```

`application: "applied"` means the change is live. `application: "failed"` plus
an `error.diagnostic` (e.g. `failed to import`) is the failure to read first.
Hard-refresh the browser if the client bundle was not hot-reloaded.

CLI alternative (needs a profile-capable shell; outside this workspace the file
sandbox may deny it): `dsh plugin --profile web add /path/to/checkout`.

### 3. Verify without a browser

```
# Bundle/row inventory and live enablement
plugin_manager action=list_bundles

# The Config schema reached the Loader (status "schema" is healthy)
cordis_inspect_query host Config listConfigs {"name":"@goodandready/dsh-gitea"}

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
  reload; the Plugins page row shows Configure; the session header shows the Git
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
| Configure page missing on Plugins | row key mismatch | key must be `@goodandready/dsh-gitea#dsh-gitea` |
| Settings fields empty / not projected | Config field without `.volatile()` | mark the field volatile |
| Save appears successful but is lost on restart | write bypassed the Settings service | persist via `servedScope.update`; check `writable` |
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
- Do not add network calls to the settings form path that are not same-origin.

## Known limitations / next steps

- `lib/client.js` is built output; when the private TypeScript source is next
  regenerated, the settings-section registration and the route-backed form must
  be carried over there (or this fix will regress on the next publish).
- The one-click auto-updater (`/api/dsh-gitea/update`) installs from npm into the
  profile; it is not exercised in this checkout and the sidebar form can show a
  stale current version until the first check completes.
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
