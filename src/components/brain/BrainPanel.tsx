import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { useBrainStore } from '@/store/brainStore'
import { useBrainContext, describeBrainContext } from '@/lib/brain/buildBrainContext'
import { brainAgentUrl, checkBrainHealth, streamBrainAnswer, type BrainHealth } from '@/lib/brain/client'
import { ErrorBanner } from '@/components/common/ErrorBanner'
import type { BrainChatMessage } from '@/store/brainStore'

/** Starting points keyed to the tab on screen — the questions actually worth asking
 * differ per tab, and a blank box invites nothing. */
function suggestionsFor(tab: string | undefined, view: string): string[] {
  if (view !== 'roadmap') {
    return ['Summarise what this list is working on', 'What is at risk here?']
  }
  switch (tab) {
    case 'overall':
      return ['What needs attention this sprint?', 'Write a status update for leadership', 'Which goals are blocked and why?']
    case 'goals':
      return ['Which goals slipped and by how much?', 'Which deliverables have no owner?']
    case 'executive':
      return ['Are we on budget?', 'Where is the hours spend concentrated?']
    case 'resources':
      return ['Who is carrying the most work?', 'Is anyone over capacity?']
    case 'functionTag':
      return ['Which function tag is costing the most?', 'Which tag is furthest behind?']
    case 'spillover':
      return ['What carried over and why?', 'Which spill over tasks are still blocked?']
    default:
      return ['What needs attention this sprint?']
  }
}

function ToolTrail({ tools }: { tools: NonNullable<BrainChatMessage['tools']> }) {
  const [open, setOpen] = useState(false)
  if (tools.length === 0) return null
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen((o) => !o)} className="text-[10px] text-gray-600 hover:text-gray-400">
        {open ? '▾' : '▸'} looked up {tools.length} source{tools.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {tools.map((t, i) => (
            <div key={`${t.name}-${i}`} className="text-[10px] text-gray-600">
              <span className="text-gray-500">{t.name}</span> {t.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Message({ message }: { message: BrainChatMessage }) {
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  if (message.role === 'user') {
    return (
      <div className="rounded-lg bg-surface-100 px-3 py-2 text-xs text-gray-200 whitespace-pre-wrap">
        {message.text}
      </div>
    )
  }

  return (
    <div className="px-1 py-1">
      <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
        {message.text}
        {message.pending && <span className="ml-1 inline-block w-1.5 h-3 bg-accent-500 align-middle animate-pulse" />}
      </div>
      {message.error && <div className="mt-1.5 text-[11px] text-red-400">{message.error}</div>}
      {message.tools && <ToolTrail tools={message.tools} />}
      {message.citations && message.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {message.citations.map((c) => (
            <button
              key={c.id}
              onClick={() => c.kind === 'task' && setSelectedTaskId(c.id)}
              title={c.label}
              className="max-w-[190px] truncate rounded bg-surface-100 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 hover:bg-surface-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function BrainPanel() {
  const open = useBrainStore((s) => s.open)
  const setOpen = useBrainStore((s) => s.setOpen)
  const threadId = useBrainStore((s) => s.threadId)
  const messages = useBrainStore((s) => s.messages)
  const status = useBrainStore((s) => s.status)
  const store = useBrainStore
  const token = useAuthStore((s) => s.token)
  const workspaceId = useUiStore((s) => s.activeWorkspaceId)
  const context = useBrainContext()

  const [input, setInput] = useState('')
  const [health, setHealth] = useState<BrainHealth | null | 'checking'>('checking')
  const [sending, setSending] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setHealth('checking')
    void checkBrainHealth().then(setHealth)
  }, [open])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [messages, status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        store.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  const contextLabel = useMemo(() => describeBrainContext(context), [context])
  const suggestions = suggestionsFor(context.roadmapTab, context.view)

  async function send(question: string) {
    const text = question.trim()
    if (!text || sending) return
    if (!token || !workspaceId) return
    setInput('')
    setSending(true)

    const answerId = `a-${Date.now().toString(36)}`
    const s = store.getState()
    s.addMessage({ id: `q-${answerId}`, role: 'user', text })
    s.addMessage({ id: answerId, role: 'assistant', text: '', pending: true })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamBrainAnswer(
        { token, workspaceId, threadId, message: text, context },
        (event) => {
          const api = store.getState()
          if (event.type === 'status') api.setStatus(event.message)
          else if (event.type === 'token') api.appendToken(answerId, event.text)
          else if (event.type === 'tool') api.addToolUse(answerId, { name: event.name, summary: event.summary })
          else if (event.type === 'citations') api.setCitations(answerId, event.citations)
          else if (event.type === 'error') api.finishMessage(answerId, event.message)
          else if (event.type === 'done') api.finishMessage(answerId)
        },
        controller.signal
      )
      store.getState().finishMessage(answerId)
    } catch (error) {
      store.getState().finishMessage(answerId, error instanceof Error ? error.message : String(error))
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  if (!open) return null

  const serviceDown = health === null
  const missingKey = health && health !== 'checking' && !health.anthropicKey

  // Width capped against the viewport so the drawer cannot crush the report on a
  // narrow window - at a flat 420px the report was squeezed to about 100px.
  return (
    <aside className="w-[420px] max-w-[40vw] min-w-[300px] shrink-0 border-l border-surface-border bg-surface-300 flex flex-col h-full print:hidden">
      <div className="shrink-0 px-3 py-2.5 border-b border-surface-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-100">Brain</span>
            {health && health !== 'checking' && (
              <span className="text-[10px] text-gray-600 truncate">{health.model}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => store.getState().newThread()}
              className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-200 hover:bg-surface-200"
            >
              New
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-200 hover:bg-surface-200"
            >
              Close
            </button>
          </div>
        </div>
        {/* Says exactly what the agent can see, so an answer is never mistaken for
            covering more than the current scope. */}
        <div className="mt-1.5 rounded bg-surface-200 px-2 py-1 text-[10px] text-gray-500 truncate" title={contextLabel}>
          Reading: {contextLabel}
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {serviceDown && (
          <ErrorBanner
            message={`Brain service is not reachable at ${brainAgentUrl()}. Start it with: npm run dev:agent`}
          />
        )}
        {missingKey && (
          <ErrorBanner message="The agent is running but ANTHROPIC_API_KEY is not set in server/.env." />
        )}

        {messages.length === 0 && !serviceDown && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Ask about progress, blockers, ownership, hours or cost for what you are looking at.
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="w-full text-left rounded border border-surface-border bg-surface-200 px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-surface-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}

        {status && sending && <div className="text-[10px] text-gray-600">{status}</div>}
      </div>

      <div className="shrink-0 border-t border-surface-border p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          rows={2}
          placeholder={sending ? 'Answering…' : 'Ask about this scope…  (Enter to send)'}
          disabled={sending || serviceDown}
          className={clsx(
            'w-full resize-none rounded border border-surface-border bg-surface-200 px-2 py-1.5 text-xs text-gray-200',
            'placeholder:text-gray-600 focus:outline-none focus:border-accent-500 disabled:opacity-60'
          )}
        />
      </div>
    </aside>
  )
}
