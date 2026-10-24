import { execFile as execFileCb } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const defaultExecFile = promisify(execFileCb)

/**
 * Parse standard git conflict markers (including optional diff3 base blocks).
 * Detects:
 *   <<<<<<< <oursLabel>
 *   ||||||| <baseLabel>  (optional diff3)
 *   =======
 *   >>>>>>> <theirsLabel>
 */
export function parseConflictMarkers(content, filePath = '') {
  const text = String(content || '')
  const lines = text.split(/\r?\n/)
  const hunks = []

  let inConflict = false
  let inBase = false
  let inTheirs = false

  let currentHunk = null
  let hunkCounter = 0

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const lineNum = idx + 1

    if (!inConflict && line.startsWith('<<<<<<<')) {
      inConflict = true
      inBase = false
      inTheirs = false
      hunkCounter++
      const label = line.slice(7).trim()
      currentHunk = {
        id: hunkCounter,
        startLine: lineNum,
        endLine: null,
        oursLabel: label,
        baseLabel: '',
        theirsLabel: '',
        oursLines: [],
        baseLines: [],
        theirsLines: [],
      }
      continue
    }

    if (inConflict) {
      if (line.startsWith('|||||||') && !inTheirs) {
        inBase = true
        currentHunk.baseLabel = line.slice(7).trim()
        continue
      }
      if (line.startsWith('=======') && !inTheirs) {
        inBase = false
        inTheirs = true
        continue
      }
      if (line.startsWith('>>>>>>>')) {
        currentHunk.endLine = lineNum
        currentHunk.theirsLabel = line.slice(7).trim()

        const ours = currentHunk.oursLines.join('\n')
        const base = currentHunk.baseLines.length ? currentHunk.baseLines.join('\n') : null
        const theirs = currentHunk.theirsLines.join('\n')

        const hunkObj = {
          id: currentHunk.id,
          startLine: currentHunk.startLine,
          endLine: currentHunk.endLine,
          oursLabel: currentHunk.oursLabel,
          baseLabel: currentHunk.baseLabel,
          theirsLabel: currentHunk.theirsLabel,
          ours,
          base,
          theirs,
        }

        const categoryInfo = categorizeConflictHunk(hunkObj, filePath)
        Object.assign(hunkObj, categoryInfo)

        hunks.push(hunkObj)

        inConflict = false
        inBase = false
        inTheirs = false
        currentHunk = null
        continue
      }

      if (inTheirs) {
        currentHunk.theirsLines.push(line)
      } else if (inBase) {
        currentHunk.baseLines.push(line)
      } else {
        currentHunk.oursLines.push(line)
      }
    }
  }

  return {
    clean: hunks.length === 0,
    hasConflicts: hunks.length > 0,
    conflictsCount: hunks.length,
    hunks,
    totalLines: lines.length,
  }
}

/**
 * Deduplicate and combine ES/CJS import lines.
 */
export function resolveUnionImports(oursText, theirsText) {
  const parseImports = (str) => {
    const list = []
    const lines = String(str || '').split(/\r?\n/)
    let buf = []
    for (const l of lines) {
      const trimmed = l.trim()
      if (!trimmed) continue
      buf.push(l)
      if (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"') || trimmed.endsWith('`') || (!trimmed.startsWith('import') && !trimmed.startsWith('export') && !trimmed.startsWith('const') && !trimmed.startsWith('let') && !trimmed.startsWith('var'))) {
        list.push(buf.join('\n'))
        buf = []
      }
    }
    if (buf.length) list.push(buf.join('\n'))
    return list
  }

  const oursList = parseImports(oursText)
  const theirsList = parseImports(theirsText)

  const seen = new Set()
  const combined = []

  const addUnique = (stmt) => {
    const normalized = stmt.replace(/\s+/g, ' ').trim()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      combined.push(stmt)
    }
  }

  for (const item of oursList) addUnique(item)
  for (const item of theirsList) addUnique(item)

  return combined.join('\n')
}

/**
 * Merge package.json dependency lines cleanly.
 */
export function resolveUnionDependencies(oursText, theirsText) {
  const oursLines = String(oursText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const theirsLines = String(theirsText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const parseDepLine = (l) => {
    const m = l.match(/^"([^"]+)":\s*"([^"]+)",?$/)
    return m ? { pkg: m[1], ver: m[2], raw: l } : null
  }

  const depsMap = new Map()
  for (const l of oursLines) {
    const parsed = parseDepLine(l)
    if (parsed) depsMap.set(parsed.pkg, parsed.ver)
  }
  for (const l of theirsLines) {
    const parsed = parseDepLine(l)
    if (parsed) {
      if (!depsMap.has(parsed.pkg)) {
        depsMap.set(parsed.pkg, parsed.ver)
      } else {
        const curVer = depsMap.get(parsed.pkg)
        if (parsed.ver > curVer) {
          depsMap.set(parsed.pkg, parsed.ver)
        }
      }
    }
  }

  if (depsMap.size === 0) {
    return resolveUnionImports(oursText, theirsText)
  }

  const mergedLines = []
  for (const [pkg, ver] of depsMap.entries()) {
    mergedLines.push(`    "${pkg}": "${ver}",`)
  }
  return mergedLines.join('\n')
}

/**
 * Categorize a single conflict hunk and suggest a resolution strategy.
 */
export function categorizeConflictHunk(hunk, filePath = '') {
  const ours = String(hunk.ours || '').trim()
  const theirs = String(hunk.theirs || '').trim()
  const base = hunk.base ? String(hunk.base).trim() : null

  // 1. Formatting / Whitespace only
  if (ours.replace(/\s+/g, '') === theirs.replace(/\s+/g, '')) {
    return {
      category: 'formatting_whitespace',
      suggestedStrategy: 'ours',
      suggestedResolution: hunk.ours,
      explanation: 'Differences are purely whitespace or formatting. Preserved local formatting.',
    }
  }

  // 2. Comments & Documentation only
  const isCommentsOnly = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return false
    return lines.every((l) => /^(\/\/|\/\*|\*|\*\/|#|--)/.test(l))
  }

  if (isCommentsOnly(ours) && isCommentsOnly(theirs)) {
    return {
      category: 'comments_doc',
      suggestedStrategy: 'both_ours_first',
      suggestedResolution: `${hunk.ours}\n${hunk.theirs}`.trim(),
      explanation: 'Both branches modified documentation comments. Combined sequentially.',
    }
  }

  // 3. Package.json dependencies / fields
  if (filePath.endsWith('package.json') || (/"dependencies"|"devDependencies"|"[a-zA-Z0-9@_/-]+":\s*"\^?[0-9]/.test(ours) && /"[a-zA-Z0-9@_/-]+":\s*"\^?[0-9]/.test(theirs))) {
    const resolvedDeps = resolveUnionDependencies(hunk.ours, hunk.theirs)
    return {
      category: 'package_dependencies',
      suggestedStrategy: 'union_dependencies',
      suggestedResolution: resolvedDeps,
      explanation: 'Combined package dependencies from both branches without losing packages.',
    }
  }

  // 4. Module imports / exports
  const isImportExport = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return false
    const hasImportStmt = lines.some((l) => /^(import\s|export\s|const\s+.*\s*=\s*(require|await\s+import)\b|from\s+['"])/.test(l))
    if (!hasImportStmt) return false
    return lines.every((l) => /^(import\s|export\s|const\s+.*\s*=\s*(require|await\s+import)\b|from\s+['"]|[{}]\s*from\b|['"][a-zA-Z0-9_./@-]+['"];?$|\/\/|\/\*|\*)/.test(l))
  }

  if (isImportExport(ours) && isImportExport(theirs)) {
    const mergedImports = resolveUnionImports(hunk.ours, hunk.theirs)
    return {
      category: 'imports_exports',
      suggestedStrategy: 'union_imports',
      suggestedResolution: mergedImports,
      explanation: 'Merged independent module import/export declarations from both branches.',
    }
  }

  // 5. Append additions (empty base or non-overlapping additions)
  if ((base === '' || base === null) && ours && theirs && !ours.includes(theirs) && !theirs.includes(ours)) {
    return {
      category: 'additions_append',
      suggestedStrategy: 'both_ours_first',
      suggestedResolution: `${hunk.ours}\n\n${hunk.theirs}`,
      explanation: 'Independent additions appended by both branches. Concatenated sequentially.',
    }
  }

  // 6. Semantic code logic drift
  return {
    category: 'semantic_drift',
    suggestedStrategy: 'ours',
    suggestedResolution: hunk.ours,
    explanation: 'Semantic code logic drift detected. Defaulted to local changes; inspect or provide custom resolution.',
  }
}

/**
 * Resolve a single hunk given a strategy.
 */
export function resolveHunkContent(hunk, strategy = 'suggested', customContent = null) {
  if (customContent != null) {
    return String(customContent)
  }
  switch (strategy) {
    case 'ours':
      return hunk.ours
    case 'theirs':
      return hunk.theirs
    case 'both_ours_first':
      return `${hunk.ours}\n${hunk.theirs}`
    case 'both_theirs_first':
      return `${hunk.theirs}\n${hunk.ours}`
    case 'union_imports':
      return resolveUnionImports(hunk.ours, hunk.theirs)
    case 'union_dependencies':
      return resolveUnionDependencies(hunk.ours, hunk.theirs)
    case 'suggested':
    default:
      return hunk.suggestedResolution != null ? hunk.suggestedResolution : hunk.ours
  }
}

/**
 * Apply hunk resolutions to raw conflicted text and return resolved text.
 */
export function applyResolutionsToText(content, hunkResolutions = {}, defaultStrategy = 'suggested', filePath = '') {
  const parsed = parseConflictMarkers(content, filePath)
  if (!parsed.hasConflicts) {
    return {
      resolvedText: content,
      resolvedHunksCount: 0,
      conflictsRemaining: 0,
      previewDiff: '',
    }
  }

  const lines = String(content || '').split(/\r?\n/)
  const outLines = []
  let lineIdx = 0
  let resolvedCount = 0

  for (const hunk of parsed.hunks) {
    while (lineIdx < hunk.startLine - 1) {
      outLines.push(lines[lineIdx])
      lineIdx++
    }

    const resConfig = hunkResolutions[hunk.id] || hunkResolutions[String(hunk.id)] || {}
    const strategy = typeof resConfig === 'string' ? resConfig : (resConfig.strategy || defaultStrategy)
    const customContent = typeof resConfig === 'object' ? resConfig.customContent : null

    const resolvedChunk = resolveHunkContent(hunk, strategy, customContent)
    outLines.push(resolvedChunk)
    resolvedCount++

    lineIdx = hunk.endLine
  }

  while (lineIdx < lines.length) {
    outLines.push(lines[lineIdx])
    lineIdx++
  }

  const resolvedText = outLines.join('\n')
  const previewDiff = generateUnifiedDiff(content, resolvedText, filePath || 'resolved')

  return {
    resolvedText,
    resolvedHunksCount: resolvedCount,
    conflictsRemaining: 0,
    previewDiff,
  }
}

/**
 * Generate a simplified unified diff preview.
 */
export function generateUnifiedDiff(oldText, newText, filename = 'file') {
  const oldLines = String(oldText || '').split(/\r?\n/)
  const newLines = String(newText || '').split(/\r?\n/)

  if (oldText === newText) return ''

  const diff = [
    `--- a/${filename}`,
    `+++ b/${filename}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ]

  let i = 0
  let j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push(` ${oldLines[i]}`)
      i++
      j++
    } else {
      if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
        diff.push(`-${oldLines[i]}`)
        i++
      }
      if (j < newLines.length && (i >= oldLines.length || oldLines[i - 1] !== newLines[j])) {
        diff.push(`+${newLines[j]}`)
        j++
      }
    }
  }

  return diff.slice(0, 100).join('\n') + (diff.length > 100 ? '\n... (truncated diff)' : '')
}

/**
 * In-memory sandbox 3-way merge conflict analysis using git merge-tree or git merge-file.
 * Completely non-destructive: zero modification of working directory or git index.
 */
export async function analyzeMergeConflicts(args = {}, deps = {}) {
  const execFile = deps.execFile || defaultExecFile
  const gitWrapper = String(deps.gitWrapper || 'git').trim()
  const cwd = args.cwd || deps.cwd || process.cwd()
  const client = deps.client

  const owner = args.owner
  const repo = args.repo
  const prNumber = args.pr_number != null ? Number(args.pr_number) : (args.prNumber != null ? Number(args.prNumber) : null)

  // Direct content analysis mode
  if (args.content) {
    const parsed = parseConflictMarkers(args.content, args.file || 'content')
    return {
      ok: true,
      data: {
        clean: parsed.clean,
        conflictsCount: parsed.conflictsCount,
        files: [
          {
            file: args.file || 'content',
            conflictType: 'content',
            hunksCount: parsed.conflictsCount,
            hunks: parsed.hunks,
            rawContentSample: args.content,
          },
        ],
        summary: parsed.clean ? 'No conflicts detected.' : `Found ${parsed.conflictsCount} conflict hunk(s).`,
      },
    }
  }

  let headBranch = args.head_branch || args.headBranch || ''
  let baseBranch = args.base_branch || args.baseBranch || 'main'

  // Fetch PR metadata if prNumber is provided
  if (prNumber && client?.getPull && owner && repo) {
    try {
      const prRes = await client.getPull(owner, repo, prNumber)
      if (prRes?.ok && prRes.data) {
        if (!headBranch && prRes.data.head?.ref) headBranch = prRes.data.head.ref
        if (prRes.data.base?.ref) baseBranch = prRes.data.base.ref
      }
    } catch {
      // Ignore API lookup error and proceed with passed arguments
    }
  }

  if (!headBranch) {
    return {
      ok: false,
      error: 'Cannot analyze conflicts: specify pr_number or head_branch.',
    }
  }

  const run = async (gitArgs) => {
    try {
      const res = await execFile(gitWrapper, ['-C', cwd, ...gitArgs], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 })
      return { code: 0, stdout: String(res?.stdout || ''), stderr: String(res?.stderr || '') }
    } catch (e) {
      return {
        code: typeof e?.code === 'number' ? e.code : 1,
        stdout: String(e?.stdout || ''),
        stderr: String(e?.stderr || e?.message || e),
      }
    }
  }

  // Resolve commit refs: check origin refs or local refs. #37: a ref that
  // cannot be resolved is an error, not a clean merge.
  const resolveRef = async (refName) => {
    const originCheck = await run(['rev-parse', '--verify', `origin/${refName}`])
    if (originCheck.code === 0) return { ok: true, ref: `origin/${refName}` }
    const localCheck = await run(['rev-parse', '--verify', refName])
    if (localCheck.code === 0) return { ok: true, ref: refName }
    return { ok: false, ref: refName }
  }

  const baseResolved = await resolveRef(baseBranch)
  if (!baseResolved.ok) return { ok: false, error: `base branch not found: ${baseBranch}` }
  const headResolved = await resolveRef(headBranch)
  if (!headResolved.ok) return { ok: false, error: `head branch not found: ${headBranch}` }
  const baseRef = baseResolved.ref
  const headRef = headResolved.ref

  // Non-destructive 3-way merge-tree simulation
  const mergeTreeRes = await run(['merge-tree', '--write-tree', '--messages', baseRef, headRef])
  const combinedOutput = `${mergeTreeRes.stdout}\n${mergeTreeRes.stderr}`

  // Check if clean
  if (mergeTreeRes.code === 0 && !/CONFLICT/i.test(combinedOutput)) {
    return {
      ok: true,
      data: {
        prNumber,
        headBranch,
        baseBranch,
        clean: true,
        conflictsCount: 0,
        files: [],
        summary: `Branches "${headBranch}" and "${baseBranch}" merge cleanly with no conflicts.`,
      },
    }
  }

  // Extract conflicting files
  const conflictingFiles = new Set()
  const conflictRegex = /CONFLICT\s+\([^)]+\):\s+.*?\s+(?:in|of)\s+([^\r\n]+)/gi
  let match
  while ((match = conflictRegex.exec(combinedOutput)) !== null) {
    const f = match[1].trim()
    if (f) conflictingFiles.add(f)
  }

  // Also check lines with stage 1/2/3 output from merge-tree
  const stageLines = mergeTreeRes.stdout.split(/\r?\n/)
  for (const sl of stageLines) {
    const stageMatch = sl.match(/^[0-9]+\s+[0-9a-f]{40}\s+([123])\t([^\r\n]+)$/)
    if (stageMatch) {
      conflictingFiles.add(stageMatch[2].trim())
    }
  }

  // merge-tree can fail for reasons other than conflicts (unrelated histories,
  // missing objects). Do not report that as a zero-conflict success.
  if (mergeTreeRes.code !== 0 && conflictingFiles.size === 0) {
    const detail = (mergeTreeRes.stderr || mergeTreeRes.stdout || '').trim().slice(0, 300)
    return { ok: false, error: `merge-tree failed: ${detail || 'unknown error'}` }
  }

  const fileReports = []

  for (const filePath of conflictingFiles) {
    // Generate 3-way conflict content via git merge-file on blobs or read from disk
    let fileContent = ''
    try {
      // Find merge base
      const mbRes = await run(['merge-base', baseRef, headRef])
      const mbSha = mbRes.stdout.trim()

      const baseBlobRes = await run(['rev-parse', `${mbSha}:${filePath}`])
      const headBlobRes = await run(['rev-parse', `${headRef}:${filePath}`])
      const otherBlobRes = await run(['rev-parse', `${baseRef}:${filePath}`])

      if (baseBlobRes.code === 0 && headBlobRes.code === 0 && otherBlobRes.code === 0) {
        const mergeFileRes = await run([
          'merge-file',
          '-p',
          '-L',
          `HEAD (${headBranch})`,
          '-L',
          'BASE',
          '-L',
          baseBranch,
          '--object-id',
          headBlobRes.stdout.trim(),
          baseBlobRes.stdout.trim(),
          otherBlobRes.stdout.trim(),
        ])
        fileContent = mergeFileRes.stdout
      }
    } catch {
      // Fallback
    }

    if (!fileContent) {
      // Try reading directly from workspace if already conflicted
      try {
        fileContent = await fs.readFile(path.join(cwd, filePath), 'utf8')
      } catch {
        fileContent = ''
      }
    }

    const parsed = parseConflictMarkers(fileContent, filePath)
    fileReports.push({
      file: filePath,
      conflictType: 'content',
      hunksCount: parsed.conflictsCount,
      hunks: parsed.hunks,
      rawContentSample: fileContent.slice(0, 1000),
    })
  }

  return {
    ok: true,
    data: {
      prNumber,
      headBranch,
      baseBranch,
      clean: false,
      conflictsCount: fileReports.length,
      files: fileReports,
      summary: `Found merge conflicts in ${fileReports.length} file(s) between "${headBranch}" and "${baseBranch}".`,
    },
  }
}

/**
 * Execute automated or structured conflict resolution.
 * If confirm: false (default), produces structured diff preview without modifying files.
 * If confirm: true, applies resolutions, stages changes, and creates a resolution merge commit.
 */
export async function resolveMergeConflicts(args = {}, deps = {}) {
  const confirm = args.confirm === true
  const execFile = deps.execFile || defaultExecFile
  const gitWrapper = String(deps.gitWrapper || 'git').trim()
  const cwd = args.cwd || deps.cwd || process.cwd()

  const analysisRes = await analyzeMergeConflicts(args, deps)
  if (!analysisRes.ok) {
    return analysisRes
  }

  const analysis = analysisRes.data
  if (analysis.clean || !analysis.files || analysis.files.length === 0) {
    return {
      ok: true,
      data: {
        clean: true,
        applied: false,
        dryRun: !confirm,
        summary: 'No conflicts to resolve; nothing to apply.',
      },
    }
  }

  const resolutionsInput = Array.isArray(args.resolutions)
    ? args.resolutions
    : (args.resolutions && typeof args.resolutions === 'object' ? [args.resolutions] : [])

  const resolutionMapByFile = new Map()
  for (const r of resolutionsInput) {
    if (r.file) {
      resolutionMapByFile.set(r.file, r)
    }
  }

  const previewResults = []

  for (const fileReport of analysis.files) {
    const filePath = fileReport.file
    const fileResConfig = resolutionMapByFile.get(filePath) || {}
    const defaultStrategy = fileResConfig.strategy || 'suggested'

    let rawConflictedText = args.content || fileReport.rawContentSample || ''
    if (!rawConflictedText) {
      try {
        rawConflictedText = await fs.readFile(path.join(cwd, filePath), 'utf8')
      } catch {
        rawConflictedText = fileReport.rawContentSample || ''
      }
    }

    if (!rawConflictedText) continue

    const { resolvedText, previewDiff } = applyResolutionsToText(
      rawConflictedText,
      fileResConfig.hunks || {},
      defaultStrategy,
      filePath
    )

    previewResults.push({
      file: filePath,
      strategy: defaultStrategy,
      resolved: true,
      resolvedText,
      previewDiff,
      conflictsRemaining: 0,
    })
  }

  // Dry-run mode: return diff previews
  if (!confirm) {
    return {
      ok: true,
      data: {
        dryRun: true,
        prNumber: analysis.prNumber,
        headBranch: analysis.headBranch,
        baseBranch: analysis.baseBranch,
        filesCount: previewResults.length,
        previews: previewResults.map((p) => ({
          file: p.file,
          strategy: p.strategy,
          resolved: p.resolved,
          previewDiff: p.previewDiff,
        })),
        note: 'Dry-run preview. Set confirm: true to apply resolutions and commit.',
      },
    }
  }

  // Mutating mode: write files, stage, and commit
  const run = async (gitArgs) => {
    try {
      const res = await execFile(gitWrapper, ['-C', cwd, ...gitArgs], { timeout: 20_000 })
      return { code: 0, stdout: String(res?.stdout || ''), stderr: String(res?.stderr || '') }
    } catch (e) {
      return {
        code: typeof e?.code === 'number' ? e.code : 1,
        stdout: String(e?.stdout || ''),
        stderr: String(e?.stderr || e?.message || e),
      }
    }
  }

  const modifiedFiles = []
  for (const preview of previewResults) {
    const fullPath = path.join(cwd, preview.file)
    await fs.writeFile(fullPath, preview.resolvedText, 'utf8')
    await run(['add', preview.file])
    modifiedFiles.push(preview.file)
  }

  const commitMsg = args.commit_message || args.commitMessage || `Merge branch '${analysis.baseBranch}' into ${analysis.headBranch} (resolve conflicts)`
  const commitRes = await run(['commit', '-m', commitMsg])

  let commitSha = ''
  if (commitRes.code === 0) {
    const revRes = await run(['rev-parse', 'HEAD'])
    commitSha = revRes.stdout.trim()
  }

  let pushed = false
  if (args.push !== false && commitSha) {
    const pushRes = await run(['push', 'origin', analysis.headBranch || 'HEAD'])
    pushed = pushRes.code === 0
  }

  return {
    ok: true,
    data: {
      applied: true,
      dryRun: false,
      prNumber: analysis.prNumber,
      headBranch: analysis.headBranch,
      baseBranch: analysis.baseBranch,
      commitSha: commitSha || null,
      filesResolved: modifiedFiles,
      pushed,
      summary: `Resolved conflicts in ${modifiedFiles.length} file(s) and created resolution commit ${commitSha ? commitSha.slice(0, 8) : 'HEAD'}.`,
    },
  }
}
