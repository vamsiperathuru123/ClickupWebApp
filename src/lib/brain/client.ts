import { readEnv } from '@/lib/env'
import type { BrainRequest, BrainStreamEvent } from './types'

const AGENT_URL = readEnv('VITE_BRAIN_AGENT_URL', 'http://localhost:8787')

export interface BrainHealth {
  ok: boolean
  model: string
  anthropicKey: boolean
  langfuse: boolean
}

export async function checkBrainHealth(): Promise<BrainHealth | null> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    return (await res.json()) as BrainHealth
  } catch {
    // The agent service is a separate local process; not running is a normal state.
    return null
  }
}

/**
 * Streams one answer, invoking `onEvent` per SSE frame.
 *
 * Hand-rolled rather than using EventSource because that only does GET, and the
 * request body here carries the token and the whole context descriptor.
 */
export async function streamBrainAnswer(
  request: BrainRequest,
  onEvent: (event: BrainStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${AGENT_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error ?? `Brain service returned ${res.status}`)
  }
  if (!res.body) throw new Error('Brain service returned an empty stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line; a frame can span several reads.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        try {
          onEvent(JSON.parse(payload) as BrainStreamEvent)
        } catch {
          // A malformed frame shouldn't kill an answer that is otherwise streaming.
        }
      }
    }
  }
}

export function brainAgentUrl(): string {
  return AGENT_URL
}
