import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the boundary between the browser app and the agent service.
 *
 * The service reuses the app's aggregation code by importing straight out of ../src,
 * which only works because those modules are pure TypeScript. Pull in a React
 * component, a zustand store, or anything DOM-touching and the service breaks at
 * runtime rather than at compile time - so this fails the build first.
 */
const ALLOWED_PREFIXES = [
  '@/types/',
  '@/lib/dates',
  '@/lib/env',
  '@/lib/keys',
  '@/lib/brain/types',
  '@/lib/mcp/',
  '@/lib/roadmap/',
]

const FORBIDDEN_SUFFIXES = [
  // Both reach for document/window to trigger a download.
  '@/lib/roadmap/exportCsv',
  '@/lib/roadmap/exportHtml',
]

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

const problems: string[] = []

for (const file of walk(join(import.meta.dirname, '..', 'src'))) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1]
    if (!specifier.startsWith('@/')) continue
    if (FORBIDDEN_SUFFIXES.some((bad) => specifier === bad)) {
      problems.push(`${file}: imports ${specifier}, which touches the DOM and cannot run under Node`)
      continue
    }
    if (!ALLOWED_PREFIXES.some((prefix) => specifier.startsWith(prefix))) {
      problems.push(`${file}: imports ${specifier}, which is outside the shared, Node-safe module list`)
    }
  }
}

if (problems.length > 0) {
  console.error('Import boundary violations:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('Import boundary OK: the service only reaches Node-safe shared modules.')
