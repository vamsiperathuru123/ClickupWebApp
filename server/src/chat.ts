import { HumanMessage, AIMessageChunk } from '@langchain/core/messages'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import { config, hasAnthropicKey } from './config.js'
import { loadScopeDigest } from './context/digest.js'
import { createBrainGraph } from './graph/graph.js'
import { createTraceHandler, flushTraces } from './observability/langfuse.js'
import type { BrainCitation, BrainRequest, BrainStreamEvent } from '@/lib/brain/types'

function validate(body: Partial<BrainRequest>): string | null {
  if (!body?.token) return 'token is required'
  if (!body?.workspaceId) return 'workspaceId is required'
  if (!body?.message?.trim()) return 'message is required'
  if (!body?.threadId) return 'threadId is required'
  if (!body?.context?.scope?.length) return 'Pick at least one sprint or folder for Brain to look at'
  if (!body?.context?.settings) return 'context.settings is required'
  return null
}

/** Task ids the answer actually mentions, so the UI can offer them as deep links. */
function extractCitations(answer: string, taskIndex: Map<string, string>): BrainCitation[] {
  const citations: BrainCitation[] = []
  for (const [id, name] of taskIndex) {
    if (answer.includes(id) || answer.includes(name)) {
      citations.push({ kind: 'task', id, label: name })
      if (citations.length >= 12) break
    }
  }
  return citations
}

export async function handleChat(c: Context) {
  const body = (await c.req.json()) as BrainRequest
  const problem = validate(body)
  if (problem) return c.json({ error: problem }, 400)
  if (!hasAnthropicKey()) {
    return c.json({ error: 'ANTHROPIC_API_KEY is not set in server/.env, so Brain cannot answer yet.' }, 503)
  }

  return streamSSE(c, async (stream) => {
    const send = (event: BrainStreamEvent) => stream.writeSSE({ data: JSON.stringify(event) })
    const handler = createTraceHandler({
      threadId: body.threadId,
      workspaceId: body.workspaceId,
      context: body.context,
    })

    try {
      await send({ type: 'status', message: 'Reading the report data…' })
      const digest = await loadScopeDigest(body.token, body.workspaceId, body.context)
      await send({
        type: 'status',
        message: `Loaded ${digest.goals.length} goals and ${digest.rows.length} tasks`,
      })

      const pendingTools: Array<{ name: string; summary: string }> = []
      const graph = createBrainGraph(
        {
          token: body.token,
          workspaceId: body.workspaceId,
          context: body.context,
          onToolUse: (name, summary) => pendingTools.push({ name, summary }),
        },
        digest
      )

      let answer = ''
      const events = await graph.stream(
        { messages: [new HumanMessage(body.message)] },
        {
          configurable: { thread_id: body.threadId },
          callbacks: handler ? [handler] : undefined,
          streamMode: 'messages',
        }
      )

      for await (const [chunk] of events as AsyncIterable<[AIMessageChunk, unknown]>) {
        // Tool-call deltas arrive as chunks with no text; only real answer text is
        // forwarded, so the user never sees raw tool JSON scroll past.
        const text = typeof chunk?.content === 'string' ? chunk.content : ''
        if (text) {
          answer += text
          await send({ type: 'token', text })
        }
        while (pendingTools.length > 0) {
          const used = pendingTools.shift()!
          await send({ type: 'tool', name: used.name, summary: used.summary })
        }
      }

      const taskIndex = new Map(digest.rows.map((r) => [r.task.id, r.task.name]))
      const citations = extractCitations(answer, taskIndex)
      if (citations.length > 0) await send({ type: 'citations', citations })
      await send({ type: 'done' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[brain] chat failed:', message)
      await send({ type: 'error', message })
    } finally {
      await flushTraces(handler)
    }
  })
}

export const chatLimits = { maxToolIterations: config.maxToolIterations }
