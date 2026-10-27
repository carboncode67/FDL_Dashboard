// Client-safe half of lib/item-groups.ts (no Prisma import).

export const ITEM_GROUP_KINDS = ["forms", "sampling-maps"] as const;
export type ItemGroupKind = (typeof ITEM_GROUP_KINDS)[number];

export const MAX_GROUP_NAME_LENGTH = 60;

export interface ItemGroup {
  id: number;
  name: string;
  sort_order: number;
}

export function parseItemGroupKind(raw: string): ItemGroupKind | null {
  return (ITEM_GROUP_KINDS as readonly string[]).includes(raw) ? (raw as ItemGroupKind) : null;
}

export function normalizeGroupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_GROUP_NAME_LENGTH) return null;
  return name;
}
