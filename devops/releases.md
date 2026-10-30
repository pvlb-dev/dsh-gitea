# Releases — versions, CI, registries, updater

Part of the dsh-gitea manual. The map is [`../AGENTS.md`](../AGENTS.md). Current
version facts are in [`state.md`](state.md); the upstream/sync policy in
[`upstream.md`](upstream.md).

**Only a `v*` tag builds.** A push to `master` runs checks and produces no
artifact, so merging verified work is cheap; cut a version when a bundle is
worth shipping.

The updater rule: it installs **our own package, not upstream's**. It reads
`dist-tags.latest` from `https://git.pvlb.dev/api/packages/dsh-plugins/npm/`
and installs the exact tarball URL with a throwaway `.npmrc` that leaves the
default registry (normally npmjs) alone. The `updates` Config flag gates both
the UI and `/api/dsh-gitea/update` (`isEnabled` in `lib/index.js`); this
profile keeps it **`false`** for the `link:` dev checkout. Enabling it lets the
next update replace that checkout with the published package — deliberate, not
an accident. The updater is double-gated: the loopback request fence in
`lib/plugin-updater.js` **and** the `updates` switch.

## Versioning and tags

- Fork version: `0.8.9` (2026-10-30): `dispatcher` is the Config default,
  trilingual README + hero illustration, Git-sidebar repository link (#63),
  the PR-comment/`gitea_help`/milestone formatters (#65/#66/#61), the wiki body
  (#70), the dispatcher catalog wording (#67), the issue-list `sort`, and the
  mirror sanitizer fix (#46). 0.8.8 was the Host-authoritative preset list;
  0.8.7 dropdown + flavor/wiki defects; 0.8.6 dispatcher preset + issue
  metadata; 0.8.5 tool-surface presets + opt-in aliases; 0.8.4 staged npmjs
  publishing; 0.8.3 publish config; 0.8.2 README + peer-range. Earlier builds
  used `<upstream base>-dsh.<n>`; hotfixes can use `0.8.9-dsh.<n>`.
- **Next: `0.9.0`, not cut.** It is the history-compaction release (see
  [`upstream.md`](upstream.md)); nothing is scheduled for it yet. Bundle a few
  issues before tagging — see
  [Bundled releases](#bundled-releases-and-the-on-server-test-phase).
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
  `files` = `lib/`, `assets/`, `cordis.patch.yml`, `README.md`,
  `README.zh.md`, `README.ru.md`, `LICENSE`. The Forgejo job publishes it, the
  npmjs job stages it.
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
- Release ritual: bump `package.json` + `CHANGELOG.md`, **refresh the
  translations** (`README.zh.md` / `README.ru.md` against `README.md` — see
  [`workflow.md`](workflow.md)), commit, push `master`, then
  `git tag -a v<version> -m "…" && git push origin v<version>`. The tag
  starts three jobs: registry publish, npmjs stage, release page. To backfill a
  tag that predates `release.yml`, dispatch it manually or POST the payload
  from `scripts/release-notes.mjs` with a user token.
- **Major releases compact the history.** Since 0.8.2 the repo is a public
  deployment fork whose `master` is mostly incremental fixes; at **0.9.0** (and
  every minor/major after it) squash the fork commits into a handful of logical
  ones *before* the tag. Rules: the upstream base commit stays untouched; the
  squash happens on a temporary branch and `master` is force-pushed once with
  operator approval (see [`upstream.md`](upstream.md)); `v0.8.*` tags remain, so the old shas that
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
  1. `npm run check` — the full gate (tests, leak scan, `node --check`; 225
     tests, ~15 s on this box). Run it after each change; it is the CI gate and
     it ships no artifact.
  2. Live check in the running GUI. Host-half edits are hot through the `hmr`
     root in the profile patch; the client bundle is served per request, so a
     `lib/client.js` change needs the bundle toggled (or `dsh web` restarted)
     and the page hard-refreshed. There is no browser automation here — say so
     in the report and let the operator look.
  3. Registration evidence without a browser: `cordis_inspect_query` for the
     Config schema, the `gitea_*` tool list and the occupied slots (see
     [Verify without a browser](deploy.md#3-verify-without-a-browser)).
  4. If remote CI is wanted mid-bundle, dispatch the existing `ci.yml`
     (`workflow_dispatch` accepts a branch) instead of adding a new workflow or
     pushing to `master` early. No `pull_request` trigger — see the security
     note at the top of `ci.yml`.
  5. Refresh the translations as the last step before the tag — this is the
     only point in the cycle where `README.zh.md` / `README.ru.md` are brought
     up to date with `README.md` ([`workflow.md`](workflow.md)). Do it in the
     release commit so the tag ships all three in sync.

