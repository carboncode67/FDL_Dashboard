import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ResponsesClient from "./responses-client";
import { runWithTenant } from "@/lib/lab-db";
import { resolvePhotoFilenames } from "@/lib/sampling-point-data";
import { fieldDisplayLabel, fieldsForDisplay } from "@/lib/form-fields";

export default async function FormResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const formId = parseInt(id);

  const [form, responses] = await Promise.all([
    prisma.form.findUnique({
      where: { id: formId },
      include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
    }),
    prisma.formResponse.findMany({
      where: { form_id: formId },
      include: {
        Contact: { select: { name: true } },
        User: { select: { name: true, email: true } },
        SamplingPoint: {
          select: { id: true, label: true, SamplingMap: { select: { id: true, name: true, farm_id: true } } },
        },
      },
      orderBy: { submitted_at: "desc" },
    }),
  ]);

  if (!form) notFound();
  // Includes archived (removed) fields after the active ones, so their past answers stay visible.
  const fields = fieldsForDisplay(form.FieldDefinitions);

  // Photo fields store the mobile client's content_hash reference to a Photos
  // row, not a filename — resolve it here since the response may have been
  // submitted before that photo finished uploading (offline-first, same as
  // every other upload type), so the lookup can legitimately come up empty.
  const photoKeys = new Set(fields.filter((f) => f.field_type === "photo").map((f) => f.field_key));
  const photoHashes = new Set<string>();
  for (const r of responses) {
    const data = r.data as Record<string, string | number | boolean | null>;
    for (const key of photoKeys) {
      const v = data[key];
      if (typeof v === "string" && v) photoHashes.add(v);
    }
  }
  const filenameByHash = await resolvePhotoFilenames(photoHashes);

  return (
    <ResponsesClient
      form={{ id: form.id, title: form.title }}
      fields={fields.map((f) => ({ field_key: f.field_key, label: fieldDisplayLabel(f), field_type: f.field_type, removed: !!f.archived_at }))}
      responses={responses.map((r) => {
        const data = r.data as Record<string, string | number | boolean | string[] | null>;
        const photoFilenames: Record<string, string | null> = {};
        for (const key of photoKeys) {
          const v = data[key];
          photoFilenames[key] = typeof v === "string" ? (filenameByHash.get(v) ?? null) : null;
        }
        return {
          id: r.id,
          data,
          photoFilenames,
          submitted_at: r.submitted_at.toISOString(),
          olderFormVersion: r.older_form_version,
          missingRequired: r.missing_required,
          recipient: r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
          samplingPoint: r.SamplingPoint
            ? {
                label: r.SamplingPoint.label ?? `Point #${r.SamplingPoint.id}`,
                mapName: r.SamplingPoint.SamplingMap.name,
                farmId: r.SamplingPoint.SamplingMap.farm_id,
                mapId: r.SamplingPoint.SamplingMap.id,
              }
            : null,
        };
      })}
    />
  );
  });
}
