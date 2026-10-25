# LOGS.md — session history for `dsh-gitea`

Detailed, chronological session logs extracted from `AGENTS.md` (2026-10-25).
They are working notes: what was broken, what changed, how it was verified, and
which checks passed. Read `AGENTS.md` first for the *current* state; come here
when you need the reasoning or the provenance behind a change.

Nothing here is required to operate the plugin: `README.md` is the user manual,
`AGENTS.md` is the agent manual, and this file is the lab notebook.

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

## Session log — generated Forgejo releases (2026-10-24)

The operator pointed at the Releases page of `dsh-plugins/dsh-resend-mcp` and
asked for the same for this repo, plus the same template in the vps-setup
bootcamp. Note for the record: **the sibling repo has no release workflow** —
its three releases were written and published by hand through the Forgejo UI
(`docs/publishing.md` only says "Forgejo releases exist for the tagged
versions"). So this session built the automation rather than copying it.

1. `scripts/release-notes.mjs` (new, dependency-free): reads `CHANGELOG.md`,
   finds the `## [<version>]` section, uses its first `###` heading for the
   release name (`v0.8.4 — Publish to npmjs through staged publishing`), keeps
   the rest as the body and appends an install snippet plus the home/npm links.
   `--body` prints the notes for a dry run, the default prints the JSON payload
   for `POST /repos/{owner}/{repo}/releases`. A missing section yields a
   one-liner instead of a failure, and a version with a `-` is marked
   `prerelease`. `test/release-notes.test.mjs` covers all of it (5 tests).
2. `.forgejo/workflows/release.yml` (new) runs on the same `v*` tag as the two
   publish workflows: tag/version guard, notes preview on manual dispatch,
   existing-release check via `GET /releases/tags/<tag>` (200 → leave the page
   untouched, so hand-edited notes win), `POST /releases`, then `npm pack` and
   `POST /releases/<id>/assets?name=…` for the tarball. Auth uses the automatic
   Actions token (`GITHUB_TOKEN`, with `FORGEJO_TOKEN` as a fallback); the
   `RELEASE_TOKEN` secret overrides it, and no token only warns and skips.
   `write:package` tokens cannot create releases, so the packages secret is
   not reusable here.
3. Backfilled the three tags that predate the workflow using the same payload
   and API calls with a user token: `v0.8.2`/`v0.8.3`/`v0.8.4` releases now
   exist with titles from the changelog and the `dsh-gitea-<version>.tgz`
   asset (asset download verified 200 for all three).
4. Documented the fourth workflow in `README.md` (table row + generated-release
   bullet + ritual comment) and here (CI section, repository map).
5. Verified the workflow through the running plugin and the runner: a manual
   dispatch (run #100) reported `Using the automatic Actions token.` and
   `Release lookup for v0.8.4: HTTP 200`, then printed the notes preview — so
   the YAML loads, the token context is real, and no `RELEASE_TOKEN` secret is
   needed for this repo. The create/asset path itself was exercised by the
   backfill above with a user token; the next tag runs it with the Actions
   token.
6. Wrote the same pattern into the pvlb.dev wiki so every project starts from
   one template: `vps-setup.wiki` → **DSH-Bootcamp → "Shipping: CI, tags and
   releases"** (four-workflow table, the rules, and a copy-paste `release.yml`
   whose notes come from `CHANGELOG.md`), plus a corrected statement on
   `Forgejo-Actions-Runner` (the automatic token *is* available with repository
   write; the old text claimed there was no implicit token) and a pointer in
   `Home.md`. Wiki changes are pushed to `main`, not `master`.

## Session log — tool surface presets and opt-in aliases (0.8.5, 2026-10-24)

Four issues (#48–#51) measured the plugin's share of the tool payload: 133 names
/ 107,157 B, 61.5 % of a 174,372 B session payload, with 37 deprecated aliases
duplicating canonical schemas. The operator asked for a separate branch for the
experiments; the split was by risk, not by "feature vs experiment".

1. #48 (`legacyAliases`, default **false**): every tool definition is built once
   into `toolDefinitions` (a Map), and registration is driven by
   `applyToolSelection()`. `LEGACY_MAP` and `runHandler` dispatch are untouched,
   so an alias called from stale history still resolves; only the advertised
   surface shrinks. `legacyAliases: true` restores all 133 names.
2. #49 (`preset` / `tools` / `excludeTools`): new pure module `lib/selection.js`
   mirrors the `dsh-resend-mcp` interface (glob patterns, `missingPatterns`,
   no fatal unmatched pattern). Presets: `core` (15 hot tools), `issues`,
   `prs`, `repos`, `ops`, `full`, `none`, `custom`; the four domain presets are
   disjoint and their union is all 96 canonical tools. `full` is the default and
   resolves in `TOOL_DEFS` order, so it is byte-identical to 0.8.4.
3. Selection inputs are reduced to a signature; a settings write that does not
   change the surface does not touch the registry (stable tool prefix). A
   surface change disposes and re-registers through the disposer that
   `ctx.tools.register()` returns — live, no restart. `parseConfig` unwraps the
   volatile projection **before** validating `preset` (an unknown preset fails
   at mount with the accepted names).
4. `/dsh-gitea/config` now returns `toolSurface` (`preset`, `selected`,
   `availableCount`, `aliasCount`, unmatched patterns) and the settings form
   gained a **Tool Surface** section: preset select, allowlist, denylist, alias
   checkbox, live count and unmatched-pattern warnings (en + zh).
5. Measured on the live wire schema: `core` 11,640 B, `issues` 15,586 B, `prs`
   17,480 B, `repos` 12,026 B, `ops` 20,067 B, `none` 0 B, `full` 65,159 B,
   `full` + aliases 107,157 B. `test/selection.test.mjs` covers the resolver and
   the preset/tool drift guard; `test/tool-surface.test.mjs` boots `apply()`
   against a stub registry and asserts the advertised names per preset (96 / 15
   / 0 / 133 with the flag).
6. `npm run check`: 180 tests, leak scan clean, `node --check` clean. Released
   `0.8.5`; #50 (lazy tool discovery) is deferred until the #51 dispatcher
   spike reports, and #51 lives on `experiment/dispatcher` — experiment branches
   are never tagged or published.
7. The first `v0.8.5` tag run failed in **CI, not in the plugin**: `publish.yml`
   and `publish-npmjs.yml` died on `test/tool-surface.test.mjs` importing
   `lib/index.js` on a runner without the DSH peers. The test now guards that
   import and skips with a message when the peers are absent, so the *resolver*
   checks still gate CI and the *boot* checks run wherever the peers exist. The
   tag was then moved: the release page (which pointed at a registry package that
   never published) and the tag were deleted, the fix was committed on `master`,
   and `v0.8.5` was re-tagged on the fixed commit. Lesson: anything that imports
   `lib/index.js` is a profile-only test.
8. After the re-tag all four `v0.8.5` runs are green: `0.8.5` is in the Forgejo
   registry (the tarball contains `lib/selection.js`), the release page carries
   its `dsh-gitea-0.8.5.tgz` asset, and npmjs has 0.8.5 **staged** — its
   `latest` dist-tag stays 0.8.4 until a maintainer approves the stage with 2FA.
   The live session then advertised the 96 canonical names with no alias, i.e.
   the HMR reload applied the new default.

## Session log — #51 dispatcher spike measured (2026-10-25)

The operator asked for real sessions: five open issues across three other
projects, triaged by five fresh cold-context agents per arm, identical prompts
and targets, read-only so both arms could run on the same issues.

1. Arm A `preset: full` (96 tools / 65,159 B); arm B `preset: dispatcher`
   (2 tools / 8,973 B). The flip to dispatcher was a one-line default change on
   this branch, picked up by HMR; the probe session confirmed it saw exactly
   `gitea` + `gitea_help`. Reverting to `master` restored the 96 typed tools live.
2. Measured from each agent's session log (`request/header` bytes, per-step
   `usage`, `tool/call` names): steps 33 → 43, gitea calls 31 → 43 (6 `gitea_help`
   + retries), argument errors 0 → 10 (all recovered), fresh input 127,912 →
   207,728, cache read 1,762,176 → 1,542,784, total tokens 1,919,082 → 1,768,138
   (−8 %), per-step 58.2k → 41.1k (−29 %).
3. The payload delta shows up exactly as predicted on a cold first request
   (50,530 vs 34,716 prompt tokens = 15,814 = 56 KB of schema), but it is
   **cache-read** tokens, which are cheap; the extra round trips are not. Cost
   weighted (cache ≈ 0.26 × fresh) the two arms are within ~3 %. Crossover is
   ~8–10 steps, so triage-sized tasks are a wash and longer sessions win a
   little, never the 7× the payload ratio suggests.
4. The 10 errors are one class: guessed argument names (`index` for `number`,
   `owner` for `repo: "owner/name"` + `q`, `includeComments` for
   `include_comments`, `issue` for `type`). The dispatcher's error text names the
   accepted arguments, which is why every run recovered — but each retry is a
   step the typed schema would not have cost.
5. Both arms also hit dsh-gitea#52 (issue formatters hide labels/assignee), so
   every triage needed `gitea_issue_timeline`; fixing that removes one call per
   triage in either mode.
6. Conclusion: keep this as an opt-in experiment, do **not** merge it as the
   default and do **not** add a "token saving" claim to the README. The functional
   result is good (5/5 tasks via 2 tools); the economics are a wash on short
   tasks. Data posted on #51.

## Session log — dispatcher preset and issue metadata (0.8.6, 2026-10-25)

The operator shipped both follow-ups from the #51 spike in one release.

1. #52 (`4848dd7`, PR #53): `gitea_issue_get` renders a metadata line
   (`labels: … · assignee: @me · milestone: 0.9`, omitted when empty) and
   `issue_list`/`issue_search` rows carry `[labels · @assignee]`. `RECORD_KEYS`
   already kept the fields; the formatters simply never read them. Covered by
   `test/issue-metadata.test.mjs` (6 shapes, including the all-empty case with no
   stray separators) and live-checked on `dsh-resend-mcp` #8.
2. #51 (`0d4cdd8`, PR #54): merged the dispatcher branch — `preset: dispatcher`
   registers `gitea` + `gitea_help`, `lib/dispatcher.js` builds the catalog and
   per-operation help from `TOOL_DEFS`, and `executeCanonicalTool()` is shared
   with the typed tools. `full` remains the default on purpose: the measured
   trade-off (+29 % cheaper steps, +30 % steps, ~8 % lower total) makes it a
   long-session option, not a replacement.
3. README documents the preset and the measured trade-off honestly (no "token
   saving" claim); CHANGELOG has the 0.8.6 entry. `npm run check`: 188 tests,
   leak scan clean, syntax clean.
4. Released `0.8.6`; #51 and #52 close with the release reference. The
   `experiment/dispatcher` branch stays for history only.

## Session log — preset dropdown and three tool defects (0.8.7, 2026-10-25)

The operator spotted the gap from the settings screenshot: 0.8.6 shipped
`preset: dispatcher` in the Host schema but the settings dropdown still listed
only the old presets, because `lib/client.js` had its own hardcoded array. While
fixing it, three defects filed by the t14btw agent were fixed in the same
release.

1. Preset dropdown: `PRESET_OPTIONS` is now one named list next to the locale
   dictionaries, and `test/selection.test.mjs` asserts it equals the Host's
   `PRESET_NAMES` — the drift class is closed, not just this instance of it.
2. #55: the wiki `update` branch reads the current page title when `title` is
   blank and sends it back, because Forgejo renames to `unnamed` otherwise.
   Live probe on `ml-lab/tardits` (create → update without title → list showed
   `Probe 55 Page (pageName: Probe-55-Page)` → delete).
3. #56: added the missing `gitea_flavor` formatter branch; live output is now
   `Flavor: forgejo · version 17.0.0+gitea-1.22.0` plus the notes.
4. #57: a `+gitea-<ver>` version is ambiguous, so detection probes the web UI
   `<title>` (Forgejo vs Gitea), records `detectedFrom`, and answers `unknown`
   with a reason if the probe fails. Live: this instance now reports `forgejo`.
5. `npm run check`: 195 tests (13 new across `test/flavor.test.mjs` and the wiki
   suite), leak scan clean, syntax clean.

## Session log — Host-authoritative preset list (0.8.8, 2026-10-25)

Right after 0.8.7 the operator picked `dispatcher` and the Host answered
`unknown tool preset "dispatcher" in Config.preset (expected: core, issues,
prs, repos, ops, full, none, custom)`. The checkout had `dispatcher`, so the
*running process* was holding the `lib/selection.js` instance loaded when the
process started (pre-0.8.6 merge); HMR had refreshed the formatter modules but
not that one. The client bundle is served per request, so the dropdown was
fresh while the Host was not — i.e. a version skew between the two halves
produced an option the Host rejects.

1. The Host is now the authority: `registerHttpRoutes` receives
   `presets: [...PRESET_NAMES]` and `/dsh-gitea/config` returns it; the form
   renders `presetOptions` from the response, with the bundled list only as a
   fallback for older Hosts. A stale/newer client can no longer invent a preset.
2. Because the config route is also the form's read path, the skew is now
   self-describing: a Host that does not accept `dispatcher` also does not send
   it.
3. `test/selection.test.mjs` asserts both halves (Host sends `...PRESET_NAMES`,
   client prefers the served list), alongside the existing "dropdown equals
   PRESET_NAMES" guard.
4. Reminder for the next reload: editing a Host module only refreshes *that*
   module under HMR; a module changed earlier by a branch merge may stay stale
   in the running process. When a Host constant looks wrong but the checkout is
   right, toggle the bundle (or restart `dsh web`) rather than editing code.

## Session log — #63 repository link, bundled releases (unreleased, 2026-10-25)

Issue #63 asked for a clickable Gitea/Forgejo logo in the Git drawer. Placement
changed after the operator's first live look: the combined *logo + repository
name* link is the first item in the header row (`[logo repo-name][branch]`),
not an icon after the branch badge. Assessment: small UI feature, no API or
schema breakage; the only real risk is that `lib/client.js` is generated output.

1. `lib/repo-link.js` (new): `parseRemoteWebUrl` covers `ssh://`, scp-like
   `git@host:owner/repo.git` and HTTPS origins, dropping `.git`, `:22` and
   deeper paths; `buildRepoLink` applies the icon choice (`forgejo` default,
   `gitea`, `none`), the `forceHttps` setting and the `defaultOwner` /
   `defaultRepo` fallback.
2. `lib/git-local.js` now returns `remoteUrl` in the snapshot; `/git-status`
   adds `repoLink`. That route is already polled every 4 s, so the link costs
   no extra request. The link is deliberately **not** derived from
   `defaultOwner`/`defaultRepo` — on this box those are `dsh`/`vps-setup`,
   while the checkout's origin is `dsh-plugins/dsh-gitea`.
3. `lib/client.js`: logo data URIs (`assets/logos/` holds sources + attribution;
   Forgejo is CC BY-SA 4.0), the `[logo repo-name]` anchor first in the header
   row, the settings select and both locale dictionaries. Data URI `<img>`
   keeps the Forgejo SVG's internal `<style>` out of the app DOM.
4. `lib/index.js`: `repoLinkIcon` volatile Config field, Forgejo default.
5. `test/repo-link.test.mjs`: 7 tests; `npm run check` is 216 tests, leak scan
   clean.
6. Process, not a release: the only build is a `v*` tag, so this sits on
   `feat/63-repo-link` (and `[Unreleased]` in `CHANGELOG.md`) until a bundle is
   worth shipping. `AGENTS.md` now records the bundled-release and on-server
   test-phase policy. Live visual verification (drawer header, settings select)
   still needs the operator: HMR covers the Host half, the client bundle needs
   a toggle/restart plus a hard refresh.
7. Docs follow-up on the same branch: the operator's web-edit added
   `English | [中文](README.zh.md)`, so `README.zh.md` is a full translation of
   the (now longer) English README rather than the stale upstream 334-line one;
   `package.json → files` ships it. The operator's screenshot became the README
   hero (`assets/screenshots/git-sidebar-drawer.jpg`), showing the #63 link in
   the drawer header. Upstream's `README.ru.md` was not restored — no
   maintained Russian translation exists on the fork.
