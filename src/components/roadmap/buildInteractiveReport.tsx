import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useRoadmapStore, type ExecutiveSpilloverMode, type SpilloverBucketFilter } from '@/store/roadmapStore'
import { AUDIENCE_ORDER, STATUS_GROUP_FILTER_ORDER } from '@/lib/roadmap/taskGroups'
import { collectPageCss } from '@/lib/roadmap/exportHtml'
import { formatCurrency, formatHours } from '@/lib/roadmap/format'
import { OverallReportTab } from './OverallReportTab'
import { GoalsTab } from './GoalsTab'
import { ExecutiveTab } from './ExecutiveTab'
import { ResourcesTab } from './ResourcesTab'
import { FunctionTagTab } from './FunctionTagTab'
import { SpilloverTab } from './SpilloverTab'
import { ReportSettingsProvider, type SpilloverSnapshot } from './ReportSettingsContext'
import type { AppTask } from '@/types/clickup'
import type { RoadmapGoal } from '@/lib/roadmap/types'
import type { TimeEntriesRestriction } from '@/lib/mcp/clickupService'

const TAB_ORDER = ['overall', 'goals', 'executive', 'resources', 'functionTag', 'spillover'] as const
type ExportTab = (typeof TAB_ORDER)[number]

const TAB_LABELS: Record<ExportTab, string> = {
  overall: 'Overall Report',
  goals: 'Goals',
  executive: 'Roadmap Health',
  resources: 'Resources',
  functionTag: 'Function Tag',
  spillover: 'Spill Over',
}

const SPILL_MODES: ExecutiveSpilloverMode[] = ['without', 'with', 'onlySpillover']
const BUCKETS: SpilloverBucketFilter[] = ['completed', 'open', 'blocked', 'completedUpcoming']

interface PaneAttrs {
  tab: ExportTab
  audience?: string
  status?: string
  spill?: string
  bucket?: string
}

interface Pane {
  attrs: PaneAttrs
  node: ReactElement
}

export interface InteractiveReportInput {
  /** Unfiltered hierarchy — what Overall Report and Roadmap Health render from. */
  goals: RoadmapGoal[]
  /** Hierarchy with the "+ Filter" bar applied — what Goals/Resources/Function Tag render from. */
  filteredGoals: RoadmapGoal[]
  tasks: AppTask[]
  queryClient: QueryClient
  scopeNames: string[]
  avgCostPerHour: number
  totalWorkingHours: number
  previousSprintCount: number
  /** Already-resolved spillover query result, handed to the panes so they don't
   * refetch (and can't miss the cache) during the static render. */
  spillover: SpilloverSnapshot
  activeTab: string
  /** 'permission' when ClickUp genuinely refused the all-members time request
   * (token isn't Owner/Admin), 'error' when some other failure (rate limit, 5xx,
   * network) forced the same own-time-only fallback, null when unrestricted. */
  timeRestriction: TimeEntriesRestriction
  /** "Select Range" as applied when this export was generated — shown in the
   * header so the file records what window its hours reflect. Null when unset
   * (all-time). */
  timeRangeFrom: string | null
  timeRangeTo: string | null
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function attrsToHtml(attrs: PaneAttrs): string {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `data-${k}="${v}"`)
    .join(' ')
}

/**
 * Every filter combination the report can be in, one pane each. The dimensions are
 * small and mostly partition the data (an audience or status group shows a slice,
 * not a copy), so the rendered total lands at a few times the base dataset rather
 * than once per combination.
 */
function buildPanes(input: InteractiveReportInput): Pane[] {
  const { goals, filteredGoals, tasks } = input
  const panes: Pane[] = []

  for (const audience of AUDIENCE_ORDER) {
    panes.push({
      attrs: { tab: 'overall', audience },
      node: <OverallReportTab goals={goals} audienceOverride={audience} />,
    })
  }

  for (const audience of AUDIENCE_ORDER) {
    for (const status of STATUS_GROUP_FILTER_ORDER) {
      panes.push({
        attrs: { tab: 'goals', audience, status },
        node: <GoalsTab goals={filteredGoals} audienceOverride={audience} statusOverride={status} />,
      })
    }
  }

  for (const audience of AUDIENCE_ORDER) {
    for (const spill of SPILL_MODES) {
      for (const status of STATUS_GROUP_FILTER_ORDER) {
        panes.push({
          attrs: { tab: 'executive', audience, spill, status },
          node: (
            <ExecutiveTab
              goals={goals}
              tasks={tasks}
              audienceOverride={audience}
              spilloverModeOverride={spill}
              statusOverride={status}
            />
          ),
        })
      }
    }
  }

  for (const spill of SPILL_MODES) {
    for (const status of STATUS_GROUP_FILTER_ORDER) {
      panes.push({
        attrs: { tab: 'resources', spill, status },
        node: <ResourcesTab goals={filteredGoals} spilloverModeOverride={spill} statusOverride={status} />,
      })
    }
  }

  for (const audience of AUDIENCE_ORDER) {
    for (const spill of SPILL_MODES) {
      panes.push({
        attrs: { tab: 'functionTag', audience, spill },
        node: <FunctionTagTab goals={filteredGoals} audienceOverride={audience} spilloverModeOverride={spill} />,
      })
    }
  }

  for (const audience of AUDIENCE_ORDER) {
    for (const bucket of BUCKETS) {
      panes.push({
        attrs: { tab: 'spillover', audience, bucket },
        node: <SpilloverTab audienceOverride={audience} bucketOverride={bucket} />,
      })
    }
  }

  return panes
}

const RUNTIME_JS = `
(function () {
  var panes = Array.prototype.slice.call(document.querySelectorAll('[data-pane]'));
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-tabbtn]'));
  var state = window.__REPORT_STATE__;
  var activeTab = window.__REPORT_ACTIVE_TAB__;
  var DIMS = ['audience', 'status', 'spill', 'bucket'];

  function matches(pane, sel) {
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i];
      var want = pane.getAttribute('data-' + d);
      if (want !== null && want !== sel[d]) return false;
    }
    return true;
  }

  function render() {
    var sel = state[activeTab] || {};
    var shown = false;
    for (var i = 0; i < panes.length; i++) {
      var p = panes[i];
      var show = p.getAttribute('data-tab') === activeTab && matches(p, sel);
      p.style.display = show ? 'block' : 'none';
      if (show) shown = true;
    }
    if (!shown) {
      for (var j = 0; j < panes.length; j++) {
        if (panes[j].getAttribute('data-tab') === activeTab) { panes[j].style.display = 'block'; break; }
      }
    }
    for (var k = 0; k < tabButtons.length; k++) {
      var b = tabButtons[k];
      var on = b.getAttribute('data-tabbtn') === activeTab;
      b.className = on
        ? 'px-3 py-1 rounded transition-colors bg-surface-50 text-gray-100'
        : 'px-3 py-1 rounded transition-colors text-gray-400 hover:text-gray-200';
    }
  }

  var ATTN_ACTIVE = 'rounded px-2 py-0.5 text-[11px] transition-colors bg-surface-50 text-gray-100';
  var ATTN_IDLE = 'rounded px-2 py-0.5 text-[11px] transition-colors text-gray-500 hover:text-gray-300 hover:bg-surface-200';

  /** Needs-attention flag chips: hide any goal/task row not carrying the picked
   * flag, and move the active styling onto the clicked chip. */
  function applyAttentionFilter(chip) {
    var card = chip.closest('[data-pane]') ? chip.closest('div.rounded-lg') : null;
    if (!card) return;
    var want = chip.getAttribute('data-attnfilter');
    var chips = card.querySelectorAll('[data-attnfilter]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].className = chips[i] === chip ? ATTN_ACTIVE : ATTN_IDLE;
    }
    var rows = card.querySelectorAll('[data-attn]');
    for (var j = 0; j < rows.length; j++) {
      var flags = (rows[j].getAttribute('data-attn') || '').split(' ');
      var show = want === 'all' || flags.indexOf(want) >= 0;
      rows[j].style.display = show ? '' : 'none';
    }
  }

  /** Spill-over stage rows: reveal the picked stage's goal breakdown, hide the
   * others, and clicking the active one closes it again. */
  function applyStagePick(btn) {
    var card = btn.closest('div.rounded-lg');
    if (!card) return;
    var want = btn.getAttribute('data-stagepick');
    var closing = btn.getAttribute('data-active') === '1';
    var picks = card.querySelectorAll('[data-stagepick]');
    for (var i = 0; i < picks.length; i++) {
      picks[i].removeAttribute('data-active');
      picks[i].classList.remove('bg-surface-100/60');
      var c = picks[i].querySelector('[data-caret]');
      if (c) c.textContent = '\u25b8';
    }
    var groups = card.querySelectorAll('[data-stage]');
    for (var j = 0; j < groups.length; j++) {
      groups[j].style.display = !closing && groups[j].getAttribute('data-stage') === want ? 'block' : 'none';
    }
    var hint = card.querySelector('[data-stage-empty]');
    if (hint) hint.style.display = closing ? 'block' : 'none';
    if (!closing) {
      btn.setAttribute('data-active', '1');
      btn.classList.add('bg-surface-100/60');
      var caret = btn.querySelector('[data-caret]');
      if (caret) caret.textContent = '\u25be';
    }
  }

  /** Function-tag rows: the picked tag's drill-down lives in a separate card
   * further down the pane, so this scopes to the pane rather than the card the
   * button sits in. Clicking the active tag closes it again. */
  function applyTagPick(btn) {
    var pane = btn.closest('[data-pane]');
    if (!pane) return;
    var want = btn.getAttribute('data-tagpick');
    var closing = btn.getAttribute('data-active') === '1';
    var picks = pane.querySelectorAll('[data-tagpick]');
    for (var i = 0; i < picks.length; i++) {
      var isWanted = picks[i].getAttribute('data-tagpick') === want && !closing;
      if (isWanted) picks[i].setAttribute('data-active', '1');
      else picks[i].removeAttribute('data-active');
      // Explicit class swap, not a toggle: the *default* tag arrives from React's
      // static render already carrying the active classes (border-accent-500/50
      // etc.) baked straight into its class="" attribute, not via an inline style.
      // Toggling a single class, or clearing an inline style override, only undoes
      // whatever THIS function itself previously applied - it can never remove a
      // class React wrote at build time. That left the very first tag's highlight
      // stuck on forever, with every later pick just layering its own on top.
      // Removing every variant class unconditionally first, then adding back
      // exactly the right pair, works no matter which one put a class there.
      picks[i].classList.remove('bg-accent-500/10', 'border-accent-500/50', 'border-transparent', 'hover:bg-surface-100/40');
      if (isWanted) picks[i].classList.add('bg-accent-500/10', 'border-accent-500/50');
      else picks[i].classList.add('border-transparent', 'hover:bg-surface-100/40');
      var name = picks[i].querySelector('[data-tagname]');
      if (name) {
        var inactiveClass = name.getAttribute('data-inactive-class') || 'text-gray-400';
        name.classList.remove('text-accent-400', 'font-medium', inactiveClass);
        if (isWanted) name.classList.add('text-accent-400', 'font-medium');
        else name.classList.add(inactiveClass);
      }
      var c = picks[i].querySelector('[data-caret]');
      if (c) c.textContent = isWanted ? '\u25be' : '\u25b8';
    }
    var groups = pane.querySelectorAll('[data-tag]');
    for (var j = 0; j < groups.length; j++) {
      groups[j].style.display = !closing && groups[j].getAttribute('data-tag') === want ? 'block' : 'none';
    }
    var hint = pane.querySelector('[data-tag-empty]');
    if (hint) hint.style.display = closing ? 'block' : 'none';
    if (!closing && hint) {
      var card = hint.closest('div.rounded-lg');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function toggleBodyFor(btn) {
    var parent = btn.parentNode;
    if (!parent || !parent.children) return null;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].hasAttribute('data-toggle-body')) return parent.children[i];
    }
    return null;
  }

  /** Free-text search boxes (Goals tab, Function Tag's Task Details, Resources'
   * Contribution by Person): hides non-matching rows via inline styles rather than
   * removing them, mirroring the same match rule the live app's filterRoadmapGoalsByText
   * uses — a task shows if its own name, its deliverable's, or its goal's contains the
   * search text; a deliverable/goal shows if anything under it does. */
  function applyTreeSearchWithin(root, needle) {
    var q = (needle || '').trim().toLowerCase();
    var goals = root.querySelectorAll('[data-search-goal]');
    var anyGoalVisible = false;
    for (var i = 0; i < goals.length; i++) {
      var goalEl = goals[i];
      var goalName = (goalEl.getAttribute('data-search-goal') || '').toLowerCase();
      var deliverables = goalEl.querySelectorAll('[data-search-deliverable]');
      var goalVisible = deliverables.length === 0 ? (!q || goalName.indexOf(q) >= 0) : false;
      for (var j = 0; j < deliverables.length; j++) {
        var delivEl = deliverables[j];
        var delivName = (delivEl.getAttribute('data-search-deliverable') || '').toLowerCase();
        var tasks = delivEl.querySelectorAll('[data-search-task]');
        var delivVisible = tasks.length === 0 ? (!q || delivName.indexOf(q) >= 0 || goalName.indexOf(q) >= 0) : false;
        for (var k = 0; k < tasks.length; k++) {
          var taskEl = tasks[k];
          var taskName = (taskEl.getAttribute('data-search-task') || '').toLowerCase();
          var show = !q || taskName.indexOf(q) >= 0 || delivName.indexOf(q) >= 0 || goalName.indexOf(q) >= 0;
          taskEl.style.display = show ? '' : 'none';
          if (show) delivVisible = true;
        }
        delivEl.style.display = delivVisible ? '' : 'none';
        if (delivVisible) goalVisible = true;
      }
      goalEl.style.display = goalVisible ? '' : 'none';
      if (goalVisible) anyGoalVisible = true;
    }
    var empty = root.querySelector('[data-search-empty]');
    if (empty) empty.style.display = q && goals.length > 0 && !anyGoalVisible ? '' : 'none';
  }

  /** Applies the tree search within every independent root inside the pane - a
   * plain pane (Goals) is one root, but Function Tag's "Task Details" card has one
   * root per tag (only one visible at a time, but the filter is applied to all of
   * them so it's already in effect if the reader switches tags afterward). */
  function applyTreeSearch(paneEl, needle) {
    var roots = paneEl.querySelectorAll('[data-tag]');
    if (roots.length === 0) roots = [paneEl];
    for (var r = 0; r < roots.length; r++) {
      applyTreeSearchWithin(roots[r], needle);
    }
  }

  /** Resources' Contribution-by-Person search: a flat list, no hierarchy to walk. */
  function applyPersonSearch(paneEl, needle) {
    var q = (needle || '').trim().toLowerCase();
    var rows = paneEl.querySelectorAll('[data-search-person]');
    var anyVisible = false;
    for (var i = 0; i < rows.length; i++) {
      var name = (rows[i].getAttribute('data-search-person') || '').toLowerCase();
      var show = !q || name.indexOf(q) >= 0;
      rows[i].style.display = show ? '' : 'none';
      if (show) anyVisible = true;
    }
    var empty = paneEl.querySelector('[data-search-empty]');
    if (empty) empty.style.display = q && rows.length > 0 && !anyVisible ? '' : 'none';
  }

  document.addEventListener('input', function (e) {
    var node = e.target;
    if (!node.hasAttribute || !node.hasAttribute('data-search-input')) return;
    var pane = node.closest('[data-pane]');
    if (!pane) return;
    var kind = node.getAttribute('data-search-input');
    if (kind === 'tree') applyTreeSearch(pane, node.value);
    else if (kind === 'person') applyPersonSearch(pane, node.value);
  });

  document.addEventListener('click', function (e) {
    var node = e.target;
    while (node && node !== document.body && node.nodeType === 1) {
      if (node.hasAttribute('data-tabbtn')) {
        activeTab = node.getAttribute('data-tabbtn');
        render();
        return;
      }
      if (node.hasAttribute('data-stagepick')) {
        applyStagePick(node);
        return;
      }
      if (node.hasAttribute('data-tagpick')) {
        applyTagPick(node);
        return;
      }
      if (node.hasAttribute('data-attnfilter')) {
        applyAttentionFilter(node);
        return;
      }
      if (node.hasAttribute('data-toggle')) {
        var body = toggleBodyFor(node);
        if (body) {
          var willOpen = body.style.display === 'none';
          body.style.display = willOpen ? 'block' : 'none';
          var caret = node.querySelector('[data-caret]');
          if (caret) caret.textContent = willOpen ? '\\u25be' : '\\u25b8';
        }
        return;
      }
      if (node.hasAttribute('data-filter')) {
        var pane = node.closest('[data-pane]');
        if (pane && pane.getAttribute('data-tab') === activeTab) {
          if (!state[activeTab]) state[activeTab] = {};
          state[activeTab][node.getAttribute('data-filter')] = node.getAttribute('data-value');
          render();
        }
        return;
      }
      node = node.parentNode;
    }
  });

  render();
})();
`

/**
 * Renders every tab at every filter combination to static markup, then stitches
 * them into one standalone document with the app's own CSS plus a small script
 * that swaps panes — so tab navigation and the in-tab filters keep working
 * offline, against exactly the data present at download time.
 *
 * Each pane's filter values are passed to the tab component as explicit props
 * rather than written to the shared store first — during a static render the
 * store's server-snapshot semantics would hand every pane the same value, which
 * silently produced 168 identical copies.
 */
export function buildInteractiveReport(input: InteractiveReportInput): string {
  const store = useRoadmapStore.getState()
  const saved = {
    overallAudience: store.overallAudience,
    goalsAudience: store.goalsAudience,
    goalsStatusGroup: store.goalsStatusGroup,
    executiveAudience: store.executiveAudience,
    executiveSpilloverMode: store.executiveSpilloverMode,
    executiveStatusGroup: store.executiveStatusGroup,
    resourcesSpilloverMode: store.resourcesSpilloverMode,
    resourcesStatusGroup: store.resourcesStatusGroup,
    functionTagAudience: store.functionTagAudience,
    functionTagSpilloverMode: store.functionTagSpilloverMode,
    spilloverAudience: store.spilloverAudience,
    spilloverBucket: store.spilloverBucket,
  }

  const settings = {
    avgCostPerHour: input.avgCostPerHour,
    totalWorkingHours: input.totalWorkingHours,
    previousSprintCount: input.previousSprintCount,
    spillover: input.spillover,
  }

  const chunks = buildPanes(input).map((pane) => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={input.queryClient}>
        <ReportSettingsProvider value={settings}>{pane.node}</ReportSettingsProvider>
      </QueryClientProvider>
    )
    return `<div data-pane ${attrsToHtml(pane.attrs)} style="display:none">${markup}</div>`
  })

  const initialState = {
    overall: { audience: saved.overallAudience },
    goals: { audience: saved.goalsAudience, status: saved.goalsStatusGroup },
    executive: {
      audience: saved.executiveAudience,
      spill: saved.executiveSpilloverMode,
      status: saved.executiveStatusGroup,
    },
    resources: { spill: saved.resourcesSpilloverMode, status: saved.resourcesStatusGroup },
    functionTag: { audience: saved.functionTagAudience, spill: saved.functionTagSpilloverMode },
    spillover: { audience: saved.spilloverAudience, bucket: saved.spilloverBucket },
  }

  const activeTab = TAB_ORDER.includes(input.activeTab as ExportTab) ? input.activeTab : 'overall'
  const totalBudget = input.avgCostPerHour * input.totalWorkingHours

  const tabBar = TAB_ORDER.map(
    (t) => `<button data-tabbtn="${t}" class="px-3 py-1 rounded transition-colors text-gray-400">${TAB_LABELS[t]}</button>`
  ).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Roadmap Status Report</title>
<style>
html, body { margin: 0; background: #1a1a1e; color: #f3f4f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
${collectPageCss()}
[data-pane] { display: none; }
</style>
</head>
<body>
<div class="p-4 space-y-3">
  <div>
    <h1 class="text-lg font-semibold text-gray-100">Roadmap Status</h1>
    <p class="text-xs text-gray-500">Generated ${escapeHtml(new Date().toLocaleString())} · snapshot of the data at download time</p>
  </div>
  <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
    <span><span class="text-gray-500">Scope:</span> ${escapeHtml(input.scopeNames.join(', ') || '—')}</span>
    ${
      input.timeRangeFrom && input.timeRangeTo
        ? `<span><span class="text-gray-500">Time range:</span> ${escapeHtml(input.timeRangeFrom)} – ${escapeHtml(input.timeRangeTo)}</span>`
        : ''
    }
    <span><span class="text-gray-500">Avg cost/hour:</span> ${escapeHtml(formatCurrency(input.avgCostPerHour))}</span>
    <span><span class="text-gray-500">Total working hours:</span> ${escapeHtml(formatHours(input.totalWorkingHours))}</span>
    <span><span class="text-gray-500">Total budget:</span> ${escapeHtml(formatCurrency(totalBudget))}</span>
  </div>
  ${
    input.timeRestriction === 'permission'
      ? `<div class="rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">Hours may only reflect the report generator's own logged time for some tasks — ClickUp restricts cross-member time data to Workspace Owner/Admin tokens.</div>`
      : input.timeRestriction === 'error'
        ? `<div class="rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">Hours may only reflect the report generator's own logged time for some tasks — a ClickUp request failed temporarily at download time, not a permissions issue.</div>`
        : ''
  }
  <div class="flex items-center bg-surface-200 rounded-md p-0.5 text-sm w-fit flex-wrap">${tabBar}</div>
</div>
<div class="px-4 pb-8">
${chunks.join('\n')}
</div>
<script>
window.__REPORT_STATE__ = ${JSON.stringify(initialState)};
window.__REPORT_ACTIVE_TAB__ = ${JSON.stringify(activeTab)};
</script>
<script>${RUNTIME_JS}</script>
</body>
</html>`
}
