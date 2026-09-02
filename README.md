# Dev Bandwidth Tracker

A dark-themed dev bandwidth / sprint tracker for ClickUp. Reads live workspace data over
the **ClickUp MCP server** and shows it in a List view, a Calendar/Gantt view, and a
Bandwidth (capacity vs. target) view.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS (dark theme)
- Zustand (+ `persist` to localStorage) for cache/UI/auth state
- TanStack Query for data fetching, caching, and background refetch
- TanStack Virtual for long task lists
- `@modelcontextprotocol/sdk` for the MCP client (Streamable HTTP transport)

## How it connects to ClickUp

The app connects directly, from the browser, to the ClickUp MCP server
(`VITE_CLICKUP_MCP_URL`, default `https://mcp.clickup.com/mcp`) using the
`@modelcontextprotocol/sdk` client over Streamable HTTP. On first launch you'll be asked
for a **ClickUp personal API token** (ClickUp → Settings → Apps → API Token) — it's
stored only in `localStorage` and sent as a bearer/auth header on every MCP call.

**Important caveat:** different ClickUp MCP server builds/versions have exposed slightly
different tool names for the same operation (e.g. `get_workspaces` vs.
`clickup_get_workspaces`). [`src/lib/mcp/toolNames.ts`](src/lib/mcp/toolNames.ts) lists
candidate names per operation and the client probes them in order — if ClickUp renames
or versions its tool catalog, update the candidate lists there first. Per the spec, if
every MCP tool call for an operation fails, the app falls back to a direct ClickUp REST
API v2 call using the same token (see [`src/lib/mcp/clickupRest.ts`](src/lib/mcp/clickupRest.ts)).
That fallback requires `api.clickup.com` to be reachable and CORS-permitting from your
deployed origin; if it isn't, put a same-origin proxy in front of it.

## Data model & business rules

- **Sprint points splitting**: a task's `Points`/`Sprint Points` custom field is split
  evenly across its assignees (`total / assignees.length`) everywhere it's displayed —
  see [`src/lib/points.ts`](src/lib/points.ts).
- **Start date resolution**: a task's effective start date is the first time its status
  moved out of the initial "open" group (Backlog/Todo/Open) into "in progress or above",
  read from ClickUp's time-in-status history and cached per task id. Falls back to the
  task's native `start_date` when history is unavailable — see
  [`src/lib/dates.ts`](src/lib/dates.ts) (`resolveStartDateFromHistory`) and
  [`src/hooks/useResolveStartDates.ts`](src/hooks/useResolveStartDates.ts).
- **Developer** is read from a single-user custom field named `Developer`.

## Caching & sync

`src/store/cacheStore.ts` mirrors the spec's cache shape (`workspaces`, `spaces`,
`folders`, `lists`, `tasks`, `taskDetails`, `capacities`), persisted to `localStorage`.
Opening a List/Folder skips the network entirely if its cache entry is <5 minutes old;
otherwise it does a delta fetch (`date_updated_gt`) and merges results in place. The
active list is silently re-synced every 5 minutes ([`useBackgroundSync`](src/hooks/useBackgroundSync.ts)).

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Open the app, paste your ClickUp API token, and your first workspace opens automatically.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_CLICKUP_MCP_URL` | `https://mcp.clickup.com/mcp` | ClickUp MCP server endpoint |
| `VITE_CLICKUP_REST_URL` | `https://api.clickup.com/api/v2` | REST fallback base, used only if MCP calls fail |

## Deploying to Vercel

```bash
npm i -g vercel
vercel
```

`vercel.json` is already configured (Vite framework preset, SPA rewrite to `index.html`).
Set `VITE_CLICKUP_MCP_URL` (and `VITE_CLICKUP_REST_URL` if you use a custom REST fallback)
as Environment Variables in the Vercel project settings, then redeploy.

## Deploying to Netlify

```bash
npm i -g netlify-cli
netlify deploy --build
```

`netlify.toml` sets the build command, publish directory, and SPA redirect. Add the same
env vars under Site settings → Environment variables.

## Project structure

```
src/
  lib/mcp/          MCP client, tool-name candidates, REST fallback, task mapping
  lib/              points-splitting, date/status-history resolution, gantt layout math
  store/            Zustand: cacheStore, uiStore, authStore
  hooks/            React Query hooks (workspaces, hierarchy, tasks, bandwidth, sync)
  components/
    sidebar/        Workspace → Space → Folder → List tree
    list/           List view (grouped rows, bulk toolbar, virtualization)
    calendar/       Task/Dev Gantt views, date range controls
    bandwidth/       Capacity table, overall bar chart, drill-down panels
    task/           Task detail side panel
```

## Performance notes

- Tasks are fetched per active list/folder only — never the whole workspace at once.
- Task fetches paginate at 100/page.
- Split-points and gantt bar geometry are memoized (`useMemo`).
- Lists over 50 tasks are virtualized with `@tanstack/react-virtual`.
- Search/filter input is debounced 300ms.
- Calendar and Bandwidth views are code-split via `React.lazy`.
