import type { ClickUpFolder, ClickUpList, ClickUpSpace, ClickUpWorkspace } from '@/types/clickup'

/** Normalizers are tolerant of minor field-naming variance between MCP tool
 * responses and the raw ClickUp REST shape (e.g. `team_id` vs `id`). */

export function normalizeWorkspace(raw: any): ClickUpWorkspace {
  return {
    id: String(raw.id ?? raw.team_id ?? raw.workspace_id),
    name: raw.name,
    color: raw.color,
    avatar: raw.avatar ?? null,
  }
}

export function normalizeSpace(raw: any, workspaceId: string): ClickUpSpace {
  return {
    id: String(raw.id ?? raw.space_id),
    name: raw.name,
    workspaceId,
    color: raw.color,
    private: raw.private ?? false,
  }
}

export function normalizeFolder(raw: any, spaceId: string): ClickUpFolder {
  return {
    id: String(raw.id ?? raw.folder_id),
    name: raw.name,
    spaceId,
    hidden: raw.hidden ?? false,
  }
}

export function normalizeList(raw: any, spaceId: string, folderId: string | null): ClickUpList {
  return {
    id: String(raw.id ?? raw.list_id),
    name: raw.name,
    folderId,
    spaceId,
    taskCount: raw.task_count ?? raw.taskCount,
    orderindex: raw.orderindex !== undefined ? Number(raw.orderindex) : undefined,
  }
}
