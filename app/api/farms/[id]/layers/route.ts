import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type { FeatureCollection as GeoFeatureCollection } from "geojson";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { parseVectorUpload, applyEpsgTransform } from "@/lib/parse-boundaries";
import { parsePointsCsv } from "@/lib/csv-points";
import { keepAsFarmDocument } from "@/lib/farm-document-copy";
import { MAX_DOCUMENT_BYTES } from "@/lib/document-upload";

// Unified farm upload box, "Map layer" choice: stores a vector file or point
// CSV as a named display-only Farm_Layers overlay (migration 089), reprojected
// to EPSG:4326 at upload time. Buffered via request.formData() like the
// boundaries route — capped at the Documents limit, since the original is also
// kept as a farm Document when keep_document=1.
export const runtime = "nodejs";

function geometryKind(fc: GeoFeatureCollection): "point" | "line" | "polygon" | "mixed" {
  const kinds = new Set<string>();
  for (const f of fc.features) {
    const t = f.geometry?.type;
    if (t === "Point" || t === "MultiPoint") kinds.add("point");
    else if (t === "LineString" || t === "MultiLineString") kinds.add("line");
    else if (t === "Polygon" || t === "MultiPolygon") kinds.add("polygon");
    else if (t) kinds.add("mixed");
  }
  return kinds.size === 1 ? ([...kinds][0] as "point" | "line" | "polygon" | "mixed") : "mixed";
}

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
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
  if (!farm) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "File exceeds the 100MB limit" }, { status: 413 });
  }

  const epsg = parseInt((formData.get("epsg") as string | null) ?? "4326");
  if (isNaN(epsg)) return NextResponse.json({ error: "Invalid EPSG code" }, { status: 400 });

  const name = ((formData.get("name") as string | null) ?? "").trim() || file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  // .dbf/.prj/.cpg/.shx sent alongside a loose .shp
  const sidecars = await Promise.all(
    (formData.getAll("sidecar") as File[]).map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })),
  );
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  let fc: GeoFeatureCollection;
  try {
    fc = isCsv
      ? applyEpsgTransform(parsePointsCsv(buffer.toString("utf8")), epsg)
      : await parseVectorUpload(file.name, buffer, epsg, sidecars);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 });
  }

  fc = { type: "FeatureCollection", features: fc.features.filter((f) => f.geometry) };
  if (fc.features.length === 0) {
    return NextResponse.json({ error: "No features with geometry found in file" }, { status: 400 });
  }

  const documentId =
    formData.get("keep_document") === "1"
      ? await keepAsFarmDocument({ farmId, originalName: file.name, buffer, description: formData.get("description") as string | null })
      : null;
  if (documentId != null) {
    for (const sc of sidecars) await keepAsFarmDocument({ farmId, originalName: sc.name, buffer: sc.buffer });
  }

  const layer = await prisma.farmLayer.create({
    data: {
      farm_id: farmId,
      name,
      geometry_kind: geometryKind(fc),
      feature_count: fc.features.length,
      geojson: fc as unknown as Prisma.InputJsonValue,
      original_filename: file.name,
      source_epsg: file.name.toLowerCase().match(/\.km[lz]$/) ? 4326 : epsg,
      document_id: documentId,
      uploaded_by_id: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, id: layer.id, count: layer.feature_count });
  });
}
