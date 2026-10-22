#!/usr/bin/env node
/**
 * Public-tree leak scanner (fails closed).
 *
 * The npm/GitHub mirror must never carry private development context. This
 * scans the files that ship with the package (plus the bundle patch) for the
 * classes of leak the publish pipeline previously removed by hand:
 *
 * - Cyrillic text in shipped JavaScript (the English-only package boundary)
 * - absolute developer home paths
 * - private package scopes
 * - common access-token literals
 *
 * Exits 1 on any finding; CI runs `npm run test:leaks`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const SHIPPED = ['lib', 'assets', 'cordis.patch.yml', 'package.json', 'README.md', 'README.ru.md', 'README.zh.md', 'LICENSE']
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.txt', '.css'])

const checks = [
  { name: 'Cyrillic in shipped JavaScript', pattern: /[\u0400-\u04FF]/, only: (file) => extname(file) === '.js' },
  { name: 'developer home path', pattern: /\/home\/(?!user\b)[A-Za-z0-9._-]+\// },
  { name: 'private package scope', pattern: /@goodandready-private/ },
  { name: 'GitHub token literal', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'GitLab token literal', pattern: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key literal', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

function walk(target) {
  const absolute = join(root, target)
  let stat
  try { stat = statSync(absolute) } catch { return [] }
  if (stat.isFile()) return [absolute]
  if (!stat.isDirectory()) return []
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return []
    return walk(join(target, entry))
  })
}

const findings = []
for (const target of SHIPPED) {
  for (const file of walk(target)) {
    if (!TEXT_EXTENSIONS.has(extname(file))) continue
    const relativePath = relative(root, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const check of checks) {
        if (check.only && !check.only(file)) continue
        // mirror-public.js declares the private scope precisely so it can strip
        // it from mirrored content; the constant itself is publishable.
        if (check.name === 'private package scope' && relativePath.endsWith('mirror-public.js') && line.includes('PRIVATE_SCOPE')) continue
        if (check.pattern.test(line)) {
          findings.push(`${relativePath}:${index + 1}: ${check.name}`)
        }
      }
    })
  }
}

if (findings.length === 0) {
  console.log('leak-scan: clean')
  process.exit(0)
}

console.error('leak-scan: potential leaks found in the publishable tree:')
for (const finding of findings) console.error(`  ${finding}`)
process.exit(1)
