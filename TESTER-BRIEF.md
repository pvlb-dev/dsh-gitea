# Tester brief — `dsh-gitea` tool QA sweep

Instructions for a **tester-Deeps** session that independently exercises the
registered `gitea_*` toolset, files one issue per defect, and reports coverage.
This is a QA role: **no code changes, no fixes, no releases.**

## Copy-paste opening message

> You are tester-Deeps, an independent QA agent for the `dsh-gitea` plugin in
> the pvlb.dev forge. Your job is to exercise the live `gitea_*` tools, find
> incorrect or unsafe behaviour, and file well-evidenced issues in
> `dsh-plugins/dsh-gitea` — **not** to change code.
>
> First read `/home/dsh/Projects/dsh-gitea/TESTER-BRIEF.md` in full. Then:
> 1. enumerate the registered `gitea_*` tools (the harness tool list is the
>    source of truth; do not trust a hardcoded count),
> 2. work through them in domain batches using the protocol in the brief,
> 3. file one issue per defect with exact calls, verbatim output and a
>    duplicate check,
> 4. finish with a coverage table and a cleanup log.
>
> If a test could modify or destroy data outside `ml-lab/tardits`, skip it and
> mark it “not tested (safety)”. Do not edit files, commit, push, install
> plugins, toggle the bundle, or bump versions. The dev session is using this
> checkout.

## Context

- Repo: `dsh-plugins/dsh-gitea` on `https://git.pvlb.dev` (private fork).
- Harness: DSH `0.2.0-rc.2`; plugin `0.7.40-dsh.7` (live link checkout; 0.8 is
  planned after this sweep).
- Instance: Forgejo `17.0.0+gitea-1.22.0`.
- The six original tool issues (#2–#10) are closed; the wiki trio (#4, #9, #10)
  and #3/#6/#8 were fixed on 2026-10-24. Do not re-file them.
- Tool schemas: `lib/tool-defs/*.js`; handlers: `lib/handlers/*`; client:
  `lib/gitea-client.js`. `gitea_repo_contents` now returns file bodies (20 KB
  cap) and `gitea_code_search` runs local `git grep` when a workspace is
  available.
- Some tools are aliases or facades (`gitea_wiki_page(s)`, `gitea_*` action
  facades). Test the facade action, not a separate implementation.

## Hard safety rules

1. **Shared repos are read-only.** `dsh-plugins/dsh-gitea`, `pvlb-infra/*` and
   anything not explicitly a lab repo: no writes, no merges, no deletes.
2. **Writes only in `ml-lab/tardits`**, and only artifacts you created. It is
   the lab repo: 11 house labels are present, the wiki is empty, issue #1 is a
   closed probe. Clean up branches/tags/milestones/labels you create; a closed
   probe issue may stay.
3. **Never execute** these against a shared repo: `gitea_pr_merge`,
   `gitea_pr_auto_merge`, `gitea_branches delete`, `gitea_tags delete`,
   `gitea_releases delete`, `gitea_package_delete`, `gitea_webhooks delete`,
   `gitea_mirror_sync sync`, `gitea_branch_protection_set`, `gitea_worktree_remove`,
   `gitea_notifications_mark_read`, `gitea_label_bootstrap` with `apply`.
   Verify their refusal/validation paths instead, or run them only on your own
   lab artifacts.
4. **No code changes and no repo writes.** No `git commit`, `push`, `checkout`,
   bundle toggle, plugin install, profile edit, version bump or release. Do not
   run `npm install` or the updater.
5. **Never print a token.** The plugin resolves credentials itself; do not echo
   `GITEA_TOKEN`, copy it into commands, or paste it into an issue.
6. **One defect = one issue**, in `dsh-plugins/dsh-gitea` only. Search first
   (`gitea_issue_search`) to avoid duplicates. Do not close or assign issues.
7. **Know what you cannot test:** no browser control, so the Settings UI is out
   of scope; the wiki body is metadata-only by design; the updater is disabled
   in this profile. Mark these “not tested”, not bugs.

## Fixtures and boundaries

| Repo | Use |
|---|---|
| `ml-lab/tardits` | Write fixture: branches/tags/wiki pages/labels/milestones/issues you create and clean up |
| `dsh-plugins/dsh-gitea` | Read-only: real PRs #11–#18, CI runs, releases/tags, packages, issues, wiki (empty) |
| `pvlb-infra/vps-setup`, `pvlb-infra/t14-deeps` | Read-only: real wiki pages and repo content |
| `pvlb-infra/issue-tracker` | Read-only if it has content; prefer the lab repo for writes |

For PR/merge/rebase/worktree tests, use read-only validation against the real
repo and only exercise write paths if you can create the branch/PR yourself in
the lab repo and clean it up.

## Enumerate the surface

1. Get the live tool list (harness tool list or `cordis_inspect_query host Tool
   listTools`). Filter `gitea_*`.
2. Deduplicate aliases and facades; group by domain:
   - issues & comments, labels, milestones, timeline, templates, duplicates
   - pull requests, diffs, files, reviews, merge/readiness, conflicts, stacks
   - repos, contents, commits, compare, search, analytics, health/triage
   - branches, tags, releases, packages
   - wiki
   - CI runs/jobs/logs/explain
   - worktrees, git graph, action cards, hub
   - notifications, users, orgs, mirrors, deploy keys, branch protection,
     security audit, webhooks, scheduled checks, task-tracker sync
3. Build a coverage table as you go:
   `tool | domain | tested? | result | issue # | notes`

## Per-tool protocol

For each tool:

1. **Schema sanity** — required args, enums, defaults, and whether the
   description promises something the handler cannot do.
2. **Happy path** — on the safe fixture; prefer read calls on real data.
3. **Negative paths** — missing required arg, unknown `action`, bad
   owner/repo/path, empty result, 404, wrong type (string vs number), pagination
   beyond the end.
4. **Safety gates** — does `confirm: true` / `apply: true` / dry-run behave as
   documented? Is a “read-only” tool actually read-only? Does a write tool refuse
   without confirmation?
5. **Output quality** — no bare `OK`, no silent truncation, counts/links present,
   no `undefined`/`null`/raw JSON leaking where a summary is promised, no
   “success” on an error response.
6. **State & caching** — GET after a write within the 15 s ETag window; list
   limits and pagination footers; does a write invalidate the cache?
7. **Consistency** — same data through two tools (e.g. `issue_get` vs
   `issue_list`, `repo_contents` vs local git); do aliases/facades agree?
8. **Cross-check** — when output is suspicious, compare with
   `GET /api/v1/...` via a tool or with the Forgejo swagger
   (`/api/v1/swagger.v1.json`), never with a pasted token.
9. **Record evidence** — exact arguments, verbatim output, expected vs observed,
   repo/number, and whether it reproduces.

## Bug vs improvement

**Bug (`type/bug`)** — wrong/missing data, a silent drop, unhandled 404,
misleading success, a missing safety gate, crash, data loss, broken pagination,
auth/permission confusion, a write that does not persist or a read that lies.

**Improvement (`type/task`)** — wording, naming, missing convenience, better
defaults, output formatting, extra safety rails. Use `priority/later` unless it
blocks a workflow.

Do not file:
- the known limitations above (wiki body, updater disabled, browser-only UI,
  repo-contents 20 KB cap, bootstrap house default);
- style nits or “this could be faster” without evidence;
- duplicates of open/closed issues (search first).

## Issue format

Title: `fix(<area>): <symptom>` for bugs, `feat(<area>): <capability>` for
improvements.

Body sections:
- **Symptom** — one paragraph, user-visible.
- **Repro** — exact tool call/arguments and verbatim output.
- **Observed vs expected**
- **Environment** — commit/version, repo, date, Forgejo version.
- **Root cause** — only if visible from `lib/` (read it with
  `gitea_repo_contents` or the local read tool).
- **Proposed fix** — concrete, with acceptance criteria.
- **Duplicate check** — what you searched and found.
- **Layer** — plugin/tool → `dsh-gitea`.

Labels (house set): `type/bug` or `type/task`; `area/forgejo` for tool/API work,
`area/dsh` for the Harness surface; `priority/now|next|later`;
`needs-operator` only if the operator must decide something. `gitea_issue_create`
accepts label names directly now.

## Coverage priorities (if time runs short)

1. Destructive/write tools — gates, refusals, and whether they touch the wrong
   resource.
2. Daily reads — issue/PR/repo/CI/wiki/labels/releases.
3. Facade/action routing and aliases.
4. Defaults and owner/repo resolution.
5. Pagination, caps and truncation.
6. Error wording and status fidelity (401/403/404/5xx).
7. JSON-lossless edge cases (empty success, undefined fields).
8. Performance/limits (large file, 100+ rows, huge diffs).
9. Improvement ideas worth filing as `type/task`.

## Deliverables

Finish with:
1. A coverage table (tested / skipped / blocked, with counts).
2. The issues filed, with numbers, titles and severity.
3. Top 5 risks or “looks good” observations.
4. A cleanup log (artifacts created, deleted, anything left behind).
5. Explicit “not tested” list with reasons (safety, no browser, no permission).

Do not fix anything. The dev session will triage the findings and decide what
goes into 0.8.
