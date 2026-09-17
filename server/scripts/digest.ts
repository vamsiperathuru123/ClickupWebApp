import { readFileSync } from 'node:fs'
import { loadScopeDigest } from '../src/context/digest.js'
import type { BrainUiContext } from '@/lib/brain/types'

/**
 * Standalone CLI entry point for "Roadmap Brain via Claude Code" — builds the same
 * grounded markdown digest the (paused) hosted Brain panel would have shown, using
 * the exact same aggregation code the live app renders from. No ANTHROPIC_API_KEY
 * needed: this only computes the digest text, it never calls a model itself — the
 * calling Claude Code session reads the output and answers with it.
 *
 * Usage: tsx scripts/digest.ts <path-to-input.json>
 * Input shape: { token, workspaceId, context: BrainUiContext } — see
 * src/lib/brain/types.ts for the context shape. `context.scope` is required and
 * non-empty; everything else in `context.settings` defaults to 0 if omitted.
 */

interface DigestInput {
  token: string
  workspaceId: string
  context: BrainUiContext
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: tsx scripts/digest.ts <path-to-input.json>')
    process.exit(1)
  }

  const raw = readFileSync(inputPath, 'utf8')
  const input = JSON.parse(raw) as DigestInput

  if (!input.token) throw new Error('input.token is required')
  if (!input.workspaceId) throw new Error('input.workspaceId is required')
  if (!input.context?.scope?.length) throw new Error('input.context.scope must be a non-empty array')

  const digest = await loadScopeDigest(input.token, input.workspaceId, input.context)
  console.log(digest.markdown)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
