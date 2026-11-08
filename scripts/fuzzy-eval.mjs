#!/usr/bin/env node
/**
 * #77 spike: offline evaluation of the fuzzy dispatcher.
 *
 *   node scripts/fuzzy-eval.mjs [--verbose]
 *
 * No model, no network: it measures the part that can be measured
 * deterministically — whether the keyword matcher ranks the intended operation
 * first or in the top three, and how much tool-description payload the mode
 * saves. The on-device half (turns, arg errors, latency) needs a real model and
 * is not this script's job.
 */
import { TOOL_DEFS } from '../lib/tool-defs.js'
import { buildDispatcherDescription } from '../lib/dispatcher.js'
import { buildFuzzyDescription, rankOperations, resolveQuery, summarizeDef } from '../lib/fuzzy-search.js'
import { HOLDOUT, TASKS } from './fuzzy-tasks.mjs'

const verbose = process.argv.includes('--verbose')
const catalog = buildDispatcherDescription(TOOL_DEFS)
const fuzzy = buildFuzzyDescription(TOOL_DEFS)
const index = undefined

const evaluate = (tasks) => tasks.map((task) => {
  const resolution = resolveQuery(TOOL_DEFS, task.ask)
  const ranked = resolution.ranked.length ? resolution.ranked : rankOperations(TOOL_DEFS, task.ask, { limit: 3 })
  const names = ranked.slice(0, 3).map(({ def }) => def.name)
  const top = names[0] || null
  const hit1 = task.expect ? top === task.expect : resolution.kind !== 'confident'
  const hit3 = task.expect ? names.includes(task.expect) : resolution.kind !== 'confident'
  return { task, resolution, names, top, hit1, hit3 }
})

const rows = evaluate(TASKS)
const holdoutRows = evaluate(HOLDOUT)
const summarize = (rows) => {
  const expected = rows.filter((row) => row.task.expect)
  const negatives = rows.filter((row) => !row.task.expect)
  return {
    expected,
    negatives,
    recall1: expected.filter((row) => row.hit1).length / expected.length,
    recall3: expected.filter((row) => row.hit3).length / expected.length,
    negativesOk: negatives.length ? negatives.filter((row) => row.hit3).length / negatives.length : 1,
  }
}
const dev = summarize(rows)
const held = summarize(holdoutRows)

console.log(`fuzzy dispatcher — ${TOOL_DEFS.length} operations`)
console.log(`payload: catalog ${Buffer.byteLength(catalog)} B -> fuzzy ${Buffer.byteLength(fuzzy)} B `
  + `(${Math.round((1 - Buffer.byteLength(fuzzy) / Buffer.byteLength(catalog)) * 100)} % smaller)`)
for (const [label, summary, count] of [['dev', dev, TASKS.length], ['holdout', held, HOLDOUT.length]]) {
  console.log(`${label}: recall@1 ${(summary.recall1 * 100).toFixed(1)} % · recall@3 ${(summary.recall3 * 100).toFixed(1)} % · `
    + `no-match ${(summary.negativesOk * 100).toFixed(0)} % (${summary.negatives.length} negatives, ${count} tasks)`)
}
console.log()

for (const row of [...rows, ...holdoutRows]) {
  if (!row.hit3) {
    const expectedLabel = row.task.expect || '(no match)'
    console.log(`MISS  ${row.task.ask}\n      want ${expectedLabel}, got ${row.names.join(', ') || 'nothing'}`)
  }
}

if (verbose) {
  console.log('\nAll tasks:')
  for (const row of [...rows, ...holdoutRows]) {
    const mark = row.hit1 ? 'ok  ' : row.hit3 ? 'top3' : 'MISS'
    const want = row.task.expect || '(no match)'
    console.log(`${mark}  ${row.task.ask}  ->  ${row.top || 'none'}  [want ${want}]`)
  }
  console.log('\nTop candidates for the negatives:')
  for (const row of negatives) {
    console.log(`  ${row.task.ask}: ${row.names.map((name) => `${name} (${summarizeDef(TOOL_DEFS.find((def) => def.name === name))})`).join(', ') || 'none'}`)
  }
}

process.exitCode = Math.min(dev.recall3, held.recall3) >= 0.9 && Math.min(dev.negativesOk, held.negativesOk) >= 0.9 ? 0 : 1
