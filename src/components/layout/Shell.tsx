import { Suspense, lazy } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Topbar } from './Topbar'
import { EmptyState } from '@/components/common/EmptyState'
import { InlineSpinner } from '@/components/common/Spinner'
import { useUiStore } from '@/store/uiStore'
import { useBackgroundSync } from '@/hooks/useBackgroundSync'
import { ListView } from '@/components/list/ListView'
import { TaskDetailPanel } from '@/components/task/TaskDetailPanel'
import { BrainPanel } from '@/components/brain/BrainPanel'

const CalendarView = lazy(() => import('@/components/calendar/CalendarView').then((m) => ({ default: m.CalendarView })))
const BandwidthView = lazy(() => import('@/components/bandwidth/BandwidthView').then((m) => ({ default: m.BandwidthView })))
const RoadmapView = lazy(() => import('@/components/roadmap/RoadmapView').then((m) => ({ default: m.RoadmapView })))

export function Shell() {
  const activeNode = useUiStore((s) => s.activeNode)
  const mainView = useUiStore((s) => s.mainView)
  useBackgroundSync()

  return (
    <div className="h-full w-full flex overflow-hidden print:overflow-visible">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 print:overflow-visible">
        <Topbar />
        <main className="flex-1 overflow-hidden relative print:overflow-visible">
          {mainView === 'roadmap' ? (
            <Suspense fallback={<InlineSpinner label="Loading view…" />}>
              <RoadmapView />
            </Suspense>
          ) : !activeNode ? (
            <EmptyState
              title="Select a Folder or List"
              subtitle="Pick a list from the sidebar to see its tasks, calendar, and dev bandwidth."
            />
          ) : (
            <Suspense fallback={<InlineSpinner label="Loading view…" />}>
              {mainView === 'list' && <ListView />}
              {mainView === 'calendar' && <CalendarView />}
              {mainView === 'bandwidth' && <BandwidthView />}
            </Suspense>
          )}
        </main>
      </div>
      <BrainPanel />
      <TaskDetailPanel />
    </div>
  )
}
