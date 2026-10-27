# Tools — the `gitea_*` surface and known defects

Part of the dsh-gitea manual. The map is [`../AGENTS.md`](../AGENTS.md);
loading, settings and routes are in [`architecture.md`](architecture.md).

This repo owns the `gitea_*` toolset: bugs found by any project agent are filed
here, one defect per issue, and the table below is the index. Consumers mirror
it and link here.

## Tool surface — presets, aliases, `dispatcher`

The plugin registers **96 first-class agent tools** (plus 37 opt-in
compatibility aliases). `lib/selection.js` owns what a session sees: `preset`,
`tools` / `excludeTools` globs, and `legacyAliases` (opt-in since 0.8.5, #48).

- `preset: dispatcher` — the **default since 0.8.9** (#51). Two meta-tools,
  `gitea` and `gitea_help`, derived from `TOOL_DEFS` at registration
  (`lib/dispatcher.js`): an operation catalog, per-operation help and argument
  validation.
- `preset: full` — the 96 typed tools, and the documented escape when an agent
  is better served by name-level discovery.
- `legacyAliases` — re-adds the upstream tool names for pinned consumers; off
  by default since 0.8.5.

The dispatcher trade-off is measured and accepted: an agent no longer reads
`gitea_pr_merge` off its tool list; it finds the operation in the `gitea`
description catalog and fetches the schema with `gitea_help`. Do not "fix" a
confused agent by re-adding individual tools to the default surface — switch
`preset: full` or point it at the catalog instead.

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
| `gitea_pr_comment`/`gitea_pr_line_comment` print `Unrecognised response` + raw JSON | `formatters.js` has a `gitea_issue_comment` branch but none for the PR-side names, which hit the same comments endpoint; a comment object has no top-level `name`/`title`/`login`/`number`/`path`, so `describeUnknownObject()` matches nothing | the call itself succeeds — read the id/author from the JSON | #65 | fixed on `feat/63-repo-link` (0.8.9; `formatToolResult()` now takes the call args) |
| `gitea_help` prints `Unrecognised response` + clipped JSON | `formatters.js` has no branch for the help payload `{ operation, help }`; the help tool's render passed `gitea` instead of `gitea_help` | none needed; the schema is in the JSON | #66 | fixed on `feat/63-repo-link` (0.8.9) |

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

