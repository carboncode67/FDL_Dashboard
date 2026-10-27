import { prisma } from "@/lib/prisma";
import type { ItemGroup, ItemGroupKind } from "@/lib/item-group-types";

export * from "@/lib/item-group-types";

// Flat, collapsible list-page groups (migration 087). Forms and Sampling Maps each keep a
// separate group list (Form_Groups / Sampling_Map_Groups) — same shape, so the routes under
// /api/item-groups/[kind] share this one dispatcher instead of duplicating per kind.

const SELECT = { id: true, name: true, sort_order: true } as const;
const ORDER = [{ sort_order: "asc" as const }, { name: "asc" as const }];

export function listItemGroups(kind: ItemGroupKind): Promise<ItemGroup[]> {
  return kind === "forms"
    ? prisma.formGroup.findMany({ select: SELECT, orderBy: ORDER })
    : prisma.samplingMapGroup.findMany({ select: SELECT, orderBy: ORDER });
}

export function findItemGroupByName(kind: ItemGroupKind, name: string, excludeId?: number) {
  const where = {
    name: { equals: name, mode: "insensitive" as const },
    ...(excludeId != null ? { id: { not: excludeId } } : {}),
  };
  return kind === "forms"
    ? prisma.formGroup.findFirst({ where, select: SELECT })
    : prisma.samplingMapGroup.findFirst({ where, select: SELECT });
}

export async function createItemGroup(kind: ItemGroupKind, name: string): Promise<ItemGroup> {
  // New groups go last; sort_order is only ever rewritten wholesale by reorderItemGroups().
  const agg = kind === "forms"
    ? await prisma.formGroup.aggregate({ _max: { sort_order: true } })
    : await prisma.samplingMapGroup.aggregate({ _max: { sort_order: true } });
  const data = { name, sort_order: (agg._max.sort_order ?? -1) + 1 };
  return kind === "forms"
    ? prisma.formGroup.create({ data, select: SELECT })
    : prisma.samplingMapGroup.create({ data, select: SELECT });
}

export function renameItemGroup(kind: ItemGroupKind, id: number, name: string): Promise<ItemGroup> {
  return kind === "forms"
    ? prisma.formGroup.update({ where: { id }, data: { name }, select: SELECT })
    : prisma.samplingMapGroup.update({ where: { id }, data: { name }, select: SELECT });
}

/** Members fall back to Ungrouped via the FK's ON DELETE SET NULL. */
export async function deleteItemGroup(kind: ItemGroupKind, id: number): Promise<void> {
  if (kind === "forms") await prisma.formGroup.delete({ where: { id } });
  else await prisma.samplingMapGroup.delete({ where: { id } });
}

/** `ids` in display order; ids not in this lab's list are ignored. */
export async function reorderItemGroups(kind: ItemGroupKind, ids: number[]): Promise<void> {
  const existing = new Set((await listItemGroups(kind)).map((g) => g.id));
  const ordered = ids.filter((id) => existing.has(id));
  await prisma.$transaction(
    ordered.map((id, i) =>
      kind === "forms"
        ? prisma.formGroup.update({ where: { id }, data: { sort_order: i } })
        : prisma.samplingMapGroup.update({ where: { id }, data: { sort_order: i } })
    )
  );
}

/** Validates a group_id from a form/map PUT body: undefined = leave alone, null/"" = ungroup,
 *  otherwise must be an existing group of that kind. Returns `false` when invalid. */
export async function resolveGroupIdUpdate(
  kind: ItemGroupKind,
  raw: unknown
): Promise<{ group_id: number | null } | null | false> {
  if (raw === undefined) return null;
  if (raw === null || raw === "") return { group_id: null };
  const id = Number(raw);
  if (!Number.isInteger(id)) return false;
  const found = kind === "forms"
    ? await prisma.formGroup.findUnique({ where: { id }, select: { id: true } })
    : await prisma.samplingMapGroup.findUnique({ where: { id }, select: { id: true } });
  return found ? { group_id: id } : false;
}
