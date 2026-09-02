/** Synthetic key for a space's folderless lists, stored alongside real folder ids in cacheStore.lists. */
export function folderlessKey(spaceId: string): string {
  return `folderless:${spaceId}`
}
