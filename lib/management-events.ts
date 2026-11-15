import { prisma } from "@/lib/prisma";
import type { ManagementEventRow } from "@/components/management-events-card";

// Management events for display (farm page card, timeline). Synced from OFE —
// see lib/ofe-management-sync.ts.

const snapName = (v: unknown, key: "name" | "brand_name"): string | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = typeof o[key] === "string" ? (o[key] as string) : null;
  const type = typeof o.type === "string" ? (o.type as string) : typeof o.crop === "string" ? (o.crop as string) : null;
  if (!name) return type;
  return type ? `${name} (${type})` : name;
};

export async function managementEventsForFarm(
  farmId: number,
  opts: { experimentId?: number; take?: number } = {},
): Promise<ManagementEventRow[]> {
  const rows = await prisma.managementEvent.findMany({
    where: { farm_id: farmId, ...(opts.experimentId != null ? { experiment_id: opts.experimentId } : {}) },
    orderBy: [{ event_date: "desc" }, { id: "desc" }],
    take: opts.take ?? 200,
    include: {
      OperationType: { select: { name: true, Category: { select: { name: true } } } },
      Experiment: { select: { experiment_name: true } },
      Fields: { select: { Field: { select: { id: true, Name: true } } } },
      _count: { select: { Uploads: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    event_date: r.event_date.toISOString().slice(0, 10),
    category: r.OperationType.Category.name,
    operation: r.OperationType.name,
    fields: r.Fields.map((f) => f.Field.Name ?? `Field #${f.Field.id}`),
    experiment: r.Experiment?.experiment_name ?? null,
    implement: snapName(r.implement, "name"),
    product: snapName(r.product, "brand_name"),
    crop_variety: snapName(r.crop_variety, "name"),
    notes: r.notes,
    attachments: r._count.Uploads,
    entered_by: r.created_by_name ?? r.created_by_email,
    fromOfe: r.ofe_id != null,
  }));
}
