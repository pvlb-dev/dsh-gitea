# Upstream and the fork

Part of the dsh-gitea manual. The map is [`../AGENTS.md`](../AGENTS.md); release
mechanics are in [`releases.md`](releases.md).

The short version: **we watch upstream, we do not develop against it.** The
GitHub tree is generated from the author's private source and has no CI; a PR
touching generated `lib/client.js` can be dropped on the next `chore(publish)`.
`upstream` is a fetch-only remote — never add GitHub as a push remote, and
never force-push `master` except for the sanctioned history compaction (see
below).

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

