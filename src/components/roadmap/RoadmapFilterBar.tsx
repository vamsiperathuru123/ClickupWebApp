import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { EMPTY_FILTERS, hasAnyFilterField, type FilterFieldKey, type FilterOptions, type RoadmapFilters } from '@/lib/roadmap/filterRoadmap'
import type { ClickUpUser } from '@/types/clickup'

interface FieldConfig {
  key: FilterFieldKey
  label: string
  kind: 'text' | 'user'
  optionsKey: keyof FilterOptions
}

const FILTER_FIELDS: FieldConfig[] = [
  { key: 'goal', label: 'Goal', kind: 'text', optionsKey: 'goals' },
  { key: 'deliverable', label: 'Deliverable', kind: 'text', optionsKey: 'deliverables' },
  { key: 'status', label: 'Status', kind: 'text', optionsKey: 'statuses' },
  { key: 'priority', label: 'Priority', kind: 'text', optionsKey: 'priorities' },
  { key: 'functionTag', label: 'Function Tag', kind: 'text', optionsKey: 'functionTags' },
  { key: 'sprint', label: 'Sprint', kind: 'text', optionsKey: 'sprints' },
  { key: 'metricCategory', label: 'Metric Category', kind: 'text', optionsKey: 'metricCategories' },
  { key: 'impactedMetric', label: 'Impacted Metric', kind: 'text', optionsKey: 'impactedMetrics' },
  { key: 'outcome', label: 'Outcome', kind: 'text', optionsKey: 'outcomes' },
  { key: 'assigneeId', label: 'Assignee', kind: 'user', optionsKey: 'assignees' },
  { key: 'developerId', label: 'Developer', kind: 'user', optionsKey: 'developers' },
  { key: 'implementationOwnerId', label: 'Implementation Owner', kind: 'user', optionsKey: 'implementationOwners' },
  { key: 'deliveryManagerId', label: 'Delivery Manager', kind: 'user', optionsKey: 'deliveryManagers' },
]

function CheckboxRow({
  checked,
  label,
  user,
  onToggle,
}: {
  checked: boolean
  label: string
  user?: ClickUpUser
  onToggle: () => void
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-100 cursor-pointer text-xs">
      <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-accent-500 shrink-0" />
      {user && <Avatar user={user} size={16} />}
      <span className="truncate text-gray-200">{label}</span>
    </label>
  )
}

/** The value picker that opens under an active filter pill — search box on top of a
 * multi-select checkbox list, same shape as ClickUp's own filter-value dropdowns. */
function ValuePicker({
  field,
  options,
  selected,
  onToggle,
}: {
  field: FieldConfig
  options: FilterOptions
  selected: string[]
  onToggle: (value: string) => void
}) {
  const [search, setSearch] = useState('')
  const raw = options[field.optionsKey]
  const query = search.trim().toLowerCase()

  const rows =
    field.kind === 'user'
      ? (raw as ClickUpUser[])
          .filter((u) => !query || u.username.toLowerCase().includes(query))
          .map((u) => ({ value: String(u.id), label: u.username, user: u }))
      : (raw as string[]).filter((v) => !query || v.toLowerCase().includes(query)).map((v) => ({ value: v, label: v, user: undefined }))

  return (
    <div className="absolute left-0 top-full mt-1 z-30 w-64 max-h-80 overflow-y-auto rounded-md border border-surface-border bg-surface-200 shadow-panel p-2">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${field.label.toLowerCase()}…`}
        className="w-full mb-1 rounded bg-surface-100 border border-surface-border px-2 py-1 text-xs text-gray-100 placeholder:text-gray-500"
      />
      {rows.length === 0 && <p className="text-xs text-gray-500 px-2 py-1.5">No matches</p>}
      {rows.map((row) => (
        <CheckboxRow
          key={row.value}
          checked={selected.includes(row.value)}
          label={row.label}
          user={row.user}
          onToggle={() => onToggle(row.value)}
        />
      ))}
    </div>
  )
}

export function RoadmapFilterBar({
  options,
  filters,
  onChange,
}: {
  options: FilterOptions
  filters: RoadmapFilters
  onChange: (filters: RoadmapFilters) => void
}) {
  const [openKey, setOpenKey] = useState<FilterFieldKey | 'add' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [openKey])

  const activeFields = FILTER_FIELDS.filter((f) => filters[f.key] !== null)
  const inactiveFields = FILTER_FIELDS.filter((f) => filters[f.key] === null)

  function addField(key: FilterFieldKey) {
    onChange({ ...filters, [key]: [] })
    setOpenKey(key)
  }

  function removeField(key: FilterFieldKey) {
    onChange({ ...filters, [key]: null })
    setOpenKey(null)
  }

  function toggleValue(key: FilterFieldKey, value: string) {
    const current = filters[key] ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...filters, [key]: next })
  }

  return (
    <div ref={ref} className="flex items-center gap-2 flex-wrap">
      {activeFields.map((field) => {
        const values = filters[field.key] ?? []
        const label =
          values.length === 0
            ? field.label
            : values.length === 1
              ? `${field.label}: ${labelForValue(field, options, values[0])}`
              : `${field.label}: ${values.length}`
        return (
          <div key={field.key} className="relative">
            <button
              onClick={() => setOpenKey(openKey === field.key ? null : field.key)}
              className={clsx(
                'flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md text-xs border',
                values.length > 0
                  ? 'bg-accent-500/15 border-accent-500/40 text-accent-300'
                  : 'bg-surface-200 border-surface-border text-gray-300 hover:bg-surface-100'
              )}
            >
              <span className="max-w-[160px] truncate">{label}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  removeField(field.key)
                }}
                className="hover:text-gray-100 px-0.5"
                title={`Remove ${field.label} filter`}
              >
                ×
              </span>
            </button>
            {openKey === field.key && (
              <ValuePicker field={field} options={options} selected={values} onToggle={(v) => toggleValue(field.key, v)} />
            )}
          </div>
        )
      })}

      <div className="relative">
        <button
          onClick={() => setOpenKey(openKey === 'add' ? null : 'add')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-surface-200 text-gray-300 hover:bg-surface-100 border border-surface-border border-dashed"
        >
          + Filter
        </button>
        {openKey === 'add' && (
          <div className="absolute left-0 top-full mt-1 z-30 w-56 max-h-80 overflow-y-auto rounded-md border border-surface-border bg-surface-200 shadow-panel p-1">
            {inactiveFields.length === 0 ? (
              <p className="text-xs text-gray-500 px-2 py-1.5">All fields already filtered</p>
            ) : (
              inactiveFields.map((field) => (
                <button
                  key={field.key}
                  onClick={() => addField(field.key)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-100 text-xs text-gray-200"
                >
                  {field.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {hasAnyFilterField(filters) && (
        <button
          onClick={() => {
            onChange(EMPTY_FILTERS)
            setOpenKey(null)
          }}
          className="text-xs text-gray-400 hover:text-gray-200"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

function labelForValue(field: FieldConfig, options: FilterOptions, value: string): string {
  if (field.kind === 'user') {
    const user = (options[field.optionsKey] as ClickUpUser[]).find((u) => String(u.id) === value)
    return user?.username ?? value
  }
  return value
}
