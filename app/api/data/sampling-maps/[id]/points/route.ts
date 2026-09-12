import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { isSamplingMapVisibleToLabMember } from "@/lib/sampling-maps";
import { pointInGeojsonString } from "@/lib/geo";

type Params = { params: Promise<{ id: string }> };

// Mobile counterpart to the web editor's session-authed POST /api/sampling-maps/[id]/points --
// lets a lab member drop a point on a Sampling Map directly from the field (placement_method
// "field", vs. the editor's "manual"/"grid"/"random"/"uploaded"). polygon_id is resolved
// server-side against the map's existing polygons (mirrors the editor's client-side
// polygonIdAt in components/sampling-map-editor.tsx) rather than trusted from the device, since
// the phone has no polygon-membership logic of its own. Deliberately unrestricted like the
// editor's manual points -- a field point can land outside every polygon, or outside the map's
// boundary entirely; conditions in the field vary and staff may want a point there on purpose.
// Body: { geometry: string (GeoJSON Point), label?: string, content_hash?: string }
export async function POST(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    if (auth.kind !== "labMember")
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { id } = await params;
    const samplingMapId = parseInt(id);
    if (isNaN(samplingMapId))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const visible = await isSamplingMapVisibleToLabMember(
      samplingMapId,
      auth.labMember.id,
    );
    if (!visible)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    let body: { geometry?: unknown; label?: unknown; content_hash?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.geometry !== "string" || !body.geometry) {
      return NextResponse.json(
        { error: "geometry is required" },
        { status: 400 },
      );
    }
    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : null;
    const contentHash =
      typeof body.content_hash === "string" ? body.content_hash : null;

    // Dedup — scoped to this map, same convention as Notes/Locations/Sampling_Point_Collections.
    // A retried offline-created point (network dropped after the server's insert succeeded but
    // before the response reached the device) resolves to the same server row instead of a copy.
    if (contentHash) {
      const existing = await prisma.samplingPoint.findFirst({
        where: { sampling_map_id: samplingMapId, content_hash: contentHash },
      });
      if (existing) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          id: existing.id,
          label: existing.label,
          geometry: existing.geometry,
          polygon_id: existing.polygon_id,
        });
      }
    }

    let lat: number, lng: number;
    try {
      const geom = JSON.parse(body.geometry);
      [lng, lat] = geom.coordinates;
      if (typeof lat !== "number" || typeof lng !== "number")
        throw new Error("bad coordinates");
    } catch {
      return NextResponse.json(
        { error: "geometry must be a valid GeoJSON Point" },
        { status: 400 },
      );
    }

    const polygons = await prisma.samplingMapPolygon.findMany({
      where: { sampling_map_id: samplingMapId },
    });
    const polygon = polygons.find((p) =>
      pointInGeojsonString(lat, lng, p.geometry),
    );

    const point = await prisma.samplingPoint.create({
      data: {
        sampling_map_id: samplingMapId,
        polygon_id: polygon?.id ?? null,
        label,
        geometry: body.geometry,
        placement_method: "field",
        content_hash: contentHash,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        id: point.id,
        label: point.label,
        geometry: point.geometry,
        polygon_id: point.polygon_id,
      },
      { status: 201 },
    );
  });
}
