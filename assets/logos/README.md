# Repository-link logos

Source files for the two logos the Git drawer header shows next to the
repository name (#63). The runtime copies are embedded as base64
`data:image/svg+xml` URIs in `lib/client.js` (`REPO_LOGOS`); these `.svg` files
document provenance and let a future edit regenerate those strings. Keep them in
sync.

- `forgejo.svg` — Forgejo logo by Caesar Schinas, licensed **CC BY-SA 4.0**
  (<https://codeberg.org/forgejo/meta/src/branch/readme/branding#logo>).
  The logo is a trademark of the Forgejo project; it is used only to link to a
  Forgejo instance. The embedded copy keeps the original RDF metadata block.
- `gitea.svg` — Gitea logo from the `go-gitea/gitea` project. The source
  repository is MIT-licensed (see <https://gitea.com/gitea/awesome-gitea>),
  and the mark is a trademark of the Gitea project; it is used only to link to
  a Gitea instance.

This repository's MIT license does not relicense these brand assets; the
upstream terms above apply to them.
