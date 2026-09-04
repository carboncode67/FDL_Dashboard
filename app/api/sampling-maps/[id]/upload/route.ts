import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import {
  parseGeojson,
  parseShapefile,
  parseGeopackage,
  parseKml,
  parseKmz,
  applyEpsgTransform,
} from "@/lib/parse-boundaries";
import { pointInGeometry } from "@/lib/geo";
import type { Feature, Polygon, MultiPolygon, Point } from "geojson";

export const runtime = "nodejs";

// Same parse pipeline as POST /api/farms/[id]/boundaries (lib/parse-boundaries.ts is
// format-agnostic — Field-boundary uploads just happen to filter to Polygon/
// MultiPolygon only). Here both polygon and point features are kept: polygons become
// Sampling_Map_Polygons, points become Sampling_Points, and each uploaded point is
// matched against every polygon already on the map (existing ones plus any uploaded
// in this same file) to set polygon_id, the same containment check the manual/
// generated placement flows use client-side.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const samplingMapId = parseInt(id);
  if (isNaN(samplingMapId)) {
    return NextResponse.json({ error: "Invalid sampling map id" }, { status: 400 });
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
  const isKmlLike = filename.endsWith(".kml") || filename.endsWith(".kmz");

  let fc;
  try {
    if (filename.endsWith(".geojson") || filename.endsWith(".json")) {
      fc = await parseGeojson(buffer);
    } else if (filename.endsWith(".zip")) {
      fc = await parseShapefile(buffer);
    } else if (filename.endsWith(".gpkg")) {
      fc = await parseGeopackage(buffer);
    } else if (filename.endsWith(".kml")) {
      fc = await parseKml(buffer);
    } else if (filename.endsWith(".kmz")) {
      fc = await parseKmz(buffer);
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .geojson, .json, .zip, .gpkg, .kml, or .kmz" },
        { status: 400 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 });
  }

  if (!isKmlLike) {
    try {
      fc = applyEpsgTransform(fc, epsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "CRS error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const polygonFeatures = fc.features.filter(
    (f): f is Feature<Polygon | MultiPolygon> =>
      f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );
  const pointFeatures = fc.features.filter(
    (f): f is Feature<Point> => f.geometry?.type === "Point",
  );

  if (polygonFeatures.length === 0 && pointFeatures.length === 0) {
    return NextResponse.json(
      { error: "No polygon or point features found in file" },
      { status: 400 },
    );
  }

  function labelOf(f: Feature, i: number, fallback: string): string {
    const p = f.properties ?? {};
    return (
      (p.Name as string) ??
      (p.NAME as string) ??
      (p.name as string) ??
      (p.Label as string) ??
      (p.LABEL as string) ??
      `${fallback} ${i + 1}`
    );
  }

  const source = `upload:${file.name}`;

  const createdPolygons =
    polygonFeatures.length > 0
      ? await prisma.$transaction(
          polygonFeatures.map((f, i) =>
            prisma.samplingMapPolygon.create({
              data: {
                sampling_map_id: samplingMapId,
                label: labelOf(f, i, "Polygon"),
                purpose: "boundary",
                geometry: JSON.stringify(f.geometry),
                source: "upload",
              },
            }),
          ),
        )
      : [];

  const existingPolygons = await prisma.samplingMapPolygon.findMany({
    where: { sampling_map_id: samplingMapId, id: { notIn: createdPolygons.map((p) => p.id) } },
  });
  const allPolygonsForMatch = [...existingPolygons, ...createdPolygons];

  const createdPoints =
    pointFeatures.length > 0
      ? await prisma.$transaction(
          pointFeatures.map((f, i) => {
            const [lng, lat] = f.geometry.coordinates;
            const containing = allPolygonsForMatch.find((poly) => {
              try {
                return pointInGeometry(lat, lng, JSON.parse(poly.geometry));
              } catch {
                return false;
              }
            });
            return prisma.samplingPoint.create({
              data: {
                sampling_map_id: samplingMapId,
                polygon_id: containing?.id ?? null,
                label: labelOf(f, i, "Point"),
                geometry: JSON.stringify(f.geometry),
                placement_method: "upload",
                sample_index: i,
              },
            });
          }),
        )
      : [];

  return NextResponse.json({
    ok: true,
    polygons: createdPolygons,
    points: createdPoints,
    source,
  });
}
