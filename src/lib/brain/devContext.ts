import { useUiStore } from '@/store/uiStore'
import { useRoadmapStore } from '@/store/roadmapStore'
import { useBrainStore } from '@/store/brainStore'
import { useAuthStore } from '@/store/authStore'

/**
 * Dev-only: exposes the app's zustand stores on `window` so a Claude Code session
 * driving the Browser pane can read exactly what the user is looking at (active
 * workspace, roadmap scope/tab/filters, auth token) without a server round-trip —
 * the same "context chip" idea as ClickUp Brain², just read directly instead of
 * posted somewhere. Never included in a production build (`import.meta.env.DEV`
 * is compiled away by Vite), so this adds no surface to the deployed app.
 */
if (import.meta.env.DEV) {
  ;(window as unknown as { __stores: Record<string, unknown> }).__stores = {
    ui: useUiStore,
    roadmap: useRoadmapStore,
    brain: useBrainStore,
    auth: useAuthStore,
  }
}
