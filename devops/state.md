# State — this deployment and the current version

Part of the dsh-gitea manual. The map is [`../AGENTS.md`](../AGENTS.md); the
install/reload loop is in [`deploy.md`](deploy.md).

**Current version: `0.8.8`; the next release is `0.8.9`, not cut.** The
version policy and the unreleased entries are in
[`releases.md`](releases.md#versioning-and-tags).

## This deployment (facts checked on 2026-10-27)

- Harness: `dsh 0.2.1-rc.2`; the installed package is the `@deepseek-ai/dsh`
  directory in `node_modules` (resolve it from the running `dsh` binary or
  `$DSH_PACKAGE_DIR`).
- Profile: `web`, directory `$DSH_PROFILE_DIR`; Web GUI on
  `http://127.0.0.1:3080`, also tailnet-only at
  <https://srv.tortoise-triggerfish.ts.net/> through the reverse proxy.
- The profile patch is `<profile>/cordis.patch.yml`; profile dependencies are in
  `<profile>/package.json`. Both are **outside this workspace**.
- `pnpm` is installed beside the node binary
  (`/opt/node-v24.22.0-linux-x64/bin/pnpm`), but that directory is **not on the
  DSH server's PATH**. Two consequences:
  1. Plugin Manager's install/remove fails with `spawn pnpm ENOENT`.
  2. The profile patch must name it explicitly:
     ```yaml
     - id: plugin-manager
       name: "@deepseek-ai/dsh-plugin-manager"
       config:
         pnpmCommand: /opt/node-v24.22.0-linux-x64/bin/pnpm
     ```
     Keep that entry (schema defaults fill the other fields).
- Installed in the profile as a **`link:` dependency** to this checkout (that is
  what Plugin Manager does for an absolute local path). The `dev:link` bootstrap
  below is required for such an install.
- The profile patch also opts this checkout into HMR while developing:
  ```yaml
  - id: hmr
    config:
      root: ["/path/to/dsh-gitea"]
  ```
  With that root, Host-half edits are picked up without restarting `dsh web`.
  Without it (default `root: []`), Host code changes need a restart; the client
  bundle is served per-request and reloads with a page hard-refresh.
- Commit identity for this repo: `dsh <dsh@pvlb.dev>`.
- Logs: the web service writes to journald
  (`journalctl -u dsh-web -n 100 --no-pager`); `dsh plugin`/pnpm install
  diagnostics live in `<profile>/.plugin-manager/logs/operation-*/pnpm.log`.

