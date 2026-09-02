/**
 * Different ClickUp MCP server builds have exposed slightly different tool names
 * for the same operation (e.g. "get_workspaces" vs "clickup_get_workspaces" vs
 * "workspaces_list"). We probe candidates in order rather than hard-coding one name,
 * so the app keeps working if mcp.clickup.com renames/versions its tool catalog.
 * Update these lists first if MCP calls start failing after a ClickUp server change.
 */
export const TOOLS = {
  getWorkspaces: ['get_workspaces', 'clickup_get_workspaces', 'get_teams', 'list_workspaces'],
  getSpaces: ['get_spaces', 'clickup_get_spaces', 'list_spaces'],
  getFolders: ['get_folders', 'clickup_get_folders', 'list_folders'],
  getLists: ['get_lists', 'clickup_get_lists', 'list_lists', 'get_folder_lists'],
  getFolderlessLists: ['get_folderless_lists', 'get_lists_from_space'],
  getListDetails: ['get_list', 'clickup_get_list'],
  getTasks: ['get_tasks', 'clickup_get_tasks', 'clickup_filter_tasks', 'filter_tasks', 'list_tasks'],
  getTask: ['get_task', 'clickup_get_task'],
  getTaskTimeInStatus: [
    'get_task_time_in_status',
    'clickup_get_task_time_in_status',
    'get_task_status_history',
    'get_status_history',
  ],
  getCustomFields: ['get_custom_fields', 'clickup_get_custom_fields', 'get_accessible_custom_fields'],
  getWorkspaceMembers: ['get_workspace_members', 'clickup_get_workspace_members', 'get_members'],
  updateTask: ['update_task', 'clickup_update_task'],
  setCustomFieldValue: ['set_custom_field_value', 'clickup_set_custom_field_value', 'set_task_custom_field'],
  getTaskComments: ['get_task_comments', 'clickup_get_task_comments', 'get_comments'],
  getDocumentPages: ['get_document_pages', 'clickup_get_document_pages', 'list_document_pages'],
  getTimeEntries: ['get_time_entries', 'clickup_get_time_entries', 'get_time_entries_within_a_date_range'],
} as const

export type ToolKey = keyof typeof TOOLS
