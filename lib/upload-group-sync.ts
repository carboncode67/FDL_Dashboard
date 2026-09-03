import { prisma } from "@/lib/prisma";

// Every upload table Data Sorting can group items across. Kept in one place
// so the merge endpoint and the tag-propagation helper below stay in sync.
const GROUPABLE_TABLES = {
  photos: prisma.photo,
  notes: prisma.note,
  recordings: prisma.recording,
  locations: prisma.location,
  "lab-member-uploads": prisma.labMemberUpload,
  documents: prisma.document,
  videos: prisma.video,
} as const;

export type GroupableTable = keyof typeof GROUPABLE_TABLES;

export function isGroupableTable(t: string): t is GroupableTable {
  return t in GROUPABLE_TABLES;
}

interface GroupTagFields {
  category?: string | null;
  needs_further_processing?: boolean;
}

// Applies category / needs_further_processing to every other member of a
// merge group, so tagging one grouped asset tags the whole group (per the
// Data Sorting "grouped assets receive the same tags" behavior). Called from
// the uploads PATCH route after any edit that touches those two fields.
export async function propagateToGroup(
  sourceTable: GroupableTable,
  sourceId: number,
  mergeGroupId: string,
  fields: GroupTagFields
): Promise<void> {
  if (Object.keys(fields).length === 0) return;

  await Promise.all(
    (Object.keys(GROUPABLE_TABLES) as GroupableTable[]).map((table) => {
      const model = GROUPABLE_TABLES[table];
      const where =
        table === sourceTable
          ? { merge_group_id: mergeGroupId, id: { not: sourceId } }
          : { merge_group_id: mergeGroupId };
      // Each model's `updateMany` has a distinct generated input type; this
      // helper is intentionally generic across all of them.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (model as any).updateMany({ where, data: fields });
    })
  );
}
