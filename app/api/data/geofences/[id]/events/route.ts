import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { isGeofenceVisibleToContact, isGeofenceVisibleToLabMember } from "@/lib/geofences";

type Params = { params: Promise<{ id: string }> };

// Log a confirmed on-device geofence entry. The device already ran the
// authoritative precise point-in-polygon check before calling this — there
// is deliberately no server-side polygon re-validation here (GPS accuracy
// varies enough that a strict re-check would produce false rejections).
// Body: { lat: number, lng: number, occurred_at: string (ISO), content_hash?: string }
export async function POST(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const geofenceId = parseInt(id);
  if (isNaN(geofenceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const visible =
    auth.kind === "contact"
      ? await isGeofenceVisibleToContact(geofenceId, auth.contact)
      : await isGeofenceVisibleToLabMember(geofenceId, auth.labMember.id);
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { lat?: unknown; lng?: unknown; occurred_at?: unknown; content_hash?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;
  const occurredAtRaw = typeof body.occurred_at === "string" ? body.occurred_at : null;
  const contentHash = typeof body.content_hash === "string" ? body.content_hash : null;

  if (lat === null || lng === null || occurredAtRaw === null) {
    return NextResponse.json({ error: "lat, lng, and occurred_at are required" }, { status: 400 });
  }
  const occurredAt = new Date(occurredAtRaw);
  if (isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "occurred_at must be a valid ISO timestamp" }, { status: 400 });
  }

  const submitterFilter =
    auth.kind === "contact" ? { contact_id: auth.contact.id } : { user_id: auth.labMember.id };

  // Dedup first — scoped to submitter, same as Note/Location/FormResponse dedup.
  if (contentHash) {
    const existing = await prisma.geofenceEvent.findFirst({
      where: { geofence_id: geofenceId, content_hash: contentHash, ...submitterFilter },
    });
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }
  }

  const event = await prisma.geofenceEvent.create({
    data: {
      geofence_id: geofenceId,
      contact_id: auth.kind === "contact" ? auth.contact.id : null,
      user_id: auth.kind === "labMember" ? auth.labMember.id : null,
      lat,
      lng,
      occurred_at: occurredAt,
      content_hash: contentHash,
    },
  });

  return NextResponse.json({ ok: true, id: event.id }, { status: 201 });
}
