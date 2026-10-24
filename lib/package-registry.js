/**
 * Gitea Package Registry management module.
 * Provides package discovery, inspection, version cleanup, and client configuration
 * for npm, PyPI, OCI/Docker, and Generic artifact registries.
 */

import { wrap, asNumber, pickQuery } from './handlers/common.js'

export async function listRegistryPackages(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  if (!owner) {
    return { ok: false, error: 'owner is required to list registry packages.' }
  }

  const query = pickQuery(args, ['page', 'limit', 'type', 'q'])
  const res = await client.listPackages(owner, query)
  if (!res?.ok) {
    return wrap(res)
  }

  let packages = Array.isArray(res.data) ? res.data : []
  if (args.repo) {
    const targetRepo = String(args.repo).toLowerCase()
    packages = packages.filter((pkg) => {
      const pkgRepo = pkg.repository?.name || pkg.repo || ''
      return String(pkgRepo).toLowerCase() === targetRepo
    })
  }

  return {
    ok: true,
    data: {
      owner,
      count: packages.length,
      packages: packages.map((pkg) => ({
        id: pkg.id,
        owner: pkg.owner?.login || owner,
        name: pkg.name,
        type: pkg.type,
        version: pkg.version,
        creator: pkg.creator?.login || '',
        createdAt: pkg.created_at,
        htmlUrl: pkg.html_url,
        repository: pkg.repository?.name || null,
      })),
    },
  }
}

export async function getRegistryPackage(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const type = String(args.type || '').trim().toLowerCase()
  const name = String(args.name || '').trim()
  const version = String(args.version || '').trim()

  if (!owner || !type || !name) {
    return { ok: false, error: 'owner, type, and name are required to get package details.' }
  }

  // #36: Forgejo's name-only package path 404s. The package list does work and
  // includes every version, so filter it by type + exact name.
  const query = { type, limit: 100 }
  if (name) query.q = name
  const res = await client.listPackages(owner, query)
  if (!res?.ok) return wrap(res)

  const rows = (Array.isArray(res.data) ? res.data : []).filter((pkg) => {
    return String(pkg.type || '').toLowerCase() === type && String(pkg.name || '') === name
  })
  if (rows.length === 0) {
    return { ok: false, status: 404, error: `package not found: ${type}/${name}` }
  }

  const versions = rows.map((pkg) => ({
    id: pkg.id,
    version: pkg.version || '',
    created_at: pkg.created_at || '',
    html_url: pkg.html_url || '',
    creator: pkg.creator?.login || '',
  }))
  if (version) {
    const found = versions.find((entry) => String(entry.version) === version)
    if (!found) return { ok: false, status: 404, error: `package version not found: ${type}/${name}@${version}` }
    return { ok: true, data: { owner, type, name, version: found.version, ...found, versions: [found], count: 1 } }
  }

  return {
    ok: true,
    data: {
      owner,
      type,
      name,
      version: versions[0]?.version || '',
      latest: versions[0]?.version || '',
      versions,
      count: versions.length,
      html_url: versions[0]?.html_url || '',
    },
  }
}

export async function deleteRegistryPackageVersion(args = {}, deps = {}) {
  const client = deps.client
  const owner = String(args.owner || deps.settings?.defaultOwner || '').trim()
  const type = String(args.type || '').trim().toLowerCase()
  const name = String(args.name || '').trim()
  const version = String(args.version || '').trim()

  if (!owner || !type || !name || !version) {
    return { ok: false, error: 'owner, type, name, and version are required to delete a package version.' }
  }

  if (args.confirm !== true) {
    return {
      ok: true,
      data: {
        dryRun: true,
        action: 'delete_package_version',
        owner,
        type,
        name,
        version,
        note: `Dry-run plan. To permanently delete ${name}@${version} from ${type} registry, pass confirm: true.`,
      },
    }
  }

  const res = await client.deletePackageVersion(owner, type, name, version)
  if (!res?.ok) {
    return wrap(res)
  }

  return {
    ok: true,
    data: {
      deleted: true,
      owner,
      type,
      name,
      version,
      summary: `Deleted ${type} package ${name}@${version} from registry.`,
    },
  }
}

export function generateRegistryConfig(args = {}, deps = {}) {
  const type = String(args.type || 'npm').trim().toLowerCase()
  const owner = String(args.owner || deps.settings?.defaultOwner || '<owner>').trim()
  const baseUrl = String(args.baseUrl || deps.configured?.baseUrl || deps.settings?.baseUrl || 'http://localhost:3000').replace(/\/+$/, '')
  const tokenEnv = String(args.tokenEnv || deps.settings?.tokenEnv || 'GITEA_TOKEN').trim()

  let instructions = ''
  let snippet = ''
  let filename = ''

  if (type === 'npm') {
    filename = '.npmrc'
    snippet = `@${owner}:registry=${baseUrl}/api/packages/${owner}/npm/\n//${baseUrl.replace(/^https?:\/\//, '')}/api/packages/${owner}/npm/:_authToken=\${${tokenEnv}}`
    instructions = `Place in project root or ~/.npmrc. Publish with: npm publish --registry ${baseUrl}/api/packages/${owner}/npm/`
  } else if (type === 'pypi') {
    filename = '~/.pypirc'
    snippet = `[distutils]\nindex-servers =\n    gitea\n\n[gitea]\nrepository = ${baseUrl}/api/packages/${owner}/pypi\nusername = <your-username>\npassword = \${${tokenEnv}}`
    instructions = `Configure ~/.pypirc and publish with: python3 -m twine upload --repository gitea dist/*`
  } else if (type === 'container' || type === 'oci' || type === 'docker') {
    filename = 'docker-login.sh'
    const host = baseUrl.replace(/^https?:\/\//, '').split('/')[0]
    snippet = `echo "$${tokenEnv}" | docker login ${host} -u <username> --password-stdin`
    instructions = `Tag and push: docker tag my-image:latest ${host}/${owner}/my-image:latest && docker push ${host}/${owner}/my-image:latest`
  } else {
    filename = 'generic-upload.sh'
    snippet = `curl --user <username>:$${tokenEnv} --upload-file ./artifact.tar.gz ${baseUrl}/api/packages/${owner}/generic/<package-name>/<version>/artifact.tar.gz`
    instructions = `Use generic package endpoint for arbitrary releases or binary assets.`
  }

  return {
    ok: true,
    data: {
      type,
      owner,
      filename,
      snippet,
      instructions,
    },
  }
}
