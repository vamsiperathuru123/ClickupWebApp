import { CallbackHandler } from 'langfuse-langchain'
import { config } from '../config.js'
import type { BrainUiContext } from '@/lib/brain/types'

/**
 * Tracing is optional - with no Langfuse keys configured this returns nothing and the
 * agent runs exactly the same. Nothing here may ever receive the ClickUp token: it is
 * passed to tools by closure, never through graph state or metadata, which is what
 * keeps it out of traces by construction rather than by a redaction pass that could
 * miss a field.
 */
export function createTraceHandler(params: {
  threadId: string
  workspaceId: string
  context: BrainUiContext
}): CallbackHandler | null {
  if (!config.langfuse) return null

  return new CallbackHandler({
    publicKey: config.langfuse.publicKey,
    secretKey: config.langfuse.secretKey,
    baseUrl: config.langfuse.baseUrl,
    sessionId: params.threadId,
    userId: `workspace:${params.workspaceId}`,
    tags: [
      `view:${params.context.view}`,
      params.context.roadmapTab ? `tab:${params.context.roadmapTab}` : 'tab:none',
      `scope:${params.context.scope.length}`,
    ],
  })
}

export async function flushTraces(handler: CallbackHandler | null): Promise<void> {
  if (!handler) return
  try {
    await handler.flushAsync()
  } catch {
    // Losing a trace must never fail the user's question.
  }
}
