import type { AppTask, ClickUpUser } from '@/types/clickup'

interface RawUser {
  id: number
  username?: string
  email?: string
  color?: string
  profilePicture?: string | null
  initials?: string
}

interface RawCustomField {
  id: string
  name: string
  type: string
  value?: unknown
  type_config?: { options?: Array<{ id: string; name?: string; label?: string }> }
}

interface RawTask {
  id: string
  name: string
  status?: { status: string; color?: string; type?: string; orderindex?: number }
  assignees?: RawUser[]
  priority?: { priority: string; color?: string } | null
  due_date?: string | number | null
  start_date?: string | number | null
  date_updated?: string | number | null
  url?: string
  description?: string
  text_content?: string
  list?: { id: string }
  folder?: { id: string } | null
  space?: { id: string }
  /** Every list this task has been added to (Tasks in Multiple Lists) — `list` above
   * is only its home list, so a task shared into another sprint via TIML won't show
   * that membership there. */
  locations?: Array<{ id: string; name?: string }>
  custom_fields?: RawCustomField[]
  /** ClickUp's Sprints ClickApp ("points per assignee") stores story/sprint points
   * as this native field on the task, not as a custom field. */
  points?: number | string | null
  tags?: Array<{ name: string }>
}

function toMs(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

function toUser(raw: RawUser): ClickUpUser {
  return {
    id: raw.id,
    username: raw.username ?? `User ${raw.id}`,
    email: raw.email,
    color: raw.color,
    profilePicture: raw.profilePicture ?? null,
    initials: raw.initials,
  }
}

function findCustomField(fields: RawCustomField[] | undefined, ...names: string[]): RawCustomField | undefined {
  if (!fields) return undefined
  const lowerNames = names.map((n) => n.toLowerCase())
  return fields.find((f) => lowerNames.includes(f.name.toLowerCase()))
}

function extractDeveloper(field: RawCustomField | undefined): ClickUpUser | null {
  if (!field?.value) return null
  const value = field.value
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]
    if (typeof first === 'object' && first !== null && 'id' in first) return toUser(first as RawUser)
  }
  if (typeof value === 'object' && value !== null && 'id' in value) return toUser(value as RawUser)
  return null
}

/** Prefers the native Sprints ClickApp `points` field; falls back to a "Points" /
 * "Sprint Points" custom field for workspaces that track it that way instead. */
function extractPoints(nativePoints: number | string | null | undefined, field: RawCustomField | undefined): number | null {
  if (nativePoints !== undefined && nativePoints !== null && nativePoints !== '') {
    const n = Number(nativePoints)
    if (Number.isFinite(n)) return n
  }
  if (field?.value === undefined || field?.value === null) return null
  const n = Number(field.value)
  return Number.isFinite(n) ? n : null
}

function extractText(field: RawCustomField | undefined): string | null {
  if (field?.value === undefined || field?.value === null) return null
  const text = String(field.value).trim()
  return text.length > 0 ? text : null
}

/** Reads a custom field's human-readable label(s) regardless of whether it's a plain
 * text field, a dropdown (value is the selected option's numeric index into
 * type_config.options), or a labels/multi-select field (value is an array of option
 * ids or objects) — dropdown/label values are never usable as raw strings. */
function extractFieldLabel(field: RawCustomField | undefined): string | null {
  if (!field || field.value === undefined || field.value === null) return null
  const value = field.value
  const options = field.type_config?.options ?? []

  if (typeof value === 'number') {
    const option = options[value]
    return option?.name ?? option?.label ?? null
  }

  if (Array.isArray(value)) {
    const labels = value
      .map((entry) => {
        if (typeof entry === 'string') {
          const option = options.find((o) => o.id === entry)
          return option?.name ?? option?.label ?? null
        }
        if (typeof entry === 'object' && entry !== null) {
          return (entry as { name?: string; label?: string }).name ?? (entry as { name?: string; label?: string }).label ?? null
        }
        return null
      })
      .filter((v): v is string => !!v)
    // Sorted, so a multi-select has exactly one spelling. ClickUp returns the
    // selected options in an arbitrary order, and two tasks that picked the same
    // pair would otherwise produce different strings ("A, B" vs "B, A") — which
    // reads as two distinct values everywhere these fields are grouped or compared
    // (the by-metric breakdowns, the CSV, and the deliverable-level rollup).
    return labels.length > 0 ? labels.slice().sort((a, b) => a.localeCompare(b)).join(', ') : null
  }

  if (typeof value === 'string') {
    const text = value.trim()
    return text.length > 0 ? text : null
  }

  return null
}

function normalizePriority(priority: string | undefined): AppTask['priority'] {
  if (!priority) return null
  const p = priority.toLowerCase()
  if (p === 'urgent' || p === 'high' || p === 'normal' || p === 'low') return p
  return null
}

export function mapRawTaskToAppTask(raw: RawTask): AppTask {
  const developerField = findCustomField(raw.custom_fields, 'Developer')
  const pointsField = findCustomField(raw.custom_fields, 'Points', 'Sprint Points')
  const betaDueField = findCustomField(raw.custom_fields, 'Beta Due Date')
  const goalField = findCustomField(raw.custom_fields, 'Goal')
  const deliverableField = findCustomField(raw.custom_fields, 'Deliverable')
  const outcomeField = findCustomField(raw.custom_fields, 'Outcome')
  const functionTagField = findCustomField(raw.custom_fields, 'Function Tag')
  const metricCategoryField = findCustomField(raw.custom_fields, 'Metric Category')
  const impactedMetricField = findCustomField(raw.custom_fields, 'Impacted Metric')
  const implementationOwnerField = findCustomField(raw.custom_fields, 'Implementation Owner')
  const deliveryManagerField = findCustomField(raw.custom_fields, 'Delivery Manager')
  const deliveryDateField = findCustomField(raw.custom_fields, 'Delivery Date')

  return {
    id: raw.id,
    name: raw.name,
    status: raw.status?.status ?? 'Unknown',
    statusColor: raw.status?.color,
    statusType: (raw.status?.type as AppTask['statusType']) ?? 'open',
    statusOrderIndex: raw.status?.orderindex,
    assignees: (raw.assignees ?? []).map(toUser),
    priority: normalizePriority(raw.priority?.priority),
    dueDate: toMs(raw.due_date),
    rawStartDate: toMs(raw.start_date),
    betaDueDate: toMs(betaDueField?.value as string | number | null | undefined),
    deliveryDate: toMs(deliveryDateField?.value as string | number | null | undefined),
    developer: extractDeveloper(developerField),
    points: extractPoints(raw.points, pointsField),
    tags: (raw.tags ?? []).map((t) => t.name.toLowerCase()),
    goal: extractText(goalField),
    deliverable: extractText(deliverableField),
    outcome: extractText(outcomeField),
    functionTag: extractFieldLabel(functionTagField),
    metricCategory: extractFieldLabel(metricCategoryField),
    impactedMetric: extractFieldLabel(impactedMetricField),
    implementationOwner: extractDeveloper(implementationOwnerField),
    deliveryManager: extractDeveloper(deliveryManagerField),
    listId: raw.list?.id ?? '',
    folderId: raw.folder?.id ?? null,
    spaceId: raw.space?.id ?? '',
    locations: (raw.locations ?? []).map((l) => ({ id: String(l.id), name: l.name ?? '' })),
    url: raw.url ?? '#',
    description: raw.description ?? raw.text_content,
    dateUpdated: toMs(raw.date_updated) ?? Date.now(),
    resolvedStartDate: null,
  }
}

export function mapRawTasksToAppTasks(raw: RawTask[]): AppTask[] {
  return raw.map(mapRawTaskToAppTask)
}
