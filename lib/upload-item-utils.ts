export function isFlaggedDuplicate(item: { possible_duplicate_of: number | null; duplicate_dismissed: boolean }): boolean {
  return item.possible_duplicate_of != null && !item.duplicate_dismissed;
}
