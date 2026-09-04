import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { isSamplingMapVisibleToLabMember, samplingMapIdForPoint } from "@/lib/sampling-maps";

type Params = { params: Promise<{ pointId: string }> };

// Log a "mark collected" action from the field. Mirrors POST /api/data/geofences/[id]/events —
// deliberately no server-side re-validation of lat/lng against the point's planned geometry;
// this is the device's actual GPS fix at collection time, which staff use to compare planned
// vs. actual sample location, not a location to be checked against anything.
// Body: { lat: number, lng: number, occurred_at: string (ISO), note?: string, content_hash?: string }
export async function POST(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { pointId } = await params;
  const samplingPointId = parseInt(pointId);
  if (isNaN(samplingPointId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const mapId = await samplingMapIdForPoint(samplingPointId);
  if (mapId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const visible = await isSamplingMapVisibleToLabMember(mapId, auth.labMember.id);
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { lat?: unknown; lng?: unknown; occurred_at?: unknown; note?: unknown; content_hash?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;
  const occurredAtRaw = typeof body.occurred_at === "string" ? body.occurred_at : null;
  const note = typeof body.note === "string" ? body.note : null;
  const contentHash = typeof body.content_hash === "string" ? body.content_hash : null;

  if (lat === null || lng === null || occurredAtRaw === null) {
    return NextResponse.json({ error: "lat, lng, and occurred_at are required" }, { status: 400 });
  }
  const occurredAt = new Date(occurredAtRaw);
  if (isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "occurred_at must be a valid ISO timestamp" }, { status: 400 });
  }

  // Dedup first — scoped to submitter, same as Note/Location/GeofenceEvent dedup.
  if (contentHash) {
    const existing = await prisma.samplingPointCollection.findFirst({
      where: { sampling_point_id: samplingPointId, content_hash: contentHash, user_id: auth.labMember.id },
    });
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }
  }

  const collection = await prisma.samplingPointCollection.create({
    data: {
      sampling_point_id: samplingPointId,
      user_id: auth.labMember.id,
      lat,
      lng,
      occurred_at: occurredAt,
      note,
      content_hash: contentHash,
    },
  });

  return NextResponse.json({ ok: true, id: collection.id }, { status: 201 });
}
