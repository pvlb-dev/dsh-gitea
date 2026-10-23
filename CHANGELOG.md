# Changelog

## [Unreleased]

### Wiki: readable metadata, empty wikis, and write actions
- `gitea_wiki list` no longer fails with "The target couldn't be found." on an
  enabled-but-empty wiki; the API's 404 is an empty page list (#9, `913013a`).
- `gitea_wiki get` renders title, slug, URL and last-commit summary instead of
  an identifier. The body remains metadata-only (clone `<repo>.wiki.git`);
  `sub_url` and `last_commit` now survive `slimRecord` (#4, `30ce29d`).
- `gitea_wiki` gained `create`, `update` and `delete` (`POST /wiki/new`,
  `PATCH|DELETE /wiki/page/{pageName}`), with base64 bodies and `confirm: true`
  for delete. `list` shows the canonical `pageName` slug that writes must use
  (#10, `fbca62a`).

## [0.7.40-dsh.7] - 2026-10-24

### Never override the default npm registry during updates
- The updater installs the exact version's tarball URL and its temporary
  `.npmrc` only adds our auth entry; the user's default registry (normally
  npmjs) is preserved. Previously it set `registry=<forgejo>`, so pnpm tried to
  resolve every other profile package (e.g. `dsh-cost-meter`) from Forgejo and
  failed with `ERR_PNPM_META_FETCH_FAIL`; `remove` failed the same way.
- Profiles that mix the Forgejo package with npmjs packages no longer need a
  registry override: keep npmjs as the default and install `dsh-gitea` from the
  explicit tarball URL.

## [0.7.40-dsh.6] - 2026-10-24

### Make the in-UI updater work from a minimal service PATH
- `installExact` prepends the Node binary's directory and `PNPM_HOME` to the
  `dsh plugin` child PATH, so the updater can find pnpm when DSH runs as a
  systemd unit with a minimal environment.
- The updater now logs the failure and returns the detail in the 503 body, so
  the settings panel shows the real cause instead of "see server logs". Plugin
  install diagnostics are in
  `<profile>/.plugin-manager/logs/operation-*/pnpm.log`.

## [0.7.40-dsh.5] - 2026-10-23

### Fix raw locale keys on the settings page
- The events panel referenced `eventsTitle` / `eventsEmptyHint`, which were
  missing from both dictionaries, so the settings page rendered the raw keys at
  the bottom. Added English/Chinese entries and made the local `makeT` fallback
  interpolate `{param}` placeholders; the empty hint now shows the webhook URL.

## [0.7.40-dsh.4] - 2026-10-23

### Package renamed to dsh-gitea
- **Unscoped name**: the package is now `dsh-gitea` (was
  `@goodandready/dsh-gitea`). The bundle row name, host `name` export, web
  bundle id, session-header seat id and `plugins.row.config` key
  (`dsh-gitea#dsh-gitea`) follow. The old scoped package stays in the registry
  for pinned installs.
- **No runtime dependencies**: `lib/semver.js` replaces the `semver` package in
  the updater and release assistant, so the published package needs only the DSH
  peers. The updater's temporary `.npmrc` points the package at the Forgejo
  registry and the `@deepseek-ai` peer scope at npmjs.
- **Publish**: the tag workflow publishes the unscoped name; `NPM_TOKEN` is
  unchanged.

## [0.7.40-dsh.3] - 2026-10-23

### Own CI, publishing and updater; translations dropped
- **Translations removed**: `README.ru.md` and `README.zh.md` are gone (and removed
  from `package.json#files` and the leak scan). `README.md` is the single README.
- **Forgejo Actions CI**: `.forgejo/workflows/ci.yml` runs on every push to
  `master`: `npm run check` (tests + leak scan + syntax) and `npm pack --dry-run`.
  There is no `pull_request` trigger — the shared runner exposes the host's
  rootless Docker socket, so only maintainer events execute workflows.
- **Publish on tags**: `.forgejo/workflows/publish.yml` runs on `v*` tags, checks
  the tag against `package.json`, and publishes to
  `https://git.pvlb.dev/api/packages/dsh-plugins/npm/` with the `NPM_TOKEN`
  secret (write:package). Duplicate versions are skipped; manual runs are dry
  runs.
- **Release workflow fix**: `npm pkg delete private` before publishing.
  `npm pkg set private=false` stores the string `"false"`, which npm treats as
  truthy and aborts with `EPRIVATE`.
- **Updater points at our registry**: `latestVersion()` reads the packument's
  `dist-tags.latest` (Forgejo 17 has no npmjs `/latest` alias), and installs use
  a throwaway scoped `.npmrc` so only `@goodandready` comes from the Forgejo
  registry while runtime deps stay on npmjs. The `updates` switch still gates it;
  this profile keeps it off for the `link:` dev checkout.
- **Tests**: `test/plugin-updater.test.mjs` covers packument parsing, numeric
  fork ordering, caching, auth/userconfig, and `getStatus`. `npm run check` is now
  the single CI gate.

## [0.7.40-dsh.2] - 2026-10-23

### Tool trust patch: complete lists, no bare OK, label ids (#2, #5, #7)
- **`gitea_issue_list` no longer truncates silently (#2)**: the formatter applied
  `data.slice(0, 20)` to every array result whatever the API page size. It now
  renders every row up to 100 and, beyond that, appends an explicit
  `… and N more — narrow the filter or page through.` footer.
- **No result is a bare `OK` any more (#5)**: empty arrays return a per-tool
  message (`No issues.`, `No labels.`, `No pull requests.`, …, fallback
  `No results.`); unknown objects return identifying fields (`name`/`title`/
  `login`/`number`/`path`) plus a ≤300-char JSON snippet; `{ok:true}` with no
  payload returns `Done.`
- **`gitea_labels list` exposes numeric ids (#7)**: each label renders as
  `type/bug (id: 13, #e11d48) — Defect…`, so `action: "set"` can consume the
  list output; a successful `create` echoes `Label "…" created (id N).`;
  `slimRecord` keeps `color`/`description` on label-shaped records. Lists over
  100 rows get the same visible footer.
- **Tests**: new `test/handlers-formatters.test.mjs` (13 cases) covers the
  acceptance lists; `npm test` is 25/25 and `npm run test:leaks` is clean.
- **Branch**: the repository default branch is now `master` (was `main`), and
  the old `main` was removed on the forge.

## [0.7.40-dsh.1] - 2026-10-22

### Fork hardening: updater off-switch, docs, versioning
- **In-UI npm updater can be switched off**: new volatile `updates` Config field
  (default `true`). When `false`, the settings form hides the auto-updater panel and
  skips its registry poll, and `POST/GET /api/dsh-gitea/update` answers
  `403 {"code":"disabled"}` for every request. This deployment keeps `updates: false`
  because the updater installs `@goodandready/dsh-gitea@<npm latest>` and would replace
  the `link:` checkout with the upstream tarball, reverting every fork patch. The gate
  is applied server-side (`lib/plugin-updater.js` `isEnabled`) as well as in the UI.
- **Fork identity**: version is now `0.7.40-dsh.1`, package is marked `private` to make
  accidental `npm publish` fail, and `repository`/`homepage`/`bugs` point at our Forgejo.
  `upstream` remote tracks `GooDAnDReaDY/dsh-gitea` for deliberate syncs; GitHub is not a
  push target.
- **Documentation is ours now**: `README.md` rewritten as the fork's operational README
  (install on this server, settings, security, upstream sync, versioning);
  `README.ru.md` and `README.zh.md` rewritten as shorter fork translations instead of
  upstream marketing snapshots. `AGENTS.md` gained the fork/upstream policy, sync ritual,
  conflict hotspots, version/tag convention, updater off-switch contract, and this
  session's log.
- **Regression tests**: `test/client-settings.test.mjs` now asserts the off-switch wiring
  (Config field, UI gating, no registry poll when off) and proves the updater refuses
  `GET`/`HEAD`/`POST` with a behavioral fake-server test.

## [0.7.40] - 2026-10-22

### Settings UI restored on DSH 0.2.x, local-checkout installs fixed
- **Settings page registered where DSH 0.2.x renders it**: `lib/client.js` now registers a
  `settings.section` page (`Settings → Gitea`) in addition to the keyed
  `plugins.row.config` page (`@goodandready/dsh-gitea#dsh-gitea`). The old
  `settings.plugin.item` seat no longer exists on 0.2.x and was inert; `plugins.item` is
  kept only as a compatibility seat for older cores.
- **Settings form no longer disappears on remote/LAN pages**: the form previously gated
  itself on the browser `configForms` mirror, which reports `unavailable` on non-loopback
  pages (remote sessions keep preferences process-local). It now reads and saves through
  its own Host route `/dsh-gitea/config`, renders as soon as that read succeeds, and
  shows a retry action on failure. Per-field `configForms` writes were removed; saving is
  one transactional POST instead of duplicate writes.
- **Writability is explicit**: `/dsh-gitea/config` answers `writable`, and `POST` refuses
  with `503` when the Host Settings service cannot persist, instead of reporting a save
  that would be lost on restart. `settings/document-updated` now re-projects the served
  document for this namespace, so writes from other settings surfaces apply live.
- **Settings page no longer 403s on trusted LAN/Tailscale URLs**: `lib/http-guard.js`
  treated an admitted DSH Connection request as "no decision" and fell through to its own
  loopback-only fallback, so a valid browser session on a configured trusted hostname got
  `403` from `/dsh-gitea/config`. A mounted Connection is now authoritative for reads and
  writes; the fallback runs only when it is absent. Regression tests cover admitted,
  rejected, and throwing Connection faces.
- **Local checkout installs work**: new `scripts/dev-link-dsh.mjs` /
  `npm run dev:link` link the DSH peer packages into the checkout so a `link:` install
  (Plugin Manager local path) can import the Host half. README documents the
  `spawn pnpm ENOENT` profile-patch fix as well.
- **Public tree hygiene**: `npm test` and `npm run test:leaks` now run in the published
  tree (`test/client-settings.test.mjs`, `scripts/leak-scan.mjs`) instead of failing on
  files stripped from the mirror.

## [0.7.39] - 2026-10-21

### Public Mirror Bidirectional Sync Dashboard & Webhook Sandbox (#343, #345)
- **Public Mirror Bidirectional Sync Dashboard & Monitoring (#343)**:
  - Implemented `lib/mirror-dashboard.js` with client methods in `lib/gitea-client.js` (`listPushMirrors`, `syncPushMirrors`, `syncPullMirror`).
  - Added agent tool `gitea_mirror_sync_status` to inspect Gitea push mirror statuses, error reports, and commit lag between local `main` and remote mirrors (`github`, `mirror`).
  - Supports dry-run protected forced mirror synchronization (`action: sync` gated by `confirm: true`).
  - Integrated mirror synchronization status and commit lag alerting into `lib/chip-pr-ci.js` (`enrichChip`) and Git status chip in `lib/client.js` with non-blocking timeout protection.
  - Added hub actions `mirror-status` and `mirror-sync` in `lib/routes-hub.js`.
- **Webhook Sandbox & Event Replayer (#345)**:
  - Implemented `lib/webhook-sandbox.js` featuring an isolated 20-entry FIFO ring buffer of raw incoming webhook requests.
  - Automatically captures incoming POST requests on `/dsh-gitea/webhook` with timestamp, event type, action, raw byte size, client IP, delivery headers, and HMAC-SHA256 signature validation status (`valid`, `invalid`, `unsigned`, `unconfigured`).
  - Automatically sanitizes sensitive tokens, API keys, passwords, and private keys from buffered payloads (`sanitizeWebhookPayload`).
  - Added event replay functionality (`replayWebhook`) to re-inject buffered or simulated events into `eventsStore`, `giteaEventsService` event bus, and push notification dispatcher without contacting external Gitea or GitHub servers.
  - Added agent tool `gitea_webhook_sandbox` (`list`, `get`, `replay`, `clear` with `confirm: true` gate).
  - Added hub actions `webhook-sandbox`, `webhook-sandbox-get`, `webhook-replay`, and `webhook-clear` in `lib/routes-hub.js`.
- **Route Architecture Modularization**:
  - Extracted Gitea Hub endpoint execution into dedicated modular handler `lib/routes-hub.js` (287 lines), reducing `lib/routes.js` to 435 lines to strictly enforce the < 600 line limit across all route modules.

## [0.7.38] - 2026-10-21

### Intelligent Reviewer Auto-Assignment, Branch Protection & Deploy Keys Security Audit (#339, #342)
- **Intelligent Reviewer Matcher & CODEOWNERS Auto-Assignment (#339)**:
  - Implemented `lib/reviewer-matcher.js` supporting multi-location discovery across `CODEOWNERS`, `.gitea/CODEOWNERS`, `.github/CODEOWNERS`, and `docs/CODEOWNERS`.
  - Implemented glob pattern matching (`*`, `**`, file extensions, directory prefixes) with standard git precedence (later matching rules override earlier ones).
  - Integrated git blame / commit log contributor ranking fallback when explicit CODEOWNERS rules are absent for modified files.
  - Automatically filters out PR author to prevent self-assignment and provides confidence metrics (`high`, `medium`) with rationale.
  - Added agent tool `gitea_suggest_reviewers` (in `lib/tool-defs/reviews.js` and `lib/handlers/reviews.js`) and integrated automated reviewer recommendations into PR creation (`lib/issue-to-pr.js`).
- **Branch Protection Governance & Deploy Keys Security Audit (#342)**:
  - Extended `lib/gitea-client.js` with comprehensive branch protection and deploy key administration endpoints.
  - Implemented `lib/branch-protection.js` with policy inspection, enforcement (`required_approvals`, `block_force_push`, branch deletion rules), and dry-run preview before mutations (`confirm: true` gate).
  - Implemented deploy keys management (`gitea_deploy_keys`) with read-only/write access inspection, creation, and secure deletion.
  - Implemented automated repository security audit (`gitea_security_audit`) assessing branch protections, deploy key risks, and push rules.
  - Integrated branch protection audit checks into repository health diagnostics (`lib/project-health.js`).
  - Added agent tools `gitea_branch_protection_get`, `gitea_branch_protection_set`, `gitea_deploy_keys`, and `gitea_security_audit` (in `lib/tool-defs/repos.js` and `lib/handlers/repos.js`).

## [0.7.37] - 2026-10-21

### Domain Handlers & Tool Definitions Architecture, Conventional Commits SemVer & Packages Registry (#354, #344, #337)
- **Domain Handlers & Tool Definitions Decomposition (#354)**:
  - Decomposed monolithic `lib/handlers.js` (1538 lines) and `lib/tool-defs.js` (940 lines) into dedicated domain submodules (`lib/handlers/` and `lib/tool-defs/` for issues, prs, releases, repos, reviews, worktrees, formatters, and common helpers).
  - Enforced strict < 600 lines per file architecture constraint across all hand-written source code (every decomposed module is between 25 and 281 lines).
  - Preserved 100% public contracts, legacy tool aliases, and export signatures via root facades `lib/handlers.js` (~115 lines) and `lib/tool-defs.js` (1 line).
- **Conventional Commits SemVer Analyzer & Release Generator (#344)**:
  - Implemented `lib/release-generator.js` with automated commit parsing according to Conventional Commits specification.
  - Automatically calculates next SemVer version (`calculateSemverBump`, `bumpVersion`) based on breaking change markers (`!`, `BREAKING CHANGE:` footer), new features (`feat:`), and fixes/chores.
  - Generates structured, grouped Markdown changelogs with scopes, PR links, and author attribution.
  - Integrated automated security scanner (`scanReleaseTextForSecrets`) to detect and sanitize private IPs and leaked credential tokens from release notes.
  - Added agent tool `gitea_release_plan` and wired into release assistant workflow.
- **Gitea Package Registry Integration (#337)**:
  - Implemented `lib/package-registry.js` with client methods in `lib/gitea-client.js` (`listPackages`, `getPackage`, `deletePackageVersion`).
  - Added agent tools `gitea_packages_list`, `gitea_package_get`, `gitea_package_delete` (gated by `confirm: true` with dry-run preview), and `gitea_package_config`.
  - Supports client configuration generation for npm (`.npmrc`), PyPI (`~/.pypirc`), OCI/Docker (`docker login`), and Generic packages.

## [0.7.31] - 2026-10-19

### DSH Connection Authentication & Route Security Boundary (#346, #347)
- **Host Connection Authentication (#346, #347)**: Integrated DSH Host Connection Service (`ctx.connection.requestRejection(req)`) across all read and write routes (`/dsh-gitea/config`, `/events`, `/git-status`, `/git-graph`, `/sse`, `/release-assistant`, `/hub`), enforcing strict authentication for external LAN/WAN clients and rejecting unauthenticated requests with HTTP 401 Unauthorized or 403 Forbidden.
- **Write Guard Bypass Remediation (#346)**: Eliminated reliance on spoofable client headers (`Host`, `Origin`, `Sec-Fetch-Site`) for write route authorization, preventing unauthenticated remote tampering with `baseUrl` and `tokenEnv` on `POST /dsh-gitea/config` and securing `GITEA_TOKEN` against exfiltration.
- **Fail-Closed Socket Gating (#346, #347)**: Requests on active network sockets with missing or unknown `remoteAddress` strictly fail closed with HTTP 403.
- **Loopback Fallback Isolation (#347)**: In test/standalone environments without the Connection service, endpoints fall back strictly to local loopback (`127.0.0.1`, `::1`), denying non-loopback network access.

## [0.7.30] - 2026-10-15

### Security Hardening & Settings Deserialization (#333)
- **Hub Actions Write Guard (#333)**: Enforced `rejectUntrustedWrite` fail-closed guard on POST `/dsh-gitea/hub` endpoint (`lib/routes.js`) for PR approval, merging, closing, and worktree garbage collection actions, preventing cross-site request forgery and same-site cross-origin traversal.
- **Settings Describe Row Status Resilience (#333)**: Treated `row.status` as optional in `readServedConfig` (`lib/index.js`), ensuring valid configuration documents returned by `settingsSvc.describe()` on DSH host startup are successfully restored and applied to `dynamicConfig`.

## [0.7.29] - 2026-10-11

### Event Timestamp Resolution & Webhook Secret Persistence (#309, #331)
- **Events Drawer Timestamp Contract (#309)**: Updated event age resolution in `lib/client.js` (`resolveEventEpochSeconds`) to adhere strictly to the canonical `EventStore` contract field `ev.at`. Normalizes ISO-8601 strings, millisecond timestamps, and second timestamps. Falls back gracefully to `ev.timestamp` when `ev.at` is omitted, and safely defaults to `Date.now()` on missing or malformed inputs without producing `NaN` or invalid relative age labels.
- **Webhook Secret Credential Reference Exclusivity & Persistence (#331)**:
  - Eliminated deprecated inline `webhookSecret` declaration from `Config` schema in `lib/index.js` in favor of `webhookSecretEnv` (`role: 'credential-ref'`).
  - Updated `/dsh-gitea/webhook` route in `lib/routes.js` to validate HMAC signatures exclusively via `webhookSecretEnv` resolved from DSH credentials; returns HTTP 401 (`webhook secret not configured`) when `webhookSecretEnv` is unconfigured.
  - Updated `POST /dsh-gitea/config` in `lib/routes.js` and `servedScope.update` in `lib/index.js` to preserve existing `webhookSecret` in settings documents if present when UI forms submit without it, preventing silent document corruption.

## [0.7.28] - 2026-10-08

### Audit Round 2 Remediation & Security Hardening (#279)
- **Hub Write Authorization Guard (#327)**: Enforced `rejectUntrustedWrite` fail-closed guard on POST `/dsh-gitea/hub` endpoint (`lib/routes.js`) to block unauthorized cross-site and non-loopback write requests.
- **Incident Logs Secret Sanitization (#323)**: Sanitized JSON-quoted `"password": "..."` and `"api_key": "..."` in incident report logs and metadata (`lib/incident-report.js`).
- **Merge Gate CI Fail-Closed (#283)**: Guaranteed fail-closed behavior in `checkMergeReadiness` (`lib/merge-gate.js`) when either commit statuses or workflow runs endpoints encounter API errors.
- **PR Rebase Remote & Commit Divergence Guard (#285)**: Added git origin hostname verification against configured Gitea host, origin repository path matching, and verified local branch commit SHA matches PR head SHA before rebasing (`lib/pr-rebase.js`).
- **Task Service ExternalRef Pagination (#299)**: Paginated external reference issue search up to 10 pages when `hasMore` or total count exceeds page capacity (`lib/task-service.js`).
- **Review Event APPROVED Enum (#328)**: Corrected review event submission in `lib/ai-review.js` and `/dsh-gitea/hub` to standard Gitea `APPROVED` enum.
- **Issue-to-PR Draft Verification & Parameter (#329, #306)**: Left draft checklist items unchecked when isolated worktrees are pending creation, and exposed `create_pr` parameter in `gitea_issue_to_pr` tool definition (`lib/issue-to-pr.js`, `lib/tool-defs.js`).
- **Release Notes Multi-Page Fail-Closed & Target Base Branch (#300)**: Fails closed on page 2+ API failures during release notes compilation and filters merged PRs strictly by target `base` branch (`lib/release-notes.js`).
- **Legacy Tool Aliases Parameter Cleanliness (#305)**: Stripped `action.required: true` parameter from registered legacy alias schemas (`lib/index.js`).
- **Truncation Metadata Evaluation (#307, #312)**: Evaluated `truncated: true` and inspection metrics in triage digest and project health when results reach sample limit or response headers indicate `hasMore` (`lib/triage-digest.js`, `lib/project-health.js`).
- **Commit Graph Pagination Race Prevention (#308)**: Sequenced graph request global sequence IDs (`_graphGlobalSeq`) in `lib/client.js` to prevent late responses from overwriting newer offsets.
- **Hub Worktrees Workspace Wiring (#252)**: Passed workspace `cwd` and `sessionId` into worktree action dispatchers in `/dsh-gitea/hub` (`lib/routes.js`).
- **AI Review Diff Hunk Line Tracking (#253)**: Accurately tracked diff hunk line numbers for inline review comments and handled inaccessible diffs gracefully (`lib/ai-review.js`).
- **Ecosystem Service Dispatch Contracts (#254)**: Added `sync_card` and `remember` action enums in tool definitions, with fail-closed error handling when services fail (`lib/memory-brain-sync.js`, `lib/task-tracker-sync.js`, `lib/tool-defs.js`).
- **Release Preflight Patch Version Derivation (#255)**: Auto-derives patch version when target version is omitted, and enforces GitHub mirror remote requirement (`lib/release-assistant.js`).

## [0.7.27] - 2026-10-08

### Audit Remediation, Safety Contracts & Lifecycle Hardening
- **Incident Reporting Secret Masking (#323)**: Strengthened regex sanitization in `gitea_incident_report` (`lib/incident-report.js`) to support quotes in JSON field keys (e.g. `"apiKey": "..."`, `"api_key": "..."`) and strictly mask OpenSSH, EC, and RSA private key header blocks, certificates, and auth credentials.
- **PR Rebase Target & Origin Validation (#285)**: Added upstream PR state validation in `runRebase` (`lib/pr-rebase.js`) to reject closed or merged PRs fail-closed, verified `remote.origin.url` against target `owner/repo`, and blocked rebasing on detached `HEAD`.
- **API Search & Slim Record Field Preservation (#280, #292)**: Handled dual promise/callback execution in `deps.execFile` within `gitea_code_search` (`lib/handlers.js`). Preserved `filename`, `changes`, and `patch` in `slimRecord` across diff payloads. Formatted health API error messages cleanly as `'unknown (API error)'`.
- **Project Health Metrics & Truncation (#307, #312)**: Preserved numeric metric counters in `lib/project-health.js` while recording API failures in `data.errors`. Added explicit truncation indicators (`truncated: true`, `sampleLimit`, `inspectedCount`) in analytics and triage digests.
- **Release Notes Multi-Page Pagination (#300)**: Paginated tags and pull requests up to 5 pages in `buildReleaseNotes` (`lib/release-notes.js`). Fail closed when tags are queried on tag-capable clients but missing; graceful fallback for minimal clients lacking `listTags`.
- **Release Assistant SemVer & Preflight (#325, #255)**: Integrated `semver` library for strict SemVer comparison in `lib/release-assistant.js`. Dynamically resolved current version from `package.json`. Added test-suite and mirror-pipeline readiness preflight checks. Handled error in `readPackageVersion` catch block.
- **Interactive Gitea Hub & Drawer Actions (#252, #255)**: Implemented action dispatcher in `POST /dsh-gitea/hub` (`lib/routes.js`) for approving, merging, and closing PRs, closing issues, switching worktrees, and cleaning merged worktrees. Added runner inspection and assignee filtering to `GET /dsh-gitea/hub`. Localized action controls in `lib/client.js`.
- **Real-Time SSE Lifecycle & Tab Deduplication (#324)**: Wired SSE client cleanup on tab unload and reconnection to prevent event listener leakage in `lib/client.js`. Integrated SSE broadcast with `giteaEventsService` in `lib/routes.js`.
- **Autonomous AI PR Review Submissions (#253)**: Extended `gitea_ai_review` (`lib/ai-review.js`) to submit formal PR reviews with inline line diff comments via `client.createPullReview` and `client.submitPullReview`. Wired background worktree GC inspection into `BgScheduler.onTick`.
- **Ecosystem Sync Bridges (#254)**: Implemented `action: 'remember'` / `sync: true` in `gitea_memory_brain_sync` (`lib/memory-brain-sync.js`) dispatching to `deps.memoryBrain.remember`. Implemented `action: 'sync_card'` in `gitea_task_tracker_sync` (`lib/task-tracker-sync.js`) adhering to `dsh-drives.task-provision.v1`.
- **Extended Gitea Client Endpoints**: Added `createPullReview`, `submitPullReview`, `editPull`, `listRunners`, and `editIssue` alias to `GiteaClient` (`lib/gitea-client.js`).

## [0.7.26] - 2026-10-07

### Test Infrastructure, Ecosystem & Agent Lifecycles (Package 6)
- **Task service numeric label IDs resolution (#298)**: Allowed both numeric label IDs (`int64`) and string label names in `normalizePayload` (`lib/task-service.js`). Resolved string label names to numeric IDs via `client.listLabels(owner, repo)` before API submission, failing closed with `labels-not-found` on unknown labels.
- **ExternalRef cross-repository identity isolation (#299)**: Scoped issue searches by `repo` and `owner` in `lib/task-service.js` and strictly verified repository identity (`issue.repository.name === payload.repo` and matching owner), preventing cross-repository task collision and leakage.
- **Interactive action cards and Gitea Hub view (#252)**: Added Gitea Hub tab in drawer backed by `/dsh-gitea/hub` route to display assigned issues and open PRs with one-click actions. Enriched tool output formatting (`formatToolResult`).
- **Autonomous agent lifecycle & worktree GC (#253)**: Implemented `gitea_worktree_gc` (`lib/worktree-gc.js`) with safe detection of merged worktrees via `merge-base --is-ancestor` and protections for main, current, and dirty trees. Added `gitea_issue_to_pr` (`lib/issue-to-pr.js`) and automated `gitea_ai_review` (`lib/ai-review.js`) with secret leak and path traversal checks.
- **Ecosystem sync & incident automation (#254)**: Implemented bidirectional Task Tracker kanban sync bridge `gitea_task_tracker_sync` (`lib/task-tracker-sync.js`) conforming to `dsh-drives.task-provision.v1`. Added Memory Brain long-term facts indexing `gitea_memory_brain_sync` (`lib/memory-brain-sync.js`) and sanitized incident ticket generator `gitea_incident_report` (`lib/incident-report.js`).
- **One-Click Release Assistant & SSE streaming (#255)**: Added `gitea_release_assistant` (`lib/release-assistant.js`) with SemVer bump validation, multilingual changelog generator, and preflight runner. Implemented `/dsh-gitea/sse` real-time event streaming route with keepalive ping and tab deduplication in `lib/client.js`.

## [0.7.25] - 2026-10-07

### Routing, UI/UX, Git Status Chip & Data Serialization (Package 5)
- **Response field retention (#280)**: Expanded `RECORD_KEYS` and `slimRecord` in `lib/handlers.js` to preserve `labels`, `milestone`, `assignees`, `diff`, `stat`, `filesCount`, `sha`, `download_url`, `encoding`, `target`, `commit`, `author`, `committer`, `parents`, `stats`, `files`, `tag_name`, `metrics`, `summary`, `healthScore`, `issues`, `pulls`, `runs`, `truncated`, `sampleSize`, `inspectedCount`, `reactions`, etc.
- **Lossless non-circular object reuse (#281)**: Replaced global `WeakSet` in `toLossless` with a recursion-stack `Set`, preserving shared non-circular objects across sibling fields without dropping data while safely breaking circular references.
- **Auto-merge CI status verification (#283)**: Integrated commit status and actions runs checks for head SHA in `checkMergeReadiness` (`lib/merge-gate.js`); blocks auto-merge when CI is pending or failing.
- **Review order and changes requested gate (#284)**: Evaluates latest chronological review per reviewer in `checkMergeReadiness`; `REQUEST_CHANGES` blocks approval, `DISMISSED` revokes prior decision.
- **Target PR state and branch verification (#285)**: Added PR status and local branch validation in `runRebase` (`lib/pr-rebase.js`); rebases onto actual target base branch.
- **Multi-instance routing & parameter declaration (#286)**: Declared `instance` parameter across all 71 tools in `TOOL_DEFS`; rejects unknown instance with explicit error in `makeDeps` and `runHandler`.
- **Fail-closed label resolution in batch ops (#288)**: Validates label names against repository catalog in `applyBatch` (`lib/batch-ops.js`), returning an error on missing labels instead of wiping all issue labels.
- **Milestone parameter in batch issue ops (#289)**: Exposed `milestone` parameter in `gitea_batch_issue_ops` (`lib/tool-defs.js`) and wired to `planBatch` / `applyBatch` dispatch in `lib/handlers.js`.
- **Release notes tag timestamp filtering (#300)**: Resolved tag and release dates in `buildReleaseNotes` (`lib/release-notes.js`), strictly filtering PRs within the `(fromTagDate, toTagDate]` range.
- **Scoped BroadcastChannel and Web Lock (#302)**: Scoped cross-tab Git status broadcasts and leader Web Lock in `lib/client.js` by `cwd` and `sessionId` to prevent cross-workspace state leakage.
- **Referentially stable fallback snapshots (#303)**: Replaced inline object literals in `useSyncExternalStore` fallback callbacks with frozen static constants (`UNAVAILABLE_SNAPSHOT`, `LOADING_SNAPSHOT`) in `lib/client.js`.
- **Robust git repository detection (#304)**: Returns error in `buildGitSnapshot` (`lib/git-local.js`) when git commands fail instead of reporting a clean repository on `main`.
- **Legacy tool aliases registration (#305)**: Exported `LEGACY_MAP` and registered all 36 legacy aliases in `ctx.tools.register` (`lib/index.js`).
- **PR template generator section compliance (#306)**: Updated `templateForBranch` (`lib/pr-templates-branch.js`) so that all branch types satisfy all 6 mandatory sections required by `checkPrTemplate`.
- **Rich human-readable tool result formatting (#307)**: Added structured output formatters in `formatToolResult` (`lib/handlers.js`) for merge readiness, health, triage, inbox, analytics, impact, and labels.
- **Commit graph pagination via skip/offset (#308)**: Supported `skip` / `offset` in `fetchCommitGraph` (`lib/graph.js`) and `/dsh-gitea/git-graph` route (`lib/routes.js`), allowing "Load more" to fetch subsequent commits past the 500 limit clamp.
- **Events drawer timestamp resolution (#309)**: Updated event timestamp parsing in `lib/client.js` to prefer `ev.at` over `ev.timestamp`.
- **Explicit truncation metadata in reports (#312)**: Added `truncated: true`, `sampleLimit`, and `inspectedCount` in `lib/analytics.js`, `lib/project-health.js`, and `lib/triage-digest.js` when reaching sample caps.
- **Header utilities slot localization and UI strings (#313)**: Registered header slot with `locale: NS` in `lib/client.js`; localized "CI Failed", "Active", and "changed" in both `en` and `zh` dictionaries.

## [0.7.24] - 2026-10-07

### API Routes & Network Contracts (Package 4)
- **Real Issue search route & scope filtering (#290)**: Switched `searchIssues` in `lib/gitea-client.js` from non-existent `/search/issues` to Gitea Swagger v1 endpoint `/repos/issues/search`, with client-side filtering by `query.repo`.
- **PR review line comment submission protocol (#291)**: Replaced unsupported `POST /repos/{owner}/{repo}/pulls/{number}/comments` (HTTP 405) with Gitea review creation protocol `POST /repos/{owner}/{repo}/pulls/{number}/reviews` (`event: 'COMMENT'`), mapping line numbers to `new_position`.
- **Local git grep search capability gate (#292)**: Added local `git grep` execution in `gitea_code_search` (`lib/handlers.js`) when `cwd` and `execFile` are present; returns structured matches `{ path, line, text }` and informative capability error when remote search is requested without local workspace. Updated tool description in `lib/tool-defs.js`.
- **Notification read state route & HTTP 205 handling (#293)**: Switched `markNotificationsRead` in `lib/gitea-client.js` to `PUT /notifications` and handled HTTP 205 Reset Content responses without serialization errors.
- **Actions workflow run and job rerun routes (#294)**: Fixed job rerun endpoint to `/repos/{owner}/{repo}/actions/runs/{run}/jobs/{job_id}/rerun` in `lib/gitea-client.js`; added automatic `run_id` lookup for backward compatibility and implemented `rerunActionsRun`. Added `run_id` parameter to `gitea_ci` in `lib/tool-defs.js`.
- **Branch creation option mapping (#295)**: Aligned `createBranch` payload with Gitea `CreateBranchRepoOption` schema (`{ new_branch_name, old_ref_name }`) in `lib/gitea-client.js` and `lib/handlers.js`, accepting both standard and legacy field names.
- **Merge state vs mergeability distinction (#296)**: Clarified `getPullMergeStatus` (204 = merged, 404 = not merged); combined with `getPull` in `gitea_pr_merge_status` to report both `merged` and `mergeable`. Extended `RECORD_KEYS` to preserve `mergeable`, `has_issues`, and `has_conflicts` in `slimRecord`. Updated human-readable messages in `formatToolResult`.
- **Plaintext logs & strict JSON parser integrity (#297)**: Enhanced `request` response parser in `lib/gitea-client.js` to return raw plaintext for job logs (`getJobLogs`), diffs, and octet streams. Flagged malformed JSON on HTTP 200 as structured parsing errors instead of masking them into `undefined`.

## [0.7.23] - 2026-10-06

### Tools, Data Integrity & Resource Lifecycle (Package 3)
- **Logger routing & host stderr protection (#263)**: Passed `logger: ctx.logger` in `makeDeps` (`lib/index.js`); `getLoggerWarn` in `lib/handlers.js` routes warnings to `logger.warn`, preventing stderr pollution in the host DSH process.
- **Restore timeline query parameters (#264)**: Removed duplicate `parameters` block in `gitea_issue_timeline` (`lib/tool-defs.js`), restoring pagination and time filter fields (`since`, `before`, `limit`, `page`).
- **Safe PR rebase execution & refspec validation (#267, #268)**: `runRebase` in `lib/pr-rebase.js` checks exit codes for `fetch`, `rebase`, and `push`, returning detailed error diagnostics on failure; enforces configured `gitWrapper` and sanitizes branch names against refspec injection.
- **Repository template bootstrap file creation (#269)**: Added `createFile` and `updateFile` to `GiteaClient` (`lib/gitea-client.js`); `applyBootstrap` in `lib/repo-bootstrap.js` actually creates and updates all generated template files (`README.md`, `.gitignore`, workflows, issue/PR templates).
- **Mutating tool confirm safety gates (#272)**: Added `confirm: true` requirement (with dry-run plan by default) to `gitea_batch_issue_ops`, `gitea_label_bootstrap`, and `gitea_org create_repo`.
- **Eliminate dead formatters (#273)**: Removed unreachable duplicate formatting blocks in `formatToolResult` (`lib/handlers.js`) for `gitea_pr_diff`, `gitea_reactions`, and `gitea_issue_timeline`.
- **Lifecycle-managed middleware registration (#274)**: Registered `ctx.on('tools/execute', ...)` in `lib/index.js` via `ctx.effect(...)` so tool interception listeners are cleanly unbound on plugin reload or dispose.
- **Bounded snapshot cache & LRU eviction (#275)**: Capped `snapshotCache` in `lib/git-local.js` to `MAX_SNAPSHOT_ENTRIES = 50` with LRU eviction to prevent memory leaks from arbitrary `?cwd=` requests.
- **Worktree verification & session pinning (#276)**: `runWorktreeAction('use')` verifies target directory validity with `isGitDir` and pins it to the agent session via `pinGitFromExec`.
- **Accurate file list truncation (#277)**: Sliced `files` array to 50 in `buildImpactMap` (`lib/impact-map.js`) when `truncated: true` is reported.
- **Code cleanliness & formatting polish (#278)**: Flexible client resolution in `detectFlavor`, aggregated review errors in `review-inbox`, static constant sets in `isForbiddenPath`, directory containment in `issue-templates`, and entity numbers in `formatToolResult`.

## [0.7.22] - 2026-10-06

### Network, Resilience & Settings (Package 2)
- **Transactional settings updates (#301)**: `servedScope.update` in `lib/index.js` now awaits `settingsSvc.update(...)` persistence before mutating in-memory `dynamicConfig` and invalidating client cache. Retains pristine previous configuration if persistence fails.
- **Preserve webhook secrets on UI form submit (#314)**: Removed `delete merged.webhookSecret` in `POST /dsh-gitea/config` (`lib/routes.js`) so that saving settings from the DSH UI preserves the existing webhook secret.
- **Remove redundant Schemastery prototype monkeypatch (#315)**: Removed `schemaProto.volatile` patch in `lib/index.js`; relies natively on `@deepseek-ai/schemastery` v3.18.4 `.volatile()`.
- **Fresh AbortSignal on HTTP retries (#266)**: `GiteaClient.prototype.request` in `lib/gitea-client.js` now dynamically instantiates a new `AbortSignal.timeout(this.timeoutMs)` inside `attempt()` on each retry, preventing aborted signals from terminating subsequent attempts early.
- **Idempotent HTTP retry policy (#282)**: Restricted automatic retries in `GiteaClient` to idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`). Mutations via `POST` default to `retries: 0` unless `allowNonIdempotentRetry: true` is explicitly provided.
- **Reusable GiteaClient instance cache (#287)**: Implemented `getCachedClient` in `lib/index.js` keyed by `baseUrl#token#timeoutMs` to preserve HTTP ETag and TTL caches across tool calls; automatically cleared on configuration updates.
- **Resilient web client timeouts (#316)**: Added `clientFetch(url, options, timeoutMs = 15000)` helper in `lib/client.js` and wrapped all 8 frontend fetch operations to prevent UI hangs.

## [0.7.21] - 2026-10-06

### Security & Reliability (Package 1)
- **Path traversal prevention in getContents (#265)**: Strictly validates `filePath` in `lib/gitea-client.js`. Rejects any traversal sequences containing `..`, `.`, or `\0` segments with status 0 before making any network requests.
- **Safe RegExp compilation and recursive glob matching in PR policies (#270)**: Implemented safe `globToRegex` compiler in `lib/policy-code.js` escaping regex metacharacters and using collision-free placeholders for `**` and `*`. Protects against SyntaxError and ReDoS attacks.
- **Developer privacy and generic sanitisation for public mirroring (#262, #271)**: Cleaned hardcoded developer username (`vadim`), private mount paths (`/mnt/external`), and commit SHA literal from `lib/mirror-public.js`. Replaced with generic pattern redaction (`/home/user`, `/path/to`, `127.0.0.1`).
- **Guarded immutable release tag publishing (#310)**: Removed `--force` flag from `scripts/publish-github.sh`. Added remote tag existence check (`git ls-remote`): identical target SHA is an immutable no-op, while differing remote SHA aborts with exit code 5.
- **Fail-closed repository leak scanner in CI (#311)**: Replaced external `rg` invocation in `.gitea/workflows/ci.yml` with dedicated Node.js scanner `scripts/leak-scan.mjs` (`npm run test:leaks`). Guarantees fail-closed execution on any CI runner.

## 0.7.20

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

## 0.7.19

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

## [0.7.18] - 2026-09-28

### Security & Reliability
- **AbortSignal.timeout for external webhook and scheduler fetch requests (#256)**: Added 5,000ms `AbortSignal.timeout` to `pushNotify` in `lib/push-notify.js` to prevent unresponsive external notification endpoints from blocking the `/dsh-gitea/webhook` route. Added 10,000ms `AbortSignal.timeout` to `bgScheduler` digest delivery in `lib/index.js` to ensure background scheduler ticks never hang indefinitely with an unreleased `running` lock.

### Tech Debt & Hygiene
- **Dead code removal and export scope narrowing (#257)**: Removed uncalled export `flushPersistedDirsSync` and scoped internal helpers (`scheduleSavePersistedDirs`, `gitDashCPath`, `absoluteUnixPaths`, `execsFromSessionJsonl`) as local module functions in `lib/session-git.js`.
- **Documentation cleanup (#257)**: Removed stale duplicates `docs/README.ru.md` and `docs/README.zh.md` (root multi-lingual READMEs serve as canonical sources). Updated `docs/design/DESIGN.md` version and tool count specifications.
- **Worktree repository hygiene (#258)**: Cleaned up 6 merged/abandoned worktrees in `.worktrees/` and pruned obsolete remote branches.

## [0.7.17] - 2026-09-25

### Fixed
- **Schemastery 3.18.4 Volatile wrapper unwrapping on activation (#250)**: Fixed plugin startup crash `ValidationError: $.baseUrl expected string but got [object Object]` in DSH 0.1.7 environments. Added recursive `unwrapVolatile` in `lib/secrets.js` to extract underlying primitive values from Cosmokit / Schemastery `Volatile<T>` reference objects. Updated `parseConfig` to clean volatile wrappers before and after schema validation, and dynamically evaluate configuration in `apply()` to track live volatile updates without fiber restart.

## [0.7.16] - 2026-09-25

### Security
- **HTTP read route protection and Host validation (#217)**: Added `isTrustedHost` in `lib/http-guard.js` enforcing DNS-rebinding protection by restricting allowed hosts to loopback (`127.0.0.1`, `localhost`, `::1`, `[::1]`), private RFC1918 networks (`10.*`, `192.168.*`, `172.16-31.*`), and `.local` hostnames. Added `isTrustedRequest` and `rejectUntrustedRequest` to guard read routes (`/dsh-gitea/config` GET, `/dsh-gitea/events` GET, `/dsh-gitea/git-status` GET, `/dsh-gitea/git-graph` GET) against `sec-fetch-site: cross-site` attacks, missing Host headers, and unauthenticated remote access.
- **Filesystem boundary validation for session-git (#217)**: Added `isForbiddenPath` in `lib/session-git.js` blocking root `/`, system paths (`/etc`, `/root`, `/sys`, `/proc`, `/dev`, `/boot`, `/var/run`, `/run`, `/bin`, `/sbin`, `/usr/bin`, `/var/log`), Windows system directories, and directory traversal sequences (`/../`). `selectChipRepoDir` and `resolveSessionGitDir` strictly reject forbidden paths.

### Fixed
- **DSH 0.1.7 settingsForms compatibility and volatile Config schema (#230)**: Guarded `settings.register` against `TypeError` in environments where modern DSH cores omit the legacy registration method. Implemented an in-memory `fallbackScope` with `get()` and `update(patch)` so POST `/dsh-gitea/config` continues to update settings cleanly without 503 errors. Subscribed to `loader/volatile-update`, `config`, and `settings/document-updated` events. Marked all live configurable fields in `Config` schema with `.volatile()` for full exposure in DSH SettingsForms UI.
- **GitHub mirror tag and release synchronization (#215)**: Enhanced `scripts/publish-github.sh` with `--tag <tag>` argument to force-point mirror tags to sanitized commits and automatically publish GitHub Releases marked as `--latest`. Synchronized tags and releases on `GooDAnDReaDY/dsh-gitea`.

## [0.7.15] - 2026-09-23

### Fixed
- **Client hook lifecycle and BroadcastChannel cleanup (#239)**: `useCrossTabGitStatus` in `lib/client.js` previously instantiated, posted to, and closed a new `BroadcastChannel` every 4 seconds. It now persists and reuses the open instance via `channelRef`. Additionally, `AbortError` thrown by `navigator.locks.request` when `abortController.abort()` runs on component unmount is now caught and ignored, preventing parasitic background fetch requests and state updates on unmounted React components (`aliveRef.current`).
- **Standardized logging in comment annotation (#240)**: `annotateCommentsWithMine` in `lib/handlers.js` previously used direct `console.warn` calls when `client.getUser` returned non-ok or threw. It now routes warnings through `logger?.warn` (receiving `deps.logger` from `runHandler`), eliminating direct unmanaged console output from the server handlers while preserving a fallback when no logger is injected.

## [0.7.14] - 2026-09-23

### Performance
- **Debounced disk persistence and memory capacity cap for session-git (#236)**: `rememberSessionGitDir` previously executed a blocking `fs.writeFileSync` on every invocation of any tool, and unbounded Map growth allowed `session-git.json` to grow indefinitely. It now includes dirty checking (`dirs.get(id) === dir`), an asynchronous debounced writer (`fs.promises.writeFile`), and a strict memory cap (`MAX_SESSION_DIRS = 300`) with FIFO eviction.
- **Parallelized review lookups and elimination of redundant getPull calls (#237)**: Added `mapConcurrent` helper in `lib/retry.js` with bounded concurrency. `buildReviewInbox` and `buildTriageDigest` now query PR reviews concurrently with a pool limit of 8 instead of sequential loops. In `review-escalation.js`, existing `pr.labels` from `listPulls` are reused to eliminate redundant `client.getPull` HTTP calls per PR.
- **Client response cache capacity cap, LRU eviction, and structuredClone (#238)**: `GiteaClient` now enforces `maxCacheEntries = 150` with LRU eviction to prevent unbounded memory growth during continuous read operations. Expired entries without ETags are purged immediately on access, and object cloning for cache hits and HTTP 304 revalidations has been updated from `JSON.parse(JSON.stringify(...))` to native `structuredClone`.

## [0.7.13] - 2026-09-23

### Fixed
- **Merge readiness gate strictly blocks database migrations (#241)**: `checkMergeReadiness` in `lib/merge-gate.js` previously evaluated migration detection to `status: 'pass'` regardless of whether migrations were present. It now evaluates to `status: 'fail'` and `ready: false` unless a rollback plan is verified (via `args.allowMigrations`, `args.hasRollbackPlan`, or a rollback plan description in the PR body).
- **Batch issue operations milestone reporting (#242)**: `applyBatch` in `lib/batch-ops.js` now updates milestones via `client.updateIssue` and only records `milestone` in `applied` upon actual success. Unapplied or failed milestone updates are excluded from `applied`, mark `perIssue.ok = false`, and report diagnostic details in `perIssue.errors`.
- **Direct fetch for explicit issue numbers in batch ops (#243)**: `planBatch` and `applyBatch` in `lib/batch-ops.js` now fetch explicit issue numbers directly via `client.getIssue`, removing the 200 open-issue page limit and properly including closed issues. Missing issue numbers return an explicit error instead of an empty success.

## 0.7.12

### Fixed
- Settings no longer wait on the removed settingsScope service. The client uses configForms (#244).

## [0.7.11] - 2026-09-19

### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item` — that is how `dsh-agentrouter` and
  `dsh-agent-orchestrator` show their settings, while the row seat and the legacy
  card alone leave the page without the form. The view-aware `GiteaPluginCard` is now
  registered there too (`id: 'dsh-gitea'`, order 60, static label); the row seat and
  `settings.plugin.item` stay as fallbacks.
- Both client-settings tests now expect the three seats in order.

## [0.7.10] - 2026-09-19

### Fixed
- **`gitea_pr_merge` no longer reports a false failure (#231)**: Gitea answers the
  merge endpoint with an empty body, so `wrap()` returned `{ ok: true, data: undefined }`.
  JSON drops an `undefined` key, and the harness rejects a tool result that does not
  survive serialization — the call was reported as `invalid output: value is not
  lossless JSON` **although the merge had succeeded**. `wrap()` now omits the field
  when there is no payload, and `lib/gitea-client.js` handles empty bodies and
  `204` explicitly instead of relying on a swallowed JSON parse error.
- **Tool results are serializable by construction**: new `toLossless()` in
  `lib/handlers.js` is applied to every tool result in `lib/index.js`; it drops
  `undefined` keys, replaces non-finite numbers with `null`, converts `Date` to ISO
  strings and `BigInt` to strings, and cuts cycles. Any endpoint that answers with
  no payload can no longer produce a rejected tool result.

### Added
- **Settings open on the plugin's own page**: the client registers the settings
  surface into the Plugins page row seat `plugins.row.config`, keyed
  `@goodandready/dsh-gitea#dsh-gitea` (`rowConfigKey(package, rowId)`), rendering a
  one-line description for `view: 'summary'` and the settings form without card
  chrome for `view: 'page'`. The legacy `settings.plugin.item` seat is kept as a
  fallback, newest first.
- Guards: `test/lossless-output.test.mjs` (JSON round-trip for `undefined` keys,
  `NaN`, dates, bigints, cycles; row-seat key and seat order) and updated client
  tests that assert the row seat is registered first.

## [0.7.9] - 2026-09-18

### Fixed
- **Robust Comment Ownership Annotation (`annotateCommentsWithMine`)**:
  - Replaced empty `catch {}` block with diagnostic warning logging (`console.warn`) and explicit intent annotation (`/* bestEffort: mine is not critical for reading comments */`).
  - Added non-ok response handling when `getUser()` returns an error payload.
  - Guarded ownership annotation: when `getUser()` fails or is unreachable, comments retain `mine: undefined` rather than falsely marking own comments as foreign (`mine: false`).

## [0.7.8] - 2026-09-17

### Added
- **Safe Issue Comment Deletion (`gitea_issue_comment_delete`)**:
  - Implemented safe comment deletion tool requiring explicit `confirm: true` (`lib/handlers.js`, `lib/tool-defs.js`).
  - Without `confirm: true`, returns a safe dry-run preview with comment ID, owner/repo, author, creation timestamp, and first 80 characters of body.
  - Strict author protection: enforces that only comments authored by the current token user (`getUser()`) can be deleted; foreign comments are rejected with an explicit error.
- **Comment Ownership Annotation (`mine: true/false`)**:
  - Annotated comments in `gitea_issue_comments` and `gitea_issue_get` with `mine: true` or `false` based on authenticated user comparison.
  - Updated result formatter to render `**<author>** (you)` for rapid distinction by LLM agents.
- **Dedicated Comment Deletion Test Suite**:
  - Added `test/comment-delete.test.mjs` with 8 comprehensive test cases covering dry-run previews, cross-author deletion rejection, confirmed deletion, 404s, and `mine` flags.
- **Documentation**:
  - Updated `README.md`, `README.ru.md`, `README.zh.md`, and added Section 13 to `docs/design/DESIGN.md`.

## [0.7.7] - 2026-09-17

### Changed
- **Server Entrypoint Decomposition**:
  - Extracted all HTTP route handlers (`/dsh-gitea/config`, `/webhook`, `/events`, `/git-status`, `/git-graph`) and transport helpers (`writeJson`, `readBody`) into a dedicated `lib/routes.js` module.
  - Reduced `lib/index.js` from 611 lines to 380 lines (comfortably below the 600-line guideline).
  - Decoupled `lib/routes.js` from DSH harness peer dependencies via dependency injection (`tokenConfigured`, `resolveToken`, `execFile`), allowing independent unit testing in pure Node.js.

### Added
- **Client Bundle Architecture Documentation**:
  - Added Section 12 to `docs/design/DESIGN.md` establishing the architectural rationale for retaining `lib/client.js` as a unified runtime bundle without external bundlers per Ponytail / YAGNI and DSH `window.__ModuleLoader__.load` contracts (following the precedent of `dsh-context-lens` #69).
  - Documented line count justifications for specialized modules `lib/handlers.js`, `lib/tool-defs.js`, and `lib/gitea-client.js`.
- **Route Unit Test Suite**:
  - Added `test/routes.test.mjs` covering route registration, streaming body parser limits, and status responses.

## [0.7.6] - 2026-09-17

### Added
- **One-Click Plugin Auto-Updater**:
  - Implemented `/api/dsh-gitea/update` endpoint (`lib/plugin-updater.js`) with background CLI updater and loopback origin validation.
  - Added native auto-updater section to settings card (`lib/client.js`) using DSH theme CSS variables.
  - Safe dependencies: respects pnpm release quarantine rules and handles prerelease progression.
- **Public Composition Services**:
  - `dshGitea` task provisioning service supporting idempotent issue creation (`lib/task-service.js`, contract `dsh-drives.task-provision.v1`).
  - `giteaEvents` producer-owned telemetry composition service for `@goodandready/dsh-pulse` with complete redaction and subscriber error isolation (`lib/gitea-events.js`).
- **Sanitized Release Export Pipeline**:
  - Added `.gitattributes` (`export-ignore`) and sanitized release export script (`publish.sh`) to exclude internal metadata from GitHub mirrors.

### Changed
- **Entrypoint Modularization**:
  - Extracted 70 tool schema definitions into `lib/tool-defs.js`, reducing `lib/index.js` to 587 lines while keeping client bundle single-file per DSH runtime.

### Fixed
- **Git Mutation Invalidation & Dead Code Pruning**:
  - Connected `clearSnapshotCache()` to local git write operations and PR rebases, with `refresh=1` cache-busting on `/dsh-gitea/git-snapshot`.
  - Pruned unused internal exports and dead functions.
- **Security & Origin Validation**:
  - Hardened POST `/dsh-gitea/config` using `lib/http-guard.js` loopback verification and strict origin/host validation.
- **UI & Settings Robustness**:
  - Fallback status to `unavailable` and `writable = false` when `settingsScope` is missing.
  - Replaced all hardcoded colors with DSH theme CSS tokens in Git panel and commit graph.
  - Resolved `IconChevronDownOutline14` from `@deepseek-ai/dsh-client-ui-primitives` with fallback.
  - Declared missing client inject dependencies `@deepseek-ai/dsh-client-locale` and `@deepseek-ai/dsh-client-ui-settings` in `package.json`.
- **Repository Hygiene**:
  - Added `.worktrees/` to `.gitignore`.

## [0.7.4] - 2026-09-13

### Fixed
- **Localization Compliance with DSH Plugin Standard**:
  - Embedded first-class Chinese (`zh`) dictionary in client bundle covering all settings, drawer, git inspector, and commit graph strings.
  - Removed embedded Russian (`ru`) dictionary from plugin codebase to strictly follow standard (Russian strings are provided exclusively via `dsh-russian-lang`).
  - Registered both English and Chinese locales: `ctx.locale.register(NS, { en, zh })`.
  - Added unit test to verify zero hardcoded Russian Cyrillic characters in client bundle and full `zh` dictionary coverage.

## [0.7.3] - 2026-09-13

### Added
- **Inbound Webhook Gateway & Event Ingestion (Phase 4)**:
  - Enhanced webhook event parser in `EventStore.fromWebhook` supporting `push` (branch, commits count, message), `issue_comment` (PR comments, issue discussions), and `release` events.
  - Comprehensive unit test suite `test/webhook-route.test.mjs` verifying HMAC-SHA256 signature verification, event mapping, and event store ingestion (total: 403 tests).

## [0.7.2] - 2026-09-13

### Added
- **HTTP 304 Conditional Request Caching (Phase 3)**:
  - `GiteaClient` now captures upstream `ETag` headers on successful GET responses.
  - Subsequent requests to the same endpoint send `If-None-Match: <etag>`.
  - On receiving `304 Not Modified`, `GiteaClient` refreshes cache TTL and serves cached data directly, saving bandwidth and serialization time.
- Unit tests verifying ETag header transmission and 304 response recovery (total: 399 tests).

## [0.7.1] - 2026-09-13

### Added
- **New Agent Tools (Phase 2)**:
  - `gitea_pr_diff`: Fetch raw pull request unified diff or parsed file-level change statistics (`stat: true`, additions, deletions, changed files list).
  - `gitea_reactions`: Manage emoji reactions on issues and comments (`list`, `add`, `delete` for `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes`).
  - `gitea_issue_timeline`: Chronological timeline of events, state transitions, and comments on issues.
- **Client Methods**: `getPullDiff`, `listIssueReactions`, `addIssueReaction`, `deleteIssueReaction`, `listCommentReactions`, `addCommentReaction`, `deleteCommentReaction`, `getIssueTimeline`.
- Rich CLI and chat formatting for PR diff stats, reaction counts, and event timelines.
- Unit tests covering all Phase 2 agent tools and output formatters.

## [0.7.0] - 2026-09-13

### Added
- **Native DSH Sidebar Drawer (Phase 1)**: Replaced popup panel and modal commit graph with a smooth, collapsible `GitSidebarDrawer` docked to the right edge.
- **3 Tabbed Inspector Sections**:
  - **Status**: Live branch info, upstream sync indicators (ahead/behind), active PR badge, formatted working tree changes, clean/dirty indicator, and one-click manual refresh button.
  - **Graph & CI**: Topological commit graph with lane characters, commit author, relative timestamp, direct OID links to Gitea, and live Actions CI status badges (`CI ✓`, `CI ✗`, `CI ●`).
  - **Events & PRs**: Real-time webhook events stream and PR tracking.
- **Enhanced Keyboard & Accessibility**: Full `Esc` key navigation, `aria-modal`, `role="dialog"`, smooth cubic-bezier drawer transition, and backdrop blur.
- Tests covering `GitSidebarDrawer` tabs and accessibility attributes.

## [0.6.4] - 2026-09-13

### Added
- Issue comments inspection: `listIssueComments`, `getIssueComment`, `updateIssueComment`, and `deleteIssueComment` in `GiteaClient` with in-memory TTL cache support and automatic invalidation.
- New tool `gitea_issue_comments` for retrieving issue discussions with pagination (`limit`, `page`).
- Support for `include_comments` parameter in `gitea_issue_get` to retrieve issue details and comments in a single query.
- Slim comment projection in `RECORD_KEYS` / `slimRecord` (`id`, `user`, `body`, `created_at`, `updated_at`).
- Rich text formatting in `formatToolResult` for `gitea_issue_get` (rendering title, state, description, and comments) and `gitea_issue_comments`.
- Handlers for `gitea_issue_comment_update` and `gitea_issue_comment_delete`.
- 7 new unit tests covering comment methods, TTL cache invalidation, and tool result formatting (total: 394 tests).
- Acknowledged community contribution and proposal from GitHub PR #1 by @madalee-com.

## [0.6.3] - 2026-09-12

### Added
- In-memory TTL cache (`cacheTtlMs: 15_000`) in `GiteaClient` with automatic cache invalidation on mutating requests (POST/PATCH/DELETE/PUT).
- Parallelized independent git inspection commands (`status`, `rev-parse`, `log`, `remote`) via `Promise.allSettled` in `buildGitSnapshot`.
- Visibility-aware polling via Page Visibility API in `useCrossTabGitStatus` and `EventsPanel`: pauses redundant background polling when tab is hidden, immediate sync on tab focus.
- Canonical style tag isolation using `data-dsh-plugin="dsh-gitea"` compliant with `dsh-plugin-authoring` standard.
- Tests covering TTL cache behavior, style tag attribute, and visibility-aware polling.

## [0.6.2] - 2026-09-10

### Added
- React `ErrorBoundary` wrapping `GiteaPluginCard` and `GiteaSettingsForm` inspired by `dsh-clinebot`.
- Native SVG `Chevron` icon in `GiteaPluginCard` with smooth 180-degree rotation on toggle.
- Host status badge (`badgeOnline` / `badgeOffline`) and token status badge in settings header.
- Connected `gitea_ci` with `action: 'run'` (`client.getActionsRun`) and `action: 'logs'` (`client.getJobLogs`).
- Connected `gitea_labels` with `action: 'add_to_issue'` (`client.addIssueLabels`).
- Tests covering `ErrorBoundary`, `Chevron`, and the new `gitea_ci` / `gitea_labels` actions.

### Fixed
- Replaced hardcoded Russian strings in `EventsPanel` with localized keys (`eventsTitle`, `eventsEmptyHint`).
- Aligned UI design tokens and badge styles (`.dgt-badgeOk`, `.dgt-badgeWarn`, `.dgt-badgeBad`, `.dgt-badgesRow`) with DSH styling standards.

## 0.6.1 — 2026-09-10

- Client Stability, Safe Locale & Full Settings Card Suite (#192):
  - **Safe Locale Registration (`lib/client.js`)**: Wrapped `locale.register` in an isolated `try/catch` with `console.warn` logging, ensuring duplicate locale registration attempts ("already has locale") never crash client UI slots.
  - **Context Service Access (`lib/client.js`, `lib/index.js`)**: Standardized service resolution via `ctx.get('service')` helper (`locale`, `settingsScope`, `slots`, `credentials`, `settings`), preventing `undefined` lookups on Cordis proxies.
  - **Comprehensive Settings Card (`lib/client.js`)**: Extended `GiteaSettingsForm` to cover all 17 schema configuration fields grouped into Core and Advanced sections (`defaultOwner`, `defaultRepo`, `gitWrapper`, `dodReminder`, `forceHttpsUrls`, `timeoutMs`, `webhookSecretEnv`, `notifyWebhook`, `bgScheduler*`, `instances`).
  - **Deprecation & Security**: Explicitly documented `webhookSecret` as deprecated in favor of `webhookSecretEnv` credential references, keeping sensitive values out of browser DOM.
  - **Documentation**: Updated Settings Reference Tables in English, Russian, and Chinese documentation.

## 0.6.0 — 2026-09-07

- Tool Consolidation, Architecture Decoupling & Stability Release:
  - **Tool Consolidation & Facades**: Consolidated repetitive CRUD micro-tools into 9 facade tools (`gitea_labels`, `gitea_milestones`, `gitea_releases`, `gitea_ci`, `gitea_branches`, `gitea_tags`, `gitea_webhooks`, `gitea_org`, `gitea_wiki`), reducing schema registry definitions from 95 to ~30 while keeping clean semantic actions.
  - **100% Backward Compatibility**: Added automatic legacy tool mapping in `runHandler` (`lib/handlers.js`) so that all legacy tool calls (e.g. `gitea_label_list`, `gitea_release_now`, `gitea_ci_explain`, etc.) map transparently to the corresponding facade actions without breaking existing workflows or agents.
  - **Architectural Decoupling & Feature Creep Removal**:
    - Removed `lib/sprint-plan.js` (delegated to `@goodandready/dsh-kanban`).
    - Removed `lib/digest-delivery.js` (delegated to `@goodandready/dsh-plugin-notify`).
    - Removed `lib/auto-actions.js` & `lib/dep-watch.js`.
  - **Performance & Concurrency Hardening**:
    - `lib/git-local.js`: Implemented a 3-second TTL cache for `buildGitSnapshot` to prevent repetitive subshell `git` executions on chat/session polling.
    - `lib/duty-officer.js`: Optimized PR review lookups with `Promise.all` batching and capped queries.
    - `lib/pr-templates.js`: Added bilingual (EN/RU) template detection for PR checklist verification.
    - `lib/bg-scheduler.js`: Added in-flight concurrency guard to prevent overlapping ticks when external requests lag.


- Authoring, Quality & Security Bugfix Suite (#181, #182, #183, #184, #185, #186, #187):
  - **#181 (`lib/index.js`)**: Updated server entry `export const name = '@goodandready/dsh-gitea'` to match `package.json` and client bundle registration.
  - **#182 (`lib/index.js`)**: Merged incoming payload with existing configuration in `/dsh-gitea/config` POST handler, preventing partial updates from wiping other `Config` fields.
  - **#183 (`lib/client.js`)**: Bound `settingsScope` in `GiteaSettingsForm`, gating on snapshot status (`loading`, `unavailable`, `ready`) and respecting `writable` status.
  - **#184 (`lib/index.js`, `lib/secrets.js`)**: Replaced plaintext `webhookSecret` in `Config` with `webhookSecretEnv` credential ref with `.role('credential-ref')`. Stripped `webhookSecret` from `/dsh-gitea/config` GET responses.
  - **#185 (`lib/webhook-signature.js`)**: Fixed `verifySignature` to return `false` when secret or signature is empty.
  - **#186 (`lib/issue-templates.js`, `lib/handlers.js`, `lib/index.js`)**: Wired `lib/issue-templates.js` into `gitea_issue_templates` tool in `TOOL_DEFS` and `runHandler`.
  - **#187 (`lib/client.js`)**: Removed `settings.section` sidebar fallback to adhere to DSH plugin slot standards (`settings.plugin.item` only).

## 0.5.0 — 2026-09-03

- Topological Commit Graph & Remote Sync in Chat Chip (#176):
  - Added topological commit graph engine (`lib/graph.js`) with `computeLanes` algorithm for monospace lane visualization (`●`, `◆`, `│`).
  - Added `gitea_git_graph` agent tool and `/dsh-gitea/git-graph` HTTP route with Gitea Actions CI statuses.
  - Enhanced Git status chat chip with live ahead/behind badges (`↑ahead`, `↓behind`) and dirty files count.
  - Interactive Commit Graph Modal with monospace branch/merge lanes, commit links to Gitea Web UI, branch/tag badges, and CI badges.
  - Cross-tab coordination via `navigator.locks` leader election and `BroadcastChannel`, eliminating duplicate network polling.
  - Created `docs/design/DESIGN.md` design contract.

## 0.4.3 — 2026-09-02

- Bugfix suite & stability improvements (#173):
  - `GiteaClient`: added `addIssueLabels` method for adding issue labels via POST `/issues/{number}/labels`
  - Webhooks & push notifications: fixed `deliverDigest` and `push-notify` default `fetch` handler to send JSON payloads via HTTP POST
  - Repository analytics: fixed `pullsMerged` metric to recognize Gitea REST API `merged: true` / `merged_at` closed PR states
  - Policy parser: fixed `parseSimpleYaml` section tracking so `requiredChecks` list items are correctly parsed
  - DoD reminder: removed stateful `/g` flag from module-level regex to ensure reliable, deterministic reminder triggering
  - Tool routing: added `gitea_repo_create_org`, `gitea_repo_bootstrap`, and `gitea_digest_delivery` to `NO_REPO` so they can execute outside a repository context
  - Cross-platform path handling: unified Windows and POSIX path resolution in `session-git` and `gitea-client`
  - Tool output schema: relaxed `OUTPUT_SCHEMA` to allow rich data structures from all 57 tools
  - Local git snapshot: resilient inspection on brand new repositories without commits
  - HTTP retry handler: retry on transient status 0 (network interruptions / timeouts)

## 0.4.2 — 2026-09-02

- Per-branch PR templates (#159)
- Review escalations for stale high-priority PRs (#160)
- Issue sprint planning (#161)
- Forgejo-aware mode (#162)

## 0.4.1 — 2026-09-02

- Auto-rebase PR branch on fresh main (#155)
- Server-side code search across a repo (#156)
- One-command release plan (#157)
- Performance metrics in health report (#158)

All notable changes to dsh-gitea.

## 0.4.0 — 2026-09-01

- Hybrid AI-style PR review (#141)
- Auto-merge gate (#142)
- Push notifications on critical events (#143)
- Public GitHub mirror plan (#144)
- Auto-actions rules (#145)
- Repository analytics (#146)

## 0.3.1 — 2026-08-31

- Repair npm packument (empty from 0.3.0)
- Public scope `@goodandready/dsh-gitea`

## 0.3.0 — 2026-08-31

- First public release
- 3-language README (EN/RU/ZH)
