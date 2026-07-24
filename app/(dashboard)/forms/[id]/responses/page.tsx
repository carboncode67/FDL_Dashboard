import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ResponsesClient from "./responses-client";

export default async function FormResponsesPage({ params }: { params: Promise<{ id: string }> }) {
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
      },
      orderBy: { submitted_at: "desc" },
    }),
  ]);

  if (!form) notFound();

  // Photo fields store the mobile client's content_hash reference to a Photos
  // row, not a filename — resolve it here since the response may have been
  // submitted before that photo finished uploading (offline-first, same as
  // every other upload type), so the lookup can legitimately come up empty.
  const photoColIndexes = new Set(
    form.FieldDefinitions.filter((f) => f.field_type === "photo").map((f) => f.col_index)
  );
  const photoHashes = new Set<string>();
  for (const r of responses) {
    const data = r.data as Record<string, string | number | boolean | null>;
    for (const colIndex of photoColIndexes) {
      const v = data[String(colIndex)];
      if (typeof v === "string" && v) photoHashes.add(v);
    }
  }
  const photos =
    photoHashes.size > 0
      ? await prisma.photo.findMany({
          where: { content_hash: { in: Array.from(photoHashes) } },
          select: { content_hash: true, filename: true },
        })
      : [];
  const filenameByHash = new Map(photos.map((p) => [p.content_hash, p.filename]));

  return (
    <ResponsesClient
      form={{ id: form.id, title: form.title }}
      fields={form.FieldDefinitions.map((f) => ({ col_index: f.col_index, label: f.label, field_type: f.field_type }))}
      responses={responses.map((r) => {
        const data = r.data as Record<string, string | number | boolean | null>;
        const photoFilenames: Record<string, string | null> = {};
        for (const colIndex of photoColIndexes) {
          const v = data[String(colIndex)];
          photoFilenames[String(colIndex)] = typeof v === "string" ? (filenameByHash.get(v) ?? null) : null;
        }
        return {
          id: r.id,
          data,
          photoFilenames,
          submitted_at: r.submitted_at.toISOString(),
          recipient: r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
        };
      })}
    />
  );
}
