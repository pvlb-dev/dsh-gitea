# AGENTS.md — a map, not a manual

This file is what an AI agent (or a human in a hurry) reads first in this
repository. It describes the **agent-map (MOC) system** the repo uses: a small,
stable map of contents in `AGENTS.md`, plus one topic file per area under
`devops/`.

The system is free to copy for your own project. It keeps an agent's context
small: the map says *where* to look, the topics hold the detail, and the public
tree stays free of internal working notes.

## The system in one page

- **The map stays small.** `AGENTS.md` is handed to the model as session
  instructions on every turn. Most harnesses truncate a long instructions file
  from the tail, silently — assume a hard ceiling (65,536 bytes is a common one)
  and keep the map to a few KB.
- **Topics hold the detail.** `devops/<area>.md`, one file per area (deploy,
  releases, tools, workflow, architecture, …). A topic stays under ~24 KB; past
  that it gets split.
- **The trigger table is the index.** A "if the task touches… → read this file"
  table in the project map. An agent reads the map, then only the one topic its
  task touches, instead of the whole docs tree.
- **Precedence is explicit.** The map beats the topics; the topics beat any
  external wiki. When two disagree, the higher one wins and the lower is fixed
  in the same pass.
- **Sessions are logged.** What changed, how it was verified, which checks
  passed — appended to `LOGS.md`, newest entry last, dated.
- **Handoffs are labels.** A cross-project change is a `note`, unfinished work
  is `NaNs`, a rule that still needs the shared wiki is `bootcamp`; the body of
  the issue is the handoff.
- **Internal notes are never published.** `devops/`, `LOGS.md`, `GIT.md` and
  the input drop box are gitignored; the public tree carries the product and
  this guide, not the runbook.

## What lives where

| Path | Role | Published? |
|:--|:--|:--|
| `AGENTS.md` | This map: the system, the budgets, the precedence rule | yes |
| `devops/` | Project topics: the trigger table, the runbooks, the session log | no (gitignored) |
| `GIT.md` | Commit identity, signing, tokens | no (gitignored) |
| `LOGS.md` | Session history | no (gitignored) |
| `input/` | Operator drop box | no (gitignored) |
| `README.md` | User manual: install, config, reference | yes |

If `devops/agents.md` exists in your checkout, read it next: it is the project's
own map and trigger table. If it does not, this clone carries no operator notes
— the README and the code are the source of truth.

## Setting this up in a new repository

1. Write `AGENTS.md`: the system above, a "what lives where" table, and the
   precedence rule.
2. Create `devops/agents.md` for the project map, the contract and the trigger
   table. Add one topic per area as the project grows.
3. Gitignore `devops/`, `LOGS.md`, `GIT.md` and `input/`; never publish internal
   notes.
4. If you have a scheduler, add a nightly size check: warn when the map passes
   ~90 % of the harness ceiling, flag a topic over 24 KB, and flag a topic that
   the map does not link.

## What an agent should do here

- Read this map, then `devops/agents.md` if present, then only the topic the
  task touches.
- Keep the public tree clean: internal notes go in `devops/`, never in the
  product files.
- Commit conventional, signed with the project identity; push when done.
- Append the session to `LOGS.md`, and label and close the matching issue.
- When the map and a topic disagree, fix the lower one in the same pass.
