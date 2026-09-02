import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config, hasAnthropicKey } from './config.js'
import { loadScopeDigest } from './context/digest.js'
import { handleChat } from './chat.js'
import type { BrainRequest } from '@/lib/brain/types'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: config.allowedOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
)

app.get('/health', (c) =>
  c.json({
    ok: true,
    model: config.model,
    anthropicKey: hasAnthropicKey(),
    langfuse: !!config.langfuse,
    maxToolIterations: config.maxToolIterations,
  })
)

function validate(body: Partial<BrainRequest>): string | null {
  if (!body?.token) return 'token is required'
  if (!body?.workspaceId) return 'workspaceId is required'
  if (!body?.context?.scope?.length) return 'context.scope must name at least one list or folder'
  if (!body?.context?.settings) return 'context.settings is required'
  return null
}

/**
 * Rebuilds the scope digest and returns it verbatim, with the headline counts pulled
 * out separately. Exists so the digest can be diffed against what the report is
 * showing on screen without spending a model call — if these numbers and the UI ever
 * disagree, every answer built on this digest is wrong, so it is the single most
 * useful thing to be able to check.
 */
app.post('/debug/digest', async (c) => {
  const body = (await c.req.json()) as BrainRequest
  const problem = validate(body)
  if (problem) return c.json({ error: problem }, 400)

  try {
    const digest = await loadScopeDigest(body.token, body.workspaceId, body.context)
    const deliverables = digest.goals.reduce((sum, g) => sum + g.deliverables.length, 0)
    return c.json({
      counts: {
        goals: digest.goals.length,
        deliverables,
        tasks: digest.rows.length,
        hours: Number(digest.rows.reduce((sum, r) => sum + r.hoursSpent, 0).toFixed(1)),
        cost: Number(digest.goals.reduce((sum, g) => sum + g.totalCost, 0).toFixed(2)),
      },
      timeRestriction: digest.timeRestriction,
      chars: digest.markdown.length,
      builtAt: digest.builtAt,
      markdown: digest.markdown,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

app.post('/chat', handleChat)

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[brain] listening on http://localhost:${info.port}`)
  console.log(`[brain] cors origin: ${config.allowedOrigin}`)
  console.log(`[brain] anthropic key: ${hasAnthropicKey() ? 'present' : 'MISSING (chat will 503)'}`)
  console.log(`[brain] langfuse: ${config.langfuse ? 'enabled' : 'disabled'}`)
})

export { app }
