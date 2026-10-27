# Deployment — install, verify, fail, secure

Part of the dsh-gitea manual. The map is [`../AGENTS.md`](../AGENTS.md). Facts
about the running box are in [`state.md`](state.md).

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
- **A tool *definition* is captured at registration; a formatter it imports is a
  live binding.** HMR replaces the imported module immediately, but the render
  closure registered earlier keeps its old shape — so a formatter-only fix shows
  up live at once, while a fix that needs *new data* (e.g. #65's `args`
  forwarding) renders through the old closure until the surface is re-registered
  (bundle toggle, `dsh web` restart, or a fresh registration). Do not call a live
  check failed on that split; check the boot-level test and say which half is
  live.
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
- **The `dispatcher` default removes name-level discovery.** With two meta-tools
  an agent no longer reads `gitea_pr_merge` off its tool list; it finds it in
  the `gitea` description catalog and fetches the schema with `gitea_help`.
  That is the measured trade-off (README, "Tool surface"), and `preset: full`
  is the one-line way back. Do not "fix" a confused agent by re-adding
  individual tools to the default surface.
- Browser-visible verification still needs a human or a browser-capable agent.

