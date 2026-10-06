import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { toCsv } from "@/lib/csv";

// Full-fidelity CSV of every response to one form — one row per submission, one column per
// field. This is the backup a lab member must take before deleting a form that has responses
// (see DELETE /api/forms/[id]). Photo fields hold a content_hash reference to a Photos row;
// resolved to the stored filename when the photo has finished uploading, else left as the hash.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const formId = parseInt(id);
  if (isNaN(formId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const responses = await prisma.formResponse.findMany({
    where: { form_id: formId },
    include: {
      Contact: { select: { name: true } },
      User: { select: { name: true, email: true } },
      SamplingPoint: { select: { id: true, label: true, SamplingMap: { select: { name: true } } } },
    },
    orderBy: { submitted_at: "asc" },
  });

  const photoCols = new Set(form.FieldDefinitions.filter((f) => f.field_type === "photo").map((f) => f.col_index));
  const hashes = new Set<string>();
  for (const r of responses) {
    const data = r.data as Record<string, unknown>;
    for (const c of photoCols) {
      const v = data[String(c)];
      if (typeof v === "string" && v) hashes.add(v);
    }
  }
  const photos = hashes.size
    ? await prisma.photo.findMany({
        where: { content_hash: { in: Array.from(hashes) } },
        select: { content_hash: true, filename: true },
      })
    : [];
  const filenameByHash = new Map(photos.map((p) => [p.content_hash, p.filename]));

  const header = ["response_id", "recipient", "submitted_at", "sampling_map", "sampling_point", ...form.FieldDefinitions.map((f) => f.label)];
  const rows: (string | number | null | undefined)[][] = [];
  for (const r of responses) {
    const data = r.data as Record<string, unknown>;
    const row = [
      r.id,
      r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
      r.submitted_at.toISOString(),
      r.SamplingPoint?.SamplingMap.name ?? "",
      r.SamplingPoint ? (r.SamplingPoint.label ?? `Point #${r.SamplingPoint.id}`) : "",
      ...form.FieldDefinitions.map((f) => {
        const v = data[String(f.col_index)];
        if (f.field_type === "photo" && typeof v === "string") return filenameByHash.get(v) ?? v;
        return v === null || v === undefined ? null : String(v);
      }),
    ];
    rows.push(row);
  }

  const csv = toCsv(header, rows);

  const safeTitle = form.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "form";
  // BOM so Excel reads UTF-8 correctly.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}_responses.csv"`,
    },
  });
  });
}
