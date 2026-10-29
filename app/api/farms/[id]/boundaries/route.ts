import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseVectorUpload } from "@/lib/parse-boundaries";
import { keepAsFarmDocument } from "@/lib/farm-document-copy";
import { canCreate } from "@/lib/roles";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { runWithTenant } from "@/lib/lab-db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) {
    return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const epsgRaw = (formData.get("epsg") as string | null) ?? "4326";
  const epsg = parseInt(epsgRaw);
  if (isNaN(epsg)) {
    return NextResponse.json({ error: "Invalid EPSG code" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // .dbf/.prj/.cpg/.shx sent alongside a loose .shp
  const sidecars = await Promise.all(
    (formData.getAll("sidecar") as File[]).map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })),
  );

  let fc;
  try {
    fc = await parseVectorUpload(file.name, buffer, epsg, sidecars);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 });
  }

  const polygonFeatures = fc.features.filter(
    (f): f is Feature<Polygon | MultiPolygon> =>
      f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );

  if (polygonFeatures.length === 0) {
    return NextResponse.json(
      { error: "No polygon features found in file" },
      { status: 400 },
    );
  }

  const boundarySource = `upload:${file.name}`;

  await prisma.$transaction(
    polygonFeatures.map((f, i) => {
      const p = f.properties ?? {};
      const name =
        (p.Name as string) ??
        (p.NAME as string) ??
        (p.name as string) ??
        (p.Field_Name as string) ??
        (p.FIELD_NAME as string) ??
        `Field ${i + 1}`;

      return prisma.field.create({
        data: {
          Name: name,
          geometry: JSON.stringify(f.geometry),
          boundary_source: boundarySource,
          Farms_id: farmId,
        },
      });
    }),
  );

  // Unified farm upload box: keep the original as a farm Document too.
  if (formData.get("keep_document") === "1") {
    await keepAsFarmDocument({ farmId, originalName: file.name, buffer, description: formData.get("description") as string | null });
    for (const sc of sidecars) await keepAsFarmDocument({ farmId, originalName: sc.name, buffer: sc.buffer });
  }

  return NextResponse.json({ ok: true, count: polygonFeatures.length });
  });
}
