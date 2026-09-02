import { Annotation, END, START, StateGraph, MemorySaver, messagesStateReducer } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatAnthropic } from '@langchain/anthropic'
import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { loadScopeDigest, type ScopeDigest } from '../context/digest.js'
import { buildSystemPrompt } from '../context/prompt.js'
import { buildTools } from '../tools/index.js'
import type { BrainUiContext } from '@/lib/brain/types'

/**
 * Per-request wiring. The graph is rebuilt per request rather than once at startup
 * because the tools close over that caller's ClickUp token and their scope digest -
 * baking either into a shared graph would leak one user's data into another's answer.
 */
export interface RunInput {
  token: string
  workspaceId: string
  context: BrainUiContext
  onToolUse?: (name: string, summary: string) => void
  onStatus?: (message: string) => void
}

/**
 * Shared across requests on purpose: the checkpointer is what makes a follow-up
 * question remember the previous turn, so it has to outlive the request that created
 * the graph. Keyed by the client-generated threadId. Tools stay per-request.
 */
const checkpointer = new MemorySaver()

const BrainState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  /** Bumped on every model turn so the tool loop cannot run away. */
  iterations: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
})

export type BrainStateType = typeof BrainState.State

export function createBrainGraph(input: RunInput, digest: ScopeDigest) {
  const tools = buildTools({
    token: input.token,
    workspaceId: input.workspaceId,
    digest,
    context: input.context,
    onToolUse: input.onToolUse,
  })

  const model = new ChatAnthropic({
    apiKey: config.anthropicApiKey,
    model: config.model,
    temperature: 0,
    maxTokens: 2048,
  }).bindTools(tools)

  const systemPrompt = buildSystemPrompt(input.context, digest)

  async function agent(state: BrainStateType) {
    // The system prompt is prepended per call rather than stored in state, so the
    // checkpointed history stays small and a follow-up always gets a freshly
    // rendered digest instead of the one from the first question in the thread.
    const response = await model.invoke([new SystemMessage(systemPrompt), ...state.messages])
    return { messages: [response], iterations: state.iterations + 1 }
  }

  function routeAfterAgent(state: BrainStateType): 'tools' | typeof END {
    const last = state.messages.at(-1)
    const calls = last instanceof AIMessage ? (last.tool_calls ?? []) : []
    if (calls.length === 0) return END
    if (state.iterations >= config.maxToolIterations) return END
    return 'tools'
  }

  const graph = new StateGraph(BrainState)
    .addNode('agent', agent)
    .addNode('tools', new ToolNode(tools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent, { tools: 'tools', [END]: END })
    .addEdge('tools', 'agent')

  return graph.compile({ checkpointer })
}

export { loadScopeDigest }
