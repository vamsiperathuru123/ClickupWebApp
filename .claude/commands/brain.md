Answer a question about the Dev Bandwidth Tracker's ClickUp data, grounded in real
numbers computed the same way the app itself computes them — reusing
`src/lib/roadmap/*` and `src/lib/mcp/clickupService.ts` directly, never estimating.

The user's question: $ARGUMENTS

## 1. Read what the user is currently looking at

The app exposes its live state on `window.__stores` in dev mode (see
`src/lib/brain/devContext.ts`) — this is the "context chip" equivalent of ClickUp
Brain²: it tells you which scope/tab/settings the user has selected right now,
without needing to ask.

- Check `mcp__Claude_Browser__tabs_context` for a tab whose origin is the running
  dev server (typically `http://localhost:5173`) or the deployed app. If none is
  open, either `navigate` to it or ask the user to open it — do not guess scope.
- Once on that tab, run via `javascript_tool`:
  ```js
  const ui = window.__stores.ui.getState()
  const roadmap = window.__stores.roadmap.getState()
  const brain = window.__stores.brain.getState()
  const auth = window.__stores.auth.getState()
  JSON.stringify({
    activeWorkspaceId: ui.activeWorkspaceId,
    mainView: ui.mainView,
    activeNode: ui.activeNode,
    roadmapTab: brain.viewContext.roadmapTab,
    selectedScope: roadmap.selectedScope,
    avgCostPerHour: roadmap.avgCostPerHour,
    totalWorkingHours: roadmap.totalWorkingHours,
    spilloverPreviousSprintCount: roadmap.spilloverPreviousSprintCount,
    hasToken: !!auth.token,
  })
  ```
  Fetch the actual token separately (`window.__stores.auth.getState().token`) —
  keep it out of any output you print or log, it's a real ClickUp credential.
- If `window.__stores` is undefined, the page hasn't loaded the dev build yet —
  reload it, don't fall back to guessing.

## 2. Build the digest input

Construct the `context` (shape in `src/lib/brain/types.ts`, `BrainUiContext`):
- `view`: `ui.mainView`
- `roadmapTab`: `brain.viewContext.roadmapTab` (only meaningful when view is `roadmap`)
- `scope`: when `mainView === 'roadmap'`, use `roadmap.selectedScope` as-is. Otherwise
  (`list`/`calendar`/`bandwidth`), build a one-item scope from `ui.activeNode`
  (`[{ type: activeNode.type, id: activeNode.id, name: activeNode.name }]`) if set;
  if `activeNode` is null, ask the user which list/folder they mean rather than
  guessing. `scope` must never be empty — `digest.ts` rejects it.
- `settings`: `{ avgCostPerHour, totalWorkingHours, previousSprintCount:
  spilloverPreviousSprintCount }` from the roadmap store (default any missing value
  to `0`).

Write this plus `token` and `workspaceId` (`activeWorkspaceId`) to a JSON file in
your scratchpad directory (never inside the repo — it holds a real credential).
Shape:
```json
{ "token": "...", "workspaceId": "...", "context": { ... } }
```

## 3. Run the digest

```bash
cd "server" && npx tsx scripts/digest.ts "<path to the json file>"
```

This reuses the exact aggregation code the live app renders from
(`fetchRoadmapData` → `aggregateTimeEntries` → `buildRoadmap`, plus the status
matrix / attention list / per-person / function-tag rollups) — no API key needed,
it only computes text, never calls a model. ClickUp rate-limits (429, auto-retried
with backoff) can make this take up to a minute or two on a big scope; that's
normal, not a failure.

## 4. Answer the question

Read the printed markdown digest and answer $ARGUMENTS directly from it — cite
real goal/deliverable/task names and numbers, exactly as they appear. Do not round
or approximate a figure that's already exact in the digest.

If the digest doesn't have enough detail for the question (a task's full
description or a long custom field like Impacted Metric, its real status-history
timeline, comments, or anything about a task outside the current scope):

- **Full task detail** (description, custom fields, status history):
  ```bash
  cd "server" && npx tsx scripts/taskDetail.ts "<token>" "<taskId>"
  ```
- **Anything else** (searching by text, workspace members, a different scope,
  comments): write a small one-off script that imports the relevant function from
  `src/lib/mcp/clickupService.ts` (e.g. `fetchTask`, `fetchWorkspaceMembers`,
  `fetchStatusHistoryBulk`) and run it with `tsx` from `server/`, the same way
  `digest.ts` and `taskDetail.ts` do. There's no fixed tool list here — you have
  full script access, use it directly rather than working around a missing tool.

Never fabricate a number this scope doesn't actually have — if something isn't
answerable from the data, say so and suggest the follow-up script that would
answer it.

## Notes

- The digest is intentionally the same shape regardless of which view surfaced the
  scope (List/Calendar/Bandwidth included) — it's always a Goal → Deliverable →
  Task rollup, since that's what the underlying ClickUp custom fields describe.
- This whole flow costs nothing beyond your own Claude Code usage — it never calls
  the Anthropic API on its own, and the ClickUp token is only ever read from the
  browser and passed to a local script, never sent anywhere else.
