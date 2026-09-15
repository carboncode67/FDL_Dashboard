import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { runWithTenant } from "@/lib/lab-db";
import { toCsv } from "@/lib/csv";

// Planned Changes #13.1 — "Download Responses" button on the sampling-map editor toolbar.
// Session-authed, gated the same way as the map editor page itself (app/(dashboard)/farms/
// [id]/maps/[mapId]/page.tsx): canCreate + farm in the caller's effective scope. Exports every
// Form_Responses row submitted at a point on this map, one row per response, one column per
// linked-form field (in col_index order) plus the fixed columns below.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    const role = (session?.user?.role ?? "viewer") as Role;
    if (!session?.user || !canCreate(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const mapId = parseInt(id);
    if (isNaN(mapId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const map = await prisma.samplingMap.findUnique({
      where: { id: mapId },
      select: { id: true, name: true, farm_id: true, form_id: true },
    });
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
    if (!scopeIncludesFarm(scope, map.farm_id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!map.form_id) {
      return NextResponse.json({ error: "This map has no linked form" }, { status: 400 });
    }

    const [fieldDefs, responses] = await Promise.all([
      prisma.formFieldDefinition.findMany({
        where: { form_id: map.form_id },
        orderBy: { col_index: "asc" },
      }),
      prisma.formResponse.findMany({
        where: { SamplingPoint: { sampling_map_id: mapId } },
        include: {
          Contact: { select: { name: true } },
          User: { select: { name: true, email: true } },
          SamplingPoint: { select: { id: true, label: true, placement_method: true } },
        },
        orderBy: { submitted_at: "asc" },
      }),
    ]);

    // Photo fields store a content_hash reference to a Photos row, same resolution the
    // Custom Forms responses admin view does (app/(dashboard)/forms/[id]/responses/page.tsx) —
    // the CSV gets the filename, not the hash, so it's directly usable to cross-reference
    // /api/files/photos/<filename>.
    const photoColIndexes = new Set(
      fieldDefs.filter((f) => f.field_type === "photo").map((f) => f.col_index),
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

    const header = [
      "Point name",
      "Pre-set point?",
      ...fieldDefs.map((f) => f.label),
      "Date collected",
      "Time collected",
      "Collected by",
      "X position",
      "Y position",
      "Z position",
      "GPS accuracy (m)",
      "External GPS",
    ];

    const rows = responses.map((r) => {
      const data = r.data as Record<string, string | number | boolean | null>;
      const fieldCells = fieldDefs.map((f) => {
        const v = data[String(f.col_index)];
        if (v === null || v === undefined) return null;
        if (f.field_type === "photo") {
          return typeof v === "string" ? (filenameByHash.get(v) ?? "Uploading…") : null;
        }
        return typeof v === "boolean" ? (v ? "true" : "false") : v;
      });

      // submitted_at is server receipt time, not a client-supplied collection timestamp —
      // there is no separate "collected_at" on Form_Responses (unlike Sampling_Point_
      // Collections.occurred_at). Close enough for lab use today; a true field-collection
      // timestamp would need its own client + schema change, out of scope here. Rendered in
      // UTC (not the server host's local zone, which varies dev/TrueNAS/prod) for a
      // deterministic file — not the submitter's local field time.
      const submittedAt = r.submitted_at;
      const dateCollected = submittedAt.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
      const timeCollected = submittedAt.toLocaleTimeString("en-US", {
        timeZone: "UTC",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      return [
        r.SamplingPoint?.label ?? (r.SamplingPoint ? `Point #${r.SamplingPoint.id}` : null),
        r.SamplingPoint ? (r.SamplingPoint.placement_method === "field" ? "No" : "Yes") : null,
        ...fieldCells,
        dateCollected,
        timeCollected,
        r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
        r.lng,
        r.lat,
        r.altitude,
        r.h_accuracy,
        r.external_gps === null || r.external_gps === undefined ? null : r.external_gps ? "Yes" : "No",
      ];
    });

    const csv = toCsv(header, rows);
    const filename = `${map.name.replace(/[^a-zA-Z0-9._-]/g, "_")}_responses.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
