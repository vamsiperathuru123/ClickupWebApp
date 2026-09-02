import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BrainCitation } from '@/lib/brain/types'

export interface BrainChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Tools the agent reached for while answering, shown as a trail under the reply. */
  tools?: Array<{ name: string; summary: string }>
  citations?: BrainCitation[]
  /** Set while the answer is still streaming in. */
  pending?: boolean
  error?: string
}

/** Published by whichever view is on screen, so the panel can tell the agent where
 * the user is standing. Not persisted — it is only meaningful for the live session. */
export interface BrainViewContext {
  roadmapTab?: string
  filters?: Record<string, string>
}

interface BrainState {
  open: boolean
  /** Server-side conversation key; a new one starts a fresh thread. */
  threadId: string
  messages: BrainChatMessage[]
  status: string | null
  viewContext: BrainViewContext

  setOpen: (open: boolean) => void
  toggle: () => void
  setViewContext: (context: BrainViewContext) => void
  addMessage: (message: BrainChatMessage) => void
  appendToken: (id: string, text: string) => void
  addToolUse: (id: string, tool: { name: string; summary: string }) => void
  setCitations: (id: string, citations: BrainCitation[]) => void
  finishMessage: (id: string, error?: string) => void
  setStatus: (status: string | null) => void
  newThread: () => void
}

function newThreadId(): string {
  return `brain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useBrainStore = create<BrainState>()(
  persist(
    (set) => ({
      open: false,
      threadId: newThreadId(),
      messages: [],
      status: null,
      viewContext: {},

      setOpen: (open) => set({ open }),
      toggle: () => set((s) => ({ open: !s.open })),
      setViewContext: (viewContext) => set({ viewContext }),

      addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

      appendToken: (id, text) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, text: m.text + text } : m)),
        })),

      addToolUse: (id, tool) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, tools: [...(m.tools ?? []), tool] } : m)),
        })),

      setCitations: (id, citations) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, citations } : m)) })),

      finishMessage: (id, error) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, pending: false, error } : m)),
          status: null,
        })),

      setStatus: (status) => set({ status }),

      // A new thread also resets the server-side history, since that is keyed by id.
      newThread: () => set({ threadId: newThreadId(), messages: [], status: null }),
    }),
    {
      name: 'dev-bandwidth-tracker-brain',
      // The drawer should not reopen itself on reload, and a half-streamed answer
      // should not come back as permanently pending.
      partialize: (s) => ({
        threadId: s.threadId,
        messages: s.messages.filter((m) => !m.pending).slice(-40),
      }),
    }
  )
)
