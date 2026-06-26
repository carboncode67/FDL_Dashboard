import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  parseGeojson,
  parseShapefile,
  parseGeopackage,
  applyEpsgTransform,
} from "@/lib/parse-boundaries";
import type { Feature, Polygon, MultiPolygon } from "geojson";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const filename = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let fc;
  try {
    if (filename.endsWith(".geojson") || filename.endsWith(".json")) {
      fc = await parseGeojson(buffer);
    } else if (filename.endsWith(".zip")) {
      fc = await parseShapefile(buffer);
    } else if (filename.endsWith(".gpkg")) {
      fc = await parseGeopackage(buffer);
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .geojson, .json, .zip, or .gpkg" },
        { status: 400 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 });
  }

  try {
    fc = applyEpsgTransform(fc, epsg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "CRS error";
    return NextResponse.json({ error: msg }, { status: 400 });
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

  return NextResponse.json({ ok: true, count: polygonFeatures.length });
}
