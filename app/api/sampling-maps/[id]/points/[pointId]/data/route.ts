import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { runWithTenant } from "@/lib/lab-db";
import { resolvePhotoFilenames } from "@/lib/sampling-point-data";

type Params = { params: Promise<{ id: string; pointId: string }> };

export type PointAnswer = {
  label: string;
  field_type: string;
  value: string | number | boolean | null;
  // photo fields only: the stored filename (serve via /api/files/photos/<filename>), or null if
  // the photo hasn't finished uploading yet.
  photo_filename: string | null;
};

// Everything attributed to one sampling point — form responses (answers + photos) and plain
// "mark collected" records — for the web map editor's point dialog. Gated like the editor
// page itself: canCreate + farm in the caller's scope.
export async function GET(_req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!session?.user || !canCreate(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, pointId } = await params;
  const mapId = parseInt(id);
  const pId = parseInt(pointId);
  if (isNaN(mapId) || isNaN(pId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const point = await prisma.samplingPoint.findUnique({
    where: { id: pId },
    include: { SamplingMap: { select: { id: true, farm_id: true } } },
  });
  if (!point || point.sampling_map_id !== mapId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
  if (!scopeIncludesFarm(scope, point.SamplingMap.farm_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [responses, collections] = await Promise.all([
    prisma.formResponse.findMany({
      where: { sampling_point_id: pId },
      include: {
        Contact: { select: { name: true } },
        User: { select: { name: true, email: true } },
        Form: { select: { id: true, title: true, FieldDefinitions: { orderBy: { col_index: "asc" } } } },
      },
      orderBy: { submitted_at: "desc" },
    }),
    prisma.samplingPointCollection.findMany({
      where: { sampling_point_id: pId },
      include: { User: { select: { name: true, email: true } } },
      orderBy: { occurred_at: "desc" },
    }),
  ]);

  const hashes: string[] = [];
  for (const r of responses) {
    const data = r.data as Record<string, unknown>;
    for (const f of r.Form.FieldDefinitions) {
      const v = data[String(f.col_index)];
      if (f.field_type === "photo" && typeof v === "string" && v) hashes.push(v);
    }
  }
  const filenameByHash = await resolvePhotoFilenames(hashes);

  return NextResponse.json({
    point: { id: point.id, label: point.label },
    responses: responses.map((r) => {
      const data = r.data as Record<string, unknown>;
      const answers: PointAnswer[] = r.Form.FieldDefinitions.flatMap((f) => {
        const v = data[String(f.col_index)];
        if (v === null || v === undefined || v === "") return [];
        const photo = f.field_type === "photo";
        return [{
          label: f.label,
          field_type: f.field_type,
          value: photo ? null : (v as string | number | boolean),
          photo_filename: photo && typeof v === "string" ? (filenameByHash.get(v) ?? null) : null,
        }];
      });
      return {
        id: r.id,
        form_title: r.Form.title,
        submitted_at: r.submitted_at.toISOString(),
        recipient: r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
        fix_quality: r.fix_quality,
        h_accuracy: r.h_accuracy,
        answers,
      };
    }),
    collections: collections.map((c) => ({
      id: c.id,
      occurred_at: c.occurred_at.toISOString(),
      collected_by: c.User?.name ?? c.User?.email ?? "Unknown",
      note: c.note,
    })),
  });
  });
}
